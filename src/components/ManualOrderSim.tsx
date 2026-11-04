import { useState } from 'react';

/**
 * 메뉴얼 › 발주량 검토 연습 화면. 예시 데이터만 쓰고 운영 데이터에 저장하지 않는다.
 * 규칙은 utils/orderPlan.ts와 같다. 채널 3개 · 변동비율 25% 고정 · 마케팅 없음으로 단순화.
 */

const MONTHS = [4, 5, 6, 7, 8, 9, 10, 11];
const COMPARE = [120, 150, 170, 160, 120, 90, 70, 50];
const CHANNELS = ['자사몰', '스스', 'B2B'] as const;
type Ch = typeof CHANNELS[number];
const PRICE = 19900;
const COST = 6000;
const B2B_PRICE = 11000;
const MOQ = 500;
const PRICE_OPTS: [string, string, number][] = [['', '판매가', 0], ['-5', '할인 5%', 5], ['-10', '할인 10%', 10], ['-15', '할인 15%', 15], ['-20', '할인 20%', 20]];
const SIZE_KEYS = ['S', 'M', 'L'] as const;
type SizeKey = typeof SIZE_KEYS[number];

interface Plan { qty: number; ch: Record<Ch, number[]>; opt: string; manual: Record<SizeKey, number> | null }
interface Sim {
  plans: { 1: Plan; 2: Plan | null };
  active: 1 | 2;
  decided: boolean;
  confirmed: boolean;
  basis: 'order' | 'season';
  season: boolean;
  tab: 'plan' | 'ch' | 'opt' | 'price';
  sizes: Record<SizeKey, number>;
  manualOpen: boolean;
  log: string;
  done: Record<string, boolean>;
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const n = (v: number) => Math.round(v).toLocaleString('ko-KR');
function won(v: number): string {
  if (v === 0) return '0';
  const a = Math.abs(v);
  return `${v < 0 ? '−' : ''}${a >= 1e8 ? `${(a / 1e8).toFixed(1)}억` : `${Math.round(a / 1e4).toLocaleString()}만`}`;
}
/** 합계를 비중대로 나누고 나머지는 큰 소수점부터 1씩 */
function alloc(total: number, weights: number[]): number[] {
  const ws = sum(weights) > 0 ? weights : weights.map(() => 1);
  const s = sum(ws);
  const raw = ws.map((w) => (total * w) / s);
  const out = raw.map(Math.floor);
  let left = total - sum(out);
  raw.map((r, i) => [r - out[i], i] as const).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { out[i] += 1; left -= 1; } });
  return out;
}
function fresh(): Sim {
  const ch: Record<Ch, number[]> = { 자사몰: [], 스스: [], B2B: [] };
  [130, 160, 180, 170, 130, 100, 80, 50].forEach((t) => {
    const p = alloc(t, [30, 50, 20]);
    CHANNELS.forEach((c, i) => ch[c].push(p[i]));
  });
  return {
    plans: { 1: { qty: 1000, ch, opt: '', manual: null }, 2: null },
    active: 1, decided: false, confirmed: false, basis: 'order', season: false, tab: 'plan',
    sizes: { S: 30, M: 40, L: 30 }, manualOpen: false, log: '', done: {},
  };
}
const planMonths = (p: Plan) => MONTHS.map((_, i) => sum(CHANNELS.map((c) => p.ch[c][i])));
const discounted = (pct: number) => Math.ceil((PRICE * (1 - pct / 100)) / 10) * 10;
function priceOf(c: Ch, p: Plan): number {
  if (c === 'B2B') return B2B_PRICE;
  return discounted(PRICE_OPTS.find((o) => o[0] === p.opt)?.[2] ?? 0);
}
function money(p: Plan, basis: Sim['basis']) {
  const pm = planMonths(p);
  const total = sum(pm);
  let rem = p.qty;
  let rev = 0;
  let sold = 0;
  let c = 0;
  const cum: number[] = [];
  pm.forEach((m, i) => {
    c += m;
    cum.push(c);
    const s = basis === 'order' ? Math.min(m, Math.max(rem, 0)) : m;
    rem -= m;
    if (m > 0) {
      CHANNELS.forEach((k) => { rev += (((s * p.ch[k][i]) / m) * priceOf(k, p)) / 1.1; });
      sold += s;
    }
  });
  const profit = rev * 0.75 - COST * sold;
  return {
    total, cum, rev, profit, cm: rev > 0 ? (profit / rev) * 100 : 0, amount: p.qty * COST,
    reorder: Math.max(total - p.qty, 0), left: Math.max(p.qty - total, 0) * COST, diff: total - p.qty,
    idx: p.qty > 0 ? cum.findIndex((x) => x >= p.qty) : -1,
  };
}
function finalQty(p: Plan, sizes: Sim['sizes']): number[] {
  if (p.manual) {
    const v = SIZE_KEYS.map((k) => p.manual![k]);
    return sum(v) === p.qty ? v : alloc(p.qty, v);
  }
  return alloc(p.qty, SIZE_KEYS.map((k) => sizes[k]));
}
/** 발주량 변경 — 판매 목표도 같은 비율로 */
function scaleOrder(p: Plan, qty: number): [number, number, number] {
  const old = p.qty;
  const before = sum(planMonths(p));
  if (old > 0 && before > 0) {
    const next = alloc(Math.round((before * qty) / old), CHANNELS.flatMap((c) => p.ch[c]));
    let k = 0;
    CHANNELS.forEach((c) => { p.ch[c] = p.ch[c].map(() => next[k++]); });
  }
  p.qty = qty;
  return [old, before, sum(planMonths(p))];
}

