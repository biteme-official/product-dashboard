import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import {
  collection, doc, setDoc, getDoc, deleteDoc, onSnapshot, writeBatch, getDocs,
  addDoc, Timestamp, deleteField, query, orderBy, limit,
} from 'firebase/firestore';
import { fsdb } from '../lib/firebase';
import type { AppState, Category, Month, SkuData, MonthlySplit, ColorEntry, ChannelMonthEntry, ChannelMonthQtyEntry, ChannelPricing, TrashItem, ActivityLog, LogChange } from '../types';
import { useAuth } from './auth';
import { MAX_SIZES, SIZE_LABELS, MONTHS, CHANNELS, BRANDS, CATEGORIES, SKU_TYPES, DEFAULT_CHANNEL_RATIOS, DEFAULT_CHANNEL_COMMISSION, getDisabledChannels, getSkuMonths, type Brand, type Channel } from '../types';
import type { CpoProject } from '../types/cpo';
import { recalcQuantities, revenueMultiplier, calcDynamicMultiplier } from '../utils/calc';
import { writeProductSyncDates } from '../lib/cpoFirebase';
import { useCpoSync, markLocalDateEdit, SYNCED_DATE_FIELDS } from './cpoSync';

export const SKUS_COL = 'skus';
export const TRASH_COL = 'trash';
const TRASH_DAYS = 15;
const LOGS_COL = 'activityLogs';

// 세션 내 확정 캐시: onSnapshot race & persistSku 덮어쓰기로부터 finalOrderConfirmedAt을 복구
// null = 사용자가 명시적으로 취소, { ... } = 확정 완료, undefined = 모름(캐시 없음)
const confirmCache = new Map<string, { confirmedAt: string; qty: Record<string, number> } | null>();

// 마지막으로 Firestore에 저장된 SKU 상태 (변경 이력 diff용)
const savedSkuState: Record<string, SkuData> = {};

// diff 대상 필드만 추적 (배열/객체는 제외)
const TRACKED_FIELDS: Partial<Record<keyof SkuData, string>> = {
  skuName: 'SKU명',
  category: '카테고리',
  brand: '브랜드',
  releaseDate: '출시일',
  price: '판매가',
  memo: '메모',
};

function formatLogValue(val: unknown): string {
  if (val === null || val === undefined || val === '') return '–';
  if (typeof val === 'boolean') return val ? '✓' : '–';
  return String(val);
}

async function writeLog(skuId: string, skuName: string, role: string, changes: LogChange[]) {
  if (changes.length === 0) return;
  await addDoc(collection(fsdb, LOGS_COL), {
    skuId,
    skuName,
    role,
    changedAt: Timestamp.now(),
    changes,
  });
}

// Firestore는 __ 로 시작하고 끝나는 필드명을 금지함
// → finalOrderQty.__confirmedStep2Total__ / step2OptionQty.__total__ 를 최상위 필드로 분리
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toFirestore(sku: SkuData): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { isExpanded: _, finalOrderQty, step2OptionQty, _initialSnapshot: __, ...data } = sku;

  const result: Record<string, unknown> = { ...data };

  // finalOrderQty: __confirmedStep2Total__ 분리 → finalOrderStep2Total 최상위 필드
  if (finalOrderQty !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { __confirmedStep2Total__: step2Total, ...qtyClean } = finalOrderQty as Record<string, number>;
    result.finalOrderQty = qtyClean;
    if (step2Total !== undefined) result.finalOrderStep2Total = step2Total;
  }

  // step2OptionQty: __total__ 분리 → step2OptionTotal 최상위 필드
  if (step2OptionQty !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { __total__: optTotal, ...optQtyClean } = step2OptionQty as Record<string, number>;
    result.step2OptionQty = optQtyClean;
    if (optTotal !== undefined) result.step2OptionTotal = optTotal;
  }

  return result;
}

function buildEmptySku(category: Category): SkuData {
  const base: Omit<SkuData, '_initialSnapshot' | 'isExpanded'> = {
    id: uuidv4(),
    category,
    skuName: '',
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
    // NOTE: 위 MONTHS 기반 초기값은 releaseDate 없을 때의 기본값.
    // addSku 시 releaseDate가 있으면 applyMigration에서 올바른 월로 자동 보정됨.
    step2PlatformConfirmed: false,
    step2BrandConfirmed: false,
    step2GlobalConfirmed: false,
    specialMaxRate: 20,
    regularMaxRate: 15,
    seasonOffRate: 25,
    pricingMemo: '',
  };
  return { ...base, isExpanded: true, _initialSnapshot: JSON.parse(JSON.stringify(base)) };
}

