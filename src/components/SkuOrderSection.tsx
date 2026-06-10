import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { useAuth } from '../store/auth';
import { SkuCard } from './SkuCard';
import { exportBulkOrderXlsx } from '../utils/exportXlsx';
import type { SkuData } from '../types';

type ViewMode = 'list' | 'gallery';

export function SkuOrderSection() {
  const skus = useStore((s) => s.skus);
  const activeCategory = useStore((s) => s.activeCategory);
  const activeBrand = useStore((s) => s.activeBrand);
  const addSku = useStore((s) => s.addSku);

  const { role } = useAuth();
  const canEdit = role === 'master' || role === 'pm';
  const [searchQuery, setSearchQuery] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 뷰 모드: 목록 / 갤러리 (localStorage에 유지)
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem('sku-view-mode') as ViewMode) ?? 'list',
  );
  // 갤러리 모달에서 열려있는 SKU id
  const [gallerySkuId, setGallerySkuId] = useState<string | null>(null);

  function switchView(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem('sku-view-mode', mode);
  }

  function openModal(skuId: string) {
    setGallerySkuId(skuId);
  }

  function closeModal() {
    setGallerySkuId(null);
  }

  // Esc 키로 모달 닫기
  useEffect(() => {
    if (!gallerySkuId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeModal();
    }
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

  function toggleAll() {
    if (selectedIds.size === filteredSkus.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSkus.map((s) => s.id)));
    }
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
    .sort((a, b) => {
      if (!a.releaseDate && !b.releaseDate) return 0;
      if (!a.releaseDate) return 1;
      if (!b.releaseDate) return -1;
      return a.releaseDate.localeCompare(b.releaseDate);
    });

  const displaySkus = searchQuery.trim()
    ? filteredSkus.filter((s) => s.name.includes(searchQuery.trim()))
    : filteredSkus;

  const isAtMax = categorySkus.length >= 15;
  const gallerySelectedSku = gallerySkuId ? skus.find((s) => s.id === gallerySkuId) ?? null : null;

  return (
    <section className="p-4 space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-700 flex-shrink-0">
          SKU 발주 입력
          <span className="ml-2 text-gray-400 font-normal">
            {filteredSkus.length}{activeBrand !== '전체' ? ` (전체 ${categorySkus.length})` : ''} / 15
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
                          {sku.name || <span className="text-gray-300">(SKU명 미입력)</span>}
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

          {/* SKU 검색 */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="SKU명 검색"
              className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 w-32 sm:w-44"
            />
            <svg
              className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 text-sm leading-none"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 본문 */}
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
              "{searchQuery}"와 일치하는 SKU가 없습니다.
            </div>
          ) : viewMode === 'gallery' ? (
            /* ── 갤러리 뷰 ── */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {displaySkus.map((sku) => (
                <SkuGalleryCard key={sku.id} sku={sku} onClick={() => openModal(sku.id)} />
              ))}
            </div>
          ) : (
            /* ── 목록 뷰 ── */
            <div className="space-y-2">
              {displaySkus.map((sku) => (
                <SkuCard
                  key={sku.id}
                  sku={searchQuery.trim() ? { ...sku, isExpanded: true } : sku}
                />
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
              {isAtMax ? '최대 15개 도달' : '+ SKU 추가'}
            </button>
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
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0 bg-white sticky top-0 rounded-t-2xl sm:rounded-t-2xl">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-800 truncate">
                  {gallerySelectedSku.name || '(SKU명 미입력)'}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
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
            {/* SKU 카드 (항상 펼침) */}
            <div className="overflow-y-auto">
              <SkuCard sku={{ ...gallerySelectedSku, isExpanded: true }} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ── 갤러리 카드 ──────────────────────────────────────────────────────────────
function SkuGalleryCard({ sku, onClick }: { sku: SkuData; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-indigo-300 transition-all text-left group w-full"
    >
      {/* 썸네일 */}
      <div className="aspect-square w-full bg-gray-100 overflow-hidden">
        {sku.imageUrl ? (
          <img
            src={sku.imageUrl}
            alt={sku.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>
      {/* 정보 */}
      <div className="p-2.5 space-y-0.5">
        <p className="text-xs font-semibold text-gray-800 truncate leading-tight">
          {sku.name || <span className="text-gray-300">(미입력)</span>}
        </p>
        <p className="text-[11px] text-gray-500">
          {sku.price > 0 ? `₩${sku.price.toLocaleString()}` : <span className="text-gray-300">–</span>}
        </p>
        <p className="text-[11px] text-gray-400">
          {sku.totalOrderQty > 0 ? sku.totalOrderQty.toLocaleString() : <span className="text-gray-300">–</span>}
        </p>
      </div>
    </button>
  );
}
