import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../store';
import { useCpoSync } from '../store/cpoSync';
import type { SkuData } from '../types';
import { MAX_SIZES } from '../types';
import { buildSizesFromCount } from '../utils/calc';
import { NumericInput } from './NumericInput';

function CpoSyncedBadge() {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-600 border border-sky-200 font-medium whitespace-nowrap">
      CPO 연동
    </span>
  );
}

/**
 * SKU 카드 › 옵션 구성 — 사이즈 개수 · 컬러명 · MOQ만 수정. 수량과 비중은 발주량 검토에서 입력.
 * CPO 연동 SKU의 컬러명 · 사이즈 개수는 CPO가 원본이라 잠긴다.
 */
export function OptionConfigColumn({ sku, readOnly }: { sku: SkuData; readOnly?: boolean }) {
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);
  const cpoLinked = useCpoSync((s) => !!s.cpoProjects[sku.id]);
  const cpoSizeTotal = useCpoSync((s) => s.cpoProjects[sku.id]?.sizes?.length ?? 0);
  const activeSizes = sku.sizes.filter((s) => s.isActive);
  const handleBlur = () => { void persistSku(sku.id); };

  function toggleColors() {
    const next = !sku.hasColors;
    const colors = next && sku.colors.length === 0
      ? [{ id: uuidv4(), name: '', quantity: 0 }, { id: uuidv4(), name: '', quantity: 0 }]
      : sku.colors;
    updateSku(sku.id, { hasColors: next, colors });
    void persistSku(sku.id);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">옵션 구성</h3>
        <div className="flex items-center gap-1.5">
          {cpoLinked && <CpoSyncedBadge />}
          <div className={`flex rounded-lg border border-gray-200 overflow-hidden text-xs ${readOnly || cpoLinked ? 'opacity-50 pointer-events-none' : ''}`}>
            <button onClick={() => !readOnly && sku.hasColors && toggleColors()} className={`px-3 py-1 ${!sku.hasColors ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>단색</button>
            <button onClick={() => !readOnly && !sku.hasColors && toggleColors()} className={`px-3 py-1 ${sku.hasColors ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>컬러</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">사이즈 개수</label>
          <select value={sku.sizeCount}
            onChange={(e) => { const n = Number(e.target.value); updateSku(sku.id, { sizeCount: n, sizes: buildSizesFromCount(sku.sizes, n, sku.totalOrderQty) }); }}
            onBlur={handleBlur} disabled={readOnly || cpoLinked}
            className="w-full px-2 py-2 text-xs border border-gray-200 rounded-lg disabled:bg-gray-50 disabled:text-gray-500">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}개</option>)}
          </select>
          {cpoSizeTotal > MAX_SIZES && <p className="mt-1 text-[10px] text-amber-600">CPO 사이즈 {cpoSizeTotal}개 · 앞 {MAX_SIZES}개만 반영</p>}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">MOQ</label>
          <NumericInput value={sku.moq} onChange={(v) => updateSku(sku.id, { moq: v })} onBlur={handleBlur} disabled={readOnly} placeholder="0"
            className="w-full px-2 py-2 text-xs border border-gray-200 rounded-lg disabled:bg-gray-50 disabled:text-gray-500" />
        </div>
      </div>

      {activeSizes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {activeSizes.map((z) => <span key={z.label} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{z.label}</span>)}
        </div>
      )}

      {sku.hasColors && (
        <div className="space-y-1">
          <label className="block text-xs text-gray-500">컬러명</label>
          {sku.colors.map((color) => (
            <div key={color.id} className={`flex items-center gap-1.5 ${color.archived ? 'opacity-50' : ''}`}>
              <input type="text" value={color.archived ? `${color.name} (삭제됨)` : color.name}
                onChange={(e) => updateSku(sku.id, { colors: sku.colors.map((c) => (c.id === color.id ? { ...c, name: e.target.value } : c)) })}
                onBlur={handleBlur} disabled={readOnly || cpoLinked} placeholder="컬러명"
                className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-gray-200 rounded-lg disabled:bg-gray-50 disabled:text-gray-500" />
              {/* CPO 연동 SKU는 컬러 추가/삭제를 CPO에서만 함 — archived 항목만 정리 차원에서 영구삭제 허용 */}
              {!readOnly && (!cpoLinked || color.archived) && (
                <button title={color.archived ? '영구 삭제' : undefined}
                  onClick={() => { updateSku(sku.id, { colors: sku.colors.filter((c) => c.id !== color.id) }); void persistSku(sku.id); }}
                  className="text-lg leading-none text-gray-300 hover:text-red-400 flex-shrink-0">×</button>
              )}
            </div>
          ))}
          {!readOnly && !cpoLinked && (
            <button onClick={() => { updateSku(sku.id, { colors: [...sku.colors, { id: uuidv4(), name: '', quantity: 0 }] }); void persistSku(sku.id); }}
              className="w-full py-1.5 text-xs border border-dashed border-indigo-200 text-indigo-500 rounded-lg hover:bg-indigo-50">+ 컬러 추가</button>
          )}
        </div>
      )}
      <p className="text-[11px] text-gray-400">수량 · 비중은 발주량 검토에서 입력</p>
    </div>
  );
}