/**
 * CPO 프로젝트가 새로 '기획/아이디어' 등 활성 상태가 됐을 때, Product에 없던 SKU 카드를
 * 자동으로 만들기 위한 초기값. category/brand/skuType/releaseDate/arrivalDate/shootingDate/moq/
 * sizes/colors만 CPO 값으로 시딩하고, 나머지(채널비중·프라이싱 시나리오 등)는 buildEmptySku와 동일한
 * Product 기본값 — CPO엔 없는 Product 전용 데이터라 시딩할 원본 자체가 없음.
 */
function buildSkuFromCpo(cpo: CpoProject): SkuData {
  const category = (CATEGORIES as string[]).includes(cpo.category) ? (cpo.category as Category) : CATEGORIES[0];
  const brand = (BRANDS as readonly string[]).includes(cpo.brand) ? (cpo.brand as Brand) : BRANDS[0];
  const skuType = (SKU_TYPES as readonly string[]).includes(cpo.skuType) ? (cpo.skuType as import('../types').SkuType) : SKU_TYPES[2];
  const base = buildEmptySku(category);

  const sizeCount = Math.min(Math.max(cpo.sizes?.length ?? 1, 1), MAX_SIZES);
  const labels = SIZE_LABELS[sizeCount] ?? SIZE_LABELS[1];
  const evenRatio = Math.round(100 / sizeCount);
  const sizes = Array.from({ length: MAX_SIZES }, (_, i) => ({
    label: i < sizeCount ? labels[i] : '-',
    ratio: i < sizeCount ? evenRatio : 0,
    quantity: 0,
    isActive: i < sizeCount,
  }));

  const hasColors = (cpo.colors?.length ?? 0) > 0;
  const colors = (cpo.colors ?? []).map((c) => ({ id: c.id, name: c.name, quantity: 0 }));

  const seeded: SkuData = {
    ...base,
    id: cpo.id,
    category,
    brand,
    skuType,
    skuName: cpo.skuName || '',
    releaseDate: cpo.releaseDate || '',
    // Firestore는 필드값 undefined를 거부함(문서 전체 저장 실패) — 값 없으면 아예 키를 안 넣음
    ...(cpo.arrivalDate ? { arrivalDate: cpo.arrivalDate } : {}),
    ...(cpo.shootingDate ? { shootingDate: cpo.shootingDate } : {}),
    moq: cpo.moq || 0,
    sizeCount,
    sizes,
    hasColors,
    colors,
  };
  return { ...seeded, isExpanded: false, _initialSnapshot: JSON.parse(JSON.stringify({ ...seeded, isExpanded: false, _initialSnapshot: undefined })) };
}

function recalcMonthlySplit(sku: SkuData, overrideSplit?: MonthlySplit[]): MonthlySplit[] {
  const base = overrideSplit ?? sku.monthlySplit;
  const skuMonthSet = new Set(getSkuMonths(sku.releaseDate));
  const multiplier = calcDynamicMultiplier(sku.channelRatios) ?? revenueMultiplier(sku.category);
  return base.map((ms) => {
    if (!skuMonthSet.has(ms.month)) return { ...ms, quantity: 0, revenue: 0, contributionProfit: 0 };
    const quantity = Math.round(sku.totalOrderQty * ms.ratio / 100);
    const revenue = Math.round(quantity * sku.price / 1.1 * multiplier);
    const contributionProfit = Math.round(revenue * sku.contributionMarginRate / 100);
    return { ...ms, quantity, revenue, contributionProfit };
  });
}

