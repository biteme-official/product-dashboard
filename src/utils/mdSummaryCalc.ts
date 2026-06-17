import { MONTHS, CHANNELS, getReleaseMonth, simPosition } from '../types';
import type { SkuData, Channel, Month } from '../types';

export type MonthMetrics = { qty: number; revenue: number; profit: number };
export const ZERO_METRICS: MonthMetrics = { qty: 0, revenue: 0, profit: 0 };

const floor10 = (x: number) => Math.floor(x / 10) * 10;
const calcOpenSpecialPrice = (base: number) =>
  Math.floor((floor10(base * 0.80) - 901) / 1000) * 1000 + 900;

const SCENARIO_CALC: Record<string, (b: number) => number> = {
  '오픈특가':              (b) => calcOpenSpecialPrice(b),
  '신상위크':              (b) => { const op = calcOpenSpecialPrice(b); return op <= 10000 ? Math.floor(op * 0.95 / 10) * 10 : Math.max(0, op - 1000); },
  '라이브 할인':           (b) => { const op = calcOpenSpecialPrice(b); const sw = op <= 10000 ? Math.floor(op * 0.95 / 10) * 10 : Math.max(0, op - 1000); return Math.floor((sw - Math.min(Math.round(sw * 0.05), 1000)) / 10) * 10; },
  '선단독':                (b) => { const op = calcOpenSpecialPrice(b); return op <= 10000 ? Math.floor(op * 0.95 / 10) * 10 : Math.max(0, op - 1000); },
  '상시 최대할인율':       (b) => floor10(b * 0.85),
  '특가 최대할인율':       (b) => floor10(b * 0.80),
  '시즌오프(의류전용)':    (b) => floor10(b * 0.75),
  'B2B 오픈 할인':         (b) => floor10(b * 0.65 * 0.90),
  'B2B 상시 운영':         (b) => floor10(b * 0.65),
  '사입 공급가':           (b) => floor10(b * 0.50),
  '해외 공급가':           (b) => floor10(b * 0.50),
};

export const DEFAULT_CHANNEL_OPT: Partial<Record<Channel, string>> = {
  '쿠팡':      'B2B 상시 운영',
  'B2B':       'B2B 상시 운영',
  '사입및페어': 'B2B 상시 운영',
};

export function calcScenarioPrice(optId: string, base: number): number {
  if (!optId) return base;
  return SCENARIO_CALC[optId]?.(base) ?? base;
}

export function isMonthActive(sku: SkuData, month: Month): boolean {
  const releaseMonth = getReleaseMonth(sku.releaseDate);
  if (releaseMonth === null) return true;
  return simPosition(month) >= simPosition(releaseMonth);
}

export function calcChannelMonthMetrics(sku: SkuData, channel: Channel, month: Month): MonthMetrics {
  const qty = sku.channelMonthQty.find((e) => e.channel === channel && e.month === month)?.qty ?? 0;
  if (qty === 0) return ZERO_METRICS;
  const cp = sku.channelPricing?.find((p) => p.channel === channel);
  const effectivePrice = cp && cp.price > 0 ? cp.price : sku.price;
  const optId = sku.pricingOpts?.[`${channel}-${month}`] ?? DEFAULT_CHANNEL_OPT[channel] ?? '';
  const scenarioPrice = calcScenarioPrice(optId, effectivePrice);
  const revenue = Math.round((scenarioPrice / 1.1) * qty);
  const profit = Math.round(revenue * 0.75 - sku.cost * qty);
  return { qty, revenue, profit };
}

export function calcSkuChannelTotals(sku: SkuData, channel: Channel): MonthMetrics {
  return MONTHS.reduce((acc, m) => addMetrics(acc, calcChannelMonthMetrics(sku, channel, m)), ZERO_METRICS);
}

export function calcSkuAllChannelTotals(sku: SkuData): MonthMetrics & { cm: number | null } {
  const totals = [...CHANNELS].reduce(
    (acc, ch) => addMetrics(acc, calcSkuChannelTotals(sku, ch)),
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
