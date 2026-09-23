import { useState, useRef, useEffect } from 'react';
import { setPin, ALL_ROLES, type Role } from '../utils/pin';
import { useStore } from '../store';
import { OPTOUT_CHANNELS, CATEGORIES, BRANDS, isChannelToggleLocked, type OptOutChannel, type Category, type SkuData } from '../types';
import {
  PERM_LABELS,
  saveRolePermission,
  type RolePermission,
} from '../utils/permissions';
import { usePermission } from '../contexts/PermissionsContext';
import { TrashModal } from './TrashModal';
import { ConfirmLogModal } from './ConfirmLogModal';
import { subscribeAdminMemo, saveAdminMemo } from '../utils/adminMemo';

const ROLE_LABELS: Record<Role, string> = {
  master:      'MASTER',
  pm:          'PM',
  viewer:      'VIEWER',
  platform_md: '플랫폼MD',
  brand_md:    '브랜드MD',
  global:      '글로벌',
};

const ROLE_COLORS: Record<Role, string> = {
  master:      'text-indigo-700 bg-indigo-50',
  pm:          'text-violet-700 bg-violet-50',
  viewer:      'text-gray-600 bg-gray-100',
  platform_md: 'text-emerald-700 bg-emerald-50',
  brand_md:    'text-amber-700 bg-amber-50',
  global:      'text-sky-700 bg-sky-50',
};

