import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { SkuData } from '../types';
import { useStore } from '../store';
import { useAuth } from '../store/auth';
import { canEditPricing } from '../utils/pin';
import { useExchangeRates } from '../utils/useExchangeRates';
import { usePricingPolicy, CORE_PROMO_URL } from '../hooks/usePricingPolicy';
import { PRICING_SCENARIOS } from '../utils/pricingScenarios';
import {
  AUTO_LOCKED_KEYS, B2B_KEYS, B2C_KEYS, calcPricesV2, discountPct, discountStart, legacyPricesV2, pctPrice,
  type PriceKey, type PriceOverride, type PriceSet,
} from '../utils/pricingV2';

/**
 * 프로젝션 › 프라이싱 (신규) — 개편안 A안 비교 그리드.
 * 기존 LIST VIEW 프라이싱 창 · 가격확정 열은 테스트가 끝날 때까지 그대로 둔다(같은 isPriceConfirmed 사용).
 */
type GroupBy = 'date' | 'brand' | 'both';
type Metric = 'fx' | 'sale' | 'reg' | 'cost';
const METRICS: { k: Metric; l: string; b2bOnly?: boolean }[] = [
  { k: 'fx', l: '외화', b2bOnly: true }, { k: 'sale', l: '판매가 대비' }, { k: 'reg', l: '정가 대비' }, { k: 'cost', l: '원가율' },
];
const fmt = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '–' : Math.round(n).toLocaleString());
const r1 = (x: number) => Math.round(x * 10) / 10;
const costColor = (r: number) => (r > 40 ? 'text-red-600' : r > 30 ? 'text-amber-600' : 'text-emerald-600');
const DOW = '일월화수목금토';
const mdStr = (d: string) => { if (!d) return '오픈일 미정'; const x = new Date(`${d}T00:00:00`); return `${x.getMonth() + 1}/${x.getDate()}(${DOW[x.getDay()]})`; };
const MAIN_CH_CLS: Record<string, string> = { '스스': 'bg-emerald-600', '자사몰': 'bg-orange-500', '기타': 'bg-blue-600' };

