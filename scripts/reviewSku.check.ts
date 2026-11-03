/**
 * src/utils/reviewSku.ts 검증 (npm run check:review)
 */
import assert from 'node:assert/strict';
import { cellMoney, cmOf, skuMoney, varCostOf, yearMonthKey, VAR_COST_DEFAULT, type VarCostResults } from '../src/utils/reviewSku.ts';
import { orderForCover, savePlanPatch, switchPlanPatch, withOrderQty } from '../src/utils/orderPlan.ts';
import { finalOrderForConfirm, finalOrderModel } from '../src/utils/finalOrder.ts';
import { isKnownStep1Opt, step1Pricer } from '../src/utils/step1Price.ts';
import { DEFAULT_PRICING_POLICY } from '../src/utils/pricingV2.ts';
import type { SkuData } from '../src/types/index.ts';

let passed = 0;
function test(name: string, fn: () => void) { fn(); passed++; console.log('  ✓', name); }
const near = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a - b) < 1e-6, `${a} ≠ ${b}`);

const months = [11, 12, 1, 2, 3, 4, 5, 6];
function sku(p: Partial<SkuData> = {}, q: Record<string, number[]> = { 자사몰: [100, 100, 0, 0, 0, 0, 0, 0], B2B: [100, 0, 0, 0, 0, 0, 0, 0] }): SkuData {
  return {
    id: 'a', category: '용품', releaseDate: '2026-11-02', price: 11000, cost: 2000, totalOrderQty: 300, skuType: '미해당',
    channelPricing: [], pricingOpts: {}, marketingMonthQty: {}, disabledChannels: [], coupangEnabled: false,
    channelMonthQty: Object.entries(q).flatMap(([channel, arr]) => arr.map((qty, i) => ({ channel, month: months[i], qty }))),
    ...p,
  } as unknown as SkuData;
}
const vc: VarCostResults = { 자사몰: { ratio: 0.3, isFallback: false }, B2B: { ratio: 0.1, isFallback: true } };
const pricer = (_o: string, b: number) => b;

