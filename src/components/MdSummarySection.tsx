import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { Channel, Category, YearMonth } from '../types';
import { CHANNELS, getYearMonthRange, fmtYearMonth } from '../types';
import { useStore } from '../store';
import { MdSummaryOverview } from './MdSummaryOverview';
import { MdChannelDetail } from './MdChannelDetail';

type TabId = '전체 요약' | Channel;
const TABS: TabId[] = ['전체 요약', ...CHANNELS];

interface Props {
  categoryFilter: Category | '전체';
}

/* ── 듀얼 범위 슬라이더 ───────────────────────────────────────────────── */
interface RangeSliderProps {
  min: number;
  max: number;
  start: number;
  end: number;
  labels: string[];
  onChange: (start: number, end: number) => void;
}

function RangeSlider({ min, max, start, end, labels, onChange }: RangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const pct = (v: number) => max === min ? 0 : ((v - min) / (max - min)) * 100;
  const clamp = (v: number) => Math.max(min, Math.min(max, v));

  function posToIdx(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return min;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return clamp(Math.round(min + ratio * (max - min)));
  }

  function makeDragHandler(which: 'start' | 'end') {
    return (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      function getX(ev: MouseEvent | TouchEvent) {
        return 'touches' in ev ? ev.touches[0].clientX : ev.clientX;
      }
      function onMove(ev: MouseEvent | TouchEvent) {
        const idx = posToIdx(getX(ev));
        if (which === 'start') {
          onChange(Math.min(idx, end), end);
        } else {
          onChange(start, Math.max(idx, start));
        }
      }
      function onUp() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend', onUp);
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onUp);
    };
  }

  if (max < min) return null;

  const leftPct = pct(start);
  const rightPct = pct(end);

  return (
    <div className="flex items-center gap-2 min-w-[220px] select-none">
      <span className="text-[11px] text-indigo-600 font-semibold tabular-nums whitespace-nowrap">
        {labels[start]}
      </span>
      <div ref={trackRef} className="relative flex-1 h-5 flex items-center cursor-pointer">
        <div className="absolute inset-y-0 flex items-center w-full">
          <div className="w-full h-1.5 bg-gray-200 rounded-full" />
        </div>
        <div
          className="absolute h-1.5 bg-indigo-400 rounded-full"
          style={{ left: `${leftPct}%`, width: `${rightPct - leftPct}%` }}
        />
        <div
          className="absolute w-4 h-4 bg-white border-2 border-indigo-500 rounded-full shadow cursor-grab active:cursor-grabbing z-10"
          style={{ left: `calc(${leftPct}% - 8px)` }}
          onMouseDown={makeDragHandler('start')}
          onTouchStart={makeDragHandler('start')}
        />
        <div
          className="absolute w-4 h-4 bg-white border-2 border-indigo-500 rounded-full shadow cursor-grab active:cursor-grabbing z-10"
          style={{ left: `calc(${rightPct}% - 8px)` }}
          onMouseDown={makeDragHandler('end')}
          onTouchStart={makeDragHandler('end')}
        />
      </div>
      <span className="text-[11px] text-indigo-600 font-semibold tabular-nums whitespace-nowrap">
        {labels[end]}
      </span>
    </div>
  );
}

