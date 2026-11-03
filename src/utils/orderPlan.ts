/**
 * 발주량 검토 1안 · 2안.
 * 앱의 수량 필드(totalOrderQty · channelMonthQty 등)가 언제나 지금 고른 안이고, 고르지 않은 안 하나만 orderPlans.other에 보관한다.
 * 안을 바꾸면 현재 값을 보관하고 보관된 값을 불러온다 — 별도 시나리오 계산 없이 모든 화면이 같은 값을 본다.
 */
import { getConfirmedChannels, getDisabledChannels, isMarketingLocked, type OrderPlanSnapshot, type SkuData } from '../types';
import { allocate } from './qtyPlan';
import { recalcQuantities } from './calc';

export const planSnapshot = (sku: SkuData): OrderPlanSnapshot => ({
  totalOrderQty: sku.totalOrderQty,
  channelMonthQty: sku.channelMonthQty,
  marketingMonthQty: sku.marketingMonthQty ?? {},
  pricingOpts: sku.pricingOpts ?? {},
});

/** 발주량 변경 — 컬러 SKU는 컬러 수량을 비율대로 조정(합계가 곧 발주량), 사이즈 수량도 재계산. 컬러 수량이 없으면 null */
export function withOrderQty(sku: SkuData, qty: number): Partial<SkuData> | null {
  const next = Math.max(0, Math.round(qty));
  const patch: Partial<SkuData> = { totalOrderQty: next, sizes: recalcQuantities(sku.sizes, next) };
  if (!sku.hasColors) return patch;
  const active = sku.colors.filter((c) => !c.archived);
  if (active.reduce((a, c) => a + c.quantity, 0) <= 0) return null;
  const out = allocate(next, active.map((c) => c.quantity));
  let i = 0;
  patch.colors = sku.colors.map((c) => (c.archived ? c : { ...c, quantity: out[i++] }));
  return patch;
}

/** 지금 안을 현재 상태로 저장(같은 안 클릭) */
export function savePlanPatch(sku: SkuData): Partial<SkuData> {
  return { orderPlans: { active: sku.orderPlans?.active ?? 1, other: sku.orderPlans?.other ?? null, decided: true } };
}

/**
 * 다른 안으로 전환 — 현재 값을 보관하고 보관된 안을 불러온다. 보관된 안이 없으면 현재 값 복사로 시작.
 * 확정 채널 · 확정 그룹의 마케팅은 지금 값 유지, 비운영 채널은 0.
 */
export function switchPlanPatch(sku: SkuData): Partial<SkuData> {
  const cur = sku.orderPlans?.active ?? 1;
  const saved = planSnapshot(sku);
  const target = sku.orderPlans?.other ?? saved;
  const locked = new Set<string>(getConfirmedChannels(sku));
  const off = new Set<string>(getDisabledChannels(sku));
  const qtyMap = new Map(target.channelMonthQty.map((e) => [`${e.channel}|${e.month}`, e.qty]));
  const channelMonthQty = sku.channelMonthQty.map((e) => {
    if (off.has(e.channel)) return { ...e, qty: 0 };
    if (locked.has(e.channel)) return e;
    return { ...e, qty: qtyMap.get(`${e.channel}|${e.month}`) ?? e.qty };
  });
  const lockedOpts = Object.entries(saved.pricingOpts).filter(([k]) => locked.has(k.split('-')[0]));
  return {
    ...(withOrderQty(sku, target.totalOrderQty) ?? { totalOrderQty: sku.totalOrderQty }),
    channelMonthQty,
    marketingMonthQty: isMarketingLocked(sku) ? saved.marketingMonthQty : target.marketingMonthQty,
    pricingOpts: { ...target.pricingOpts, ...Object.fromEntries(lockedOpts) },
    orderPlans: { active: cur === 1 ? 2 : 1, other: saved, decided: true },
  };
}

/** 소진 목표 — 그 달(개월차)까지의 누적 판매 목표를 발주량으로, 10개 단위 올림, MOQ 미만이면 MOQ */
export function orderForCover(cumulative: number[], monthIdx: number, moq: number): number {
  return Math.max(moq, Math.ceil((cumulative[monthIdx] ?? 0) / 10) * 10);
}
