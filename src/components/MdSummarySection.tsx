import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { Channel, Category, YearMonth } from '../types';
import { CHANNELS, getYearMonthRange, fmtYearMonth } from '../types';
import { useStore } from '../store';
import { MdSummaryOverview } from './MdSummaryOverview';
import { MdChannelDetail } from './MdChannelDetail';
import {
  fetchTeamCateData, classifyTableauError, TABLEAU_ERROR_MESSAGES,
  type TeamCateMap, type TableauErrorReason,
} from '../services/tableau';
import { buildVarCostRatioMap } from '../utils/mdSummaryCalc';
import { useExchangeRates } from '../utils/useExchangeRates';

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
  // 빈 Set = "전체 요약" (채널 미선택 상태). 1개 이상 선택 시 해당 채널들만 합산한 상세 뷰로 전환.
  const [selectedChannels, setSelectedChannels] = useState<Set<Channel>>(new Set());
  const [selectedSkuIds, setSelectedSkuIds] = useState<Set<string>>(new Set());
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { skus, activeBrand } = useStore();

  // 팀카테 변동비 데이터 로드 (STEP2/SkuCard와 동일한 Tableau 역산 기준 사용)
  const [teamCateMap, setTeamCateMap] = useState<TeamCateMap | null>(null);
  const [teamCateError, setTeamCateError] = useState<TableauErrorReason | null>(null);
  const [teamCateLoading, setTeamCateLoading] = useState(true);
  useEffect(() => {
    setTeamCateLoading(true);
    fetchTeamCateData()
      .then((m) => { setTeamCateMap(m); setTeamCateError(null); })
      .catch((err) => { console.error('[팀카테 변동비 로드 실패]', err); setTeamCateError(classifyTableauError(err)); })
      .finally(() => setTeamCateLoading(false));
  }, []);
  const varCostMap = useMemo(() => buildVarCostRatioMap(teamCateMap), [teamCateMap]);
  // 시나리오 가격 계산용 실시간 환율 (STEP2/SkuCard와 동일 소스)
  const { usdKrw, jpyKrw } = useExchangeRates();

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

  // 슬라이더 상태를 인덱스가 아닌 YearMonth 값으로 보존
  // → 카테고리가 바뀌어도 "26.09~27.02를 보겠다"는 의도가 유지됨
  const [rangeStartYm, setRangeStartYm] = useState<YearMonth | null>(null);
  const [rangeEndYm, setRangeEndYm] = useState<YearMonth | null>(null);

  function findClosestIdx(ym: YearMonth, months: YearMonth[]): number {
    const exact = months.findIndex((m) => m.year === ym.year && m.month === ym.month);
    if (exact >= 0) return exact;
    const target = ym.year * 12 + ym.month;
    let bestIdx = 0, bestDiff = Infinity;
    months.forEach((m, i) => {
      const diff = Math.abs(m.year * 12 + m.month - target);
      if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    });
    return bestIdx;
  }

  // 최초 1회만 기본값 세팅 (첫 데이터 로드 시)
  useEffect(() => {
    if (allYearMonths.length === 0 || rangeStartYm !== null) return;
    setRangeStartYm(allYearMonths[0]);
    setRangeEndYm(allYearMonths[Math.min(5, allYearMonths.length - 1)]);
  }, [allYearMonths, rangeStartYm]);

  // YearMonth → 인덱스 변환 (카테고리 변경 시 가장 가까운 월로 재계산)
  const rangeStart = useMemo(() => {
    if (!rangeStartYm || allYearMonths.length === 0) return 0;
    return findClosestIdx(rangeStartYm, allYearMonths);
  }, [allYearMonths, rangeStartYm]);

  const rangeEnd = useMemo(() => {
    if (!rangeEndYm || allYearMonths.length === 0) return Math.min(5, allYearMonths.length - 1);
    return Math.max(rangeStart, findClosestIdx(rangeEndYm, allYearMonths));
  }, [allYearMonths, rangeEndYm, rangeStart]);

  const visibleMonths = useMemo(
    () => allYearMonths.slice(rangeStart, rangeEnd + 1),
    [allYearMonths, rangeStart, rangeEnd],
  );

  const handleRangeChange = useCallback((s: number, e: number) => {
    setRangeStartYm(allYearMonths[s] ?? null);
    setRangeEndYm(allYearMonths[e] ?? null);
  }, [allYearMonths]);

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
    setSelectedChannels(new Set());
  }, [categoryFilter, activeBrand]);

  function toggleChannel(ch: Channel) {
    const next = new Set(selectedChannels);
    if (next.has(ch)) next.delete(ch); else next.add(ch);
    setSelectedChannels(next);
  }

  const visibleSkus = categoryFiltered.filter((s) =>
    searchQuery === '' || s.skuName.toLowerCase().includes(searchQuery.toLowerCase()),
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
      {teamCateError ? (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">
          <span>⚠ Tableau 팀카테 변동비 데이터 로드 실패 — {TABLEAU_ERROR_MESSAGES[teamCateError]}. 모든 SKU에 기본값 25%가 임시 적용됩니다.</span>
        </div>
      ) : !teamCateLoading && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-600 w-fit">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
          </span>
          <span>Tableau 변동비 비중 연동중</span>
        </div>
      )}

      {/* 채널 탭 바 + 월 범위 슬라이더 */}
      <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
        <div className="flex gap-1 overflow-x-auto scrollbar-none flex-1 min-w-0">
          <button
            onClick={() => setSelectedChannels(new Set())}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
              selectedChannels.size === 0
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
          >
            전체 요약
          </button>
          {CHANNELS.map((ch) => (
            <button
              key={ch}
              onClick={() => toggleChannel(ch)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                selectedChannels.has(ch)
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              }`}
            >
              {ch}
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
                    <span className="text-xs text-gray-600 truncate">{sku.skuName}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* 탭 콘텐츠 */}
      {selectedChannels.size === 0 ? (
        <MdSummaryOverview skus={filtered} months={visibleMonths} varCostMap={varCostMap} usdKrw={usdKrw} jpyKrw={jpyKrw} />
      ) : (
        <MdChannelDetail skus={filtered} channels={[...selectedChannels]} months={visibleMonths} varCostMap={varCostMap} usdKrw={usdKrw} jpyKrw={jpyKrw} />
      )}
    </div>
  );
}
