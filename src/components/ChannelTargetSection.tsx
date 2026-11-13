import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  B2C_CHANNELS, CHANNELS, CHANNEL_CONFIRM_GROUP, getDisabledChannels, getSkuMonths, isMarketingLocked,
  isSeasonOnly, type Channel, type ChannelConfirmField, type ChannelMonthQtyEntry, type Month, type SkuData,
} from '../types';
import { useStore, planScopeOf } from '../store';
import { useAuth } from '../store/auth';
import { usePermission } from '../contexts/PermissionsContext';
import { canConfirmGroup, isAllChannelRole, ownsChannel, type QtyChannel } from '../utils/channelOwnership';
import {
  buildCompareData, compareNamesOf, fallbackWeightsOf, type CompareData,
} from '../utils/compareData';
import { allocate, redistributeByWeights, setMonthTotal } from '../utils/qtyPlan';
import { STEP1_OPTIONS } from '../utils/step1Price';
import { useTableauBase } from '../hooks/useTableauBase';
import { TABLEAU_ERROR_MESSAGES } from '../services/tableau';
import { Delta, TableLegend } from './reviewTableParts';
import { HATCH, coverIndexOf, monthHeadLabel } from '../utils/reviewTable';
import { CoverageChip } from './SkuCard';
import { OrderReviewSection } from './OrderReviewSection';
import { CellInput } from './CellInput';
import { ReviewRequestBanner, ReviewRequestModal, ReviewRequestSelect } from './ReviewRequestParts';
import {
  REVIEW_OPEN_EVENT, REVIEW_SESSION_KEY, canCreateReviewRequest, subscribeReviewRequests, type ReviewRequest,
} from '../utils/reviewRequest';

// ── 공용 ────────────────────────────────────────────────────────────────
type View = 'ws' | 'plan' | 'total';
const GROUP_LABEL: Record<ChannelConfirmField, string> = {
  step2PlatformConfirmed: '플랫폼', step2BrandConfirmed: '브랜드', step2GlobalConfirmed: '글로벌',
};
/** B2C 채널에서 빼는 판매가 선택지 (B2B 공급가 계열) — 통합 표와 같음 */
const B2B_OPT_KEYS = ['b2bOpen', 'b2b', 'buy', 'glob', 'jp'];
const CONFIRM_FIELDS: ChannelConfirmField[] = ['step2PlatformConfirmed', 'step2BrandConfirmed', 'step2GlobalConfirmed'];

const fmt = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '–' : Math.round(n).toLocaleString());
const rate = (a: number, b: number | null | undefined) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);
function RateText({ r }: { r: number | null }) {
  if (r === null) return <span className="text-gray-300">–</span>;
  return <span className={r > 0 ? 'text-blue-500' : r < 0 ? 'text-red-500' : 'text-gray-400'}>{r > 0 ? '▲ +' : r < 0 ? '▼ ' : ''}{r}%</span>;
}
/** 동기간 기간 표기 줄이기 — "2025년 10월~2026년 5월" → "25.10월~26.5월", "2025년 3~10월" → "25.3~10월" */
const shortPeriod = (label: string) => label.replace(/20(\d{2})년 (\d+)/g, '$1.$2');
const isEmptyGrid = (s: SkuData) => s.channelMonthQty.every((e) => e.qty === 0);
const releaseYearOf = (s: SkuData) => (s.releaseDate ? parseInt(s.releaseDate.split('-')[0], 10) : 2026);
const lockedCh = (s: SkuData, ch: QtyChannel) => (ch === '마케팅' ? isMarketingLocked(s) : !!s[CHANNEL_CONFIRM_GROUP[ch].field]);
const disabledCh = (s: SkuData, ch: QtyChannel) => ch !== '마케팅' && (getDisabledChannels(s) as readonly string[]).includes(ch);
const fmtDate = (d: string) => {
  if (!d) return '오픈일 미정';
  const dt = new Date(`${d}T00:00:00`);
  return `${dt.getMonth() + 1}/${dt.getDate()}(${'일월화수목금토'[dt.getDay()]}) 오픈`;
};

// ── 메인 ────────────────────────────────────────────────────────────────
type Snapshot = { id: string; patch: Partial<SkuData> };
type BulkType = 'scn' | 'fill' | 'pcomp' | 'pcopy' | 'ppct';
interface BulkState { type: BulkType; pct: number; src: string | null; scn: string; scnCh: Channel }
const BULK_LABEL: Record<BulkType, string> = {
  pcomp: '대응SKU 실적 대비 %로 월 계획', pcopy: '다른 SKU 월 비중 복사', ppct: '판매 목표 일괄 ±%', scn: '판매가 일괄', fill: '대응SKU 기준 채우기',
};