function PinInput({
  onSave,
  onCancel,
}: {
  onSave: (pin: string) => void;
  onCancel: () => void;
}) {
  const [pin, setPin_] = useState('');
  const [confirm, setConfirm] = useState('');
  const [phase, setPhase] = useState<'enter' | 'confirm'>('enter');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, [phase]);

  const current = phase === 'enter' ? pin : confirm;
  const onChange = phase === 'enter' ? setPin_ : setConfirm;

  function handleComplete(v: string) {
    if (phase === 'enter') {
      setPhase('confirm');
    } else {
      if (v !== pin) {
        setError('PIN이 일치하지 않습니다.');
        setPin_(''); setConfirm(''); setPhase('enter');
      } else {
        onSave(v);
      }
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs text-gray-500">
        {phase === 'enter' ? '새 PIN 4자리 입력' : 'PIN 확인 (재입력)'}
      </p>
      <div
        className="flex gap-2 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
              current.length > i ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300'
            }`}
          />
        ))}
      </div>
      <input
        ref={inputRef}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        value={current}
        autoFocus
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 4);
          onChange(v);
          if (v.length === 4) handleComplete(v);
        }}
        className="sr-only"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        onClick={onCancel}
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        취소
      </button>
    </div>
  );
}

const PERM_KEYS = Object.keys(PERM_LABELS) as (keyof RolePermission)[];

function PermissionTable() {
  const [saving, setSaving] = useState<Role | null>(null);

  const pmPerm      = usePermission('pm');
  const viewerPerm  = usePermission('viewer');
  const platPerm    = usePermission('platform_md');
  const brandPerm   = usePermission('brand_md');
  const globalPerm  = usePermission('global');

  const permMap: Partial<Record<Role, RolePermission>> = {
    pm: pmPerm, viewer: viewerPerm, platform_md: platPerm,
    brand_md: brandPerm, global: globalPerm,
  };

  async function toggle(role: Exclude<Role, 'master'>, key: keyof RolePermission) {
    const current = permMap[role]!;
    const updated = { ...current, [key]: !current[key] };
    setSaving(role);
    await saveRolePermission(role, updated);
    setSaving(null);
  }

  const editableRoles = ALL_ROLES.filter((r): r is Exclude<Role, 'master'> => r !== 'master');

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="bg-gray-50">
            <th className="px-2 py-2 text-left font-semibold text-gray-500 border border-gray-200 whitespace-nowrap">권한</th>
            {PERM_KEYS.map((k) => (
              <th key={k} className="px-2 py-2 text-center font-semibold text-gray-500 border border-gray-200 whitespace-nowrap">
                {PERM_LABELS[k]}
              </th>
            ))}
          </tr>
          {/* master — locked */}
          <tr className="bg-indigo-50/60">
            <td className="px-2 py-2 border border-gray-200">
              <span className="font-bold text-indigo-700">MASTER</span>
            </td>
            {PERM_KEYS.map((k) => (
              <td key={k} className="px-2 py-2 text-center border border-gray-200">
                <span className="text-indigo-400 text-xs">✓</span>
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {editableRoles.map((role) => {
            const perm = permMap[role]!;
            const isSaving = saving === role;
            return (
              <tr key={role} className="even:bg-gray-50/40 hover:bg-gray-50">
                <td className="px-2 py-2 border border-gray-200 whitespace-nowrap">
                  <span className={`font-semibold px-1.5 py-0.5 rounded-full ${ROLE_COLORS[role]}`}>
                    {ROLE_LABELS[role]}
                  </span>
                  {isSaving && <span className="ml-1 text-[9px] text-gray-400">저장중…</span>}
                </td>
                {PERM_KEYS.map((k) => (
                  <td key={k} className="px-2 py-2 text-center border border-gray-200">
                    <input
                      type="checkbox"
                      checked={perm[k]}
                      onChange={() => toggle(role, k)}
                      className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer"
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DataCleanupTab() {
  const cleanupInitialSnapshots = useStore((s) => s.cleanupInitialSnapshots);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [count, setCount] = useState(0);
  const [showTrash, setShowTrash] = useState(false);
  const [showConfirmLog, setShowConfirmLog] = useState(false);

  async function handleCleanup() {
    setStatus('running');
    try {
      const n = await cleanupInitialSnapshots();
      setCount(n);
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="space-y-4">
      {showTrash && <TrashModal onClose={() => setShowTrash(false)} />}
      {showConfirmLog && <ConfirmLogModal onClose={() => setShowConfirmLog(false)} />}

      <div className="flex gap-2">
        <button
          onClick={() => setShowTrash(true)}
          className="flex-1 text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          🗑 휴지통 (최근 삭제된 SKU)
        </button>
        <button
          onClick={() => setShowConfirmLog(true)}
          className="flex-1 text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          수정 이력
        </button>
      </div>

      <p className="text-xs text-gray-500">
        이전 버전에서 Firestore에 저장된 <code className="bg-gray-100 px-1 rounded text-[11px]">_initialSnapshot</code> 필드를
        일괄 삭제합니다. 현재 버전에서는 이 필드가 저장되지 않으며, 기존 문서에 남아있는 중복 데이터를 정리합니다.
      </p>

      <div className="border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-700">_initialSnapshot 정리</p>
            <p className="text-[11px] text-gray-400 mt-0.5">기존 SKU 문서에서 불필요한 필드를 제거합니다</p>
          </div>
          <button
            onClick={handleCleanup}
            disabled={status === 'running'}
            className="text-xs px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {status === 'running' ? '정리 중…' : '정리 실행'}
          </button>
        </div>

        {status === 'done' && (
          <p className="text-xs text-green-600 font-medium">
            {count > 0 ? `완료 — ${count}개 문서에서 필드 삭제됨` : '이미 정리되어 있습니다 (0개 문서에서 발견)'}
          </p>
        )}
        {status === 'error' && (
          <p className="text-xs text-red-500 font-medium">오류가 발생했습니다. 콘솔을 확인해 주세요.</p>
        )}
      </div>
    </div>
  );
}

type ChannelTab = '쿠팡' | OptOutChannel;

const CHANNEL_TAB_STYLE: Record<ChannelTab, { dot: string; active: string }> = {
  '쿠팡':  { dot: 'bg-orange-500', active: 'border-orange-400 bg-orange-50 text-gray-800' },
  '글로벌': { dot: 'bg-sky-500',    active: 'border-sky-400 bg-sky-50 text-gray-800' },
  '일본':  { dot: 'bg-amber-500',  active: 'border-amber-400 bg-amber-50 text-gray-800' },
};

function ChannelManageTab() {
  const skus = useStore((s) => s.skus);
  const [tab, setTab] = useState<ChannelTab>('쿠팡');
  const tabs: ChannelTab[] = ['쿠팡', ...OPTOUT_CHANNELS];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {tabs.map((ch) => {
          const n = ch === '쿠팡'
            ? skus.filter((s) => s.coupangEnabled).length
            : skus.filter((s) => (s.disabledChannels ?? []).includes(ch)).length;
          return (
            <button
              key={ch}
              onClick={() => setTab(ch)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                tab === ch ? CHANNEL_TAB_STYLE[ch].active : 'border-gray-200 bg-white text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${CHANNEL_TAB_STYLE[ch].dot}`} />
              {ch}
              <span className="font-normal text-[11px] text-gray-400">{ch === '쿠팡' ? `${n}개 켬` : `${n}개 끔`}</span>
            </button>
          );
        })}
      </div>
      {tab === '쿠팡' ? <CoupangPanel /> : <OptOutPanel key={tab} channel={tab} />}
    </div>
  );
}

