import { useState, useRef, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { useVisibleSkus } from '../hooks/useVisibleSkus';
import { useAuth } from '../store/auth';
import { SkuCard } from './SkuCard';
import { PricingModal } from './PricingModal';
import { NumericInput } from './NumericInput';
import { exportBulkOrderXlsx } from '../utils/exportXlsx';
import { CalendarPopup } from './CalendarPopup';
import type { SkuData, ChannelOpenScheduleEntry } from '../types';
import { usePermission } from '../contexts/PermissionsContext';

type ViewMode = 'list' | 'gallery';

// ── 카테고리 배지 색상 ─────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  '의류': 'bg-violet-100 text-violet-700',
  '잡화': 'bg-amber-100 text-amber-700',
  '식품': 'bg-emerald-100 text-emerald-700',
  '장난감': 'bg-rose-100 text-rose-700',
  '용품': 'bg-sky-100 text-sky-700',
};
function catCls(cat: string): string {
  return CATEGORY_COLORS[cat] ?? 'bg-gray-100 text-gray-600';
}

// ── 날짜 포맷: "M/D (요일)" ────────────────────────────────────────────────────
function formatReleaseDate(dateStr: string | undefined | null): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr + 'T00:00:00');
  if (isNaN(date.getTime())) return null;
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${m}/${d} (${days[date.getDay()]})`;
}

function formatYearMonth(ym: string): string {
  const [year, month] = ym.split('-');
  return `${year.slice(2)}년 ${parseInt(month)}월`;
}

function isPast(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr + 'T00:00:00') < today;
}

// ── 정렬 함수 (컴포넌트 외부로 분리하여 useMemo 안전 사용) ─────────────────────
function sortByDateThenName(a: SkuData, b: SkuData): number {
  if (!a.releaseDate && !b.releaseDate) return a.skuName.localeCompare(b.skuName, 'ko');
  if (!a.releaseDate) return 1;
  if (!b.releaseDate) return -1;
  const dateCmp = a.releaseDate.localeCompare(b.releaseDate);
  return dateCmp !== 0 ? dateCmp : a.skuName.localeCompare(b.skuName, 'ko');
}

function sortForListView(a: SkuData, b: SkuData): number {
  if (!a.releaseDate && !b.releaseDate) { /* fall through */ }
  else if (!a.releaseDate) return 1;
  else if (!b.releaseDate) return -1;
  else {
    const dateCmp = a.releaseDate.localeCompare(b.releaseDate);
    if (dateCmp !== 0) return dateCmp;
  }
  const brandCmp = a.brand.localeCompare(b.brand, 'ko');
  if (brandCmp !== 0) return brandCmp;
  const catCmp = a.category.localeCompare(b.category, 'ko');
  if (catCmp !== 0) return catCmp;
  return a.skuName.localeCompare(b.skuName, 'ko');
}

export function SkuOrderSection({
  mode = 'sku',
  subTab = 'list-view',
  listCatFilter = new Set<string>(),
  listBrandFilter = new Set<string>(),
  listMonthFilter = new Set<string>(),
  searchQuery = '',
  onListCatFilterChange = () => {},
  onListBrandFilterChange = () => {},
  onListMonthFilterChange = () => {},
  onSearchQueryChange = () => {},
  onNavigateToSku,
}: {
  mode?: 'sku' | 'projection';
  subTab?: string;
  listCatFilter?: Set<string>;
  listBrandFilter?: Set<string>;
  listMonthFilter?: Set<string>;
  searchQuery?: string;
  onListCatFilterChange?: (v: Set<string>) => void;
  onListBrandFilterChange?: (v: Set<string>) => void;
  onListMonthFilterChange?: (v: Set<string>) => void;
  onSearchQueryChange?: (v: string) => void;
  onNavigateToSku?: (sku: SkuData) => void;
}) {
  const skus = useVisibleSkus();
  const activeCategory = useStore((s) => s.activeCategory);
  const activeBrand = useStore((s) => s.activeBrand);
  const addSku = useStore((s) => s.addSku);
  const isProjection = mode === 'projection';

  const { role } = useAuth();
  const canEdit = usePermission(role).skuBasic;
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);

  // LIST VIEW 필터 (App.tsx에서 props로 수신)

  // 뷰 모드: 목록 / 갤러리 (localStorage 유지, SKU 리스트 모드 전용)
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem('sku-view-mode') as ViewMode) ?? 'list',
  );
  const [gallerySkuId, setGallerySkuId] = useState<string | null>(null);

  function switchView(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem('sku-view-mode', mode);
  }

  function closeModal() { setGallerySkuId(null); }

  // LIST VIEW 필터 옵션 (전체 SKU 기준 자동 생성)
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

  function toggleFilterItem(set: Set<string>, val: string): Set<string> {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    return next;
  }

  function toggleCat(val: string) { onListCatFilterChange(toggleFilterItem(listCatFilter, val)); }
  function toggleBrand(val: string) { onListBrandFilterChange(toggleFilterItem(listBrandFilter, val)); }
  function toggleMonth(val: string) { onListMonthFilterChange(toggleFilterItem(listMonthFilter, val)); }
  function resetFilters() { onListCatFilterChange(new Set()); onListBrandFilterChange(new Set()); onListMonthFilterChange(new Set()); }

  const hasListFilter = listCatFilter.size > 0 || listBrandFilter.size > 0 || listMonthFilter.size > 0;

  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
  const monthDropdownRef = useRef<HTMLDivElement>(null);

  // Esc 키로 모달 닫기
  useEffect(() => {
    if (!gallerySkuId) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closeModal(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [gallerySkuId]);

  // 모달 열릴 때 body 스크롤 잠금
  useEffect(() => {
    document.body.style.overflow = gallerySkuId ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [gallerySkuId]);

  // 일괄 다운로드 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!bulkOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setBulkOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [bulkOpen]);

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

  function toggleAll() {
    if (selectedIds.size === filteredSkus.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredSkus.map((s) => s.id)));
  }

  function toggleOne(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function handleBulkDownload() {
    const toExport = filteredSkus.filter((s) => selectedIds.has(s.id));
    if (toExport.length === 0) return;
    exportBulkOrderXlsx(toExport, activeCategory);
    setBulkOpen(false);
    setSelectedIds(new Set());
  }

  const categorySkus = skus.filter((s) => s.category === activeCategory);
  const filteredSkus = categorySkus
    .filter((s) => activeBrand === '전체' || s.brand === activeBrand)
    .sort(sortByDateThenName);

  // LIST VIEW: 로컬 필터 적용 (카테고리·브랜드·오픈월 조합 필터링)
  const allFilteredSkus = useMemo(
    () =>
      skus
        .filter((s) => {
          if (listCatFilter.size > 0 && !listCatFilter.has(s.category)) return false;
          if (listBrandFilter.size > 0 && !listBrandFilter.has(s.brand)) return false;
          if (listMonthFilter.size > 0) {
            if (!s.releaseDate) return false;
            if (!listMonthFilter.has(s.releaseDate.substring(0, 7))) return false;
          }
          return true;
        })
        .sort(sortForListView),
    [skus, listCatFilter, listBrandFilter, listMonthFilter],
  );

  const sourceSkus = isProjection ? allFilteredSkus : filteredSkus;
  const displaySkus = searchQuery.trim()
    ? sourceSkus.filter((s) => s.skuName.includes(searchQuery.trim()))
    : sourceSkus;

  const isAtMax = categorySkus.length >= 100;
  const gallerySelectedSku = gallerySkuId ? skus.find((s) => s.id === gallerySkuId) ?? null : null;

  return (
    <section className="p-4 space-y-3">
      {/* 헤더 — SKU 리스트 모드에서만 표시 */}
      {!isProjection && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-700 flex-shrink-0">
            SKU 발주 입력
            <span className="ml-2 text-gray-400 font-normal">
              {filteredSkus.length}{activeBrand !== '전체' ? ` (전체 ${categorySkus.length})` : ''} / 100
            </span>
          </h2>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* 뷰 모드 토글 */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              <button
                onClick={() => switchView('list')}
                title="목록 뷰"
                className={`px-2.5 py-1.5 flex items-center gap-1 transition-colors ${
                  viewMode === 'list' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                <span className="hidden sm:inline">목록</span>
              </button>
              <button
                onClick={() => switchView('gallery')}
                title="갤러리 뷰"
                className={`px-2.5 py-1.5 flex items-center gap-1 transition-colors ${
                  viewMode === 'gallery' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                <span className="hidden sm:inline">갤러리</span>
              </button>
            </div>

            {/* 일괄 발주표 다운로드 */}
            {filteredSkus.length > 0 && (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setBulkOpen((o) => !o)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors whitespace-nowrap"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  <span className="hidden sm:inline">일괄 발주표</span>
                  <span className="sm:hidden">발주표</span>
                  {selectedIds.size > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold leading-none">
                      {selectedIds.size}
                    </span>
                  )}
                  <span className="text-emerald-400 text-[10px]">▾</span>
                </button>

                {bulkOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                    <label className="flex items-center gap-2.5 px-3 py-2.5 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === filteredSkus.length && filteredSkus.length > 0}
                        onChange={toggleAll}
                        className="w-3.5 h-3.5 accent-emerald-600"
                      />
                      <span className="text-xs font-semibold text-gray-700">전체 선택</span>
                      <span className="ml-auto text-[10px] text-gray-400">{filteredSkus.length}개</span>
                    </label>
                    <div className="max-h-48 overflow-y-auto">
                      {filteredSkus.map((sku) => (
                        <label key={sku.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(sku.id)}
                            onChange={() => toggleOne(sku.id)}
                            className="w-3.5 h-3.5 accent-emerald-600 flex-shrink-0"
                          />
                          <span className="text-xs text-gray-700 truncate">
                            {sku.skuName || <span className="text-gray-300">(SKU명 미입력)</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="px-3 py-2.5 border-t border-gray-100 flex gap-2">
                      <button
                        onClick={handleBulkDownload}
                        disabled={selectedIds.size === 0}
                        className="flex-1 py-1.5 text-xs rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        다운로드 {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                      </button>
                      <button
                        onClick={() => setBulkOpen(false)}
                        className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                      >
                        닫기
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <SearchInput value={searchQuery} onChange={onSearchQueryChange} />
          </div>
        </div>
      )}

      {isProjection ? (
        /* ── 프로젝션 공통 컨테이너 (필터바 + 서브탭 콘텐츠) ── */
        <div className="flex flex-col gap-2" style={{ height: 'calc(100vh - 108px)' }}>
          {/* 필터 바 (모든 서브탭 공유) */}
          <div className="flex-shrink-0 bg-white border border-gray-200 rounded-xl px-3 py-2.5">
            <div className="flex items-center gap-x-2 gap-y-1.5 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-gray-400 font-semibold shrink-0 w-14">카테고리</span>
                {availableCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => toggleCat(cat)}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                      listCatFilter.has(cat)
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
                      listBrandFilter.has(brand)
                        ? 'bg-gray-700 text-white border-gray-700'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {brand}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-semibold tabular-nums text-gray-500 whitespace-nowrap">
                  {displaySkus.length}개
                </span>
                {hasListFilter && (
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
                        listMonthFilter.size > 0
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-medium'
                          : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      오픈월
                      {listMonthFilter.size > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-indigo-600 text-white text-[9px] font-bold leading-none">
                          {listMonthFilter.size}
                        </span>
                      )}
                      <svg className={`w-3 h-3 transition-transform ${monthDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {monthDropdownOpen && (
                      <div className="absolute right-0 top-full mt-1.5 min-w-[140px] bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                        <div className="px-2 py-1.5 border-b border-gray-100 flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-gray-500">오픈월 선택</span>
                          {listMonthFilter.size > 0 && (
                            <button onClick={() => onListMonthFilterChange(new Set())} className="text-[10px] text-gray-400 hover:text-rose-500 transition-colors">초기화</button>
                          )}
                        </div>
                        <div className="py-1">
                          {availableMonths.map((ym) => (
                            <label key={ym} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50 transition-colors">
                              <input type="checkbox" checked={listMonthFilter.has(ym)} onChange={() => toggleMonth(ym)} className="w-3.5 h-3.5 accent-indigo-600 shrink-0" />
                              <span className={`text-[12px] ${listMonthFilter.has(ym) ? 'text-indigo-700 font-medium' : 'text-gray-600'}`}>{formatYearMonth(ym)}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <SearchInput value={searchQuery} onChange={onSearchQueryChange} />
              </div>
            </div>
          </div>

          {/* 서브탭 콘텐츠 */}
          {displaySkus.length === 0 ? (
            <div className="border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
              {searchQuery || hasListFilter ? '조건에 일치하는 SKU가 없습니다.' : '등록된 SKU가 없습니다.'}
            </div>
          ) : subTab === 'list-view' ? (
            <div className="flex-1 min-h-0">
              <SkuListTable skus={displaySkus} onNavigateToSku={onNavigateToSku} />
            </div>
          ) : subTab === 'channel-schedule' ? (
            <div className="flex-1 min-h-0">
              <ChannelScheduleTable skus={displaySkus} onNavigateToSku={onNavigateToSku} />
            </div>
          ) : null}
        </div>
      ) : (
        /* ── CARD / GALLERY VIEW ── */
        <>
          {filteredSkus.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
              <p className="text-gray-400 text-sm mb-3">
                [{activeCategory}] 카테고리에 등록된 SKU가 없습니다.
              </p>
              {canEdit && (
                <button onClick={addSku} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors">
                  + 첫 SKU 추가
                </button>
              )}
            </div>
          ) : (
            <>
              {displaySkus.length === 0 ? (
                <div className="border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
                  {searchQuery ? '조건에 일치하는 SKU가 없습니다.' : '등록된 SKU가 없습니다.'}
                </div>
              ) : viewMode === 'gallery' ? (
                /* ── 갤러리 뷰 ── */
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {displaySkus.map((sku) => (
                    <SkuGalleryCard key={sku.id} sku={sku} onClick={() => setGallerySkuId(sku.id)} />
                  ))}
                </div>
              ) : (
                /* ── 목록 뷰 ── */
                <div className="space-y-2">
                  {displaySkus.map((sku) => (
                    <div key={sku.id} id={`sku-card-${sku.id}`}>
                      <SkuCard sku={searchQuery.trim() ? { ...sku, isExpanded: true } : sku} />
                    </div>
                  ))}
                </div>
              )}

              {canEdit && (
                <button
                  onClick={addSku}
                  disabled={isAtMax}
                  className={`w-full py-2.5 rounded-xl border-2 border-dashed text-sm font-medium transition-colors ${
                    isAtMax
                      ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                      : 'border-indigo-300 text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50'
                  }`}
                >
                  {isAtMax ? '최대 100개 도달' : '+ SKU 추가'}
                </button>
              )}
            </>
          )}
        </>
      )}

      {/* ── 갤러리 모달 ── */}
      {gallerySelectedSku && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
          onClick={closeModal}
        >
          <div
            className="bg-white w-full sm:max-w-5xl sm:rounded-2xl rounded-t-2xl max-h-[92vh] sm:max-h-[88vh] overflow-y-auto shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0 bg-white sticky top-0 rounded-t-2xl sm:rounded-t-2xl">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-800 truncate">
                  {gallerySelectedSku.skuName || '(SKU명 미입력)'}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${catCls(gallerySelectedSku.category)}`}>
                  {gallerySelectedSku.category}
                </span>
              </div>
              <button
                onClick={closeModal}
                className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto">
              <SkuCard sku={{ ...gallerySelectedSku, isExpanded: true }} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ── 공용 검색 인풋 ─────────────────────────────────────────────────────────────
function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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

// ── LIST VIEW 테이블 ──────────────────────────────────────────────────────────
type PriceField = 'cost' | 'price' | 'regularPrice';
interface EditingCell { skuId: string; field: PriceField; originalValue: number }
interface CalendarState { skuId: string; field: 'releaseDate' | 'arrivalDate' | 'shootingDate'; selectedDate: string; top: number; left: number }

function SkuListTable({ skus, onNavigateToSku }: { skus: SkuData[]; onNavigateToSku?: (sku: SkuData) => void }) {
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);
  const setPriceConfirmed = useStore((s) => s.setPriceConfirmed);
  const { role } = useAuth();
  const { skuBasic } = usePermission(role);
  const canEdit = skuBasic;
  const canEditDate = skuBasic;

  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [pricingSkuId, setPricingSkuId] = useState<string | null>(null);
  const pricingSku = pricingSkuId ? skus.find((s) => s.id === pricingSkuId) ?? null : null;

  const [calendarState, setCalendarState] = useState<CalendarState | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!calendarState) return;
    function handleOutside(e: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setCalendarState(null);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setCalendarState(null);
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [calendarState]);

  function openDateCalendar(sku: SkuData, field: 'releaseDate' | 'arrivalDate' | 'shootingDate', e: React.MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dateVal = field === 'releaseDate' ? sku.releaseDate : field === 'arrivalDate' ? sku.arrivalDate : sku.shootingDate;
    setCalendarState({ skuId: sku.id, field, selectedDate: dateVal ?? '', top: rect.bottom + 6, left: rect.left });
  }

  function handleDateSelect(dateStr: string) {
    if (!calendarState) return;
    updateSku(calendarState.skuId, { [calendarState.field]: dateStr });
    persistSku(calendarState.skuId);
    setCalendarState(null);
  }

  function startEdit(skuId: string, field: PriceField, originalValue: number) {
    setEditingCell({ skuId, field, originalValue });
  }
  function commitEdit(skuId: string) {
    persistSku(skuId);
    setEditingCell(null);
  }
  function cancelEdit(skuId: string, field: PriceField, originalValue: number) {
    updateSku(skuId, { [field]: originalValue });
    setEditingCell(null);
  }

  function discountRate(sku: SkuData) {
    if (!sku.regularPrice || !sku.price) return null;
    return Math.round((1 - sku.price / sku.regularPrice) * 1000) / 10;
  }
  function costRate(sku: SkuData) {
    if (!sku.cost || !sku.price) return null;
    return Math.round((sku.cost / sku.price) * 1000) / 10;
  }

  return (
    <>
      {pricingSku && <PricingModal sku={pricingSku} onClose={() => setPricingSkuId(null)} />}
      {calendarState && (
        <CalendarPopup
          selectedDate={calendarState.selectedDate}
          top={calendarState.top}
          left={calendarState.left}
          containerRef={calendarRef}
          onSelect={handleDateSelect}
        />
      )}
      <div className="bg-white border border-gray-200 rounded-xl overflow-auto h-full">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr className="border-b border-gray-200">
              <th className="px-3 py-2.5 text-left font-semibold text-gray-600 whitespace-nowrap">카테고리</th>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-600 whitespace-nowrap">브랜드</th>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-600">SKU명</th>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-600 whitespace-nowrap">오픈일</th>
              <th className="px-3 py-2.5 text-center font-semibold text-gray-600 whitespace-nowrap">자사몰 세팅</th>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-600 whitespace-nowrap">입고예정일</th>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-600 whitespace-nowrap">촬영예정일</th>
              <th className="px-3 py-2.5 text-center font-semibold text-gray-600 whitespace-nowrap">프라이싱</th>
              <th className="px-3 py-2.5 text-center font-semibold text-gray-600 whitespace-nowrap">가격확정</th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">
                원가{canEdit && <span className="ml-1 text-[9px] font-normal text-indigo-400">편집</span>}
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">
                판매가
                {canEdit && <span className="ml-1 text-[9px] font-normal text-indigo-400">편집</span>}
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">
                정가
                {canEdit && <span className="ml-1 text-[9px] font-normal text-indigo-400">편집</span>}
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">상시할인율</th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">원가율</th>
              <th className="px-3 py-2.5 text-right font-semibold text-gray-600 whitespace-nowrap">총 발주량</th>
            </tr>
          </thead>
          <tbody>
            {skus.map((sku, i) => {
              const dr = discountRate(sku);
              const cr = costRate(sku);
              const formattedDate = formatReleaseDate(sku.releaseDate);
              const isProjectionLocked = sku.scheduleConfirmed ?? false;
              return (
                <tr
                  key={sku.id}
                  className={`border-b border-gray-100 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'} hover:bg-indigo-50/40 transition-colors`}
                >
                  {/* 카테고리 — 고정 컬러 배지 */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${catCls(sku.category)}`}>
                      {sku.category}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{sku.brand}</td>
                  <td className="px-3 py-2 max-w-[180px]">
                    <button
                      onClick={() => onNavigateToSku?.(sku)}
                      className="font-medium text-gray-800 truncate block w-full text-left hover:text-indigo-600 hover:underline underline-offset-2 transition-colors"
                      title={sku.skuName || undefined}
                    >
                      {sku.skuName || <span className="text-gray-300">(미입력)</span>}
                    </button>
                  </td>
                  {/* 오픈일 — 확정 시 [확정] 뱃지만 표시 (토글 없음) */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {canEditDate ? (
                        <button
                          onClick={(e) => openDateCalendar(sku, 'releaseDate', e)}
                          className={`text-[12px] tabular-nums transition-colors hover:text-indigo-600 hover:underline underline-offset-2 decoration-dashed ${
                            formattedDate ? 'text-gray-600' : 'text-gray-300'
                          }`}
                          title="클릭하여 날짜 변경"
                        >
                          {formattedDate ?? '날짜 설정'}
                        </button>
                      ) : (
                        <span className="text-[12px] tabular-nums text-gray-500">
                          {formattedDate ?? <span className="text-gray-300">–</span>}
                        </span>
                      )}
                      {isProjectionLocked && (
                        <span className="px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-gray-100 text-gray-400 whitespace-nowrap">
                          확정
                        </span>
                      )}
                    </div>
                  </td>
                  {/* 자사몰 세팅 — master/pm만 체크 가능 */}
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    {canEdit ? (
                      <button
                        onClick={() => {
                          updateSku(sku.id, { ownMallSetup: !(sku.ownMallSetup ?? false) });
                          persistSku(sku.id);
                        }}
                        title={sku.ownMallSetup ? '클릭하여 해제' : '클릭하여 세팅 완료 표시'}
                        className={`w-4 h-4 rounded flex items-center justify-center border transition-colors mx-auto ${
                          sku.ownMallSetup
                            ? 'bg-emerald-200 border-emerald-300 text-emerald-700 hover:bg-emerald-300'
                            : 'bg-white border-gray-300 hover:border-emerald-300'
                        }`}
                      >
                        {sku.ownMallSetup && (
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ) : (
                      <span className={`w-4 h-4 rounded flex items-center justify-center border mx-auto ${
                        sku.ownMallSetup
                          ? 'bg-emerald-200 border-emerald-300 text-emerald-700'
                          : 'bg-white border-gray-200'
                      }`}>
                        {sku.ownMallSetup && (
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                    )}
                  </td>
                  {/* 입고예정일 — master/pm 클릭 시 캘린더 팝업 */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    {canEditDate ? (
                      <button
                        onClick={(e) => openDateCalendar(sku, 'arrivalDate', e)}
                        className={`text-[12px] tabular-nums transition-colors hover:text-indigo-600 hover:underline underline-offset-2 decoration-dashed ${
                          formatReleaseDate(sku.arrivalDate)
                            ? isPast(sku.arrivalDate) ? 'text-gray-400' : 'text-gray-600'
                            : 'text-gray-300'
                        }`}
                        title="클릭하여 날짜 변경"
                      >
                        {formatReleaseDate(sku.arrivalDate) ?? '날짜 설정'}
                      </button>
                    ) : (
                      <span className={`text-[12px] tabular-nums ${isPast(sku.arrivalDate) ? 'text-gray-400' : 'text-gray-500'}`}>
                        {formatReleaseDate(sku.arrivalDate) ?? <span className="text-gray-300">–</span>}
                      </span>
                    )}
                  </td>
                  {/* 촬영예정일 — master/pm 클릭 시 캘린더 팝업 */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    {canEditDate ? (
                      <button
                        onClick={(e) => openDateCalendar(sku, 'shootingDate', e)}
                        className={`text-[12px] tabular-nums transition-colors hover:text-indigo-600 hover:underline underline-offset-2 decoration-dashed ${
                          formatReleaseDate(sku.shootingDate)
                            ? isPast(sku.shootingDate) ? 'text-gray-400' : 'text-gray-600'
                            : 'text-gray-300'
                        }`}
                        title="클릭하여 날짜 변경"
                      >
                        {formatReleaseDate(sku.shootingDate) ?? '날짜 설정'}
                      </button>
                    ) : (
                      <span className={`text-[12px] tabular-nums ${isPast(sku.shootingDate) ? 'text-gray-400' : 'text-gray-500'}`}>
                        {formatReleaseDate(sku.shootingDate) ?? <span className="text-gray-300">–</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => setPricingSkuId(sku.id)}
                      className="px-2 py-1 text-[11px] font-medium rounded-md border border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:border-indigo-300 transition-colors whitespace-nowrap"
                    >
                      프라이싱
                    </button>
                  </td>
                  {/* 가격확정 */}
                  <td className="px-2 py-1.5 text-center">
                    {canEdit ? (
                      <button
                        onClick={() => setPriceConfirmed(sku.id, !(sku.isPriceConfirmed ?? false))}
                        className={`px-2 py-0.5 text-[11px] font-semibold rounded-full border transition-colors whitespace-nowrap ${
                          sku.isPriceConfirmed
                            ? 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200'
                            : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                        }`}
                      >
                        {sku.isPriceConfirmed ? '🔒 확정' : '미확정'}
                      </button>
                    ) : (
                      <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full border whitespace-nowrap ${
                        sku.isPriceConfirmed
                          ? 'bg-amber-100 text-amber-700 border-amber-300'
                          : 'bg-gray-100 text-gray-400 border-gray-200'
                      }`}>
                        {sku.isPriceConfirmed ? '🔒 확정' : '미확정'}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <ListPriceCell sku={sku} field="cost" editingCell={editingCell} canEdit={canEdit}
                      onStartEdit={startEdit} onCommit={commitEdit} onCancel={cancelEdit}
                      onUpdate={(v) => updateSku(sku.id, { cost: v })} />
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <ListPriceCell sku={sku} field="price" editingCell={editingCell}
                      canEdit={canEdit && !(sku.isPriceConfirmed ?? false)}
                      onStartEdit={startEdit} onCommit={commitEdit} onCancel={cancelEdit}
                      onUpdate={(v) => updateSku(sku.id, { price: v })} />
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <ListPriceCell sku={sku} field="regularPrice" editingCell={editingCell}
                      canEdit={canEdit && !(sku.isPriceConfirmed ?? false)}
                      onStartEdit={startEdit} onCommit={commitEdit} onCancel={cancelEdit}
                      onUpdate={(v) => updateSku(sku.id, { regularPrice: v })} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {dr !== null
                      ? <span className={dr > 0 ? 'text-rose-600 font-medium' : 'text-gray-500'}>{dr}%</span>
                      : <span className="text-gray-300">–</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700 whitespace-nowrap">
                    {cr !== null ? `${cr}%` : <span className="text-gray-300">–</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-800 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 justify-end">
                      {sku.totalOrderQty > 0 ? sku.totalOrderQty.toLocaleString() : <span className="text-gray-300">–</span>}
                      {sku.finalOrderConfirmedAt && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-pink-300 text-white whitespace-nowrap">PM확정</span>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ListPriceCell({ sku, field, editingCell, canEdit, onStartEdit, onCommit, onCancel, onUpdate }: {
  sku: SkuData;
  field: PriceField;
  editingCell: EditingCell | null;
  canEdit: boolean;
  onStartEdit: (skuId: string, field: PriceField, originalValue: number) => void;
  onCommit: (skuId: string) => void;
  onCancel: (skuId: string, field: PriceField, originalValue: number) => void;
  onUpdate: (v: number) => void;
}) {
  const isEditing = editingCell?.skuId === sku.id && editingCell?.field === field;
  const value = sku[field] as number;

  if (isEditing) {
    return (
      <NumericInput
        value={value}
        onChange={onUpdate}
        onBlur={() => onCommit(sku.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit(sku.id);
          if (e.key === 'Escape') onCancel(sku.id, field, editingCell!.originalValue);
        }}
        autoFocus
        className="w-24 px-2 py-1 text-[12px] text-right border border-indigo-400 rounded focus:outline-none focus:ring-1 focus:ring-indigo-300 bg-white"
      />
    );
  }

  return (
    <span
      onClick={() => canEdit && onStartEdit(sku.id, field, value)}
      className={`tabular-nums text-[12px] ${
        canEdit ? 'cursor-pointer hover:text-indigo-600 hover:underline decoration-dashed underline-offset-2' : ''
      } ${value === 0 ? 'text-gray-300' : 'text-gray-700'}`}
    >
      {value === 0 ? '–' : value.toLocaleString()}
    </span>
  );
}

// ── 채널별 오픈일정 테이블 ────────────────────────────────────────────────────

const SCHEDULE_CHANNELS = ['플랫폼', '스스', '위탁', 'B2B', '글로벌', '기타'] as const;
type ScheduleChannel = typeof SCHEDULE_CHANNELS[number];

const CH_KEY: Record<ScheduleChannel, keyof ChannelOpenScheduleEntry> = {
  '플랫폼': '플랫폼', '스스': '스스', '위탁': '위탁', 'B2B': 'B2B', '글로벌': '글로벌', '기타': '기타',
};

const NONE = 'NONE'; // 미판매 센티넬

const SCHEDULE_CH_CLS: Record<ScheduleChannel, string> = {
  '플랫폼': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  '스스':   'bg-violet-100 text-violet-700 border-violet-200',
  '위탁':   'bg-cyan-100 text-cyan-700 border-cyan-200',
  'B2B':    'bg-emerald-100 text-emerald-700 border-emerald-200',
  '글로벌': 'bg-pink-100 text-pink-700 border-pink-200',
  '기타':   'bg-gray-100 text-gray-600 border-gray-200',
};

function toDateObj(dateStr: string | null | undefined): Date | null {
  if (!dateStr || dateStr === NONE) return null;
  const d = new Date(dateStr + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function getPreOpenStatus(
  sku: SkuData,
  getVal: (sku: SkuData, ch: ScheduleChannel) => string | null | undefined,
): 'none' | 'simultaneous' | 'kitta-first' | { channel: ScheduleChannel; date: string }[] {
  const baseDate = sku.releaseDate;
  const baseObj = toDateObj(baseDate);
  if (!baseObj) return 'none';

  let hasActiveChannel = false;
  const earlyChannels: { channel: ScheduleChannel; date: string }[] = [];
  let hasLateChannel = false;

  for (const ch of SCHEDULE_CHANNELS) {
    const val = getVal(sku, ch);
    if (val === NONE) continue;
    hasActiveChannel = true;
    const effectiveDateStr = (val !== null && val !== undefined) ? val : baseDate;
    const effectiveObj = toDateObj(effectiveDateStr);
    if (!effectiveObj) continue;
    if (effectiveObj < baseObj) {
      earlyChannels.push({ channel: ch, date: effectiveDateStr });
    } else if (effectiveObj > baseObj) {
      hasLateChannel = true;
    }
  }

  if (!hasActiveChannel) return 'none';
  if (earlyChannels.length > 0) {
    // 기본 오픈일보다 이른 채널 존재 → 선오픈 배지
    earlyChannels.sort((a, b) => {
      const da = toDateObj(a.date), db = toDateObj(b.date);
      if (!da || !db) return 0;
      return da.getTime() - db.getTime();
    });
    return earlyChannels;
  }
  if (hasLateChannel) return 'kitta-first'; // 모든 채널이 기본 오픈일보다 늦음 → 기타가 최초 오픈
  return 'simultaneous';
}

function toMD(dateStr: string | null | undefined): string {
  if (!dateStr || dateStr === NONE) return '';
  const dt = new Date(dateStr + 'T00:00:00');
  return isNaN(dt.getTime()) ? '' : `${dt.getMonth() + 1}/${dt.getDate()}`;
}

interface ScheduleCal { skuId: string; channel: ScheduleChannel; date: string; top: number; left: number }

function ChannelScheduleTable({ skus, onNavigateToSku }: { skus: SkuData[]; onNavigateToSku?: (sku: SkuData) => void }) {
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);
  const setScheduleConfirmed = useStore((s) => s.setScheduleConfirmed);
  const { role } = useAuth();
  const { step2: canEdit, projectionConfirm: canConfirm } = usePermission(role);

  const [scheduleCal, setScheduleCal] = useState<ScheduleCal | null>(null);
  const calRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scheduleCal) return;
    function out(e: MouseEvent) { if (calRef.current && !calRef.current.contains(e.target as Node)) setScheduleCal(null); }
    function esc(e: KeyboardEvent) { if (e.key === 'Escape') setScheduleCal(null); }
    document.addEventListener('mousedown', out);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc); };
  }, [scheduleCal]);

  function getVal(sku: SkuData, ch: ScheduleChannel): string | null | undefined {
    return sku.channelOpenSchedule?.[CH_KEY[ch]] as string | null | undefined;
  }

  function saveDate(skuId: string, ch: ScheduleChannel, dateStr: string | null) {
    const sku = skus.find((s) => s.id === skuId);
    if (!sku) return;
    updateSku(skuId, { channelOpenSchedule: { ...sku.channelOpenSchedule, [CH_KEY[ch]]: dateStr } });
    persistSku(skuId);
  }

  function saveLabelOnly(skuId: string, label: string) {
    const sku = skus.find((s) => s.id === skuId);
    if (!sku) return;
    updateSku(skuId, { channelOpenSchedule: { ...sku.channelOpenSchedule, 기타Label: label } });
    persistSku(skuId);
  }

  function openCal(sku: SkuData, ch: ScheduleChannel, e: React.MouseEvent) {
    const val = getVal(sku, ch);
    const date = (val !== null && val !== undefined) ? val : (sku.releaseDate ?? '');
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setScheduleCal({ skuId: sku.id, channel: ch, date, top: rect.bottom + 6, left: rect.left });
  }

  return (
    <>
      {scheduleCal && (
        <CalendarPopup
          selectedDate={scheduleCal.date}
          top={scheduleCal.top}
          left={scheduleCal.left}
          containerRef={calRef}
          onSelect={(dateStr) => {
            if (!scheduleCal) return;
            saveDate(scheduleCal.skuId, scheduleCal.channel, dateStr || null);
            setScheduleCal(null);
          }}
        />
      )}
      <div className="bg-white border border-gray-200 rounded-xl overflow-auto h-full">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr className="border-b border-gray-200">
              <th className="px-3 py-2.5 text-left font-semibold text-gray-600 whitespace-nowrap">카테고리</th>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-600 whitespace-nowrap">브랜드</th>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-600">SKU명</th>
              <th className="px-3 py-2.5 text-center font-semibold text-gray-600 whitespace-nowrap">입고예정일</th>
              <th className="px-3 py-2.5 text-center font-semibold text-gray-600 whitespace-nowrap">촬영예정일</th>
              <th className="px-3 py-2.5 text-center font-semibold text-gray-600 whitespace-nowrap">기본 오픈일</th>
              <th className="px-3 py-2.5 text-center font-semibold text-gray-600 whitespace-nowrap">확정</th>
              <th className="px-3 py-2.5 text-center font-semibold text-gray-600 whitespace-nowrap">선오픈 여부</th>
              {(['플랫폼', '스스', '위탁', 'B2B', '글로벌'] as const).map((ch) => (
                <th key={ch} className="px-3 py-2.5 text-center font-semibold text-gray-600 whitespace-nowrap">{ch}</th>
              ))}
              <th className="px-3 py-2.5 text-center font-semibold text-gray-600 whitespace-nowrap">기타</th>
              <th className="px-3 py-2.5 text-left font-semibold text-gray-600 whitespace-nowrap min-w-[200px]">메모</th>
            </tr>
          </thead>
          <tbody>
            {skus.map((sku, i) => {
              const isProjectionLocked = sku.scheduleConfirmed ?? false;
              const rowCanEdit = canEdit && !isProjectionLocked;
              return (
              <tr
                key={sku.id}
                className={`border-b border-gray-100 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'} hover:bg-indigo-50/40 transition-colors`}
              >
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${catCls(sku.category)}`}>{sku.category}</span>
                </td>
                <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{sku.brand}</td>
                <td className="px-3 py-2 max-w-[180px]">
                  <button
                    onClick={() => onNavigateToSku?.(sku)}
                    className="font-medium text-gray-800 truncate block w-full text-left hover:text-indigo-600 hover:underline underline-offset-2 transition-colors"
                    title={sku.skuName || undefined}
                  >
                    {sku.skuName || <span className="text-gray-300">(미입력)</span>}
                  </button>
                </td>
                {/* 입고예정일 / 촬영예정일 — 읽기 전용 */}
                <td className={`px-3 py-2 text-center whitespace-nowrap tabular-nums ${isPast(sku.arrivalDate) ? 'text-gray-400' : 'text-gray-500'}`}>
                  {toMD(sku.arrivalDate) || <span className="text-gray-300">–</span>}
                </td>
                <td className={`px-3 py-2 text-center whitespace-nowrap tabular-nums ${isPast(sku.shootingDate) ? 'text-gray-400' : 'text-gray-500'}`}>
                  {toMD(sku.shootingDate) || <span className="text-gray-300">–</span>}
                </td>
                {/* 기본 오픈일 */}
                <td className="px-3 py-2 text-center whitespace-nowrap tabular-nums text-gray-500">
                  {toMD(sku.releaseDate) || <span className="text-gray-300">–</span>}
                </td>
                {/* 오픈일정 확정 */}
                <td className="px-2 py-1.5 text-center whitespace-nowrap">
                  {canConfirm ? (
                    <button
                      onClick={() => setScheduleConfirmed(sku.id, !isProjectionLocked)}
                      title={isProjectionLocked ? '클릭하여 확정 해제' : '클릭하여 오픈일정 확정'}
                      className={`px-2 py-0.5 text-[10px] font-semibold rounded border transition-colors whitespace-nowrap ${
                        isProjectionLocked
                          ? 'bg-indigo-100 text-indigo-700 border-indigo-300 hover:bg-indigo-200'
                          : 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200 hover:text-gray-600'
                      }`}
                    >
                      {isProjectionLocked ? '✓ 확정' : '미확정'}
                    </button>
                  ) : (
                    isProjectionLocked ? (
                      <span className="px-2 py-0.5 text-[10px] font-semibold rounded border bg-indigo-100 text-indigo-700 border-indigo-300 whitespace-nowrap">
                        ✓ 확정
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-[10px] font-semibold rounded border bg-gray-100 text-gray-400 border-gray-200 whitespace-nowrap">
                        미확정
                      </span>
                    )
                  )}
                </td>
                {/* 선오픈 여부 */}
                <td className="px-3 py-2 text-center whitespace-nowrap">
                  {(() => {
                    const status = getPreOpenStatus(sku, getVal);
                    if (status === 'none') return <span className="text-gray-300">–</span>;
                    if (status === 'simultaneous') {
                      return (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border bg-gray-100 text-gray-600 border-gray-200">
                          동시오픈
                        </span>
                      );
                    }
                    if (status === 'kitta-first') {
                      return (
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${SCHEDULE_CH_CLS['기타']}`}>
                          기타
                        </span>
                      );
                    }
                    return (
                      <span className="inline-flex items-center gap-1">
                        {status.map(({ channel }) => (
                          <span
                            key={channel}
                            className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${SCHEDULE_CH_CLS[channel]}`}
                          >
                            {channel}
                          </span>
                        ))}
                      </span>
                    );
                  })()}
                </td>
                {/* 채널 날짜 셀: 플랫폼, 스스, 위탁, B2B, 글로벌 */}
                {(['플랫폼', '스스', '위탁', 'B2B', '글로벌'] as const).map((ch) => (
                  <td key={ch} className="px-2 py-1.5 text-center whitespace-nowrap">
                    <ScheduleDateCell
                      sku={sku} channel={ch} canEdit={rowCanEdit}
                      getVal={getVal}
                      onOpenCal={(e) => openCal(sku, ch, e)}
                      onReset={() => saveDate(sku.id, ch, null)}
                    />
                  </td>
                ))}
                {/* 기타 채널: 라벨(절반) + 날짜(나란히), 전체 가운데정렬 */}
                <td className="px-2 py-1.5 whitespace-nowrap text-center">
                  <div className="flex items-center justify-center gap-1">
                    {rowCanEdit ? (
                      <input
                        type="text"
                        value={sku.channelOpenSchedule?.기타Label ?? ''}
                        onChange={(e) => updateSku(sku.id, { channelOpenSchedule: { ...sku.channelOpenSchedule, 기타Label: e.target.value } })}
                        onBlur={() => saveLabelOnly(sku.id, sku.channelOpenSchedule?.기타Label ?? '')}
                        placeholder="채널명"
                        className="w-[60px] text-[11px] px-1.5 py-0.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-300 text-gray-700 placeholder:text-gray-300"
                      />
                    ) : (
                      <span className="w-[60px] text-[11px] text-gray-500 px-1 truncate">{sku.channelOpenSchedule?.기타Label || <span className="text-gray-300">채널명</span>}</span>
                    )}
                    <ScheduleDateCell
                      sku={sku} channel="기타" canEdit={rowCanEdit}
                      getVal={getVal}
                      onOpenCal={(e) => openCal(sku, '기타', e)}
                      onReset={() => saveDate(sku.id, '기타', null)}
                    />
                  </div>
                </td>
                {/* 메모 */}
                <td className="px-2 py-1.5 align-top">
                  <ScheduleMemoCell sku={sku} canEdit={rowCanEdit} />
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ScheduleDateCell({
  sku, channel, canEdit, getVal, onOpenCal, onReset,
}: {
  sku: SkuData;
  channel: ScheduleChannel;
  canEdit: boolean;
  getVal: (sku: SkuData, ch: ScheduleChannel) => string | null | undefined;
  onOpenCal: (e: React.MouseEvent) => void;
  onReset: () => void;
}) {
  const val = getVal(sku, channel);
  const isDefault = val === null || val === undefined;
  const isNone = val === NONE;
  const displayText = isDefault ? toMD(sku.releaseDate) : toMD(val);

  // 미판매 상태
  if (isNone) {
    return (
      <div className="flex items-center gap-0.5 justify-center group">
        <button
          onClick={canEdit ? onOpenCal : undefined}
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-400 border border-gray-200 ${canEdit ? 'cursor-pointer hover:bg-indigo-50 hover:text-indigo-400 hover:border-indigo-200 transition-colors' : 'cursor-default'}`}
          title={canEdit ? '클릭하여 날짜 변경' : undefined}
        >
          미판매
        </button>
        {canEdit && (
          <button
            onClick={onReset}
            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-rose-400 transition-all text-[10px] leading-none"
            title="기본값(오픈일)으로 초기화"
          >
            ×
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5 justify-center group">
      <button
        onClick={canEdit ? onOpenCal : undefined}
        className={`tabular-nums text-[12px] transition-colors ${
          isDefault ? 'text-gray-400' : 'text-gray-700 font-medium'
        } ${canEdit ? 'hover:text-indigo-600 hover:underline underline-offset-2 decoration-dashed cursor-pointer' : 'cursor-default'}`}
        title={canEdit ? '클릭하여 날짜 변경' : undefined}
      >
        {displayText || <span className="text-gray-300">–</span>}
      </button>
      {canEdit && !isDefault && (
        <button
          onClick={onReset}
          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-rose-400 transition-all text-[10px] leading-none"
          title="기본값(오픈일)으로 초기화"
        >
          ×
        </button>
      )}
    </div>
  );
}

function ScheduleMemoCell({ sku, canEdit }: { sku: SkuData; canEdit: boolean }) {
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = sku.channelOpenSchedule?.memo ?? '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sku.id]);

  function handleBlur() {
    if (!ref.current) return;
    const html = ref.current.innerHTML;
    updateSku(sku.id, { channelOpenSchedule: { ...sku.channelOpenSchedule, memo: html } });
    persistSku(sku.id);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') { e.preventDefault(); document.execCommand('bold'); }
      if (e.key === 'i') { e.preventDefault(); document.execCommand('italic'); }
    }
  }

  return (
    <div
      ref={ref}
      contentEditable={canEdit}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={`min-w-[200px] min-h-[28px] text-[12px] text-gray-700 px-2 py-1 rounded transition-colors ${
        canEdit ? 'hover:bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300' : ''
      }`}
      suppressContentEditableWarning
    />
  );
}

// ── 갤러리 카드 ──────────────────────────────────────────────────────────────
function SkuGalleryCard({ sku, onClick }: { sku: SkuData; onClick: () => void }) {
  const releaseLabel = sku.releaseDate
    ? sku.releaseDate.slice(5).replace('-', '/')
    : null;

  return (
    <button
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-indigo-300 transition-all text-left group w-full"
    >
      <div className="aspect-square w-full bg-gray-100 overflow-hidden relative">
        {sku.imageUrl ? (
          <img
            src={sku.imageUrl}
            alt={sku.skuName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {/* 발주 확정 오버레이 */}
        {sku.finalOrderConfirmedAt && (
          <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-600 text-white shadow">
            발주확정
          </span>
        )}
      </div>
      <div className="p-2.5 space-y-1">
        <p className="text-xs font-semibold text-gray-800 truncate leading-tight">
          {sku.skuName || <span className="text-gray-300">(미입력)</span>}
        </p>
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] text-gray-500">
            {sku.price > 0 ? `₩${sku.price.toLocaleString()}` : <span className="text-gray-300">–</span>}
          </span>
          <span className="text-[11px] text-gray-400 tabular-nums">
            {releaseLabel ?? <span className="text-gray-300">–</span>}
          </span>
        </div>
        {/* 채널 확정 배지 */}
        <div className="flex items-center gap-1 flex-wrap">
          {sku.step2PlatformConfirmed && (
            <span className="text-[9px] px-1 py-0.5 rounded font-semibold bg-emerald-100 text-emerald-700">플랫폼</span>
          )}
          {sku.step2BrandConfirmed && (
            <span className="text-[9px] px-1 py-0.5 rounded font-semibold bg-amber-100 text-amber-700">브랜드</span>
          )}
          {sku.step2GlobalConfirmed && (
            <span className="text-[9px] px-1 py-0.5 rounded font-semibold bg-sky-100 text-sky-700">글로벌</span>
          )}
        </div>
      </div>
    </button>
  );
}