function readSession<T>(key: string, fallback: T): T {
  try { const v = sessionStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function writeSession(key: string, v: unknown) { try { sessionStorage.setItem(key, JSON.stringify(v)); } catch { /* 무시 */ } }

export function ChannelTargetSection({ skus, targetComparable, onNavigateToSku }: {
  skus: SkuData[];
  /** 월 · 브랜드 · 검색 필터가 없을 때만 카테고리 월 목표와 비교 가능 */
  targetComparable: boolean;
  onNavigateToSku?: (sku: SkuData) => void;
}) {
  const { role } = useAuth();
  const perm = usePermission(role);
  const allRole = isAllChannelRole(role);
  const canEditCh = (ch: QtyChannel) => perm.step2 && ownsChannel(role, ch);
  const myGroups = CONFIRM_FIELDS.filter((f) => canConfirmGroup(role, f));
  const base = useTableauBase();
  const applySkuBatch = useStore((s) => s.applySkuBatch);
  const updateMonthlySplit = useStore((s) => s.updateMonthlySplit);
  const persistSku = useStore((s) => s.persistSku);

  const [viewState, setViewRaw] = useState<View>(() => readSession('ct:view', 'ws'));
  // 월 계획 일괄(구 월별 비중설정)은 마스터 · PM만 (다른 역할은 수정 불가 · 탭 숨김) — 열어둔 세션이면 SKU별 결정으로
  // 채널 일괄은 삭제(2026-11-13) — 예전 세션에 남은 'ch'도 SKU별 결정으로
  const view: View = (viewState === 'plan' && !allRole) || (viewState as string) === 'ch' ? 'ws' : viewState;
  const setView = (v: View) => { setViewRaw(v); writeSession('ct:view', v); setPicked(new Set()); setBulk(null); };
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<BulkState | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: Snapshot[] } | null>(null);
  const [undoStacks, setUndoStacks] = useState<Record<string, Snapshot[]>>({});
  const [busy, setBusy] = useState(false);
  const [errDetail, setErrDetail] = useState(false);

  // ── 검토 요청 묶음 ──
  const allSkuIds = useStore((s) => s.skus).reduce((set, s) => set.add(s.id), new Set<string>());
  const [requests, setRequests] = useState<ReviewRequest[]>([]);
  const [reqId, setReqIdRaw] = useState<string | null>(() => readSession<string | null>(REVIEW_SESSION_KEY, null));
  const setReqId = (id: string | null) => { setReqIdRaw(id); writeSession(REVIEW_SESSION_KEY, id); setReqPick([]); };
  const [reqPick, setReqPick] = useState<string[]>([]);
  const [reqModal, setReqModal] = useState(false);
  const [reqLoaded, setReqLoaded] = useState(false);
  useEffect(() => subscribeReviewRequests((items) => { setRequests(items); setReqLoaded(true); }), []);
  useEffect(() => {
    const onOpen = (e: Event) => { const id = (e as CustomEvent<string>).detail; setViewRaw('ws'); setReqId(id); };
    window.addEventListener(REVIEW_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(REVIEW_OPEN_EVENT, onOpen);
  }, []);
  const req = requests.find((r) => r.id === reqId) ?? null;
  // 요청 SKU를 고른 순서대로 · 필터(월 · 브랜드 · 검색)는 묶음 안에서 적용
  const scoped = useMemo(() => (req ? req.skuIds.map((id) => skus.find((s) => s.id === id)).filter((s): s is SkuData => !!s) : skus), [req, skus]);
  const canPickReq = canCreateReviewRequest(role) && !req && view === 'ws';

  const list = useMemo(() => scoped
    .filter((s) => (!onlyEmpty || isEmptyGrid(s)) && (!onlyOpen || myGroups.some((f) => !s[f])))
    .slice().sort((a, b) => (req ? 0 : (a.releaseDate || '9999').localeCompare(b.releaseDate || '9999'))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [scoped, req, onlyEmpty, onlyOpen, role]);

  // 오픈일로만 그룹화 — 카테고리 · 브랜드는 상단 필터 바에서 거른다
  const groups = useMemo(() => {
    const m = new Map<string, SkuData[]>();
    list.forEach((s) => { const k = s.releaseDate || ''; if (!m.has(k)) m.set(k, []); m.get(k)!.push(s); });
    return [...m.entries()].map(([k, arr]) => ({ k, arr, label: fmtDate(k) }));
  }, [list]);

  // 대응SKU 비교 데이터 (카드와 같은 계산, 저장 없음)
  const compById = useMemo(() => {
    const out: Record<string, CompareData> = {};
    if (base.loading) return out;
    list.forEach((s) => { out[s.id] = buildCompareData(s, base.shipments, base.channelMap); });
    return out;
  }, [list, base.loading, base.shipments, base.channelMap]);

  // ── 저장 헬퍼 ──
  const latest = (id: string) => useStore.getState().skus.find((s) => s.id === id);
  const snapshotOf = (s: SkuData): Snapshot => ({
    id: s.id,
    patch: { channelMonthQty: s.channelMonthQty, pricingOpts: s.pricingOpts, marketingMonthQty: s.marketingMonthQty ?? {} },
  });
  const pushUndo = (s: SkuData) => setUndoStacks((u) => ({ ...u, [s.id]: [...(u[s.id] ?? []), snapshotOf(s)].slice(-20) }));
  const undoOne = async (id: string) => {
    const stack = undoStacks[id] ?? [];
    const last = stack[stack.length - 1];
    if (!last) return;
    setUndoStacks((u) => ({ ...u, [id]: stack.slice(0, -1) }));
    await applySkuBatch([last], '되돌리기').catch(console.error);
  };
  const commitMonthShare = (s: SkuData, m: Month, ratio: number) => {
    const cur = latest(s.id); if (!cur) return;
    pushUndo(cur);
    updateMonthlySplit(s.id, m, ratio, fallbackWeightsOf(cur, compById[s.id]?.channelDist ?? null));
    persistSku(s.id).catch(console.error);
  };

  // ── 일괄 작업 ──
  const computeBulk = (b: BulkState, s: SkuData): { skip?: string; note?: string; patch?: Partial<SkuData> } => {
    const cd = compById[s.id];
    const months = getSkuMonths(s.releaseDate);
    const fw = fallbackWeightsOf(s, cd?.channelDist ?? null);
    if (b.type === 'fill') {
      if (!allRole || !perm.step2) return { skip: 'PM · MASTER (채널별 목표량 권한)만' };
      if (!isEmptyGrid(s)) return { skip: '이미 값 있음' };
      if (!s.totalOrderQty) return { skip: '총 발주량 미입력' };
      const scope = planScopeOf(s, fw);
      const entries = redistributeByWeights(s.channelMonthQty, scope, fw, allocate(s.totalOrderQty, scope.months.map(() => 1))) as ChannelMonthQtyEntry[];
      return { patch: { channelMonthQty: entries, step2InitBaselineQty: entries, channelQtyDerivedFromCompareSkus: compareNamesOf(s) } };
    }
    if (isEmptyGrid(s)) return { skip: '미입력 · 먼저 채우기' };
    if (b.type === 'pcomp' || b.type === 'pcopy' || b.type === 'ppct') {
      if (!perm.step1) return { skip: '월 계획 권한 없음' };
      const scope = planScopeOf(s, fw);
      let entries = s.channelMonthQty;
      if (b.type === 'ppct') {
        // SKU별 결정 ② 판매 목표 일괄과 같은 계산 — 월 합계 × (1 + %) · 그 달 채널 구성비 유지
        months.forEach((m) => {
          const cur = s.monthlySplit.find((x) => x.month === m)?.quantity ?? 0;
          entries = setMonthTotal(entries, scope, m, Math.round(cur * (1 + b.pct / 100))).entries as ChannelMonthQtyEntry[];
        });
        return { patch: { channelMonthQty: entries } };
      }
      if (b.type === 'pcomp') {
        if (!cd || cd.names.length === 0 || Object.keys(cd.monthly).length === 0) return { skip: '대응SKU 실적 없음' };
        let n = 0;
        months.forEach((m) => {
          const c = cd.monthly[m];
          if (c == null) return;
          entries = setMonthTotal(entries, scope, m, Math.round(c * (1 + b.pct / 100))).entries as ChannelMonthQtyEntry[]; n++;
        });
        return { patch: { channelMonthQty: entries }, note: n < months.length ? `대응 실적 없는 ${months.length - n}개월은 유지` : '' };
      }
      const src = skus.find((x) => x.id === b.src);
      if (!src || isEmptyGrid(src)) return { skip: '가져올 SKU 없음' };
      if (src.id === s.id) return { skip: '가져올 SKU' };
      if (!src.totalOrderQty || !s.totalOrderQty) return { skip: '발주량 미입력' };
      const sm = getSkuMonths(src.releaseDate);
      months.forEach((m, i) => {
        const srcTot = src.monthlySplit.find((x) => x.month === sm[i])?.quantity ?? 0;
        entries = setMonthTotal(entries, scope, m, Math.round((s.totalOrderQty * srcTot) / src.totalOrderQty)).entries as ChannelMonthQtyEntry[];
      });
      return { patch: { channelMonthQty: entries } };
    }
    // 판매가 일괄 — 한 채널 · 여러 SKU · 모든 달 같은 값 (채널별 판매가 하나)
    const ch = b.scnCh;
    if (disabledCh(s, ch)) return { skip: `${ch} 비운영` };
    if (!canEditCh(ch)) return { skip: '권한 없음' };
    if (lockedCh(s, ch)) return { skip: `${CHANNEL_CONFIRM_GROUP[ch].label} 확정` };
    if (!b.scn) return { skip: '판매가 선택 필요' };
    const next = { ...(s.pricingOpts ?? {}) };
    months.forEach((m) => { next[`${ch}-${m}`] = b.scn; });
    return { patch: { pricingOpts: next }, note: `${ch} 전 월 → ${STEP1_OPTIONS.find((o) => o.id === b.scn)?.label ?? b.scn}` };
  };

  const pickedSkus = list.filter((s) => picked.has(s.id));
  const preview = bulk ? pickedSkus.map((s) => {
    const r = computeBulk(bulk, s);
    const months = getSkuMonths(s.releaseDate);
    const sumOf = (entries: ChannelMonthQtyEntry[]) => entries.filter((e) => months.includes(e.month)).reduce((a, e) => a + e.qty, 0);
    const cd = compById[s.id];
    const compSum = cd ? months.reduce((a, m) => a + (cd.monthly[m] ?? 0), 0) : 0;
    const before = sumOf(s.channelMonthQty);
    const after = r.patch?.channelMonthQty ? sumOf(r.patch.channelMonthQty) : before;
    return { s, r, before, after, vsComp: compSum ? rate(after, compSum) : null };
  }) : [];
  const applicable = preview.filter((p) => p.r.patch);

  const applyBulk = async () => {
    if (!bulk || applicable.length === 0) return;
    setBusy(true);
    const undo = applicable.map((p) => snapshotOf(p.s));
    const label = `${BULK_LABEL[bulk.type]}${bulk.type === 'ppct' || bulk.type === 'pcomp' ? ` ${bulk.pct}%` : ''}${bulk.type === 'scn' ? ` · ${bulk.scnCh}` : ''}`;
    try {
      await applySkuBatch(applicable.map((p) => ({ id: p.s.id, patch: p.r.patch! })), label);
      setToast({ text: `${applicable.length}개 SKU에 적용 · ${label}`, undo });
      setBulk(null);
    } catch (err) {
      console.error(err);
      setToast({ text: '저장에 실패해서 적용 전으로 되돌렸어요. 새로고침 후 다시 시도해 주세요.' });
    } finally { setBusy(false); }
  };
  const undoBulk = async () => {
    if (!toast?.undo) return;
    setBusy(true);
    try { await applySkuBatch(toast.undo, '일괄 작업 되돌리기'); setToast({ text: '되돌렸어요' }); }
    catch (err) { console.error(err); setToast({ text: '되돌리기 저장에 실패했어요. 새로고침 후 확인해 주세요.' }); }
    finally { setBusy(false); }
  };
  // ── 렌더 조각 ──
  const notes = (s: SkuData) => (
    <>
      <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-gray-200 text-gray-500">{s.coupangEnabled ? '쿠팡 활성' : '쿠팡 미등록'}</span>
      {(s.disabledChannels ?? []).length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-gray-200 text-gray-500">{(s.disabledChannels ?? []).join('·')} 비운영</span>}
      {isSeasonOnly(s) && <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-violet-200 text-violet-600">시즌 한정</span>}
    </>
  );
  const compText = (s: SkuData) => {
    const cd = compById[s.id];
    const names = compareNamesOf(s);
    if (names.length === 0) return '대응SKU 미설정';
    if (base.loading) return `${names.join(', ')} · 불러오는 중`;
    return `${names.join(', ')} · ${shortPeriod(cd?.modeLabel ?? '')}`;
  };
  const confirmDots = (s: SkuData) => (
    <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
      {CONFIRM_FIELDS.map((f) => (
        <span key={f} className="flex items-center gap-0.5"><span className={`inline-block w-1.5 h-1.5 rounded-full ${s[f] ? 'bg-emerald-500' : 'bg-gray-300'}`} />{GROUP_LABEL[f]}</span>
      ))}
    </span>
  );

  // ── 표 (개편 5단계) — SKU별 결정 통합 표와 같은 모양: 첫 열 고정 · 월별 수량(개) | 판매가 · 수익(원) · ▼ 소진 · 이후 빗금 ──
  const th = 'px-1 py-1 font-semibold whitespace-nowrap';
  const td = 'px-1 py-1 text-right whitespace-nowrap';
  const c0 = 'sticky left-0 z-[1] text-left border-r border-gray-200 px-2 py-1 whitespace-nowrap';
  const mCls = (i: number) => (i === 0 ? 'border-l border-gray-200' : '');

  /** 월 계획 누적이 발주량에 처음 닿는 달(소진월) — 통합 표와 같은 기준 */
  const coverOf = (s: SkuData) => {
    const months = getSkuMonths(s.releaseDate);
    let acc = 0;
    const cum = months.map((m) => (acc += s.monthlySplit.find((x) => x.month === m)?.quantity ?? 0));
    const idx = coverIndexOf(cum, s.totalOrderQty);
    return { months, cum, idx, over: (i: number) => idx >= 0 && i > idx, label: isSeasonOnly(s) ? '품절' : '리오더' };
  };

  interface Line {
    key: string; label: ReactNode; sub?: ReactNode;
    /** 행 · 첫 열 배경 (불투명 색만 — 첫 열 고정) */
    bg?: string; c0Cls?: string; rowCls?: string;
    input?: boolean;
    cell: (m: Month, i: number) => ReactNode; cellCls?: (i: number) => string;
    total?: ReactNode; share?: ReactNode;
  }
  const wsTable = (s: SkuData, lines: Line[], shareHead: ReactNode) => {
    const cv = coverOf(s);
    const { months } = cv;
    const ry = releaseYearOf(s);
    const hatch = (i: number) => (cv.over(i) ? HATCH : undefined);
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums min-w-[900px]">
          <thead>
            <tr className="text-[11px] text-gray-500">
              <th className={`${c0} bg-white`} />
              <th colSpan={months.length + 2} className={`${th} text-center border-l border-gray-200`}>월별 수량 (개)</th>
            </tr>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className={`${c0} bg-white ${th}`}>발주 {fmt(s.totalOrderQty)}</th>
              {months.map((m, i) => (
                <th key={m} className={`${th} text-right min-w-[54px] ${mCls(i)} ${i === cv.idx ? 'text-emerald-700' : ''}`} style={hatch(i)}>
                  <span className={`block text-[10px] leading-3 font-bold ${i === cv.idx ? 'text-emerald-700' : 'text-orange-600'}`}>{i === cv.idx ? '▼ 소진' : i === cv.idx + 1 ? cv.label : ' '}</span>
                  {monthHeadLabel(m, months, ry)}
                </th>
              ))}
              <th className={`${th} text-right border-l border-gray-300`}>합계</th>
              <th className={`${th} text-right`}>{shareHead}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key} className={`border-b border-gray-100 ${l.bg ?? 'bg-white'} ${l.rowCls ?? ''}`}>
                <td className={`${c0} ${l.bg ?? 'bg-white'} ${l.c0Cls ?? ''}`}>{l.label}{l.sub && <div className="text-[9px] text-gray-400 leading-tight font-normal">{l.sub}</div>}</td>
                {months.map((m, i) => <td key={m} className={`${l.input ? 'px-0.5 py-0.5' : td} ${mCls(i)} ${l.cellCls?.(i) ?? ''}`} style={hatch(i)}>{l.cell(m, i)}</td>)}
                <td className={`${td} border-l border-gray-300 font-semibold`}>{l.total}</td>
                <td className={td}>{l.share}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  /** 월 계획 일괄 — 통합 표 ② 월 계획과 같은 구성 */
  const planLines = (s: SkuData): Line[] => {
    const { months, cum } = coverOf(s);
    const cd = compById[s.id];
    const qty = s.totalOrderQty;
    const q = (m: Month) => s.monthlySplit.find((x) => x.month === m)?.quantity ?? 0;
    const sum = months.reduce((a, m) => a + q(m), 0);
    const compM = (m: Month) => cd?.monthly[m] ?? null;
    const compSum = cd && Object.keys(cd.monthly).length ? months.reduce((a, m) => a + (compM(m) ?? 0), 0) : null;
    const allConf = CHANNELS.filter((c) => !disabledCh(s, c)).every((c) => lockedCh(s, c));
    const can1 = perm.step1 && !allConf && qty > 0;
    const diff = sum - qty;
    const lines: Line[] = [
      { key: 'comp', label: <>대응SKU 실적{cd && Object.keys(cd.monthly).length > 0 && <span className="text-gray-400"> ({cd.monthlyActiveOnly ? '비운영 제외' : '비운영 포함'})</span>}</>,
        sub: cd?.names.length ? shortPeriod(cd.modeLabel) : 'SKU 미설정', rowCls: 'text-gray-500',
        cell: (m) => fmt(compM(m)), total: fmt(compSum) },
      { key: 'plan', label: '판매 목표', c0Cls: 'font-semibold',
        cell: (m) => <span className="font-semibold">{q(m) ? fmt(q(m)) : '–'}</span>, total: <>{fmt(sum)}<Delta cur={sum} base={compSum} unit="%" /></> },
      { key: 'ratio', label: '비중', sub: can1 ? '발주량 대비 · 입력' : '발주량 대비', input: true,
        cell: (m) => <CellInput value={s.monthlySplit.find((x) => x.month === m)?.ratio ?? 0} suffix="%" disabled={!can1} onCommit={(v) => commitMonthShare(s, m, v)} />,
        total: qty ? `${Math.round((sum / qty) * 100)}%` : '–' },
    ];
    if (sum > 0) {
      lines.push({ key: 'cum', label: '누적 vs 발주', rowCls: 'text-gray-500',
        cell: (_m, i) => fmt(cum[i]), cellCls: (i) => (cum[i] > qty ? 'text-red-500 font-semibold' : ''),
        total: fmt(qty), share: <span className="text-[10px]">{diff > 0 ? `발주 +${fmt(diff)}` : diff < 0 ? `발주 −${fmt(-diff)}` : '발주와 같음'}</span> });
    }
    lines.push({ key: 'rate', label: '증감율', sub: 'vs 대응SKU', rowCls: 'text-gray-500',
      cell: (m) => <RateText r={rate(q(m), compM(m))} />, total: <RateText r={compSum ? rate(sum, compSum) : null} /> });
    return lines;
  };

  // ── 일괄 작업 막대 ──
  const bulkBar = () => {
    const opts: BulkType[] = ['pcomp', 'ppct', 'pcopy', 'scn', 'fill'];
    const srcOptions = pickedSkus.filter((s) => !isEmptyGrid(s));
    const disabledType = (t: BulkType) => ((t === 'fill' || t === 'scn') && (!allRole || !perm.step2)) || ((t === 'pcomp' || t === 'pcopy' || t === 'ppct') && !perm.step1);
    return (
      <div className="rounded-lg border border-indigo-300 bg-indigo-50/95 px-3 py-2 flex flex-col gap-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-indigo-700 px-2 py-0.5 rounded-full bg-white border border-indigo-200">{pickedSkus.length}개 선택</span>
          {opts.map((t) => (
            <button key={t} disabled={disabledType(t)}
              onClick={() => setBulk({ type: t, pct: 10, src: srcOptions[0]?.id ?? null, scn: '', scnCh: '자사몰' })}
              className={`text-[11px] px-2.5 py-1 rounded-lg border bg-white disabled:opacity-40 disabled:cursor-not-allowed ${bulk?.type === t ? 'border-indigo-500 text-indigo-700 font-semibold' : 'border-gray-200 text-gray-600 hover:border-indigo-300'}`}>
              {BULK_LABEL[t]}
            </button>
          ))}
          <span className="flex-1" />
          <button onClick={() => { setPicked(new Set()); setBulk(null); }} className="text-[11px] text-gray-500 hover:text-gray-700">선택 해제</button>
        </div>
        {bulk && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
              {(bulk.type === 'ppct' || bulk.type === 'pcomp') && (
                <>
                  <span>{bulk.type === 'ppct' ? '월 판매 목표를' : '월 판매 목표 = 대응SKU 실적 × (1 +'}</span>
                  <input type="number" value={bulk.pct} onChange={(e) => setBulk({ ...bulk, pct: Number(e.target.value) || 0 })}
                    className="w-16 text-right rounded border border-gray-300 px-1 py-0.5 bg-white" />
                  <span>{bulk.type === 'ppct' ? '% 증감' : '%)'} · 그 달 채널 구성비 유지 · 확정 채널 · 마케팅 고정</span>
                </>
              )}
              {bulk.type === 'pcopy' && (
                <>
                  <span>가져올 SKU</span>
                  <select value={bulk.src ?? ''} onChange={(e) => setBulk({ ...bulk, src: e.target.value })} className="rounded border border-gray-300 px-1 py-0.5 bg-white">
                    {srcOptions.map((s) => <option key={s.id} value={s.id}>{s.skuName}</option>)}
                  </select>
                  <span>고른 SKU의 월 비중을 출시 첫 달끼리 · 둘째 달끼리 맞춰 넣음 · 그 달 채널 구성비 유지</span>
                </>
              )}
              {bulk.type === 'scn' && (
                <>
                  <select value={bulk.scnCh} onChange={(e) => setBulk({ ...bulk, scnCh: e.target.value as Channel, scn: '' })} aria-label="채널" className="rounded border border-gray-300 px-1 py-0.5 bg-white">
                    {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={bulk.scn} onChange={(e) => setBulk({ ...bulk, scn: e.target.value })} aria-label="판매가" className="rounded border border-gray-300 px-1 py-0.5 bg-white">
                    <option value="">판매가 선택</option>
                    {STEP1_OPTIONS.filter((o) => !(B2C_CHANNELS as readonly string[]).includes(bulk.scnCh) || !B2B_OPT_KEYS.includes(o.key)).map((o) => <option key={o.id} value={o.id}>{o.coreOnly ? `${o.label} (주력 · 일반은 라이브)` : o.label}</option>)}
                  </select>
                  <span>고른 채널 · 모든 달에 같은 판매가 · 가격 확정 SKU는 확정 가격 기준</span>
                </>
              )}
              {bulk.type === 'fill' && <span>비어 있는 SKU만 · 대응SKU 채널 비중 × 발주량 8개월 균등 (카드 첫 진입 때와 같은 계산)</span>}
            </div>
            <div className="overflow-auto max-h-40">
              <table className="text-[11px] min-w-[560px] w-full bg-white rounded border border-gray-200">
                <thead><tr className="bg-gray-50 text-gray-500">
                  <th className="px-2 py-1 text-left">SKU</th>
                  <th className="px-2 py-1 text-right">판매 목표 전</th>
                  <th className="px-2 py-1 text-right">후</th><th className="px-2 py-1 text-right">차이</th><th className="px-2 py-1 text-right">대응SKU 대비</th><th className="px-2 py-1 text-left">비고</th>
                </tr></thead>
                <tbody>
                  {preview.map((p) => (
                    <tr key={p.s.id} className="border-t border-gray-100">
                      <td className="px-2 py-1">{p.s.skuName}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{p.r.skip ? '' : fmt(p.before)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{p.r.skip ? '' : fmt(p.after)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{p.r.skip ? '' : <span className={p.after > p.before ? 'text-blue-500' : p.after < p.before ? 'text-red-500' : ''}>{p.after - p.before > 0 ? '+' : ''}{fmt(p.after - p.before)}</span>}</td>
                      <td className="px-2 py-1 text-right">{p.r.skip ? '' : <RateText r={p.vsComp} />}</td>
                      <td className="px-2 py-1 text-gray-400">{p.r.skip ?? p.r.note ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2">
              <button disabled={busy || applicable.length === 0} onClick={applyBulk}
                className="text-[11px] px-3 py-1 rounded-lg bg-indigo-600 text-white font-semibold disabled:opacity-40">{applicable.length}개 SKU에 적용</button>
              <button onClick={() => setBulk(null)} className="text-[11px] px-2 py-1 text-gray-500">취소</button>
              <span className="text-[11px] text-gray-400">제외 {preview.length - applicable.length}개 · 적용 후 되돌리기 가능 · 활동 로그 기록</span>
            </div>
          </>
        )}
      </div>
    );
  };

  const checkbox = (ids: string[], label: string) => {
    const all = ids.length > 0 && ids.every((id) => picked.has(id));
    return (
      <input type="checkbox" aria-label={label} checked={all}
        onChange={(e) => { setBulk(null); setPicked((p) => { const n = new Set(p); ids.forEach((id) => (e.target.checked ? n.add(id) : n.delete(id))); return n; }); }} />
    );
  };
  const undoBtn = (s: SkuData) => (undoStacks[s.id]?.length ? (
    <button onClick={() => undoOne(s.id)} className="text-[11px] px-2 py-0.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-600">↩ 되돌리기 ({undoStacks[s.id].length})</button>
  ) : null);

  // ── 보기별 본문 ──
  let body: ReactNode;
  let fixedTop: ReactNode = null;
  if (list.length === 0) {
    body = <div className="p-8 text-center text-sm text-gray-400">조건에 맞는 SKU가 없습니다.</div>;
  } else if (view === 'ws' || view === 'total') {
    body = <OrderReviewSection skus={list} view={view === 'ws' ? 'decide' : 'total'} targetComparable={targetComparable && !onlyEmpty && !onlyOpen && !req} onNavigateToSku={onNavigateToSku}
      review={{
        req,
        picked: canPickReq ? reqPick : null,
        onPick: (id) => setReqPick((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])),
        onClearPick: () => setReqPick([]),
        onCreate: () => setReqModal(true),
      }} />;
  } else {
    fixedTop = (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
          <span>SKU별 결정 표의 ② 월 계획을 SKU마다 쌓은 화면 · 비중 입력은 월 계획 권한 · 입력 시 그 달 채널 구성비 유지 · 확정 채널 · 마케팅 고정</span>
          <TableLegend overLabel="리오더 · 품절" />
        </div>
        {pickedSkus.length > 0 && bulkBar()}
      </div>
    );
    body = (
      <div className="flex flex-col gap-3">
        {groups.map((g) => (
          <div key={g.k} className="flex flex-col gap-2">
            <div className="flex items-center gap-2 pt-1">
              {checkbox(g.arr.map((s) => s.id), `${g.label} 전체 선택`)}
              <b className="text-sm text-gray-800">{g.label}</b>
              <span className="text-[11px] text-gray-500">{g.arr.length}개 · 발주량 {fmt(g.arr.reduce((a, s) => a + s.totalOrderQty, 0))} · 판매 목표 {fmt(g.arr.reduce((a, s) => a + s.monthlySplit.reduce((x, y) => x + y.quantity, 0), 0))}</span>
            </div>
            {g.arr.map((s) => (
              <div key={s.id} className={`rounded-lg border overflow-hidden ${picked.has(s.id) ? 'border-indigo-400 ring-1 ring-indigo-300' : 'border-gray-200'}`}>
                <div className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 bg-gray-50 border-b border-gray-200">
                  {checkbox([s.id], `${s.skuName} 선택`)}
                  <b className="text-xs text-gray-800">{s.skuName}</b>
                  <span className="text-[11px] text-gray-500">{s.brand} · {s.category} · 발주량 {fmt(s.totalOrderQty)} · 대응 {compText(s)}</span>
                  {notes(s)}
                  <span className="flex-1" />
                  <CoverageChip sku={s} skuMonths={getSkuMonths(s.releaseDate)} />
                  {undoBtn(s)}
                  {confirmDots(s)}
                </div>
                {isEmptyGrid(s) ? (
                  <div className="px-3 py-2 text-[11px] text-gray-500">STEP 1 미입력 · 체크 후 일괄 [대응SKU 기준 채우기] 또는 SKU별 결정에서</div>
                ) : (
                  wsTable(s, planLines(s), '발주 대비')
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 bg-white rounded-xl border border-gray-200 h-full min-h-0">
      <div className="shrink-0 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-xs">
          {([['ws', 'SKU별 결정'], ['plan', '월 계획 일괄'], ['total', '전체 합계']] as const).filter(([k]) => k !== 'plan' || allRole).map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} className={`px-3 py-1.5 ${view === k ? 'bg-gray-800 text-white font-semibold' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{l}</button>
          ))}
        </div>
        <ReviewRequestSelect requests={requests} value={req ? req.id : null} skus={skus} onChange={setReqId} />
        <span className="flex-1" />
        <span className="text-[11px] text-gray-500">{req ? '정렬 · 요청 순서' : '그룹화 · 오픈일'}</span>
        <label className="flex items-center gap-1 text-[11px] text-gray-500"><input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} />미입력만</label>
        {myGroups.length > 0 && <label className="flex items-center gap-1 text-[11px] text-gray-500"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />내 그룹 미확정만</label>}
      </div>
      {(base.errors.shipments || base.errors.teamCate || base.errors.channel) && (() => {
        // 태블로 오류는 한 줄로 (2026-11-13) — 무엇이 빠졌는지 · 다시 시도 · 원인은 [자세히]
        const what = [base.errors.shipments && '대응SKU 실적', base.errors.channel && '채널 매핑', base.errors.teamCate && '변동비'].filter(Boolean).join(' · ');
        const reason = [...new Set([base.errors.shipments, base.errors.channel, base.errors.teamCate].filter((x): x is NonNullable<typeof x> => !!x).map((x) => TABLEAU_ERROR_MESSAGES[x]))].join(' · ');
        return (
          <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] rounded px-2 py-0.5 border ${base.errors.teamCate ? 'text-red-700 bg-red-50 border-red-200' : 'text-amber-800 bg-amber-50 border-amber-200'}`}>
            <b>태블로 연결 오류</b>
            <span>{what} 없음{base.errors.teamCate ? ' · 공헌이익 계산 중단' : ''}{base.errors.shipments ? ' · 대응SKU 기준 일괄 제외' : ''}</span>
            <span className="flex-1" />
            {errDetail && <span className="text-gray-600">{reason}</span>}
            <button onClick={() => setErrDetail((v) => !v)} className="underline">{errDetail ? '접기' : '자세히'}</button>
            <button onClick={base.retry} className="underline font-semibold">다시 시도</button>
          </div>
        );
      })()}
      {toast && (
        <div className="flex flex-wrap items-center gap-2 text-xs rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 px-3 py-1.5">
          <span>{toast.text}</span>
          {toast.undo && <button disabled={busy} onClick={undoBulk} className="px-2 py-0.5 rounded border border-emerald-400 bg-white">되돌리기</button>}
          <span className="flex-1" />
          <button onClick={() => setToast(null)} className="text-emerald-700/70">닫기</button>
        </div>
      )}
      {reqId && !req && reqLoaded && (
        <div className="flex items-center gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          검토 요청 없음 · 링크가 잘못됐거나 삭제됨 · 전체 SKU 표시 중
          <button onClick={() => setReqId(null)} className="underline">닫기</button>
        </div>
      )}
      {req && <ReviewRequestBanner req={req} skus={skus} allSkuIds={allSkuIds} onExit={() => setReqId(null)}
        onCopied={(ok) => setToast({ text: ok ? '링크 복사됨 · 공유할 곳에 붙여넣기' : '복사 안 됨 · 브라우저 권한 확인' })}
        onDeleted={(name) => { setReqId(null); setToast({ text: `${name} 삭제됨` }); }}
        onError={(text) => setToast({ text })} />}
      {fixedTop}
      </div>
      {reqModal && (
        <ReviewRequestModal picked={reqPick.map((id) => skus.find((s) => s.id === id)).filter((s): s is SkuData => !!s)}
          onCancel={() => setReqModal(false)}
          onDone={(r, copied) => { setReqModal(false); setReqId(r.id); setToast({ text: `${r.name} 만듦 · ${copied ? '링크 복사됨' : '링크 복사 안 됨 · 배너의 [링크 복사] 사용'}` }); }} />
      )}
      <div className={`flex-1 min-h-0 ${(view === 'ws' || view === 'total') && list.length > 0 ? '' : 'overflow-auto'}`}>{body}</div>
    </div>
  );
}
