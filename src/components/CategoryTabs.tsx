import { CATEGORIES, type Category } from '../types';
import { useStore } from '../store';

type UncontrolledProps = { showAll?: false; value?: never; onChange?: never };
type ControlledProps = { showAll: true; value: Category | '전체'; onChange: (c: Category | '전체') => void };
type Props = UncontrolledProps | ControlledProps;

export function CategoryTabs({ showAll, value, onChange }: Props = {}) {
  const activeCategory = useStore((s) => s.activeCategory);
  const setActiveCategory = useStore((s) => s.setActiveCategory);
  const skus = useStore((s) => s.skus);

  const isControlled = showAll === true;
  const currentValue = isControlled ? value : activeCategory;
  const tabs: (Category | '전체')[] = showAll ? ['전체', ...CATEGORIES] : CATEGORIES;

  function handleClick(cat: Category | '전체') {
    if (isControlled) {
      onChange(cat);
    } else {
      setActiveCategory(cat as Category);
    }
  }

  return (
    <div className="flex gap-1 p-3 bg-white border-b border-gray-200 overflow-x-auto scrollbar-none">
      {tabs.map((cat) => {
        const count = cat === '전체'
          ? skus.length
          : skus.filter((s) => s.category === cat).length;
        const isActive = cat === currentValue;
        return (
          <button
            key={cat}
            onClick={() => handleClick(cat)}
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
