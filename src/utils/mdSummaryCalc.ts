import { CATEGORIES, CHANNELS, getReleaseMonth, getSkuMonths, isSkuActiveForYearMonth } from '../types';
import type { SkuData, Channel, Month, YearMonth } from '../types';
import { calcVariableCostRatio, type TeamCateMap } from '../services/tableau';
import { PRICING_SCENARIOS, PRICING_DEFAULT_OPT } from './pricingScenarios';

export type MonthMetrics = { qty: number; revenue: number; profit: number };
export const ZERO_METRICS: MonthMetrics = { qty: 0, revenue: 0, profit: 0 };

/**
 * SKU카드 STEP2(PricingChannelTable.calcRow)와 동일하게 PRICING_SCENARIOS를 그대로 사용.
 * 시나리오 공식이 여기서 따로 복제되지 않으므로 pricingScenarios.ts만 고치면 양쪽에 반영된다.
 */
export function calcScenarioPrice(optId: string, base: number, usdRate?: number, jpyRate?: number): number {
  if (!optId) return base;
  const s = PRICING_SCENARIOS.find((x) => x.id === optId);
  return s ? s.calcKrwPrice(base, usdRate, jpyRate) : base;
}

/**
 * 카테고리×채널별 변동비율 맵 (STEP2/SkuCard와 동일한 Tableau 팀카테 역산 기준).
 * key: `${category}|${channel}`. 이 뷰는 SKU별 대응SKU 비교기간 선택을 알 수 없으므로
 * STEP2 기본 모드인 rolling12(직전 12개월, 데이터셋 최신 기준)로 고정 계산한다.
 */
export type VarCostRatioMap = Record<string, number>;

export function varCostKey(category: string, channel: string): string {
  return `${category}|${channel}`;
}

export function buildVarCostRatioMap(teamCateMap: TeamCateMap | null): VarCostRatioMap {
  const map: VarCostRatioMap = {};
  if (!teamCateMap) return map;
  for (const category of CATEGORIES) {
    for (const channel of CHANNELS) {
      const r = calcVariableCostRatio(teamCateMap, category, channel, 'rolling12', null, null);
      if (r) map[varCostKey(category, channel)] = r.ratio;
    }
  }
  return map;
}

/**
 * SKU의 특정 월이 활성(표시)인지 확인.
 * 출시월 기준 8개월 윈도우(getSkuMonths) 내에 있으면 active.
 * 추후 전월(pre-release) 입력 허용 시에는 이 함수 대신 isSkuActiveForYearMonth 사용.
 */
export function isMonthActive(sku: SkuData, month: Month): boolean {
  return getSkuMonths(sku.releaseDate).includes(month);
}

export function calcChannelMonthMetrics(
  sku: SkuData, channel: Channel, month: Month, varCostMap: VarCostRatioMap = {},
  usdRate?: number, jpyRate?: number,
): MonthMetrics {
  const qty = sku.channelMonthQty.find((e) => e.channel === channel && e.month === month)?.qty ?? 0;
  if (qty === 0) return ZERO_METRICS;
  const cp = sku.channelPricing?.find((p) => p.channel === channel);
  const effectivePrice = cp && cp.price > 0 ? cp.price : sku.price;
  const optId = sku.pricingOpts?.[`${channel}-${month}`] ?? PRICING_DEFAULT_OPT[channel] ?? '';
  const scenarioPrice = calcScenarioPrice(optId, effectivePrice, usdRate, jpyRate);
  const revenue = Math.round((scenarioPrice / 1.1) * qty);
  // 공헌이익 = 순매출 − 원가 − 변동비(Tableau 팀카테 역산, fallback 25%) — STEP2/SkuCard와 동일 공식
  const varRatio = varCostMap[varCostKey(sku.category, channel)] ?? 0.25;
  const profit = Math.round(revenue * (1 - varRatio) - sku.cost * qty);
  return { qty, revenue, profit };
}

/**
 * SKU × 채널 × YearMonth 목록 합산.
 * YearMonth 단위로 체크하므로 같은 월 번호라도 연도가 다르면 별도 집계됨.
 */
export function calcSkuChannelTotals(
  sku: SkuData, channel: Channel, months: YearMonth[], varCostMap: VarCostRatioMap = {},
  usdRate?: number, jpyRate?: number,
): MonthMetrics {
  return months.reduce((acc, ym) => {
    if (!isSkuActiveForYearMonth(sku, ym)) return acc;
    return addMetrics(acc, calcChannelMonthMetrics(sku, channel, ym.month, varCostMap, usdRate, jpyRate));
  }, ZERO_METRICS);
}

export function calcSkuAllChannelTotals(
  sku: SkuData, months: YearMonth[], varCostMap: VarCostRatioMap = {},
  usdRate?: number, jpyRate?: number,
): MonthMetrics & { cm: number | null } {
  const totals = [...CHANNELS].reduce(
    (acc, ch) => addMetrics(acc, calcSkuChannelTotals(sku, ch, months, varCostMap, usdRate, jpyRate)),
    ZERO_METRICS,
  );
  const cm = totals.revenue > 0 ? Math.round((totals.profit / totals.revenue) * 1000) / 10 : null;
  return { ...totals, cm };
}

export function addMetrics(a: MonthMetrics, b: MonthMetrics): MonthMetrics {
  return { qty: a.qty + b.qty, revenue: a.revenue + b.revenue, profit: a.profit + b.profit };
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

// --- 하위 호환: 구 MONTHS 기반 집계 (ChannelSimSection 등 비요약탭용) ---
export function calcSkuChannelTotalsLegacy(sku: SkuData, channel: Channel): MonthMetrics {
  const releaseYear = sku.releaseDate ? parseInt(sku.releaseDate.split('-')[0], 10) : 2026;
  const rm = getReleaseMonth(sku.releaseDate) ?? 7;
  const skuMonths = getSkuMonths(sku.releaseDate);
  const legacyMonths: YearMonth[] = skuMonths.map((m) => ({
    year: m < rm ? releaseYear + 1 : releaseYear,
    month: m,
  }));
  return calcSkuChannelTotals(sku, channel, legacyMonths);
}
