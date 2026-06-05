import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { AppState, Category, Month, SkuData, MonthlySplit, ColorEntry } from '../types';
import { MAX_SIZES, SIZE_LABELS, MONTHS, CHANNELS, BRANDS, DEFAULT_CHANNEL_RATIOS, getReleaseMonth, simPosition, type Brand } from '../types';
import { recalcQuantities, revenueMultiplier, calcDynamicMultiplier } from '../utils/calc';
import { db } from '../db';

function buildEmptySku(category: Category): SkuData {
  const base: Omit<SkuData, '_initialSnapshot' | 'isExpanded'> = {
    id: uuidv4(),
    category,
    name: '',
    skuType: '미해당',
    releaseDate: '',
    price: 0,
    cost: 0,
    contributionMarginRate: 0,
    totalOrderQty: 0,
    sizeCount: 1,
    moq: 0,
    targetSellThroughMonths: 1,
    sizes: Array.from({ length: MAX_SIZES }, (_, i) => ({
      label: i === 0 ? SIZE_LABELS[1][0] : '-',
      ratio: i === 0 ? 100 : 0,
      quantity: 0,
      isActive: i === 0,
    })),
    hasColors: false,
    colors: [],
    brand: BRANDS[0],
    channelRatios: CHANNELS.map((channel) => ({ channel, ratio: DEFAULT_CHANNEL_RATIOS[channel] })),
    memo: '',
    comparisonSku: { name: '', price: 0, cost: 0, monthlyShipment: 0, annualShipment: 0 },
    monthlySplit: MONTHS.map((month) => ({
      month, ratio: 0, quantity: 0, revenue: 0, contributionProfit: 0,
    })),
  };
  return { ...base, isExpanded: true, _initialSnapshot: JSON.parse(JSON.stringify(base)) };
}

function recalcMonthlySplit(sku: SkuData, overrideSplit?: MonthlySplit[]): MonthlySplit[] {
  const base = overrideSplit ?? sku.monthlySplit;
  const releaseMonth = getReleaseMonth(sku.releaseDate);
  // channelRatios가 유효하면 동적 multiplier, 없으면 카테고리 고정 fallback
  const multiplier = calcDynamicMultiplier(sku.channelRatios) ?? revenueMultiplier(sku.category);
  return base.map((ms) => {
    const isDisabled =
      releaseMonth !== null && simPosition(ms.month) < simPosition(releaseMonth);
    if (isDisabled) return { ...ms, quantity: 0, revenue: 0, contributionProfit: 0 };
    const quantity = Math.round(sku.totalOrderQty * ms.ratio / 100);
    const revenue = Math.round(quantity * sku.price * multiplier);
    const contributionProfit = Math.round(revenue * sku.contributionMarginRate / 100);
    return { ...ms, quantity, revenue, contributionProfit };
  });
}

/** DB 레코드 마이그레이션: sizeQtys 포맷(이전 실험적 버전) → quantity 포맷으로 복원 */
function migrateColorEntry(color: any): ColorEntry {
  if (typeof color.quantity === 'number') {
    return { id: color.id, name: color.name, quantity: color.quantity };
  }
  // sizeQtys 포맷 → 합산
  if (color.sizeQtys && typeof color.sizeQtys === 'object') {
    const quantity = Object.values(color.sizeQtys as Record<string, number>).reduce(
      (s, q) => s + q, 0
    );
    return { id: color.id, name: color.name, quantity };
  }
  return { id: color.id, name: color.name, quantity: 0 };
}

/** channelRatios 마이그레이션: 위탁및사입 → 위탁(B2C) + 사입및페어(B2B) 분리, 누락 채널 보완 */
function migrateChannelRatios(raw: any[]): import('../types').ChannelRatio[] {
  let result = raw.map((cr: any) => ({ channel: cr.channel, ratio: cr.ratio as number }));

  // 위탁및사입 → 위탁 + 사입및페어
  const oldEntry = result.find((cr) => cr.channel === '위탁및사입');
  if (oldEntry) {
    result = result.filter((cr) => cr.channel !== '위탁및사입');
    if (!result.find((cr) => cr.channel === '위탁')) {
      result.push({ channel: '위탁', ratio: oldEntry.ratio });
    }
    if (!result.find((cr) => cr.channel === '사입및페어')) {
      result.push({ channel: '사입및페어', ratio: 0 });
    }
  }

  // 누락 채널 기본값으로 보완
  const existing = new Set(result.map((cr) => cr.channel));
  for (const ch of CHANNELS) {
    if (!existing.has(ch)) result.push({ channel: ch, ratio: DEFAULT_CHANNEL_RATIOS[ch] });
  }

  return result as import('../types').ChannelRatio[];
}