function CoupangPanel() {
  const skus = useStore((s) => s.skus);
  const setCoupangEnabled = useStore((s) => s.setCoupangEnabled);
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const list = q
    ? skus.filter((s) => s.skuName.toLowerCase().includes(q)).slice(0, 30)
    : skus.filter((s) => s.coupangEnabled);

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        쿠팡은 신상 미등록 전략으로 기본 비활성 채널입니다. SKU를 검색해서 개별적으로 쿠팡 채널을 활성화할 수 있습니다 —
        활성화하면 해당 SKU에 한해 STEP2 채널별 목표량·대응SKU 실적/비중·채널별 요약에 쿠팡이 포함됩니다.
      </p>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="SKU명 검색"
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />

      {!q && (
        <p className="text-[11px] text-gray-400">검색어가 없으면 현재 쿠팡이 활성화된 SKU 목록만 표시됩니다.</p>
      )}

      <div className="space-y-1.5 max-h-96 overflow-y-auto">
        {list.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-6">
            {q ? '검색 결과가 없습니다' : '쿠팡이 활성화된 SKU가 없습니다'}
          </p>
        )}
        {list.map((sku) => (
          <div key={sku.id} className="flex items-center justify-between border border-gray-200 rounded-xl px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate">{sku.skuName || '(SKU명 미입력)'}</p>
              <p className="text-[10px] text-gray-400">{sku.category} · {sku.brand} · {sku.releaseDate || '출시일 미입력'}</p>
            </div>
            <button
              onClick={() => setCoupangEnabled(sku.id, !sku.coupangEnabled)}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors flex-shrink-0 ${
                sku.coupangEnabled
                  ? 'bg-orange-500 text-white hover:bg-orange-600'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {sku.coupangEnabled ? '쿠팡 ON' : '쿠팡 OFF'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

type PendingToggle = { ids: string[]; disabled: boolean };
type ToggleMode = 'keep' | 'recalc' | 'restore';

function OptOutPanel({ channel }: { channel: OptOutChannel }) {
  const skus = useStore((s) => s.skus);
  const setChannelDisabled = useStore((s) => s.setChannelDisabled);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<Category | '전체'>('전체');
  const [brand, setBrand] = useState<string>('전체');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<PendingToggle | null>(null);
  const [mode, setMode] = useState<ToggleMode>('keep');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const isOff = (sku: SkuData) => (sku.disabledChannels ?? []).includes(channel);
  const channelQty = (sku: SkuData) =>
    sku.channelMonthQty.filter((e) => e.channel === channel).reduce((a, e) => a + e.qty, 0);
  const backupQty = (sku: SkuData) =>
    (sku.disabledChannelBackup?.[channel] ?? []).reduce((a, e) => a + e.qty, 0);

  const q = query.trim().toLowerCase();
  const filtering = q !== '' || cat !== '전체' || brand !== '전체';
  const list = filtering
    ? skus
        .filter((s) => (!q || s.skuName.toLowerCase().includes(q)) && (cat === '전체' || s.category === cat) && (brand === '전체' || s.brand === brand))
        .slice(0, 100)
    : skus.filter(isOff);

  const selectable = list.filter((s) => !isOff(s) && !isChannelToggleLocked(s));
  const selectedIds = selectable.filter((s) => selected.has(s.id)).map((s) => s.id);

  function openConfirm(ids: string[], disabled: boolean) {
    setResult(null);
    const targets = skus.filter((s) => ids.includes(s.id));
    const hasBackup = targets.some((s) => backupQty(s) > 0);
    setMode(disabled ? 'keep' : hasBackup ? 'restore' : 'keep');
    setPending({ ids, disabled });
  }

  async function apply() {
    if (!pending) return;
    setBusy(true);
    try {
      const n = await setChannelDisabled(pending.ids, channel, pending.disabled, mode);
      setResult(`${n}개 SKU의 ${channel} 채널을 ${pending.disabled ? '껐어요' : '켰어요'}.`);
      setSelected(new Set());
      setPending(null);
    } catch {
      setResult('저장에 실패했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  }

  const pendingSkus = pending ? skus.filter((s) => pending.ids.includes(s.id)) : [];
  const pendingQty = pendingSkus.reduce((a, s) => a + channelQty(s), 0);
  const pendingBackup = pendingSkus.reduce((a, s) => a + backupQty(s), 0);
  const selectCls = 'px-2 py-2 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400';

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        {channel}는 기본 활성 채널입니다. {channel} 채널을 운영하지 않는 SKU만 골라서 끌 수 있습니다 —
        끈 SKU는 STEP2 {channel} 목표량이 0으로 고정되고, 그 비중은 나머지 채널로 배분됩니다.
        발주량 확정·글로벌 확정 상태인 SKU는 잠겨 있어 확정 취소 후 변경할 수 있습니다.
      </p>

      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="SKU명 검색"
          className="flex-1 min-w-[160px] px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <select value={cat} onChange={(e) => setCat(e.target.value as Category | '전체')} className={selectCls} aria-label="카테고리">
          {['전체', ...CATEGORIES].map((c) => <option key={c} value={c}>{c === '전체' ? '카테고리 전체' : c}</option>)}
        </select>
        <select value={brand} onChange={(e) => setBrand(e.target.value)} className={selectCls} aria-label="브랜드">
          {['전체', ...BRANDS].map((b) => <option key={b} value={b}>{b === '전체' ? '브랜드 전체' : b}</option>)}
        </select>
      </div>

      {!filtering && (
        <p className="text-[11px] text-gray-400">검색어·카테고리·브랜드를 고르지 않으면 현재 {channel}를 끈 SKU만 표시됩니다.</p>
      )}

      {result && <p className="text-xs text-indigo-600">{result}</p>}

      {!pending && selectable.length > 0 && (
        <div className="flex items-center justify-between gap-2 flex-wrap bg-indigo-50 rounded-lg px-3 py-2 text-xs">
          <label className="flex items-center gap-2 text-gray-600">
            <input
              type="checkbox"
              checked={selectedIds.length === selectable.length}
              onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map((s) => s.id)) : new Set())}
              className="accent-indigo-500"
            />
            {selectedIds.length > 0 ? `${selectedIds.length}개 선택됨` : `운영 중인 ${selectable.length}개 전체 선택`}
          </label>
          <button
            disabled={selectedIds.length === 0}
            onClick={() => openConfirm(selectedIds, true)}
            className="px-3 py-1.5 rounded-md bg-indigo-500 text-white font-semibold hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            선택한 SKU {channel} 끄기
          </button>
        </div>
      )}

      {pending && (
        <div className="border border-amber-300 bg-amber-50 rounded-xl px-4 py-3 text-xs text-gray-700 space-y-2">
          <p className="font-semibold text-gray-800">
            {pendingSkus.length}개 SKU의 {channel} 채널을 {pending.disabled ? '끌까요?' : '켤까요?'}
          </p>
          {pending.disabled ? (
            <>
              <p>현재 {channel} 목표량 <b className="tabular-nums">{pendingQty.toLocaleString()}장</b>이 0이 됩니다. 끄기 전 값은 백업해 두었다가 다시 켤 때 복원할 수 있어요.</p>
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-2"><input type="radio" checked={mode === 'keep'} onChange={() => setMode('keep')} className="accent-amber-500" />{channel}만 0으로 — 나머지 채널 수기 조정값은 그대로 유지 (STEP2 합계가 줄어듦)</label>
                <label className="flex items-center gap-2"><input type="radio" checked={mode === 'recalc'} onChange={() => setMode('recalc')} className="accent-amber-500" />STEP2 전체 재계산 — 다음 STEP2 진입 시 {channel} 비중을 나머지 채널로 재분배 (수기 조정값은 덮어씀)</label>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1">
              {pendingBackup > 0 && (
                <label className="flex items-center gap-2"><input type="radio" checked={mode === 'restore'} onChange={() => setMode('restore')} className="accent-amber-500" />끄기 전 목표량 복원 (<span className="tabular-nums">{pendingBackup.toLocaleString()}장</span>)</label>
              )}
              <label className="flex items-center gap-2"><input type="radio" checked={mode === 'keep'} onChange={() => setMode('keep')} className="accent-amber-500" />0인 채로 켜기 — STEP2에서 직접 입력</label>
              <label className="flex items-center gap-2"><input type="radio" checked={mode === 'recalc'} onChange={() => setMode('recalc')} className="accent-amber-500" />STEP2 전체 재계산 — 다음 STEP2 진입 시 대응SKU 비중으로 다시 배분 (수기 조정값은 덮어씀)</label>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setPending(null)} disabled={busy} className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50">취소</button>
            <button onClick={apply} disabled={busy} className="px-3 py-1.5 rounded-md bg-amber-500 text-white font-semibold hover:bg-amber-600 disabled:opacity-50">
              {busy ? '저장 중…' : pending.disabled ? '끄기' : '켜기'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1.5 max-h-96 overflow-y-auto">
        {list.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-6">
            {filtering ? '조건에 맞는 SKU가 없습니다' : `${channel}를 끈 SKU가 없습니다`}
          </p>
        )}
        {list.map((sku) => {
          const off = isOff(sku);
          const locked = isChannelToggleLocked(sku);
          return (
            <div key={sku.id} className={`flex items-center gap-3 border border-gray-200 rounded-xl px-3 py-2 ${off ? 'bg-gray-50' : ''}`}>
              <input
                type="checkbox"
                aria-label={`${sku.skuName} 선택`}
                disabled={off || locked || !!pending}
                checked={selected.has(sku.id) && !off && !locked}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(sku.id); else next.delete(sku.id);
                  setSelected(next);
                }}
                className="accent-indigo-500 flex-shrink-0 disabled:opacity-30"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-800 truncate">{sku.skuName || '(SKU명 미입력)'}</p>
                <p className="text-[10px] text-gray-400">
                  {sku.category} · {sku.brand} · {sku.releaseDate || '출시일 미입력'} · {channel} 목표 <span className="tabular-nums">{channelQty(sku).toLocaleString()}</span>장
                </p>
              </div>
              <div className="flex flex-col items-end flex-shrink-0">
                <button
                  disabled={locked || !!pending}
                  onClick={() => openConfirm([sku.id], !off)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    off ? 'bg-gray-100 text-gray-500 hover:bg-gray-200' : channel === '글로벌' ? 'bg-sky-500 text-white hover:bg-sky-600' : 'bg-amber-500 text-white hover:bg-amber-600'
                  }`}
                >
                  {channel} {off ? 'OFF' : 'ON'}
                </button>
                {locked && <span className="text-[10px] text-amber-600 font-semibold mt-0.5">확정됨 · 잠김</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MEMO_DRAFT = `[2026-07-03] STEP1 카테고리 B2C 비중 fallback — 죽은 코드 (선택 정리)

SKU카드에서 STEP2/3 입력 전에 잠깐 보여주는 "예상 순매출" 미리보기 계산에
카테고리별 B2C 비중(의류60%·용품55%·잡화65%·장난감35%·식품65%) fallback이 남아있음
(calc.ts의 CHANNEL_B2C_RATIO / revenueMultiplier).

이 fallback은 채널비중(channelRatios) 합이 0일 때만 발동하는데, 그걸 편집하는
유일한 화면(ChannelSimSection.tsx)이 앱 어디에도 렌더링되지 않는 고아 컴포넌트라
현재 UI로는 절대 트리거될 수 없음 — 사실상 죽은 코드. 기능에는 영향 없어서
지금 당장 안 고쳐도 무방함.

▶ 정리 원할 시 클로드코드에게 이렇게 요청:
"ChannelSimSection.tsx랑 관련 store 액션(updateChannelRatio/resetChannelRatios),
calc.ts의 CHANNEL_B2C_RATIO/revenueMultiplier fallback까지 근본적으로 정리해줘"
`;

function AdminMemoTab() {
  const [content, setContent] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    const unsub = subscribeAdminMemo((memo) => {
      if (!hasLoadedRef.current) {
        setContent(memo.content || MEMO_DRAFT);
        hasLoadedRef.current = true;
      }
      setUpdatedAt(memo.updatedAt);
    });
    return unsub;
  }, []);

  async function handleSave() {
    setStatus('saving');
    await saveAdminMemo(content);
    setStatus('saved');
    setTimeout(() => setStatus('idle'), 2000);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">
        MASTER만 볼 수 있는 자유 메모장입니다. 코드/데이터 관련 이슈나 나중에 클로드코드에게 시킬 작업을 적어두는 용도.
      </p>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={16}
        className="w-full px-3 py-2 text-xs font-mono text-gray-700 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-y"
        placeholder="메모를 입력하세요…"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={status === 'saving'}
          className="text-xs px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {status === 'saving' ? '저장 중…' : '저장'}
        </button>
        {status === 'saved' && <span className="text-xs text-green-600 font-medium">저장됨 ✓</span>}
        {updatedAt && (
          <span className="text-[10px] text-gray-400 ml-auto">
            마지막 저장: {new Date(updatedAt).toLocaleString('ko-KR')}
          </span>
        )}
      </div>
    </div>
  );
}

export function AdminSection() {
  const [editing, setEditing] = useState<Role | null>(null);
  const [saved, setSaved] = useState<Role | null>(null);
  const [activeTab, setActiveTab] = useState<'pin' | 'perm' | 'data' | 'channel' | 'memo'>('pin');

  async function handleSave(role: Role, pin: string) {
    await setPin(role, pin);
    setEditing(null);
    setSaved(role);
    setTimeout(() => setSaved(null), 2000);
  }

  return (
    <section className="max-w-2xl mx-auto p-4 pb-10 space-y-4">
      <h2 className="text-base font-bold text-gray-900">관리자 설정</h2>

      {/* 탭 */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab('pin')}
          className={`flex-1 text-xs py-1.5 rounded-md font-semibold transition-all ${activeTab === 'pin' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
        >
          PIN 관리
        </button>
        <button
          onClick={() => setActiveTab('perm')}
          className={`flex-1 text-xs py-1.5 rounded-md font-semibold transition-all ${activeTab === 'perm' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
        >
          권한 관리
        </button>
        <button
          onClick={() => setActiveTab('channel')}
          className={`flex-1 text-xs py-1.5 rounded-md font-semibold transition-all ${activeTab === 'channel' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
        >
          채널 관리
        </button>
        <button
          onClick={() => setActiveTab('data')}
          className={`flex-1 text-xs py-1.5 rounded-md font-semibold transition-all ${activeTab === 'data' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
        >
          데이터 정리
        </button>
        <button
          onClick={() => setActiveTab('memo')}
          className={`flex-1 text-xs py-1.5 rounded-md font-semibold transition-all ${activeTab === 'memo' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
        >
          관리자 메모
        </button>
      </div>

        {activeTab === 'pin' && (
          <>
            <p className="text-xs text-gray-400">각 권한의 PIN을 변경할 수 있습니다.</p>
            <div className="space-y-2">
              {ALL_ROLES.map((role) => (
                <div key={role} className="border border-gray-200 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ROLE_COLORS[role]}`}>
                      {ROLE_LABELS[role]}
                    </span>
                    <div className="flex items-center gap-2">
                      {saved === role && (
                        <span className="text-xs text-green-600 font-medium">저장됨 ✓</span>
                      )}
                      {editing !== role && (
                        <button
                          onClick={() => setEditing(role)}
                          className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          PIN 변경
                        </button>
                      )}
                    </div>
                  </div>
                  {editing === role && (
                    <PinInput
                      onSave={(pin) => handleSave(role, pin)}
                      onCancel={() => setEditing(null)}
                    />
                  )}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 text-center">
              PIN 분실 시 Firestore의 config/pins 문서를 초기화해야 합니다
            </p>
          </>
        )}

        {activeTab === 'perm' && (
          <>
            <p className="text-xs text-gray-400">
              권한별 편집 범위를 설정합니다. 변경 사항은 Firestore에 즉시 저장되며 모든 사용자에게 실시간 반영됩니다.
            </p>
            <PermissionTable />
            <p className="text-[10px] text-gray-400">
              * MASTER는 항상 전체 권한. 체크 해제 시 해당 권한은 해당 기능을 뷰어로만 사용합니다.
            </p>
          </>
        )}

        {activeTab === 'channel' && <ChannelManageTab />}

        {activeTab === 'data' && <DataCleanupTab />}

        {activeTab === 'memo' && <AdminMemoTab />}
    </section>
  );
}
