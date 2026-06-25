import { useState, useRef, useEffect } from 'react';
import { setPin, ALL_ROLES, type Role } from '../utils/pin';
import { useStore } from '../store';
import {
  PERM_LABELS,
  saveRolePermission,
  type RolePermission,
} from '../utils/permissions';
import { usePermission } from '../contexts/PermissionsContext';

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

export function PinManager({ onClose }: { onClose: () => void }) {
  const [editing, setEditing] = useState<Role | null>(null);
  const [saved, setSaved] = useState<Role | null>(null);
  const [activeTab, setActiveTab] = useState<'pin' | 'perm' | 'data'>('pin');

  async function handleSave(role: Role, pin: string) {
    await setPin(role, pin);
    setEditing(null);
    setSaved(role);
    setTimeout(() => setSaved(null), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">관리자 설정</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ✕
          </button>
        </div>

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
            onClick={() => setActiveTab('data')}
            className={`flex-1 text-xs py-1.5 rounded-md font-semibold transition-all ${activeTab === 'data' ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
          >
            데이터 정리
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

        {activeTab === 'data' && <DataCleanupTab />}
      </div>
    </div>
  );
}
