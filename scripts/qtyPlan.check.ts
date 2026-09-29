/**
 * src/utils/qtyPlan.ts 검증 — 테스트 프레임워크 없이 Node 타입 스트리핑으로 실행.
 *   node scripts/qtyPlan.check.ts
 */
import assert from 'node:assert/strict';
import {
  allocate, applyChannelShares, coverage, channelShares, channelTotal, getQty, monthShares, monthTotals,
  redistributeByWeights, resolveChannelShares, scaleOpenChannelsTo, setMonthTotal,
  type PlanScope, type QtyEntry,
} from '../src/utils/qtyPlan.ts';

type C = '자사몰' | '스스' | '위탁' | '쿠팡' | 'B2B' | '글로벌';
const CH: C[] = ['자사몰', '스스', '위탁', '쿠팡', 'B2B', '글로벌'];
const MONTHS = [10, 11, 12, 1, 2, 3, 4, 5];
const COMP: Record<C, number> = { '자사몰': 22, '스스': 33, '위탁': 6, '쿠팡': 10, 'B2B': 17, '글로벌': 12 };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log('  ✓', name);
}

// 발주 5,000 · 월 비중 합 160% (리오더 포함) · 쿠팡 비운영 · 11월 마케팅 50
const scope: PlanScope<C, number> = { channels: CH, months: MONTHS, disabled: ['쿠팡'], marketing: { 11: 50 }, fallbackWeights: COMP };
const plan = [1500, 1300, 1100, 900, 850, 800, 800, 750];
const empty: QtyEntry<C, number>[] = [];
const base = redistributeByWeights(empty, scope, COMP, plan);

test('allocate: 합계 보존 · 0 가중치는 균등', () => {
  for (const t of [0, 1, 7, 999, 12345]) assert.equal(sum(allocate(t, [3, 1, 0, 2.5])), t);
  assert.deepEqual(allocate(5, [0, 0, 0, 0, 0]), [1, 1, 1, 1, 1]);
  assert.deepEqual(allocate(10, [1, 1, 0]), [5, 5, 0]);
});

test('초기 세팅: 월 계획(마케팅 포함) 그대로 · 비운영 채널 0', () => {
  assert.deepEqual(monthTotals(base, scope), plan);
  assert.equal(channelTotal(base, '쿠팡', MONTHS), 0);
  assert.equal(monthShares(base, scope, 5000)[0], 30);
  assert.equal(sum(monthShares(base, scope, 5000)), 160);
});

test('월 합계 변경: 그 달만 바뀌고 채널 구성비 유지', () => {
  const { entries } = setMonthTotal(base, scope, 10, 2000);
  const t = monthTotals(entries, scope);
  assert.equal(t[0], 2000);
  assert.deepEqual(t.slice(1), plan.slice(1));
  const r0 = getQty(base, '스스', 10) / getQty(base, '자사몰', 10);
  const r1 = getQty(entries, '스스', 10) / getQty(entries, '자사몰', 10);
  assert.ok(Math.abs(r0 - r1) < 0.02);
});

test('월 합계 변경: 확정 채널·마케팅 고정, 고정분보다 작으면 clamp', () => {
  const s = { ...scope, locked: ['스스'] as C[] };
  const { entries, clamped } = setMonthTotal(base, s, 11, 900);
  assert.equal(getQty(entries, '스스', 11), getQty(base, '스스', 11));
  assert.equal(monthTotals(entries, s)[1], 900);
  assert.equal(clamped, false);
  const low = setMonthTotal(base, s, 11, 10);
  assert.equal(low.clamped, true);
  assert.equal(getQty(low.entries, '스스', 11), getQty(base, '스스', 11));
});

