import { useState, type KeyboardEvent } from 'react';

const fmt = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString() : '–');

/** Enter 저장 · Esc 취소 · 바깥 클릭 저장 · 한글 조합 중 Enter 무시 */
export function CellInput({ value, onCommit, disabled, suffix, className = '' }: {
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
    <input autoFocus value={draft} size={1} inputMode="decimal" onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(null);
      }}
      className={`w-full min-w-0 text-right tabular-nums rounded px-1 py-0.5 border border-indigo-400 bg-indigo-50 outline-none ${className}`} />
  );
}
