import { useState } from 'react';
import { useStore } from '../store';
import { useAuth } from '../store/auth';
import { SkuCard } from './SkuCard';

export function SkuOrderSection() {
  const skus = useStore((s) => s.skus);
  const activeCategory = useStore((s) => s.activeCategory);
  const activeBrand = useStore((s) => s.activeBrand);
  const addSku = useStore((s) => s.addSku);

  const { role } = useAuth();
  const canEdit = role === 'master' || role === 'pm';
  const [searchQuery, setSearchQuery] = useState('');

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

  return (
    <section className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-700 flex-shrink-0">
          SKU 발주 입력
          <span className="ml-2 text-gray-400 font-normal">
            {filteredSkus.length}{activeBrand !== '전체' ? ` (전체 ${categorySkus.length})` : ''} / 15
          </span>
        </h2>
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="SKU명 검색"
            className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 w-44"
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

      {filteredSkus.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-sm mb-3">
            [{activeCategory}] 카테고리에 등록된 SKU가 없습니다.
          </p>
          {canEdit && (
            <button
              onClick={addSku}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
            >
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
          ) : (
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
    </section>
  );
}
