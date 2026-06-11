import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import {
  collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch, getDocs,
  addDoc, serverTimestamp,
} from 'firebase/firestore';
import { fsdb } from '../lib/firebase';
import type { AppState, Category, Month, SkuData, MonthlySplit, ColorEntry, ChannelMonthEntry, ChannelMonthQtyEntry, ChannelPricing } from '../types';
import { MAX_SIZES, SIZE_LABELS, MONTHS, CHANNELS, BRANDS, DEFAULT_CHANNEL_RATIOS, DEFAULT_CHANNEL_COMMISSION, DISABLED_CHANNELS, getReleaseMonth, simPosition, type Brand, type Channel } from '../types';
import { recalcQuantities, revenueMultiplier, calcDynamicMultiplier } from '../utils/calc';

const SKUS_COL = 'skus';

// Firestore에 저장할 때 isExpanded는 제외 (UI 전용 상태)
type FirestoreSkuData = Omit<SkuData, 'isExpanded'>;

function toFirestore(sku: SkuData): FirestoreSkuData {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { isExpanded: _, ...data } = sku;
  // _initialSnapshot에서 imageUrl을 제거해 문서 크기 절감 +
  // 로드 시 applyMigration에서 본 데이터의 imageUrl을 동기화하므로 여기선 불필요
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { imageUrl: _img, ...snapshotWithoutImage } = (data._initialSnapshot ?? {}) as SkuData;
  return { ...data, _initialSnapshot: snapshotWithoutImage as SkuData['_initialSnapshot'] };
}

function buildEmptySku(category: Category): SkuData {
  const base: Omit<SkuData, '_initialSnapshot' | 'isExpanded'> = {
    id: uuidv4(),
    category,
    name: '',
    skuType: '미해당',
    releaseDate: '',
    price: 0,
    cost: 0,
    regularPrice: 0,
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
    channelMonthlySplit: CHANNELS.flatMap((channel) =>
      MONTHS.map((month) => ({ channel, month, ratio: 0 })),
    ),
    channelMonthQty: CHANNELS.flatMap((channel) =>
      MONTHS.map((month) => ({ channel, month, qty: 0 })),
    ),
    channelPricing: CHANNELS.map((channel) => ({
      channel, price: 0, commissionRate: DEFAULT_CHANNEL_COMMISSION[channel],
    })),
    memo: '',
    pricingOpts: {},
    pricingUsdRate: 1400,
    comparisonSku: { name: '', price: 0, cost: 0, monthlyShipment: 0, annualShipment: 0 },
    monthlySplit: MONTHS.map((month) => ({
      month, ratio: 0, quantity: 0, revenue: 0, contributionProfit: 0,
    })),
    isConfirmed: false,
    platformConfirmed: false,
    brandConfirmed: false,
    globalConfirmed: false,
  };
  return { ...base, isExpanded: true, _initialSnapshot: JSON.parse(JSON.stringify(base)) };
}

function recalcMonthlySplit(sku: SkuData, overrideSplit?: MonthlySplit[]): MonthlySplit[] {
  const base = overrideSplit ?? sku.monthlySplit;
  const releaseMonth = getReleaseMonth(sku.releaseDate);
  const multiplier = calcDynamicMultiplier(sku.channelRatios) ?? revenueMultiplier(sku.category);
  return base.map((ms) => {
    const isDisabled =
      releaseMonth !== null && simPosition(ms.month) < simPosition(releaseMonth);
    if (isDisabled) return { ...ms, quantity: 0, revenue: 0, contributionProfit: 0 };
    const quantity = Math.round(sku.totalOrderQty * ms.ratio / 100);
    const revenue = Math.round(quantity * sku.price / 1.1 * multiplier);
    const contributionProfit = Math.round(revenue * sku.contributionMarginRate / 100);
    return { ...ms, quantity, revenue, contributionProfit };
  });
}