const MISSIONS: [string, string, string][] = [
  ['qty', '① 발주량 바꾸기', '1,000 → 800 · 판매 목표도 함께 변경'],
  ['month', '② 판매 목표 고치기', '한 달 수정 · 발주량은 그대로'],
  ['two', '③ 2안 비교', '2안 만들고 수량 바꾸기'],
  ['ratio', '④ 사이즈 비중 어긋내기', '100% 미달 경고 보기'],
  ['optq', '⑤ 옵션 최종 수량 수기 수정', '합계가 새 발주량'],
  ['confirm', '⑥ 발주 확정', '저장 후 확정 · 입력 잠김'],
];
const TABS: [Sim['tab'], string][] = [['plan', '📈 월별 목표량'], ['ch', '📦 채널별 목표량'], ['opt', '🧩 옵션별 검토'], ['price', '💰 판매가 · 수익']];

function NumCell({ value, onCommit, label, disabled, big, width }: { value: number; onCommit: (v: number) => void; label: string; disabled?: boolean; big?: boolean; width?: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = Math.max(0, Math.round(Number(draft) || 0));
    setDraft(null);
    if (v !== value) onCommit(v);
  };
  return (
    <input type="number" min={0} aria-label={label} disabled={disabled} className={`s-in ${big ? 'big' : ''}`} style={width ? { width } : undefined}
      value={draft ?? value} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
  );
}

