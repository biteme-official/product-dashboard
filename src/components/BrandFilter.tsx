import { useEffect } from 'react';
import { useStore } from '../store';
import { useVisibleSkus } from '../hooks/useVisibleSkus';
import { BRANDS, type Brand, type Category } from '../types';

interface Props {
  categoryFilter?: Category | '전체';
}

export function BrandFilter({ categoryFilter }: Props = {}) {
  const skus = useVisibleSkus();
  const activeCategory = useStore((s) => s.activeCategory);
  const activeBrand = useStore((s) => s.activeBrand);
  const setActiveBrand = useStore((s) => s.setActiveBrand);

  const filterCat = categoryFilter ?? activeCategory;
  const categorySkus = filterCat === '전체' ? skus : skus.filter((s) => s.category === filterCat);
  const presentBrands = BRANDS.filter((b) => categorySkus.some((s) => s.brand === b));

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
    </div>
  );
}
