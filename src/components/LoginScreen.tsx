import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../store/auth';
import { verifyPin, setPin, allPinsSet, type Role } from '../utils/pin';

const ROLES: Role[] = ['master', 'pm', 'md'];

const ROLE_META: Record<Role, { label: string; desc: string; color: string; ring: string }> = {
  master: { label: 'MASTER', desc: '모든 권한',         color: 'bg-indigo-600 text-white', ring: 'ring-indigo-400' },
  pm:     { label: 'PM',     desc: 'SKU 카드 편집',     color: 'bg-violet-600 text-white',  ring: 'ring-violet-400' },
  md:     { label: 'MD',     desc: '월별·채널 편집',    color: 'bg-emerald-600 text-white', ring: 'ring-emerald-400' },
};

const SETUP_STEPS: Role[] = ['master', 'pm', 'md'];

// ── PIN 입력 UI ────────────────────────────────────────────────────────────
function PinDots({
  pin,
  onChange,
  onComplete,
  autoFocus = false,
}: {
  pin: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <div
      className="flex flex-col items-center gap-3 cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="flex gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-all ${
              pin.length > i
                ? 'bg-indigo-600 border-indigo-600'
                : 'bg-white border-gray-300'
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
        value={pin}
        autoFocus={autoFocus}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 4);
          onChange(v);
          if (v.length === 4) onComplete?.(v);
        }}
        className="sr-only"
      />
    </div>
  );
}

// ── 초기 설정 화면 ─────────────────────────────────────────────────────────
function SetupScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0); // 0=master, 1=pm, 2=md
  const [pin, setPin_] = useState('');
  const [confirm, setConfirm] = useState('');
  const [phase, setPhase] = useState<'enter' | 'confirm'>('enter');
  const [error, setError] = useState('');

  const role = SETUP_STEPS[step];
  const meta = ROLE_META[role];

  function handleEnterComplete(v: string) {
    setPin_(v);
    setPhase('confirm');
  }

  async function handleConfirmComplete(v: string) {
    if (v !== pin) {
      setError('PIN이 일치하지 않습니다. 다시 입력해주세요.');
      setPin_('');
      setConfirm('');
      setPhase('enter');
      return;
    }
    setError('');
    await setPin(role, v);
    if (step < 2) {
      setStep(step + 1);
      setPin_('');
      setConfirm('');
      setPhase('enter');
    } else {
      onDone();
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900">MD Dashboard</h1>
          <p className="text-xs text-gray-400 mt-1">초기 PIN 설정</p>
        </div>

        {/* 스텝 인디케이터 */}
        <div className="flex justify-center gap-2">
          {SETUP_STEPS.map((r, i) => (
            <div
              key={r}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium transition-all ${
                i === step
                  ? meta.color
                  : i < step
                  ? 'bg-gray-200 text-gray-500'
                  : 'bg-gray-100 text-gray-300'
              }`}
            >
              {i < step ? '✓' : `${i + 1}`} {ROLE_META[r].label}
            </div>
          ))}
        </div>

        <div className="text-center space-y-1">
          <div className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${meta.color}`}>
            {meta.label}
          </div>
          <p className="text-sm text-gray-500">
            {phase === 'enter' ? '새 PIN 4자리를 입력하세요' : 'PIN을 한 번 더 입력하세요'}
          </p>
        </div>

        {phase === 'enter' ? (
          <PinDots pin={pin} onChange={setPin_} onComplete={handleEnterComplete} autoFocus />
        ) : (
          <PinDots pin={confirm} onChange={setConfirm} onComplete={handleConfirmComplete} autoFocus />
        )}

        {error && (
          <p className="text-center text-xs text-red-500">{error}</p>
        )}

        <p className="text-center text-xs text-gray-400">
          {step + 1} / 3 — {meta.desc}
        </p>
      </div>
    </div>
  );
}

// ── 로그인 화면 ────────────────────────────────────────────────────────────
export function LoginScreen() {
  const { setRole } = useAuth();
  const [isSetup, setIsSetup] = useState(!allPinsSet());
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [pin, setPin_] = useState('');
  const [error, setError] = useState('');

  if (isSetup) {
    return <SetupScreen onDone={() => setIsSetup(false)} />;
  }

  async function handlePinComplete(v: string) {
    if (!selectedRole) return;
    const ok = await verifyPin(selectedRole, v);
    if (ok) {
      setRole(selectedRole);
    } else {
      setError('PIN이 일치하지 않습니다.');
      setPin_('');
    }
  }

  function selectRole(role: Role) {
    setSelectedRole(role);
    setPin_('');
    setError('');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900">MD Dashboard</h1>
          <p className="text-xs text-gray-400 mt-1">발주량 시뮬레이션 &amp; 월별 판매 계획</p>
        </div>

        {/* 역할 선택 */}
        <div className="grid grid-cols-3 gap-2">
          {ROLES.map((role) => {
            const m = ROLE_META[role];
            const isSelected = selectedRole === role;
            return (
              <button
                key={role}
                onClick={() => selectRole(role)}
                className={`flex flex-col items-center py-3 px-2 rounded-xl border-2 transition-all ${
                  isSelected
                    ? `border-transparent ${m.color} ring-2 ${m.ring}`
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className="font-bold text-sm">{m.label}</span>
                <span className={`text-[10px] mt-0.5 ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>
                  {m.desc}
                </span>
              </button>
            );
          })}
        </div>

        {/* PIN 입력 */}
        {selectedRole && (
          <div className="space-y-3">
            <p className="text-center text-sm text-gray-500">PIN 4자리를 입력하세요</p>
            <PinDots pin={pin} onChange={setPin_} onComplete={handlePinComplete} autoFocus />
          </div>
        )}

        {error && (
          <p className="text-center text-xs text-red-500">{error}</p>
        )}

        {!selectedRole && (
          <p className="text-center text-xs text-gray-400">역할을 선택하세요</p>
        )}
      </div>
    </div>
  );
}