function applyMigration(raw: any): SkuData {
  const defaultChannelRatios = CHANNELS.map((channel) => ({ channel, ratio: DEFAULT_CHANNEL_RATIOS[channel] }));
  const base: SkuData = {
    brand: BRANDS[0],
    hasColors: false,
    colors: [],
    channelRatios: defaultChannelRatios,
    memo: '',
    ...raw,
    _initialSnapshot: {
      hasColors: false,
      colors: [],
      channelRatios: defaultChannelRatios,
      ...raw._initialSnapshot,
    },
  };

  // 컬러 포맷 마이그레이션
  if (base.colors.length > 0) {
    base.colors = base.colors.map((c: any) => migrateColorEntry(c));
  }

  // 채널 마이그레이션 (위탁및사입 분리 + 누락 채널 보완)
  base.channelRatios = migrateChannelRatios(base.channelRatios);
  if (base._initialSnapshot.channelRatios) {
    base._initialSnapshot = {
      ...base._initialSnapshot,
      channelRatios: migrateChannelRatios(base._initialSnapshot.channelRatios),
    };
  }

  // channelRatios가 모두 0이면 기본값으로 초기화 (이전 배포에서 all-zero로 저장된 경우)
  if (base.channelRatios.every((cr) => cr.ratio === 0)) {
    base.channelRatios = defaultChannelRatios;
  }

  // 누락된 월(1·2월) monthlySplit 엔트리 추가
  const existingMonths = new Set(base.monthlySplit.map((ms) => ms.month));
  const missing = MONTHS.filter((m) => !existingMonths.has(m));
  if (missing.length > 0) {
    const newEntries = missing.map((month) => ({
      month, ratio: 0, quantity: 0, revenue: 0, contributionProfit: 0,
    }));
    base.monthlySplit = [
      ...base.monthlySplit,
      ...newEntries,
    ].sort((a, b) => MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month));
  }

  return base;
}

interface StoreActions {
  setActiveCategory: (category: Category) => void;
  setActiveBrand: (brand: Brand | '전체') => void;
  loadSkus: () => Promise<void>;
  addSku: () => void;
  duplicateSku: (id: string) => void;
  deleteSku: (id: string) => void;
  resetSku: (id: string) => void;
  toggleExpanded: (id: string) => void;
  updateSku: (id: string, patch: Partial<SkuData>) => void;
  updateMonthlySplit: (id: string, month: Month, ratio: number) => void;
  updateChannelRatio: (id: string, channel: string, ratio: number) => void;
  resetChannelRatios: (id: string) => void;
  applyChannelRatiosToFiltered: (sourceSkuId: string) => Promise<void>;
  importSkus: (skus: SkuData[]) => Promise<void>;
  replaceAllSkus: (skus: Omit<SkuData, '_initialSnapshot' | 'isExpanded'>[]) => Promise<void>;
  persistSku: (id: string) => Promise<void>;
}

