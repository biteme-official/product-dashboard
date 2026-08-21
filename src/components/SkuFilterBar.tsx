import { useEffect, useMemo, useRef, useState } from 'react';
import type { SkuData } from '../types';
import { catCls } from '../utils/categoryColors';

// ── 공용 검색 인풋 ─────────────────────────────────────────────────────────────
export function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="SKU명 검색"
        className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 w-32 sm:w-44"
      />
      <svg
        className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
      </svg>
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 text-sm leading-none"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function formatYearMonth(ym: string): string {
  const [year, month] = ym.split('-');
  return `${year.slice(2)}년 ${parseInt(month)}월`;
}

function toggleFilterItem(set: Set<string>, val: string): Set<string> {
  const next = new Set(set);
  if (next.has(val)) next.delete(val);
  else next.add(val);
  return next;
}

interface SkuFilterBarProps {
  /** 필터 옵션(카테고리/브랜드/오픈월)을 계산할 기준이 되는 전체 SKU 목록 */
  skus: SkuData[];
  catFilter: Set<string>;
  onCatFilterChange: (v: Set<string>) => void;
  brandFilter: Set<string>;
  onBrandFilterChange: (v: Set<string>) => void;
  monthFilter: Set<string>;
  onMonthFilterChange: (v: Set<string>) => void;
  excludeOpenComplete: boolean;
  onExcludeOpenCompleteChange: (v: boolean) => void;
  /** SKU명 검색 입력 — 생략하면 검색창을 표시하지 않음(예: 별도의 SKU 선택 드롭다운이 이미 있는 화면) */
  searchQuery?: string;
  onSearchQueryChange?: (v: string) => void;
  /** 현재 필터가 반영된 결과 개수 (필터 바 우측에 표시) */
  resultCount: number;
}

/**
 * 프로젝션 탭에서 쓰던 필터 바(카테고리·브랜드 다중선택, 오픈/완료 제외, 오픈월)를
 * 채널별 요약 탭에서도 재사용하기 위해 분리한 공용 컴포넌트.
 * 실제 SKU 배열 필터링은 각 사용처(SkuOrderSection의 allFilteredSkus, MdSummarySection의
 * categoryFiltered)에서 수행 — 이 컴포넌트는 필터 상태를 보여주고 바꾸는 UI만 담당한다.
 */
