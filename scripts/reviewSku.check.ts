/**
 * src/utils/reviewSku.ts 검증 (npm run check:review)
 */
import assert from 'node:assert/strict';
import { cellMoney, cmOf, skuMoney, varCostOf, yearMonthKey, VAR_COST_DEFAULT, type VarCostResults } from '../src/utils/reviewSku.ts';
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
console.log(`reviewSku: ${passed}개 통과`);
