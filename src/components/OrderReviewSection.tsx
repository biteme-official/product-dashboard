/**
 * 프로젝션 › 발주량 검토 — SKU별로 1안 · 2안을 정하고, 고른 값의 월 · 카테고리 합계를 본다.
 * 화면을 여는 것만으로는 쓰기가 없다(SkuCard · ComparisonColumn을 마운트하지 않음). 저장은 전부 applySkuBatch, 확정은 기존 setFinalOrderConfirmed.
 */
import { useMemo, useState, type ReactNode } from 'react';
import {
  Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  B2C_CHANNELS, CATEGORIES, CHANNEL_CONFIRM_GROUP, getConfirmedChannels, getSkuMonths,
  type Channel, type Month, type SkuData,
} from '../types';
import { planScopeOf, useSkuSyncStatus, useStore } from '../store';
import { useAuth } from '../store/auth';
import { usePermission } from '../contexts/PermissionsContext';
import { usePricingPolicy } from '../hooks/usePricingPolicy';
import { useTableauBase, type TableauBase } from '../hooks/useTableauBase';
import { useOrderTargets } from '../hooks/useOrderTargets';
import { useExchangeRates } from '../utils/useExchangeRates';
import { isAllChannelRole, ownsChannel } from '../utils/channelOwnership';
import type { Role } from '../utils/pin';
import { searchSkus, type SkuShipmentInfo } from '../services/tableau';
import {
  comparisonSkuOf, compareNamesOf, fallbackWeightsOf, resolveBaseYear, seasonYearsWithData, type CompareMode,
} from '../utils/compareData';
import { setMonthTotal } from '../utils/qtyPlan';
import { STEP1_OPTIONS } from '../utils/step1Price';
import { basePriceOf, skuMoney, type MoneyBasis, type SkuMoney } from '../utils/reviewSku';
import { cachedReview, globalIssues, type ReviewCtx, type ReviewIssue, type SkuReview } from '../utils/skuReview';
import { finalOrderForConfirm, finalOrderModel } from '../utils/finalOrder';
import { orderForCover, savePlanPatch, switchPlanPatch, withOrderQty } from '../utils/orderPlan';
import { CellInput } from './CellInput';

const fmt = (n: number) => Math.round(n).toLocaleString();
const won = (n: number | null | undefined) => {
  if (n === null || n === undefined) return '–';
  const a = Math.abs(n);
  const s = a >= 1e8 ? `${(a / 1e8).toFixed(2)}억` : a >= 1e4 ? `${Math.round(a / 1e4).toLocaleString()}만` : Math.round(a).toLocaleString();
  return n < 0 ? `−${s}` : s;
};
const pct = (n: number | null) => (n === null ? '–' : `${n}%`);
const openKey = (s: SkuData) => (s.releaseDate || '').slice(0, 7);
const openLabel = (k: string) => (k ? `${k.slice(2, 4)}년 ${Number(k.slice(5))}월 오픈` : '오픈일 미정');

/** 판매가 할인 칩 (5% 단위) */
const PCT_OPTS = ['', '할인 5%', '할인 10%', '할인 15%', '할인 20%'];
/** B2C 채널에서 고를 수 있는 판매가 — B2B 공급가 선택지 제외 */
const B2C_OPTS = STEP1_OPTIONS.filter((o) => !['b2bOpen', 'b2b', 'buy', 'glob', 'jp'].includes(o.key));
const optLabel = (id: string) => (id ? STEP1_OPTIONS.find((o) => o.id === id)?.label ?? id : '판매가');

interface Totals { order: number; orderAmount: number; revenue: number; profit: number; profitRevenue: number; reorder: number; leftover: number; risk: number; skipped: number }
const isRisk = (s: SkuData, m: SkuMoney) => m.coverage.status === 'stockout' || m.coverage.status === 'overstock' || s.totalOrderQty < s.moq;
function sumReviews(arr: { s: SkuData; r: SkuReview }[]): Totals {
  const t: Totals = { order: 0, orderAmount: 0, revenue: 0, profit: 0, profitRevenue: 0, reorder: 0, leftover: 0, risk: 0, skipped: 0 };
  arr.forEach(({ s, r }) => {
    const m = r.money;
    t.order += s.totalOrderQty; t.orderAmount += m.orderAmount ?? 0; t.revenue += m.revenue;
    t.reorder += m.reorderQty; t.leftover += m.leftoverAmount ?? 0;
    if (isRisk(s, m)) t.risk += 1;
    if (m.profit === null) t.skipped += 1; else { t.profit += m.profit; t.profitRevenue += m.revenue; }
  });
  return t;
}
const totalCm = (t: Totals) => (t.profitRevenue > 0 ? Math.round((t.profit / t.profitRevenue) * 1000) / 10 : null);

function verdict(s: SkuData, m: SkuMoney): { text: string; cls: string } {
  const n = fmt(Math.abs(m.coverage.diff));
  switch (m.coverage.status) {
    case 'match': return { text: '판매 목표 = 발주량', cls: 'bg-emerald-100 text-emerald-700' };
    case 'reorder': return { text: `리오더 약 ${n}`, cls: 'bg-blue-100 text-blue-700' };
    case 'stockout': return { text: `품절 위험 ${n}`, cls: 'bg-red-100 text-red-700' };
    case 'leftover': return { text: `잔여 ${n}`, cls: 'bg-amber-100 text-amber-800' };
    case 'overstock': return { text: `과재고 위험 ${n}`, cls: 'bg-red-100 text-red-700' };
    default: return { text: s.totalOrderQty ? '판매 목표 없음' : '발주량 없음', cls: 'bg-gray-100 text-gray-500' };
  }
}
/** 누적이 발주량에 닿는 달 */
function coverLabel(s: SkuData, m: SkuMoney): string {
  const cum = m.coverage.cumulative;
  const i = s.totalOrderQty > 0 ? cum.findIndex((c) => c >= s.totalOrderQty) : -1;
  return i < 0 ? '미소진' : `${m.months[i].month}월`;
}

