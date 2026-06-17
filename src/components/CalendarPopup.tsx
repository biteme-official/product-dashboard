import { useState } from 'react';

const WEEK_DAYS = ['일', '월', '화', '수', '목', '금', '토'];

export interface CalendarPopupProps {
  selectedDate: string;
  top: number;
  left: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onSelect: (dateStr: string) => void;
}

export function CalendarPopup({ selectedDate, top, left, containerRef, onSelect }: CalendarPopupProps) {
  const initDate = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date();
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }

  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstDayOfMonth).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const selYear = selectedDate ? parseInt(selectedDate.slice(0, 4)) : -1;
  const selMonth = selectedDate ? parseInt(selectedDate.slice(5, 7)) - 1 : -1;
  const selDay = selectedDate ? parseInt(selectedDate.slice(8, 10)) : -1;

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  function handleDayClick(day: number) {
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    onSelect(`${viewYear}-${mm}-${dd}`);
  }

  const CAL_W = 252;
  const CAL_H = 300;
  const adjLeft = Math.max(8, Math.min(left, window.innerWidth - CAL_W - 8));
  const adjTop = top + CAL_H > window.innerHeight - 8 ? Math.max(8, top - CAL_H - 44) : top;

  return (
    <div
      ref={containerRef}
      style={{ position: 'fixed', top: adjTop, left: adjLeft, zIndex: 200, width: `${CAL_W}px` }}
      className="bg-white border border-gray-200 rounded-2xl shadow-2xl p-3 select-none"
    >
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={prevMonth}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-[13px] font-semibold text-gray-700">
          {viewYear}년 {viewMonth + 1}월
        </span>
        <button
          onClick={nextMonth}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {WEEK_DAYS.map((d, i) => (
          <div
            key={d}
            className={`text-center text-[10px] font-semibold py-1 ${
              i === 0 ? 'text-rose-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`e-${idx}`} />;
          const isSelected = day === selDay && viewMonth === selMonth && viewYear === selYear;
          const thisDateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = thisDateStr === todayStr;
          const dow = idx % 7;
          return (
            <button
              key={`d-${idx}`}
              onClick={() => handleDayClick(day)}
              className={`text-center text-[12px] py-1.5 rounded-lg transition-colors font-medium leading-none ${
                isSelected
                  ? 'bg-indigo-600 text-white'
                  : isToday
                  ? 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-300'
                  : dow === 0
                  ? 'text-rose-500 hover:bg-rose-50'
                  : dow === 6
                  ? 'text-blue-500 hover:bg-blue-50'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <div className="mt-2 pt-2 border-t border-gray-100 text-center">
          <button
            onClick={() => onSelect('')}
            className="text-[11px] text-gray-400 hover:text-rose-500 transition-colors"
          >
            날짜 초기화
          </button>
        </div>
      )}
    </div>
  );
}