/** Product Dashboard 전용: 수량은 Firestore 저장값 그대로, revenue/profit만 재계산 */
function recalcRevenueFromQty(sku: SkuData): MonthlySplit[] {
  const releaseMonth = getReleaseMonth(sku.releaseDate);
  const multiplier = calcDynamicMultiplier(sku.channelRatios) ?? revenueMultiplier(sku.category);
  return sku.monthlySplit.map((ms) => {
    const isDisabled =
      releaseMonth !== null && simPosition(ms.month) < simPosition(releaseMonth);
    if (isDisabled) return { ...ms, quantity: 0, revenue: 0, contributionProfit: 0 };
    const revenue = Math.round(ms.quantity * sku.price / 1.1 * multiplier);
    const contributionProfit = Math.round(revenue * sku.contributionMarginRate / 100);
    return { ...ms, revenue, contributionProfit };
  });
}

function migrateColorEntry(color: any): ColorEntry {
  if (typeof color.quantity === 'number') {
    return { id: color.id, name: color.name, quantity: color.quantity };
  }
  if (color.sizeQtys && typeof color.sizeQtys === 'object') {
    const quantity = Object.values(color.sizeQtys as Record<string, number>).reduce(
      (s, q) => s + q, 0
    );
    return { id: color.id, name: color.name, quantity };
  }
  return { id: color.id, name: color.name, quantity: 0 };
}

function migrateChannelRatios(raw: any[]): import('../types').ChannelRatio[] {
  let result = raw.map((cr: any) => ({ channel: cr.channel, ratio: cr.ratio as number }));
  const oldEntry = result.find((cr) => cr.channel === '위탁및사입');
  if (oldEntry) {
    result = result.filter((cr) => cr.channel !== '위탁및사입');
    if (!result.find((cr) => cr.channel === '위탁')) result.push({ channel: '위탁', ratio: oldEntry.ratio });
    if (!result.find((cr) => cr.channel === '사입및페어')) result.push({ channel: '사입및페어', ratio: 0 });
  }
  const existing = new Set(result.map((cr) => cr.channel));
  for (const ch of CHANNELS) {
    if (!existing.has(ch)) result.push({ channel: ch, ratio: DEFAULT_CHANNEL_RATIOS[ch] });
  }
  return result as import('../types').ChannelRatio[];
}

/** channelMonthlySplit이 모두 0인지 확인 (MD뷰 편집 전 상태) */
function isCMSEmpty(cms: ChannelMonthEntry[]): boolean {
  return !cms || cms.every((e) => e.ratio === 0);
}

/** PM 탭의 monthlySplit × channelRatios로부터 channelMonthlySplit 파생 */
function deriveChannelMonthlySplit(sku: { channelRatios: any[]; monthlySplit: any[] }): ChannelMonthEntry[] {
  return CHANNELS.flatMap((channel) =>
    MONTHS.map((month) => {
      const chRatio = sku.channelRatios.find((r: any) => r.channel === channel)?.ratio ?? 0;
      const mRatio = sku.monthlySplit.find((m: any) => m.month === month)?.ratio ?? 0;
      const ratio = Math.round(chRatio * mRatio) / 100;
      return { channel, month, ratio };
    }),
  );
}

