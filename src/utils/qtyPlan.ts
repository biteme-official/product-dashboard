/**
 * 수량 분배(STEP1 월 계획 + STEP2 채널×월 목표량) 계산 — 순수 함수 모음.
 *
 * 원칙
 * - 채널×월 수량(channelMonthQty)이 유일한 원본. 월 비중·채널 비중은 여기서 계산되는 값이자 조정 손잡이.
 * - 월 비중(%) = 월 합계(채널 + 마케팅) ÷ 이번 발주량. 리오더 계획이면 합이 100%를 넘을 수 있다.
 * - 채널 비중(%) = 채널 합계 ÷ 채널 전체 합계 (마케팅 제외).
 * - 확정(잠금) 채널 칸은 어떤 조정에서도 움직이지 않는다. 비운영 채널은 항상 0.
 * - 모든 배분은 합계를 보존하는 정수 배분(최대 나머지 방식).
 *
 * 런타임 import 없이 유지 — `node scripts/qtyPlan.check.ts`로 바로 검증한다.
 */

export interface QtyEntry<C extends string = string, M extends number = number> {
  channel: C;
  month: M;
  qty: number;
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** total을 weights 비율로 정수 배분 (합계 보존). 가중치가 전부 0이면 균등 배분. */
export function allocate(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const t = Math.max(0, Math.round(total));
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const base = sum(w) > 0 ? w : w.map(() => 1);
  const bs = sum(base);
  const raw = base.map((x) => (t * x) / bs);
  const out = raw.map(Math.floor);
  let rest = t - sum(out);
  const order = raw
    .map((x, i) => [x - Math.floor(x), i] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; rest > 0; k = (k + 1) % n, rest--) out[order[k][1]]++;
  return out;
}

export function getQty<C extends string, M extends number>(entries: QtyEntry<C, M>[], channel: C, month: M): number {
  return entries.find((e) => e.channel === channel && e.month === month)?.qty ?? 0;
}

/** channels × months 전체를 채운 새 배열 (없는 칸은 0) */
function normalize<C extends string, M extends number>(entries: QtyEntry<C, M>[], channels: readonly C[], months: readonly M[]): QtyEntry<C, M>[] {
  return channels.flatMap((channel) => months.map((month) => ({ channel, month, qty: getQty(entries, channel, month) })));
}

function setQty<C extends string, M extends number>(entries: QtyEntry<C, M>[], channel: C, month: M, qty: number) {
  const e = entries.find((x) => x.channel === channel && x.month === month);
  if (e) e.qty = qty;
}

export function channelMonthTotal<C extends string, M extends number>(entries: QtyEntry<C, M>[], channels: readonly C[], month: M): number {
  return sum(channels.map((c) => getQty(entries, c, month)));
}

export function channelTotal<C extends string, M extends number>(entries: QtyEntry<C, M>[], channel: C, months: readonly M[]): number {
  return sum(months.map((m) => getQty(entries, channel, m)));
}

export interface PlanScope<C extends string, M extends number> {
  /** 전체 채널 (비운영 포함) */
  channels: readonly C[];
  /** 출시월 기준 8개월 */
  months: readonly M[];
  /** 비운영 채널 — 항상 0 */
  disabled?: readonly C[];
  /** 확정(잠금) 채널 — 값 고정 */
  locked?: readonly C[];
  /** 월별 마케팅 수량 (월 합계에는 포함, 채널 비중에는 제외) */
  marketing?: Partial<Record<M, number>>;
  /** 칸이 모두 0일 때 쓸 채널 가중치 (대응SKU 비중 또는 기본 비중) */
  fallbackWeights?: Partial<Record<C, number>>;
}

function scopeParts<C extends string, M extends number>(s: PlanScope<C, M>) {
  const disabled = new Set<C>(s.disabled ?? []);
  const locked = new Set<C>((s.locked ?? []).filter((c) => !disabled.has(c)));
  const active = s.channels.filter((c) => !disabled.has(c));
  const open = active.filter((c) => !locked.has(c));
  const mkt = (m: M) => s.marketing?.[m] ?? 0;
  const fb = (cs: readonly C[]) => cs.map((c) => s.fallbackWeights?.[c] ?? 0);
  return { disabled, locked, active, open, mkt, fb };
}

/** 월 합계 = 채널 합계 + 마케팅 */
export function monthTotals<C extends string, M extends number>(entries: QtyEntry<C, M>[], s: PlanScope<C, M>): number[] {
  const { mkt } = scopeParts(s);
  return s.months.map((m) => channelMonthTotal(entries, s.channels, m) + mkt(m));
}

/** 월 비중(%) = 월 합계 ÷ 발주량 × 100 (소수 1자리) */
export function monthShares<C extends string, M extends number>(entries: QtyEntry<C, M>[], s: PlanScope<C, M>, orderQty: number): number[] {
  return monthTotals(entries, s).map((t) => (orderQty > 0 ? Math.round((t / orderQty) * 1000) / 10 : 0));
}

/** 채널 비중(%) — 운영 채널 기준, 마케팅 제외. 소수 계산값 그대로. */
export function channelShares<C extends string, M extends number>(entries: QtyEntry<C, M>[], s: PlanScope<C, M>): Record<C, number> {
  const { active } = scopeParts(s);
  const totals = active.map((c) => channelTotal(entries, c, s.months));
  const all = sum(totals);
  const out = {} as Record<C, number>;
  s.channels.forEach((c) => (out[c] = 0));
  active.forEach((c, i) => (out[c] = all > 0 ? (totals[i] / all) * 100 : 0));
  return out;
}

/**
 * 한 달의 월 합계(마케팅 포함)를 target으로 바꾼다.
 * 확정 채널과 마케팅은 그대로, 미확정 채널이 그 달 안의 현재 구성비대로 나눠 갖는다.
 * target이 고정분보다 작으면 미확정 채널은 0 (clamped=true).
 */
export function setMonthTotal<C extends string, M extends number>(
  entries: QtyEntry<C, M>[], s: PlanScope<C, M>, month: M, target: number,
): { entries: QtyEntry<C, M>[]; clamped: boolean } {
  const { locked, open, mkt, fb } = scopeParts(s);
  const next = normalize(entries, s.channels, s.months);
  const fixed = mkt(month) + sum([...locked].map((c) => getQty(next, c, month)));
  const rest = Math.max(0, Math.round(target) - fixed);
  const cur = open.map((c) => getQty(next, c, month));
  const col = allocate(rest, sum(cur) > 0 ? cur : fb(open));
  open.forEach((c, i) => setQty(next, c, month, col[i]));
  return { entries: next, clamped: Math.round(target) < fixed };
}

export interface ShareResolution<C extends string> {
  ok: boolean;
  /** 저장될 최종 비중 (운영 채널, 합 100) */
  shares: Record<C, number>;
  edited: C[];
  /** 남은 비중을 나눠 가질 미수정·미확정 채널 */
  absorbing: C[];
  /** 미수정 채널이 나눠 가질 비중(%) */
  rest: number;
  reason?: 'over100' | 'notHundred' | 'noChange';
  /** 수정 채널 + 확정 채널 비중 합 */
  fixedSum: number;
}

/**
 * [채널 비중 수정] 편집안을 최종 비중으로 확정한다.
 * - 수정한 채널: 입력값 · 확정 채널: 현재값 고정
 * - 나머지 채널: 남은 비중을 현재 비율대로 나눠 가짐
 */
export function resolveChannelShares<C extends string, M extends number>(
  entries: QtyEntry<C, M>[], s: PlanScope<C, M>, edits: Partial<Record<C, number>>,
): ShareResolution<C> {
  const { locked, active } = scopeParts(s);
  const cur = channelShares(entries, s);
  const edited = active.filter((c) => !locked.has(c) && edits[c] !== undefined);
  const absorbing = active.filter((c) => !locked.has(c) && edits[c] === undefined);
  const shares = {} as Record<C, number>;
  s.channels.forEach((c) => (shares[c] = 0));
  edited.forEach((c) => (shares[c] = Math.max(0, edits[c] as number)));
  locked.forEach((c) => (shares[c] = cur[c]));
  const fixedSum = sum([...edited, ...locked].map((c) => shares[c]));
  const rest = 100 - fixedSum;
  const base = { shares, edited, absorbing, rest: Math.max(0, rest), fixedSum };
  if (edited.length === 0) return { ...base, ok: false, reason: 'noChange' };
  if (rest < -0.05) return { ...base, ok: false, reason: 'over100' };
  if (absorbing.length === 0) {
    return Math.abs(rest) <= 0.05 ? { ...base, ok: true } : { ...base, ok: false, reason: 'notHundred' };
  }
  const w = absorbing.map((c) => cur[c]);
  const ws = sum(w);
  absorbing.forEach((c, i) => (shares[c] = ws > 0 ? (rest * w[i]) / ws : rest / absorbing.length));
  return { ...base, ok: true };
}

/**
 * 채널 비중을 적용한다. 월 합계(PM 월 계획)와 확정 채널 칸은 유지.
 * 미확정 채널에 대해 행 합계 = 목표 비중, 열 합계 = (월 채널 합계 − 확정분)을 동시에 맞추도록
 * 반복 비례 조정(RAS) 후 월별 정수 배분한다. 각 채널의 월별 모양은 최대한 유지된다.
 */
export function applyChannelShares<C extends string, M extends number>(
  entries: QtyEntry<C, M>[], s: PlanScope<C, M>, shares: Partial<Record<C, number>>,
): QtyEntry<C, M>[] {
  const { locked, active, open } = scopeParts(s);
  const next = normalize(entries, s.channels, s.months);
  const channelAll = sum(active.map((c) => channelTotal(next, c, s.months)));
  const colTarget = s.months.map((m) => channelMonthTotal(next, s.channels, m) - sum([...locked].map((c) => getQty(next, c, m))));
  const rowTarget = open.map((c) => (channelAll * (shares[c] ?? 0)) / 100);
  let X = open.map((c) => {
    const row = s.months.map((m) => getQty(next, c, m));
    // 수량이 없던 채널은 월 합계 모양에서 시작
    return sum(row) > 0 ? row : colTarget.map((q) => Math.max(q, 0));
  });
  for (let it = 0; it < 100; it++) {
    X = X.map((row, i) => {
      const rs = sum(row);
      return rs > 0 ? row.map((x) => (x * rowTarget[i]) / rs) : row;
    });
    s.months.forEach((_, mi) => {
      const cs = sum(X.map((r) => r[mi]));
      if (cs > 0) X.forEach((r) => (r[mi] = (r[mi] * colTarget[mi]) / cs));
    });
  }
  s.months.forEach((m, mi) => {
    const col = allocate(colTarget[mi], X.map((r) => r[mi]));
    open.forEach((c, i) => setQty(next, c, m, col[i]));
  });
  return next;
}

/**
 * 매달 월 합계를 유지한 채 채널을 weights(대응SKU 비중 등)로 다시 나눈다. 확정 채널 제외.
 * monthTargets를 주면 월 합계 대신 그 값(마케팅 포함)을 기준으로 채운다 — STEP2 최초 세팅용.
 */
export function redistributeByWeights<C extends string, M extends number>(
  entries: QtyEntry<C, M>[], s: PlanScope<C, M>, weights: Partial<Record<C, number>>, monthTargets?: number[],
): QtyEntry<C, M>[] {
  const { locked, open, disabled, mkt } = scopeParts(s);
  const next = normalize(entries, s.channels, s.months);
  const totals = monthTargets ?? monthTotals(next, s);
  s.months.forEach((m, mi) => {
    const fixed = mkt(m) + sum([...locked].map((c) => getQty(next, c, m)));
    const col = allocate(Math.max(0, totals[mi] - fixed), open.map((c) => weights[c] ?? 0));
    open.forEach((c, i) => setQty(next, c, m, col[i]));
  });
  disabled.forEach((c) => s.months.forEach((m) => setQty(next, c, m, 0)));
  return next;
}

/**
 * 미확정 채널 전체를 비례 조정해 채널 합계(마케팅 제외)를 target으로 맞춘다.
 * 월·채널 모양 유지. (시즌 한정 "판매 목표를 발주량에 맞추기", 전환 시 리오더 누락 SKU 확대에 사용)
 */
export function scaleOpenChannelsTo<C extends string, M extends number>(
  entries: QtyEntry<C, M>[], s: PlanScope<C, M>, target: number,
): QtyEntry<C, M>[] {
  const { locked, open } = scopeParts(s);
  const next = normalize(entries, s.channels, s.months);
  const fixed = sum([...locked].map((c) => channelTotal(next, c, s.months)));
  const cells = open.flatMap((c) => s.months.map((m) => ({ c, m, q: getQty(next, c, m) })));
  const out = allocate(Math.max(0, Math.round(target) - fixed), cells.map((x) => x.q));
  cells.forEach((x, i) => setQty(next, x.c, x.m, out[i]));
  return next;
}

export type CoverageStatus = 'match' | 'reorder' | 'stockout' | 'leftover' | 'overstock' | 'empty';

export interface Coverage {
  status: CoverageStatus;
  /** 판매 목표 합계 (마케팅 포함) */
  planTotal: number;
  /** planTotal − 발주량 */
  diff: number;
  /** 누적 판매 목표 */
  cumulative: number[];
  /** 누적이 발주량 이하인 마지막 달 인덱스 (-1: 첫 달부터 초과) */
  coverUntilIdx: number;
  /** 누적이 발주량을 처음 넘는 달 인덱스 (-1: 넘지 않음) */
  firstOverIdx: number;
}

/**
 * 이번 발주량 대비 시즌 판매 목표 판정.
 * seasonOnly(리오더 없음): 초과 → stockout(품절 위험), 부족 → overstock(과재고 위험)
 * 기본(리오더 가능): 초과 → reorder(리오더 시점 표시), 부족 → leftover(잔여 재고)
 */
export function coverage(monthTotalsArr: number[], orderQty: number, seasonOnly: boolean): Coverage {
  const planTotal = sum(monthTotalsArr);
  const cumulative: number[] = [];
  let acc = 0;
  let coverUntilIdx = -1;
  let firstOverIdx = -1;
  monthTotalsArr.forEach((q, i) => {
    acc += q;
    cumulative.push(acc);
    if (acc <= orderQty) coverUntilIdx = i;
    else if (firstOverIdx === -1) firstOverIdx = i;
  });
  const diff = planTotal - orderQty;
  let status: CoverageStatus;
  if (planTotal === 0 || orderQty <= 0) status = 'empty';
  else if (diff === 0) status = 'match';
  else if (diff > 0) status = seasonOnly ? 'stockout' : 'reorder';
  else status = seasonOnly ? 'overstock' : 'leftover';
  return { status, planTotal, diff, cumulative, coverUntilIdx, firstOverIdx };
}
