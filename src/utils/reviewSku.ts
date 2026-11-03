/**
 * SKU 금액 계산 — 카드 · 채널 목표량 · 채널별 요약 · 발주량 검토 · 엑셀이 모두 이 파일의 공식을 쓴다.
 * 공헌이익 = 순매출 × (1 − 변동비율) − 원가 × 수량. 마케팅 수량은 매출 없이 원가만 차감.
 * 변동비는 카테고리×채널 팀카테 실적에서 역산하고, 대응SKU는 어느 기간을 볼지만 정한다.
 * 변동비를 못 불러왔거나 원가가 없으면 공헌이익은 null — 대체값으로 계산하지 않는다.
 */
import { CHANNELS, getDisabledChannels, getReleaseMonth, getSkuMonths, isSeasonOnly, type Channel, type Month, type SkuData } from '../types';
import { coverage, type Coverage } from './qtyPlan';
import { PRICING_DEFAULT_OPT } from './pricingScenarios';

/** 팀카테에 그 카테고리×채널 데이터가 없을 때만 쓰는 값 (쓰면 경고로 표시) */
export const VAR_COST_DEFAULT = 0.25;

export type VarCostResults = Record<string, { ratio: number; isFallback: boolean }>;
export type VarCostSource = 'team' | 'period' | 'default' | 'none';
export type MoneyBasis = 'season' | 'order';
export type Pricer = (optId: string, base: number) => number;

/** results가 null이면 변동비를 못 불러온 상태 */
export function varCostOf(results: VarCostResults | null, channel: string): { ratio: number | null; source: VarCostSource } {
  if (!results) return { ratio: null, source: 'none' };
  const r = results[channel];
  if (!r) return { ratio: VAR_COST_DEFAULT, source: 'default' };
  return { ratio: r.ratio, source: r.isFallback ? 'period' : 'team' };
}

/** 한 칸(채널×월)의 순매출 · 공헌이익. 반올림은 표시할 때만 한다 */
export function cellMoney(price: number, qty: number, cost: number, varRatio: number | null): { revenue: number; profit: number | null } {
  const revenue = (price / 1.1) * qty;
  return { revenue, profit: varRatio === null || !cost ? null : revenue * (1 - varRatio) - cost * qty };
}

export function cmOf(revenue: number, profit: number | null): number | null {
  return profit !== null && revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null;
}

export const qtyOf = (sku: Pick<SkuData, 'channelMonthQty'>, channel: Channel, month: Month): number =>
  sku.channelMonthQty.find((e) => e.channel === channel && e.month === month)?.qty ?? 0;

export const basePriceOf = (sku: Pick<SkuData, 'channelPricing' | 'price'>, channel: Channel): number => {
  const cp = sku.channelPricing?.find((p) => p.channel === channel);
  return cp && cp.price > 0 ? cp.price : sku.price;
};

export const priceOptOf = (sku: Pick<SkuData, 'pricingOpts'>, channel: Channel, month: Month): string =>
  sku.pricingOpts?.[`${channel}-${month}`] ?? PRICING_DEFAULT_OPT[channel] ?? '';

/** 판매 월의 연월 키 — channelMonthQty에는 연도가 없어서 출시일로 계산한다 */
export function yearMonthKey(sku: Pick<SkuData, 'releaseDate'>, month: Month): string {
  const rm = getReleaseMonth(sku.releaseDate ?? '') ?? 7;
  const ry = sku.releaseDate ? parseInt(sku.releaseDate.split('-')[0], 10) : 2026;
  return `${month < rm ? ry + 1 : ry}-${String(month).padStart(2, '0')}`;
}

export interface ChannelMoney {
  channel: Channel;
  planQty: number;
  soldQty: number;
  /** 판매 목표 기준 채널 비중(%) */
  share: number;
  /** 수량 가중 실매출단가 */
  netPrice: number;
  /** 전 월 같은 선택지면 그 값, 월별로 다르면 null */
  opt: string | null;
  revenue: number;
  profit: number | null;
  cm: number | null;
  varRatio: number | null;
  varSource: VarCostSource;
}

export interface MonthMoney { month: Month; ym: string; plan: number; sold: number; revenue: number; profit: number | null }

export interface SkuMoney {
  months: MonthMoney[];
  channels: ChannelMoney[];
  marketingCost: number;
  planQty: number;
  soldQty: number;
  revenue: number;
  profit: number | null;
  cm: number | null;
  coverage: Coverage;
  /** 발주금액 (원가 없으면 null) */
  orderAmount: number | null;
  reorderQty: number;
  /** 시즌 후 잔여 재고금액 (원가 없으면 null) */
  leftoverAmount: number | null;
}