export const useStore = create<AppState & StoreActions>((set, get) => ({
  activeCategory: '의류',
  activeBrand: '전체',
  skus: [],

  setActiveCategory: (category) => set({ activeCategory: category, activeBrand: '전체' }),
  setActiveBrand: (brand) => set({ activeBrand: brand }),

  loadSkus: async () => {
    const stored = await db.skus.toArray();
    const initialized = localStorage.getItem('md-dashboard-initialized');

    if (stored.length === 0 && !initialized) {
      localStorage.setItem('md-dashboard-initialized', '1');
      set({ skus: [] });
    } else {
      if (!initialized) localStorage.setItem('md-dashboard-initialized', '1');
      // 마이그레이션 + 매출 재계산, 로드 시 항상 카드 닫힌 상태로 시작
      const recalced = stored
        .map(applyMigration)
        .map((s) => ({ ...s, monthlySplit: recalcMonthlySplit(s), isExpanded: false }));
      await db.skus.bulkPut(recalced);
      set({ skus: recalced });
    }
  },

  addSku: () => {
    const { skus, activeCategory } = get();
    if (skus.filter((s) => s.category === activeCategory).length >= 15) return;
    const newSku = buildEmptySku(activeCategory);
    set({ skus: [...skus, newSku] });
    db.skus.put(newSku);
  },

  duplicateSku: (id) => {
    const { skus, activeCategory } = get();
    if (skus.filter((s) => s.category === activeCategory).length >= 15) return;
    const source = skus.find((s) => s.id === id);
    if (!source) return;
    const newId = uuidv4();
    const copy: SkuData = {
      ...JSON.parse(JSON.stringify(source)),
      id: newId,
      name: source.name ? `${source.name} (복사)` : '(복사)',
      isExpanded: true,
    };
    copy._initialSnapshot = { ...copy._initialSnapshot, id: newId, name: copy.name };
    const idx = skus.findIndex((s) => s.id === id);
    const next = [...skus.slice(0, idx + 1), copy, ...skus.slice(idx + 1)];
    set({ skus: next });
    db.skus.put(copy);
  },

  deleteSku: (id) => {
    set({ skus: get().skus.filter((s) => s.id !== id) });
    db.skus.delete(id);
  },

  resetSku: (id) => {
    const target = get().skus.find((s) => s.id === id);
    if (!target) return;
    const restored: SkuData = {
      ...JSON.parse(JSON.stringify(target._initialSnapshot)),
      id: target.id,
      isExpanded: target.isExpanded,
      _initialSnapshot: target._initialSnapshot,
    };
    set({ skus: get().skus.map((s) => (s.id === id ? restored : s)) });
    db.skus.put(restored);
  },

  toggleExpanded: (id) => {
    set({
      skus: get().skus.map((s) => (s.id === id ? { ...s, isExpanded: !s.isExpanded } : s)),
    });
  },

  updateSku: (id, patch) => {
    const skus = get().skus;
    const next = skus.map((s) => {
      if (s.id !== id) return s;
      const updated = { ...s, ...patch };

      // 컬러 모드: totalOrderQty = 컬러 수량 합계
      const colorAffected = 'colors' in patch || 'hasColors' in patch;
      if (colorAffected && updated.hasColors) {
        updated.totalOrderQty = updated.colors.reduce(
          (sum: number, c: ColorEntry) => sum + c.quantity, 0
        );
      }

      // sizes 수량 재계산 (totalOrderQty 또는 ratio 변동 시)
      const qtyAffected = 'totalOrderQty' in patch || colorAffected;
      if (qtyAffected || 'sizes' in patch) {
        updated.sizes = recalcQuantities(updated.sizes, updated.totalOrderQty);
      }

      // 월별 계산값 재계산
      const monthlyAffected =
        qtyAffected || 'sizes' in patch || 'price' in patch ||
        'contributionMarginRate' in patch || 'releaseDate' in patch || 'channelRatios' in patch;
      if (monthlyAffected) {
        updated.monthlySplit = recalcMonthlySplit(updated);
      }
      return updated;
    });
    set({ skus: next });
  },

  updateMonthlySplit: (id, month, ratio) => {
    const skus = get().skus;
    const sku = skus.find((s) => s.id === id);
    if (!sku) return;
    const patchedSplit = sku.monthlySplit.map((ms) =>
      ms.month === month ? { ...ms, ratio } : ms,
    );
    const recalculated = recalcMonthlySplit(sku, patchedSplit);
    set({ skus: skus.map((s) => (s.id === id ? { ...s, monthlySplit: recalculated } : s)) });
  },

  resetChannelRatios: (id) => {
    set({
      skus: get().skus.map((s) => {
        if (s.id !== id) return s;
        const updatedChannelRatios = CHANNELS.map((channel) => ({
          channel,
          ratio: DEFAULT_CHANNEL_RATIOS[channel],
        }));
        const updated = { ...s, channelRatios: updatedChannelRatios };
        return { ...updated, monthlySplit: recalcMonthlySplit(updated) };
      }),
    });
  },

  updateChannelRatio: (id, channel, ratio) => {
    set({
      skus: get().skus.map((s) => {
        if (s.id !== id) return s;
        const updatedChannelRatios = s.channelRatios.map((cr) =>
          cr.channel === channel ? { ...cr, ratio } : cr,
        );
        const updated = { ...s, channelRatios: updatedChannelRatios };
        return { ...updated, monthlySplit: recalcMonthlySplit(updated) };
      }),
    });
  },

  applyChannelRatiosToFiltered: async (sourceSkuId) => {
    const { skus, activeCategory, activeBrand } = get();
    const source = skus.find((s) => s.id === sourceSkuId);
    if (!source) return;

    const nextSkus = skus.map((s) => {
      if (s.id === sourceSkuId) return s;
      if (s.category !== activeCategory) return s;
      if (activeBrand !== '전체' && s.brand !== activeBrand) return s;
      const updated = { ...s, channelRatios: source.channelRatios.map((cr) => ({ ...cr })) };
      return { ...updated, monthlySplit: recalcMonthlySplit(updated) };
    });

    set({ skus: nextSkus });

    const toSave = nextSkus.filter(
      (s) =>
        s.id !== sourceSkuId &&
        s.category === activeCategory &&
        (activeBrand === '전체' || s.brand === activeBrand),
    );
    if (toSave.length > 0) await db.skus.bulkPut(toSave);
  },

  importSkus: async (newSkus) => {
    await db.skus.bulkPut(newSkus);
    set({ skus: [...get().skus, ...newSkus] });
  },

  replaceAllSkus: async (rawSkus) => {
    const full: SkuData[] = rawSkus.map((s) => ({
      ...s,
      isExpanded: false,
      _initialSnapshot: JSON.parse(JSON.stringify(s)),
      memo: s.memo ?? '',
    }));
    await db.skus.clear();
    await db.skus.bulkPut(full);
    set({ skus: full });
  },

  persistSku: async (id) => {
    const sku = get().skus.find((s) => s.id === id);
    if (sku) await db.skus.put(sku);
  },
}));
