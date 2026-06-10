import { useState } from 'react';
import type { Category, SkuData } from '../types';
import { useStore } from '../store';
import { useAuth } from '../store/auth';
import { NumericInput } from './NumericInput';

type SortKey = 'name' | 'price';
type SortDir = 'asc' | 'desc';
type EditField = 'price' | 'cost' | 'regularPrice';

interface EditingCell {
  skuId: string;
  field: EditField;
  originalValue: number;
}

interface Props {
  pricingCategory: Category | '전체';
}

export function PricingListSection({ pricingCategory }: Props) {
  const skus = useStore((s) => s.skus);
  const activeBrand = useStore((s) => s.activeBrand);
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);
  const { role } = useAuth();
  const canEdit = role === 'master' || role === 'pm';

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

  const filtered = skus
    .filter((s) => pricingCategory === '전체' || s.category === pricingCategory)
    .filter((s) => activeBrand === '전체' || s.brand === activeBrand);

  const sorted = [...filtered].sort((a, b) => {
    if (!sortKey) return 0;
    const cmp =
      sortKey === 'name'
        ? a.name.localeCompare(b.name, 'ko')
        : a.price - b.price;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function handleSortClick(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function startEdit(skuId: string, field: EditField, originalValue: number) {
    if (!canEdit) return;
    setEditingCell({ skuId, field, originalValue });
  }

  function commitEdit(skuId: string) {
    persistSku(skuId);
    setEditingCell(null);
  }

  function cancelEdit(skuId: string, field: EditField, originalValue: number) {
    updateSku(skuId, { [field]: originalValue });
    setEditingCell(null);
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-gray-300 ml-0.5">↕</span>;
    return <span className="text-indigo-500 ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  function discountRate(sku: SkuData) {
    if (!sku.regularPrice || !sku.price) return null;
    return Math.round((1 - sku.price / sku.regularPrice) * 100);
  }

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <span className="text-sm">등록된 SKU가 없습니다</span>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">카테고리</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">브랜드</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500">
                <button
                  onClick={() => handleSortClick('name')}
                  className="flex items-center hover:text-indigo-600 transition-colors whitespace-nowrap"
                >
                  SKU명 <SortIcon k="name" />
                </button>
              </th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">원가 (₩)</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">
                <button
                  onClick={() => handleSortClick('price')}
                  className="flex items-center ml-auto hover:text-indigo-600 transition-colors whitespace-nowrap"
                >
                  판매가 (₩) <SortIcon k="price" />
                </button>
              </th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">정가 (₩)</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">상시할인율</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">원가율</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((sku) => {
              const dr = discountRate(sku);
              return (
                <tr key={sku.id} className="hover:bg-gray-50/60 transition-colors">
                  {/* 카테고리 */}
                  <td className="px-3 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                      {sku.category}
                    </span>
                  </td>
                  {/* 브랜드 */}
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      sku.brand === 'SSFW'
                        ? 'bg-sky-50 text-sky-700'
                        : sku.brand === '바잇미'
                          ? 'bg-violet-50 text-violet-700'
                          : 'bg-gray-100 text-gray-600'
                    }`}>
                      {sku.brand}
                    </span>
                  </td>
                  {/* SKU명 */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {sku.name || <span className="text-gray-300 italic font-normal">미입력</span>}
                      </span>
                      {sku.isConfirmed && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 flex-shrink-0">
                          확정
                        </span>
                      )}
                    </div>
                  </td>
                  {/* 원가 */}
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <PriceCell
                      sku={sku}
                      field="cost"
                      editingCell={editingCell}
                      canEdit={canEdit}
                      onStartEdit={startEdit}
                      onCommit={commitEdit}
                      onCancel={cancelEdit}
                      onUpdate={(v) => updateSku(sku.id, { cost: v })}
                    />
                  </td>
                  {/* 판매가 */}
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <PriceCell
                      sku={sku}
                      field="price"
                      editingCell={editingCell}
                      canEdit={canEdit}
                      onStartEdit={startEdit}
                      onCommit={commitEdit}
                      onCancel={cancelEdit}
                      onUpdate={(v) => updateSku(sku.id, { price: v })}
                    />
                  </td>
                  {/* 정가 */}
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <PriceCell
                      sku={sku}
                      field="regularPrice"
                      editingCell={editingCell}
                      canEdit={canEdit}
                      onStartEdit={startEdit}
                      onCommit={commitEdit}
                      onCancel={cancelEdit}
                      onUpdate={(v) => updateSku(sku.id, { regularPrice: v })}
                    />
                  </td>
                  {/* 상시할인율 */}
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    {dr !== null ? (
                      <span className={`font-medium tabular-nums ${dr > 0 ? 'text-rose-600' : 'text-gray-500'}`}>
                        {dr}%
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  {/* 원가율 */}
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    {sku.cost > 0 && sku.price > 0 ? (
                      <span className="font-medium tabular-nums text-gray-700">
                        {Math.round((sku.cost / sku.price) * 1000) / 10}%
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-right text-xs text-gray-400">{sorted.length}개 SKU</p>
    </div>
  );
}

interface PriceCellProps {
  sku: SkuData;
  field: EditField;
  editingCell: EditingCell | null;
  canEdit: boolean;
  onStartEdit: (skuId: string, field: EditField, originalValue: number) => void;
  onCommit: (skuId: string) => void;
  onCancel: (skuId: string, field: EditField, originalValue: number) => void;
  onUpdate: (v: number) => void;
}

function PriceCell({ sku, field, editingCell, canEdit, onStartEdit, onCommit, onCancel, onUpdate }: PriceCellProps) {
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
        className="w-28 px-2 py-1 text-sm text-right border border-indigo-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
      />
    );
  }

  return (
    <span
      onClick={() => canEdit && onStartEdit(sku.id, field, value)}
      className={`tabular-nums ${
        canEdit ? 'cursor-pointer hover:text-indigo-600 hover:underline decoration-dashed underline-offset-2' : ''
      } ${value === 0 ? 'text-gray-300' : 'text-gray-800'}`}
    >
      {value === 0 ? '—' : `₩${value.toLocaleString()}`}
    </span>
  );
}