/** Product Dashboard 전용: 수량은 Firestore 저장값 그대로, revenue/profit만 재계산 */
function recalcRevenueFromQty(sku: SkuData): MonthlySplit[] {
  const skuMonthSet = new Set(getSkuMonths(sku.releaseDate));
  const multiplier = calcDynamicMultiplier(sku.channelRatios) ?? revenueMultiplier(sku.category);
  return sku.monthlySplit.map((ms) => {
    if (!skuMonthSet.has(ms.month)) return { ...ms, quantity: 0, revenue: 0, contributionProfit: 0 };
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
function deriveChannelMonthlySplit(sku: { channelRatios: any[]; monthlySplit: any[]; releaseDate?: string }): ChannelMonthEntry[] {
  const skuMonths = getSkuMonths(sku.releaseDate);
  return CHANNELS.flatMap((channel) =>
    skuMonths.map((month) => {
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
    specialMaxRate: raw.specialMaxRate ?? 20,
    regularMaxRate: raw.regularMaxRate ?? 15,
    seasonOffRate: raw.seasonOffRate ?? 25,
    pricingMemo: raw.pricingMemo ?? '',
    isExpanded: false,
    finalOrderConfirmedAt: raw.finalOrderConfirmedAt ?? null,
    // toFirestore에서 분리 저장한 메타 키 복원
    // finalOrderStep2Total → finalOrderQty.__confirmedStep2Total__
    ...(raw.finalOrderQty !== undefined && raw.finalOrderStep2Total !== undefined
      ? { finalOrderQty: { ...raw.finalOrderQty, __confirmedStep2Total__: raw.finalOrderStep2Total } }
      : {}),
    // step2OptionTotal → step2OptionQty.__total__
    ...(raw.step2OptionQty !== undefined && raw.step2OptionTotal !== undefined
      ? { step2OptionQty: { ...raw.step2OptionQty, __total__: raw.step2OptionTotal } }
      : {}),
    step2PlatformConfirmed: raw.step2PlatformConfirmed ?? raw.platformConfirmed ?? false,
    step2BrandConfirmed: raw.step2BrandConfirmed ?? raw.brandConfirmed ?? false,
    step2GlobalConfirmed: raw.step2GlobalConfirmed ?? raw.globalConfirmed ?? false,
    scheduleConfirmed: raw.scheduleConfirmed ?? raw.isProjectionConfirmed ?? false,
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
  const skuMonths = getSkuMonths(base.releaseDate);
  const existingMonths = new Set(base.monthlySplit.map((ms) => ms.month));
  const missing = skuMonths.filter((m) => !existingMonths.has(m));
  if (missing.length > 0) {
    const newEntries = missing.map((month) => ({
      month, ratio: 0, quantity: 0, revenue: 0, contributionProfit: 0,
    }));
    base.monthlySplit = [
      ...base.monthlySplit,
      ...newEntries,
    ].sort((a, b) => skuMonths.indexOf(a.month) - skuMonths.indexOf(b.month));
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
      skuMonths.filter((month) => !existing.has(`${channel}|${month}`)).map((month) => ({
        channel, month, ratio: 0,
      })),
    );
    if (toAdd.length > 0) base.channelMonthlySplit = [...base.channelMonthlySplit, ...toAdd];
    // MD뷰에서 아직 편집하지 않은 경우(모두 0) → PM 데이터로 재파생
    if (isCMSEmpty(base.channelMonthlySplit)) {
      base.channelMonthlySplit = deriveChannelMonthlySplit(base);
    }
  }
  // 비활성 채널 채널×월 목표량 강제 0 (쿠팡은 coupangEnabled인 SKU만 예외)
  const disabledCh = getDisabledChannels(base) as readonly string[];
  base.channelMonthQty = base.channelMonthQty.map((e) =>
    disabledCh.includes(e.channel) ? { ...e, qty: 0 } : e,
  );
  return base;
}

interface StoreActions {
  setActiveCategory: (category: Category) => void;
  setActiveBrand: (brand: Brand | '전체') => void;
  setListView: (v: boolean) => void;
  setExcludeOpenCompletePm: (v: boolean) => void;
  loadSkus: () => () => void;
  addSku: () => void;
  createSkuFromCpo: (cpo: CpoProject) => void;
  duplicateSku: (id: string) => void;
  deleteSku: (id: string, deletedBy: string) => Promise<void>;
  loadTrash: () => Promise<TrashItem[]>;
  restoreFromTrash: (trashId: string) => Promise<void>;
  resetSku: (id: string) => void;
  toggleExpanded: (id: string) => void;
  expandOnly: (id: string) => void;
  updateSku: (id: string, patch: Partial<SkuData>) => void;
  updateMonthlySplit: (id: string, month: Month, ratio: number) => void;
  updateChannelMonthQty: (id: string, channel: Channel, month: Month, qty: number) => void;
  batchInitChannelMonthQty: (id: string, entries: ChannelMonthQtyEntry[]) => void;
  setStep2InitBaseline: (id: string, entries: ChannelMonthQtyEntry[]) => void;
  updateChannelPricing: (id: string, channel: Channel, patch: { price?: number; commissionRate?: number }) => void;
  updateChannelRatio: (id: string, channel: string, ratio: number) => void;
  resetChannelRatios: (id: string) => void;
  updateChannelMonthRatio: (id: string, channel: Channel, month: Month, ratio: number) => void;
  resetChannelMonthlySplit: (id: string) => Promise<void>;
  applyChannelRatiosToFiltered: (sourceSkuId: string) => Promise<void>;
  importSkus: (skus: SkuData[]) => Promise<void>;
  replaceAllSkus: (skus: Omit<SkuData, '_initialSnapshot' | 'isExpanded'>[]) => Promise<void>;
  updateMarketingMonthQty: (id: string, month: Month, qty: number) => Promise<void>;
  updateStep2OptionQty: (id: string, qty: Record<string, number>) => void;
  updateFinalOrderQty: (id: string, qty: Record<string, number>) => void;
  setFinalOrderConfirmed: (id: string, confirmed: boolean, finalOrderQty?: Record<string, number>) => Promise<void>;
  persistSku: (id: string) => Promise<void>;
  setChannelConfirmed: (id: string, field: 'step2PlatformConfirmed' | 'step2BrandConfirmed' | 'step2GlobalConfirmed', value: boolean) => Promise<void>;
  setCoupangEnabled: (id: string, enabled: boolean) => Promise<void>;
  setPriceConfirmed: (id: string, confirmed: boolean) => Promise<void>;
  setScheduleConfirmed: (id: string, confirmed: boolean) => Promise<void>;
  setPricingRates: (id: string, patch: { specialMaxRate?: 20 | 15 | 10; regularMaxRate?: 15 | 10 | 5; seasonOffRate?: 25 | 30 }) => Promise<void>;
  setPricingMemo: (id: string, memo: string) => Promise<void>;
  setExpandedIds: (ids: string[]) => void;
  cleanupInitialSnapshots: () => Promise<number>;
  loadActivityLogs: (maxItems?: number) => Promise<ActivityLog[]>;
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
  excludeOpenCompletePm: readSession<boolean>('store:excludeOpenCompletePm', false),
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
  setExcludeOpenCompletePm: (v) => {
    writeSession('store:excludeOpenCompletePm', v);
    set({ excludeOpenCompletePm: v });
  },

  // Firestore 실시간 리스너 — 반환값(unsubscribe)을 App.tsx useEffect cleanup으로 사용
  loadSkus: () => {
    const q = collection(fsdb, SKUS_COL);
    const unsub = onSnapshot(q, (snapshot) => {
      const currentSkus = get().skus;
      const expandedMap = new Map(currentSkus.map((s) => [s.id, s.isExpanded]));
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
      // confirmCache에 확정 기록이 있는데 Firestore snapshot이 그걸 모르면 복원
      // (race condition & persistSku 덮어쓰기 양쪽 방어)
      const merged = processed.map((s) => {
        const cached = confirmCache.get(s.id);
        if (cached !== undefined && cached !== null && !s.finalOrderConfirmedAt) {
          console.warn('[onSnapshot] confirmCache로 복원', { id: s.id, cachedAt: cached.confirmedAt });
          return { ...s, finalOrderConfirmedAt: cached.confirmedAt, finalOrderQty: cached.qty };
        }
        if (s.finalOrderConfirmedAt) {
          console.log('[onSnapshot] 확정 상태 수신', { id: s.id, finalOrderConfirmedAt: s.finalOrderConfirmedAt });
        }
        return s;
      });
      set({ skus: merged });
      // Firestore 확정 상태를 savedSkuState에 기록 (변경 이력 diff용)
      merged.forEach((s) => { savedSkuState[s.id] = s; });
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'removed') delete savedSkuState[change.doc.id];
      });
      // 비활성 채널에 잔존하는 qty > 0 이면 Firestore에도 0으로 저장 (1회성 마이그레이션)
      // merged를 사용해 보존된 finalOrderConfirmedAt을 같이 write
      const toMigrate = merged.filter((s) => {
        const disabledCh = getDisabledChannels(s) as readonly string[];
        return (raw.find((r: any) => r.id === s.id)?.channelMonthQty ?? []).some(
          (e: any) => disabledCh.includes(e.channel) && e.qty > 0,
        );
      });
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
    if (skus.filter((s) => s.category === activeCategory).length >= 100) return;
    const newSku = buildEmptySku(activeCategory);
    set({ skus: [...skus, newSku] });
    setDoc(doc(fsdb, SKUS_COL, newSku.id), toFirestore(newSku));
  },

  createSkuFromCpo: (cpo) => {
    // 이미 로컬에 있으면(다른 탭/레이스에서 먼저 생겼으면) 건너뜀 — 중복 생성 방지
    if (get().skus.some((s) => s.id === cpo.id)) return;
    try {
      const newSku = buildSkuFromCpo(cpo);
      set({ skus: [...get().skus, newSku] });
      // setDoc은 잘못된 값(예: undefined 필드)이 있으면 프로미스가 아니라 즉시 예외를 던짐 —
      // try/catch로 감싸지 않으면 이 한 건 때문에 나머지 후보들의 생성까지 통째로 막힘(실제 발생했던 버그)
      setDoc(doc(fsdb, SKUS_COL, newSku.id), toFirestore(newSku)).catch((err) => {
        console.error('[createSkuFromCpo] Firestore 저장 실패:', newSku.id, err);
      });
    } catch (err) {
      console.error('[createSkuFromCpo] SKU 생성 실패:', cpo.id, err);
    }
  },

  duplicateSku: (id) => {
    const skus = get().skus;
    const source = skus.find((s) => s.id === id);
    if (!source) return;
    const newId = uuidv4();
    const copy: SkuData = {
      ...JSON.parse(JSON.stringify(source)),
      id: newId,
      skuName: source.skuName ? `${source.skuName} (복사)` : '(복사)',
      isExpanded: true,
    };
    copy._initialSnapshot = { ...copy._initialSnapshot, id: newId, skuName: copy.skuName };
    const idx = skus.findIndex((s) => s.id === id);
    const next = [...skus.slice(0, idx + 1), copy, ...skus.slice(idx + 1)];
    set({ skus: next });
    setDoc(doc(fsdb, SKUS_COL, copy.id), toFirestore(copy));
  },

  deleteSku: async (id, deletedBy) => {
    const sku = get().skus.find((s) => s.id === id);
    if (!sku) return;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TRASH_DAYS * 24 * 60 * 60 * 1000);
    await addDoc(collection(fsdb, TRASH_COL), {
      skuId: id,
      skuName: sku.skuName || '(SKU명 미입력)',
      category: sku.category,
      brand: sku.brand,
      deletedAt: now.toISOString(),
      deletedBy,
      expiresAt: Timestamp.fromDate(expiresAt),
      skuData: toFirestore(sku),
    });
    await deleteDoc(doc(fsdb, SKUS_COL, id));
    set({ skus: get().skus.filter((s) => s.id !== id) });
  },

  loadTrash: async () => {
    const snap = await getDocs(collection(fsdb, TRASH_COL));
    const now = Date.now();
    const expired: string[] = [];
    const valid: TrashItem[] = [];

    snap.docs.forEach((d) => {
      const data = d.data();
      const expiresTs = data.expiresAt as Timestamp | undefined;
      const expiresIso = expiresTs?.toDate?.()?.toISOString() ?? data.deletedAt as string;
      if (new Date(expiresIso).getTime() <= now) {
        expired.push(d.id);
      } else {
        valid.push({
          trashId: d.id,
          skuId: data.skuId as string,
          skuName: data.skuName as string,
          category: data.category as Category,
          brand: data.brand as string,
          deletedAt: data.deletedAt as string,
          deletedBy: data.deletedBy as string,
          expiresAt: expiresIso,
        });
      }
    });

    // 만료된 항목 Firestore에서 영구 삭제
    if (expired.length > 0) {
      const batch = writeBatch(fsdb);
      expired.forEach((id) => batch.delete(doc(fsdb, TRASH_COL, id)));
      await batch.commit();
    }

    return valid.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  },

  restoreFromTrash: async (trashId) => {
    const trashRef = doc(fsdb, TRASH_COL, trashId);
    const trashDoc = await getDoc(trashRef);
    if (!trashDoc.exists()) return;
    const data = trashDoc.data();
    await setDoc(doc(fsdb, SKUS_COL, data.skuId as string), data.skuData as Record<string, unknown>);
    await deleteDoc(trashRef);
    // onSnapshot이 복원된 SKU를 자동으로 로컬 상태에 반영
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

  expandOnly: (id) => {
    const target = get().skus.find((s) => s.id === id);
    if (!target) return;
    set({
      skus: get().skus.map((s) =>
        s.category === target.category
          ? { ...s, isExpanded: s.id === id }
          : s,
      ),
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
    const skus = get().skus;
    const sku = skus.find((s) => s.id === id);
    if (!sku) return;
    if ((getDisabledChannels(sku) as readonly string[]).includes(channel)) return;
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
    const disabledCh = getDisabledChannels(sku) as readonly string[];
    const safe = entries.map((e) =>
      disabledCh.includes(e.channel) ? { ...e, qty: 0 } : e,
    );
    set({ skus: skus.map((s) => (s.id === id ? { ...s, channelMonthQty: safe } : s)) });
  },

  setStep2InitBaseline: (id, entries) => {
    const skus = get().skus;
    const sku = skus.find((s) => s.id === id);
    if (!sku) return;
    const disabledCh = getDisabledChannels(sku) as readonly string[];
    const safe = entries.map((e) =>
      disabledCh.includes(e.channel) ? { ...e, qty: 0 } : e,
    );
    set({ skus: skus.map((s) => (s.id === id ? { ...s, step2InitBaselineQty: safe } : s)) });
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

  updateMarketingMonthQty: async (id, month, qty) => {
    set({
      skus: get().skus.map((s) =>
        s.id === id
          ? { ...s, marketingMonthQty: { ...(s.marketingMonthQty ?? {}), [month]: qty } }
          : s,
      ),
    });
    await get().persistSku(id);
  },

  updateStep2OptionQty: (id, qty) => {
    set({ skus: get().skus.map((s) => (s.id === id ? { ...s, step2OptionQty: qty } : s)) });
  },

  updateFinalOrderQty: (id, qty) => {
    set({ skus: get().skus.map((s) => (s.id === id ? { ...s, finalOrderQty: qty } : s)) });
  },

  setFinalOrderConfirmed: async (id, confirmed, finalOrderQty?: Record<string, number>) => {
    const sku = get().skus.find((s) => s.id === id);
    if (!sku) return;
    const ts = confirmed ? new Date().toISOString() : null;
    const updated = {
      ...sku,
      finalOrderConfirmedAt: ts,
      ...(finalOrderQty !== undefined ? { finalOrderQty } : {}),
    };
    // 세션 캐시 등록 — confirmed=false이면 null(명시적 취소)으로 기록
    if (confirmed) {
      confirmCache.set(id, { confirmedAt: ts!, qty: finalOrderQty ?? sku.finalOrderQty ?? {} });
    } else {
      confirmCache.set(id, null);
    }
    set({ skus: get().skus.map((s) => (s.id === id ? updated : s)) });
    const firestorePayload = toFirestore(updated);
    console.log('[확정] Firestore write 시작', { id, finalOrderConfirmedAt: firestorePayload.finalOrderConfirmedAt, hasQty: !!firestorePayload.finalOrderQty });
    await setDoc(doc(fsdb, SKUS_COL, id), firestorePayload);
    // write 완료 후 실제 Firestore 상태 검증
    const verify = await getDoc(doc(fsdb, SKUS_COL, id));
    console.log('[확정] Firestore 검증', { finalOrderConfirmedAt: verify.data()?.finalOrderConfirmedAt, hasQty: !!verify.data()?.finalOrderQty });
    // setDoc 완료 후 재적용: write 중 onSnapshot race로 임시 삭제된 경우 복원
    const patch: Partial<SkuData> = {
      finalOrderConfirmedAt: ts,
      ...(finalOrderQty !== undefined ? { finalOrderQty } : {}),
    };
    set({ skus: get().skus.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
    writeLog(id, sku.skuName, useAuth.getState().role ?? 'unknown', [{
      field: 'finalOrderConfirmedAt', label: '발주 확정',
      from: formatLogValue(!!sku.finalOrderConfirmedAt), to: formatLogValue(confirmed),
    }]).catch(console.error);
  },

  persistSku: async (id) => {
    const sku = get().skus.find((s) => s.id === id);
    if (!sku) return;

    // 변경 이력: savedSkuState와 현재 상태를 diff
    const before = savedSkuState[id];
    if (before) {
      const changes: LogChange[] = [];
      for (const [field, label] of Object.entries(TRACKED_FIELDS)) {
        const oldVal = formatLogValue(before[field as keyof SkuData]);
        const newVal = formatLogValue(sku[field as keyof SkuData]);
        if (oldVal !== newVal) changes.push({ field, label, from: oldVal, to: newVal });
      }
      if (changes.length > 0) {
        const role = useAuth.getState().role ?? 'unknown';
        writeLog(id, sku.skuName, role, changes).catch(console.error);
      }
    }

    // CPO 연동 SKU면, 오픈일/입고예정일/촬영예정일 중 CPO와 달라진 값만 CPO의
    // productSync 문서로 보낸다 — CPO 앱이 이 컬렉션을 감지해서 실제 projects
    // 문서에 병합한다(STEP4 4단계, cpo-dashboard 저장소 구현).
    // ⚠️ markLocalDateEdit은 반드시 아래 setDoc(await) 이전, 즉 persistSku 호출과 동기적으로
    // 실행되어야 한다. 예전엔 setDoc await 이후에 호출했는데, 그 사이(네트워크 왕복 시간) 동안
    // useCpoDateSync 이펙트가 "아직 옛날 값인 CPO"를 보고 방금 로컬에서 고친 값을 되돌려버리는
    // 레이스가 있었다(리스트 뷰에서 날짜 클릭 직후 초기화되던 버그의 원인).
    const cpoProject = useCpoSync.getState().cpoProjects[id];
    if (cpoProject) {
      const datePatch: Partial<Record<(typeof SYNCED_DATE_FIELDS)[number], string>> = {};
      for (const field of SYNCED_DATE_FIELDS) {
        const localVal = sku[field] ?? '';
        const cpoVal = cpoProject[field] ?? '';
        // localVal이 빈 문자열(사용자가 날짜를 지운 경우)도 유효한 편집이라 그대로 보내야 함
        // — truthy 체크를 넣으면 "삭제"라는 사실 자체가 CPO로 전달되지 않는다.
        if (localVal !== cpoVal) {
          datePatch[field] = localVal;
          markLocalDateEdit(id, field);
        }
      }
      if (Object.keys(datePatch).length > 0) {
        writeProductSyncDates(id, datePatch).catch((err) =>
          console.error('[persistSku] CPO productSync 기록 실패:', id, err),
        );
      }
    }

    // finalOrderConfirmedAt / finalOrderQty는 setFinalOrderConfirmed만 write
    // persistSku가 로컬 state를 그대로 write하면 onSnapshot race로 null이 된
    // 로컬 값이 Firestore에도 덮여써져 새로고침 후 데이터 유실 발생
    // → 두 필드를 제외하고 merge:true로 write → Firestore의 기존 확정 데이터 보존
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { finalOrderConfirmedAt: _fca, finalOrderQty: _foq, finalOrderStep2Total: _fst, ...firestoreBody } = toFirestore(sku);
    try {
      await setDoc(doc(fsdb, SKUS_COL, id), firestoreBody, { merge: true });
    } catch (err) {
      console.error('[persistSku] Firestore 저장 실패:', id, err);
      throw err;
    }
  },

  setChannelConfirmed: async (id, field, value) => {
    const sku = get().skus.find((s) => s.id === id);
    if (!sku) return;
    const updated = { ...sku, [field]: value };
    set({ skus: get().skus.map((s) => (s.id === id ? updated : s)) });
    await setDoc(doc(fsdb, SKUS_COL, id), toFirestore(updated));
    const CHANNEL_LABELS: Record<string, string> = {
      step2PlatformConfirmed: '플랫폼 확정',
      step2BrandConfirmed: '브랜드 확정',
      step2GlobalConfirmed: '글로벌 확정',
    };
    writeLog(id, sku.skuName, useAuth.getState().role ?? 'unknown', [{
      field, label: CHANNEL_LABELS[field] ?? field,
      from: formatLogValue(!value), to: formatLogValue(value),
    }]).catch(console.error);
  },

  setCoupangEnabled: async (id, enabled) => {
    const sku = get().skus.find((s) => s.id === id);
    if (!sku) return;
    // 재활성화/비활성화 시 STEP2 채널비중을 대응SKU 기준으로 다음 진입 때 재계산하도록 초기화
    // (Firestore는 필드값 undefined를 허용하지 않으므로 빈 배열 사용 — 비교 로직상 undefined와 동치)
    const updated: SkuData = {
      ...sku,
      coupangEnabled: enabled,
      channelQtyDerivedFromCompareSkus: [],
      channelMonthQty: enabled
        ? sku.channelMonthQty
        : sku.channelMonthQty.map((e) => (e.channel === '쿠팡' ? { ...e, qty: 0 } : e)),
    };
    set({ skus: get().skus.map((s) => (s.id === id ? updated : s)) });
    try {
      await setDoc(doc(fsdb, SKUS_COL, id), toFirestore(updated));
    } catch (err) {
      console.error('[setCoupangEnabled] Firestore 저장 실패:', id, err);
      throw err;
    }
    writeLog(id, sku.skuName, useAuth.getState().role ?? 'unknown', [{
      field: 'coupangEnabled', label: '쿠팡 채널 활성화',
      from: formatLogValue(!enabled), to: formatLogValue(enabled),
    }]).catch(console.error);
  },

  setPriceConfirmed: async (id, confirmed) => {
    const sku = get().skus.find((s) => s.id === id);
    if (!sku) return;
    const updated = { ...sku, isPriceConfirmed: confirmed };
    set({ skus: get().skus.map((s) => (s.id === id ? updated : s)) });
    await setDoc(doc(fsdb, SKUS_COL, id), toFirestore(updated));
    writeLog(id, sku.skuName, useAuth.getState().role ?? 'unknown', [{
      field: 'isPriceConfirmed', label: '가격 확정',
      from: formatLogValue(!confirmed), to: formatLogValue(confirmed),
    }]).catch(console.error);
  },

  setScheduleConfirmed: async (id, confirmed) => {
    const sku = get().skus.find((s) => s.id === id);
    if (!sku) return;
    const updated = { ...sku, scheduleConfirmed: confirmed };
    set({ skus: get().skus.map((s) => (s.id === id ? updated : s)) });
    await setDoc(doc(fsdb, SKUS_COL, id), toFirestore(updated));
    writeLog(id, sku.skuName, useAuth.getState().role ?? 'unknown', [{
      field: 'scheduleConfirmed', label: '일정 확정',
      from: formatLogValue(!confirmed), to: formatLogValue(confirmed),
    }]).catch(console.error);
  },

  setPricingRates: async (id, patch) => {
    const sku = get().skus.find((s) => s.id === id);
    if (!sku) return;
    const updated = { ...sku, ...patch };
    set({ skus: get().skus.map((s) => (s.id === id ? updated : s)) });
    await setDoc(doc(fsdb, SKUS_COL, id), toFirestore(updated));
    const labels: Record<string, string> = {
      specialMaxRate: '특가 최대할인율', regularMaxRate: '상시 최대할인율', seasonOffRate: '시즌오프 할인율',
    };
    const changes = (Object.keys(patch) as (keyof typeof patch)[]).map((field) => ({
      field, label: labels[field],
      from: formatLogValue(sku[field as keyof SkuData]), to: formatLogValue(patch[field]),
    }));
    writeLog(id, sku.skuName, useAuth.getState().role ?? 'unknown', changes).catch(console.error);
  },

  setPricingMemo: async (id, memo) => {
    const sku = get().skus.find((s) => s.id === id);
    if (!sku) return;
    const prevMemo = sku.pricingMemo ?? '';
    if (prevMemo === memo) return;
    const updated = { ...sku, pricingMemo: memo };
    set({ skus: get().skus.map((s) => (s.id === id ? updated : s)) });
    await setDoc(doc(fsdb, SKUS_COL, id), toFirestore(updated));
    writeLog(id, sku.skuName, useAuth.getState().role ?? 'unknown', [{
      field: 'pricingMemo', label: '프라이싱 메모',
      from: formatLogValue(prevMemo), to: formatLogValue(memo),
    }]).catch(console.error);
  },

  loadActivityLogs: async (maxItems = 200) => {
    const q = query(collection(fsdb, LOGS_COL), orderBy('changedAt', 'desc'), limit(maxItems));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      skuId: d.data().skuId as string,
      skuName: d.data().skuName as string,
      role: d.data().role as string,
      changedAt: (d.data().changedAt as Timestamp).toDate().toISOString(),
      changes: (d.data().changes ?? []) as import('../types').LogChange[],
    }));
  },

  setExpandedIds: (ids) => {
    const idSet = new Set(ids);
    set({ skus: get().skus.map((s) => ({ ...s, isExpanded: idSet.has(s.id) })) });
  },

  cleanupInitialSnapshots: async () => {
    const snap = await getDocs(collection(fsdb, SKUS_COL));
    const dirty = snap.docs.filter((d) => d.data()._initialSnapshot !== undefined);
    if (dirty.length === 0) return 0;
    const CHUNK = 500;
    for (let i = 0; i < dirty.length; i += CHUNK) {
      const batch = writeBatch(fsdb);
      dirty.slice(i, i + CHUNK).forEach((d) => {
        batch.update(d.ref, { _initialSnapshot: deleteField() });
      });
      await batch.commit();
    }
    return dirty.length;
  },
}));