export function ManualOrderSim() {
  const [s, setS] = useState<Sim>(fresh);
  /** 불변 복사본을 고쳐 저장 */
  const up = (f: (d: Sim, p: Plan) => void) => setS((prev) => {
    const d = JSON.parse(JSON.stringify(prev)) as Sim;
    f(d, (d.active === 1 ? d.plans[1] : d.plans[2]) as Plan);
    return d;
  });
  const active = (s.active === 1 ? s.plans[1] : s.plans[2]) as Plan;
  const m = money(active, s.basis);
  const cardMoney = money(active, 'season');
  const locked = s.confirmed;
  const state: [string, string] = s.confirmed ? ['발주 확정', ''] : s.decided ? [`${s.active}안 저장`, 'c-green'] : ['검토 전', 'c-amber'];
  const coverText = (idx: number) => (idx < 0 ? '미소진' : `${MONTHS[idx]}월`);

  const pick = (no: 1 | 2) => up((d, p) => {
    if (no === 2 && !d.plans[2]) { d.plans[2] = JSON.parse(JSON.stringify(p)) as Plan; d.log = '2안 만들기 · 현재 값 복사 · 수량 · 판매가를 바꿔 비교'; }
    else d.log = `${no}안으로 전환 · 전체 숫자가 ${no}안 기준으로`;
    d.active = no;
    d.decided = true;
    d.manualOpen = false;
  });

  const planCard = (no: 1 | 2) => {
    const p = no === 1 ? s.plans[1] : s.plans[2];
    if (!p) {
      return (
        <div className="s-plan empty">
          <b>{no}안 없음</b><small>현재 값 복사 후 수량 · 판매가만 바꿔 비교</small>
          <button type="button" className="s-btn" disabled={locked} onClick={() => pick(no)}>{no}안 만들기</button>
        </div>
      );
    }
    const on = s.active === no;
    const x = money(p, s.basis);
    const d = Math.abs(x.diff);
    const [vt, vc] = x.diff === 0 ? ['판매 목표 = 발주량', 'c-green']
      : x.diff > 0 ? (s.season ? [`품절 위험 ${n(d)}`, 'c-red'] : [`리오더 약 ${n(d)}`, 'c-blue'])
        : (s.season ? [`과재고 위험 ${n(d)}`, 'c-red'] : [`잔여 ${n(d)}`, 'c-amber']);
    const base = money(s.plans[1], s.basis);
    const sign = (v: number, f: (a: number) => string) => `${v >= 0 ? '+' : '−'}${f(Math.abs(v))}`;
    return (
      <div className={`s-plan ${on ? 'on' : ''}`}>
        <div className="s-row">
          <b>{no}안</b>
          {on && <span className="chip c-blue">지금 고른 안</span>}
          <span className={`chip ${vc}`}>{vt}</span>
          {p.qty < MOQ && <span className="chip c-red">MOQ 미달</span>}
          <span className="rv-grow" />
          {!on && <button type="button" className="s-btn" disabled={locked} onClick={() => pick(no)}>이 안으로 전환</button>}
        </div>
        <div className="s-q">
          발주량 {on
            ? <NumCell big value={p.qty} label="발주량" disabled={locked} onCommit={(v) => up((dd, pp) => {
                const [o, a, b] = scaleOrder(pp, v);
                dd.done.qty = true;
                if (dd.active === 2) dd.done.two = true;
                dd.log = `발주량 ${n(o)} → ${n(v)} · 판매 목표도 같은 비율로 ${n(a)} → ${n(b)}`;
              })} />
            : <b>{n(p.qty)}</b>} 개 · 소진 <b className="sm">{coverText(x.idx)}</b>
        </div>
        {on && !locked && <p className="s-note"><b>발주량을 바꾸면</b> 월별 판매 목표도 기존 비중대로 함께 변경</p>}
        <div className="s-strip">
          {MONTHS.map((mo, i) => <span key={mo} className={i === x.idx ? 'd' : (x.idx >= 0 && i > x.idx) || x.cum[i] > p.qty ? 'o' : 'g'}>{mo}월</span>)}
        </div>
        <div className="s-money">
          <div><small>순매출</small><b>{won(x.rev)}</b></div>
          <div><small>공헌이익</small><b>{won(x.profit)}</b></div>
          <div><small>CM%</small><b>{x.cm.toFixed(1)}%</b></div>
          <div className="x"><small>발주금액</small><b>{won(x.amount)}</b></div>
          <div className="x"><small>리오더</small><b>{n(x.reorder)}개</b></div>
          <div className="x"><small>시즌 후 잔여</small><b>{won(x.left)}</b></div>
        </div>
        {no === 2 && <span className="s-delta">1안 대비 발주 {sign(p.qty - s.plans[1].qty, n)}개 · 공헌이익 {sign(x.profit - base.profit, won)} · 발주금액 {sign(x.amount - base.amount, won)}</span>}
      </div>
    );
  };

  const pm = planMonths(active);
  const barMax = Math.max(1, ...pm, ...COMPARE);
  const ratioSum = sum(SIZE_KEYS.map((k) => s.sizes[k]));
  const fq = finalQty(active, s.sizes);

  const planTab = (
    <>
      <p className="s-note"><b>여기를 고쳐도 발주량은 그대로</b> · 리오더 시점 · 수량 확인 · 잔여량 확인</p>
      <div className="tw rv-plain"><table className="s-t" style={{ minWidth: 600 }}>
        <thead><tr><th />{MONTHS.map((x) => <th key={x}>{x}월</th>)}<th>합계</th></tr></thead>
        <tbody>
          <tr><td />{pm.map((v, i) => <td key={MONTHS[i]}><div className="s-bars"><i style={{ height: (COMPARE[i] / barMax) * 44, background: '#d1d5db' }} /><i style={{ height: (v / barMax) * 44, background: 'var(--accent)' }} /></div></td>)}<td /></tr>
          <tr><td className="sub">대응SKU 실적</td>{COMPARE.map((v, i) => <td key={MONTHS[i]} className="sub">{v}</td>)}<td className="sub">{n(sum(COMPARE))}</td></tr>
          <tr><td><b>판매 목표</b></td>{pm.map((v, i) => (
            <td key={MONTHS[i]}><NumCell value={v} label={`${MONTHS[i]}월 판매 목표`} disabled={locked} onCommit={(q) => up((d, p) => {
              const cur = CHANNELS.map((k) => p.ch[k][i]);
              const next = alloc(q, cur);
              CHANNELS.forEach((k, j) => { p.ch[k][i] = next[j]; });
              d.done.month = true;
              d.log = `${MONTHS[i]}월 판매 목표 ${n(sum(cur))} → ${n(q)} · 발주량 ${n(p.qty)} 그대로 · 채널 구성비대로 나눔`;
            })} /></td>
          ))}<td><b>{n(m.total)}</b></td></tr>
          <tr><td className="sub">증감</td>{pm.map((v, i) => {
            const g = Math.round(((v - COMPARE[i]) / COMPARE[i]) * 100);
            return <td key={MONTHS[i]} style={{ color: g >= 0 ? '#2563eb' : '#ef4444' }}>{g >= 0 ? '+' : '−'}{Math.abs(g)}%</td>;
          })}<td /></tr>
          <tr><td className="sub">누적 vs 발주 {n(active.qty)}</td>{m.cum.map((c, i) => <td key={MONTHS[i]} className={c > active.qty ? 'over' : ''}>{n(c)}</td>)}<td /></tr>
        </tbody>
      </table></div>
      <div className="s-chips">
        <span className="sub">판매 목표 일괄</span>
        {[-20, -10, 10, 20].map((pct) => (
          <button key={pct} type="button" disabled={locked} onClick={() => up((d, p) => {
            const before = sum(planMonths(p));
            CHANNELS.forEach((c) => { p.ch[c] = p.ch[c].map((v) => Math.round(v * (1 + pct / 100))); });
            d.log = `판매 목표 ${n(before)} → ${n(sum(planMonths(p)))} · 발주량 ${n(p.qty)} 그대로`;
          })}>{pct > 0 ? '+' : '−'}{Math.abs(pct)}%</button>
        ))}
        <button type="button" disabled={locked} onClick={() => up((d, p) => {
          MONTHS.forEach((_, i) => {
            const next = alloc(COMPARE[i], CHANNELS.map((k) => p.ch[k][i]));
            CHANNELS.forEach((k, j) => { p.ch[k][i] = next[j]; });
          });
          d.log = '대응SKU 실적으로 판매 목표 채움 · 발주량 그대로';
        })}>대응SKU 실적으로 채우기</button>
        {s.season && m.diff !== 0 && (
          <button type="button" disabled={locked} onClick={() => up((d, p) => {
            const next = alloc(p.qty, CHANNELS.flatMap((c) => p.ch[c]));
            let k = 0;
            CHANNELS.forEach((c) => { p.ch[c] = p.ch[c].map(() => next[k++]); });
            d.log = '판매 목표를 발주량에 맞춤 · 월 · 채널 모양 유지';
          })}>판매 목표를 발주량에 맞추기</button>
        )}
      </div>
    </>
  );

  const chTab = (
    <>
      <p className="s-note"><b>여기를 고쳐도 발주량은 그대로</b> · 월별 목표량에 바로 반영</p>
      <div className="tw rv-plain"><table className="s-t" style={{ minWidth: 600 }}>
        <thead><tr><th>채널</th>{MONTHS.map((x) => <th key={x}>{x}월</th>)}<th>합계</th></tr></thead>
        <tbody>
          {CHANNELS.map((c) => (
            <tr key={c}><td><b>{c}</b></td>
              {active.ch[c].map((v, i) => (
                <td key={MONTHS[i]}><NumCell width={52} value={v} label={`${c} ${MONTHS[i]}월`} disabled={locked} onCommit={(q) => up((d, p) => {
                  p.ch[c][i] = q;
                  d.log = `${c} ${MONTHS[i]}월 ${n(q)} · 발주량 ${n(p.qty)} 그대로 · 월별 목표량에 반영`;
                })} /></td>
              ))}
              <td><b>{n(sum(active.ch[c]))}</b></td></tr>
          ))}
          <tr><td>합계</td>{pm.map((v, i) => <td key={MONTHS[i]}><b>{n(v)}</b></td>)}<td><b>{n(sum(pm))}</b></td></tr>
        </tbody>
      </table></div>
    </>
  );

  const optTab = (
    <>
      <p className="s-note"><b>옵션 합계 = 발주량</b> · 수량을 고치면 발주량과 월별 목표량도 함께 변경</p>
      <div className="s-opt">
        <div>
          <b style={{ fontSize: 12.5 }}>사이즈 비중</b>
          {SIZE_KEYS.map((k) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, marginTop: 4 }}>{k}
              <span><NumCell value={s.sizes[k]} label={`${k} 비중`} disabled={locked} onCommit={(v) => up((d, p) => {
                d.sizes[k] = v;
                const had = !!p.manual;
                p.manual = null;
                d.manualOpen = false;
                const r = sum(SIZE_KEYS.map((z) => d.sizes[z]));
                if (r !== 100) d.done.ratio = true;
                d.log = `${r === 100 ? '사이즈 비중 합계 100%' : `사이즈 비중 합계 ${r}% · 100%로 맞춰주세요`}${had ? ' · 옵션 수기값 해제' : ''}`;
              })} /> %</span>
            </div>
          ))}
          {ratioSum !== 100 && <p className="s-warn" style={{ marginTop: 4 }}>{ratioSum < 100 ? '100% 미달!' : '100% 초과!'} · 현재 {ratioSum}%</p>}
        </div>
        <div>
          <div className="s-row">
            <b style={{ fontSize: 12.5 }}>옵션별 최종 발주량 · {s.active}안</b>
            {active.manual && <span className="chip c-amber">수기 수정</span>}
            <span className="rv-grow" />
            <button type="button" className="s-btn" disabled={locked} onClick={() => up((d) => { d.manualOpen = !d.manualOpen; })}>{s.manualOpen ? '수정 닫기' : '최종 수량 수정'}</button>
            {active.manual && <button type="button" className="s-btn" disabled={locked} onClick={() => up((d, p) => { p.manual = null; d.manualOpen = false; d.log = '비율대로 되돌리기 · 비중 계산값으로 복귀'; })}>비율대로 되돌리기</button>}
          </div>
          <div className="tw rv-plain"><table className="s-t" style={{ minWidth: 240 }}>
            <thead><tr><th>사이즈</th>{SIZE_KEYS.map((k) => <th key={k}>{k}</th>)}<th>합계</th></tr></thead>
            <tbody><tr><td>수량</td>
              {SIZE_KEYS.map((k, i) => (
                <td key={k}>{s.manualOpen && !locked
                  ? <NumCell value={fq[i]} label={`${k} 수량`} onCommit={(v) => up((d, p) => {
                      const cur = finalQty(p, d.sizes);
                      const next = { S: cur[0], M: cur[1], L: cur[2], [k]: v } as Record<SizeKey, number>;
                      const total = sum(SIZE_KEYS.map((z) => next[z]));
                      const [o, a, b] = scaleOrder(p, total);
                      p.manual = next;
                      d.done.optq = true;
                      d.log = `옵션 합계 ${n(total)} → 발주량 ${n(o)} → ${n(total)} · 판매 목표 ${n(a)} → ${n(b)}`;
                    })} />
                  : n(fq[i])}</td>
              ))}
              <td><b>{n(sum(fq))}</b></td></tr></tbody>
          </table></div>
        </div>
      </div>
    </>
  );

  const priceTab = (
    <>
      <div className="s-chips">
        <span className="sub">B2C 일괄</span>
        {PRICE_OPTS.map(([id, label, pct]) => (
          <button key={id} type="button" aria-pressed={active.opt === id} disabled={locked} onClick={() => up((d, p) => {
            p.opt = id;
            d.log = `판매가 변경 · 공헌이익 ${won(money(p, d.basis).profit)} · 발주량 · 판매 목표 그대로`;
          })}>{label} {n(discounted(pct))}원</button>
        ))}
      </div>
      <div className="tw rv-plain"><table className="s-t" style={{ minWidth: 380 }}>
        <thead><tr><th>채널</th><th>수량</th><th>판매가 · 공급가</th></tr></thead>
        <tbody>{CHANNELS.map((c) => <tr key={c}><td>{c}</td><td>{n(sum(active.ch[c]))}</td><td>{c === 'B2B' ? '공급가 ' : ''}{n(priceOf(c, active))}원</td></tr>)}</tbody>
      </table></div>
      <p className="sub">순매출 {won(m.rev)} · 공헌이익 {won(m.profit)} · CM {m.cm.toFixed(1)}% · 위 안 카드에 바로 반영</p>
    </>
  );

  return (
    <>
      <div className="rv-missions">
        {MISSIONS.map(([k, t, d]) => (
          <div key={k} className={`rv-m ${s.done[k] ? 'done' : ''}`}><span className="ck">{s.done[k] ? '✅' : '⬜'}</span><div><b>{t}</b><small>{d}</small></div></div>
        ))}
      </div>
      <div className="viz rv-sim">
        <div className="s-head">
          <div className="s-chips">
            <span className="sub">금액 기준</span>
            <button type="button" aria-pressed={s.basis === 'order'} onClick={() => up((d) => { d.basis = 'order'; d.log = '이번 발주분까지만 팔린다고 보고 계산'; })}>초도 발주량만</button>
            <button type="button" aria-pressed={s.basis === 'season'} onClick={() => up((d) => { d.basis = 'season'; d.log = '판매 목표 전체로 계산 · SKU 카드와 같은 기준'; })}>시즌 목표 · 리오더 포함</button>
          </div>
          <label className="rv-check"><input type="checkbox" checked={s.season} onChange={(e) => { const on = e.target.checked; up((d) => { d.season = on; d.log = on ? '시즌 한정 · 리오더 없는 상품으로 판정' : '리오더 가능 상품으로 판정'; }); }} /> 시즌 한정 SKU</label>
          <span className="rv-grow" />
          <b>예시 메쉬백</b><small>판매가 19,900 · 원가 6,000 · MOQ 500</small>
          <button type="button" className="jump" onClick={() => setS(fresh())}>↺ 처음부터</button>
        </div>
        <div className="s-plans">{planCard(1)}{planCard(2)}</div>
        <div className="rv-box">
          <div className="s-tabs" role="tablist">
            {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={s.tab === k} onClick={() => up((d) => { d.tab = k; d.manualOpen = false; })}>{l}</button>)}
          </div>
          {s.tab === 'plan' ? planTab : s.tab === 'ch' ? chTab : s.tab === 'opt' ? optTab : priceTab}
        </div>
        <div className="s-mirror">
          <b style={{ fontSize: 12.5 }}>🪪 SKU 카드 발주 결과</b>
          <span className={`chip ${state[1]}`} style={{ fontSize: 11, padding: '1px 8px' }}>{state[0]}</span>
          <div><small>{s.decided ? `${s.active}안 ` : ''}발주량</small><b>{n(active.qty)}개</b></div>
          <div><small>소진월</small><b>{coverText(cardMoney.idx)}</b></div>
          <div><small>예상 순매출</small><b>{won(cardMoney.rev)}</b></div>
          <div><small>예상 공헌이익</small><b>{won(cardMoney.profit)}</b></div>
          <small>카드는 항상 판매 목표 전체 기준 · 보기 전용</small>
        </div>
        <div className="s-foot">
          <span className={`chip ${state[1]}`}>{state[0]}</span>
          <small>{locked ? '발주 확정됨 · 입력 잠김' : '저장해도 수정 가능 · 최종은 발주 확정'}</small>
          <span className="rv-grow" />
          {locked
            ? <button type="button" className="s-btn" onClick={() => up((d) => { d.confirmed = false; d.log = '발주 확정 해제 · 다시 수정 가능'; })}>발주 확정 해제</button>
            : <>
                <button type="button" className="s-btn" onClick={() => up((d) => { d.decided = true; d.log = `${d.active}안 저장 · 아직 수정 가능 · 최종은 발주 확정`; })}>{s.active}안으로 저장</button>
                <button type="button" className="s-btn pri" onClick={() => up((d) => { d.decided = true; d.confirmed = true; d.done.confirm = true; d.manualOpen = false; d.log = `${d.active}안으로 발주 확정 · 옵션별 수량 기록 · 입력 잠김`; })}>발주 확정</button>
              </>}
        </div>
      </div>
      <p className="sub s-log" role="status" aria-live="polite">{s.log}</p>
    </>
  );
}
