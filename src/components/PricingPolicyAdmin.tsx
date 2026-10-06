import { useState, type KeyboardEvent } from 'react';
import { BRANDS, CATEGORIES, type Brand, type Category } from '../types';
import { useStore } from '../store';
import { usePricingPolicy, savePricingPolicy } from '../hooks/usePricingPolicy';
import { useExchangeRates } from '../utils/useExchangeRates';
import { calcPricesV2, discountPct, discountStart, ROUND_LABEL, type RoundMode } from '../utils/pricingV2';

type Sub = 'policy' | 'timing' | 'core';

/** Enter · 바깥 클릭 저장, 한글 조합 중 Enter 무시 */
function NumField({ value, onSave, width = 64, allowEmpty = false, placeholder }: {
  value: number | null | undefined; onSave: (v: number | null) => void; width?: number; allowEmpty?: boolean; placeholder?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value == null ? '' : String(value));
  const commit = () => {
    if (draft === null) return;
    const t = draft.trim();
    setDraft(null);
    if (t === '') { if (allowEmpty && value != null) onSave(null); return; }
    const n = Number(t.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(n) && n !== value) onSave(n);
  };
  return (
    <input value={shown} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.nativeEvent.isComposing || e.keyCode === 229) return; if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setDraft(null); }}
      style={{ width }} className="text-right tabular-nums text-xs px-1.5 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400" />
  );
}

