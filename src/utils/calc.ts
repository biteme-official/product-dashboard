import type { SizeRatio, Category, Channel, ChannelRatio } from '../types';
import { SIZE_LABELS, MAX_SIZES, B2C_CHANNELS } from '../types';

const CHANNEL_B2C_RATIO: Record<Category, number> = {
  '의류': 0.60,
  '용품': 0.55,
  '잡화': 0.65,
  '장난감': 0.35,
  '식품': 0.65,
};

export const B2C_RATE = 0.75; // B2C 실질 판매가 = 판매가 × 75%
export const B2B_RATE = 0.55; // B2B 실질 판매가 = 판매가 × 55%

/** 채널이 B2C이면 0.75, B2B이면 0.55 반환 */
export function getChannelRate(channel: Channel): number {
  return B2C_CHANNELS.includes(channel) ? B2C_RATE : B2B_RATE;
}

/**
 * SKU의 channelRatios 기반 동적 multiplier.
 * B2C 채널 비중 합 / 전체 합 × B2C_RATE + 나머지 × B2B_RATE.
 * 합계가 0이면 null 반환 → 호출부에서 fallback(카테고리 고정값) 사용.
 */
export function calcDynamicMultiplier(channelRatios: ChannelRatio[]): number | null {
  const total = channelRatios.reduce((sum, cr) => sum + cr.ratio, 0);
  if (total === 0) return null;
  const b2cSum = channelRatios
    .filter((cr) => B2C_CHANNELS.includes(cr.channel))
    .reduce((sum, cr) => sum + cr.ratio, 0);
  return (b2cSum / total) * B2C_RATE + ((total - b2cSum) / total) * B2B_RATE;
}

/** 카테고리별 예상 매출 계수 (fallback — channelRatios 합이 0일 때 사용) */
export function revenueMultiplier(category: Category): number {
  const b2c = CHANNEL_B2C_RATIO[category] ?? 0.50;
  return b2c * B2C_RATE + (1 - b2c) * B2B_RATE;
}

export function buildSizesFromCount(
  currentSizes: SizeRatio[],
  newCount: number,
  totalOrderQty: number,
): SizeRatio[] {
  const labels = SIZE_LABELS[newCount];
  const raw = Array.from({ length: MAX_SIZES }, (_, i) => ({
    label: i < newCount ? labels[i] : '-',
    ratio: i < newCount ? (currentSizes[i]?.ratio ?? 0) : 0,
    quantity: 0,
    isActive: i < newCount,
  }));
  return recalcQuantities(raw, totalOrderQty);
}

export function recalcQuantities(sizes: SizeRatio[], totalOrderQty: number): SizeRatio[] {
  const sumRatios = sizes.filter((s) => s.isActive).reduce((sum, s) => sum + s.ratio, 0);
  return sizes.map((s) => ({
    ...s,
    quantity:
      s.isActive && sumRatios > 0 ? Math.round((totalOrderQty * s.ratio) / sumRatios) : 0,
  }));
}

export function calcGrowthRate(newVal: number, oldVal: number): number | null {
  if (!oldVal || oldVal === 0) return null;
  return ((newVal - oldVal) / oldVal) * 100;
}

export function formatKRW(value: number): string {
  return `₩${Math.round(value).toLocaleString()}`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString();
}
