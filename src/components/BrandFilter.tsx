import { useStore } from '../store';
import { BRANDS, type Brand, type Category } from '../types';

interface Props {
  categoryFilter?: Category | '전체';
}

export function BrandFilter({ categoryFilter }: Props = {}) {
  const skus = useStore((s) => s.skus);
  const activeCategory = useStore((s) => s.activeCategory);
  const activeBrand = useStore((s) => s.activeBrand);
  const setActiveBrand = useStore((s) => s.setActiveBrand);

  const filterCat = categoryFilter ?? activeCategory;
  const categorySkus = filterCat === '전체' ? skus : skus.filter((s) => s.category === filterCat);
  const presentBrands = BRANDS.filter((b) => categorySkus.some((s) => s.brand === b));

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
