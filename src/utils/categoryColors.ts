// SKU 카테고리 배지 색상 — SkuOrderSection/SkuFilterBar 등 여러 컴포넌트에서 공유.
const CATEGORY_COLORS: Record<string, string> = {
  '의류': 'bg-violet-100 text-violet-700',
  '잡화': 'bg-amber-100 text-amber-700',
  '식품': 'bg-emerald-100 text-emerald-700',
  '장난감': 'bg-rose-100 text-rose-700',
  '용품': 'bg-sky-100 text-sky-700',
};

export function catCls(cat: string): string {
  return CATEGORY_COLORS[cat] ?? 'bg-gray-100 text-gray-600';
}
