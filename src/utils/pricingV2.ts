/**
 * 프라이싱 개편(프로젝션 › 프라이싱 신규 탭) 가격 계산 — 순수 함수.
 * 개편안: https://claude.ai/artifact/DSEC8eveeWs1Q7xvjwEagA
 *
 * B2C  · 오픈특가      = 브랜드 정책 (판매가 n% 할인 → 끝자리 규칙)
 *      · 선오픈 최저가 = 주력 SKU만 · 기존 신상위크 로직 (오픈특가 1만원 이하 5% · 초과 −1,000원)
 *      · 라이브        = 선오픈 최저가(없으면 오픈특가)의 5% 추가 할인, 최대 1,000원
 *      · 상시 최대 · 특가 최대 = 판매가 n% 할인 (10원 내림)
 *      → B2C는 할인율로 계산한 가격을 전부 10원 단위 내림, 할인율 표시는 정수 반올림
 * B2B  · B2B 오픈 · B2B 상시 · 사입 · 글로벌 · 일본 = 기존 시나리오 계산 그대로
 *      · 팝업/페어     = 상시 판매가 10% 할인 → 10원 단위 버림 (B2B 비율 · 팝업은 브랜드별 정책)
 * 앞 단계 실제값(수동 포함) 기준으로 다음 단계를 이어서 계산한다.
 */
import type { Brand, Category, SkuData } from '../types';
import { PRICING_SCENARIOS } from './pricingScenarios';

export type RoundMode = '900' | '100' | '10';
export interface BrandPolicy {
  // B2C
  openRate: number; round: RoundMode; reg: number; spec: number;
  // B2B — B2B 상시 = 판매가 b2bRate%(10원 반올림), B2B 오픈 = B2B 상시에서 b2bOpenDisc% 추가 할인(10원 반올림),
  //       사입 = 판매가 buyRate%(10원 올림), 팝업/페어 = 판매가 popupRate% 할인(10원 버림)
  b2bRate: number; b2bOpenDisc: number; buyRate: number; popupRate: number;
}
export interface CommonPolicy { preThr: number; prePct: number; preMinus: number; livePct: number; liveMax: number }
export interface PricingPolicy {
  brands: Record<Brand, BrandPolicy>;
  common: CommonPolicy;
  /** 카테고리별 할인가능시점 (오픈 후 n주). null = 미정 */
  weeks: Partial<Record<Category, number | null>>;
}

export const DEFAULT_PRICING_POLICY: PricingPolicy = {
  brands: {
    '바잇미': { openRate: 20, round: '900', reg: 15, spec: 20, b2bRate: 65, b2bOpenDisc: 10, buyRate: 50, popupRate: 10 },
    'SSFW': { openRate: 10, round: '10', reg: 10, spec: 20, b2bRate: 65, b2bOpenDisc: 10, buyRate: 50, popupRate: 10 },
    '그외': { openRate: 10, round: '10', reg: 10, spec: 20, b2bRate: 65, b2bOpenDisc: 10, buyRate: 50, popupRate: 10 },
  },
  common: { preThr: 10000, prePct: 5, preMinus: 1000, livePct: 5, liveMax: 1000 },
  weeks: { '장난감': 4, '용품': 8, '식품': null, '잡화': null, '의류': null },
};

export const ROUND_LABEL: Record<RoundMode, string> = {
  '900': '1,000원 단위 900 맞춤',
  '100': '100원 단위 내림',
  '10': '10원 단위 내림',
};

export type PriceKey = 'open' | 'pre' | 'live' | 'reg' | 'spec' | 'b2bOpen' | 'b2b' | 'buy' | 'popup' | 'glob' | 'jp';
export const B2C_KEYS: { k: PriceKey; label: string; sub?: string }[] = [
  { k: 'pre', label: '선오픈 최저가', sub: '*주력SKU 프로모션' }, { k: 'live', label: '라이브' }, { k: 'open', label: '오픈특가', sub: '*기본 오픈할인가' },
  { k: 'reg', label: '상시 최대' }, { k: 'spec', label: '특가 최대' },
];
export const B2B_KEYS: { k: PriceKey; label: string; sub?: string }[] = [
  { k: 'b2bOpen', label: 'B2B 오픈' }, { k: 'b2b', label: 'B2B 상시' }, { k: 'buy', label: '사입 공급가' },
  { k: 'popup', label: '팝업/페어' }, { k: 'glob', label: '글로벌 공급가', sub: '자동 고정' }, { k: 'jp', label: '일본 공급가' },
];
/** 수동 수정 불가 (기존 프라이싱 창과 같음) */
export const AUTO_LOCKED_KEYS = new Set<PriceKey>(['glob']);

/** 수동값: 금액 또는 판매가 대비 할인율 */
export type PriceOverride = number | { pct: number };
export type PriceSet = Record<PriceKey, number | null>;

export const ceil10 = (x: number) => Math.ceil(x / 10) * 10;
export const floor10 = (x: number) => Math.floor(x / 10) * 10;
export const round10 = (x: number) => Math.round(x / 10) * 10;