export function SkuFilterBar({
  skus,
  catFilter, onCatFilterChange,
  brandFilter, onBrandFilterChange,
  monthFilter, onMonthFilterChange,
  excludeOpenComplete, onExcludeOpenCompleteChange,
  searchQuery, onSearchQueryChange,
  resultCount,
}: SkuFilterBarProps) {
  const availableCategories = useMemo(
    () => [...new Set(skus.map((s) => s.category))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko')),
    [skus],
  );
  const availableBrands = useMemo(
    () => [...new Set(skus.map((s) => s.brand))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko')),
    [skus],
  );
  const availableMonths = useMemo(
    () => [...new Set(skus.filter((s) => s.releaseDate).map((s) => s.releaseDate!.substring(0, 7)))].sort(),
    [skus],
  );

  // 오픈월 드롭다운: 연도별로 묶어서 표시 (데이터가 있는 월만)
  const monthsByYear = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const ym of availableMonths) {
      const year = ym.slice(0, 4);
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push(ym);
    }
    return [...map.entries()];
  }, [availableMonths]);

  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
  const monthDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!monthDropdownOpen) return;
    function handleOutside(e: MouseEvent) {
      if (monthDropdownRef.current && !monthDropdownRef.current.contains(e.target as Node)) {
        setMonthDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [monthDropdownOpen]);

  function toggleCat(val: string) { onCatFilterChange(toggleFilterItem(catFilter, val)); }
  function toggleBrand(val: string) { onBrandFilterChange(toggleFilterItem(brandFilter, val)); }
  function toggleMonth(val: string) { onMonthFilterChange(toggleFilterItem(monthFilter, val)); }
  function resetFilters() {
    onCatFilterChange(new Set());
    onBrandFilterChange(new Set());
    onMonthFilterChange(new Set());
    onExcludeOpenCompleteChange(false);
  }

  const hasFilter = catFilter.size > 0 || brandFilter.size > 0 || monthFilter.size > 0 || excludeOpenComplete;

  return (
    <div className="flex-shrink-0 bg-white border border-gray-200 rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-x-2 gap-y-1.5 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-gray-400 font-semibold shrink-0 w-14">카테고리</span>
          {availableCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => toggleCat(cat)}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                catFilter.has(cat)
                  ? catCls(cat) + ' border-transparent'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-gray-200 shrink-0" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-gray-400 font-semibold shrink-0 w-[30px]">브랜드</span>
          {availableBrands.map((brand) => (
            <button
              key={brand}
              onClick={() => toggleBrand(brand)}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                brandFilter.has(brand)
                  ? 'bg-gray-700 text-white border-gray-700'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              {brand}
            </button>
          ))}
        </div>
        <button
          onClick={() => onExcludeOpenCompleteChange(!excludeOpenComplete)}
          className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors shrink-0 ${
            excludeOpenComplete
              ? 'bg-rose-50 text-rose-600 border-rose-200'
              : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
          }`}
        >
          오픈/완료 제외
        </button>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-semibold tabular-nums text-gray-500 whitespace-nowrap">
            {resultCount}개
          </span>
          {hasFilter && (
            <button
              onClick={resetFilters}
              className="text-[11px] text-gray-400 hover:text-rose-500 transition-colors whitespace-nowrap"
            >
              초기화
            </button>
          )}
          {availableMonths.length > 0 && (
            <div className="relative" ref={monthDropdownRef}>
              <button
                onClick={() => setMonthDropdownOpen((o) => !o)}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
                  monthFilter.size > 0
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-medium'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
                title="SKU 출시월로 필터링"
              >
                오픈월
                {monthFilter.size > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-indigo-600 text-white text-[9px] font-bold leading-none">
                    {monthFilter.size}
                  </span>
                )}
                <svg className={`w-3 h-3 transition-transform ${monthDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {monthDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 min-w-[160px] bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                  <div className="px-2 py-1.5 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-gray-500">오픈월 선택 (SKU 출시월)</span>
                    {monthFilter.size > 0 && (
                      <button onClick={() => onMonthFilterChange(new Set())} className="text-[10px] text-gray-400 hover:text-rose-500 transition-colors">초기화</button>
                    )}
                  </div>
                  <div className="py-1 max-h-[320px] overflow-y-auto">
                    {monthsByYear.map(([year, months]) => {
                      const allSelected = months.every((ym) => monthFilter.has(ym));
                      const someSelected = months.some((ym) => monthFilter.has(ym));
                      function toggleYear() {
                        const next = new Set(monthFilter);
                        if (allSelected) months.forEach((ym) => next.delete(ym));
                        else months.forEach((ym) => next.add(ym));
                        onMonthFilterChange(next);
                      }
                      return (
                        <div key={year}>
                          <label className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50 transition-colors bg-gray-50/70">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
                              onChange={toggleYear}
                              className="w-3.5 h-3.5 accent-indigo-600 shrink-0"
                            />
                            <span className={`text-[11px] font-bold ${someSelected ? 'text-indigo-700' : 'text-gray-600'}`}>{year}년</span>
                          </label>
                          {months.map((ym) => (
                            <label key={ym} className="flex items-center gap-2 pl-7 pr-3 py-1.5 cursor-pointer hover:bg-gray-50 transition-colors">
                              <input type="checkbox" checked={monthFilter.has(ym)} onChange={() => toggleMonth(ym)} className="w-3.5 h-3.5 accent-indigo-600 shrink-0" />
                              <span className={`text-[12px] ${monthFilter.has(ym) ? 'text-indigo-700 font-medium' : 'text-gray-600'}`}>{formatYearMonth(ym)}</span>
                            </label>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          {searchQuery !== undefined && onSearchQueryChange && (
            <SearchInput value={searchQuery} onChange={onSearchQueryChange} />
          )}
        </div>
      </div>
    </div>
  );
}
