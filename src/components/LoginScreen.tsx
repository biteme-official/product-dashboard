import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../store/auth';
import { verifyPin, setPin, allPinsSet, ALL_ROLES, type Role } from '../utils/pin';

const ROLE_META: Record<Role, {
  label: string;
  desc: string;
  color: string;        // 선택 상태 배경
  ring: string;         // 포커스 링
  badge: string;        // 배지 (헤더용)
  dot: string;          // 셋업 스텝 도트
}> = {
  master:      { label: 'MASTER',   desc: '모든 권한',     color: 'bg-indigo-600 text-white',  ring: 'ring-indigo-400',  badge: 'bg-indigo-100 text-indigo-700',  dot: 'bg-indigo-500' },
  pm:          { label: 'PM',       desc: 'SKU 편집',      color: 'bg-violet-600 text-white',  ring: 'ring-violet-400',  badge: 'bg-violet-100 text-violet-700',  dot: 'bg-violet-500' },
  platform_md: { label: '플랫폼MD', desc: '플랫폼 채널',   color: 'bg-emerald-600 text-white', ring: 'ring-emerald-400', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  brand_md:    { label: '브랜드MD', desc: '브랜드·B2B',    color: 'bg-amber-500 text-white',   ring: 'ring-amber-400',   badge: 'bg-amber-100 text-amber-700',    dot: 'bg-amber-500' },
  global:      { label: '글로벌',   desc: '글로벌·일본',   color: 'bg-sky-600 text-white',     ring: 'ring-sky-400',     badge: 'bg-sky-100 text-sky-700',        dot: 'bg-sky-500' },
};

// ── PIN 도트 입력 UI ───────────────────────────────────────────────────────
function PinDots({
  pin,
  onChange,
  onComplete,
  activeRole,
  autoFocus = false,
}: {
  pin: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  activeRole?: Role | null;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dotFill = activeRole ? ROLE_META[activeRole].dot : 'bg-indigo-500';

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <div
      className="flex flex-col items-center gap-4 cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="flex gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
              pin.length > i
                ? `${dotFill} border-transparent scale-110`
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
  const [step, setStep] = useState(0);
  const [pin, setPin_] = useState('');
  const [confirm, setConfirm] = useState('');
  const [phase, setPhase] = useState<'enter' | 'confirm'>('enter');
  const [error, setError] = useState('');

  const role = ALL_ROLES[step];
  const meta = ROLE_META[role];
  const total = ALL_ROLES.length;

  function handleEnterComplete(v: string) {
    setPin_(v);
    setPhase('confirm');
  }

  async function handleConfirmComplete(v: string) {
    if (v !== pin) {
      setError('PIN이 일치하지 않습니다. 다시 입력해주세요.');
      setPin_(''); setConfirm(''); setPhase('enter');
      return;
    }
    setError('');
    await setPin(role, v);
    if (step < total - 1) {
      setStep(step + 1);
      setPin_(''); setConfirm(''); setPhase('enter');
    } else {
      onDone();
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8 space-y-7">

        {/* 헤더 */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-indigo-600 mb-3">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-gray-900">초기 PIN 설정</h1>
          <p className="text-xs text-gray-400 mt-1">각 역할의 PIN을 순서대로 설정해주세요</p>
        </div>

        {/* 스텝 인디케이터 */}
        <div className="space-y-2">
          {/* 상단 2개 (master, pm) */}
          <div className="flex gap-2 justify-center">
            {ALL_ROLES.slice(0, 2).map((r, i) => {
              const done = i < step;
              const current = i === step;
              const m = ROLE_META[r];
              return (
                <div
                  key={r}
                  className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-semibold transition-all ${
                    current ? m.color
                    : done   ? 'bg-gray-200 text-gray-500'
                             : 'bg-gray-100 text-gray-300'
                  }`}
                >
                  {done ? '✓' : i + 1} {m.label}
                </div>
              );
            })}
          </div>
          {/* 하단 3개 (platform_md, brand_md, global) */}
          <div className="flex gap-2 justify-center">
            {ALL_ROLES.slice(2).map((r, idx) => {
              const i = idx + 2;
              const done = i < step;
              const current = i === step;
              const m = ROLE_META[r];
              return (
                <div
                  key={r}
                  className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-semibold transition-all ${
                    current ? m.color
                    : done   ? 'bg-gray-200 text-gray-500'
                             : 'bg-gray-100 text-gray-300'
                  }`}
                >
                  {done ? '✓' : i + 1} {m.label}
                </div>
              );
            })}
          </div>
        </div>

        {/* 현재 역할 + PIN 입력 */}
        <div className="space-y-5">
          <div className="text-center space-y-2">
            <div className={`inline-block px-4 py-1.5 rounded-full text-sm font-bold ${meta.color}`}>
              {meta.label}
            </div>
            <p className="text-sm text-gray-500">
              {phase === 'enter' ? '새 PIN 4자리를 입력하세요' : 'PIN을 한 번 더 입력하세요'}
            </p>
          </div>

          {phase === 'enter' ? (
            <PinDots pin={pin} onChange={setPin_} onComplete={handleEnterComplete} activeRole={role} autoFocus />
          ) : (
            <PinDots pin={confirm} onChange={setConfirm} onComplete={handleConfirmComplete} activeRole={role} autoFocus />
          )}
        </div>

        {error && <p className="text-center text-xs text-red-500">{error}</p>}

        <p className="text-center text-xs text-gray-400">
          {step + 1} / {total} — {meta.desc}
        </p>
      </div>
    </div>
  );
}

// ── 로그인 화면 ────────────────────────────────────────────────────────────
export function LoginScreen() {
  const { setRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isSetup, setIsSetup] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [pin, setPin_] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    allPinsSet().then((set) => {
      setIsSetup(!set);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="text-sm text-gray-400">로딩 중...</span>
      </div>
    );
  }

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

  const topRoles: Role[] = ['master', 'pm'];
  const mdRoles: Role[] = ['platform_md', 'brand_md', 'global'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8 space-y-6">

        {/* 헤더 */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-indigo-600 mb-3">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-gray-900">Product Dashboard</h1>
          <p className="text-xs text-gray-400 mt-1">발주량 시뮬레이션 &amp; 월별 판매 계획</p>
        </div>

        {/* 역할 선택 */}
        <div className="space-y-2">
          {/* MASTER / PM */}
          <div className="grid grid-cols-2 gap-2">
            {topRoles.map((role) => {
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

          {/* MD 구분선 */}
          <div className="flex items-center gap-2 py-0.5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-[10px] text-gray-400 font-semibold tracking-widest">MD</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* 플랫폼MD / 브랜드MD / 글로벌 */}
          <div className="grid grid-cols-3 gap-2">
            {mdRoles.map((role) => {
              const m = ROLE_META[role];
              const isSelected = selectedRole === role;
              return (
                <button
                  key={role}
                  onClick={() => selectRole(role)}
                  className={`flex flex-col items-center py-3 px-1 rounded-xl border-2 transition-all ${
                    isSelected
                      ? `border-transparent ${m.color} ring-2 ${m.ring}`
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="font-bold text-xs leading-tight text-center">{m.label}</span>
                  <span className={`text-[9px] mt-0.5 text-center ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>
                    {m.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* PIN 입력 */}
        {selectedRole && (
          <div className="space-y-3 pt-1">
            <p className="text-center text-sm text-gray-500">PIN 4자리를 입력하세요</p>
            <PinDots pin={pin} onChange={setPin_} onComplete={handlePinComplete} activeRole={selectedRole} autoFocus />
          </div>
        )}

        {error && <p className="text-center text-xs text-red-500">{error}</p>}

        {!selectedRole && (
          <p className="text-center text-xs text-gray-400">역할을 선택하세요</p>
        )}
      </div>
    </div>
  );
}
