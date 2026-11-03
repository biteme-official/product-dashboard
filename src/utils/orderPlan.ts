/**
 * 발주량 검토 1안 · 2안.
 * 앱의 수량 필드(totalOrderQty · channelMonthQty 등)가 언제나 지금 고른 안이고, 고르지 않은 안 하나만 orderPlans.other에 보관한다.
 * 안을 바꾸면 현재 값을 보관하고 보관된 값을 불러온다 — 별도 시나리오 계산 없이 모든 화면이 같은 값을 본다.
 */
import { getConfirmedChannels, getDisabledChannels, isMarketingLocked, type ChannelMonthQtyEntry, type OrderPlanSnapshot, type SkuData } from '../types';
import { allocate } from './qtyPlan';
import { recalcQuantities } from './calc';

export const planSnapshot = (sku: SkuData): OrderPlanSnapshot => ({
  totalOrderQty: sku.totalOrderQty,
  channelMonthQty: sku.channelMonthQty,
  marketingMonthQty: sku.marketingMonthQty ?? {},
  pricingOpts: sku.pricingOpts ?? {},
  optionQty: optionEntries(sku),
});

/** 옵션 수기 수량(메타 키 제외) */
function optionEntries(sku: SkuData): { key: string; qty: number }[] {
  return Object.entries(sku.finalOrderQty ?? {})
    .filter(([k]) => !k.startsWith('__'))
    .map(([key, qty]) => ({ key, qty }));
}

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

/**
 * 발주량 변경 + 판매 목표 연동 — 기존 입력 수량의 월별 · 채널별 비중을 유지한 채 같은 비율로 조정.
 * 확정 채널 · 비운영 채널 · 확정 그룹의 마케팅은 그대로. 판매 목표가 비어 있거나 이전 발주량이 0이면 발주량만 변경.
 * 한 번의 저장으로 함께 쓰도록 patch 하나로 돌려준다.
 */
export function withOrderQtyScaled(sku: SkuData, qty: number): Partial<SkuData> | null {
  const patch = withOrderQty(sku, qty);
  if (!patch) return null;
  const next = patch.totalOrderQty ?? 0;
  const old = sku.totalOrderQty;
  if (old <= 0 || next === old) return patch;
  const k = next / old;
  const fixed = new Set<string>([...getConfirmedChannels(sku), ...getDisabledChannels(sku)]);
  const byMonth = new Map<number, ChannelMonthQtyEntry[]>();
  sku.channelMonthQty.forEach((e) => {
    if (fixed.has(e.channel)) return;
    byMonth.set(e.month, [...(byMonth.get(e.month) ?? []), e]);
  });
  const scaled = new Map<string, number>();
  byMonth.forEach((cells, month) => {
    const cur = cells.map((c) => c.qty);
    const total = cur.reduce((a, b) => a + b, 0);
    if (total <= 0) return;
    allocate(Math.round(total * k), cur).forEach((q, i) => scaled.set(`${cells[i].channel}|${month}`, q));
  });
  if (scaled.size > 0) {
    patch.channelMonthQty = sku.channelMonthQty.map((e) => {
      const q = scaled.get(`${e.channel}|${e.month}`);
      return q === undefined ? e : { ...e, qty: q };
    });
  }
  const mkt = sku.marketingMonthQty ?? {};
  if (!isMarketingLocked(sku) && Object.values(mkt).some((v) => v > 0)) {
    patch.marketingMonthQty = Object.fromEntries(Object.entries(mkt).map(([m, v]) => [m, Math.round(v * k)]));
  }
  return patch;
}

/**
 * 옵션 수기 수정 — 옵션 합계가 곧 발주량이고, 합계가 바뀌면 판매 목표도 같은 비율로 조정.
 * key는 finalOrder의 csKey · cKey · sKey 형식. 컬러 수량도 수기 합계로 맞춘다.
 */
export function withOptionQty(sku: SkuData, rows: { key: string; qty: number }[]): Partial<SkuData> | null {
  const clean = rows.map((r) => ({ key: r.key, qty: Math.max(0, Math.round(r.qty)) }));
  const total = clean.reduce((a, r) => a + r.qty, 0);
  const patch = sku.hasColors && sku.colors.every((c) => c.archived || c.quantity <= 0)
    ? { totalOrderQty: total, sizes: recalcQuantities(sku.sizes, total) } as Partial<SkuData>
    : withOrderQtyScaled(sku, total);
  if (!patch) return null;
  patch.finalOrderQty = Object.fromEntries(clean.map((r) => [r.key, r.qty]));
  if (sku.hasColors) {
    const byColor = new Map<string, number>();
    clean.forEach(({ key, qty }) => {
      const [kind, cid] = key.split('|');
      if (kind === 'cs' || kind === 'c') byColor.set(cid, (byColor.get(cid) ?? 0) + qty);
    });
    if (byColor.size > 0) patch.colors = sku.colors.map((c) => (byColor.has(c.id) ? { ...c, quantity: byColor.get(c.id)! } : c));
  }
  return patch;
}

/** 컬러 수량 수정 — 컬러 합계가 곧 발주량. 옵션 수기값은 비우고 비율대로 다시 계산 */
export function withColorQty(sku: SkuData, colorId: string, qty: number): Partial<SkuData> | null {
  const colors = sku.colors.map((c) => (c.id === colorId ? { ...c, quantity: Math.max(0, Math.round(qty)) } : c));
  const total = colors.filter((c) => !c.archived).reduce((a, c) => a + c.quantity, 0);
  const patch = withOrderQtyScaled({ ...sku, colors }, total) ?? { totalOrderQty: total, sizes: recalcQuantities(sku.sizes, total) };
  return { ...patch, colors, finalOrderQty: {}, step2OptionQty: {} };
}

/** 사이즈 비중 수정 — 발주량 · 판매 목표는 그대로, 옵션 수기값은 비우고 비율대로 다시 계산 */
export function withSizeRatio(sku: SkuData, label: string, ratio: number): Partial<SkuData> {
  const sizes = sku.sizes.map((z) => (z.label === label ? { ...z, ratio: Math.max(0, ratio) } : z));
  return { sizes: recalcQuantities(sizes, sku.totalOrderQty), finalOrderQty: {}, step2OptionQty: {} };
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
    finalOrderQty: Object.fromEntries((target.optionQty ?? []).map((o) => [o.key, o.qty])),
    orderPlans: { active: cur === 1 ? 2 : 1, other: saved, decided: true },
  };
}