test('칸 공식: 순매출 = 가격/1.1×수량, 공헌이익 = 순매출×(1−변동비) − 원가×수량', () => {
  const c = cellMoney(11000, 10, 2000, 0.3);
  near(c.revenue, 100000); near(c.profit, 50000);
});
test('변동비 못 불러오면 공헌이익 null, 25%로 계산하지 않음', () => {
  assert.equal(cellMoney(11000, 10, 2000, null).profit, null);
  assert.equal(varCostOf(null, '자사몰').ratio, null);
  const m = skuMoney(sku(), { pricer, varCost: null });
  assert.equal(m.profit, null); assert.equal(m.cm, null); assert.ok(m.revenue > 0);
});
test('원가 0이면 공헌이익 · 금액 null', () => {
  const m = skuMoney(sku({ cost: 0 }), { pricer, varCost: vc });
  assert.equal(m.profit, null); assert.equal(m.orderAmount, null); assert.equal(m.leftoverAmount, null);
});
test('데이터 없는 채널만 25% 대체 + 출처 표시, 기간 대체도 표시', () => {
  assert.deepEqual(varCostOf(vc, '스스'), { ratio: VAR_COST_DEFAULT, source: 'default' });
  assert.equal(varCostOf(vc, 'B2B').source, 'period');
  assert.equal(varCostOf(vc, '자사몰').source, 'team');
});
test('season: 합계가 채널 합과 같고 마케팅 원가 차감', () => {
  const m = skuMoney(sku({ marketingMonthQty: { 11: 10 } }), { pricer, varCost: vc });
  near(m.revenue, 300 * 10000);
  near(m.profit, 200 * 10000 * 0.7 - 200 * 2000 + 100 * 10000 * 0.9 - 100 * 2000 - 10 * 2000);
  near(m.marketingCost, 20000);
  assert.equal(m.channels.find((c) => c.channel === '자사몰')!.share.toFixed(1), '66.7');
});
test('season: 발주량이 바뀌어도 금액 그대로 (기존 카드 기준)', () => {
  const a = skuMoney(sku({ totalOrderQty: 300 }), { pricer, varCost: vc });
  const b = skuMoney(sku({ totalOrderQty: 100 }), { pricer, varCost: vc });
  assert.equal(a.revenue, b.revenue); assert.equal(a.profit, b.profit);
});
test('order: 누적이 발주량에 닿는 달부터 판매 제외', () => {
  const m = skuMoney(sku({ totalOrderQty: 250 }), { pricer, varCost: vc, basis: 'order' });
  // 11월 200개 전부 + 12월 100개 중 50개
  near(m.soldQty, 250); assert.equal(m.months[0].sold, 200); assert.equal(m.months[1].sold, 50);
  near(m.revenue, 250 * 10000);
  assert.equal(m.reorderQty, 50); assert.equal(m.coverage.status, 'reorder');
});
test('order: 발주량 > 판매 목표면 잔여 재고금액', () => {
  const m = skuMoney(sku({ totalOrderQty: 500 }), { pricer, varCost: vc, basis: 'order' });
  near(m.soldQty, 300); near(m.leftoverAmount, 200 * 2000); near(m.orderAmount, 500 * 2000);
  assert.equal(m.coverage.status, 'leftover');
});
test('월별 합 = 전체 합 (마케팅 포함)', () => {
  const m = skuMoney(sku({ marketingMonthQty: { 12: 5 } }), { pricer, varCost: vc });
  near(m.months.reduce((a, x) => a + x.profit!, 0), m.profit!);
  near(m.months.reduce((a, x) => a + x.revenue, 0), m.revenue);
});
test('비운영 채널은 집계 제외', () => {
  const m = skuMoney(sku({ disabledChannels: ['글로벌'] }, { 자사몰: [10, 0, 0, 0, 0, 0, 0, 0], 글로벌: [99, 0, 0, 0, 0, 0, 0, 0] }), { pricer, varCost: vc });
  assert.equal(m.planQty, 10);
});
test('해 넘어가는 달의 연월 키', () => {
  assert.equal(yearMonthKey({ releaseDate: '2026-11-02' }, 12), '2026-12');
  assert.equal(yearMonthKey({ releaseDate: '2026-11-02' }, 2), '2027-02');
});
test('CM% 반올림', () => { assert.equal(cmOf(1000, 333), 33.3); assert.equal(cmOf(0, 0), null); assert.equal(cmOf(10, null), null); });

// ── 1안 · 2안 ──
const sizes = [{ label: 'S', ratio: 40, quantity: 0, isActive: true }, { label: 'M', ratio: 60, quantity: 0, isActive: true }];
const planSku = (p: Partial<SkuData> = {}) => sku({ sizes, moq: 100, hasColors: false, colors: [], pricingOpts: { '자사몰-11': '오픈특가' }, marketingMonthQty: { 11: 5 }, ...p });
const apply = (s: SkuData, patch: Partial<SkuData>) => ({ ...s, ...patch });