function applyMigration(raw: any): SkuData {
  const defaultChannelRatios = CHANNELS.map((channel) => ({ channel, ratio: DEFAULT_CHANNEL_RATIOS[channel] }));
  const base: SkuData = {
    brand: BRANDS[0],
    hasColors: false,
    colors: [],
    channelRatios: defaultChannelRatios,
    memo: '',
    regularPrice: 0,
    channelMonthQty: CHANNELS.flatMap((channel) =>
      MONTHS.map((month) => ({ channel, month, qty: 0 } as ChannelMonthQtyEntry)),
    ),
    channelPricing: CHANNELS.map((channel) => ({
      channel, price: 0, commissionRate: DEFAULT_CHANNEL_COMMISSION[channel],
    } as ChannelPricing)),
    ...raw,
    pricingOpts: raw.pricingOpts ?? {},
    pricingUsdRate: raw.pricingUsdRate ?? 1400,
    isExpanded: false,
    isConfirmed: raw.isConfirmed ?? false,
    finalOrderConfirmedAt: raw.finalOrderConfirmedAt ?? null,
    platformConfirmed: raw.platformConfirmed ?? false,
    brandConfirmed: raw.brandConfirmed ?? false,
    globalConfirmed: raw.globalConfirmed ?? false,
    _initialSnapshot: {
      hasColors: false,
      colors: [],
      channelRatios: defaultChannelRatios,
      ...raw._initialSnapshot,
      // Firestore에는 imageUrl이 _initialSnapshot에 없으므로 본 데이터 기준으로 동기화
      // → resetSku 시에도 이미지가 유지됨
      imageUrl: raw.imageUrl ?? '',
    },
  };
  if (base.colors.length > 0) {
    base.colors = base.colors.map((c: any) => migrateColorEntry(c));
  }
  base.channelRatios = migrateChannelRatios(base.channelRatios);
  if (base._initialSnapshot.channelRatios) {
    base._initialSnapshot = {
      ...base._initialSnapshot,
      channelRatios: migrateChannelRatios(base._initialSnapshot.channelRatios),
    };
  }
  if (base.channelRatios.every((cr) => cr.ratio === 0)) {
    base.channelRatios = defaultChannelRatios;
  }
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
  // channelMonthlySplit 보정 및 PM 데이터 파생
  if (!Array.isArray(base.channelMonthlySplit) || base.channelMonthlySplit.length === 0) {
    // Firestore에 없거나 비어있음 → PM 데이터(monthlySplit × channelRatios)로 초기화
    base.channelMonthlySplit = deriveChannelMonthlySplit(base);
  } else {
    // 부분 누락 항목 채움
    const existing = new Set(
      base.channelMonthlySplit.map((e: ChannelMonthEntry) => `${e.channel}|${e.month}`),
    );
    const toAdd = CHANNELS.flatMap((channel) =>
      MONTHS.filter((month) => !existing.has(`${channel}|${month}`)).map((month) => ({
        channel, month, ratio: 0,
      })),
    );
    if (toAdd.length > 0) base.channelMonthlySplit = [...base.channelMonthlySplit, ...toAdd];
    // MD뷰에서 아직 편집하지 않은 경우(모두 0) → PM 데이터로 재파생
    if (isCMSEmpty(base.channelMonthlySplit)) {
      base.channelMonthlySplit = deriveChannelMonthlySplit(base);
    }
  }
  // 비활성 채널 채널×월 목표량 강제 0
  base.channelMonthQty = base.channelMonthQty.map((e) =>
    (DISABLED_CHANNELS as readonly string[]).includes(e.channel) ? { ...e, qty: 0 } : e,
  );
  return base;
}

interface StoreActions {
  setActiveCategory: (category: Category) => void;
  setActiveBrand: (brand: Brand | '전체') => void;
  setListView: (v: boolean) => void;
  loadSkus: () => () => void;
  addSku: () => void;
  duplicateSku: (id: string) => void;
  deleteSku: (id: string) => void;
  resetSku: (id: string) => void;
  toggleExpanded: (id: string) => void;
  updateSku: (id: string, patch: Partial<SkuData>) => void;
  updateMonthlySplit: (id: string, month: Month, ratio: number) => void;
  updateMonthlyQty: (id: string, month: Month, quantity: number) => void;
  updateChannelMonthQty: (id: string, channel: Channel, month: Month, qty: number) => void;
  batchInitChannelMonthQty: (id: string, entries: ChannelMonthQtyEntry[]) => void;
  updateChannelPricing: (id: string, channel: Channel, patch: { price?: number; commissionRate?: number }) => void;
  updateChannelRatio: (id: string, channel: string, ratio: number) => void;
  resetChannelRatios: (id: string) => void;
  updateChannelMonthRatio: (id: string, channel: Channel, month: Month, ratio: number) => void;
  resetChannelMonthlySplit: (id: string) => Promise<void>;
  applyChannelRatiosToFiltered: (sourceSkuId: string) => Promise<void>;
  importSkus: (skus: SkuData[]) => Promise<void>;
  replaceAllSkus: (skus: Omit<SkuData, '_initialSnapshot' | 'isExpanded'>[]) => Promise<void>;
  updateStep2OptionQty: (id: string, qty: Record<string, number>) => void;
  updateFinalOrderQty: (id: string, qty: Record<string, number>) => void;
  setFinalOrderConfirmed: (id: string, confirmed: boolean) => Promise<void>;
  persistSku: (id: string) => Promise<void>;
  setSkuConfirmed: (id: string, confirmed: boolean, role: string) => Promise<void>;
  setChannelConfirmed: (id: string, field: 'platformConfirmed' | 'brandConfirmed' | 'globalConfirmed', value: boolean) => Promise<void>;
}