test('채널 비중 일괄: 수정 채널 정확 · 나머지 비율 배분 · 월 합계 유지', () => {
  const r = resolveChannelShares(base, scope, { '스스': 40, 'B2B': 12 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.absorbing, ['자사몰', '위탁', '글로벌']);
  assert.ok(Math.abs(sum(Object.values(r.shares)) - 100) < 1e-9);
  const next = applyChannelShares(base, scope, r.shares);
  assert.deepEqual(monthTotals(next, scope), plan);
  const sh = channelShares(next, scope);
  assert.ok(Math.abs(sh['스스'] - 40) < 0.1, `스스 ${sh['스스']}`);
  assert.ok(Math.abs(sh['B2B'] - 12) < 0.1, `B2B ${sh['B2B']}`);
  assert.equal(channelTotal(next, '쿠팡', MONTHS), 0);
});

test('채널 비중 일괄: 확정 채널 칸 고정', () => {
  const s = { ...scope, locked: ['자사몰'] as C[] };
  const r = resolveChannelShares(base, s, { '스스': 45 });
  const next = applyChannelShares(base, s, r.shares);
  MONTHS.forEach((m) => assert.equal(getQty(next, '자사몰', m), getQty(base, '자사몰', m)));
  assert.deepEqual(monthTotals(next, s), plan);
});

test('채널 비중 검증: 100% 초과 · 전부 수정했는데 100% 아님 · 변경 없음', () => {
  assert.equal(resolveChannelShares(base, scope, { '스스': 80, 'B2B': 30 }).reason, 'over100');
  assert.equal(resolveChannelShares(base, scope, { '자사몰': 20, '스스': 20, '위탁': 20, 'B2B': 20, '글로벌': 10 }).reason, 'notHundred');
  assert.equal(resolveChannelShares(base, scope, { '자사몰': 20, '스스': 20, '위탁': 20, 'B2B': 20, '글로벌': 20 }).ok, true);
  assert.equal(resolveChannelShares(base, scope, {}).reason, 'noChange');
  assert.equal(resolveChannelShares(base, scope, { '쿠팡': 10 }).reason, 'noChange');
});

test('대응SKU 다시 나누기: 월 합계 유지 · 확정 제외', () => {
  const edited = setMonthTotal(base, scope, 12, 1400).entries;
  const s = { ...scope, locked: ['위탁'] as C[] };
  const next = redistributeByWeights(edited, s, { '자사몰': 50, '스스': 50, 'B2B': 0, '글로벌': 0 });
  assert.deepEqual(monthTotals(next, s), monthTotals(edited, s));
  MONTHS.forEach((m) => assert.equal(getQty(next, '위탁', m), getQty(edited, '위탁', m)));
  assert.equal(channelTotal(next, 'B2B', MONTHS), 0);
});

test('비례 확대: 채널 합계를 목표로 · 모양 유지 · 확정 제외', () => {
  const s = { ...scope, locked: ['글로벌'] as C[] };
  const channelSum = (e: QtyEntry<C, number>[]) => sum(CH.map((c) => channelTotal(e, c, MONTHS)));
  const next = scaleOpenChannelsTo(base, s, 12000);
  assert.equal(channelSum(next), 12000);
  MONTHS.forEach((m) => assert.equal(getQty(next, '글로벌', m), getQty(base, '글로벌', m)));
  const ratio = getQty(next, '스스', 10) / getQty(base, '스스', 10);
  assert.ok(Math.abs(ratio - getQty(next, '자사몰', 1) / getQty(base, '자사몰', 1)) < 0.02);
});

test('커버 판정: 리오더 가능 / 시즌 한정', () => {
  const c = coverage(plan, 5000, false);
  assert.equal(c.status, 'reorder');
  assert.equal(c.diff, 3000);
  assert.equal(c.coverUntilIdx, 3); // 1월까지 누적 4,800
  assert.equal(c.firstOverIdx, 4); // 2월 5,650
  assert.equal(coverage(plan, 5000, true).status, 'stockout');
  assert.equal(coverage(plan, 9000, false).status, 'leftover');
  assert.equal(coverage(plan, 9000, true).status, 'overstock');
  assert.equal(coverage(plan, 8000, true).status, 'match');
  assert.equal(coverage([0, 0], 5000, false).status, 'empty');
  assert.equal(coverage([6000, 0], 5000, false).coverUntilIdx, -1);
});

console.log(`qtyPlan: ${passed}개 통과`);