test('처음 2안: 현재 값 복사, 수량 그대로', () => {
  const s = planSku();
  const n = apply(s, switchPlanPatch(s));
  assert.equal(n.orderPlans!.active, 2); assert.equal(n.orderPlans!.decided, true);
  assert.equal(n.totalOrderQty, 300); assert.deepEqual(n.orderPlans!.other!.channelMonthQty, s.channelMonthQty);
});
test('2안 수정 후 왕복해도 양쪽 값 유지', () => {
  const s = planSku();
  let n = apply(s, switchPlanPatch(s));
  n = apply(n, { ...withOrderQty(n, 500)!, channelMonthQty: n.channelMonthQty.map((e) => (e.channel === '자사몰' && e.month === 11 ? { ...e, qty: 999 } : e)), pricingOpts: { '자사몰-11': '할인 10%' } });
  const back = apply(n, switchPlanPatch(n));
  assert.equal(back.orderPlans!.active, 1); assert.equal(back.totalOrderQty, 300);
  assert.equal(back.channelMonthQty.find((e) => e.channel === '자사몰' && e.month === 11)!.qty, 100);
  assert.equal(back.pricingOpts['자사몰-11'], '오픈특가');
  const again = apply(back, switchPlanPatch(back));
  assert.equal(again.orderPlans!.active, 2); assert.equal(again.totalOrderQty, 500);
  assert.equal(again.channelMonthQty.find((e) => e.channel === '자사몰' && e.month === 11)!.qty, 999);
  assert.equal(again.pricingOpts['자사몰-11'], '할인 10%');
  assert.equal(again.sizes[0].quantity, 200); // 사이즈 수량도 재계산
});
test('확정 채널 · 마케팅은 전환해도 지금 값 유지, 비운영 채널은 0', () => {
  const s = planSku({ orderPlans: { active: 1, decided: true, other: {
    totalOrderQty: 700,
    channelMonthQty: [{ channel: '자사몰', month: 11, qty: 1 }, { channel: 'B2B', month: 11, qty: 2 }] as SkuData['channelMonthQty'],
    marketingMonthQty: { 11: 77 }, pricingOpts: { '자사몰-11': '할인 5%', 'B2B-11': '할인 5%' },
  } }, step2BrandConfirmed: true, step2PlatformConfirmed: true } as Partial<SkuData>);
  const n = apply(s, switchPlanPatch(s));
  const q = (c: string, m: number) => n.channelMonthQty.find((e) => e.channel === c && e.month === m)!.qty;
  assert.equal(q('자사몰', 11), 100); // 플랫폼 확정
  assert.equal(q('B2B', 11), 100); // 브랜드 확정
  assert.deepEqual(n.marketingMonthQty, { 11: 5 }); // 플랫폼 확정 = 마케팅 잠금
  assert.equal(n.pricingOpts['자사몰-11'], '오픈특가');
  assert.equal(n.totalOrderQty, 700);
});
test('같은 안 클릭은 저장 표시만', () => {
  const s = planSku();
  assert.deepEqual(savePlanPatch(s), { orderPlans: { active: 1, other: null, decided: true } });
});
test('컬러 SKU 발주량 변경: 비율대로 나누고 합계 일치, archived 유지, 수량 없으면 불가', () => {
  const colors = [{ id: 'a', name: 'A', quantity: 100 }, { id: 'b', name: 'B', quantity: 200 }, { id: 'x', name: 'X', quantity: 50, archived: true }];
  const p = withOrderQty(planSku({ hasColors: true, colors }), 1000)!;
  assert.deepEqual(p.colors!.map((c) => c.quantity), [333, 667, 50]);
  assert.equal(p.totalOrderQty, 1000);
  assert.equal(withOrderQty(planSku({ hasColors: true, colors: [{ id: 'a', name: 'A', quantity: 0 }] }), 10), null);
});
test('소진 목표: 누적, 10개 올림, MOQ 하한', () => {
  assert.equal(orderForCover([123, 456], 1, 100), 460);
  assert.equal(orderForCover([50], 0, 300), 300);
});
test('판매가 % 선택지: 10원 올림, 저장값 인식', () => {
  const pr = step1Pricer(sku({ brand: '바잇미', price: 12900 } as Partial<SkuData>), DEFAULT_PRICING_POLICY, { usd: 1400, jpy: 9 });
  assert.equal(pr('할인 5%', 12900), 12260); assert.equal(pr('할인 20%', 12900), 10320); assert.equal(pr('', 12900), 12900);
  assert.ok(isKnownStep1Opt('할인 15%')); assert.ok(isKnownStep1Opt('')); assert.ok(isKnownStep1Opt('신상위크')); assert.ok(!isKnownStep1Opt('없는값'));
});
test('최종 발주량: 사이즈 비율 합계, 수기값 보존, 확정 시 STEP2 합계 기록', () => {
  const s = planSku({ totalOrderQty: 1000 });
  const m = finalOrderModel(s)!;
  assert.deepEqual(m.rows.map((r) => r.qty), [400, 600]);
  assert.deepEqual(finalOrderForConfirm(s, m), { 's|S': 400, 's|M': 600, __confirmedStep2Total__: 300 });
  const manual = planSku({ totalOrderQty: 1000, finalOrderQty: { 's|S': 1, 's|M': 2 } });
  assert.deepEqual(finalOrderForConfirm(manual, finalOrderModel(manual)!), { 's|S': 1, 's|M': 2, __confirmedStep2Total__: 300 });
  assert.equal(finalOrderModel(planSku({ totalOrderQty: 0, channelMonthQty: [] })), null);
});
console.log(`reviewSku: ${passed}개 통과`);
