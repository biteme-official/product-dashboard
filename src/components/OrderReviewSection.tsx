/**
 * 프로젝션 › 발주량 검토 › SKU별 결정 · 전체 합계 — SKU별로 1안 · 2안을 정하고, 고른 값의 월 · 카테고리 합계를 본다.
 * 화면을 여는 것만으로는 쓰기가 없다(채널 표는 autoInit 끔, ComparisonColumn 미마운트). 저장은 applySkuBatch, 확정은 setFinalOrderConfirmed.
 */
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  B2C_CHANNELS, CATEGORIES, CHANNELS, moqOf, CHANNEL_CONFIRM_GROUP, getConfirmedChannels, getDisabledChannels, getSkuMonths, isMarketingLocked, isSeasonOnly,
  type Channel, type Month, type SkuData,
} from '../types';
import { planScopeOf, SkuConflictError, useSkuSyncStatus, useStore } from '../store';
import { useAuth } from '../store/auth';
import { usePermission } from '../contexts/PermissionsContext';
import { useReviewCtx } from '../hooks/useReviewCtx';
import type { TableauBase } from '../hooks/useTableauBase';
import { useOrderTargets } from '../hooks/useOrderTargets';
import { canConfirmGroup, isAllChannelRole, ownsChannel } from '../utils/channelOwnership';
import type { Role } from '../utils/pin';
import { searchSkus, type SkuShipmentInfo } from '../services/tableau';
import {
  comparisonSkuOf, compareNamesOf, fallbackWeightsOf, resolveBaseYear, seasonYearsWithData, type CompareMode,
} from '../utils/compareData';
import { scaleOpenChannelsTo, setMonthTotal } from '../utils/qtyPlan';
import { exportSkuOrderXlsx } from '../utils/exportXlsx';
import { STEP1_OPTIONS } from '../utils/step1Price';
import { basePriceOf, cmOf, qtyOf, skuMoney, type MoneyBasis, type SkuMoney } from '../utils/reviewSku';
import { cachedReview, globalIssues, type ReviewIssue, type SkuReview } from '../utils/skuReview';
import { finalOrderForConfirm, finalOrderModel } from '../utils/finalOrder';
import { monthTargetsByCompareShare, savePlanPatch, switchPlanPatch, withColorQty, withOptionQty, withOrderQtyScaled, withSizeRatio } from '../utils/orderPlan';
import { HATCH } from '../utils/reviewTable';
import { CellInput } from './CellInput';
import { ChannelQtyPanel } from './SkuCard';
import { GroupConfirmChips } from './ReviewRequestParts';
import { REVIEW_GROUPS, REVIEW_GROUP_LABEL, groupApplies, type ReviewRequest } from '../utils/reviewRequest';
import type { ChannelConfirmField } from '../types';

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
const isRisk = (s: SkuData, m: SkuMoney) => m.coverage.status === 'stockout' || m.coverage.status === 'overstock' || (moqOf(s) > 0 && s.totalOrderQty < moqOf(s));
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
function coverOf(qty: number, m: SkuMoney): string {
  const i = qty > 0 ? m.coverage.cumulative.findIndex((c) => c >= qty) : -1;
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

const STACK_COLORS = ['#312e81', '#4f46e5', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff', '#94a3b8', '#cbd5e1'];

/** 비중 막대 — 값이 작아도 이름 · %는 항상 글자로 표시 */
function ShareBar({ items }: { items: { label: string; value: number }[] }) {
  const total = items.reduce((a, x) => a + x.value, 0);
  if (total <= 0) return <p className="text-[11px] text-gray-400">수량 없음</p>;
  return (
    <div className="space-y-1">
      <div aria-hidden className="flex h-3.5 gap-0.5 rounded overflow-hidden">
        {items.map((x, i) => x.value > 0 && <span key={x.label} style={{ flex: `${x.value} 0 0`, background: STACK_COLORS[i % STACK_COLORS.length] }} />)}
      </div>
      <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-gray-600 tabular-nums">
        {items.map((x, i) => <span key={x.label} className="inline-flex items-center gap-1"><i className="w-2 h-2 rounded-sm" style={{ background: STACK_COLORS[i % STACK_COLORS.length] }} />{x.label} {Math.round((x.value / total) * 100)}%</span>)}
      </div>
    </div>
  );
}

const Hint = ({ strong, rest }: { strong: string; rest: string }) => (
  <p className="text-[11px] text-gray-600 bg-indigo-50 rounded px-2 py-0.5"><b className="text-indigo-800">{strong}</b> · {rest}</p>
);

/** 월별 소진 띠 — 초록: 발주량으로 판매 · 진한 초록: 소진월 · 주황: 리오더 · 품절 구간 */
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
  pickPlan: (s: SkuData, no: 1 | 2) => void;
  canSwitch: (s: SkuData) => boolean;
  setMonthPlan: (s: SkuData, r: SkuReview, totalsByMonth: Map<Month, number>, label: string, fromCompare?: boolean) => void;
  saveCompare: (s: SkuData, names: string[], mode: CompareMode, baseYears: Record<string, number> | undefined) => void;
  confirm: (s: SkuData, on: boolean) => Promise<void>;
  confirmGroup: (s: SkuData, field: ChannelConfirmField, value: boolean) => void;
}

/** 검토 요청 묶음 — ChannelTargetSection이 관리 */
export interface ReviewListProps {
  req: ReviewRequest | null;
  /** 고른 SKU id (고른 순서) · null이면 체크박스 숨김 (마스터 · PM · 요청 밖 · SKU별 결정에서만) */
  picked: string[] | null;
  onPick: (id: string) => void;
  onClearPick: () => void;
  onCreate: () => void;
}

function OptionPanel({ s, env, editable }: { s: SkuData; env: DetailEnv; editable: boolean }) {
  const [manualOpen, setManualOpen] = useState(false);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'err'>('idle');
  const model = finalOrderModel(s);
  const colors = s.hasColors ? s.colors.filter((c) => !c.archived) : [];
  const sizes = s.sizes.filter((z) => z.isActive);
  const ratioSum = sizes.reduce((a, z) => a + z.ratio, 0);
  const hasManual = Object.keys(s.finalOrderQty ?? {}).some((k) => !k.startsWith('__'));
  const canEdit = editable && !env.busy;

  const setColor = (id: string, v: number) => {
    const p = withColorQty(s, id, v);
    if (p) void env.save(s, p, '컬러 수량');
  };
  const setRow = (key: string, v: number) => {
    if (!model) return;
    const p = withOptionQty(s, model.rows.map((r) => (r.key === key ? { key, qty: v } : { key: r.key, qty: r.qty })));
    if (p) void env.save(s, p, '옵션 수량 수기 수정');
  };
  const cell = (key: string, qty: number) => (manualOpen && canEdit
    ? <span className="inline-block w-16"><CellInput value={qty} onCommit={(v) => setRow(key, v)} /></span>
    : fmt(qty));
  async function copy() {
    if (!model) return;
    try {
      const { activeSizes: az, activeColors: ac, hasColors, hasSizes, dispCS, dispC, dispS } = model;
      const rows: (string | number)[][] = hasColors && hasSizes
        ? [['컬러 \\ 사이즈', ...az.map((z) => z.label), '합계'], ...ac.map((c) => { const v = az.map((z) => dispCS(c.id, c.quantity, z.label, z.ratio)); return [c.name, ...v, v.reduce((a, b) => a + b, 0)]; })]
        : hasColors ? [['컬러', '수량'], ...ac.map((c) => [c.name, dispC(c.id, c.quantity)])]
          : [['사이즈', ...az.map((z) => z.label)], ['수량', ...az.map((z) => dispS(z.label, z.ratio))]];
      await navigator.clipboard.writeText(rows.map((r) => r.join('\t')).join('\n'));
      setCopied('ok');
    } catch { setCopied('err'); }
    setTimeout(() => setCopied('idle'), 1500);
  }

  return (
    <div className="space-y-2">
      <Hint strong="옵션 합계 = 발주량" rest="수량을 고치면 발주량과 월별 목표량도 함께 변경" />
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-3">
        <div className="space-y-2 min-w-0">
          {colors.length > 0 && (
            <div className="space-y-1">
              <b className="text-xs">컬러 수량</b>
              <ShareBar items={colors.map((c) => ({ label: c.name || '이름 없음', value: c.quantity }))} />
              {colors.map((c) => (
                <label key={c.id} className="flex items-center justify-between gap-2 text-xs">{c.name || '이름 없음'}
                  <span className="w-20"><CellInput value={c.quantity} disabled={!editable} onCommit={(v) => setColor(c.id, v)} /></span></label>
              ))}
            </div>
          )}
          {sizes.length > 0 && (
            <div className="space-y-1">
              <b className="text-xs">사이즈 비중</b>
              <ShareBar items={sizes.map((z) => ({ label: z.label, value: z.ratio }))} />
              {sizes.map((z) => (
                <label key={z.label} className="flex items-center justify-between gap-2 text-xs">{z.label}
                  <span className="w-20"><CellInput value={z.ratio} suffix="%" disabled={!editable} onCommit={(v) => void env.save(s, withSizeRatio(s, z.label, v), '사이즈 비중')} /></span></label>
              ))}
              {ratioSum !== 100 && <p className="text-[11px] font-semibold text-red-600">{ratioSum < 100 ? '100% 미달!' : '100% 초과!'} · 현재 {ratioSum}%</p>}
            </div>
          )}
          {colors.length === 0 && sizes.length === 0 && <p className="text-xs text-gray-500">옵션 없음 · SKU 리스트 카드에서 사이즈 개수 · 컬러명 입력</p>}
        </div>
        <div className="space-y-2 min-w-0">
          <b className="text-xs">옵션별 최종 발주량 · {s.orderPlans?.active ?? 1}안 {hasManual && !s.finalOrderConfirmedAt && <span className="ml-1 px-1.5 rounded-full bg-amber-100 text-amber-800 text-[10px]">수기 수정</span>}</b>
          {model ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                {model.hasColors && model.hasSizes ? (
                  <>
                    <thead><tr className="border-b border-gray-200 text-gray-500"><th className="text-left px-2 py-1 font-semibold">컬러</th>{model.activeSizes.map((z) => <th key={z.label} className="text-right px-2 py-1 font-semibold">{z.label}</th>)}<th className="text-right px-2 py-1 font-semibold">합계</th></tr></thead>
                    <tbody>
                      {model.activeColors.map((c) => {
                        const vals = model.activeSizes.map((z) => model.dispCS(c.id, c.quantity, z.label, z.ratio));
                        return <tr key={c.id} className="border-b border-gray-100"><td className="px-2 py-1">{c.name}</td>{model.activeSizes.map((z, i) => <td key={z.label} className="px-2 py-1 text-right">{cell(`cs|${c.id}|${z.label}`, vals[i])}</td>)}<td className="px-2 py-1 text-right font-semibold">{fmt(vals.reduce((a, b) => a + b, 0))}</td></tr>;
                      })}
                    </tbody>
                  </>
                ) : (
                  <>
                    <thead><tr className="border-b border-gray-200 text-gray-500"><th className="text-left px-2 py-1 font-semibold">옵션</th><th className="text-right px-2 py-1 font-semibold">수량</th></tr></thead>
                    <tbody>{model.rows.map((o) => <tr key={o.key} className="border-b border-gray-100"><td className="px-2 py-1">{o.label}</td><td className="px-2 py-1 text-right">{cell(o.key, o.qty)}</td></tr>)}</tbody>
                  </>
                )}
                <tfoot><tr className="font-semibold"><td className="px-2 py-1">합계</td><td colSpan={model.hasColors && model.hasSizes ? model.activeSizes.length + 1 : 1} className="px-2 py-1 text-right">{fmt(model.rows.reduce((a, o) => a + o.qty, 0))}</td></tr></tfoot>
              </table>
            </div>
          ) : <p className="text-xs text-gray-500">발주량이나 옵션 비중 입력 후 표시</p>}
          <div className="flex flex-wrap gap-1.5">
            <button disabled={!model} onClick={() => void copy()} className="text-xs px-2 py-0.5 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40">{copied === 'ok' ? '복사됨 ✓' : copied === 'err' ? '복사 실패' : '복사'}</button>
            {!s.hasColors && s.totalOrderQty > 0 && <button onClick={() => exportSkuOrderXlsx(s)} className="text-xs px-2 py-0.5 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">발주표</button>}
            <button disabled={!editable || !model} onClick={() => setManualOpen((v) => !v)} className="text-xs px-2 py-0.5 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40">{manualOpen ? '수정 닫기' : '최종 수량 수정'}</button>
            {hasManual && editable && <button onClick={() => { setManualOpen(false); void env.save(s, { finalOrderQty: {} }, '옵션 수기 해제'); }} className="text-xs px-2 py-0.5 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">비율대로 되돌리기</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 표 아래 접는 구역 (개편 4단계) — 닫아도 내용은 그대로 둠(채널 상세의 되돌리기 기록 유지) */
function Fold({ open, onToggle, title, summary, children }: { open: boolean; onToggle: () => void; title: string; summary: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-white rounded border border-gray-200 min-w-0">
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2 text-left hover:bg-gray-50">
        <span className="w-3 text-gray-400">{open ? '▾' : '▸'}</span>
        <b className="text-sm text-gray-800">{title}</b>
        <span className="text-[11px] text-gray-500">{summary}</span>
      </button>
      <div hidden={!open} className="px-3 pb-3 pt-2 border-t border-gray-100 space-y-2 min-w-0">{children}</div>
    </div>
  );
}

// ── 통합 표 (개편 3단계) — ① 대응SKU 실적 · ② 월 계획 · ③ 채널 배분을 한 표로, 월 열을 위아래로 맞춤 ──
const GROUP_TONE: Record<ChannelConfirmField, string> = {
  step2PlatformConfirmed: 'text-emerald-800', step2BrandConfirmed: 'text-amber-800', step2GlobalConfirmed: 'text-sky-800',
};

function Worksheet({ s, r, env, planEditable, canPrice, setOpts, monthComp, compTotal, onEditCompare }: {
  s: SkuData; r: SkuReview; env: DetailEnv;
  planEditable: boolean;
  canPrice: (ch: Channel) => boolean;
  setOpts: (channels: readonly Channel[], opt: string) => void;
  monthComp: (mo: Month) => number | null;
  compTotal: number | null;
  /** ① 기준 띠 [변경] — 표 아래 근거 구역을 펼침 */
  onEditCompare: () => void;
}) {
  const { role, perm, tableau, writeBlocked, save, setMonthPlan, confirmGroup } = env;
  const m = r.money;
  const months = getSkuMonths(s.releaseDate);
  const finalized = !!s.finalOrderConfirmedAt;
  const allRole = isAllChannelRole(role);
  const qty = s.totalOrderQty;
  const n = months.length;

  // 소진 · 리오더 — 누적 판매 목표가 발주량에 닿는 달 ▼, 그 뒤는 빗금
  const coverIdx = qty > 0 && m.planQty > 0 ? m.coverage.cumulative.findIndex((c) => c >= qty) : -1;
  const isOver = (i: number) => coverIdx >= 0 && i > coverIdx;
  const overLabel = isSeasonOnly(s) ? '품절' : '리오더';
  const mCls = (i: number) => (i === 0 ? 'border-l border-gray-200' : '');
  const hatch = (i: number) => (isOver(i) ? HATCH : undefined);

  // 그룹 · 채널
  const groups = REVIEW_GROUPS.filter((f) => groupApplies(s, f));
  const rowsOf = (f: ChannelConfirmField) => m.channels.filter((c) => CHANNEL_CONFIRM_GROUP[c.channel].field === f);
  const [open, setOpen] = useState<Set<ChannelConfirmField>>(() => new Set(allRole ? groups : groups.filter((f) => canConfirmGroup(role, f))));
  const toggle = (f: ChannelConfirmField) => setOpen((prev) => { const nx = new Set(prev); if (nx.has(f)) nx.delete(f); else nx.add(f); return nx; });
  const cellEditable = (ch: Channel) => perm.step2 && ownsChannel(role, ch) && !s[CHANNEL_CONFIRM_GROUP[ch].field] && !finalized && !writeBlocked;
  const mktEditable = perm.step2 && ownsChannel(role, '마케팅') && !isMarketingLocked(s) && !finalized && !writeBlocked;
  const mine = (ch: Channel | '마케팅') => !allRole && ownsChannel(role, ch);
  const setCell = (ch: Channel, mo: Month, v: number) => {
    const next = Math.max(0, Math.round(v));
    const old = qtyOf(s, ch, mo);
    void save(s, { channelMonthQty: s.channelMonthQty.map((e) => (e.channel === ch && e.month === mo ? { ...e, qty: next } : e)) }, `${ch} ${mo}월 ${fmt(old)} → ${fmt(next)}`);
  };
  const setMkt = (mo: Month, v: number) => {
    const next = Math.max(0, Math.round(v));
    void save(s, { marketingMonthQty: { ...(s.marketingMonthQty ?? {}), [mo]: next } }, `마케팅 ${mo}월 ${fmt(s.marketingMonthQty?.[mo] ?? 0)} → ${fmt(next)}`);
  };

  // 대응SKU 채널 비중 (%) — 비교 칸 "34% ▲4p"
  const dist = r.compare.channelDist;
  const distSum = dist ? m.channels.reduce((a, c) => a + (dist[c.channel] ?? 0), 0) : 0;
  const cmpShare = (ch: Channel) => (dist && distSum > 0 ? ((dist[ch] ?? 0) / distSum) * 100 : null);
  const delta = (cur: number, base: number | null, unit: '%' | 'p') => {
    if (base === null || (unit === '%' && !base)) return null;
    const d = unit === '%' ? Math.round(((cur - base) / base) * 100) : Math.round(cur - base);
    if (d === 0) return <span className="ml-1 text-[10px] text-gray-400">±0{unit}</span>;
    return <span className={`ml-1 text-[10px] ${d > 0 ? 'text-blue-600' : 'text-red-500'}`}>{d > 0 ? '▲' : '▼'}{Math.abs(d)}{unit}</span>;
  };

  const maxBar = Math.max(1, ...m.months.map((x) => x.plan), ...months.map((mo) => monthComp(mo) ?? 0));
  const b2cRows = m.channels.filter((c) => (B2C_CHANNELS as readonly string[]).includes(c.channel));
  const allOpt = b2cRows.length > 0 && b2cRows.every((c) => c.opt === b2cRows[0].opt) ? b2cRows[0].opt : null;
  const mktTotal = months.reduce((a, mo) => a + (s.marketingMonthQty?.[mo] ?? 0), 0);
  const showMkt = mktTotal > 0 || mktEditable;
  const chMonthSum = (chs: Channel[], mo: Month) => chs.reduce((a, ch) => a + qtyOf(s, ch, mo), 0);

  const th = 'px-1 py-1 font-semibold whitespace-nowrap';
  const td = 'px-1 py-1 text-right whitespace-nowrap';
  const c0 = 'sticky left-0 z-[1] text-left border-r border-gray-200';
  const zm = 'bg-indigo-50/40';
  const zsep = 'border-l-2 border-gray-400';
  const blankMoney = <><td className={`${zm} ${zsep}`} /><td className={zm} /><td className={zm} /><td className={zm} /></>;
  const band = (no: string, title: string, sub: ReactNode) => (
    <tr className="bg-gray-100 border-t border-gray-200">
      <td className={`${c0} bg-gray-100 px-2 py-1 whitespace-nowrap`}><b className="text-gray-800">{no} {title}</b></td>
      <td colSpan={n + 6} className="px-2 py-1 text-left text-[11px] text-gray-600">{sub}</td>
    </tr>
  );
  const money = (rev: number, pro: number | null, cm: number | null, extra?: ReactNode) => (
    <><td className={`${td} ${zm}`}>{won(rev)}</td><td className={`${td} ${zm}`}>{won(pro)}{extra}</td><td className={`${td} ${zm}`}>{pct(cm)}</td></>
  );

  return (
    <div className="bg-white rounded border border-gray-200 min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pt-2 pb-1.5">
        <b className="text-sm text-gray-800">📊 {s.orderPlans?.active ?? 1}안 월 계획 · 채널 배분</b>
        <span className="flex flex-wrap gap-x-3 text-[11px] text-gray-500">
          <span className="inline-flex items-center gap-1"><i className="w-3 h-3 rounded-sm border border-gray-300 bg-white" />입력 칸</span>
          <span className="inline-flex items-center gap-1"><b className="text-emerald-700">▼</b>소진월</span>
          <span className="inline-flex items-center gap-1"><i className="w-3 h-3 rounded-sm border border-gray-200" style={HATCH} />{overLabel} 구간</span>
          <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-gray-300" />대응SKU 실적</span>
          <span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-indigo-600" />판매 목표</span>
          {!allRole && role && <span className="inline-flex items-center gap-1 text-teal-800"><i className="w-3 h-3 rounded-sm bg-teal-50 border-l-2 border-teal-500" />내 담당 채널</span>}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums min-w-[900px]">
          <thead>
            <tr className="text-[11px] text-gray-500">
              <th className={`${c0} bg-white`} />
              <th colSpan={n + 2} className={`${th} text-center border-l border-gray-200`}>월별 수량 (개)</th>
              <th colSpan={4} className={`${th} text-center ${zsep} bg-indigo-50`}>판매가 · 수익 (원)</th>
            </tr>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className={`${c0} bg-white ${th}`}>발주 {fmt(qty)}</th>
              {m.months.map((x, i) => (
                <th key={x.month} className={`${th} text-right min-w-[54px] ${mCls(i)} ${i === coverIdx ? 'text-emerald-700' : ''}`} style={hatch(i)}>
                  <span className={`block text-[10px] leading-3 font-bold ${i === coverIdx ? 'text-emerald-700' : 'text-orange-600'}`}>{i === coverIdx ? '▼ 소진' : i === coverIdx + 1 ? overLabel : ' '}</span>
                  {x.ym.slice(2, 4)}.{x.month}월
                </th>
              ))}
              <th className={`${th} text-right border-l border-gray-300`}>합계</th>
              <th className={`${th} text-right`}>비중<span className="block text-[10px] font-normal">대응 대비</span></th>
              <th className={`${th} text-left ${zsep} bg-indigo-50`}>판매가</th>
              <th className={`${th} text-right bg-indigo-50`}>순매출</th>
              <th className={`${th} text-right bg-indigo-50`}>공헌이익</th>
              <th className={`${th} text-right bg-indigo-50`}>CM%</th>
            </tr>
            <tr>
              <td className={`${c0} bg-white`} />
              {m.months.map((x, i) => {
                const c = monthComp(x.month) ?? 0;
                return <td key={x.month} className={`px-1 pt-1 ${mCls(i)}`} style={hatch(i)} title={`대응 ${fmt(c)} · 목표 ${fmt(x.plan)} · 누적 ${fmt(m.coverage.cumulative[i] ?? 0)}`}>
                  <div className="h-12 flex items-end justify-center gap-0.5"><i className="block w-2.5 rounded-t-sm bg-gray-300" style={{ height: `${(c / maxBar) * 100}%` }} /><i className="block w-2.5 rounded-t-sm bg-indigo-600" style={{ height: `${(x.plan / maxBar) * 100}%` }} /></div>
                </td>;
              })}
              <td className="border-l border-gray-300" /><td />{blankMoney}
            </tr>
          </thead>
          <tbody>
            {band('①', '기준', <>대응SKU {compareNamesOf(s).join(' · ') || '없음'} · {r.compare.modeLabel} <button type="button" onClick={onEditCompare} className="ml-1 px-1.5 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">{perm.skuBasic ? '변경 · 근거' : '근거 보기'}</button></>)}
            <tr className="border-b border-gray-100 text-gray-500">
              <td className={`${c0} bg-white px-2 py-1 pl-4 whitespace-nowrap`}>대응SKU 실적</td>
              {compTotal === null
                ? <td colSpan={n + 1} className="px-1.5 py-1 text-gray-400 border-l border-gray-200">{tableau.errors.shipments ? '실적 불러오기 실패' : tableau.loading ? '불러오는 중' : '대응SKU 없음'}</td>
                : <>{months.map((mo, i) => <td key={mo} className={`${td} ${mCls(i)}`} style={hatch(i)}>{monthComp(mo) === null ? '–' : fmt(monthComp(mo)!)}</td>)}<td className={`${td} border-l border-gray-300`}>{fmt(compTotal)}</td></>}
              <td />{blankMoney}
            </tr>

            {band('②', '월 계획', planEditable ? '판매 목표 칸 수정 · 월 합계를 채널 비중대로 나눔 · 일괄은 표 아래' : 'PM이 정한 월 흐름 · 보기만')}
            <tr className="border-b border-gray-100">
              <td className={`${c0} bg-white px-2 py-1 pl-4 whitespace-nowrap font-semibold`}>판매 목표</td>
              {m.months.map((x, i) => (
                <td key={x.month} className={`px-0.5 py-0.5 ${mCls(i)}`} style={hatch(i)} title={monthComp(x.month) ? `대응 대비 ${Math.round(((x.plan - monthComp(x.month)!) / monthComp(x.month)!) * 100)}%` : undefined}>
                  <CellInput value={x.plan} disabled={!planEditable} onCommit={(v) => setMonthPlan(s, r, new Map([[x.month, v]]), `${x.month}월 판매 목표`)} />
                </td>
              ))}
              <td className={`${td} border-l border-gray-300 font-bold`}>{fmt(m.planQty)}{delta(m.planQty, compTotal, '%')}</td>
              <td />{blankMoney}
            </tr>
            <tr className="border-b border-gray-100 text-gray-500">
              <td className={`${c0} bg-white px-2 py-1 pl-4 whitespace-nowrap`}>누적 vs 발주</td>
              {m.coverage.cumulative.map((c, i) => <td key={i} className={`${td} ${mCls(i)} ${c > qty ? 'text-red-500 font-semibold' : ''}`} style={hatch(i)}>{fmt(c)}</td>)}
              <td className={`${td} border-l border-gray-300`}>{fmt(qty)}</td><td />{blankMoney}
            </tr>

            {band('③', '채널 배분', <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>채널 합계 = 판매 목표 · 그룹별 확정 · {allRole ? '전 채널 수정' : '내 담당 채널만 수정'}</span>
              {B2C_CHANNELS.some(canPrice) && <span className="inline-flex flex-wrap items-center gap-1">· B2C 판매가 일괄{PCT_OPTS.map((o) => <Chip key={o} on={allOpt === o} onClick={() => setOpts(B2C_CHANNELS, o)}>{optLabel(o)} {fmt(r.pricer(o, s.price))}원</Chip>)}</span>}
            </span>)}
            {groups.map((f) => {
              const rows = rowsOf(f);
              const chs = rows.map((c) => c.channel);
              const isOpen = open.has(f);
              const gQty = rows.reduce((a, c) => a + c.planQty, 0);
              const gRev = rows.reduce((a, c) => a + c.revenue, 0);
              const gPro = rows.some((c) => c.profit === null) ? null : rows.reduce((a, c) => a + (c.profit as number), 0) - (f === 'step2PlatformConfirmed' ? m.marketingCost : 0);
              const gShare = rows.reduce((a, c) => a + c.share, 0);
              const on = !!s[f];
              const can = perm.step2 && !writeBlocked && canConfirmGroup(role, f);
              const myGroup = !allRole && canConfirmGroup(role, f);
              return (
                <Fragment key={f}>
                  <tr className={`border-t border-gray-200 ${myGroup ? 'bg-teal-50' : 'bg-white'}`}>
                    <td className={`${c0} ${myGroup ? 'bg-teal-50' : 'bg-white'} px-2 py-1 whitespace-nowrap`}>
                      <button onClick={() => toggle(f)} className={`font-bold ${GROUP_TONE[f]}`} aria-expanded={isOpen}>
                        <span className="inline-block w-3 text-gray-400">{isOpen ? '▾' : '▸'}</span>{REVIEW_GROUP_LABEL[f]} <span className="font-normal text-gray-500">{chs.length}개</span>
                      </button>
                    </td>
                    {months.map((mo, i) => <td key={mo} className={`${td} ${mCls(i)} ${isOpen ? 'text-gray-400' : 'text-gray-700'}`} style={hatch(i)}>{fmt(chMonthSum(chs, mo) + (f === 'step2PlatformConfirmed' ? (s.marketingMonthQty?.[mo] ?? 0) : 0))}</td>)}
                    <td className={`${td} border-l border-gray-300 font-semibold`}>{fmt(gQty + (f === 'step2PlatformConfirmed' ? mktTotal : 0))}</td>
                    <td className={`${td} text-gray-500`}>{Math.round(gShare)}%</td>
                    <td className={`px-1.5 py-1 ${zsep} ${zm}`}>
                      {on
                        ? <button disabled={!can} onClick={() => confirmGroup(s, f, false)} title={can ? '눌러서 확정 해제' : '담당 그룹만 해제 가능'} className="px-1.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-semibold disabled:cursor-default">확정 ✓</button>
                        : <button disabled={!can} onClick={() => confirmGroup(s, f, true)} title={can ? undefined : '담당 그룹만 확정 가능'} className="px-2 rounded border border-gray-400 bg-white text-gray-700 text-[11px] font-semibold hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">{REVIEW_GROUP_LABEL[f]} 확정</button>}
                    </td>
                    {money(gRev, gPro, cmOf(gRev, gPro))}
                  </tr>
                  {isOpen && rows.map((c) => {
                    const ed = cellEditable(c.channel);
                    const my = mine(c.channel);
                    const isB2c = (B2C_CHANNELS as readonly string[]).includes(c.channel);
                    const chBase = basePriceOf(s, c.channel);
                    const bg = my ? 'bg-teal-50' : 'bg-white';
                    const varNote = c.varRatio === null ? '변동비 없음' : `변동비 ${(c.varRatio * 100).toFixed(1)}%${c.varSource === 'default' ? ' · 25% 대체' : c.varSource === 'period' ? ' · 기간 대체' : ''}`;
                    return (
                      <tr key={c.channel} className={`border-b border-gray-100 ${bg}`}>
                        <td className={`${c0} ${bg} px-2 py-0.5 pl-6 whitespace-nowrap ${my ? 'border-l-2 border-l-teal-500' : ''}`}>
                          {c.channel}{my && <span className="ml-1 text-[9px] px-1 rounded bg-teal-600 text-white font-semibold">내 채널</span>}
                          {s[CHANNEL_CONFIRM_GROUP[c.channel].field] && <span className="ml-1 text-[9px] text-emerald-600">잠김</span>}
                        </td>
                        {months.map((mo, i) => (
                          <td key={mo} className={`px-0.5 py-0.5 ${mCls(i)}`} style={hatch(i)}>
                            <CellInput value={qtyOf(s, c.channel, mo)} disabled={!ed} onCommit={(v) => setCell(c.channel, mo, v)} />
                          </td>
                        ))}
                        <td className={`${td} border-l border-gray-300 font-semibold`}>{fmt(c.planQty)}</td>
                        <td className={td}>{Math.round(c.share)}%{delta(c.share, cmpShare(c.channel), 'p')}</td>
                        <td className={`px-1.5 py-0.5 ${zsep} ${zm}`}>
                          {isB2c ? (
                            <select value={c.opt ?? '__mixed'} disabled={!canPrice(c.channel)} onChange={(e) => e.target.value !== '__mixed' && setOpts([c.channel], e.target.value)} aria-label={`${c.channel} 판매가`}
                              className="max-w-[128px] text-[11px] border border-gray-300 rounded px-1 py-0.5 bg-white disabled:bg-transparent disabled:border-transparent disabled:text-gray-600 disabled:appearance-none">
                              {c.opt === null && <option value="__mixed">월별 다름 · 평균 {fmt(c.netPrice)}</option>}
                              <option value="">판매가 · {fmt(chBase)}</option>
                              {B2C_OPTS.filter((o) => !o.coreOnly || s.coreSku).map((o) => <option key={o.id} value={o.id}>{o.label} · {fmt(r.pricer(o.id, chBase))}</option>)}
                            </select>
                          ) : <span className="text-[11px]"><span className="text-gray-400">공급가</span> {fmt(c.netPrice)}</span>}
                        </td>
                        {money(c.revenue, c.profit, c.cm, <>
                          {c.varSource === 'default' && <span className="ml-1 px-1 rounded-full bg-amber-100 text-amber-800 text-[9px] font-semibold" title={varNote}>25% 대체</span>}
                          {c.varSource === 'period' && <span className="ml-1 px-1 rounded-full bg-amber-100 text-amber-800 text-[9px] font-semibold" title={varNote}>기간 대체</span>}
                          {c.varSource === 'none' && !tableau.loading && <span className="ml-1 px-1 rounded-full bg-red-100 text-red-700 text-[9px] font-semibold" title="변동비 데이터 로드 실패 · 공헌이익 계산 안 함">로드 실패</span>}
                        </>)}
                      </tr>
                    );
                  })}
                  {isOpen && f === 'step2PlatformConfirmed' && showMkt && (
                    <tr className={`border-b border-gray-100 ${mine('마케팅') ? 'bg-teal-50' : 'bg-white'}`}>
                      <td className={`${c0} ${mine('마케팅') ? 'bg-teal-50 border-l-2 border-l-teal-500' : 'bg-white'} px-2 py-0.5 pl-6 whitespace-nowrap`}>마케팅{mine('마케팅') && <span className="ml-1 text-[9px] px-1 rounded bg-teal-600 text-white font-semibold">내 채널</span>}</td>
                      {months.map((mo, i) => (
                        <td key={mo} className={`px-0.5 py-0.5 ${mCls(i)}`} style={hatch(i)}>
                          <CellInput value={s.marketingMonthQty?.[mo] ?? 0} disabled={!mktEditable} onCommit={(v) => setMkt(mo, v)} />
                        </td>
                      ))}
                      <td className={`${td} border-l border-gray-300 font-semibold`}>{fmt(mktTotal)}</td>
                      <td className={`${td} text-gray-400`}>–</td>
                      <td className={`px-1.5 py-0.5 ${zsep} ${zm} text-[11px] text-gray-400`}>원가만 차감</td>
                      <td className={`${td} ${zm} text-gray-400`}>–</td><td className={`${td} ${zm}`}>{won(-m.marketingCost)}</td><td className={zm} />
                    </tr>
                  )}
                </Fragment>
              );
            })}
            <tr className="border-t-2 border-gray-500 font-bold">
              <td className={`${c0} bg-white px-2 py-1`}>합계</td>
              {m.months.map((x, i) => <td key={x.month} className={`${td} ${mCls(i)}`} style={hatch(i)}>{fmt(x.plan)}</td>)}
              <td className={`${td} border-l border-gray-300`}>{fmt(m.planQty)}</td>
              <td className={td}>100%</td>
              <td className={`${zsep} ${zm}`} />
              {money(m.revenue, m.profit, m.cm)}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="px-3 py-1.5 text-[11px] text-gray-500">할인가 = 판매가 × (1 − 할인율), 10원 올림 · 판매가는 채널별 하나 · 예전에 월마다 다르게 넣은 채널은 “월별 다름”, 하나를 고르면 모든 달에 적용{s.isPriceConfirmed ? ' · 가격 확정 SKU · 확정 가격 기준 할인' : ''} · 순매출 · 공헌이익은 {env.basis === 'order' ? '이번 발주량까지만 판매' : '판매 목표 전체(리오더 포함)'} 기준</p>
    </div>
  );
}

function Detail({ s, r, env }: { s: SkuData; r: SkuReview; env: DetailEnv }) {
    const { role, perm, tableau, global, writeBlocked, busy, basis, onNavigateToSku, save, setOrder, pickPlan, canSwitch, setMonthPlan, saveCompare, confirm } = env;
    const m = r.money;
    const active = s.orderPlans?.active ?? 1;
    const months = getSkuMonths(s.releaseDate);
    const finalized = !!s.finalOrderConfirmedAt;
    // 칸 입력은 저장 중에도 유지 — busy로 잠그면 칸이 다시 그려져 다음 칸 클릭이 사라짐
    const orderEditable = perm.skuBasic && !finalized && !writeBlocked;
    // MOQ는 MASTER · PM만 · 안마다 따로 (SKU 카드는 지금 고른 안 값을 보기만)
    const moqEditable = isAllChannelRole(role) && !finalized && !writeBlocked;
    const lockedChannels = getConfirmedChannels(s);
    const allLocked = m.channels.every((c) => lockedChannels.includes(c.channel));
    const planEditable = perm.step1 && !finalized && !allLocked && !writeBlocked;
    const canPlan = planEditable && !busy;
    const hasError = r.issues.some((i) => i.level === 'error') || global.some((i) => i.level === 'error');
    const model = finalOrderModel(s);
    const confirmReason = !perm.orderConfirm ? '발주 확정 권한 없음' : tableau.loading ? '태블로 불러오는 중' : hasError ? '오류 해결 후 확정 가능' : !model ? '옵션이나 수량 없음' : '';
    const stored = s.orderPlans?.other ?? null;
    const other = stored ? skuMoney({ ...s, ...stored }, { pricer: r.pricer, varCost: r.varCost, basis }) : null;
    const monthComp = (mo: Month) => r.compare.monthly[mo] ?? null;
    const compTotal = months.reduce<number | null>((acc, mo) => { const c = monthComp(mo); return c === null ? acc : (acc ?? 0) + c; }, null);
    const growth = (x: number, c: number | null) => {
      if (!c) return <span className="text-gray-300">–</span>;
      const v = Math.round(((x - c) / c) * 100);
      return <span className={v >= 0 ? 'text-blue-600' : 'text-red-500'}>{v >= 0 ? '+' : '−'}{Math.abs(v)}%</span>;
    };
    const [fold, setFold] = useState({ cmp: false, opt: false, tool: false });
    const flip = (k: 'cmp' | 'opt' | 'tool') => setFold((f) => ({ ...f, [k]: !f[k] }));
    const cmpRef = useRef<HTMLDivElement>(null);
    const [cmpOpen, setCmpOpen] = useState(false);

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
    const compShare = r.compare.channelDist
      ? m.channels.map((c) => ({ label: c.channel as string, value: r.compare.channelDist?.[c.channel] ?? 0 })).filter((x) => x.value > 0)
      : [];

    // 판매가
    const canPrice = (ch: Channel) => perm.step2 && ownsChannel(role, ch) && !s[CHANNEL_CONFIRM_GROUP[ch].field] && !finalized && !writeBlocked && !busy;
    const setOpts = (channels: readonly Channel[], opt: string) => {
      const nextOpts = { ...(s.pricingOpts ?? {}) };
      channels.filter(canPrice).forEach((ch) => months.forEach((mo) => { nextOpts[`${ch}-${mo}`] = opt; }));
      void save(s, { pricingOpts: nextOpts }, `판매가 ${optLabel(opt)}`);
    };
    const seasonFit = isSeasonOnly(s) && isAllChannelRole(role) && m.planQty > 0 && s.totalOrderQty > 0 && m.planQty !== s.totalOrderQty;
    const fitToOrder = () => {
      const scope = planScopeOf(s);
      const marketing = scope.months.reduce((a, mo) => a + (s.marketingMonthQty?.[mo] ?? 0), 0);
      void save(s, { channelMonthQty: scaleOpenChannelsTo(s.channelMonthQty, scope, s.totalOrderQty - marketing) as SkuData['channelMonthQty'] }, '판매 목표를 발주량에 맞춤');
    };
    const qtyChanged = finalized && s.finalOrderConfirmedOrderQty !== undefined && s.finalOrderConfirmedOrderQty !== s.totalOrderQty;

    // ── 결정 패널 (개편 2단계) — 결정 · 결과 · 수익 3묶음 · 다른 안은 한 줄 비교 ──
    const qty = s.totalOrderQty;
    const moqNow = moqOf(s);
    const vd = verdict(s, m);
    const otherNo: 1 | 2 = active === 1 ? 2 : 1;
    const otherQty = stored?.totalOrderQty ?? 0;
    const otherMoq = stored ? moqOf({ moq: stored.moq ?? s.moq }) : 0;
    const sign = (n: number, f: (v: number) => string) => `${n >= 0 ? '+' : '−'}${f(Math.abs(n))}`;
    const diffLine = stored && other ? `지금 안 대비 발주 ${sign(otherQty - qty, fmt)}개 · 공헌이익 ${other.profit !== null && m.profit !== null ? sign(other.profit - m.profit, won) : '–'} · 발주금액 ${other.orderAmount !== null && m.orderAmount !== null ? sign(other.orderAmount - m.orderAmount, won) : '–'}` : null;
    const kv = (label: string, value: ReactNode, big = false) => (
      <div className="flex flex-col min-w-0"><small className="text-[11px] text-gray-500">{label}</small><b className={`tabular-nums whitespace-nowrap ${big ? 'text-[17px] font-extrabold' : 'text-sm font-bold'}`}>{value}</b></div>
    );
    const moqChip = moqNow <= 0
      ? <span className="px-1.5 rounded-full bg-gray-100 text-gray-500 text-[11px] font-semibold">MOQ 미입력</span>
      : qty < moqNow
        ? <span className="px-1.5 rounded-full bg-red-100 text-red-700 text-[11px] font-semibold">MOQ 미달</span>
        : <span className="px-1.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-semibold">MOQ 충족</span>;
    const planSwitch = (
      <span className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs" role="group" aria-label="안 전환">
        {([1, 2] as const).map((no) => {
          const on = no === active;
          const exists = on || !!stored;
          const edge = no === 2 ? 'border-l border-gray-300' : '';
          if (!exists) {
            return <button key={no} disabled={!canSwitch(s)} onClick={() => pickPlan(s, no)} title="현재 값 복사 후 수량 · MOQ · 판매가만 바꿔 비교"
              className={`px-2 py-0.5 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed ${edge}`}>+ {no}안 만들기</button>;
          }
          return <button key={no} aria-pressed={on} disabled={on || !canSwitch(s)} onClick={() => pickPlan(s, no)} title={on ? '지금 고른 안' : '이 안으로 전환'}
            className={`px-2.5 py-0.5 font-semibold ${edge} ${on ? 'bg-indigo-600 text-white cursor-default' : 'bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed'}`}>{no}안{on ? ' · 지금' : ''}</button>;
        })}
      </span>
    );
    return (
      <div className="space-y-2.5 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="text-base font-extrabold text-gray-900">{s.skuName || '(SKU명 미입력)'}</h3>
          <span className="px-1.5 rounded-full bg-indigo-50 text-indigo-800 text-[11px] font-semibold">{s.brand}</span>
          {stateChip(s)}
          {planSwitch}
          <span className="text-[11px] text-gray-500 tabular-nums">{s.category} · {s.releaseDate ? `${s.releaseDate.slice(5).replace('-', '/')} 오픈` : '오픈일 미정'} · 판매가 {s.price ? fmt(s.price) : '없음'} · 원가 {s.cost ? fmt(s.cost) : '없음'}{isSeasonOnly(s) ? ' · 시즌 한정' : ''}</span>
          <span className="flex-1" />
          {onNavigateToSku && <button onClick={() => onNavigateToSku(s)} className="text-xs px-2 py-0.5 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">SKU카드 →</button>}
        </div>
        {(r.issues.length > 0 || qtyChanged) && (
          <div className="flex flex-wrap gap-1.5">
            {qtyChanged && <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800">발주량 변경됨 · 확정 {fmt(s.finalOrderConfirmedOrderQty!)}개 → 현재 {fmt(s.totalOrderQty)}개</span>}
            {r.issues.map((i, k) => <span key={k} className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${i.level === 'error' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{i.what} · {i.effect}</span>)}
          </div>
        )}

        {/* 결정 패널 — 왼쪽부터 내가 정하는 것 → 그 결과 → 돈 */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1.25fr)] rounded-lg border-2 border-indigo-500 bg-white shadow-[0_0_0_3px_#eef2ff] divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
          <section className="p-3 flex flex-col gap-1.5 min-w-0">
            <h4 className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500">결정 · {active}안{!orderEditable && !finalized && <span className="px-1.5 rounded-full bg-gray-100 text-gray-500 font-semibold">보기만</span>}</h4>
            <div className="flex flex-wrap items-start gap-x-4 gap-y-1.5">
              <div className="flex flex-col"><small className="text-[11px] text-gray-500">발주량</small>
                {orderEditable
                  ? <span className="w-28 text-lg font-extrabold text-gray-900"><CellInput value={qty} disabled={!orderEditable} onCommit={(n) => setOrder(s, n)} /></span>
                  : <b className="text-lg font-extrabold text-gray-900 tabular-nums">{fmt(qty)}</b>}
              </div>
              <div className="flex flex-col"><small className="text-[11px] text-gray-500">MOQ</small>
                {moqEditable
                  ? <span className="w-24 text-sm font-bold text-gray-900"><CellInput value={s.moq ?? 0} disabled={!moqEditable} onCommit={(n) => void save(s, { moq: Math.max(0, Math.round(n)) }, `MOQ ${fmt(s.moq ?? 0)} → ${fmt(n)}`)} /></span>
                  : <b className="text-sm font-bold text-gray-900 tabular-nums leading-7">{moqNow ? fmt(moqNow) : '미입력'}</b>}
              </div>
              <div className="flex flex-col gap-1"><small className="text-[11px] text-gray-500">MOQ 판정</small>{moqChip}</div>
            </div>
            {orderEditable && <p className="text-[11px] text-gray-500"><b className="text-indigo-800">발주량을 바꾸면</b> 월별 판매 목표도 기존 비중대로 함께 변경</p>}
          </section>
          <section className="p-3 flex flex-col gap-1.5 min-w-0">
            <h4 className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500">결과 <span className={`px-1.5 rounded-full font-semibold ${vd.cls}`}>{vd.text}</span></h4>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {kv('소진', coverOf(qty, m))}{kv('판매 목표', `${fmt(m.planQty)}개`)}{kv('리오더', `${fmt(m.reorderQty)}개`)}{kv('시즌 후 잔여', won(m.leftoverAmount))}
            </div>
          </section>
          <section className="p-3 flex flex-col gap-1.5 min-w-0">
            <h4 className="text-[11px] font-bold text-gray-500">수익 · {active}안 전체</h4>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {kv('순매출', won(m.revenue), true)}{kv('공헌이익', won(m.profit), true)}{kv('CM%', pct(m.cm), true)}{kv('발주금액', won(m.orderAmount))}
            </div>
          </section>
        </div>
        {stored && other && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs tabular-nums">
            <b className="text-gray-700">{otherNo}안 · 보관</b>
            <span className="text-gray-600">발주 <b className="text-gray-900">{fmt(otherQty)}</b> · MOQ {otherMoq ? fmt(otherMoq) : '미입력'}{otherMoq > 0 && otherQty < otherMoq ? ' (미달)' : ''} · 소진 {coverOf(otherQty, other)} · 순매출 {won(other.revenue)} · 공헌이익 {won(other.profit)} · CM% {pct(other.cm)} · 발주금액 {won(other.orderAmount)}</span>
            {diffLine && <span className="font-semibold text-indigo-800 bg-indigo-50 rounded px-1.5">{diffLine}</span>}
          </div>
        )}

        <Worksheet s={s} r={r} env={env} planEditable={planEditable} canPrice={canPrice} setOpts={setOpts} monthComp={monthComp} compTotal={compTotal} onEditCompare={() => { setFold((f) => ({ ...f, cmp: true })); if (perm.skuBasic) setCmpOpen(true); setTimeout(() => cmpRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60); }} />
              {planEditable && <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 px-1">
                <span className="text-[11px] font-bold text-gray-500">② 월 계획 일괄</span>
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
                {names.length > 0 && Object.keys(r.compare.monthly).length > 0 && planEditable && (
                  <>
                    <button disabled={!canPlan} onClick={() => setMonthPlan(s, r, new Map(months.filter((mo) => monthComp(mo) !== null).map((mo) => [mo, Math.round(monthComp(mo)!)])), '대응SKU 동일수량 반영', true)}
                      className="px-2 py-0.5 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50">대응SKU 동일수량 반영</button>
                    {(() => {
                      const targets = monthTargetsByCompareShare(s.totalOrderQty, months, monthComp);
                      return (
                        <button disabled={!canPlan || !targets} title={targets ? `${active}안 발주량 ${fmt(s.totalOrderQty)}개를 대응SKU 월별 실적 비중으로 분배` : '발주량 입력 후 사용 가능'}
                          onClick={() => targets && setMonthPlan(s, r, targets, '대응SKU 월별비중 반영', true)}
                          className="px-2 py-0.5 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50">대응SKU 월별비중 반영</button>
                      );
                    })()}
                    {compareChanged && <span className="px-1.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-semibold">대응SKU 변경됨 · 월 계획 유지</span>}
                  </>
                )}
                {seasonFit && <button disabled={!canPlan} onClick={fitToOrder} className="px-2 py-0.5 rounded border border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-50">판매 목표를 발주량에 맞추기</button>}
              </div>}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 items-start">
          <div ref={cmpRef} className="min-w-0"><Fold open={fold.cmp} onToggle={() => flip('cmp')} title="근거 · 대응SKU"
            summary={<>{names.length ? names.join(' · ') : '대응SKU 없음'} · {r.compare.modeLabel} · 8개월 실적 {compTotal === null ? '–' : fmt(compTotal)} · 목표 대비 {compTotal === null ? '–' : growth(m.planQty, compTotal)}</>}>
              <div className="space-y-1.5">
                <div className="flex justify-end"><button onClick={() => setCmpOpen((v) => !v)} className="text-xs underline text-indigo-700">{cmpOpen ? '설정 닫기' : '대응SKU · 기간 · 기준연도 변경'}</button></div>
                <div className="flex flex-wrap items-center gap-1">
                  {names.length === 0 && <span className="text-xs text-gray-500">대응SKU 없음</span>}
                  {names.map((n) => {
                    const ship = tableau.shipments.find((x) => x.name === n);
                    const baseInfo = mode === 'samePeriod' && ship && ry ? r.compare.bases.find((b) => b.name === n) : undefined;
                    return (
                      <span key={n} className={`inline-flex items-center gap-1 text-[11px] pl-2 pr-1 py-0.5 rounded-full border ${!ship && !tableau.loading && !tableau.errors.shipments ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-indigo-200 bg-indigo-50 text-indigo-800'}`}>
                        {n}
                        {cmpOpen && baseInfo && ship && (
                          <select aria-label={`${n} 기준연도`} disabled={!canCompare}
                            value={baseInfo.source === 'manual' ? String(baseInfo.year) : ''}
                            onChange={(e) => {
                              const nextYears = { ...(s.comparisonSku.baseYears ?? {}) };
                              if (e.target.value) nextYears[n] = Number(e.target.value); else delete nextYears[n];
                              saveCompare(s, names, mode, nextYears);
                            }}
                            className="text-[11px] bg-transparent border-l border-indigo-200 pl-0.5">
                            <option value="">자동 · {resolveBaseYear(ship, rm, ry, undefined).year}년</option>
                            {[...new Set([...seasonYearsWithData(ship.byYearMonth, rm), baseInfo.year])].sort((x, y) => y - x).map((y) => <option key={y} value={y}>{y}년</option>)}
                          </select>
                        )}
                        {cmpOpen && canCompare && <button aria-label={`${n} 제거`} onClick={() => saveCompare(s, names.filter((x) => x !== n), mode, s.comparisonSku.baseYears)} className="px-1 text-gray-400 hover:text-red-500">×</button>}
                      </span>
                    );
                  })}
                </div>
                {cmpOpen && (
                  <div className="space-y-1.5 bg-gray-50 rounded p-1.5">
                    <div className="flex gap-1">
                      {([['samePeriod', '동기간'], ['rolling12', '직전 12개월']] as const).map(([k, l]) => (
                        <Chip key={k} on={mode === k} disabled={!canCompare || names.length === 0} onClick={() => saveCompare(s, names, k, s.comparisonSku.baseYears)}>{l}</Chip>
                      ))}
                    </div>
                    {canCompare && (
                      <span className="relative block">
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="+ 태블로 SKU 검색" aria-label="대응SKU 검색" className="text-[11px] border border-gray-300 rounded px-1.5 py-0.5 w-full" />
                        {suggestions.length > 0 && (
                          <div className="absolute z-20 mt-0.5 w-64 max-h-52 overflow-auto bg-white border border-gray-200 rounded shadow-lg">
                            {suggestions.map((x) => <button key={x.name} onClick={() => { setQ(''); saveCompare(s, [...names, x.name], mode, s.comparisonSku.baseYears); }} className="block w-full text-left text-[11px] px-2 py-1 hover:bg-indigo-50">{x.name}</button>)}
                          </div>
                        )}
                      </span>
                    )}
                  </div>
                )}
                <div className="text-[11px] text-gray-500 space-y-0.5 tabular-nums">
                  <div className="flex justify-between gap-2"><span>기간</span><b className="text-gray-800 text-right">{r.compare.modeLabel}</b></div>
                  <div className="flex justify-between gap-2"><span>8개월 실적</span><b className="text-gray-800">{compTotal === null ? '–' : fmt(compTotal)}</b></div>
                  <div className="flex justify-between gap-2"><span>목표 대비</span><b>{compTotal === null ? '–' : growth(m.planQty, compTotal)}</b></div>
                </div>
                {compShare.length > 0 && <div className="space-y-0.5"><span className="text-[11px] text-gray-500">채널 비중 · 대응SKU 실적 · 비운영 제외</span><ShareBar items={compShare} /></div>}
                {m.planQty > 0 && <div className="space-y-0.5"><span className="text-[11px] text-gray-500">채널 비중 · {active}안 판매 목표</span><ShareBar items={m.channels.filter((c) => c.planQty > 0).map((c) => ({ label: c.channel as string, value: c.planQty }))} /></div>}
                <p className="text-[11px] text-gray-400">변동비는 카테고리×채널 팀카테 기준, 대응SKU는 기간만 결정</p>
              </div>
            </Fold></div>
            <Fold open={fold.opt} onToggle={() => flip('opt')} title="옵션 · 컬러 × 사이즈"
              summary={<>{s.hasColors ? `컬러 ${s.colors.filter((c) => !c.archived).length}개 · ` : ''}사이즈 {s.sizes.filter((z) => z.isActive).length}개 · 최종 수량 {orderEditable ? '수정' : '보기만'}</>}>
              <OptionPanel s={s} env={env} editable={orderEditable} />
            </Fold>
          </div>
            {/* 채널 상세는 닫아도 마운트 유지 — 펼친 채널 · 되돌리기 기록 보존 */}
            <Fold open={fold.tool} onToggle={() => flip('tool')} title="채널 상세 · 도구"
              summary="위 표와 같은 수량 · 채널 비중 수정 · 대응SKU 채널비중 반영 · 되돌리기 · 시뮬레이션 엑셀 · 채널별 월 상세">
              <Hint strong="위 표와 같은 수량" rest="채널별 월 상세(대응SKU · 기준값 차이 · 실 판매가 · 옵션 수량) · 채널 비중 수정 · 대응SKU 채널비중 반영 · 되돌리기 · 시뮬레이션 엑셀" />
              <ChannelQtyPanel sku={s} compare={r.compare} />
            </Fold>

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-gray-300 bg-white/95 px-3 py-2 shadow-md">
          {stateChip(s)}
          <span className="text-[11px] text-gray-500">{finalized ? '발주 확정됨 · 입력 잠김' : confirmReason || '저장해도 수정 가능 · 최종은 발주 확정'}</span>
          <span className="flex-1" />
          {finalized ? (
            <button disabled={!perm.orderConfirm || busy} onClick={() => confirm(s, false)} className="text-xs px-3 py-1 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50">발주 확정 해제</button>
          ) : (
            <>
              <button disabled={!canSwitch(s)} onClick={() => pickPlan(s, active)} className="text-xs px-3 py-1 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">{active}안으로 저장</button>
              <button disabled={!!confirmReason || busy} onClick={() => confirm(s, true)} className="text-xs px-3 py-1 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed">발주 확정</button>
            </>
          )}
        </div>
      </div>
    );
  }

/**
 * 검토 요청 · 채널별 요약 — 요청 SKU를 채널 단위로 합친 판매 수량 · 순매출 · 공헌이익 · CM% · 그룹 확정.
 * 금액 기준(초도 발주량만 / 시즌 목표 포함)은 상단 요약과 같다. 발주금액은 SKU 단위라 채널로 나누지 않음.
 * 첫 화면: 마스터 · PM · 뷰어는 전체, 채널 담당은 내 그룹.
 */
/** 요청 SKU의 한 그룹(플랫폼 · 브랜드 · 글로벌) 소계 — 채널별 요약 소계와 같은 계산 · 비운영 채널 제외 · 플랫폼은 마케팅 비용 차감 */
function groupSubtotal(rows: { s: SkuData; r: SkuReview }[], f: ChannelConfirmField) {
  const out = { revenue: 0, profit: 0, profitRevenue: 0, profitNull: 0, done: 0, total: 0 };
  rows.forEach(({ s, r }) => {
    const off = getDisabledChannels(s) as readonly string[];
    const chs = r.money.channels.filter((c) => CHANNEL_CONFIRM_GROUP[c.channel].field === f && !off.includes(c.channel));
    if (chs.length === 0) return;
    const rev = chs.reduce((a, c) => a + c.revenue, 0);
    const pro = chs.some((c) => c.profit === null) ? null : chs.reduce((a, c) => a + (c.profit as number), 0) - (f === 'step2PlatformConfirmed' ? r.money.marketingCost : 0);
    out.revenue += rev;
    if (pro === null) out.profitNull += 1; else { out.profit += pro; out.profitRevenue += rev; }
    if (chs.some((c) => c.planQty > 0)) { out.total += 1; if (s[f]) out.done += 1; }
  });
  return out;
}
type SummaryCol = { key: string; label: string; group: ChannelConfirmField; qty: number; revenue: number; profit: number; profitRevenue: number; profitNull: number; done: number; total: number; operated: number };
function ReviewChannelSummary({ req, rows, role, onClose }: { req: ReviewRequest; rows: { s: SkuData; r: SkuReview }[]; role: Role | null; onClose: () => void }) {
  const own = isAllChannelRole(role) ? null : REVIEW_GROUPS.find((f) => canConfirmGroup(role, f)) ?? null;
  const [pick, setPick] = useState<{ reqId: string; g: ChannelConfirmField | 'all' } | null>(null);
  const g = pick && pick.reqId === req.id ? pick.g : (own ?? 'all');

  const cols: SummaryCol[] = CHANNELS.map((ch) => ({ key: ch, label: ch, group: CHANNEL_CONFIRM_GROUP[ch].field, qty: 0, revenue: 0, profit: 0, profitRevenue: 0, profitNull: 0, done: 0, total: 0, operated: 0 }));
  const mkt: SummaryCol = { key: '마케팅', label: '마케팅', group: 'step2PlatformConfirmed', qty: 0, revenue: 0, profit: 0, profitRevenue: 0, profitNull: 0, done: 0, total: 0, operated: 0 };
  rows.forEach(({ s, r }) => {
    const off = getDisabledChannels(s) as readonly string[];
    cols.forEach((c) => {
      if (off.includes(c.key)) return;
      const m = r.money.channels.find((x) => x.channel === c.key);
      if (!m) return;
      c.operated += 1;
      c.qty += m.soldQty; c.revenue += m.revenue;
      if (m.profit === null) c.profitNull += 1; else { c.profit += m.profit; c.profitRevenue += m.revenue; }
      if (m.planQty > 0) { c.total += 1; if (s[c.group]) c.done += 1; }
    });
    if (r.money.marketingCost > 0) { mkt.operated += 1; mkt.total += 1; if (s.step2PlatformConfirmed) mkt.done += 1; if (r.money.profit === null) mkt.profitNull += 1; else mkt.profit -= r.money.marketingCost; }
  });
  // 요청 SKU 중 아무도 운영하지 않는 채널(예: 쿠팡 미등록)은 열에서 뺀다
  const all = [...cols.filter((c) => c.operated > 0), ...(mkt.total > 0 ? [mkt] : [])];
  const shown = all.filter((c) => g === 'all' || c.group === g);
  const qtyAll = cols.reduce((a, c) => a + c.qty, 0);
  const sum = shown.reduce((a, c) => ({ qty: a.qty + c.qty, revenue: a.revenue + c.revenue, profit: a.profit + c.profit, profitRevenue: a.profitRevenue + c.profitRevenue, profitNull: a.profitNull + c.profitNull }), { qty: 0, revenue: 0, profit: 0, profitRevenue: 0, profitNull: 0 });
  // CM%는 공헌이익을 계산한 SKU의 순매출로만 나눈다 (상단 요약과 같은 방식)
  const allNull = (c: { profitRevenue: number; profitNull: number; profit: number }) => c.profitNull > 0 && c.profitRevenue === 0 && c.profit === 0;
  const cmText = (c: { profit: number; profitRevenue: number; profitNull: number }) => (allNull(c) || c.profitRevenue <= 0 ? '–' : pct(Math.round((c.profit / c.profitRevenue) * 1000) / 10));
  const profitCell = (c: { profit: number; profitRevenue: number; profitNull: number }) => (allNull(c) ? '–' : <>{won(c.profit)}{c.profitNull > 0 && <span className="text-[10px] text-red-500"> *</span>}</>);
  const th = 'px-2 py-1 font-semibold text-right whitespace-nowrap';
  const td = 'px-2 py-1 text-right whitespace-nowrap';

  return (
    <div className="bg-white border border-teal-300 rounded-lg px-3 py-1.5 space-y-1">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <b className="text-gray-800">채널별 요약</b>
        <span className="text-[11px] text-gray-500">요청 SKU {rows.length}개 · 상단 금액 기준과 같음 · 발주금액은 위 합계에만</span>
        <span className="flex-1" />
        {(['all', ...REVIEW_GROUPS] as const).map((k) => (
          <Chip key={k} on={g === k} onClick={() => setPick({ reqId: req.id, g: k })}>{k === 'all' ? '전체' : REVIEW_GROUP_LABEL[k]}</Chip>
        ))}
        <button onClick={onClose} className="text-[11px] underline text-indigo-700 ml-1">접기</button>
      </div>
      {(
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead><tr className="border-b border-gray-200 text-gray-500">
              <th className="px-2 py-1 font-semibold text-left whitespace-nowrap"></th>
              {shown.map((c) => (
                <th key={c.key} className={th}>{c.label}
                  <span className="flex justify-end items-center gap-1 text-[10px] font-normal text-gray-400">{REVIEW_GROUP_LABEL[c.group]}
                    <span title="그룹 확정 SKU / 이 채널 수량 있는 SKU" className={`px-1 rounded-full font-semibold ${c.total === 0 ? 'text-gray-300' : c.done === c.total ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{c.done}/{c.total}</span>
                  </span>
                </th>
              ))}
              <th className={`${th} border-l border-gray-200`}>{g === 'all' ? '합계' : `${REVIEW_GROUP_LABEL[g]} 소계`}</th>
            </tr></thead>
            <tbody>
              <tr className="border-b border-gray-100"><td className="px-2 py-1 text-gray-500 whitespace-nowrap">판매 수량 · 비중</td>
                {shown.map((c) => <td key={c.key} className={td}>{c.key === '마케팅' ? '–' : <>{fmt(c.qty)} <span className="text-gray-400">{qtyAll ? Math.round((c.qty / qtyAll) * 100) : 0}%</span></>}</td>)}
                <td className={`${td} border-l border-gray-200 font-semibold`}>{fmt(sum.qty)} <span className="text-gray-400 font-normal">{qtyAll ? Math.round((sum.qty / qtyAll) * 100) : 0}%</span></td></tr>
              <tr className="border-b border-gray-100"><td className="px-2 py-1 text-gray-500">순매출</td>
                {shown.map((c) => <td key={c.key} className={td}>{c.key === '마케팅' ? '–' : won(c.revenue)}</td>)}
                <td className={`${td} border-l border-gray-200 font-semibold`}>{won(sum.revenue)}</td></tr>
              <tr><td className="px-2 py-1 text-gray-500 whitespace-nowrap">공헌이익 · CM%</td>
                {shown.map((c) => <td key={c.key} className={td}>{profitCell(c)}{c.key !== '마케팅' && <span className="text-gray-400"> {cmText(c)}</span>}</td>)}
                <td className={`${td} border-l border-gray-200 font-semibold`}>{profitCell(sum)} <span className="text-gray-400 font-normal">{cmText(sum)}</span></td></tr>
            </tbody>
          </table>
          {all.some((c) => c.profitNull > 0) && <p className="text-[10px] text-red-500 mt-0.5">* 변동비 없어 공헌이익에서 빠진 SKU 있음</p>}
        </div>
      )}
    </div>
  );
}

export function OrderReviewSection({ skus: filteredSkus, view, targetComparable: filterComparable, onNavigateToSku, review }: {
  skus: SkuData[];
  review?: ReviewListProps;
  view: 'decide' | 'total';
  /** 월 · 브랜드 · 검색 필터가 없을 때만 카테고리 목표와 비교 가능 */
  targetComparable: boolean;
  onNavigateToSku?: (sku: SkuData) => void;
}) {
  const { role } = useAuth();
  const perm = usePermission(role);
  const { ctx, tableau } = useReviewCtx();
  const targets = useOrderTargets();
  const listenerError = useSkuSyncStatus((s) => s.error);
  const applySkuBatch = useStore((s) => s.applySkuBatch);
  const setFinalOrderConfirmed = useStore((s) => s.setFinalOrderConfirmed);
  const setChannelConfirmed = useStore((s) => s.setChannelConfirmed);

  const skus = filteredSkus;
  type StatusFilter = 'all' | 'todo' | 'saved' | 'done';
  const [status, setStatus] = useState<StatusFilter>('all');
  const statusOf = (s: SkuData): Exclude<StatusFilter, 'all'> => (s.finalOrderConfirmedAt ? 'done' : s.orderPlans?.decided ? 'saved' : 'todo');
  const targetComparable = filterComparable;

  const [basis, setBasis] = useState<MoneyBasis>('order');
  const [statusOpen, setStatusOpen] = useState(false);
  const [kpiAll, setKpiAll] = useState(false);
  // 검토 요청 채널별 요약 — 처음엔 접힘 (첫 화면에서 SKU 목록이 바로 보이게 · 2026-11-13) · 펼침 상태는 탭 세션 동안 기억
  const [chSumOpen, setChSumOpenRaw] = useState(() => { try { return sessionStorage.getItem('ct:chSumOpen') === '1'; } catch { return false; } });
  const setChSumOpen = (f: (v: boolean) => boolean) => setChSumOpenRaw((v) => { const n = f(v); try { sessionStorage.setItem('ct:chSumOpen', n ? '1' : '0'); } catch { /* 무시 */ } return n; });
  const [metric, setMetric] = useState<'rev' | 'pro'>('rev');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [visited, setVisited] = useState<string[]>([]);

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
      await applySkuBatch([{ id: s.id, patch }], label, '발주량 검토', { guard: true });
    } catch (err) {
      console.error('[발주량 검토] 저장 실패', err);
      setMessage(err instanceof SkuConflictError
        ? `${s.skuName} · 다른 사용자가 먼저 수정 · 내 변경 취소됨 · 최신값 확인 후 다시 입력`
        : `${s.skuName} 저장 실패 · 변경 취소됨 · 새로고침 후 다시 시도`);
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
    // 대응SKU 실적 · 비중으로 채웠으면 지금 대응SKU 기준 표로 기록 (변경 배지 해제)
    void save(s, { ...gridPatch(s, entries), ...(fromCompare ? { channelQtyDerivedFromCompareSkus: compareNamesOf(s) } : {}) }, label);
  }

  function setOrder(s: SkuData, qty: number) {
    const patch = withOrderQtyScaled(s, qty);
    if (!patch) { setMessage(`${s.skuName} · 컬러 수량 없음 · 옵션별 검토에서 컬러 수량 먼저 입력`); return; }
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
      await setFinalOrderConfirmed(s.id, true, finalOrderForConfirm(model));
    } catch (err) {
      console.error('[발주량 검토] 확정 실패', err);
      setMessage(`${s.skuName} 확정 실패 · 새로고침 후 다시 시도`);
    } finally {
      setBusy(false);
    }
  }


  // ── 상단 ───────────────────────────────────────────────────────────
  const metricCell = (l: string, v: ReactNode) => (
    <div className="min-w-0"><div className="text-[11px] text-gray-500 whitespace-nowrap">{l}</div><div className="text-sm font-bold tabular-nums text-gray-900 whitespace-nowrap">{v}</div></div>
  );
  const canSwitch = (s: SkuData) => isAllChannelRole(role) && !s.finalOrderConfirmedAt && !writeBlocked && !busy;

  // 왼쪽 목록 · ↑ ↓ 이동
  const list = skus.filter((s) => status === 'all' || statusOf(s) === status);
  const focusSku = list.find((s) => s.id === focus) ?? list[0] ?? null;
  const focusIdx = focusSku ? list.indexOf(focusSku) : -1;
  // 최근 연 SKU(최대 6개)는 숨긴 채 유지 — 넘겨도 펼친 채널 · 되돌리기 기록이 그대로
  const shown = focusSku && !visited.includes(focusSku.id) ? [...visited.slice(-5), focusSku.id] : visited;
  const goTo = (id: string) => { setVisited(shown); setFocus(id); };
  useEffect(() => {
    if (view !== 'decide') return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest('input,select,textarea,[contenteditable="true"]')) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const j = e.key === 'ArrowDown' ? focusIdx + 1 : focusIdx - 1;
      if (j >= 0 && j < list.length) { e.preventDefault(); goTo(list[j].id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function confirmGroup(s: SkuData, field: ChannelConfirmField, value: boolean) {
    setMessage(null);
    setChannelConfirmed(s.id, field, value).catch((err) => {
      console.error('[발주량 검토] 그룹 확정 실패', err);
      setMessage(`${s.skuName} 그룹 확정 실패 · 새로고침 후 다시 시도`);
    });
  }

  const env: DetailEnv = { role, perm, tableau, global, writeBlocked, busy, basis, onNavigateToSku, save, setOrder, pickPlan, canSwitch, setMonthPlan, saveCompare, confirm, confirmGroup };

  const decided = skus.filter((s) => s.orderPlans?.decided || s.finalOrderConfirmedAt).length;
  const confirmed = skus.filter((s) => s.finalOrderConfirmedAt).length;
  // 태블로를 불러오는 동안은 오류로 보이지 않게 회색
  const statusChip = tableau.loading ? (
    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-semibold whitespace-nowrap">태블로 불러오는 중</span>
  ) : allIssues.length > 0 ? (
    <button onClick={() => setStatusOpen((v) => !v)} className={`px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${errorCount ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
      오류 {errorCount} · 경고 {warnCount} {statusOpen ? '▴' : '▾'}
    </button>
  ) : null;
  const statusTable = statusOpen && !tableau.loading && allIssues.length > 0 ? (
    <div className="overflow-x-auto bg-white text-gray-800 rounded border border-gray-200 max-h-60 overflow-y-auto">
      <table className="w-full text-xs">
        <thead><tr className="text-left text-gray-500 border-b border-gray-200">{['구분', '대상', '문제', '영향', '조치'].map((h) => <th key={h} className="px-2 py-1 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody>
          {allIssues.map((i, k) => (
            <tr key={k} className="border-b border-gray-100 last:border-0">
              <td className="px-2 py-1"><span className={`px-1.5 rounded-full font-semibold text-[11px] whitespace-nowrap ${i.level === 'error' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{i.level === 'error' ? '오류' : '경고'}</span></td>
              <td className="px-2 py-1 whitespace-nowrap">{i.sku ? <button className="font-semibold hover:underline" onClick={() => goTo(i.sku!.id)}>{i.sku.skuName}</button> : '전체'}</td>
              <td className="px-2 py-1">{i.what}</td><td className="px-2 py-1 text-gray-600">{i.effect}</td><td className="px-2 py-1 text-gray-600">{i.fix}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : null;

  const profitText = tableau.teamCate ? won(totals.profit) : '계산 중단';
  // 검토 요청 · 채널 담당은 내 그룹 소계를 요약 줄 맨 앞에 (채널별 표는 [채널별 ▾]로 펼침)
  const ownGroup = review?.req && !isAllChannelRole(role) ? REVIEW_GROUPS.find((f) => canConfirmGroup(role, f) && review.req!.groups.includes(f)) ?? null : null;
  const own = ownGroup ? groupSubtotal(rows, ownGroup) : null;
  const summary = (
    <div className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
      {own && ownGroup && (
        <div className="flex items-center gap-3 rounded-md bg-teal-50 border border-teal-200 px-2 py-0.5">
          <span className="px-1.5 rounded bg-teal-600 text-white text-[11px] font-semibold whitespace-nowrap">{REVIEW_GROUP_LABEL[ownGroup]} 소계</span>
          {metricCell('순매출', won(own.revenue))}
          {metricCell('공헌이익 · CM%', own.profitNull === rows.length && rows.length > 0 ? '–' : `${won(own.profit)} · ${pct(own.profitRevenue > 0 ? Math.round((own.profit / own.profitRevenue) * 1000) / 10 : null)}`)}
          {metricCell('확정', `${own.done} / ${own.total}`)}
        </div>
      )}
      {metricCell('결정 · 확정', `${decided} · ${confirmed} / ${skus.length}`)}
      {kpiAll && metricCell('발주량', fmt(totals.order))}
      {metricCell('발주금액', won(totals.orderAmount))}
      {kpiAll ? <>{metricCell('순매출', won(totals.revenue))}{metricCell('공헌이익', profitText)}{metricCell('CM%', pct(totalCm(totals)))}{metricCell('리오더 필요', fmt(totals.reorder))}{metricCell('시즌 후 잔여', won(totals.leftover))}</>
        : metricCell('순매출 · 공헌이익', `${won(totals.revenue)} · ${profitText}`)}
      {metricCell('위험 SKU', fmt(totals.risk))}
      <div className="text-[11px] text-gray-500 flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <Chip on={basis === 'order'} onClick={() => setBasis('order')}>초도 발주량만</Chip>
        <Chip on={basis === 'season'} onClick={() => setBasis('season')}>시즌 목표 · 리오더 포함</Chip>
        {statusChip}
        {totals.skipped > 0 && !tableau.loading && <span className="px-1.5 rounded-full bg-red-100 text-red-700 font-semibold whitespace-nowrap">공헌이익 제외 {totals.skipped}개</span>}
      </div>
      <span className="flex-1" />
      <div className="flex items-center gap-2 text-[11px]">
        {review?.req && <button onClick={() => setChSumOpen((v) => !v)} aria-expanded={chSumOpen} className={`px-2 py-0.5 rounded border font-semibold ${chSumOpen ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>채널별 {chSumOpen ? '▴' : '▾'}</button>}
        <button onClick={() => setKpiAll((v) => !v)} className="underline text-indigo-700 whitespace-nowrap">{kpiAll ? '지표 접기' : '지표 9개'}</button>
      </div>
    </div>
  );

  // 왼쪽 목록은 오픈일로 묶음
  const req = review?.req ?? null;
  const picked = review?.picked ?? null;
  const openGroups = req ? [['__req', list] as [string, SkuData[]]] : (() => {
    const map = new Map<string, SkuData[]>();
    [...list].sort((a, b) => (a.releaseDate || '9999').localeCompare(b.releaseDate || '9999')).forEach((s) => { const k = openKey(s); if (!map.has(k)) map.set(k, []); map.get(k)!.push(s); });
    return [...map.entries()];
  })();
  const counts = { all: skus.length, todo: skus.filter((s) => statusOf(s) === 'todo').length, saved: skus.filter((s) => statusOf(s) === 'saved').length, done: skus.filter((s) => statusOf(s) === 'done').length };
  const decideView = (
    <div className="flex-1 min-h-0 grid gap-2.5 md:grid-cols-[310px_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-auto border border-gray-200 rounded-lg bg-white">
        <div className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 p-1.5 flex flex-wrap gap-1">
          {([['all', '전체'], ['todo', '검토 전'], ['saved', '저장'], ['done', '확정']] as const).map(([k, l]) => <Chip key={k} on={status === k} onClick={() => setStatus(k)}>{l} {counts[k]}</Chip>)}
        </div>
        {openGroups.length === 0 && <p className="p-3 text-xs text-gray-500">조건에 맞는 SKU 없음</p>}
        {openGroups.map(([k, arr]) => (
          <div key={k}>
            <div className={`px-2.5 py-1 text-[11px] font-bold border-b border-gray-200 ${req ? 'text-teal-700 bg-teal-50' : 'text-gray-500 bg-gray-50'}`}>{req ? `요청 순서 · 01부터 ${String(req.skuIds.length).padStart(2, '0')}까지` : openLabel(k)}</div>
            {arr.map((s) => {
              const r = reviewOf(s);
              const err = r.issues.filter((i) => i.level === 'error').length;
              const warn = r.issues.length - err;
              const v = verdict(s, r.money);
              return (
                <div key={s.id} className={`flex items-start gap-1.5 border-b border-gray-100 border-l-[3px] hover:bg-gray-50 ${s.id === focusSku?.id ? 'bg-indigo-50 border-l-indigo-600' : 'border-l-transparent'}`}>
                {picked && <input type="checkbox" className="mt-2 ml-1.5 accent-teal-600" aria-label={`${s.skuName} 검토 요청에 담기`} checked={picked.includes(s.id)} onChange={() => review!.onPick(s.id)} />}
                {req && <span className="mt-1.5 ml-1.5 text-[11px] font-bold text-teal-700 tabular-nums">{String(req.skuIds.indexOf(s.id) + 1).padStart(2, '0')}</span>}
                <button onClick={() => goTo(s.id)} className={`block min-w-0 flex-1 text-left py-1.5 pr-2.5 ${picked || req ? 'pl-0.5' : 'pl-2.5'}`}>
                  <span className="block text-xs font-bold text-gray-900 truncate">{s.skuName || '(SKU명 미입력)'}</span>
                  <span className="block text-[11px] text-gray-500 tabular-nums">{s.brand} · {s.category} · {s.orderPlans?.active ?? 1}안 {fmt(s.totalOrderQty)}개 · 소진 {coverOf(s.totalOrderQty, r.money)}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1">
                    <span className={`px-1.5 rounded-full text-[10px] font-semibold ${v.cls}`}>{v.text}</span>
                    {stateChip(s)}
                    {err > 0 && <span className="px-1.5 rounded-full bg-red-100 text-red-700 text-[10px] font-semibold">오류 {err}</span>}
                    {warn > 0 && !s.finalOrderConfirmedAt && <span className="px-1.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold">경고 {warn}</span>}
                    {req && <GroupConfirmChips s={s} groups={req.groups} />}
                  </span>
                </button>
                </div>
              );
            })}
          </div>
        ))}
        {picked && picked.length > 0 && (
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-1.5 px-2 py-1.5 bg-teal-50 border-t border-teal-300 text-xs">
            <b className="text-teal-800">{picked.length}개 선택</b>
            <button onClick={review!.onClearPick} className="text-[11px] text-gray-500 hover:text-gray-700">선택 해제</button>
            <span className="flex-1" />
            <button onClick={review!.onCreate} className="px-2 py-1 rounded bg-teal-600 text-white font-semibold text-[11px]">검토 요청 만들기</button>
          </div>
        )}
      </aside>
      <div className="min-w-0 min-h-0 overflow-auto pr-1">
        {shown.map((id) => {
          const s = skus.find((x) => x.id === id);
          if (!s) return null;
          return <div key={id} hidden={id !== focusSku?.id}><Detail s={s} r={reviewOf(s)} env={env} /></div>;
        })}
      </div>
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
    <div className="h-full min-h-0 flex flex-col gap-2">
      <div className="shrink-0 space-y-2">
        {summary}
        {review?.req && chSumOpen && <ReviewChannelSummary req={review.req} rows={rows} role={role} onClose={() => setChSumOpen(() => false)} />}
        {statusTable}
        {message && <div className="text-xs bg-red-50 border border-red-200 text-red-700 rounded px-3 py-1.5 flex justify-between gap-2"><span>{message}</span><button onClick={() => setMessage(null)} className="underline">닫기</button></div>}
      </div>
      {view === 'decide' ? decideView : <div className="flex-1 min-h-0 overflow-auto space-y-3 pr-1 pb-4">{matrix}{chart}</div>}
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