export function PricingPolicyAdmin() {
  const [sub, setSub] = useState<Sub>('policy');
  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs">
        {([['policy', '할인 정책'], ['timing', '할인가능시점'], ['core', '주력 SKU 지정']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setSub(k)} className={`px-3 py-1.5 ${sub === k ? 'bg-gray-800 text-white font-semibold' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{l}</button>
        ))}
      </div>
      {sub === 'policy' ? <PolicyTab /> : sub === 'timing' ? <TimingTab /> : <CoreTab />}
    </div>
  );
}

function PolicyTab() {
  const { policy } = usePricingPolicy();
  const { usdKrw, jpyKrw } = useExchangeRates();
  const [brand, setBrand] = useState<Brand>('바잇미');
  const [sample, setSample] = useState(15900);
  const [msg, setMsg] = useState('');
  const p = policy.brands[brand];
  const c = policy.common;
  const save = (patch: Parameters<typeof savePricingPolicy>[0]) =>
    savePricingPolicy(patch).then(() => setMsg('저장됨 · 미확정 SKU에 바로 반영')).catch(() => setMsg('저장에 실패했어요. 새로고침 후 다시 시도해 주세요.'));
  const fx = { usd: usdKrw, jpy: jpyKrw };
  const core = calcPricesV2({ price: sample, brand, core: true, live: true }, policy, fx);
  const normal = calcPricesV2({ price: sample, brand, core: false, live: true }, policy, fx);
  const row = 'flex items-center gap-2 text-xs text-gray-600 flex-wrap';
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          {BRANDS.map((b) => (
            <button key={b} onClick={() => setBrand(b)} className={`px-3 py-1 ${brand === b ? 'bg-indigo-600 text-white font-semibold' : 'bg-white text-gray-600'}`}>{b}</button>
          ))}
        </div>
        {msg && <span className="text-xs text-indigo-600">{msg}</span>}
      </div>
      <div className="border border-gray-200 rounded-xl p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-700">{brand} 정책</p>
        <div className={row}>
          <span className="w-24 text-gray-500">오픈특가</span>판매가
          <NumField value={p.openRate} onSave={(v) => v != null && save({ brands: { [brand]: { openRate: v } } })} />% 할인 →
          <select value={p.round} onChange={(e) => save({ brands: { [brand]: { round: e.target.value as RoundMode } } })} className="text-xs border border-gray-200 rounded px-1 py-1">
            {Object.entries(ROUND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className={row}><span className="w-24 text-gray-500">상시 최대</span>판매가 <NumField value={p.reg} onSave={(v) => v != null && save({ brands: { [brand]: { reg: v } } })} />% 할인</div>
        <div className={row}><span className="w-24 text-gray-500">특가 최대</span>판매가 <NumField value={p.spec} onSave={(v) => v != null && save({ brands: { [brand]: { spec: v } } })} />% 할인</div>
        <p className="text-xs font-semibold text-gray-700 pt-2">공통 규칙 · 전 브랜드</p>
        <div className={row}>
          <span className="w-24 text-violet-600">선오픈 최저가</span>주력 SKU만 · 오픈특가
          <NumField value={c.preThr} width={72} onSave={(v) => v != null && save({ common: { preThr: v } })} />원 이하
          <NumField value={c.prePct} onSave={(v) => v != null && save({ common: { prePct: v } })} />% · 초과 −
          <NumField value={c.preMinus} width={64} onSave={(v) => v != null && save({ common: { preMinus: v } })} />원
        </div>
        <div className={row}>
          <span className="w-24 text-orange-600">라이브</span>선오픈 최저가(없으면 오픈특가)
          <NumField value={c.livePct} onSave={(v) => v != null && save({ common: { livePct: v } })} />% · 최대 −
          <NumField value={c.liveMax} width={64} onSave={(v) => v != null && save({ common: { liveMax: v } })} />원
        </div>
        <div className={row}><span className="w-24 text-gray-500">팝업/페어</span>상시 판매가 <NumField value={c.popupRate} onSave={(v) => v != null && save({ common: { popupRate: v } })} />% 할인 → 10원 단위 버림</div>
        <p className="text-[11px] text-gray-400 pt-1">가격 확정된 SKU는 확정 시점 가격 유지 · 정책을 바꾸면 미확정 SKU만 바뀜</p>
      </div>
      <div className="border border-gray-200 rounded-xl p-3 space-y-1.5 bg-gray-50">
        <div className="flex items-center gap-2 text-xs text-gray-600">미리보기 · 판매가 <NumField value={sample} width={80} onSave={(v) => v && setSample(v)} />원</div>
        {([
          ['선오픈 최저가 (주력)', core.pre], ['라이브 · 주력', core.live], ['라이브 · 일반', normal.live], ['오픈특가', core.open],
          ['상시 최대', core.reg], ['특가 최대', core.spec], ['팝업/페어 (B2B)', core.popup],
        ] as [string, number | null][]).map(([l, v]) => (
          <div key={l} className="flex justify-between text-xs"><span className="text-gray-500">{l}</span><span className="tabular-nums font-semibold">{v == null ? '–' : `${v.toLocaleString()} (${discountPct(v, sample)}%)`}</span></div>
        ))}
      </div>
    </div>
  );
}

function TimingTab() {
  const { policy } = usePricingPolicy();
  const skus = useStore((s) => s.skus);
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);
  const [q, setQ] = useState('');
  const rows = q.trim() ? skus.filter((s) => s.skuName.includes(q.trim())) : skus.filter((s) => s.discountWeeksOverride != null);
  const setOv = (id: string, v: number | null) => { updateSku(id, { discountWeeksOverride: v }); persistSku(id).catch(console.error); };
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-400">할인가능시점 = SKU 오픈일 + 주 수 · 최소 기능 (추후 디벨롭)</p>
      <div className="border border-gray-200 rounded-xl p-3">
        <p className="text-xs font-semibold text-gray-700 mb-2">카테고리별 기본값</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {CATEGORIES.map((cat: Category) => (
            <label key={cat} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="w-10">{cat}</span>
              <NumField value={policy.weeks[cat] ?? null} allowEmpty placeholder="미정" width={52} onSave={(v) => savePricingPolicy({ weeks: { [cat]: v } }).catch(console.error)} />주
            </label>
          ))}
        </div>
      </div>
      <div className="border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-gray-700">SKU별 예외</p>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SKU명 검색" className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded" />
        </div>
        <p className="text-[11px] text-gray-400">검색어가 없으면 예외가 있는 SKU만 표시 · 빈칸 = 카테고리 기본값</p>
        <div className="divide-y divide-gray-100">
          {rows.slice(0, 50).map((s) => {
            const w = s.discountWeeksOverride ?? policy.weeks[s.category] ?? null;
            const d = discountStart(s.releaseDate, w);
            return (
              <div key={s.id} className="flex items-center gap-2 py-1.5 text-xs">
                <span className="flex-1 truncate">{s.skuName} <span className="text-gray-400">{s.category} · {s.releaseDate || '오픈일 미정'}</span></span>
                <NumField value={s.discountWeeksOverride ?? null} allowEmpty placeholder={String(policy.weeks[s.category] ?? '미정')} width={52} onSave={(v) => setOv(s.id, v)} />주
                <span className="w-16 text-right text-gray-500 tabular-nums">{d ? `${d.getMonth() + 1}/${d.getDate()}~` : '미정'}</span>
              </div>
            );
          })}
          {rows.length === 0 && <p className="text-xs text-gray-400 py-2">{q ? '검색 결과 없음' : '예외 없음'}</p>}
        </div>
      </div>
    </div>
  );
}

type MainCh = '자사몰' | '스스' | '기타';

function CoreTab() {
  const skus = useStore((s) => s.skus);
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);
  const applySkuBatch = useStore((s) => s.applySkuBatch);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkCh, setBulkCh] = useState<MainCh>('자사몰');
  const [bulkEtc, setBulkEtc] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // 검색 결과 또는 (검색어 없으면) 지금 주력 SKU 목록 — 전체 선택 · 일괄 작업 대상
  const rows = q.trim() ? skus.filter((s) => s.skuName.includes(q.trim())) : skus.filter((s) => s.coreSku);
  const rowIds = rows.map((s) => s.id);
  const pickedRows = rows.filter((s) => picked.has(s.id));
  const allPicked = rows.length > 0 && rowIds.every((id) => picked.has(id));
  const save = (id: string, patch: Parameters<typeof updateSku>[1]) => { updateSku(id, patch); persistSku(id).catch(console.error); };
  const togglePick = (id: string, on: boolean) => setPicked((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });
  const run = async (label: string, updates: { id: string; patch: Parameters<typeof updateSku>[1] }[], skipped = 0) => {
    if (updates.length === 0) { setMsg(skipped ? `바꿀 SKU 없음 · ${skipped}개 건너뜀` : '바꿀 SKU 없음'); return; }
    setBusy(true);
    try {
      await applySkuBatch(updates, label);
      setMsg(`${updates.length}개 SKU ${label}${skipped ? ` · ${skipped}개 건너뜀` : ''}`);
    } catch (err) {
      console.error(err);
      setMsg('저장에 실패했어요. 새로고침 후 다시 시도해 주세요.');
    } finally { setBusy(false); }
  };
  const bulkCore = (on: boolean) => {
    const targets = pickedRows.filter((s) => !!s.coreSku !== on);
    run(on ? '주력 SKU 지정' : '주력 SKU 해제',
      targets.map((s) => ({ id: s.id, patch: on ? { coreSku: true, coreMainChannel: s.coreMainChannel ?? '자사몰' } : { coreSku: false } })),
      pickedRows.length - targets.length);
  };
  const bulkChannel = () => {
    if (bulkCh === '기타' && !bulkEtc.trim()) { setMsg('기타 채널명을 입력해 주세요'); return; }
    const targets = pickedRows.filter((s) => s.coreSku); // 메인 채널은 주력 SKU에만 의미가 있음
    run(`메인 채널 ${bulkCh === '기타' ? bulkEtc.trim() : bulkCh}로 일괄 설정`,
      targets.map((s) => ({ id: s.id, patch: { coreMainChannel: bulkCh, ...(bulkCh === '기타' ? { coreMainChannelEtc: bulkEtc.trim() } : {}) } })),
      pickedRows.length - targets.length);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input value={q} onChange={(e) => { setQ(e.target.value); setMsg(''); }} placeholder="SKU명 검색" className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        <span className="text-xs text-gray-500 whitespace-nowrap">주력 SKU {skus.filter((s) => s.coreSku).length}개</span>
      </div>
      <p className="text-[11px] text-gray-400">검색 → 주력 ON → 메인 채널 선택 · 주력 SKU는 선오픈 최저가가 생기고, 프라이싱 탭에 메인 채널 · 상세 프로모션 버튼 표시 · 검색어가 없으면 주력 SKU만 표시</p>
      {rows.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-indigo-50 rounded-lg px-3 py-2 text-xs">
          <label className="flex items-center gap-1.5 text-gray-600">
            <input type="checkbox" className="accent-indigo-500" checked={allPicked}
              onChange={(e) => setPicked((p) => { const n = new Set(p); rowIds.forEach((id) => (e.target.checked ? n.add(id) : n.delete(id))); return n; })} />
            {pickedRows.length > 0 ? `${pickedRows.length}개 선택` : `${q.trim() ? '검색 결과' : '목록'} ${rows.length}개 전체 선택`}
          </label>
          <span className="flex-1" />
          <button disabled={busy || pickedRows.length === 0} onClick={() => bulkCore(true)} className="px-2.5 py-1 rounded-md bg-indigo-600 text-white font-semibold disabled:opacity-40">주력 지정</button>
          <button disabled={busy || pickedRows.length === 0} onClick={() => bulkCore(false)} className="px-2.5 py-1 rounded-md border border-gray-300 bg-white text-gray-600 disabled:opacity-40">주력 해제</button>
          <span className="w-px h-4 bg-gray-300" />
          <select value={bulkCh} onChange={(e) => setBulkCh(e.target.value as MainCh)} className="border border-gray-200 rounded px-1.5 py-1 bg-white" aria-label="일괄 메인 채널">
            <option>자사몰</option><option>스스</option><option>기타</option>
          </select>
          {bulkCh === '기타' && <input value={bulkEtc} onChange={(e) => setBulkEtc(e.target.value)} placeholder="채널명" className="w-24 px-2 py-1 border border-gray-200 rounded bg-white" />}
          <button disabled={busy || pickedRows.length === 0} onClick={bulkChannel} className="px-2.5 py-1 rounded-md border border-indigo-400 bg-white text-indigo-700 font-semibold disabled:opacity-40">메인 채널 일괄 설정</button>
        </div>
      )}
      {msg && <p className="text-xs text-indigo-600">{msg}</p>}
      <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl max-h-[60vh] overflow-auto">
        {rows.map((s) => (
          <div key={s.id} className={`flex items-center gap-2 px-3 py-2 text-xs flex-wrap ${picked.has(s.id) ? 'bg-indigo-50/50' : ''}`}>
            <input type="checkbox" checked={picked.has(s.id)} onChange={(e) => togglePick(s.id, e.target.checked)} className="accent-gray-500" aria-label={`${s.skuName} 선택`} />
            <label className="flex items-center gap-2 flex-1 min-w-[180px]">
              <input type="checkbox" checked={!!s.coreSku} className="accent-indigo-500" aria-label={`${s.skuName} 주력 지정`}
                onChange={(e) => save(s.id, e.target.checked ? { coreSku: true, coreMainChannel: s.coreMainChannel ?? '자사몰' } : { coreSku: false })} />
              <span className="truncate">{s.skuName}</span>
              <span className="text-gray-400">{s.brand} · {s.category}</span>
              {s.coreSku && <span className="text-[10px] px-1.5 rounded-full bg-indigo-100 text-indigo-700">주력</span>}
            </label>
            <select disabled={!s.coreSku} value={s.coreMainChannel ?? '자사몰'} onChange={(e) => save(s.id, { coreMainChannel: e.target.value as MainCh })}
              className="text-xs border border-gray-200 rounded px-1.5 py-1 disabled:opacity-40" aria-label="메인 채널">
              <option>자사몰</option><option>스스</option><option>기타</option>
            </select>
            {s.coreSku && s.coreMainChannel === '기타' && (
              <input key={`${s.id}-${s.coreMainChannelEtc ?? ''}`} defaultValue={s.coreMainChannelEtc ?? ''} placeholder="채널명 직접 입력" onBlur={(e) => e.target.value !== (s.coreMainChannelEtc ?? '') && save(s.id, { coreMainChannelEtc: e.target.value })}
                className="text-xs px-2 py-1 border border-gray-200 rounded w-32" />
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="text-xs text-gray-400 px-3 py-3">{q ? '검색 결과 없음' : '주력 SKU 없음 · 위에서 검색해 지정'}</p>}
      </div>
      <p className="text-[11px] text-gray-400">왼쪽 회색 체크 = 일괄 작업 선택 · 파란 체크 = 주력 ON/OFF · 메인 채널 일괄 설정은 주력 SKU에만 적용</p>
    </div>
  );
}
