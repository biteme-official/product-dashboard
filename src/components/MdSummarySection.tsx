import { useState, useRef, useEffect } from 'react';
import type { Channel } from '../types';
import { CHANNELS } from '../types';
import { useStore } from '../store';
import { MdSummaryOverview } from './MdSummaryOverview';
import { MdChannelDetail } from './MdChannelDetail';

type TabId = '전체 요약' | Channel;
const TABS: TabId[] = ['전체 요약', ...CHANNELS];

export function MdSummarySection() {
  const [activeTab, setActiveTab] = useState<TabId>('전체 요약');
  const [selectedSkuIds, setSelectedSkuIds] = useState<Set<string> | null>(null); // null = 전체
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { skus, activeCategory, activeBrand } = useStore();

  const categoryFiltered = skus.filter((s) => {
    if (s.category !== activeCategory) return false;
    if (activeBrand !== '전체' && s.brand !== activeBrand) return false;
    return true;
  });

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // 카테고리/브랜드 필터 변경 시 SKU 선택 초기화
  useEffect(() => {
    setSelectedSkuIds(null);
  }, [activeCategory, activeBrand]);

  const visibleSkus = categoryFiltered.filter((s) =>
    searchQuery === '' || s.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const filtered = selectedSkuIds === null
    ? categoryFiltered
    : categoryFiltered.filter((s) => selectedSkuIds.has(s.id));

  const allSelected = selectedSkuIds === null || selectedSkuIds.size === categoryFiltered.length;
  const selectedCount = selectedSkuIds === null ? categoryFiltered.length : selectedSkuIds.size;

  function toggleAll() {
    setSelectedSkuIds(null);
  }

  function toggleSku(id: string) {
    if (selectedSkuIds === null) {
      // 전체 선택 상태에서 하나 해제 → 나머지 전부 선택
      const next = new Set(categoryFiltered.map((s) => s.id));
      next.delete(id);
      setSelectedSkuIds(next.size === categoryFiltered.length ? null : next);
    } else {
      const next = new Set(selectedSkuIds);
      if (next.has(id)) {
        next.delete(id);
        setSelectedSkuIds(next.size === 0 ? null : next);
      } else {
        next.add(id);
        setSelectedSkuIds(next.size === categoryFiltered.length ? null : next);
      }
    }
  }

  function isSkuSelected(id: string) {
    return selectedSkuIds === null || selectedSkuIds.has(id);
  }

  return (
    <div className="space-y-3">
      {/* 채널 탭 바 */}
      <div className="flex gap-1 flex-wrap bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === tab
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
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
            {allSelected
              ? `SKU 전체 (${categoryFiltered.length})`
              : `SKU ${selectedCount}개 선택`}
          </span>
          <svg className={`w-3 h-3 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {dropdownOpen && (
          <div className="absolute z-30 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            {/* 검색 */}
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

            {/* 전체 선택 */}
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

            {/* SKU 목록 */}
            <div className="max-h-56 overflow-y-auto px-2 py-1.5">
              {visibleSkus.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">검색 결과 없음</p>
              ) : (
                visibleSkus.map((sku) => (
                  <label key={sku.id} className="flex items-center gap-2 px-1 py-1 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSkuSelected(sku.id)}
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
        <MdSummaryOverview skus={filtered} />
      ) : (
        <MdChannelDetail skus={filtered} channel={activeTab as Channel} />
      )}
    </div>
  );
}
