import { useEffect } from 'react';
import { useStore } from '../store';
import { useVisibleSkus } from '../hooks/useVisibleSkus';
import { BRANDS, type Brand, type Category } from '../types';

interface Props {
  categoryFilter?: Category | '전체';
  /** SKU 리스트 탭 전용 옵션: '그외' 브랜드 항상 노출 + 오픈/완료 제외 필터 표시 */
  pmFilters?: boolean;
}

export function BrandFilter({ categoryFilter, pmFilters = false }: Props = {}) {
  const skus = useVisibleSkus();
  const activeCategory = useStore((s) => s.activeCategory);
  const activeBrand = useStore((s) => s.activeBrand);
  const setActiveBrand = useStore((s) => s.setActiveBrand);
  const excludeOpenCompletePm = useStore((s) => s.excludeOpenCompletePm);
  const setExcludeOpenCompletePm = useStore((s) => s.setExcludeOpenCompletePm);

  const filterCat = categoryFilter ?? activeCategory;
  const categorySkus = filterCat === '전체' ? skus : skus.filter((s) => s.category === filterCat);
  const presentBrands = BRANDS.filter(
    (b) => (pmFilters && b === '그외') || categorySkus.some((s) => s.brand === b),
  );

  // 카테고리 변경 시 현재 선택된 브랜드가 새 카테고리에 없으면 전체로 초기화
  useEffect(() => {
    if (activeBrand !== '전체' && !presentBrands.includes(activeBrand as Brand)) {
      setActiveBrand('전체');
    }
  // filterCat 변경(카테고리 전환)마다 실행
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCat]);

  if (presentBrands.length < 2) return null;

  const buttons: (Brand | '전체')[] = ['전체', ...presentBrands];

  return (
    <div className="px-4 py-2 bg-white border-b border-gray-100 flex items-center gap-2">
      <span className="text-xs text-gray-400 flex-shrink-0">브랜드</span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {buttons.map((brand) => (
          <button
            key={brand}
            onClick={() => setActiveBrand(brand)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors font-medium ${
              activeBrand === brand
                ? 'bg-violet-600 text-white border-violet-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300 hover:text-violet-600'
            }`}
          >
            {brand}
          </button>
        ))}
      </div>
      {pmFilters && (
        <>
          <div className="w-px h-4 bg-gray-200 flex-shrink-0" />
          <button
            onClick={() => setExcludeOpenCompletePm(!excludeOpenCompletePm)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors font-medium flex-shrink-0 ${
              excludeOpenCompletePm
                ? 'bg-rose-50 text-rose-600 border-rose-200'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}
          >
            오픈/완료 제외
          </button>
        </>
      )}
    </div>
  );
}
