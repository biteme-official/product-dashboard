import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import {
  collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch, getDocs,
} from 'firebase/firestore';
import { fsdb } from '../lib/firebase';
import type { AppState, Category, Month, SkuData, MonthlySplit, ColorEntry, ChannelMonthEntry } from '../types';
import { MAX_SIZES, SIZE_LABELS, MONTHS, CHANNELS, BRANDS, DEFAULT_CHANNEL_RATIOS, getReleaseMonth, simPosition, type Brand, type Channel } from '../types';
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

function applyMigration(raw: any): SkuData {
  const defaultChannelRatios = CHANNELS.map((channel) => ({ channel, ratio: DEFAULT_CHANNEL_RATIOS[channel] }));
  const base: SkuData = {
    brand: BRANDS[0],
    hasColors: false,
    colors: [],
    channelRatios: defaultChannelRatios,
    memo: '',
    ...raw,
    isExpanded: false,
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
  // channelMonthlySplit 누락 항목 보정
  if (!Array.isArray(base.channelMonthlySplit) || base.channelMonthlySplit.length === 0) {
    base.channelMonthlySplit = CHANNELS.flatMap((channel) =>
      MONTHS.map((month) => ({ channel, month, ratio: 0 })),
    );
  } else {
    const existing = new Set(
      base.channelMonthlySplit.map((e: ChannelMonthEntry) => `${e.channel}|${e.month}`),
    );
    const toAdd = CHANNELS.flatMap((channel) =>
      MONTHS.filter((month) => !existing.has(`${channel}|${month}`)).map((month) => ({
        channel, month, ratio: 0,
      })),
    );
    if (toAdd.length > 0) base.channelMonthlySplit = [...base.channelMonthlySplit, ...toAdd];
  }
  return base;
}

interface StoreActions {
  setActiveCategory: (category: Category) => void;
  setActiveBrand: (brand: Brand | '전체') => void;
  loadSkus: () => () => void;
  addSku: () => void;
  duplicateSku: (id: string) => void;
  deleteSku: (id: string) => void;
  resetSku: (id: string) => void;
  toggleExpanded: (id: string) => void;
  updateSku: (id: string, patch: Partial<SkuData>) => void;
  updateMonthlySplit: (id: string, month: Month, ratio: number) => void;
  updateChannelRatio: (id: string, channel: string, ratio: number) => void;
  resetChannelRatios: (id: string) => void;
  updateChannelMonthRatio: (id: string, channel: Channel, month: Month, ratio: number) => void;
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

  // Firestore 실시간 리스너 — 반환값(unsubscribe)을 App.tsx useEffect cleanup으로 사용
  loadSkus: () => {
    const q = collection(fsdb, SKUS_COL);
    const unsub = onSnapshot(q, (snapshot) => {
      const expandedMap = new Map(get().skus.map((s) => [s.id, s.isExpanded]));
      const raw = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
      const processed = raw
        .map(applyMigration)
        .map((s) => ({
          ...s,
          monthlySplit: recalcMonthlySplit(s),
          isExpanded: expandedMap.get(s.id) ?? false,
        }))
        .sort((a, b) => {
          if (!a.releaseDate && !b.releaseDate) return 0;
          if (!a.releaseDate) return 1;
          if (!b.releaseDate) return -1;
          return a.releaseDate.localeCompare(b.releaseDate);
        });
      set({ skus: processed });
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
}));
