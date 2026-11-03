import { CHANNELS, isSkuActiveForYearMonth } from '../types';
import type { SkuData, Channel, Month, YearMonth } from '../types';
import type { ChannelDataMap, SkuShipmentInfo, TeamCateMap } from '../services/tableau';
import { buildCompareData, calcVarCostResults } from './compareData';
import { basePriceOf, cellMoney, priceOptOf, qtyOf, varCostOf, type VarCostResults } from './reviewSku';
import { step1Pricer } from './step1Price';
import { getPricingPolicy } from '../hooks/usePricingPolicy';

export type MonthMetrics = { qty: number; revenue: number; profit: number; profitRevenue: number };
export const ZERO_METRICS: MonthMetrics = { qty: 0, revenue: 0, profit: 0, profitRevenue: 0 };

/** 판매가 선택지 단가 — 정책은 앱 전체 구독값. 환율 미지정 시 기본값(1,400 · 9.0). */
function calcScenarioPrice(sku: SkuData, optId: string, base: number, usdRate = 1400, jpyRate = 9.0): number {
  return step1Pricer(sku, getPricingPolicy(), { usd: usdRate, jpy: jpyRate })(optId, base);
}

/** SKU별 변동비 — null이면 못 불러온 상태(공헌이익을 계산하지 않음). SKU 카드와 같은 기간을 쓴다 */
export type VarCostBySku = Record<string, VarCostResults> | null;

export function buildVarCostBySku(
  skus: SkuData[], teamCate: TeamCateMap | null, shipments: SkuShipmentInfo[], channelMap: ChannelDataMap | null,
): VarCostBySku {
  if (!teamCate) return null;
  return Object.fromEntries(skus.map((s) => {
    const cd = buildCompareData(s, shipments, channelMap);
    return [s.id, calcVarCostResults(teamCate, s, cd.mode, cd.channelYM)];
  }));
}

export function calcChannelMonthMetrics(
  sku: SkuData, channel: Channel, month: Month, varCost: VarCostBySku,
  usdRate?: number, jpyRate?: number,
): MonthMetrics {
  const qty = qtyOf(sku, channel, month);
  if (qty === 0) return ZERO_METRICS;
  const price = calcScenarioPrice(sku, priceOptOf(sku, channel, month), basePriceOf(sku, channel), usdRate, jpyRate);
  const { revenue, profit } = cellMoney(price, qty, sku.cost, varCostOf(varCost ? (varCost[sku.id] ?? {}) : null, channel).ratio);
  return { qty, revenue, profit: profit ?? 0, profitRevenue: profit === null ? 0 : revenue };
}

/** 그 달 마케팅 수량의 원가 — 매출 없이 공헌이익에서만 차감 (원가 · 변동비가 있어 공헌이익을 계산한 경우만) */
function marketingMetrics(sku: SkuData, ym: YearMonth, varCost: VarCostBySku): MonthMetrics {
  if (!varCost || !sku.cost || !isSkuActiveForYearMonth(sku, ym)) return ZERO_METRICS;
  return { ...ZERO_METRICS, profit: -sku.cost * (sku.marketingMonthQty?.[ym.month] ?? 0) };
}

/**
 * SKU × 채널 × YearMonth 목록 합산.
 * YearMonth 단위로 체크하므로 같은 월 번호라도 연도가 다르면 별도 집계됨.
 */
function calcSkuChannelTotals(
  sku: SkuData, channel: Channel, months: YearMonth[], varCost: VarCostBySku,
  usdRate?: number, jpyRate?: number,
): MonthMetrics {
  return months.reduce((acc, ym) => {
    if (!isSkuActiveForYearMonth(sku, ym)) return acc;
    return addMetrics(acc, calcChannelMonthMetrics(sku, channel, ym.month, varCost, usdRate, jpyRate));
  }, ZERO_METRICS);
}

/**
 * channels 생략 시 전체 채널 합산 + 마케팅 원가 차감 — "전체 요약" 뷰(카드 합계와 같은 값).
 * channels를 넘기면 그 부분집합만 합산 — 채널 다중선택 뷰(마케팅은 채널이 아니라 제외).
 */
export function calcSkuAllChannelTotals(
  sku: SkuData, months: YearMonth[], varCost: VarCostBySku,
  usdRate?: number, jpyRate?: number, channels?: readonly Channel[],
): MonthMetrics & { cm: number | null } {
  let totals = [...(channels ?? CHANNELS)].reduce(
    (acc, ch) => addMetrics(acc, calcSkuChannelTotals(sku, ch, months, varCost, usdRate, jpyRate)),
    ZERO_METRICS,
  );
  if (!channels) totals = months.reduce((acc, ym) => addMetrics(acc, marketingMetrics(sku, ym, varCost)), totals);
  return { ...totals, cm: metricsCm(totals) };
}

/** 한 달의 전체 채널 합계 + 마케팅 차감 — 전체 요약 월별 차트용 */
export function calcSkuMonthMarketing(sku: SkuData, ym: YearMonth, varCost: VarCostBySku): number {
  return marketingMetrics(sku, ym, varCost).profit;
}

/** 여러 채널의 특정 월 지표 합산 — calcChannelMonthMetrics의 다중 채널 버전 */
export function calcChannelsMonthMetrics(
  sku: SkuData, channels: readonly Channel[], month: Month, varCost: VarCostBySku,
  usdRate?: number, jpyRate?: number,
): MonthMetrics {
  return channels.reduce(
    (acc, ch) => addMetrics(acc, calcChannelMonthMetrics(sku, ch, month, varCost, usdRate, jpyRate)),
    ZERO_METRICS,
  );
}

export function addMetrics(a: MonthMetrics, b: MonthMetrics): MonthMetrics {
  return { qty: a.qty + b.qty, revenue: a.revenue + b.revenue, profit: a.profit + b.profit, profitRevenue: a.profitRevenue + b.profitRevenue };
}

/** 공헌이익을 계산한 SKU의 매출 기준 CM% — 원가 없는 SKU 매출이 분모에 섞이지 않게 */
export function metricsCm(m: MonthMetrics): number | null {
  return m.profitRevenue > 0 ? Math.round((m.profit / m.profitRevenue) * 1000) / 10 : null;
}

export function formatWon(n: number): string {
  if (n <= 0) return '–';
  if (n >= 100_000_000) {
    const uk = n / 100_000_000;
    return `${Number.isInteger(uk) ? uk : uk.toFixed(1)}억`;
  }
  return `${Math.round(n / 10_000).toLocaleString()}만`;
}

export function cmBadgeCls(cm: number | null): string {
  if (cm === null) return 'bg-gray-100 text-gray-400';
  if (cm >= 40) return 'bg-emerald-100 text-emerald-700';
  if (cm >= 30) return 'bg-yellow-100 text-yellow-700';
  return 'bg-red-100 text-red-600';
}
