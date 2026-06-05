import { useStore } from '../store';
import { useRef, useEffect, type KeyboardEvent } from 'react';
import type { SkuData, ComparisonSku } from '../types';
import { GrowthIndicator } from './GrowthIndicator';
import { NumericInput } from './NumericInput';
import { revenueMultiplier, calcDynamicMultiplier } from '../utils/calc';

interface Props {
  sku: SkuData;
  readOnly?: boolean;
}

export function ComparisonColumn({ sku, readOnly }: Props) {
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);

  const inputCls = `w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed`;

  function handleChange(patch: Partial<ComparisonSku>) {
    if (readOnly) return;
    updateSku(sku.id, {
      comparisonSku: { ...sku.comparisonSku, ...patch },
    });
  }

  function handleBlur() {
    if (readOnly) return;
    persistSku(sku.id);
  }

  const monthlyTarget =
    sku.targetSellThroughMonths > 0
      ? Math.round(sku.totalOrderQty / sku.targetSellThroughMonths)
      : 0;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        기존 대응 SKU 비교
      </h3>

      <div>
        <label className="block text-xs text-gray-500 mb-1">기존 SKU명</label>
        <input
          type="text"
          value={sku.comparisonSku.name}
          onChange={(e) => handleChange({ name: e.target.value })}
          onBlur={handleBlur}
          disabled={readOnly}
          placeholder="기존 SKU명"
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">기존 판매가 (₩)</label>
          <NumericInput
            value={sku.comparisonSku.price}
            onChange={(v) => handleChange({ price: v })}
            onBlur={handleBlur}
            disabled={readOnly}
            placeholder="0"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">기존 원가 (₩)</label>
          <NumericInput
            value={sku.comparisonSku.cost}
            onChange={(v) => handleChange({ cost: v })}
            onBlur={handleBlur}
            disabled={readOnly}
            placeholder="0"
            className={inputCls}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">기존 월 출고량 (장)</label>
          <NumericInput
            value={sku.comparisonSku.monthlyShipment}
            onChange={(v) => handleChange({ monthlyShipment: v })}
            onBlur={handleBlur}
            disabled={readOnly}
            placeholder="0"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">기존 연간 총출고량 (장)</label>
          <NumericInput
            value={sku.comparisonSku.annualShipment}
            onChange={(v) => handleChange({ annualShipment: v })}
            onBlur={handleBlur}
            disabled={readOnly}
            placeholder="0"
            className={inputCls}
          />
        </div>
      </div>

      {/* 증감률 인디케이터 */}
      <GrowthIndicator
        newPrice={sku.price}
        oldPrice={sku.comparisonSku.price}
        newMonthlyQty={monthlyTarget}
        oldMonthlyQty={sku.comparisonSku.monthlyShipment}
        newAnnualQty={sku.totalOrderQty}
        oldAnnualQty={sku.comparisonSku.annualShipment}
      />

      {/* 스코어카드 요약 */}
      {(() => {
        const m = calcDynamicMultiplier(sku.channelRatios) ?? revenueMultiplier(sku.category);
        const rev = Math.round(sku.totalOrderQty * sku.price * m);
        const profit = Math.round(rev * sku.contributionMarginRate / 100);
        return (
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-2">
              <ScoreCard
                label="예상 매출"
                value={sku.totalOrderQty > 0 && sku.price > 0 ? `₩${rev.toLocaleString()}` : '–'}
                sub=""
              />
              <ScoreCard
                label="공헌이익"
                value={sku.totalOrderQty > 0 && sku.price > 0 ? `₩${profit.toLocaleString()}` : '–'}
                sub={`이익률 ${sku.contributionMarginRate}%`}
              />
            </div>
            <p className="text-[10px] text-gray-400 px-0.5">* 하단 채널 비중 변경 시 자동반영</p>
          </div>
        );
      })()}

      {/* 메모 */}
      <MemoBox
        skuId={sku.id}
        memo={sku.memo}
        readOnly={readOnly}
        onSave={(html) => { if (!readOnly) { updateSku(sku.id, { memo: html }); persistSku(sku.id); } }}
      />
    </div>
  );
}

// ── 메모 박스 ────────────────────────────────────────────────────────────
function MemoBox({
  skuId,
  memo,
  readOnly,
  onSave,
}: {
  skuId: string;
  memo: string;
  readOnly?: boolean;
  onSave: (html: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);

  // SKU가 바뀔 때(또는 최초 마운트) 저장된 내용으로 초기화
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = memo ?? '';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skuId]);

  function applyBold() {
    editorRef.current?.focus();
    document.execCommand('bold');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      document.execCommand('bold');
    }
  }

  function handleBlur() {
    onSave(editorRef.current?.innerHTML ?? '');
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-500">메모</label>
        {!readOnly && (
          <button
            onMouseDown={(e) => { e.preventDefault(); applyBold(); }}
            title="볼드 (Ctrl+B)"
            className="text-xs px-2 py-0.5 border border-gray-200 rounded font-bold text-gray-600 hover:bg-gray-100 hover:border-gray-300 transition-colors leading-5"
          >
            B
          </button>
        )}
      </div>
      <div
        ref={editorRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onBlur={readOnly ? undefined : handleBlur}
        onKeyDown={readOnly ? undefined : handleKeyDown}
        className={`w-full min-h-[90px] px-3 py-2.5 text-sm text-gray-700 leading-relaxed border border-gray-200 rounded-lg resize-none overflow-y-auto break-words ${
          readOnly ? 'bg-gray-50 cursor-not-allowed' : 'focus:outline-none focus:ring-2 focus:ring-indigo-400'
        }`}
        style={{ wordBreak: 'break-word' }}
        data-placeholder="메모를 입력하세요..."
      />
      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #d1d5db;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}

function ScoreCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="p-2.5 rounded-lg border border-indigo-100 bg-indigo-50 text-center">
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className="text-sm font-bold text-indigo-700 break-all">{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
    </div>
  );
}