function readSession<T>(key: string, fallback: T): T {
  try { const v = sessionStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function writeSession(key: string, v: unknown) { try { sessionStorage.setItem(key, JSON.stringify(v)); } catch { /* 무시 */ } }

export function PricingV2Section({ skus }: { skus: SkuData[] }) {
  const { role } = useAuth();
  const canEdit = canEditPricing(role);
  const { policy, loaded } = usePricingPolicy();
  const { usdKrw, jpyKrw } = useExchangeRates();
  const fx = useMemo(() => ({ usd: usdKrw, jpy: jpyKrw }), [usdKrw, jpyKrw]);
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);
  const applySkuBatch = useStore((s) => s.applySkuBatch);
  const setPriceConfirmedV2 = useStore((s) => s.setPriceConfirmedV2);
  const setPricingPromo = useStore((s) => s.setPricingPromo);

  const [groupBy, setGroupByRaw] = useState<GroupBy>(() => readSession('pv2:groupBy', 'date'));
  const setGroupBy = (g: GroupBy) => { setGroupByRaw(g); writeSession('pv2:groupBy', g); };
  const [cols, setCols] = useState<'b2c' | 'b2b'>('b2c');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [show, setShow] = useState<Record<Metric, boolean>>({ fx: true, sale: true, reg: true, cost: true });
  const [editing, setEditing] = useState<{ id: string; k: PriceKey } | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // ── 가격 ──
  const auto = (s: SkuData, useOv = true): PriceSet =>
    calcPricesV2({ price: s.price, brand: s.brand, core: !!s.coreSku, live: !!s.pricingPromoLive, overrides: s.pricingOverrides }, policy, fx, useOv);
  const isLegacy = (s: SkuData) => !!s.isPriceConfirmed && !s.pricingSnapshot;
  const shown = (s: SkuData): PriceSet => {
    if (!s.isPriceConfirmed) return auto(s);
    if (s.pricingSnapshot) return { ...auto(s), ...s.pricingSnapshot } as PriceSet;
    return legacyPricesV2(s, !!s.coreSku, policy, fx); // 개편 전에 확정된 SKU — 기존 계산값 그대로
  };

  const list = useMemo(() => skus
    .filter((s) => !onlyOpen || !s.isPriceConfirmed || !!s.coreSku)
    .slice().sort((a, b) => (a.releaseDate || '9999').localeCompare(b.releaseDate || '9999')),
  [skus, onlyOpen]);
  const groups = useMemo(() => {
    const key = (s: SkuData) => (groupBy === 'date' ? s.releaseDate || '' : groupBy === 'brand' ? s.brand : `${s.releaseDate || ''}|${s.brand}`);
    const m = new Map<string, SkuData[]>();
    list.forEach((s) => { const k = key(s); if (!m.has(k)) m.set(k, []); m.get(k)!.push(s); });
    return [...m.entries()].map(([k, arr]) => ({
      k, arr,
      label: groupBy === 'date' ? `${mdStr(k)} 오픈` : groupBy === 'brand' ? k : `${mdStr(k.split('|')[0])} · ${k.split('|')[1]}`,
    }));
  }, [list, groupBy]);

  // ── 저장 ──
  const startEdit = (s: SkuData, k: PriceKey) => {
    if (!canEdit || s.isPriceConfirmed || AUTO_LOCKED_KEYS.has(k)) return;
    const o = s.pricingOverrides?.[k];
    setDraft(o && typeof o === 'object' ? `${o.pct}%` : String(shown(s)[k] ?? ''));
    setEditing({ id: s.id, k });
  };
  const parse = (s: SkuData, raw: string): { empty?: true; err?: string; val?: PriceOverride; label?: string } => {
    const t = raw.replace(/[,\s원]/g, '');
    if (t === '') return { empty: true };
    if (t.endsWith('%')) {
      const pc = Number(t.slice(0, -1));
      if (!(pc > 0 && pc < 100)) return { err: '0~100% 사이' };
      return { val: { pct: pc }, label: `판매가 × ${r1(100 - pc)}% → ${fmt(pctPrice(s.price, pc))}원` };
    }
    const n = Number(t);
    if (!(n > 0)) return { err: '숫자 또는 10% 형식' };
    if (n > s.price) return { err: '판매가보다 큼' };
    return { val: n, label: `${fmt(n)}원 (${discountPct(n, s.price)}%)` };
  };
  const commit = (save: boolean) => {
    if (!editing) return;
    const s = useStore.getState().skus.find((x) => x.id === editing.id);
    if (save && s) {
      const r = parse(s, draft);
      if (r.err) return;
      const next = { ...(s.pricingOverrides ?? {}) };
      delete next[editing.k];
      const autoV = calcPricesV2({ price: s.price, brand: s.brand, core: !!s.coreSku, live: !!s.pricingPromoLive, overrides: next }, policy, fx)[editing.k];
      if (!r.empty && !(typeof r.val === 'number' && r.val === autoV)) next[editing.k] = r.val!;
      updateSku(s.id, { pricingOverrides: next });
      persistSku(s.id).catch(() => setMsg('저장에 실패했어요. 새로고침 후 다시 시도해 주세요.'));
    }
    setEditing(null);
  };
  const clearOverrides = (s: SkuData) => { updateSku(s.id, { pricingOverrides: {} }); persistSku(s.id).catch(console.error); };
  const toggleLive = (s: SkuData) => setPricingPromo(s.id, { pricingPromoLive: !s.pricingPromoLive }).catch(console.error);

  const confirm = async (targets: SkuData[], confirmed: boolean) => {
    if (!canEdit || targets.length === 0) return;
    setBusy(true);
    try {
      // 개편 전 확정 SKU를 해제하면 기존 값을 수동값으로 남김 (해제해도 가격이 안 바뀌게)
      const legacyKeep = confirmed ? [] : targets.filter(isLegacy).map((s) => {
        const old = legacyPricesV2(s, !!s.coreSku, policy, fx);
        const now = auto(s, false);
        const ov: Record<string, PriceOverride> = { ...(s.pricingOverrides ?? {}) };
        (Object.keys(old) as PriceKey[]).forEach((k) => { if (old[k] != null && old[k] !== now[k] && !AUTO_LOCKED_KEYS.has(k)) ov[k] = old[k]!; });
        return { id: s.id, patch: { pricingOverrides: ov } };
      });
      await setPriceConfirmedV2(targets.map((s) => ({ id: s.id, confirmed, snapshot: confirmed ? auto(s) : null })));
      if (legacyKeep.length) await applySkuBatch(legacyKeep, '개편 전 확정가를 수동값으로 유지');
      setMsg(`${targets.length}개 SKU ${confirmed ? '가격 확정' : '확정 해제'}`);
    } catch (err) {
      console.error(err);
      setMsg('저장에 실패했어요. 새로고침 후 다시 시도해 주세요.');
    } finally { setBusy(false); }
  };

  // ── 표 ──
  const keys: { k: PriceKey; label: string; sub?: string }[] = cols === 'b2c' ? B2C_KEYS : B2B_KEYS;
  const priceKeys: (PriceKey | 'regular' | 'base')[] = ['regular', 'base', ...keys.map((x) => x.k)];
  const metrics = METRICS.filter((m) => (m.b2bOnly ? cols === 'b2b' : show[m.k]));
  const nRows = 1 + metrics.length;
  const span = 5 + keys.length + (cols === 'b2c' ? 1 : 0) + 3;
  const confirmedN = skus.filter((s) => s.isPriceConfirmed && !s.coreSku).length;
  const targetN = skus.filter((s) => !s.coreSku).length;

  const cell = (s: SkuData, k: PriceKey): ReactNode => {
    const cur = shown(s)[k];
    if (cur == null) return <span className="text-gray-300">–</span>;
    if (editing && editing.id === s.id && editing.k === k) {
      const r = parse(s, draft);
      return (
        <div className="flex flex-col items-end gap-0.5">
          <input autoFocus value={draft} size={1} onChange={(e) => setDraft(e.target.value)} onBlur={() => commit(true)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.nativeEvent.isComposing || e.keyCode === 229) return; if (e.key === 'Enter') commit(true); if (e.key === 'Escape') commit(false); }}
            placeholder="금액 · 10%" className="w-full min-w-0 text-right tabular-nums text-xs px-1 py-0.5 border border-indigo-400 bg-indigo-50 rounded outline-none" />
          <span className={`text-[10px] ${r.err ? 'text-red-500' : 'text-gray-400'}`}>{r.empty ? '비우면 자동값' : r.err ?? r.label}</span>
        </div>
      );
    }
    const manual = !s.isPriceConfirmed && s.pricingOverrides?.[k] != null;
    let extra: ReactNode = null;
    if (s.isPriceConfirmed) {
      const now = auto(s)[k];
      if (s.pricingSnapshot && now != null && now !== cur) extra = <span className="block text-[10px] text-amber-600 whitespace-nowrap">정책 변경 · 현재 {fmt(now)}</span>;
      else if (!s.pricingSnapshot) { const a = auto(s, false)[k]; if (a != null && a !== cur) extra = <span className="block text-[10px] text-gray-400 whitespace-nowrap">새 정책 {fmt(a)}</span>; }
    }
    const editable = canEdit && !s.isPriceConfirmed && !AUTO_LOCKED_KEYS.has(k);
    return (
      <button type="button" disabled={!editable} onClick={() => startEdit(s, k)}
        className={`relative w-full text-right tabular-nums rounded px-1 ${editable ? 'hover:bg-gray-100 cursor-pointer' : 'cursor-default'} ${manual ? 'text-blue-600 font-semibold' : ''}`}>
        {manual && <span className="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full bg-blue-600" />}
        {fmt(cur)}{extra}
      </button>
    );
  };
  const priceOf = (s: SkuData, k: PriceKey | 'regular' | 'base') => (k === 'regular' ? s.regularPrice : k === 'base' ? s.price : shown(s)[k]);
  const metricCell = (s: SkuData, k: PriceKey | 'regular' | 'base', m: Metric): ReactNode => {
    const v = priceOf(s, k);
    if (v == null || v === 0) return '';
    if (m === 'fx') {
      if (k === 'glob') { const f = PRICING_SCENARIOS.find((x) => x.id === '글로벌 공급가')!.foreignAmt!(s.price, usdKrw, jpyKrw)!; return `$${f.amount.toFixed(2)}`; }
      if (k === 'jp') return `¥${Math.round(v / jpyKrw).toLocaleString()}`;
      return '';
    }
    if (m === 'sale') {
      if (k === 'regular' || k === 'base') return '';
      const o = !s.isPriceConfirmed ? s.pricingOverrides?.[k] : undefined;
      const t = `${discountPct(v, s.price)}%`;
      return o && typeof o === 'object' ? <span className="text-blue-600 font-semibold">{t} 입력</span> : t;
    }
    if (m === 'reg') return k === 'regular' || !s.regularPrice ? '' : `${discountPct(v, s.regularPrice)}%`;
    if (k === 'regular' || !s.cost) return '';
    const r = r1((s.cost / v) * 100);
    return cols === 'b2c' ? <span className={costColor(r)}>{r}%</span> : `${r}%`;
  };
  const weeksOf = (s: SkuData) => s.discountWeeksOverride ?? policy.weeks[s.category] ?? null;
  const whenCell = (s: SkuData) => {
    const w = weeksOf(s);
    const d = discountStart(s.releaseDate, w);
    if (!d) return <span className="text-gray-400 text-[11px]">미정</span>;
    const ov = s.discountWeeksOverride != null;
    return (
      <span className="whitespace-nowrap text-[11px] tabular-nums">{d.getMonth() + 1}/{d.getDate()}~
        <span className={`ml-1 px-1 border rounded-sm text-[10px] ${ov ? 'border-blue-500 text-blue-600' : 'border-gray-300 text-gray-500'}`} title={ov ? '상품별 예외' : '카테고리 기본값'}>{w}주</span>
      </span>
    );
  };
  const mainCh = (s: SkuData) => {
    if (!s.coreSku) return <span className="text-gray-300">—</span>;
    const ch = s.coreMainChannel ?? '자사몰';
    return <span className={`inline-block text-[11px] font-semibold text-white px-2 py-0.5 rounded ${MAIN_CH_CLS[ch]}`}>{ch === '기타' ? (s.coreMainChannelEtc || '기타') : ch}</span>;
  };

  return (
    <div className="flex flex-col gap-2 p-3 bg-white rounded-xl border border-gray-200 h-full min-h-0">
      <div className="shrink-0 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-gray-500">필터</span>
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
            {([['date', '오픈일'], ['brand', '브랜드'], ['both', '오픈일 × 브랜드']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setGroupBy(k)} className={`px-2.5 py-1 ${groupBy === k ? 'bg-gray-800 text-white' : 'bg-white text-gray-600'}`}>{l}</button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
            {([['b2c', 'B2C'], ['b2b', 'B2B']] as const).map(([k, l]) => (
              <button key={k} onClick={() => { setCols(k); setEditing(null); }} className={`px-3 py-1 ${cols === k ? 'bg-gray-800 text-white font-semibold' : 'bg-white text-gray-600'}`}>{l}</button>
            ))}
          </div>
          <label className="flex items-center gap-1 text-gray-500"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />미확정만</label>
          <span className="text-gray-400">표시</span>
          {METRICS.filter((m) => !m.b2bOnly).map((m) => (
            <label key={m.k} className="flex items-center gap-1 text-gray-500"><input type="checkbox" checked={show[m.k]} onChange={(e) => setShow({ ...show, [m.k]: e.target.checked })} />{m.l}</label>
          ))}
          <span className="flex-1" />
          {msg && <span className="text-indigo-600">{msg}</span>}
          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold">확정 {confirmedN}/{targetN}</span>
          {!loaded && <span className="text-gray-400">정책 불러오는 중</span>}
        </div>
        <p className="text-[10px] text-gray-400">
          테스트용 신규 탭 · 가격 칸 클릭 → 금액 또는 10% 입력 (Enter 저장 · Esc 취소 · 비우면 자동값) · 파란 숫자 = 수동 · 주력 SKU만 선오픈 최저가 · 라이브는 선오픈 최저가(없으면 오픈특가) 기준
          {!canEdit && ' · 보기 전용 (수정 · 확정은 MASTER · PM · 플랫폼MD · 브랜드MD)'}
        </p>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-xs min-w-[1100px]">
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr className="text-[11px] text-gray-500">
              <th className="px-2 py-1.5 text-left">상품</th><th className="px-2 py-1.5 text-right">원가</th><th />
              <th className="px-2 py-1.5 text-right">정가</th><th className="px-2 py-1.5 text-right">판매가</th>
              {keys.map((x) => (
                <th key={x.k} className={`px-2 py-1.5 text-right ${x.k === 'pre' ? 'bg-violet-50' : x.k === 'live' ? 'bg-orange-50' : ''}`}>
                  {x.label}{x.sub && <div className="text-[10px] font-normal text-gray-400 whitespace-nowrap">{x.sub}</div>}
                </th>
              ))}
              {cols === 'b2c' && <th className="px-2 py-1.5 text-left whitespace-nowrap">오픈라이브 여부</th>}
              <th className="px-2 py-1.5 text-left">메인 채널</th><th className="px-2 py-1.5 text-left">할인가능시점</th><th className="px-2 py-1.5 text-center">가격 확정</th>
            </tr>
          </thead>
          {groups.map((g) => {
            const tg = g.arr.filter((s) => !s.coreSku);
            const done = tg.filter((s) => s.isPriceConfirmed).length;
            const all = tg.length > 0 && done === tg.length;
            const coreN = g.arr.length - tg.length;
            return [
              <tbody key={`${g.k}-h`}>
                <tr className="bg-gray-100 border-y border-gray-300">
                  <td colSpan={span} className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <b className="text-[13px] text-gray-800">{g.label}</b>
                      <span className="text-[11px] text-gray-500">{g.arr.length}개 · 확정 {done}/{tg.length}{coreN ? ` · 주력 ${coreN}` : ''}</span>
                      <span className="flex-1" />
                      {canEdit && tg.length > 0 && (
                        <button disabled={busy} onClick={() => confirm(all ? tg : tg.filter((s) => !s.isPriceConfirmed), !all)}
                          className={`text-[11px] px-2.5 py-1 rounded-md font-semibold disabled:opacity-50 ${all ? 'border border-gray-300 bg-white text-gray-600' : 'bg-indigo-600 text-white'}`}>
                          {all ? '묶음 확정 해제' : '묶음 일괄 확정'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              </tbody>,
              ...g.arr.map((s) => {
                const core = !!s.coreSku;
                const nOv = Object.keys(s.pricingOverrides ?? {}).length;
                const lk = s.isPriceConfirmed ? 'bg-emerald-50/40' : '';
                return (
                  <tbody key={s.id} className="border-b border-gray-200">
                    <tr className={lk}>
                      <td rowSpan={nRows} className="px-2 py-1.5 align-top min-w-[150px]">
                        <div className="font-semibold text-gray-800 text-[13px]">{s.skuName}</div>
                        <div className="text-[11px] text-gray-500">{[s.brand, s.category, ...(groupBy !== 'date' ? [mdStr(s.releaseDate)] : [])].join(' · ')}</div>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {core && <span className="text-[10px] px-1.5 rounded-full border border-gray-300 text-gray-600">주력 SKU</span>}
                          {isLegacy(s) && <span className="text-[10px] px-1.5 rounded-full border border-dashed border-emerald-500 text-emerald-700" title="개편 전 확정 가격 그대로">기존 확정</span>}
                          {canEdit && !s.isPriceConfirmed && nOv > 0 && <button onClick={() => clearOverrides(s)} className="text-[10px] px-1.5 rounded-full border border-gray-300 text-gray-500 hover:text-gray-700">수동 {nOv} · 되돌리기</button>}
                        </div>
                      </td>
                      <td rowSpan={nRows} className="px-2 py-1.5 align-top text-right tabular-nums text-gray-500">{fmt(s.cost)}</td>
                      <td className="px-1 py-1 text-[10px] text-gray-400 whitespace-nowrap">가격</td>
                      <td className="px-2 py-1 text-right tabular-nums text-gray-500">{fmt(s.regularPrice)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmt(s.price)}</td>
                      {keys.map((x) => <td key={x.k} className={`px-1 py-1 ${x.k === 'pre' ? 'bg-violet-50/50' : x.k === 'live' ? 'bg-orange-50/50' : ''}`}>{cell(s, x.k)}</td>)}
                      {cols === 'b2c' && (
                        <td rowSpan={nRows} className="px-2 py-1.5 align-top">
                          <button disabled={!canEdit || !!s.isPriceConfirmed} onClick={() => toggleLive(s)}
                            aria-label={`${s.skuName} 오픈라이브 ${s.pricingPromoLive ? '끄기' : '켜기'}`}
                            className={`text-[11px] w-12 py-0.5 rounded-full border disabled:opacity-60 ${s.pricingPromoLive ? 'border-orange-500 bg-orange-500 text-white font-semibold' : 'border-gray-300 text-gray-400'}`}>{s.pricingPromoLive ? 'ON' : 'OFF'}</button>
                        </td>
                      )}
                      <td rowSpan={nRows} className="px-2 py-1.5 align-top">{mainCh(s)}</td>
                      <td rowSpan={nRows} className="px-2 py-1.5 align-top">{whenCell(s)}</td>
                      <td rowSpan={nRows} className="px-2 py-1.5 align-top text-center">
                        {core ? (
                          <a href={CORE_PROMO_URL} target="_blank" rel="noopener noreferrer"
                            className="inline-block text-[11px] px-2 py-1 rounded-md border border-blue-500 bg-blue-50 text-blue-700 whitespace-nowrap hover:bg-blue-100">상세 프로모션 보러가기 →</a>
                        ) : (
                          <button disabled={!canEdit || busy} onClick={() => confirm([s], !s.isPriceConfirmed)}
                            className={`text-[11px] px-2 py-0.5 rounded-md border disabled:opacity-50 ${s.isPriceConfirmed ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold' : 'border-gray-300 text-gray-600'}`}>
                            {s.isPriceConfirmed ? '확정됨' : '확정'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {metrics.map((m) => (
                      <tr key={m.k} className={lk}>
                        <td className="px-1 py-0.5 text-[10px] text-gray-400 whitespace-nowrap">{m.l}</td>
                        {priceKeys.map((k) => (
                          <td key={k} className={`px-2 py-0.5 text-right tabular-nums text-[11px] text-gray-500 ${k === 'pre' ? 'bg-violet-50/50' : k === 'live' ? 'bg-orange-50/50' : ''}`}>{metricCell(s, k, m.k)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                );
              }),
            ];
          })}
        </table>
        {list.length === 0 && <p className="p-6 text-center text-sm text-gray-400">조건에 맞는 SKU가 없습니다.</p>}
      </div>
    </div>
  );
}

