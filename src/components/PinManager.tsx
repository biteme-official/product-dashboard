import { useState, useRef, useEffect } from 'react';
import { setPin, ALL_ROLES, type Role } from '../utils/pin';

const ROLE_LABELS: Record<Role, string> = {
  master:      'MASTER',
  pm:          'PM',
  platform_md: '플랫폼MD',
  brand_md:    '브랜드MD',
  global:      '글로벌',
};

const ROLE_COLORS: Record<Role, string> = {
  master:      'text-indigo-700 bg-indigo-50',
  pm:          'text-violet-700 bg-violet-50',
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

export function PinManager({ onClose }: { onClose: () => void }) {
  const [editing, setEditing] = useState<Role | null>(null);
  const [saved, setSaved] = useState<Role | null>(null);

  async function handleSave(role: Role, pin: string) {
    await setPin(role, pin);
    setEditing(null);
    setSaved(role);
    setTimeout(() => setSaved(null), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">PIN 관리</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-gray-400">각 역할의 PIN을 변경할 수 있습니다.</p>

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
          PIN 분실 시 브라우저 로컬스토리지를 초기화해야 합니다
        </p>
      </div>
    </div>
  );
}
