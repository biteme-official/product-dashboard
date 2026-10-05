import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  CHANNELS, CHANNEL_CONFIRM_GROUP, getDisabledChannels, getSkuMonths, isMarketingLocked,
  isSeasonOnly, type Channel, type ChannelConfirmField, type ChannelMonthQtyEntry, type Month, type SkuData,
} from '../types';
import { useStore, planScopeOf } from '../store';
import { useAuth } from '../store/auth';
import { usePermission } from '../contexts/PermissionsContext';
import { canConfirmGroup, isAllChannelRole, ownedChannels, ownsChannel, type QtyChannel } from '../utils/channelOwnership';
import {
  buildCompareData, calcVarCostResults, compareNamesOf, fallbackWeightsOf, getCompQty, type CompareData,
} from '../utils/compareData';
import { allocate, redistributeByWeights, setMonthTotal } from '../utils/qtyPlan';
import { PRICING_DEFAULT_OPT, PRICING_SCENARIOS } from '../utils/pricingScenarios';
import { useExchangeRates } from '../utils/useExchangeRates';
import {
  fetchChannelShipments, fetchSkuShipments, fetchTeamCateData,
  type ChannelDataMap, type SkuShipmentInfo, type TeamCateMap,
} from '../services/tableau';
import { SkuCard, CoverageChip } from './SkuCard';

// ── 공용 ────────────────────────────────────────────────────────────────
type View = 'ws' | 'ch' | 'plan';
type GroupBy = 'open' | 'cat' | 'brand';
const QTY_CHANNELS: QtyChannel[] = [...CHANNELS, '마케팅'];
const GROUP_LABEL: Record<ChannelConfirmField, string> = {
  step2PlatformConfirmed: '플랫폼', step2BrandConfirmed: '브랜드', step2GlobalConfirmed: '글로벌',
};
const CONFIRM_FIELDS: ChannelConfirmField[] = ['step2PlatformConfirmed', 'step2BrandConfirmed', 'step2GlobalConfirmed'];

const fmt = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '–' : Math.round(n).toLocaleString());
const won = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e8 ? `${(a / 1e8).toFixed(2)}억` : a >= 1e4 ? `${Math.round(a / 1e4).toLocaleString()}만` : Math.round(a).toLocaleString();
  return n < 0 ? `−${s}` : s;
};
const rate = (a: number, b: number | null | undefined) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);
function RateText({ r }: { r: number | null }) {
  if (r === null) return <span className="text-gray-300">–</span>;
  return <span className={r > 0 ? 'text-blue-500' : r < 0 ? 'text-red-500' : 'text-gray-400'}>{r > 0 ? '▲ +' : r < 0 ? '▼ ' : ''}{r}%</span>;
}
const isEmptyGrid = (s: SkuData) => s.channelMonthQty.every((e) => e.qty === 0);
const qtyOf = (s: SkuData, ch: QtyChannel, m: Month) =>
  ch === '마케팅' ? (s.marketingMonthQty?.[m] ?? 0) : (s.channelMonthQty.find((e) => e.channel === ch && e.month === m)?.qty ?? 0);
const releaseYearOf = (s: SkuData) => (s.releaseDate ? parseInt(s.releaseDate.split('-')[0], 10) : 2026);
const isNextYr = (m: Month, months: Month[]) => m < months[0];
const lockedCh = (s: SkuData, ch: QtyChannel) => (ch === '마케팅' ? isMarketingLocked(s) : !!s[CHANNEL_CONFIRM_GROUP[ch].field]);
const disabledCh = (s: SkuData, ch: QtyChannel) => ch !== '마케팅' && (getDisabledChannels(s) as readonly string[]).includes(ch);
const fmtDate = (d: string) => {
  if (!d) return '오픈일 미정';
  const dt = new Date(`${d}T00:00:00`);
  return `${dt.getMonth() + 1}/${dt.getDate()}(${'일월화수목금토'[dt.getDay()]}) 오픈`;
};

/** 태블로 기본 데이터(대응SKU 실적 · 채널별 출고 · 팀카테 변동비) — 서비스에서 55분 캐시 */
function useTableauBase() {
  const [shipments, setShipments] = useState<SkuShipmentInfo[]>([]);
  const [channelMap, setChannelMap] = useState<ChannelDataMap | null>(null);
  const [teamCate, setTeamCate] = useState<TeamCateMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.allSettled([fetchSkuShipments(), fetchChannelShipments(), fetchTeamCateData()]).then(([a, b, c]) => {
      if (!alive) return;
      if (a.status === 'fulfilled') setShipments(a.value); else setError(true);
      if (b.status === 'fulfilled') setChannelMap(b.value);
      if (c.status === 'fulfilled') setTeamCate(c.value);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);
  return { shipments, channelMap, teamCate, loading, error };
}

/** Enter 저장 · Esc 취소 · 바깥 클릭 저장 · 한글 조합 중 Enter 무시 */
function CellInput({ value, onCommit, disabled, suffix, className = '' }: {
  value: number; onCommit: (v: number) => void; disabled?: boolean; suffix?: string; className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  if (disabled) return <span className={`tabular-nums text-gray-500 ${className}`}>{fmt(value)}{suffix}</span>;
  if (draft === null) {
    return (
      <button type="button" onClick={() => setDraft(String(value))}
        className={`w-full text-right tabular-nums rounded px-1 py-0.5 border border-gray-200 bg-white hover:border-indigo-400 ${className}`}>
        {suffix ? `${value}${suffix}` : fmt(value)}
      </button>
    );
  }
  const commit = () => {
    const n = Number(draft.replace(/[^0-9.]/g, ''));
    setDraft(null);
    if (Number.isFinite(n) && n !== value) onCommit(n);
  };
  return (
    <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(null);
      }}
      className="w-full text-right tabular-nums rounded px-1 py-0.5 border border-indigo-400 bg-indigo-50 outline-none" />
  );
}