export function roundOpen(x: number, mode: RoundMode): number {
  if (mode === '900') return Math.floor((x - 901) / 1000) * 1000 + 900;
  if (mode === '100') return Math.floor(x / 100) * 100;
  return x;
}
const B2C_KEY_SET = new Set<PriceKey>(['open', 'pre', 'live', 'reg', 'spec']);
/** 할인율 입력 → 판매가 × (100 − n)% → B2C 10원 단위 내림 · B2B 10원 단위 올림(기존 그대로) */
export const pctPrice = (base: number, pct: number, k: PriceKey = 'open') =>
  (B2C_KEY_SET.has(k) ? floor10 : ceil10)(base * (1 - pct / 100));
export const preFrom = (open: number, c: CommonPolicy) =>
  open <= c.preThr ? floor10(open * (1 - c.prePct / 100)) : Math.max(0, open - c.preMinus);
export const liveFrom = (x: number, c: CommonPolicy) =>
  floor10(x - Math.min(Math.round((x * c.livePct) / 100), c.liveMax));

const scenario = (id: string) => PRICING_SCENARIOS.find((s) => s.id === id)!;

export interface PriceInput {
  price: number;
  brand: Brand;
  core: boolean;
  live: boolean;
  overrides?: Record<string, PriceOverride>;
}

export function calcPricesV2(
  input: PriceInput, policy: PricingPolicy, fx: { usd: number; jpy: number }, useOverrides = true,
): PriceSet {
  const b = input.price;
  const p = policy.brands[input.brand] ?? policy.brands['바잇미'];
  const c = policy.common;
  const ov: Partial<Record<PriceKey, number>> = {};
  if (useOverrides) {
    for (const [k, v] of Object.entries(input.overrides ?? {})) {
      ov[k as PriceKey] = typeof v === 'object' && v ? pctPrice(b, v.pct, k as PriceKey) : (v as number);
    }
  }
  const open = ov.open ?? roundOpen(floor10(b * (1 - p.openRate / 100)), p.round);
  const pre = input.core ? (ov.pre ?? preFrom(open, c)) : null;
  const live = input.live ? (ov.live ?? liveFrom(pre ?? open, c)) : null;
  return {
    open, pre, live,
    reg: ov.reg ?? floor10(b * (1 - p.reg / 100)),
    spec: ov.spec ?? floor10(b * (1 - p.spec / 100)),
    b2bOpen: ov.b2bOpen ?? round10(b * (p.b2bRate / 100) * (1 - p.b2bOpenDisc / 100)),
    b2b: ov.b2b ?? round10(b * (p.b2bRate / 100)),
    buy: ov.buy ?? ceil10(b * (p.buyRate / 100)),
    popup: ov.popup ?? floor10(b * (1 - p.popupRate / 100)),
    glob: scenario('글로벌 공급가').calcKrwPrice(b, fx.usd),
    jp: ov.jp ?? scenario('일본 공급가').calcKrwPrice(b, fx.usd, fx.jpy),
  };
}

/**
 * 개편 전에 가격 확정된 SKU의 "기존 값" — 기존 프라이싱 창과 같은 계산(SKU별 할인율 · 수동 모드 포함).
 * 선오픈 최저가 = 기존 신상위크 가격(주력 SKU만), 팝업/페어는 기존에 없던 항목이라 새 규칙.
 */
export function legacyPricesV2(sku: SkuData, core: boolean, policy: PricingPolicy, fx: { usd: number; jpy: number }): PriceSet {
  const rates = { specialMaxRate: sku.specialMaxRate ?? 20, regularMaxRate: sku.regularMaxRate ?? 15, seasonOffRate: sku.seasonOffRate ?? 25 };
  const nw = sku.pricingPromoNewWeek ?? false;
  const manual = sku.pricingMode === 'manual' ? new Map((sku.manualScenarios ?? []).map((m) => [m.id, m.price])) : null;
  const v = (id: string) => manual?.get(id) ?? scenario(id).calcKrwPrice(sku.price, fx.usd, fx.jpy, nw, rates);
  const live = sku.pricingPromoLive || nw ? v('라이브 할인') : null;
  return {
    open: v('오픈특가'),
    pre: core ? v('신상위크') : null,
    live,
    reg: v('상시 최대할인율'),
    spec: v('특가 최대할인율'),
    b2bOpen: v('B2B 오픈 할인'),
    b2b: v('B2B 상시 운영'),
    buy: v('사입 공급가'),
    popup: floor10(sku.price * (1 - (policy.brands[sku.brand] ?? policy.brands['바잇미']).popupRate / 100)),
    glob: scenario('글로벌 공급가').calcKrwPrice(sku.price, fx.usd),
    jp: v('일본 공급가'),
  };
}

/** 할인가능시점 = SKU 오픈일 + n주 (주 수 없으면 null) */
export function discountStart(releaseDate: string | undefined, weeks: number | null | undefined): Date | null {
  if (!releaseDate || weeks == null) return null;
  const d = new Date(`${releaseDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

/** 판매가 대비 할인율(%) — 정수 반올림 (15.5% → 16% · 15.3% → 15%). 부동소수 오차는 소수 6자리에서 정리 */
export const discountPct = (price: number, base: number) =>
  (base > 0 ? Math.round(Number(((1 - price / base) * 100).toFixed(6))) : 0);
