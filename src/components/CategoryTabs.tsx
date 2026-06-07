import { CATEGORIES } from '../types';
import { useStore } from '../store';

export function CategoryTabs() {
  const activeCategory = useStore((s) => s.activeCategory);
  const setActiveCategory = useStore((s) => s.setActiveCategory);
  const skus = useStore((s) => s.skus);

  return (
    <div className="flex gap-1 p-3 bg-white border-b border-gray-200 overflow-x-auto scrollbar-none">
      {CATEGORIES.map((cat) => {
        const count = skus.filter((s) => s.category === cat).length;
        const isActive = cat === activeCategory;
        return (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex-shrink-0 ${
              isActive
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat}
            <span
              className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-indigo-500 text-white' : 'bg-gray-300 text-gray-600'
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