function Chip({ on, onClick, children, disabled }: { on?: boolean; onClick?: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className={`text-[11px] px-2.5 py-0.5 rounded-full border tabular-nums disabled:opacity-50 disabled:cursor-not-allowed ${on ? 'bg-gray-800 border-gray-800 text-white font-semibold' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}>
      {children}
    </button>
  );
}
const Box = ({ title, right, children }: { title?: ReactNode; right?: ReactNode; children: ReactNode }) => (
  <div className="bg-white border border-gray-200 rounded-lg p-3 min-w-0">
    {(title || right) && <div className="flex flex-wrap items-center justify-between gap-2 mb-2"><h4 className="text-xs font-semibold text-gray-800">{title}</h4>{right}</div>}
    {children}
  </div>
);

const stateChip = (s: SkuData) => s.finalOrderConfirmedAt
    ? <span className="px-1.5 rounded-full bg-gray-200 text-gray-700 text-[11px] font-semibold whitespace-nowrap">발주 확정</span>
    : s.orderPlans?.decided
      ? <span className="px-1.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-semibold whitespace-nowrap">{s.orderPlans.active}안 저장</span>
      : <span className="px-1.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-semibold whitespace-nowrap">검토 전</span>;

interface DetailEnv {
  role: Role | null;
  perm: ReturnType<typeof usePermission>;
  tableau: TableauBase;
  global: ReviewIssue[];
  writeBlocked: boolean;
  busy: boolean;
  basis: MoneyBasis;
  onNavigateToSku?: (sku: SkuData) => void;
  save: (s: SkuData, patch: Partial<SkuData>, label: string) => Promise<void>;
  setOrder: (s: SkuData, qty: number) => void;
  setMonthPlan: (s: SkuData, r: SkuReview, totalsByMonth: Map<Month, number>, label: string, fromCompare?: boolean) => void;
  saveCompare: (s: SkuData, names: string[], mode: CompareMode, baseYears: Record<string, number> | undefined) => void;
  confirm: (s: SkuData, on: boolean) => Promise<void>;
}

function Detail({ s, r, env }: { s: SkuData; r: SkuReview; env: DetailEnv }) {
    const { role, perm, tableau, global, writeBlocked, busy, basis, onNavigateToSku, save, setOrder, setMonthPlan, saveCompare, confirm } = env;
    const m = r.money;
    const active = s.orderPlans?.active ?? 1;
    const months = getSkuMonths(s.releaseDate);
    const finalized = !!s.finalOrderConfirmedAt;
    // 칸 입력은 저장 중에도 유지 — busy로 잠그면 칸이 다시 그려져 다음 칸 클릭이 사라짐
    const orderEditable = perm.skuBasic && !finalized && !writeBlocked;
    const canOrder = orderEditable && !busy;
    const lockedChannels = getConfirmedChannels(s);
    const allLocked = m.channels.every((c) => lockedChannels.includes(c.channel));
    const planEditable = perm.step1 && !finalized && !allLocked && !writeBlocked;
    const canPlan = planEditable && !busy;
    const hasError = r.issues.some((i) => i.level === 'error') || global.some((i) => i.level === 'error');
    const model = finalOrderModel(s);
    const confirmReason = !perm.orderConfirm ? '발주 확정 권한 없음' : tableau.loading ? '태블로 불러오는 중' : hasError ? '오류 해결 후 확정 가능' : !model ? '옵션이나 수량 없음' : '';
    const other = s.orderPlans?.other ? skuMoney({ ...s, ...s.orderPlans.other }, { pricer: r.pricer, varCost: r.varCost, basis }) : null;
    const a = active === 1 ? m : other;
    const b = active === 2 ? m : other;
    const qtyA = active === 1 ? s.totalOrderQty : s.orderPlans?.other?.totalOrderQty;
    const qtyB = active === 2 ? s.totalOrderQty : s.orderPlans?.other?.totalOrderQty;
    const monthComp = (mo: Month) => r.compare.monthly[mo] ?? null;
    const compTotal = months.reduce<number | null>((acc, mo) => { const c = monthComp(mo); return c === null ? acc : (acc ?? 0) + c; }, null);
    const growth = (x: number, c: number | null) => {
      if (!c) return <span className="text-gray-300">–</span>;
      const v = Math.round(((x - c) / c) * 100);
      return <span className={v >= 0 ? 'text-blue-600' : 'text-red-500'}>{v >= 0 ? '+' : '−'}{Math.abs(v)}%</span>;
    };
    const v = verdict(s, m);

    // 대응SKU
    const names = compareNamesOf(s);
    const mode = r.compare.mode;
    const [q, setQ] = useState('');
    const canCompare = perm.skuBasic && !writeBlocked && !busy && !tableau.errors.shipments && !tableau.loading;
    const suggestions = q ? searchSkus(tableau.shipments, q).filter((x) => !names.includes(x.name)) : [];
    const rm = months[0];
    const ry = s.releaseDate ? parseInt(s.releaseDate.slice(0, 4), 10) : 0;
    const derived = s.channelQtyDerivedFromCompareSkus;
    const compareChanged = derived !== undefined && !m.months.every((x) => x.plan === 0) && [...derived].sort().join('|') !== [...names].sort().join('|');

    // 판매가
    const canPrice = (ch: Channel) => perm.step2 && ownsChannel(role, ch) && !s[CHANNEL_CONFIRM_GROUP[ch].field] && !s.isPriceConfirmed && !finalized && !writeBlocked && !busy;
    const setOpts = (channels: readonly Channel[], opt: string) => {
      const next = { ...(s.pricingOpts ?? {}) };
      channels.filter(canPrice).forEach((ch) => months.forEach((mo) => { next[`${ch}-${mo}`] = opt; }));
      void save(s, { pricingOpts: next }, `판매가 ${optLabel(opt)}`);
    };
    const b2cRows = m.channels.filter((c) => (B2C_CHANNELS as readonly string[]).includes(c.channel));
    const allOpt = b2cRows.length > 0 && b2cRows.every((c) => c.opt === b2cRows[0].opt) ? b2cRows[0].opt : null;
    const base = s.price;
    const shown = m.channels.filter((c) => c.planQty > 0 || (B2C_CHANNELS as readonly string[]).includes(c.channel));

    return (
      <div className="bg-gray-100 rounded-lg p-3 space-y-3">
        {r.issues.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {r.issues.map((i, k) => <span key={k} className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${i.level === 'error' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{i.what} · {i.effect}</span>)}
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          <Box title={`${active}안 발주`} right={stateChip(s)}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600">
              <label className="flex items-center gap-1.5">발주량 <span className="w-20 inline-block"><CellInput value={s.totalOrderQty} disabled={!orderEditable} onCommit={(n) => setOrder(s, n)} /></span></label>
              <label className="flex items-center gap-1.5">소진 목표로 계산
                <select value="" disabled={!canOrder || m.planQty === 0} onChange={(e) => e.target.value !== '' && setOrder(s, orderForCover(m.coverage.cumulative, Number(e.target.value), s.moq))}
                  className="text-xs border border-gray-300 rounded px-1 py-0.5 bg-white disabled:opacity-50">
                  <option value="">선택</option>
                  {months.map((mo, i) => <option key={mo} value={i}>{mo}월까지 · {fmt(orderForCover(m.coverage.cumulative, i, s.moq))}개</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1.5">판매 목표 일괄
                <select value="" disabled={!canPlan || m.planQty === 0} onChange={(e) => {
                  if (!e.target.value) return;
                  const k = 1 + Number(e.target.value) / 100;
                  setMonthPlan(s, r, new Map(m.months.map((x) => [x.month, Math.round(x.plan * k)])), `판매 목표 ${e.target.value}%`);
                }} className="text-xs border border-gray-300 rounded px-1 py-0.5 bg-white disabled:opacity-50">
                  <option value="">선택</option>
                  {[-20, -10, 10, 20].map((p) => <option key={p} value={p}>{p > 0 ? '+' : '−'}{Math.abs(p)}%</option>)}
                </select>
              </label>
            </div>
            <p className="text-[11px] text-gray-500 mt-2 tabular-nums">
              MOQ {fmt(s.moq)}{s.totalOrderQty < s.moq && <span className="ml-1 px-1.5 rounded-full bg-red-100 text-red-700 font-semibold">MOQ 미달</span>} · 원가 {s.cost ? fmt(s.cost) : '없음'} · 소진 {coverLabel(s, m)} · 발주금액 {won(m.orderAmount)}
            </p>
          </Box>
          <Box title="대응SKU · 모든 안에 공통" right={
            <div className="flex gap-1">
              {([['samePeriod', '동기간'], ['rolling12', '직전 12개월']] as const).map(([k, l]) => (
                <Chip key={k} on={mode === k} disabled={!canCompare || names.length === 0} onClick={() => saveCompare(s, names, k, s.comparisonSku.baseYears)}>{l}</Chip>
              ))}
            </div>
          }>
            <div className="flex flex-wrap items-center gap-1.5">
              {names.length === 0 && <span className="text-xs text-gray-500">대응SKU 없음</span>}
              {names.map((n) => {
                const ship = tableau.shipments.find((x) => x.name === n);
                const baseInfo = mode === 'samePeriod' && ship && ry ? r.compare.bases.find((b) => b.name === n) : undefined;
                return (
                  <span key={n} className={`inline-flex items-center gap-1 text-[11px] pl-2 pr-1 py-0.5 rounded-full border ${!ship && !tableau.loading && !tableau.errors.shipments ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-indigo-200 bg-indigo-50 text-indigo-700'}`}>
                    {n}
                    {baseInfo && ship && (
                      <select aria-label={`${n} 기준연도`} disabled={!canCompare}
                        value={baseInfo.source === 'manual' ? String(baseInfo.year) : ''}
                        onChange={(e) => {
                          const next = { ...(s.comparisonSku.baseYears ?? {}) };
                          if (e.target.value) next[n] = Number(e.target.value); else delete next[n];
                          saveCompare(s, names, mode, next);
                        }}
                        className="text-[11px] bg-transparent border-l border-indigo-200 pl-0.5">
                        <option value="">자동 · {resolveBaseYear(ship, rm, ry, undefined).year}년</option>
                        {[...new Set([...seasonYearsWithData(ship.byYearMonth, rm), baseInfo.year])].sort((x, y) => y - x).map((y) => <option key={y} value={y}>{y}년</option>)}
                      </select>
                    )}
                    {canCompare && <button aria-label={`${n} 제거`} onClick={() => saveCompare(s, names.filter((x) => x !== n), mode, s.comparisonSku.baseYears)} className="px-1 text-gray-400 hover:text-red-500">×</button>}
                  </span>
                );
              })}
              {canCompare && (
                <span className="relative">
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="+ 태블로 SKU 검색" aria-label="대응SKU 검색" className="text-[11px] border border-gray-300 rounded px-1.5 py-0.5 w-36" />
                  {suggestions.length > 0 && (
                    <div className="absolute z-20 mt-0.5 w-64 max-h-52 overflow-auto bg-white border border-gray-200 rounded shadow-lg">
                      {suggestions.map((x) => <button key={x.name} onClick={() => { setQ(''); saveCompare(s, [...names, x.name], mode, s.comparisonSku.baseYears); }} className="block w-full text-left text-[11px] px-2 py-1 hover:bg-indigo-50">{x.name}</button>)}
                    </div>
                  )}
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
              {r.compare.modeLabel} · 변동비는 카테고리×채널 팀카테 기준, 대응SKU는 기간만 결정
            </p>
            {planEditable && names.length > 0 && Object.keys(r.compare.monthly).length > 0 && (
              <p className="text-[11px] mt-1.5">
                {compareChanged && <span className="px-1.5 mr-1 rounded-full bg-amber-100 text-amber-800 font-semibold">대응SKU 변경됨 · 월 계획 유지</span>}
                <button disabled={!canPlan} onClick={() => setMonthPlan(s, r, new Map(months.filter((mo) => monthComp(mo) !== null).map((mo) => [mo, Math.round(monthComp(mo)!)])), '대응SKU 실적으로 월 계획 채우기', true)}
                  className="px-2 py-0.5 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50">대응SKU 실적으로 월 계획 채우기</button>
              </p>
            )}
          </Box>
        </div>

        <Box title={`${active}안 월 계획`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-gray-200 text-gray-500"><th className="text-left px-2 py-1 font-semibold"></th>{m.months.map((x) => <th key={x.month} className="text-right px-2 py-1 font-semibold whitespace-nowrap">{x.ym.slice(2, 4)}.{x.month}월</th>)}<th className="text-right px-2 py-1 font-semibold">합계</th></tr></thead>
              <tbody className="tabular-nums">
                <tr className="border-b border-gray-100"><td className="px-2 py-1 whitespace-nowrap">대응SKU 실적</td>{compTotal === null
                  ? <td colSpan={9} className="px-2 py-1 text-gray-400">{tableau.errors.shipments ? '실적 불러오기 실패' : tableau.loading ? '불러오는 중' : '대응SKU 없음'}</td>
                  : <>{months.map((mo) => <td key={mo} className="px-2 py-1 text-right text-gray-500">{monthComp(mo) === null ? '–' : fmt(monthComp(mo)!)}</td>)}<td className="px-2 py-1 text-right text-gray-500">{fmt(compTotal)}</td></>}</tr>
                <tr className="border-b border-gray-100"><td className="px-2 py-1 whitespace-nowrap font-semibold">판매 목표</td>{m.months.map((x) => (
                  <td key={x.month} className="px-1 py-1 min-w-[68px]"><CellInput value={x.plan} disabled={!planEditable} onCommit={(n) => setMonthPlan(s, r, new Map([[x.month, n]]), `${x.month}월 판매 목표`)} /></td>
                ))}<td className="px-2 py-1 text-right font-bold">{fmt(m.planQty)}</td></tr>
                {compTotal !== null && <tr className="border-b border-gray-100"><td className="px-2 py-1 whitespace-nowrap">증감 vs 대응SKU</td>{m.months.map((x) => <td key={x.month} className="px-2 py-1 text-right">{growth(x.plan, monthComp(x.month))}</td>)}<td className="px-2 py-1 text-right">{growth(m.planQty, compTotal)}</td></tr>}
                <tr><td className="px-2 py-1 whitespace-nowrap">누적 vs 발주 {fmt(s.totalOrderQty)}</td>{m.coverage.cumulative.map((c, i) => <td key={i} className={`px-2 py-1 text-right ${c > s.totalOrderQty ? 'text-red-500' : ''}`}>{fmt(c)}</td>)}<td className="px-2 py-1 text-right"><span className={`px-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${v.cls}`}>{v.text}</span></td></tr>
              </tbody>
            </table>
          </div>
        </Box>

        <Box title={`${active}안 판매가 · 채널별`} right={
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[11px] text-gray-500 mr-0.5">B2C 일괄</span>
            {PCT_OPTS.map((o) => <Chip key={o} on={allOpt === o} disabled={!B2C_CHANNELS.some(canPrice)} onClick={() => setOpts(B2C_CHANNELS, o)}>{optLabel(o)} {fmt(r.pricer(o, base))}원</Chip>)}
          </div>
        }>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-gray-200 text-gray-500">{['채널', '비중', '수량', '판매가 · 공급가', '순매출', '공헌이익', '변동비율', 'CM%'].map((h, i) => <th key={h} className={`px-2 py-1 font-semibold whitespace-nowrap ${i === 0 || i === 3 ? 'text-left' : 'text-right'}`}>{h}</th>)}</tr></thead>
              <tbody className="tabular-nums">
                {shown.map((c) => {
                  const isB2c = (B2C_CHANNELS as readonly string[]).includes(c.channel);
                  const chBase = basePriceOf(s, c.channel);
                  return (
                    <tr key={c.channel} className="border-b border-gray-100">
                      <td className="px-2 py-1 whitespace-nowrap">{c.channel}</td>
                      <td className="px-2 py-1 text-right">{Math.round(c.share)}%</td>
                      <td className="px-2 py-1 text-right">{fmt(c.soldQty)}</td>
                      <td className="px-2 py-1">
                        {isB2c ? (
                          <select value={c.opt ?? '__mixed'} disabled={!canPrice(c.channel)} onChange={(e) => e.target.value !== '__mixed' && setOpts([c.channel], e.target.value)} aria-label={`${c.channel} 판매가`}
                            className="text-xs border border-gray-300 rounded px-1 py-0.5 bg-white disabled:bg-gray-50 disabled:text-gray-500">
                            {c.opt === null && <option value="__mixed">월별 다름 · 평균 {fmt(c.netPrice)}원</option>}
                            <option value="">판매가 · {fmt(chBase)}원</option>
                            {B2C_OPTS.filter((o) => !o.coreOnly || s.coreSku).map((o) => <option key={o.id} value={o.id}>{o.label} · {fmt(r.pricer(o.id, chBase))}원</option>)}
                          </select>
                        ) : <span><span className="text-gray-400">공급가</span> {fmt(c.netPrice)}원</span>}
                      </td>
                      <td className="px-2 py-1 text-right">{won(c.revenue)}</td>
                      <td className="px-2 py-1 text-right">{won(c.profit)}</td>
                      <td className="px-2 py-1 text-right whitespace-nowrap">
                        {c.varRatio === null ? '–' : `${(c.varRatio * 100).toFixed(1)}%`}
                        {c.varSource === 'default' && <span className="ml-1 px-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold">25% 대체</span>}
                        {c.varSource === 'period' && <span className="ml-1 px-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold">기간 대체</span>}
                        {c.varSource === 'none' && !tableau.loading && <span className="ml-1 px-1 rounded-full bg-red-100 text-red-700 text-[10px] font-semibold">로드 실패</span>}
                      </td>
                      <td className="px-2 py-1 text-right">{pct(c.cm)}</td>
                    </tr>
                  );
                })}
                {m.marketingCost > 0 && <tr className="border-b border-gray-100"><td className="px-2 py-1 whitespace-nowrap">마케팅 원가</td><td colSpan={4}></td><td className="px-2 py-1 text-right">{won(-m.marketingCost)}</td><td colSpan={2}></td></tr>}
                <tr className="font-semibold"><td className="px-2 py-1">합계</td><td></td><td className="px-2 py-1 text-right">{fmt(m.soldQty)}</td><td></td><td className="px-2 py-1 text-right">{won(m.revenue)}</td><td className="px-2 py-1 text-right">{won(m.profit)}</td><td></td><td className="px-2 py-1 text-right">{pct(m.cm)}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-500 mt-1.5">할인가 = 판매가 × (1 − 할인율), 10원 올림 · 월별로 다른 가격은 카드 채널 펼침에서 설정{s.isPriceConfirmed ? ' · 가격 확정 SKU라 잠김(프라이싱에서 해제)' : ''}</p>
        </Box>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          <Box title="이 SKU의 1안 · 2안">
            <table className="w-full text-xs tabular-nums">
              <thead><tr className="border-b border-gray-200 text-gray-500"><th></th><th className="text-right px-2 py-1 font-semibold">1안{active === 1 ? ' · 선택' : ''}</th><th className="text-right px-2 py-1 font-semibold">2안{active === 2 ? ' · 선택' : ''}</th></tr></thead>
              <tbody>
                {([
                  ['발주량', (_x: SkuMoney, q: number) => fmt(q)],
                  ['발주금액', (x: SkuMoney) => won(x.orderAmount)],
                  ['소진월', (x: SkuMoney, q: number) => { const i = q > 0 ? x.coverage.cumulative.findIndex((c) => c >= q) : -1; return i < 0 ? '미소진' : `${x.months[i].month}월`; }],
                  ['순매출', (x: SkuMoney) => won(x.revenue)],
                  ['공헌이익', (x: SkuMoney) => won(x.profit)],
                  ['CM%', (x: SkuMoney) => pct(x.cm)],
                  ['리오더', (x: SkuMoney) => fmt(x.reorderQty)],
                  ['시즌 후 잔여', (x: SkuMoney) => won(x.leftoverAmount)],
                ] as [string, (x: SkuMoney, q: number) => string][]).map(([l, f]) => (
                  <tr key={l} className="border-b border-gray-100 last:border-0">
                    <td className="px-2 py-1 whitespace-nowrap">{l}</td>
                    <td className="px-2 py-1 text-right">{a ? f(a, qtyA ?? 0) : <span className="text-gray-400">없음</span>}</td>
                    <td className="px-2 py-1 text-right">{b ? f(b, qtyB ?? 0) : <span className="text-gray-400">없음</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
          <Box title={`옵션별 발주량 · ${active}안`}>
            {model ? (
              <div className="max-h-56 overflow-auto">
                <table className="w-full text-xs tabular-nums">
                  <thead><tr className="border-b border-gray-200 text-gray-500"><th className="text-left px-2 py-1 font-semibold">옵션</th><th className="text-right px-2 py-1 font-semibold">수량</th></tr></thead>
                  <tbody>
                    {model.rows.map((o) => <tr key={o.key} className="border-b border-gray-100 last:border-0"><td className="px-2 py-1">{o.label}</td><td className="px-2 py-1 text-right">{fmt(o.qty)}</td></tr>)}
                    <tr className="font-semibold"><td className="px-2 py-1">합계</td><td className="px-2 py-1 text-right">{fmt(model.rows.reduce((x, o) => x + o.qty, 0))}</td></tr>
                  </tbody>
                </table>
              </div>
            ) : <p className="text-xs text-gray-500">옵션이나 수량 없음 · 카드에서 입력</p>}
          </Box>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-gray-500">
            1안·2안 버튼은 현재 상태 저장 · 최종 결정은 발주 확정 ·{' '}
            {onNavigateToSku && <button className="underline text-indigo-700" onClick={() => onNavigateToSku(s)}>카드에서 열기</button>}
          </span>
          {finalized ? (
            <button disabled={!perm.orderConfirm || busy} onClick={() => confirm(s, false)} className="text-xs px-3 py-1 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50">발주 확정 해제</button>
          ) : (
            <span className="flex items-center gap-2">
              {confirmReason && <span className="text-[11px] text-gray-500">{confirmReason}</span>}
              <button disabled={!!confirmReason || busy} onClick={() => confirm(s, true)} className="text-xs px-3 py-1 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed">{active}안으로 발주 확정</button>
            </span>
          )}
        </div>
      </div>
    );
  }

export function OrderReviewSection({ skus: filteredSkus, targetComparable: filterComparable, excludeConfirmed, onExcludeConfirmedChange, onNavigateToSku }: {
  skus: SkuData[];
  excludeConfirmed: boolean;
  onExcludeConfirmedChange: (v: boolean) => void;
  /** 월 · 브랜드 · 검색 필터가 없을 때만 카테고리 목표와 비교 가능 */
  targetComparable: boolean;
  onNavigateToSku?: (sku: SkuData) => void;
}) {
  const { role } = useAuth();
  const perm = usePermission(role);
  const tableau = useTableauBase();
  const { policy, isDefault: policyIsDefault } = usePricingPolicy();
  const { usdKrw, jpyKrw, isLive } = useExchangeRates();
  const targets = useOrderTargets();
  const listenerError = useSkuSyncStatus((s) => s.error);
  const applySkuBatch = useStore((s) => s.applySkuBatch);
  const setFinalOrderConfirmed = useStore((s) => s.setFinalOrderConfirmed);

  const skus = excludeConfirmed ? filteredSkus.filter((s) => !s.finalOrderConfirmedAt) : filteredSkus;
  const targetComparable = filterComparable && !excludeConfirmed;

  const [basis, setBasis] = useState<MoneyBasis>('order');
  const [view, setView] = useState<'sku' | 'total'>('sku');
  const [groupBy, setGroupBy] = useState<'open' | 'cat'>('open');
  const [openId, setOpenId] = useState<string | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [metric, setMetric] = useState<'rev' | 'pro'>('rev');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ctx = useMemo<ReviewCtx>(() => ({
    policy, policyIsDefault, fx: { usd: usdKrw, jpy: jpyKrw, live: isLive },
    shipments: tableau.shipments, channelMap: tableau.channelMap, teamCate: tableau.teamCate, loading: tableau.loading, errors: tableau.errors,
  }), [policy, policyIsDefault, usdKrw, jpyKrw, isLive, tableau.shipments, tableau.channelMap, tableau.teamCate, tableau.loading, tableau.errors]);

  const reviewOf = (s: SkuData) => cachedReview(s, ctx, basis);
  const rows = skus.map((s) => ({ s, r: reviewOf(s) }));
  const totals = sumReviews(rows);
  const global = globalIssues(ctx, skus, listenerError);
  const allIssues: (ReviewIssue & { sku?: SkuData })[] = [...global, ...rows.flatMap(({ s, r }) => r.issues.map((i) => ({ ...i, sku: s })))];
  const errorCount = allIssues.filter((i) => i.level === 'error').length;
  const warnCount = allIssues.length - errorCount;
  const writeBlocked = !!listenerError;

  async function save(s: SkuData, patch: Partial<SkuData>, label: string) {
    setMessage(null);
    setBusy(true);
    try {
      await applySkuBatch([{ id: s.id, patch }], label, '발주량 검토');
    } catch (err) {
      console.error('[발주량 검토] 저장 실패', err);
      setMessage(`${s.skuName} 저장 실패 · 변경 취소됨 · 새로고침 후 다시 시도`);
    } finally {
      setBusy(false);
    }
  }

  // 수량이 처음 들어가는 SKU는 카드 [대응SKU 기준 채우기]와 같이 기준값도 함께 기록
  const gridPatch = (s: SkuData, entries: SkuData['channelMonthQty']): Partial<SkuData> =>
    s.channelMonthQty.every((e) => e.qty === 0)
      ? { channelMonthQty: entries, step2InitBaselineQty: entries, channelQtyDerivedFromCompareSkus: compareNamesOf(s) }
      : { channelMonthQty: entries };

  function setMonthPlan(s: SkuData, r: SkuReview, totalsByMonth: Map<Month, number>, label: string, fromCompare = false) {
    const scope = planScopeOf(s, fallbackWeightsOf(s, r.compare.channelDist));
    let entries = s.channelMonthQty;
    totalsByMonth.forEach((target, m) => { entries = setMonthTotal(entries, scope, m, target).entries as SkuData['channelMonthQty']; });
    // 대응SKU 실적으로 채웠으면 지금 대응SKU 기준 표로 기록 (변경 배지 해제)
    void save(s, { ...gridPatch(s, entries), ...(fromCompare ? { channelQtyDerivedFromCompareSkus: compareNamesOf(s) } : {}) }, label);
  }

  function setOrder(s: SkuData, qty: number) {
    const patch = withOrderQty(s, qty);
    if (!patch) { setMessage(`${s.skuName} · 컬러 수량이 없어 발주량을 바꿀 수 없어요. 카드에서 컬러 수량 먼저 입력`); return; }
    void save(s, patch, `발주량 ${fmt(s.totalOrderQty)} → ${fmt(qty)}`);
  }

  function pickPlan(s: SkuData, no: 1 | 2) {
    const active = s.orderPlans?.active ?? 1;
    void save(s, no === active ? savePlanPatch(s) : switchPlanPatch(s), `${no}안 저장`);
  }

  function saveCompare(s: SkuData, names: string[], mode: CompareMode, baseYears: Record<string, number> | undefined) {
    const selected = names.map((n) => tableau.shipments.find((x) => x.name === n)).filter((x): x is SkuShipmentInfo => !!x);
    void save(s, { comparisonSku: comparisonSkuOf(s, selected, mode, baseYears, tableau.channelMap) }, '대응SKU 변경');
  }

  async function confirm(s: SkuData, on: boolean) {
    setMessage(null);
    setBusy(true);
    try {
      if (!on) { await setFinalOrderConfirmed(s.id, false); return; }
      const model = finalOrderModel(s);
      if (!model) { setMessage(`${s.skuName} · 옵션이나 수량이 없어 확정할 수 없어요`); return; }
      await setFinalOrderConfirmed(s.id, true, finalOrderForConfirm(s, model));
    } catch (err) {
      console.error('[발주량 검토] 확정 실패', err);
      setMessage(`${s.skuName} 확정 실패 · 새로고침 후 다시 시도`);
    } finally {
      setBusy(false);
    }
  }

  const env: DetailEnv = { role, perm, tableau, global, writeBlocked, busy, basis, onNavigateToSku, save, setOrder, setMonthPlan, saveCompare, confirm };

  // ── 상단 ───────────────────────────────────────────────────────────
  const metricCell = (l: string, v: ReactNode) => (
    <div className="min-w-0"><div className="text-[11px] text-gray-500 whitespace-nowrap">{l}</div><div className="text-sm font-bold tabular-nums text-gray-900 whitespace-nowrap">{v}</div></div>
  );
  const decided = skus.filter((s) => s.orderPlans?.decided || s.finalOrderConfirmedAt).length;
  const confirmed = skus.filter((s) => s.finalOrderConfirmedAt).length;
  const statusCls = errorCount ? 'bg-red-50 text-red-700 border-red-200' : warnCount ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200';

  const statusBar = (
    <div className={`border rounded-lg px-3 py-2 text-xs ${statusCls}`}>
      <div className="flex flex-wrap items-center gap-2">
        <b>{tableau.loading ? '계산 상태 · 태블로 불러오는 중' : errorCount || warnCount ? `계산 상태 · 오류 ${errorCount} · 경고 ${warnCount}` : '계산 상태 · 정상 · 대체값 없음'}</b>
        <span className="flex-1" />
        {(tableau.errors.teamCate || tableau.errors.shipments || tableau.errors.channel) && <button onClick={tableau.retry} className="underline">다시 시도</button>}
        {allIssues.length > 0 && <button onClick={() => setStatusOpen((v) => !v)} className="px-2 py-0.5 rounded border border-current">{statusOpen ? '접기' : '내용 보기'}</button>}
      </div>
      {statusOpen && allIssues.length > 0 && (
        <div className="overflow-x-auto mt-2 bg-white text-gray-800 rounded border border-gray-200 max-h-72 overflow-y-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-gray-500 border-b border-gray-200">{['구분', '대상', '문제', '영향', '조치'].map((h) => <th key={h} className="px-2 py-1 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {allIssues.map((i, k) => (
                <tr key={k} className="border-b border-gray-100 last:border-0">
                  <td className="px-2 py-1"><span className={`px-1.5 rounded-full font-semibold text-[11px] whitespace-nowrap ${i.level === 'error' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{i.level === 'error' ? '오류' : '경고'}</span></td>
                  <td className="px-2 py-1 whitespace-nowrap">{i.sku ? <button className="font-semibold hover:underline" onClick={() => { setOpenId(i.sku!.id); setView('sku'); }}>{i.sku.skuName}</button> : '전체'}</td>
                  <td className="px-2 py-1">{i.what}</td><td className="px-2 py-1 text-gray-600">{i.effect}</td><td className="px-2 py-1 text-gray-600">{i.fix}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const summary = (
    <div className="sticky top-0 z-10 bg-white border border-gray-300 rounded-lg px-3 py-2 space-y-1">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(92px,1fr))] gap-x-3 gap-y-1">
        {metricCell('결정 · 확정', `${decided} · ${confirmed} / ${skus.length}`)}
        {metricCell('발주량', fmt(totals.order))}
        {metricCell('발주금액', won(totals.orderAmount))}
        {metricCell('순매출', won(totals.revenue))}
        {metricCell('공헌이익', tableau.teamCate ? won(totals.profit) : '계산 중단')}
        {metricCell('CM%', pct(totalCm(totals)))}
        {metricCell('리오더 필요', fmt(totals.reorder))}
        {metricCell('시즌 후 잔여', won(totals.leftover))}
        {metricCell('위험 SKU', fmt(totals.risk))}
      </div>
      <p className="text-[11px] text-gray-500">
        {totals.skipped > 0 && <span className="px-1.5 mr-1 rounded-full bg-red-100 text-red-700 font-semibold">불완전</span>}
        {totals.skipped > 0 && `공헌이익 제외 ${totals.skipped}개 · `}각 SKU에서 고른 안 기준{basis === 'order' ? ' · 초도 발주량까지만 판매로 계산' : ' · 리오더 포함 판매 목표 전체로 계산'}
      </p>
    </div>
  );

  // ── SKU 행 ─────────────────────────────────────────────────────────
  const canSwitch = (s: SkuData) => isAllChannelRole(role) && !s.finalOrderConfirmedAt && !writeBlocked && !busy;

  function planButton(s: SkuData, r: SkuReview, no: 1 | 2) {
    const active = (s.orderPlans?.active ?? 1) === no;
    const other = s.orderPlans?.other ?? null;
    if (!active && !other) {
      return (
        <button type="button" disabled={!canSwitch(s)} onClick={() => pickPlan(s, no)}
          className="w-full min-w-[104px] text-left text-[11px] leading-tight px-2 py-1 rounded-md border border-dashed border-gray-300 text-gray-400 hover:bg-gray-50 disabled:cursor-not-allowed whitespace-nowrap">
          {no}안 만들기<br />현재 값 복사
        </button>
      );
    }
    const qty = active ? s.totalOrderQty : other!.totalOrderQty;
    const m = active ? r.money : skuMoney({ ...s, ...other! }, { pricer: r.pricer, varCost: r.varCost, basis });
    return (
      <button type="button" disabled={!canSwitch(s) && !active} onClick={() => canSwitch(s) && pickPlan(s, no)} aria-pressed={active}
        className={`w-full min-w-[104px] text-left text-[11px] leading-tight px-2 py-1 rounded-md border tabular-nums whitespace-nowrap disabled:cursor-not-allowed ${active ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-300 text-gray-600 hover:border-indigo-400'}`}>
        <span className="font-semibold">{no}안 {fmt(qty)}개</span><br />공헌 {won(m.profit)}
      </button>
    );
  }

  // ── 목록 · 합계 ────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const map = new Map<string, SkuData[]>();
    const sorted = [...skus].sort((a, b) => (a.releaseDate || '9999').localeCompare(b.releaseDate || '9999') || a.skuName.localeCompare(b.skuName, 'ko'));
    sorted.forEach((s) => { const k = groupBy === 'open' ? openKey(s) : s.category; if (!map.has(k)) map.set(k, []); map.get(k)!.push(s); });
    const keys = [...map.keys()];
    if (groupBy === 'cat') keys.sort((x, y) => CATEGORIES.indexOf(x as typeof CATEGORIES[number]) - CATEGORIES.indexOf(y as typeof CATEGORIES[number]));
    return keys.map((k) => ({ key: k, label: groupBy === 'open' ? openLabel(k) : k, arr: map.get(k)! }));
  }, [skus, groupBy]);

  const skuTable = (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-300 text-gray-500 text-left">
            {['상품', '1안', '2안'].map((h) => <th key={h} className="px-2 py-1.5 font-semibold">{h}</th>)}
            {['소진', '순매출', '공헌이익', 'CM%'].map((h) => <th key={h} className="px-2 py-1.5 font-semibold text-right">{h}</th>)}
            {['판정', '상태'].map((h) => <th key={h} className="px-2 py-1.5 font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {groups.map((g) => {
            const list = g.arr.map((s) => ({ s, r: reviewOf(s) }));
            const t = sumReviews(list);
            return [
              <tr key={`g-${g.key}`} className="bg-gray-100 font-semibold text-gray-700">
                <td colSpan={3} className="px-2 py-1">{g.label} · {g.arr.length}개 · 발주 {fmt(t.order)}개</td>
                <td></td><td className="px-2 py-1 text-right">{won(t.revenue)}</td><td className="px-2 py-1 text-right">{t.profitRevenue ? won(t.profit) : '–'}</td><td className="px-2 py-1 text-right">{pct(totalCm(t))}</td><td colSpan={2}></td>
              </tr>,
              ...list.flatMap(({ s, r }) => {
                const open = openId === s.id;
                const err = r.issues.filter((i) => i.level === 'error').length;
                const warn = r.issues.length - err;
                const v = verdict(s, r.money);
                return [
                  <tr key={s.id} className={`border-b border-gray-100 ${open ? 'bg-indigo-50' : ''}`}>
                    <td className="px-2 py-1.5 min-w-[170px] align-middle">
                      <button aria-expanded={open} onClick={() => setOpenId(open ? null : s.id)} className="font-semibold text-gray-900 text-left hover:text-indigo-700 hover:underline">{open ? '▾' : '▸'} {s.skuName}</button>
                      {err > 0 && <span className="ml-1 px-1.5 rounded-full bg-red-100 text-red-700 text-[10px] font-semibold whitespace-nowrap">오류 {err}</span>}
                      {warn > 0 && <span className="ml-1 px-1.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold whitespace-nowrap">경고 {warn}</span>}
                      <div className="text-[11px] text-gray-500">{s.brand} · {s.category}{s.releaseDate ? ` · ${s.releaseDate.slice(5).replace('-', '/')} 오픈` : ''}</div>
                    </td>
                    <td className="px-1 py-1.5 align-middle">{planButton(s, r, 1)}</td>
                    <td className="px-1 py-1.5 align-middle">{planButton(s, r, 2)}</td>
                    <td className="px-2 py-1.5 text-right align-middle whitespace-nowrap">{coverLabel(s, r.money)}</td>
                    <td className="px-2 py-1.5 text-right align-middle whitespace-nowrap">{won(r.money.revenue)}</td>
                    <td className="px-2 py-1.5 text-right align-middle whitespace-nowrap">{won(r.money.profit)}</td>
                    <td className="px-2 py-1.5 text-right align-middle whitespace-nowrap">{pct(r.money.cm)}</td>
                    <td className="px-2 py-1.5 align-middle whitespace-nowrap">
                      <span className={`px-1.5 rounded-full text-[11px] font-semibold ${v.cls}`}>{v.text}</span>
                      {s.totalOrderQty < s.moq && <span className="ml-1 px-1.5 rounded-full bg-red-100 text-red-700 text-[11px] font-semibold">MOQ 미달</span>}
                    </td>
                    <td className="px-2 py-1.5 align-middle">{stateChip(s)}</td>
                  </tr>,
                  ...(open ? [<tr key={`${s.id}-d`}><td colSpan={9} className="py-2"><Detail s={s} r={r} env={env} /></td></tr>] : []),
                ];
              }),
            ];
          })}
        </tbody>
      </table>
    </div>
  );

  // 오픈월 × 카테고리
  const openMonths = [...new Set(skus.map(openKey))].sort();
  const matrixCats = CATEGORIES.filter((c) => skus.some((s) => s.category === c));
  const totalsOf = (filter: (s: SkuData) => boolean) => sumReviews(rows.filter(({ s }) => filter(s)));
  const matrix = (
    <Box title="오픈월 × 카테고리 · 고른 안 기준">
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead><tr className="border-b border-gray-300 text-gray-500"><th className="text-left px-2 py-1"></th>{openMonths.map((k) => <th key={k} className="text-right px-2 py-1 font-semibold whitespace-nowrap">{openLabel(k)}</th>)}<th className="text-right px-2 py-1 font-semibold">합계</th></tr></thead>
          <tbody>
            {matrixCats.map((c) => (
              <tr key={c} className="border-b border-gray-100">
                <td className="px-2 py-1 whitespace-nowrap font-semibold">{c}</td>
                {openMonths.map((k) => {
                  const t = totalsOf((s) => s.category === c && openKey(s) === k);
                  if (t.order === 0 && !skus.some((s) => s.category === c && openKey(s) === k)) return <td key={k} className="px-2 py-1 text-right text-gray-300">–</td>;
                  return <td key={k} className="px-2 py-1 text-right whitespace-nowrap"><b>{fmt(t.order)}개</b><div className="text-[11px] text-gray-500">{won(t.orderAmount)} · 공헌 {t.profitRevenue ? won(t.profit) : '–'} · {pct(totalCm(t))}</div></td>;
                })}
                {(() => { const t = totalsOf((s) => s.category === c); return <td className="px-2 py-1 text-right whitespace-nowrap"><b>{fmt(t.order)}개</b><div className="text-[11px] text-gray-500">공헌 {t.profitRevenue ? won(t.profit) : '–'}</div></td>; })()}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Box>
  );

  const chartData = chartRowsOf(rows, targets, metric, targetComparable);
  const noProfit = metric === 'pro' && !tableau.teamCate;
  const chart = (
    <Box title={`판매월별 ${metric === 'rev' ? '순매출' : '공헌이익'}`} right={
      <div className="flex gap-1"><Chip on={metric === 'rev'} onClick={() => setMetric('rev')}>순매출</Chip><Chip on={metric === 'pro'} onClick={() => setMetric('pro')}>공헌이익</Chip></div>
    }>
      <p className="text-[11px] text-gray-500 mb-1">
        {targetComparable ? (chartData.hasTarget ? '점선 = 월 목표 (관리 › SKU 관리 › 월 목표)' : '월 목표 없음 · 관리 › SKU 관리 › 월 목표에서 입력') : '월 목표는 오픈월 · 브랜드 · 검색 · 발주 확정 제외 필터가 없을 때만 표시'}
      </p>
      {noProfit ? (
        <div className="text-xs bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2">변동비 데이터를 못 불러와 공헌이익 차트를 그리지 않습니다.</div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData.rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => won(v)} width={56} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: unknown, name: unknown) => [won(Number(v)), String(name)]} />
              <Bar dataKey="value" name={metric === 'rev' ? '순매출' : '공헌이익'} fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={44} />
              {chartData.hasTarget && <Line dataKey="target" name="월 목표" stroke="#374151" strokeDasharray="4 3" dot={{ r: 2 }} strokeWidth={1.5} connectNulls />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Box>
  );

  return (
    <div className="h-full overflow-auto space-y-3 pr-1 pb-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex items-center gap-1"><span className="text-[11px] text-gray-500">금액 기준</span>
          <Chip on={basis === 'order'} onClick={() => setBasis('order')}>초도 발주량만</Chip>
          <Chip on={basis === 'season'} onClick={() => setBasis('season')}>시즌 목표 · 리오더 포함</Chip>
        </div>
        <Chip on={excludeConfirmed} onClick={() => onExcludeConfirmedChange(!excludeConfirmed)}>발주 확정 제외</Chip>
        <span className="flex-1" />
        <Chip on={view === 'sku'} onClick={() => setView('sku')}>① SKU별 결정</Chip>
        <Chip on={view === 'total'} onClick={() => setView('total')}>② 월·카테고리 합계</Chip>
        {view === 'sku' && <span className="flex items-center gap-1"><span className="text-[11px] text-gray-500">묶기</span>
          <Chip on={groupBy === 'open'} onClick={() => setGroupBy('open')}>오픈월</Chip><Chip on={groupBy === 'cat'} onClick={() => setGroupBy('cat')}>카테고리</Chip></span>}
      </div>
      {statusBar}
      {summary}
      {message && <div className="text-xs bg-red-50 border border-red-200 text-red-700 rounded px-3 py-1.5 flex justify-between gap-2"><span>{message}</span><button onClick={() => setMessage(null)} className="underline">닫기</button></div>}
      {view === 'sku' ? skuTable : <>{matrix}{chart}</>}
    </div>
  );
}

function chartRowsOf(rows: { s: SkuData; r: SkuReview }[], targets: Record<string, Record<string, { rev?: number; pro?: number }>>, metric: 'rev' | 'pro', comparable: boolean) {
  const byYm = new Map<string, number>();
  rows.forEach(({ r }) => r.money.months.forEach((x) => {
    const v = metric === 'rev' ? x.revenue : (x.profit ?? 0);
    byYm.set(x.ym, (byYm.get(x.ym) ?? 0) + v);
  }));
  const cats = [...new Set(rows.map(({ s }) => s.category))];
  let hasTarget = false;
  const out = [...byYm.keys()].sort().map((ym) => {
    const t = comparable ? cats.reduce((a, c) => a + (targets[ym]?.[c]?.[metric] ?? 0), 0) : 0;
    if (t > 0) hasTarget = true;
    return { label: `${ym.slice(2, 4)}.${Number(ym.slice(5))}월`, value: Math.round(byYm.get(ym)!), target: t > 0 ? t : null };
  });
  return { rows: out, hasTarget };
}
