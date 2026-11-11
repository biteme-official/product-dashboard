import { useState } from 'react';
import type { ChannelConfirmField, SkuData } from '../types';
import { useAuth } from '../store/auth';
import { canConfirmGroup } from '../utils/channelOwnership';
import {
  REVIEW_GROUPS, REVIEW_GROUP_LABEL, addDaysLocal, buildReviewLink, createReviewRequest, dDay, groupApplies, isOverdue,
  reviewProgress, shortMD, todayLocal, type ReviewRequest,
} from '../utils/reviewRequest';

const ROLE_LABEL: Record<string, string> = { master: '마스터', pm: 'PM', platform_md: '플랫폼MD', brand_md: '브랜드MD', global: '글로벌MD', viewer: '뷰어' };
const roleLabel = (r: string | null | undefined) => (r ? ROLE_LABEL[r] ?? r : '알 수 없음');

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** 상단 툴바 · 요청 고르기 */
export function ReviewRequestSelect({ requests, value, skus, onChange }: {
  requests: ReviewRequest[];
  value: string | null;
  skus: SkuData[];
  onChange: (id: string | null) => void;
}) {
  const open = requests.filter((r) => !r.closedAt);
  const closed = requests.filter((r) => r.closedAt);
  if (requests.length === 0) return null;
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} aria-label="검토 요청 선택"
      className={`text-xs rounded-lg border px-2 py-1 max-w-[280px] ${value ? 'border-teal-500 bg-teal-50 text-teal-800 font-semibold' : 'border-gray-300 bg-white text-gray-600'}`}>
      <option value="">검토 요청 · 진행 {open.length}</option>
      {open.length > 0 && (
        <optgroup label="진행 중">
          {open.map((r) => { const p = reviewProgress(r, skus); return <option key={r.id} value={r.id}>{r.name} · {dDay(r.dueOn)} · {p.doneSkus}/{r.skuIds.length}</option>; })}
        </optgroup>
      )}
      {closed.length > 0 && (
        <optgroup label="닫힘">
          {closed.map((r) => <option key={r.id} value={r.id}>{r.name} · 닫힘 {shortMD(r.closedAt!.slice(0, 10))}</option>)}
        </optgroup>
      )}
    </select>
  );
}