/* ── 메인 컴포넌트 ───────────────────────────────────────────────────── */
export function MdSummarySection({ categoryFilter }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('전체 요약');
  const [selectedSkuIds, setSelectedSkuIds] = useState<Set<string>>(new Set());
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { skus, activeBrand } = useStore();

  const categoryFiltered = useMemo(() =>
    skus.filter((s) => {
      if (categoryFilter !== '전체' && s.category !== categoryFilter) return false;
      if (activeBrand !== '전체' && s.brand !== activeBrand) return false;
      return true;
    }),
    [skus, categoryFilter, activeBrand],
  );

  const allYearMonths: YearMonth[] = useMemo(
    () => getYearMonthRange(categoryFiltered),
    [categoryFiltered],
  );
  const monthLabels = useMemo(() => allYearMonths.map(fmtYearMonth), [allYearMonths]);

  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(0);
  const rangeInitedRef = useRef(false);

  useEffect(() => {
    if (allYearMonths.length === 0) return;
    if (!rangeInitedRef.current) {
      // 최초 1회만 기본값(0 ~ +5) 세팅
      rangeInitedRef.current = true;
      setRangeStart(0);
      setRangeEnd(Math.min(5, allYearMonths.length - 1));
      return;
    }
    // 이후 월 범위가 줄어들면 인덱스만 clamp (사용자가 조정한 값 유지)
    setRangeStart((prev) => Math.min(prev, allYearMonths.length - 1));
    setRangeEnd((prev) => Math.min(prev, allYearMonths.length - 1));
  }, [allYearMonths.length]);

  const visibleMonths = useMemo(
    () => allYearMonths.slice(rangeStart, rangeEnd + 1),
    [allYearMonths, rangeStart, rangeEnd],
  );

  const handleRangeChange = useCallback((s: number, e: number) => {
    setRangeStart(s);
    setRangeEnd(e);
  }, []);

  useEffect(() => {
    function onClickOutside(ev: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(ev.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    setSelectedSkuIds(new Set());
  }, [categoryFilter, activeBrand]);

  const visibleSkus = categoryFiltered.filter((s) =>
    searchQuery === '' || s.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const filtered = selectedSkuIds.size === 0
    ? categoryFiltered
    : categoryFiltered.filter((s) => selectedSkuIds.has(s.id));

  const allSelected = selectedSkuIds.size === categoryFiltered.length && categoryFiltered.length > 0;

  function toggleAll() {
    setSelectedSkuIds(allSelected ? new Set() : new Set(categoryFiltered.map((s) => s.id)));
  }

  function toggleSku(id: string) {
    const next = new Set(selectedSkuIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedSkuIds(next);
  }

  return (
    <div className="space-y-3">
      {/* 채널 탭 바 + 월 범위 슬라이더 */}
      <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
        <div className="flex gap-1 overflow-x-auto scrollbar-none flex-1 min-w-0">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                activeTab === tab
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {allYearMonths.length > 1 && (
          <div className="w-px h-5 bg-gray-200 flex-shrink-0" />
        )}

        {allYearMonths.length > 1 && (
          <div className="flex-shrink-0 pr-1">
            <RangeSlider
              min={0}
              max={allYearMonths.length - 1}
              start={rangeStart}
              end={rangeEnd}
              labels={monthLabels}
              onChange={handleRangeChange}
            />
          </div>
        )}
      </div>

      {/* SKU 필터 드롭다운 */}
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setDropdownOpen((v) => !v)}
          className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors shadow-sm"
        >
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span>
            {selectedSkuIds.size === 0
              ? `SKU 전체 (${categoryFiltered.length})`
              : allSelected
                ? `SKU 전체 선택 (${categoryFiltered.length})`
                : `SKU ${selectedSkuIds.size}개 선택`}
          </span>
          <svg className={`w-3 h-3 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {dropdownOpen && (
          <div className="absolute z-30 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            <div className="p-2 border-b border-gray-100">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="SKU명 검색..."
                className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400"
                autoFocus
              />
            </div>
            <div className="px-2 py-1.5 border-b border-gray-100">
              <label className="flex items-center gap-2 px-1 py-1 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="w-3.5 h-3.5 rounded accent-indigo-600"
                />
                <span className="text-xs font-semibold text-gray-700">전체 선택 ({categoryFiltered.length})</span>
              </label>
            </div>
            <div className="max-h-56 overflow-y-auto px-2 py-1.5">
              {visibleSkus.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">검색 결과 없음</p>
              ) : (
                visibleSkus.map((sku) => (
                  <label key={sku.id} className="flex items-center gap-2 px-1 py-1 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedSkuIds.has(sku.id)}
                      onChange={() => toggleSku(sku.id)}
                      className="w-3.5 h-3.5 rounded accent-indigo-600 flex-shrink-0"
                    />
                    <span className="text-xs text-gray-600 truncate">{sku.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === '전체 요약' ? (
        <MdSummaryOverview skus={filtered} months={visibleMonths} />
      ) : (
        <MdChannelDetail skus={filtered} channel={activeTab as Channel} months={visibleMonths} />
      )}
    </div>
  );
}