/**
 * basis — season: 판매 목표 전체(리오더 포함, 기존 카드 기준) · order: 이번 발주량까지만 판매한다고 보고 계산.
 * 잔여 재고는 공헌이익에 넣지 않고 별도 금액으로 돌려준다.
 */
export function skuMoney(sku: SkuData, opts: { pricer: Pricer; varCost: VarCostResults | null; basis?: MoneyBasis }): SkuMoney {
  const basis = opts.basis ?? 'season';
  const months = getSkuMonths(sku.releaseDate);
  const off = getDisabledChannels(sku) as readonly string[];
  const channels = CHANNELS.filter((c) => !off.includes(c));
  const mkt = (m: Month) => sku.marketingMonthQty?.[m] ?? 0;
  const plans = months.map((m) => channels.reduce((a, c) => a + qtyOf(sku, c, m), 0) + mkt(m));

  // 월별 판매 비율 — order 기준이면 누적이 발주량에 닿는 달부터 줄어든다
  let remaining = sku.totalOrderQty;
  const soldRatio = plans.map((p) => {
    if (basis === 'season' || p === 0) return 1;
    const sold = Math.min(p, Math.max(0, remaining));
    remaining -= p;
    return sold / p;
  });

  const monthRows: MonthMoney[] = months.map((month, i) => ({ month, ym: yearMonthKey(sku, month), plan: plans[i], sold: plans[i] * soldRatio[i], revenue: 0, profit: 0 }));
  const planChannelTotal = channels.reduce((a, c) => a + months.reduce((x, m) => x + qtyOf(sku, c, m), 0), 0);

  const channelRows: ChannelMoney[] = channels.map((channel) => {
    const v = varCostOf(opts.varCost, channel);
    const base = basePriceOf(sku, channel);
    let planQty = 0, soldQty = 0, revenue = 0, grossSum = 0;
    let profit: number | null = 0;
    const optSet = new Set<string>();
    months.forEach((m, i) => {
      const q = qtyOf(sku, channel, m);
      const opt = priceOptOf(sku, channel, m);
      optSet.add(opt);
      const price = opts.pricer(opt, base);
      const sold = q * soldRatio[i];
      const cell = cellMoney(price, sold, sku.cost, v.ratio);
      planQty += q; soldQty += sold; revenue += cell.revenue; grossSum += price * sold;
      profit = profit === null || cell.profit === null ? null : profit + cell.profit;
      monthRows[i].revenue += cell.revenue;
      monthRows[i].profit = monthRows[i].profit === null || cell.profit === null ? null : monthRows[i].profit! + cell.profit;
    });
    return {
      channel, planQty, soldQty,
      share: planChannelTotal > 0 ? (planQty / planChannelTotal) * 100 : 0,
      netPrice: soldQty > 0 ? Math.round(grossSum / soldQty) : opts.pricer(optSet.size === 1 ? [...optSet][0] : '', base),
      opt: optSet.size === 1 ? [...optSet][0] : null,
      revenue, profit, cm: cmOf(revenue, profit),
      varRatio: v.ratio, varSource: v.source,
    };
  });

  // 마케팅은 매출 없이 원가만 차감
  let marketingCost = 0;
  months.forEach((m, i) => {
    const c = sku.cost * mkt(m) * soldRatio[i];
    marketingCost += c;
    if (monthRows[i].profit !== null) monthRows[i].profit! -= c;
  });

  const revenue = channelRows.reduce((a, c) => a + c.revenue, 0);
  const profit = channelRows.some((c) => c.profit === null)
    ? null
    : channelRows.reduce((a, c) => a + (c.profit as number), 0) - marketingCost;
  const cov = coverage(plans, sku.totalOrderQty, isSeasonOnly(sku));
  const planQty = plans.reduce((a, b) => a + b, 0);
  const soldQty = monthRows.reduce((a, b) => a + b.sold, 0);
  return {
    months: monthRows, channels: channelRows, marketingCost, planQty, soldQty, revenue, profit, cm: cmOf(revenue, profit),
    coverage: cov,
    orderAmount: sku.cost ? sku.totalOrderQty * sku.cost : null,
    reorderQty: Math.max(0, cov.diff),
    leftoverAmount: sku.cost ? Math.max(0, sku.totalOrderQty - (basis === 'order' ? soldQty : planQty)) * sku.cost : null,
  };
}