/** 요청을 열었을 때 위에 붙는 배너 · 요청 정보 · 그룹별 확정 진행률 */
export function ReviewRequestBanner({ req, skus, allSkuIds, onExit, onCopied }: {
  req: ReviewRequest;
  /** 지금 화면 필터를 거친 SKU */
  skus: SkuData[];
  /** 필터 전 전체 SKU id — 숨김 · 삭제 구분용 */
  allSkuIds: Set<string>;
  onExit: () => void;
  onCopied: (ok: boolean) => void;
}) {
  const p = reviewProgress(req, skus);
  const over = isOverdue(req);
  const hidden = req.skuIds.filter((id) => !skus.some((s) => s.id === id));
  const gone = hidden.filter((id) => !allSkuIds.has(id)).length;
  return (
    <div className="rounded-lg border border-teal-300 bg-teal-50/60 px-3 py-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${req.closedAt ? 'bg-gray-200 text-gray-600' : over ? 'bg-red-100 text-red-700' : 'bg-teal-600 text-white'}`}>
          {req.closedAt ? '닫힘' : over ? `기한 지남 ${dDay(req.dueOn)}` : `검토 요청 ${dDay(req.dueOn)}`}
        </span>
        <b className="text-sm text-gray-900">{req.name}</b>
        <span className="text-[11px] text-gray-600">
          {roleLabel(req.createdBy)} 요청 · {shortMD(req.createdAt.slice(0, 10))} · 기한 {shortMD(req.dueOn)} · 대상 {req.groups.map((g) => REVIEW_GROUP_LABEL[g]).join(' · ')} · SKU {req.skuIds.length}개
        </span>
        <span className="flex-1" />
        <button onClick={async () => onCopied(await copyText(buildReviewLink(req.id)))} className="text-[11px] px-2 py-0.5 rounded border border-teal-500 bg-white text-teal-700 font-semibold">링크 복사</button>
        <button onClick={onExit} className="text-[11px] px-2 py-0.5 rounded border border-gray-300 bg-white text-gray-600">전체 SKU로 ×</button>
      </div>
      {req.memo && <p className="text-xs text-gray-700 bg-white/70 rounded px-2 py-1 whitespace-pre-wrap break-words">{req.memo}</p>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        {p.groups.map((g) => (
          <span key={g.field} className="inline-flex items-center gap-1.5">
            <b className="text-gray-700">{REVIEW_GROUP_LABEL[g.field]}</b>
            <span className="w-20 h-1.5 rounded-full bg-white border border-gray-200 overflow-hidden"><i className="block h-full bg-emerald-500" style={{ width: `${g.total ? (g.done / g.total) * 100 : 0}%` }} /></span>
            <span className="tabular-nums text-gray-600">{g.done}/{g.total}</span>
          </span>
        ))}
        <span className="inline-flex items-center gap-1"><b className="text-gray-700">완료 SKU</b><span className="tabular-nums text-gray-600">{p.doneSkus}/{p.totalSkus}</span>{p.allDone && <span className="px-1.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">전부 확정</span>}</span>
        {hidden.length > 0 && (
          <span className="text-amber-700">
            {hidden.length - gone > 0 && `필터 · 숨김으로 안 보이는 SKU ${hidden.length - gone}개`}
            {hidden.length - gone > 0 && gone > 0 && ' · '}
            {gone > 0 && `삭제된 SKU ${gone}개`}
          </span>
        )}
      </div>
    </div>
  );
}

/** 목록 행 · 대상 그룹 확정 칩 (플 · 브 · 글) */
export function GroupConfirmChips({ s, groups }: { s: SkuData; groups: ChannelConfirmField[] }) {
  return (
    <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
      {groups.map((g) => {
        const ap = groupApplies(s, g);
        const on = !!s[g];
        return (
          <span key={g} title={`${REVIEW_GROUP_LABEL[g]} ${!ap ? '운영 안 함' : on ? '확정' : '미확정'}`}
            className={`px-1 rounded text-[10px] font-bold border ${!ap ? 'border-gray-200 text-gray-300 line-through' : on ? 'border-transparent bg-emerald-100 text-emerald-700' : 'border-gray-300 text-gray-500'}`}>
            {REVIEW_GROUP_LABEL[g].slice(0, 1)}{on && ap ? '✓' : ''}
          </span>
        );
      })}
    </span>
  );
}

/** 상세 화면 · 채널 그룹 확정 버튼 (SKU 카드와 같은 조건 · 같은 색) */
const GROUP_BTN: Record<ChannelConfirmField, { on: string; off: string }> = {
  step2PlatformConfirmed: { on: 'bg-emerald-600 text-white hover:bg-emerald-700', off: 'border border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
  step2BrandConfirmed: { on: 'bg-amber-500 text-white hover:bg-amber-600', off: 'border border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100' },
  step2GlobalConfirmed: { on: 'bg-sky-600 text-white hover:bg-sky-700', off: 'border border-sky-400 bg-sky-50 text-sky-700 hover:bg-sky-100' },
};
export function GroupConfirmButtons({ s, canStep2, onToggle }: {
  s: SkuData;
  canStep2: boolean;
  onToggle: (field: ChannelConfirmField, value: boolean) => void;
}) {
  const { role } = useAuth();
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {REVIEW_GROUPS.filter((f) => f !== 'step2GlobalConfirmed' || groupApplies(s, f)).map((f) => {
        const on = !!s[f];
        const can = canStep2 && canConfirmGroup(role, f);
        return (
          <button key={f} onClick={() => onToggle(f, !on)} disabled={!can} title={can ? undefined : '담당 그룹만 확정 · 해제 가능'}
            className={`text-[11px] px-2 py-0.5 rounded font-semibold whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${on ? GROUP_BTN[f].on : GROUP_BTN[f].off}`}>
            {REVIEW_GROUP_LABEL[f]} 확정{on ? ' ✓' : ''}
          </button>
        );
      })}
    </span>
  );
}

/** 검토 요청 만들기 — 마스터 · PM */
export function ReviewRequestModal({ picked, onDone, onCancel }: {
  picked: SkuData[];
  onDone: (req: ReviewRequest, copied: boolean) => void;
  onCancel: () => void;
}) {
  const { role } = useAuth();
  const today = todayLocal();
  const [name, setName] = useState(`${shortMD(today)} 검토 요청`);
  const [dueOn, setDueOn] = useState(addDaysLocal(today, 3));
  const [memo, setMemo] = useState('');
  const [groups, setGroups] = useState<ChannelConfirmField[]>(() => REVIEW_GROUPS.filter((g) => picked.some((s) => groupApplies(s, g))));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = !!name.trim() && !!dueOn && groups.length > 0 && picked.length > 0 && !!role;

  async function save() {
    if (!valid || !role) return;
    setBusy(true);
    setError(null);
    try {
      const req = await createReviewRequest({ name: name.trim(), skuIds: picked.map((s) => s.id), groups, dueOn, memo: memo.trim(), createdBy: role });
      onDone(req, await copyText(buildReviewLink(req.id)));
    } catch (e) {
      console.error('[검토 요청] 저장 실패', e);
      setError('저장 실패 · 새로고침 후 다시 시도');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl w-[440px] max-w-full max-h-[90vh] overflow-auto p-5 space-y-3" onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }} role="dialog" aria-label="검토 요청 만들기">
        <h3 className="font-bold text-gray-900">검토 요청 만들기</h3>
        <label className="block text-xs space-y-1"><span className="font-semibold text-gray-500">요청 이름</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500" /></label>
        <div className="text-xs space-y-1"><span className="font-semibold text-gray-500">대상 그룹 · 이 그룹 확정이 검토 완료</span>
          <div className="flex flex-wrap gap-3">
            {REVIEW_GROUPS.map((g) => (
              <label key={g} className="inline-flex items-center gap-1 text-sm text-gray-700">
                <input type="checkbox" className="accent-teal-600" checked={groups.includes(g)}
                  onChange={(e) => setGroups((cur) => REVIEW_GROUPS.filter((x) => (x === g ? e.target.checked : cur.includes(x))))} />
                {REVIEW_GROUP_LABEL[g]}
              </label>
            ))}
          </div>
        </div>
        <label className="block text-xs space-y-1"><span className="font-semibold text-gray-500">기한</span>
          <input type="date" value={dueOn} min={today} onChange={(e) => setDueOn(e.target.value)} className="block text-sm border border-gray-200 rounded-lg px-3 py-1.5" /></label>
        <label className="block text-xs space-y-1"><span className="font-semibold text-gray-500">메모 · 선택</span>
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} placeholder="검토 기준 · 먼저 볼 SKU 등"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500" /></label>
        <div className="text-xs space-y-1"><span className="font-semibold text-gray-500">SKU {picked.length}개 · 고른 순서대로 01부터</span>
          <ol className="max-h-32 overflow-auto list-decimal pl-6 text-gray-700">{picked.map((s) => <li key={s.id}>{s.skuName || '(SKU명 미입력)'}</li>)}</ol>
        </div>
        <p className="text-[11px] text-gray-400">저장하면 링크 복사 · 알림 발송 없음 · 링크는 직접 공유</p>
        {error && <p className="text-[11px] text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">취소</button>
          <button onClick={save} disabled={!valid || busy} className="px-4 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium disabled:opacity-40">만들고 링크 복사</button>
        </div>
      </div>
    </div>
  );
}