const readSession = <T>(key: string, fallback: T): T => {
  try {
    const v = sessionStorage.getItem(key);
    return v !== null ? (JSON.parse(v) as T) : fallback;
  } catch { return fallback; }
};
const writeSession = (key: string, val: unknown) => {
  try { sessionStorage.setItem(key, JSON.stringify(val)); } catch {}
};

export const useStore = create<AppState & StoreActions>((set, get) => ({
  activeCategory: readSession<Category>('store:activeCategory', '의류'),
  activeBrand: readSession<Brand | '전체'>('store:activeBrand', '전체'),
  isListView: readSession<boolean>('store:isListView', false),
  skus: [],

  setActiveCategory: (category) => {
    writeSession('store:activeCategory', category);
    writeSession('store:activeBrand', '전체');
    writeSession('store:isListView', false);
    set({ activeCategory: category, activeBrand: '전체', isListView: false });
  },
  setActiveBrand: (brand) => {
    writeSession('store:activeBrand', brand);
    set({ activeBrand: brand });
  },
  setListView: (v) => {
    writeSession('store:isListView', v);
    set({ isListView: v });
  },

  // Firestore 실시간 리스너 — 반환값(unsubscribe)을 App.tsx useEffect cleanup으로 사용
  loadSkus: () => {
    const q = collection(fsdb, SKUS_COL);
    const unsub = onSnapshot(q, (snapshot) => {
      const expandedMap = new Map(get().skus.map((s) => [s.id, s.isExpanded]));
      const raw: any[] = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
      const processed = raw
        .map(applyMigration)
        .map((s) => ({
          ...s,
          monthlySplit: recalcRevenueFromQty(s),
          isExpanded: expandedMap.get(s.id) ?? false,
        }))
        .sort((a, b) => {
          if (!a.releaseDate && !b.releaseDate) return 0;
          if (!a.releaseDate) return 1;
          if (!b.releaseDate) return -1;
          return a.releaseDate.localeCompare(b.releaseDate);
        });
      set({ skus: processed });
      // 비활성 채널에 잔존하는 qty > 0 이면 Firestore에도 0으로 저장 (1회성 마이그레이션)
      const toMigrate = processed.filter((s) =>
        (raw.find((r: any) => r.id === s.id)?.channelMonthQty ?? []).some(
          (e: any) => (DISABLED_CHANNELS as readonly string[]).includes(e.channel) && e.qty > 0,
        ),
      );
      if (toMigrate.length > 0) {
        const batch = writeBatch(fsdb);
        toMigrate.forEach((s) => batch.set(doc(fsdb, SKUS_COL, s.id), toFirestore(s)));
        batch.commit().catch(console.error);
      }
    });
    return unsub;
  },

  addSku: () => {
    const { skus, activeCategory } = get();
    if (skus.filter((s) => s.category === activeCategory).length >= 15) return;
    const newSku = buildEmptySku(activeCategory);
    set({ skus: [...skus, newSku] });
    setDoc(doc(fsdb, SKUS_COL, newSku.id), toFirestore(newSku));
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
    setDoc(doc(fsdb, SKUS_COL, copy.id), toFirestore(copy));
  },

  deleteSku: (id) => {
    set({ skus: get().skus.filter((s) => s.id !== id) });
    deleteDoc(doc(fsdb, SKUS_COL, id));
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
    setDoc(doc(fsdb, SKUS_COL, id), toFirestore(restored));
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
      const colorAffected = 'colors' in patch || 'hasColors' in patch;
      if (colorAffected && updated.hasColors) {
        updated.totalOrderQty = updated.colors.reduce(
          (sum: number, c: ColorEntry) => sum + c.quantity, 0
        );
      }
      const qtyAffected = 'totalOrderQty' in patch || colorAffected;
      if (qtyAffected || 'sizes' in patch) {
        updated.sizes = recalcQuantities(updated.sizes, updated.totalOrderQty);
      }
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

  updateChannelMonthQty: (id, channel, month, qty) => {
    if ((DISABLED_CHANNELS as readonly string[]).includes(channel)) return;
    const skus = get().skus;
    const sku = skus.find((s) => s.id === id);
    if (!sku) return;
    const updated: SkuData = {
      ...sku,
      channelMonthQty: sku.channelMonthQty.map((e) =>
        e.channel === channel && e.month === month ? { ...e, qty } : e,
      ),
    };
    set({ skus: skus.map((s) => (s.id === id ? updated : s)) });
  },

  batchInitChannelMonthQty: (id, entries) => {
    const skus = get().skus;
    const sku = skus.find((s) => s.id === id);
    if (!sku) return;
    const safe = entries.map((e) =>
      (DISABLED_CHANNELS as readonly string[]).includes(e.channel) ? { ...e, qty: 0 } : e,
    );
    set({ skus: skus.map((s) => (s.id === id ? { ...s, channelMonthQty: safe } : s)) });
  },

  updateChannelPricing: (id, channel, patch) => {
    const skus = get().skus;
    const sku = skus.find((s) => s.id === id);
    if (!sku) return;
    const updated: SkuData = {
      ...sku,
      channelPricing: sku.channelPricing.map((cp) =>
        cp.channel === channel ? { ...cp, ...patch } : cp,
      ),
    };
    set({ skus: skus.map((s) => (s.id === id ? updated : s)) });
  },

  updateMonthlyQty: (id, month, quantity) => {
    const skus = get().skus;
    const sku = skus.find((s) => s.id === id);
    if (!sku) return;
    const multiplier = calcDynamicMultiplier(sku.channelRatios) ?? revenueMultiplier(sku.category);
    const ratio = sku.totalOrderQty > 0 ? Math.round(quantity / sku.totalOrderQty * 100) : 0;
    const revenue = Math.round(quantity * sku.price / 1.1 * multiplier);
    const contributionProfit = Math.round(revenue * sku.contributionMarginRate / 100);
    const patchedSplit = sku.monthlySplit.map((ms) =>
      ms.month === month ? { ...ms, quantity, ratio, revenue, contributionProfit } : ms,
    );
    const updated = { ...sku, monthlySplit: patchedSplit };
    if (isCMSEmpty(sku.channelMonthlySplit)) {
      updated.channelMonthlySplit = deriveChannelMonthlySplit(updated);
    }
    set({ skus: skus.map((s) => (s.id === id ? updated : s)) });
  },

  updateMonthlySplit: (id, month, ratio) => {
    const skus = get().skus;
    const sku = skus.find((s) => s.id === id);
    if (!sku) return;
    const patchedSplit = sku.monthlySplit.map((ms) =>
      ms.month === month ? { ...ms, ratio } : ms,
    );
    const recalculated = recalcMonthlySplit(sku, patchedSplit);
    const updated = { ...sku, monthlySplit: recalculated };
    // MD뷰 미편집 상태면 PM 데이터로 자동 동기화
    if (isCMSEmpty(sku.channelMonthlySplit)) {
      updated.channelMonthlySplit = deriveChannelMonthlySplit(updated);
    }
    set({ skus: skus.map((s) => (s.id === id ? updated : s)) });
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
        const withMonthly = { ...updated, monthlySplit: recalcMonthlySplit(updated) };
        if (isCMSEmpty(s.channelMonthlySplit)) {
          return { ...withMonthly, channelMonthlySplit: deriveChannelMonthlySplit(withMonthly) };
        }
        return withMonthly;
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
        const withMonthly = { ...updated, monthlySplit: recalcMonthlySplit(updated) };
        if (isCMSEmpty(s.channelMonthlySplit)) {
          return { ...withMonthly, channelMonthlySplit: deriveChannelMonthlySplit(withMonthly) };
        }
        return withMonthly;
      }),
    });
  },

  resetChannelMonthlySplit: async (id) => {
    const sku = get().skus.find((s) => s.id === id);
    if (!sku) return;
    const derived = deriveChannelMonthlySplit(sku);
    const updated = { ...sku, channelMonthlySplit: derived };
    set({ skus: get().skus.map((s) => (s.id === id ? updated : s)) });
    await setDoc(doc(fsdb, SKUS_COL, id), toFirestore(updated));
  },

  updateChannelMonthRatio: (id, channel, month, ratio) => {
    set({
      skus: get().skus.map((s) => {
        if (s.id !== id) return s;
        const exists = s.channelMonthlySplit.find(
          (e) => e.channel === channel && e.month === month,
        );
        const updated = exists
          ? s.channelMonthlySplit.map((e) =>
              e.channel === channel && e.month === month ? { ...e, ratio } : e,
            )
          : [...s.channelMonthlySplit, { channel, month, ratio }];
        return { ...s, channelMonthlySplit: updated };
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
      (s) => s.id !== sourceSkuId &&
        s.category === activeCategory &&
        (activeBrand === '전체' || s.brand === activeBrand),
    );
    if (toSave.length > 0) {
      const batch = writeBatch(fsdb);
      toSave.forEach((sku) => batch.set(doc(fsdb, SKUS_COL, sku.id), toFirestore(sku)));
      await batch.commit();
    }
  },

  importSkus: async (newSkus) => {
    const batch = writeBatch(fsdb);
    newSkus.forEach((sku) => batch.set(doc(fsdb, SKUS_COL, sku.id), toFirestore(sku)));
    await batch.commit();
    set({ skus: [...get().skus, ...newSkus] });
  },

  replaceAllSkus: async (rawSkus) => {
    const full: SkuData[] = rawSkus.map((s) => ({
      ...s,
      isExpanded: false,
      _initialSnapshot: JSON.parse(JSON.stringify(s)),
      memo: s.memo ?? '',
    }));
    // 기존 전체 삭제
    const existing = await getDocs(collection(fsdb, SKUS_COL));
    const deleteBatch = writeBatch(fsdb);
    existing.docs.forEach((d) => deleteBatch.delete(d.ref));
    await deleteBatch.commit();
    // 새 데이터 일괄 저장
    const insertBatch = writeBatch(fsdb);
    full.forEach((sku) => insertBatch.set(doc(fsdb, SKUS_COL, sku.id), toFirestore(sku)));
    await insertBatch.commit();
    set({ skus: full });
  },

  updateStep2OptionQty: (id, qty) => {
    set({ skus: get().skus.map((s) => (s.id === id ? { ...s, step2OptionQty: qty } : s)) });
  },

  updateFinalOrderQty: (id, qty) => {
    set({ skus: get().skus.map((s) => (s.id === id ? { ...s, finalOrderQty: qty } : s)) });
  },

  setFinalOrderConfirmed: async (id, confirmed) => {
    const sku = get().skus.find((s) => s.id === id);
    if (!sku) return;
    const ts = confirmed ? new Date().toISOString() : null;
    const updated = { ...sku, finalOrderConfirmedAt: ts };
    set({ skus: get().skus.map((s) => (s.id === id ? updated : s)) });
    await setDoc(doc(fsdb, SKUS_COL, id), toFirestore(updated));
  },

  persistSku: async (id) => {
    const sku = get().skus.find((s) => s.id === id);
    if (sku) {
      try {
        await setDoc(doc(fsdb, SKUS_COL, id), toFirestore(sku));
      } catch (err) {
        console.error('[persistSku] Firestore 저장 실패:', id, err);
        throw err; // 호출부에서 catch할 수 있도록 re-throw
      }
    }
  },

  setSkuConfirmed: async (id, confirmed, role) => {
    const sku = get().skus.find((s) => s.id === id);
    if (!sku) return;
    const updated = { ...sku, isConfirmed: confirmed };
    set({ skus: get().skus.map((s) => (s.id === id ? updated : s)) });
    await setDoc(doc(fsdb, SKUS_COL, id), toFirestore(updated));
    await addDoc(collection(fsdb, 'confirmLogs'), {
      skuId: id,
      skuName: sku.name || '(SKU명 미입력)',
      action: confirmed ? '확정' : '확정취소',
      role,
      timestamp: serverTimestamp(),
    });
  },

  setChannelConfirmed: async (id, field, value) => {
    const sku = get().skus.find((s) => s.id === id);
    if (!sku) return;
    const updated = { ...sku, [field]: value };
    set({ skus: get().skus.map((s) => (s.id === id ? updated : s)) });
    await setDoc(doc(fsdb, SKUS_COL, id), toFirestore(updated));
  },
}));
