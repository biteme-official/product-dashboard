import React, { useState, type FocusEvent, type ChangeEvent, type KeyboardEvent } from 'react';

interface Props {
  value: number;
  onChange: (value: number) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  allowDecimal?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}

/**
 * 숫자 전용 입력 컴포넌트
 * - 포커스 해제 시 천단위 콤마 표시 (예: 1,500,000)
 * - 포커스 시 순수 숫자 편집 모드
 * - 마우스 스크롤로 값이 바뀌지 않음 (type="text" 사용)
 * - allowDecimal=true 시 소수 허용 (targetSellThroughMonths 등)
 */
export function NumericInput({
  value,
  onChange,
  onBlur,
  onFocus,
  onKeyDown,
  placeholder,
  className,
  style,
  allowDecimal = false,
  disabled = false,
  autoFocus = false,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [rawStr, setRawStr] = useState('');

  const displayValue = editing
    ? rawStr
    : value === 0
    ? ''
    : value.toLocaleString('ko-KR');

  function handleFocus() {
    onFocus?.();
    setRawStr(value === 0 ? '' : String(value));
    setEditing(true);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    let clean = e.target.value.replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, '');

    // 소수점 중복 방지
    if (allowDecimal) {
      const dotIdx = clean.indexOf('.');
      if (dotIdx >= 0) {
        clean = clean.slice(0, dotIdx + 1) + clean.slice(dotIdx + 1).replace(/\./g, '');
      }
    }

    setRawStr(clean);
    const parsed = parseFloat(clean) || 0;
    onChange(parsed);
  }

  function handleBlur(e: FocusEvent<HTMLInputElement>) {
    setEditing(false);
    const parsed = parseFloat(rawStr) || 0;
    onChange(parsed);
    onBlur?.();
    // suppress lint warning about unused e
    void e;
  }

  return (
    <input
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      value={displayValue}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className={className}
      style={style}
      disabled={disabled}
      autoFocus={autoFocus}
    />
  );
}