// ── 메인 ────────────────────────────────────────────────────────────────
type Snapshot = { id: string; patch: Partial<SkuData> };
type BulkType = 'comp' | 'copy' | 'pct' | 'scn' | 'fill' | 'pcomp' | 'pcopy';
interface BulkState { type: BulkType; pct: number; src: string | null; mode: 'ratio' | 'same'; scn: string; scope: 'all' | 'first' }
const BULK_LABEL: Record<BulkType, string> = {
  comp: '대응SKU 대비 %로 채우기', copy: '다른 SKU 월별 수량 복사', pct: '일괄 증감 %', scn: '판매가 시나리오 일괄반영',
  fill: '대응SKU 기준 채우기', pcomp: '대응SKU 실적 대비 %로 월 계획', pcopy: '다른 SKU 월 비중 복사',
};

function readSession<T>(key: string, fallback: T): T {
  try { const v = sessionStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function writeSession(key: string, v: unknown) { try { sessionStorage.setItem(key, JSON.stringify(v)); } catch { /* 무시 */ } }

export function ChannelTargetSection({ skus }: { skus: SkuData[] }) {
  const { role } = useAuth();
  const perm = usePermission(role);
  const allRole = isAllChannelRole(role);
  const canEditCh = (ch: QtyChannel) => perm.step2 && ownsChannel(role, ch);
  const myGroups = CONFIRM_FIELDS.filter((f) => canConfirmGroup(role, f));
  const base = useTableauBase();
  const { usdKrw, jpyKrw } = useExchangeRates();
  const applySkuBatch = useStore((s) => s.applySkuBatch);
  const updateChannelMonthQty = useStore((s) => s.updateChannelMonthQty);
  const updateMarketingMonthQty = useStore((s) => s.updateMarketingMonthQty);
  const updateMonthlySplit = useStore((s) => s.updateMonthlySplit);
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);
  const setChannelConfirmed = useStore((s) => s.setChannelConfirmed);

  const [view, setViewRaw] = useState<View>(() => readSession('ct:view', 'ws'));
  const setView = (v: View) => { setViewRaw(v); writeSession('ct:view', v); setPicked(new Set()); setBulk(null); };
  const [groupBy, setGroupBy] = useState<GroupBy>('open');
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [channel, setChannel] = useState<QtyChannel>(() => (ownedChannels(role)[0] ?? '자사몰'));
  const [show, setShow] = useState({ base: true, price: true, money: true });
  const [focus, setFocus] = useState<string | null>(null);
  const [visited, setVisited] = useState<string[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<BulkState | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: Snapshot[] } | null>(null);
  const [undoStacks, setUndoStacks] = useState<Record<string, Snapshot[]>>({});
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => skus
    .filter((s) => (!onlyEmpty || isEmptyGrid(s)) && (!onlyOpen || myGroups.some((f) => !s[f])))
    .slice().sort((a, b) => (a.releaseDate || '9999').localeCompare(b.releaseDate || '9999')),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [skus, onlyEmpty, onlyOpen, role]);

  const groups = useMemo(() => {
    const key = (s: SkuData) => (groupBy === 'open' ? s.releaseDate || '' : groupBy === 'cat' ? s.category : s.brand);
    const m = new Map<string, SkuData[]>();
    list.forEach((s) => { const k = key(s); if (!m.has(k)) m.set(k, []); m.get(k)!.push(s); });
    return [...m.entries()].map(([k, arr]) => ({ k, arr, label: groupBy === 'open' ? fmtDate(k) : k }));
  }, [list, groupBy]);

  // 대응SKU 비교 데이터 (카드와 같은 계산, 저장 없음)
  const compById = useMemo(() => {
    const out: Record<string, CompareData> = {};
    if (base.loading) return out;
    list.forEach((s) => { out[s.id] = buildCompareData(s, base.shipments, base.channelMap); });
    return out;
  }, [list, base.loading, base.shipments, base.channelMap]);

  const focusSku = list.find((s) => s.id === focus) ?? list[0] ?? null;
  // 최근 연 SKU 카드(최대 6개)는 숨긴 채 유지 — 넘겨도 펼친 채널 · 되돌리기 기록이 그대로
  const shownCards = focusSku && !visited.includes(focusSku.id) ? [...visited.slice(-5), focusSku.id] : visited;
  const goTo = (id: string) => { setVisited(shownCards); setFocus(id); };

  // ↑ ↓ 로 작업대 SKU 이동 (입력 중이면 무시)
  useEffect(() => {
    if (view !== 'ws') return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest('input,select,textarea,[contenteditable="true"]')) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const i = list.findIndex((s) => s.id === focusSku?.id);
      const j = e.key === 'ArrowDown' ? i + 1 : i - 1;
      if (j >= 0 && j < list.length) { e.preventDefault(); goTo(list[j].id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, list, focusSku?.id, shownCards]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const commitQty = (s: SkuData, ch: QtyChannel, m: Month, v: number) => {
    const cur = latest(s.id); if (!cur) return;
    pushUndo(cur);
    if (ch === '마케팅') { updateMarketingMonthQty(s.id, m, Math.round(v)).catch(console.error); return; }
    updateChannelMonthQty(s.id, ch, m, Math.round(v));
    persistSku(s.id).catch(console.error);
  };
  const commitPricing = (s: SkuData, keys: string[], opt: string) => {
    const cur = latest(s.id); if (!cur) return;
    pushUndo(cur);
    const next = { ...(cur.pricingOpts ?? {}) };
    keys.forEach((k) => { next[k] = opt; });
    updateSku(s.id, { pricingOpts: next });
    persistSku(s.id).catch(console.error);
  };
  const commitMonthShare = (s: SkuData, m: Month, ratio: number) => {
    const cur = latest(s.id); if (!cur) return;
    pushUndo(cur);
    updateMonthlySplit(s.id, m, ratio, fallbackWeightsOf(cur, compById[s.id]?.channelDist ?? null));
    persistSku(s.id).catch(console.error);
  };

  // ── 계산 헬퍼 (카드 PricingChannelTable과 같은 식) ──
  const scenarioPrice = (s: SkuData, ch: Channel, m: Month) => {
    const cp = s.channelPricing?.find((x) => x.channel === ch);
    const basePrice = cp && cp.price > 0 ? cp.price : s.price;
    const opt = s.pricingOpts?.[`${ch}-${m}`] ?? PRICING_DEFAULT_OPT[ch] ?? '';
    const sc = opt ? PRICING_SCENARIOS.find((x) => x.id === opt) : null;
    const rates = { specialMaxRate: s.specialMaxRate ?? 20, regularMaxRate: s.regularMaxRate ?? 15, seasonOffRate: s.seasonOffRate ?? 25 };
    return { opt, basePrice, price: sc ? sc.calcKrwPrice(basePrice, usdKrw, jpyKrw, undefined, rates) : basePrice };
  };
  const varCostOf = (s: SkuData) => {
    const cd = compById[s.id];
    return calcVarCostResults(base.teamCate, s, cd?.mode ?? 'rolling12', cd?.channelYM ?? null);
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
    if (b.type === 'pcomp' || b.type === 'pcopy') {
      if (!perm.step1) return { skip: '월 계획 권한 없음' };
      const scope = planScopeOf(s, fw);
      let entries = s.channelMonthQty;
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
    if (channel === '마케팅') return { skip: '마케팅은 칸 직접 수정' };
    const ch = channel;
    if (disabledCh(s, ch)) return { skip: '비운영' };
    if (!canEditCh(ch)) return { skip: '권한 없음' };
    if (lockedCh(s, ch)) return { skip: `${CHANNEL_CONFIRM_GROUP[ch].label} 확정` };
    if (b.type === 'scn') {
      if (!b.scn) return { skip: '시나리오 선택 필요' };
      const next = { ...(s.pricingOpts ?? {}) };
      months.forEach((m, i) => { if (b.scope === 'all' || i === 0) next[`${ch}-${m}`] = b.scn; });
      return { patch: { pricingOpts: next }, note: `${b.scope === 'first' ? '1개월차' : '전 월'} → ${b.scn}` };
    }
    const setCh = (fn: (m: Month, i: number, cur: number) => number | null) =>
      s.channelMonthQty.map((e) => {
        if (e.channel !== ch) return e;
        const i = months.indexOf(e.month);
        if (i < 0) return e;
        const v = fn(e.month, i, e.qty);
        return v == null ? e : { ...e, qty: Math.max(0, Math.round(v)) };
      });
    if (b.type === 'comp') {
      if (!cd?.channelYM) return { skip: '대응SKU 미설정' };
      let n = 0;
      const entries = setCh((m) => { const c = getCompQty(cd.channelYM, cd.mode, ch, m, months, releaseYearOf(s)); if (c == null) return null; n++; return c * (1 + b.pct / 100); });
      if (!n) return { skip: '대응 실적 없음' };
      return { patch: { channelMonthQty: entries }, note: n < months.length ? `대응 실적 없는 ${months.length - n}개월은 유지` : '' };
    }
    if (b.type === 'pct') return { patch: { channelMonthQty: setCh((_m, _i, cur) => cur * (1 + b.pct / 100)) } };
    // copy
    const src = skus.find((x) => x.id === b.src);
    if (!src || isEmptyGrid(src)) return { skip: '가져올 SKU 없음' };
    if (src.id === s.id) return { skip: '가져올 SKU' };
    if (disabledCh(src, ch)) return { skip: `가져올 SKU ${ch} 비운영` };
    const k = b.mode === 'ratio' && src.totalOrderQty ? s.totalOrderQty / src.totalOrderQty : 1;
    const sm = getSkuMonths(src.releaseDate);
    return { patch: { channelMonthQty: setCh((_m, i) => qtyOf(src, ch, sm[i]) * k) } };
  };

  const pickedSkus = list.filter((s) => picked.has(s.id));
  const preview = bulk ? pickedSkus.map((s) => {
    const r = computeBulk(bulk, s);
    const isPlan = bulk.type === 'fill' || bulk.type === 'pcomp' || bulk.type === 'pcopy';
    const months = getSkuMonths(s.releaseDate);
    const sumOf = (entries: ChannelMonthQtyEntry[]) => entries.filter((e) => months.includes(e.month) && (isPlan || e.channel === channel)).reduce((a, e) => a + e.qty, 0);
    const cd = compById[s.id];
    const compSum = cd?.channelYM && !isPlan && channel !== '마케팅'
      ? months.reduce((a, m) => a + (getCompQty(cd.channelYM, cd.mode, channel as Channel, m, months, releaseYearOf(s)) ?? 0), 0)
      : isPlan && cd ? months.reduce((a, m) => a + (cd.monthly[m] ?? 0), 0) : 0;
    const before = sumOf(s.channelMonthQty);
    const after = r.patch?.channelMonthQty ? sumOf(r.patch.channelMonthQty) : before;
    return { s, r, before, after, vsComp: compSum ? rate(after, compSum) : null };
  }) : [];
  const applicable = preview.filter((p) => p.r.patch);

  const applyBulk = async () => {
    if (!bulk || applicable.length === 0) return;
    setBusy(true);
    const undo = applicable.map((p) => snapshotOf(p.s));
    const label = `${BULK_LABEL[bulk.type]}${bulk.type === 'comp' || bulk.type === 'pct' || bulk.type === 'pcomp' ? ` ${bulk.pct}%` : ''}${view === 'ch' ? ` · ${channel}` : ''}`;
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
  const confirmPicked = async (field: ChannelConfirmField) => {
    setBusy(true);
    try {
      for (const s of pickedSkus) if (!isEmptyGrid(s) && !s[field]) await setChannelConfirmed(s.id, field, true);
      setToast({ text: `선택 SKU ${GROUP_LABEL[field]} 확정` });
      setPicked(new Set());
    } finally { setBusy(false); }
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
    return `${names.join(', ')} · ${cd?.modeLabel ?? ''}`;
  };
  const confirmDots = (s: SkuData) => (
    <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
      {CONFIRM_FIELDS.map((f) => (
        <span key={f} className="flex items-center gap-0.5"><span className={`inline-block w-1.5 h-1.5 rounded-full ${s[f] ? 'bg-emerald-500' : 'bg-gray-300'}`} />{GROUP_LABEL[f]}</span>
      ))}
    </span>
  );

  /** 월 열 + 연도 소계 + 합계 머리줄 */
  const MonthHead = ({ months, ry, first = '구분' }: { months: Month[]; ry: number; first?: string }) => {
    const hasY2 = months.some((m) => isNextYr(m, months));
    return (
      <tr className="bg-gray-50 border-b border-gray-200">
        <th className="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-500 whitespace-nowrap">{first}</th>
        {months.map((m) => (
          <th key={m} className={`px-2 py-1.5 text-center text-[11px] font-semibold ${isNextYr(m, months) ? 'text-blue-600 bg-blue-50/60' : 'text-gray-600'}`} style={{ minWidth: 68 }}>
            {m}월{isNextYr(m, months) && <div className="text-[9px] font-normal text-blue-400">{(ry + 1) % 100}년</div>}
          </th>
        ))}
        <th className="px-2 py-1.5 text-center text-[11px] font-semibold text-indigo-700 bg-indigo-50 whitespace-nowrap">{ry % 100}년 소계</th>
        {hasY2 && <th className="px-2 py-1.5 text-center text-[11px] font-semibold text-blue-700 bg-blue-50 whitespace-nowrap">{(ry + 1) % 100}년 소계</th>}
        <th className="px-2 py-1.5 text-center text-[11px] font-semibold text-gray-600 bg-gray-100">합계</th>
      </tr>
    );
  };
  const Row = ({ label, sub, months, cell, total, cls = '', fmtTotal = fmt }: {
    label: ReactNode; sub?: string; months: Month[]; cell: (m: Month) => ReactNode; total?: (ms: Month[]) => number | null; cls?: string; fmtTotal?: (n: number) => ReactNode;
  }) => {
    const y1 = months.filter((m) => !isNextYr(m, months));
    const y2 = months.filter((m) => isNextYr(m, months));
    const t = (ms: Month[]) => (total ? total(ms) : null);
    const show = (v: number | null) => (v == null ? <span className="text-gray-300">–</span> : fmtTotal(v));
    return (
      <tr className={`border-b border-gray-100 ${cls}`}>
        <td className="px-2 py-1 whitespace-nowrap text-[11px] text-gray-500 border-r border-gray-100">
          {label}{sub && <div className="text-[9px] text-gray-400 leading-tight">{sub}</div>}
        </td>
        {months.map((m) => <td key={m} className="px-1.5 py-1 text-right tabular-nums text-[11px]">{cell(m)}</td>)}
        <td className="px-2 py-1 text-right tabular-nums text-[11px] font-semibold bg-indigo-50/50 whitespace-nowrap">{show(t(y1))}</td>
        {y2.length > 0 && <td className="px-2 py-1 text-right tabular-nums text-[11px] font-semibold bg-blue-50/40 whitespace-nowrap">{show(t(y2))}</td>}
        <td className="px-2 py-1 text-right tabular-nums text-[11px] font-semibold bg-gray-50 whitespace-nowrap">{show(t(months))}</td>
      </tr>
    );
  };

  /** 카드 "채널 펼침 상세"와 같은 행 구성 */
  const channelRows = (s: SkuData, ch: QtyChannel) => {
    const months = getSkuMonths(s.releaseDate);
    const ry = releaseYearOf(s);
    const cd = compById[s.id];
    const editable = canEditCh(ch) && !lockedCh(s, ch) && !disabledCh(s, ch);
    const sumQ = (ms: Month[]) => ms.reduce((a, m) => a + qtyOf(s, ch, m), 0);
    if (ch === '마케팅') {
      return (
        <>
          <Row label="수량" months={months} total={sumQ}
            cell={(m) => <CellInput value={qtyOf(s, ch, m)} disabled={!editable} onCommit={(v) => commitQty(s, ch, m, v)} />} />
          <Row label={<span className="text-red-500">예상 비용</span>} months={months} total={(ms) => s.cost * sumQ(ms)} fmtTotal={won}
            cell={(m) => <span className="text-red-400">{qtyOf(s, ch, m) ? won(s.cost * qtyOf(s, ch, m)) : '–'}</span>} />
        </>
      );
    }
    const comp = (m: Month) => (cd ? getCompQty(cd.channelYM, cd.mode, ch, m, months, ry) : null);
    const compSum = (ms: Month[]) => (cd?.channelYM ? ms.reduce((a, m) => a + (comp(m) ?? 0), 0) : null);
    const baseQty = (m: Month) => s.step2InitBaselineQty?.find((e) => e.channel === ch && e.month === m)?.qty ?? null;
    const vc = varCostOf(s)[ch]?.ratio ?? 0.25;
    const rev = (m: Month) => Math.round((scenarioPrice(s, ch, m).price / 1.1) * qtyOf(s, ch, m));
    const pro = (m: Month) => Math.round(rev(m) * (1 - vc) - s.cost * qtyOf(s, ch, m));
    return (
      <>
        <Row label={<span className="font-bold text-gray-600">대응SKU</span>} sub={cd?.mode === 'samePeriod' ? '동기간' : '직전 12개월'} months={months} cls="bg-gray-100/70"
          total={compSum} cell={(m) => <span className="text-gray-600">{fmt(comp(m))}</span>} />
        <Row label={<span className="font-semibold text-gray-700">목표 수량</span>} months={months} total={sumQ}
          cell={(m) => <CellInput value={qtyOf(s, ch, m)} disabled={!editable} onCommit={(v) => commitQty(s, ch, m, v)} className="font-semibold" />} />
        <Row label="증감" sub="vs 대응SKU" months={months}
          total={(ms) => { const c = compSum(ms); return c ? rate(sumQ(ms), c) : null; }}
          fmtTotal={(v) => <RateText r={v} />}
          cell={(m) => <RateText r={rate(qtyOf(s, ch, m), comp(m))} />} />
        {show.base && s.step2InitBaselineQty && s.step2InitBaselineQty.length > 0 && (
          <Row label="기존 세팅값 대비" months={months}
            total={(ms) => ms.reduce((a, m) => a + qtyOf(s, ch, m) - (baseQty(m) ?? 0), 0)}
            fmtTotal={(v) => <span className={v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-500' : 'text-gray-400'}>{v > 0 ? '+' : ''}{fmt(v)}</span>}
            cell={(m) => { const d = qtyOf(s, ch, m) - (baseQty(m) ?? 0); return <span className={d > 0 ? 'text-emerald-600' : d < 0 ? 'text-red-500' : 'text-gray-300'}>{d > 0 ? '+' : ''}{fmt(d)}</span>; }} />
        )}
        {show.price && (
          <>
            <tr className="border-b border-gray-100">
              <td className="px-2 py-1 whitespace-nowrap text-[11px] text-gray-500 border-r border-gray-100">판매가 설정</td>
              {months.map((m) => {
                const { opt, basePrice } = scenarioPrice(s, ch, m);
                return (
                  <td key={m} className="px-1 py-1">
                    <select value={opt} disabled={!editable} onChange={(e) => commitPricing(s, [`${ch}-${m}`], e.target.value)}
                      className="w-full text-[10px] rounded border border-gray-200 px-0.5 py-0.5 bg-white disabled:bg-gray-50 disabled:text-gray-400">
                      <option value="">채널가</option>
                      {PRICING_SCENARIOS.map((sc) => {
                        const suffix = sc.hint ?? (basePrice > 0 ? `${Math.round((1 - sc.calcKrwPrice(basePrice, usdKrw, jpyKrw, undefined, { specialMaxRate: s.specialMaxRate ?? 20, regularMaxRate: s.regularMaxRate ?? 15, seasonOffRate: s.seasonOffRate ?? 25 }) / basePrice) * 100)}%` : '');
                        return <option key={sc.id} value={sc.id}>{sc.label} ({suffix})</option>;
                      })}
                    </select>
                  </td>
                );
              })}
              <td colSpan={months.some((m) => isNextYr(m, months)) ? 3 : 2} className="px-1 py-1 bg-gray-50">
                {editable && (
                  <select value="" onChange={(e) => e.target.value && commitPricing(s, months.map((m) => `${ch}-${m}`), e.target.value)}
                    className="w-full text-[10px] rounded border border-gray-300 px-0.5 py-0.5 bg-white">
                    <option value="">일괄반영…</option>
                    {PRICING_SCENARIOS.map((sc) => <option key={sc.id} value={sc.id}>{sc.label}</option>)}
                  </select>
                )}
              </td>
            </tr>
            <Row label="실 판매가" months={months} cell={(m) => fmt(scenarioPrice(s, ch, m).price)} />
          </>
        )}
        {show.money && (
          <>
            <Row label={<span className="font-bold text-blue-700">예상 순매출</span>} months={months} total={(ms) => ms.reduce((a, m) => a + rev(m), 0)} fmtTotal={won}
              cell={(m) => <span className="text-blue-700">{rev(m) ? won(rev(m)) : '–'}</span>} />
            <Row label={<span className="font-bold text-emerald-700">예상 공헌이익</span>} months={months} total={(ms) => ms.reduce((a, m) => a + pro(m), 0)} fmtTotal={won}
              cell={(m) => <span className="text-emerald-700">{qtyOf(s, ch, m) ? won(pro(m)) : '–'}</span>} />
          </>
        )}
      </>
    );
  };

  /** 카드 "월 계획" 표와 같은 행 구성 */
  const planRows = (s: SkuData) => {
    const months = getSkuMonths(s.releaseDate);
    const cd = compById[s.id];
    const q = (m: Month) => s.monthlySplit.find((x) => x.month === m)?.quantity ?? 0;
    const sumQ = (ms: Month[]) => ms.reduce((a, m) => a + q(m), 0);
    const compM = (m: Month) => cd?.monthly[m] ?? null;
    const compSum = (ms: Month[]) => (cd && Object.keys(cd.monthly).length ? ms.reduce((a, m) => a + (compM(m) ?? 0), 0) : null);
    const allConf = CHANNELS.filter((c) => !disabledCh(s, c)).every((c) => lockedCh(s, c));
    const can1 = perm.step1 && !allConf && s.totalOrderQty > 0;
    let acc = 0;
    const cum = months.map((m) => (acc += q(m)));
    const firstOver = cum.findIndex((v) => v > s.totalOrderQty);
    const season = isSeasonOnly(s);
    return (
      <>
        <Row label={<span className="font-bold text-gray-600">대응SKU 실적</span>} sub={cd?.names.length ? cd.modeLabel : 'SKU 미설정'} months={months} cls="bg-gray-100/70"
          total={compSum} cell={(m) => <span className="text-gray-600">{fmt(compM(m))}</span>} />
        <Row label="수량" months={months} total={sumQ} cell={(m) => <span className="font-semibold">{q(m) ? fmt(q(m)) : '–'}</span>} />
        <Row label="비중" sub="발주량 대비" months={months}
          total={(ms) => (s.totalOrderQty ? Math.round((sumQ(ms) / s.totalOrderQty) * 100) : null)} fmtTotal={(v) => `${v}%`}
          cell={(m) => <CellInput value={s.monthlySplit.find((x) => x.month === m)?.ratio ?? 0} suffix="%" disabled={!can1} onCommit={(v) => commitMonthShare(s, m, v)} />} />
        {sumQ(months) > 0 && (
          <tr className="border-b border-gray-100">
            <td className="px-2 py-1 whitespace-nowrap text-[11px] text-gray-500 border-r border-gray-100">누적<div className="text-[9px] text-gray-400">발주 {fmt(s.totalOrderQty)} 기준</div></td>
            {months.map((m, i) => (
              <td key={m} className={`px-1.5 py-1 text-right tabular-nums text-[11px] ${firstOver >= 0 && i >= firstOver ? 'bg-amber-50 text-amber-700 font-semibold' : 'text-gray-500'}`}>
                {fmt(cum[i])}{i === firstOver && <div className="text-[9px] font-bold">{season ? '품절 예상' : '리오더 시작'}</div>}
              </td>
            ))}
            <td colSpan={months.some((m) => isNextYr(m, months)) ? 3 : 2} className="px-2 py-1 text-center text-[11px] text-gray-500 bg-gray-50">
              {(() => { const d = sumQ(months) - s.totalOrderQty; return d > 0 ? `발주량 +${fmt(d)}` : d < 0 ? `발주량 −${fmt(-d)}` : '발주량과 같음'; })()}
            </td>
          </tr>
        )}
        <Row label="증감율" sub="vs 대응SKU" months={months}
          total={(ms) => { const c = compSum(ms); return c ? rate(sumQ(ms), c) : null; }} fmtTotal={(v) => <RateText r={v} />}
          cell={(m) => <RateText r={rate(q(m), compM(m))} />} />
      </>
    );
  };

  // ── 일괄 작업 막대 ──
  const bulkBar = () => {
    const opts: BulkType[] = view === 'plan' ? ['pcomp', 'pcopy'] : ['comp', 'copy', 'pct', 'scn', 'fill'];
    const srcOptions = pickedSkus.filter((s) => !isEmptyGrid(s));
    const srcSku = skus.find((x) => x.id === bulk?.src);
    const tgtSku = pickedSkus.find((x) => x.id !== bulk?.src && !isEmptyGrid(x));
    const copyExample = () => {
      if (!bulk || !srcSku || !tgtSku || channel === '마케팅') return '가져올 SKU와 받을 SKU를 함께 선택하세요';
      const sm = getSkuMonths(srcSku.releaseDate), tm = getSkuMonths(tgtSku.releaseDate);
      const k = bulk.mode === 'ratio' && srcSku.totalOrderQty ? tgtSku.totalOrderQty / srcSku.totalOrderQty : 1;
      const a = [0, 1, 2].map((i) => `${sm[i]}월 ${fmt(qtyOf(srcSku, channel, sm[i]))}`).join(' · ');
      const c = [0, 1, 2].map((i) => `${tm[i]}월 ${fmt(qtyOf(srcSku, channel, sm[i]) * k)}`).join(' · ');
      return `예) ${srcSku.skuName} ${channel} ${a} … → ${tgtSku.skuName} ${c} …${bulk.mode === 'ratio' ? ` (발주량 ${fmt(tgtSku.totalOrderQty)} ÷ ${fmt(srcSku.totalOrderQty)} = ×${Math.round(k * 100) / 100})` : ''} · 출시 첫 달끼리 맞춤`;
    };
    const disabledType = (t: BulkType) => (t === 'fill' && (!allRole || !perm.step2)) || ((t === 'pcomp' || t === 'pcopy') && !perm.step1);
    return (
      <div className="sticky top-0 z-10 rounded-lg border border-indigo-300 bg-indigo-50/95 px-3 py-2 flex flex-col gap-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-indigo-700 px-2 py-0.5 rounded-full bg-white border border-indigo-200">{pickedSkus.length}개 선택</span>
          {opts.map((t) => (
            <button key={t} disabled={disabledType(t)}
              onClick={() => setBulk({ type: t, pct: 10, src: srcOptions[0]?.id ?? null, mode: 'ratio', scn: '', scope: 'all' })}
              className={`text-[11px] px-2.5 py-1 rounded-lg border bg-white disabled:opacity-40 disabled:cursor-not-allowed ${bulk?.type === t ? 'border-indigo-500 text-indigo-700 font-semibold' : 'border-gray-200 text-gray-600 hover:border-indigo-300'}`}>
              {BULK_LABEL[t]}
            </button>
          ))}
          {view === 'ch' && channel !== '마케팅' && myGroups.includes(CHANNEL_CONFIRM_GROUP[channel].field) && (
            <button disabled={busy} onClick={() => confirmPicked(CHANNEL_CONFIRM_GROUP[channel as Channel].field)}
              className="text-[11px] px-2.5 py-1 rounded-lg border border-emerald-400 bg-emerald-50 text-emerald-700 font-semibold">
              선택 SKU {CHANNEL_CONFIRM_GROUP[channel].label} 확정
            </button>
          )}
          <span className="flex-1" />
          <button onClick={() => { setPicked(new Set()); setBulk(null); }} className="text-[11px] text-gray-500 hover:text-gray-700">선택 해제</button>
        </div>
        {bulk && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
              {(bulk.type === 'comp' || bulk.type === 'pct' || bulk.type === 'pcomp') && (
                <>
                  <span>{bulk.type === 'pct' ? `${channel} 월별 목표를` : bulk.type === 'comp' ? `${channel} 월별 목표 = 대응SKU 같은 달 × (1 +` : '월 판매 목표 = 대응SKU 실적 × (1 +'}</span>
                  <input type="number" value={bulk.pct} onChange={(e) => setBulk({ ...bulk, pct: Number(e.target.value) || 0 })}
                    className="w-16 text-right rounded border border-gray-300 px-1 py-0.5 bg-white" />
                  <span>{bulk.type === 'pct' ? '% 증감' : '%)'}{bulk.type === 'pcomp' && ' · 그 달 채널 구성비 유지 · 확정 채널 · 마케팅 고정'}</span>
                </>
              )}
              {(bulk.type === 'copy' || bulk.type === 'pcopy') && (
                <>
                  <span>가져올 SKU</span>
                  <select value={bulk.src ?? ''} onChange={(e) => setBulk({ ...bulk, src: e.target.value })} className="rounded border border-gray-300 px-1 py-0.5 bg-white">
                    {srcOptions.map((s) => <option key={s.id} value={s.id}>{s.skuName}</option>)}
                  </select>
                  {bulk.type === 'copy' ? (
                    <span className="inline-flex rounded border border-gray-300 overflow-hidden">
                      {(['ratio', 'same'] as const).map((m) => (
                        <button key={m} onClick={() => setBulk({ ...bulk, mode: m })} className={`px-2 py-0.5 ${bulk.mode === m ? 'bg-gray-800 text-white' : 'bg-white'}`}>
                          {m === 'ratio' ? '발주량에 맞춰 조정' : '같은 수량으로'}
                        </button>
                      ))}
                    </span>
                  ) : <span>고른 SKU의 월 비중을 출시 첫 달끼리 · 둘째 달끼리 맞춰 넣음 · 그 달 채널 구성비 유지</span>}
                </>
              )}
              {bulk.type === 'scn' && (
                <>
                  <select value={bulk.scn} onChange={(e) => setBulk({ ...bulk, scn: e.target.value })} className="rounded border border-gray-300 px-1 py-0.5 bg-white">
                    <option value="">시나리오 선택</option>
                    {PRICING_SCENARIOS.map((sc) => <option key={sc.id} value={sc.id}>{sc.label}</option>)}
                  </select>
                  <span className="inline-flex rounded border border-gray-300 overflow-hidden">
                    {(['all', 'first'] as const).map((m) => (
                      <button key={m} onClick={() => setBulk({ ...bulk, scope: m })} className={`px-2 py-0.5 ${bulk.scope === m ? 'bg-gray-800 text-white' : 'bg-white'}`}>{m === 'all' ? '전 월' : '1개월차만'}</button>
                    ))}
                  </span>
                </>
              )}
              {bulk.type === 'fill' && <span>비어 있는 SKU만 · 대응SKU 채널 비중 × 발주량 8개월 균등 (카드 첫 진입 때와 같은 계산)</span>}
            </div>
            {bulk.type === 'copy' && <div className="text-[11px] text-gray-500">{copyExample()}</div>}
            <div className="overflow-x-auto">
              <table className="text-[11px] min-w-[560px] w-full bg-white rounded border border-gray-200">
                <thead><tr className="bg-gray-50 text-gray-500">
                  <th className="px-2 py-1 text-left">SKU</th>
                  <th className="px-2 py-1 text-right">{bulk.type === 'fill' || bulk.type === 'pcomp' || bulk.type === 'pcopy' ? '판매 목표' : `${channel} 합계`} 전</th>
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
  if (list.length === 0) {
    body = <div className="p-8 text-center text-sm text-gray-400">조건에 맞는 SKU가 없습니다.</div>;
  } else if (view === 'ws') {
    const idx = focusSku ? list.indexOf(focusSku) : -1;
    body = (
      <div className="grid gap-3 md:grid-cols-[240px_minmax(0,1fr)]">
        <div className="flex flex-col gap-1 md:max-h-[calc(100vh-260px)] md:overflow-auto pr-1">
          {groups.map((g) => (
            <div key={g.k} className="flex flex-col gap-1">
              <div className="text-[11px] font-semibold text-gray-500 px-1 pt-1">{g.label}</div>
              {g.arr.map((s) => (
                <button key={s.id} onClick={() => goTo(s.id)}
                  className={`text-left rounded-lg border px-2.5 py-1.5 flex flex-col gap-0.5 ${s.id === focusSku?.id ? 'border-indigo-500 bg-indigo-50/60 shadow-[inset_3px_0_0_#6366f1]' : 'border-gray-200 bg-white hover:border-indigo-300'}`}>
                  <span className="text-xs font-semibold text-gray-800 truncate">{s.skuName || '(SKU명 미입력)'}</span>
                  <span className="text-[10px] text-gray-500">{isEmptyGrid(s) ? '미입력' : `판매 목표 ${fmt(s.monthlySplit.reduce((a, x) => a + x.quantity, 0))} / 발주 ${fmt(s.totalOrderQty)}`}</span>
                  {confirmDots(s)}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="min-w-0 flex flex-col gap-2">
          {focusSku && (
            <div className="flex flex-wrap items-center gap-2">
              <button disabled={idx <= 0} onClick={() => goTo(list[idx - 1].id)} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 bg-white disabled:opacity-40">↑ 이전</button>
              <button disabled={idx >= list.length - 1} onClick={() => goTo(list[idx + 1].id)} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 bg-white disabled:opacity-40">↓ 다음</button>
              <span className="text-[11px] text-gray-400">{idx + 1} / {list.length} · ↑ ↓ 키로 이동 · 최근 연 SKU는 펼친 채널 · 되돌리기 기록 유지 · 빈 SKU는 [대응SKU 기준 채우기]로만 채움</span>
            </div>
          )}
          {shownCards.map((id) => {
            const s = skus.find((x) => x.id === id);
            if (!s) return null;
            return (
              <div key={id} hidden={id !== focusSku?.id}>
                <SkuCard sku={s} embedded autoInit={false} />
              </div>
            );
          })}
        </div>
      </div>
    );
  } else if (view === 'ch') {
    body = (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1 border-b border-gray-200">
          {QTY_CHANNELS.map((c) => (
            <button key={c} onClick={() => { setChannel(c); setBulk(null); }}
              className={`px-3 py-1.5 text-xs border-b-2 -mb-px ${channel === c ? 'border-indigo-600 text-gray-900 font-semibold' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {c}{!allRole && ownsChannel(role, c) && <span className="ml-1 text-[9px] font-bold text-indigo-600">내 채널</span>}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
          <span>{canEditCh(channel) ? `${channel} 수정 가능` : `${channel} 보기만`} · 카드의 "{channel}" 펼침 상세를 SKU마다 쌓은 화면 · 확정 그룹 {channel === '마케팅' ? '플랫폼' : CHANNEL_CONFIRM_GROUP[channel].label}</span>
          <span className="flex-1" />
          {channel !== '마케팅' && (
            <>
              <span>표시</span>
              {([['base', '기존 대비'], ['price', '판매가'], ['money', '순매출 · 공헌이익']] as const).map(([k, l]) => (
                <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} />{l}</label>
              ))}
            </>
          )}
        </div>
        {pickedSkus.length > 0 && bulkBar()}
        {groups.map((g) => {
          const tot = g.arr.reduce((a, s) => a + (disabledCh(s, channel) ? 0 : getSkuMonths(s.releaseDate).reduce((x, m) => x + qtyOf(s, channel, m), 0)), 0);
          return (
            <div key={g.k} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 pt-1">
                {checkbox(g.arr.map((s) => s.id), `${g.label} 전체 선택`)}
                <b className="text-sm text-gray-800">{g.label}</b>
                <span className="text-[11px] text-gray-500">{g.arr.length}개 · {channel} 합계 {fmt(tot)}</span>
              </div>
              {g.arr.map((s) => {
                const months = getSkuMonths(s.releaseDate);
                const off = disabledCh(s, channel);
                const field = channel === '마케팅' ? 'step2PlatformConfirmed' as const : CHANNEL_CONFIRM_GROUP[channel].field;
                const t = months.reduce((a, m) => a + qtyOf(s, channel, m), 0);
                const sum = CHANNELS.reduce((a, c) => a + months.reduce((x, m) => x + qtyOf(s, c, m), 0), 0);
                return (
                  <div key={s.id} className={`rounded-lg border overflow-hidden ${picked.has(s.id) ? 'border-indigo-400 ring-1 ring-indigo-300' : lockedCh(s, channel) ? 'border-emerald-300' : 'border-gray-200'}`}>
                    <div className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 bg-gray-50 border-b border-gray-200">
                      {checkbox([s.id], `${s.skuName} 선택`)}
                      <b className="text-xs text-gray-800">{s.skuName}</b>
                      <span className="text-[11px] text-gray-500">{s.brand} · {s.category} · 발주량 {fmt(s.totalOrderQty)} · 대응 {compText(s)}</span>
                      {notes(s)}
                      <span className="flex-1" />
                      {!isEmptyGrid(s) && !off && channel !== '마케팅' && <span className="text-[11px] text-gray-500">비중 {sum ? Math.round((t / sum) * 100) : 0}%</span>}
                      <CoverageChip sku={s} skuMonths={months} />
                      {undoBtn(s)}
                      <button disabled={!perm.step2 || !canConfirmGroup(role, field) || isEmptyGrid(s) || busy}
                        onClick={() => setChannelConfirmed(s.id, field, !s[field]).catch(console.error)}
                        className={`text-[11px] px-2 py-0.5 rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${s[field] ? 'bg-emerald-600 text-white' : 'border border-emerald-400 bg-emerald-50 text-emerald-700'}`}>
                        {GROUP_LABEL[field]} 확정
                      </button>
                    </div>
                    {isEmptyGrid(s) ? (
                      <div className="px-3 py-2 flex items-center gap-2 text-[11px] text-gray-500">
                        STEP 1 미입력 · 이 화면은 열기만 해서는 채우지 않음
                        {allRole && perm.step2 && <button onClick={() => { setPicked(new Set([s.id])); setBulk({ type: 'fill', pct: 10, src: null, mode: 'ratio', scn: '', scope: 'all' }); }} className="px-2 py-0.5 rounded border border-gray-300 bg-white text-gray-700">대응SKU 기준 채우기</button>}
                      </div>
                    ) : off ? (
                      <div className="px-3 py-2 text-[11px] text-gray-400">{channel} 비운영 · 목표량 0 고정</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs min-w-[760px]">
                          <thead><MonthHead months={months} ry={releaseYearOf(s)} /></thead>
                          <tbody>{channelRows(s, channel)}</tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-[11px] text-gray-500">카드의 "월 계획" 표를 SKU마다 쌓은 화면 · 비중 입력은 월 계획 권한 · 입력 시 그 달 채널 구성비 유지 · 확정 채널 · 마케팅 고정</p>
        {pickedSkus.length > 0 && bulkBar()}
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
                  <div className="px-3 py-2 text-[11px] text-gray-500">STEP 1 미입력 · 채널별 보기 또는 작업대에서 [대응SKU 기준 채우기]</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[760px]">
                      <thead><MonthHead months={getSkuMonths(s.releaseDate)} ry={releaseYearOf(s)} /></thead>
                      <tbody>{planRows(s)}</tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 bg-white rounded-xl border border-gray-200 min-h-full">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-xs">
          {([['ws', 'SKU 작업대'], ['ch', '채널별'], ['plan', '월 계획별']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} className={`px-3 py-1.5 ${view === k ? 'bg-gray-800 text-white font-semibold' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{l}</button>
          ))}
        </div>
        <span className="flex-1" />
        <span className="text-[11px] text-gray-500">묶기</span>
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-[11px]">
          {([['open', '오픈일'], ['cat', '카테고리'], ['brand', '브랜드']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setGroupBy(k)} className={`px-2.5 py-1 ${groupBy === k ? 'bg-gray-800 text-white' : 'bg-white text-gray-600'}`}>{l}</button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-[11px] text-gray-500"><input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} />미입력만</label>
        {myGroups.length > 0 && <label className="flex items-center gap-1 text-[11px] text-gray-500"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />내 그룹 미확정만</label>}
      </div>
      {base.error && <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">태블로 대응SKU 실적을 불러오지 못했어요. 대응SKU 행은 비어 보이고, 대응SKU 기준 일괄 작업은 제외돼요.</div>}
      {toast && (
        <div className="flex flex-wrap items-center gap-2 text-xs rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 px-3 py-1.5">
          <span>{toast.text}</span>
          {toast.undo && <button disabled={busy} onClick={undoBulk} className="px-2 py-0.5 rounded border border-emerald-400 bg-white">되돌리기</button>}
          <span className="flex-1" />
          <button onClick={() => setToast(null)} className="text-emerald-700/70">닫기</button>
        </div>
      )}
      {body}
    </div>
  );
}
