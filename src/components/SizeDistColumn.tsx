import { v4 as uuidv4, } from 'uuid';
import { useState, useRef } from 'react';
import { useStore } from '../store';
import type { SkuData } from '../types';
import { buildSizesFromCount, recalcQuantities } from '../utils/calc';
import { exportSkuOrderXlsx, copySkuOrderToClipboard } from '../utils/exportXlsx';
import { NumericInput } from './NumericInput';

/** 복사 버튼: 누르면 TSV를 클립보드에 올리고 1.5초간 "복사됨!" 표시 */
function CopyButton({ sku }: { sku: SkuData }) {
  const [state, setState] = useState<'idle' | 'ok' | 'err'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleCopy() {
    if (state !== 'idle') return;
    try {
      await copySkuOrderToClipboard(sku);
      setState('ok');
    } catch {
      setState('err');
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState('idle'), 1800);
  }

  const label  = state === 'ok' ? '복사됨 ✓' : state === 'err' ? '실패' : '복사';
  const colors =
    state === 'ok'  ? 'text-indigo-600 border-indigo-200 bg-indigo-50' :
    state === 'err' ? 'text-red-500 border-red-200 bg-red-50' :
    'text-gray-500 border-gray-200 bg-gray-50 hover:bg-gray-100';

  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${colors}`}
    >
      {state === 'idle' && (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2M16 8h2a2 2 0 012 2v8a2 2 0 01-2 2h-8a2 2 0 01-2-2v-2" />
        </svg>
      )}
      {label}
    </button>
  );
}

interface Props {
  sku: SkuData;
  readOnly?: boolean;
}

export function SizeDistColumn({ sku, readOnly }: Props) {
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);

  const activeSizes = sku.sizes.filter((s) => s.isActive);
  const sumRatios = activeSizes.reduce((sum, s) => sum + s.ratio, 0);
  const ratioOk = sumRatios === 100;
  const monthlyTarget =
    sku.targetSellThroughMonths > 0
      ? Math.round(sku.totalOrderQty / sku.targetSellThroughMonths)
      : 0;
  const dailyTarget = Math.round(monthlyTarget / 30);

  function handleBlur() { persistSku(sku.id); }

  // ── 사이즈 개수 변경 ──
  function handleSizeCountChange(newCount: number) {
    const newSizes = buildSizesFromCount(sku.sizes, newCount, sku.totalOrderQty);
    updateSku(sku.id, { sizeCount: newCount, sizes: newSizes });
  }

  // ── 사이즈 비율 변경 ──
  function handleRatioChange(idx: number, val: number) {
    const newSizes = sku.sizes.map((s, i) => (i === idx ? { ...s, ratio: val } : s));
    updateSku(sku.id, { sizes: recalcQuantities(newSizes, sku.totalOrderQty) });
  }

  // ── 단색: 총 발주량 변경 ──
  function handleTotalQtyChange(val: number) {
    updateSku(sku.id, { totalOrderQty: val });
  }

  // ── 컬러 토글 ──
  function toggleColors() {
    const next = !sku.hasColors;
    const colors =
      next && sku.colors.length === 0
        ? [
            { id: uuidv4(), name: '', quantity: 0 },
            { id: uuidv4(), name: '', quantity: 0 },
          ]
        : sku.colors;
    updateSku(sku.id, { hasColors: next, colors });
    persistSku(sku.id);
  }

  // ── 컬러 핸들러 ──
  function handleColorChange(colorId: string, patch: { name?: string; quantity?: number }) {
    const newColors = sku.colors.map((c) => (c.id === colorId ? { ...c, ...patch } : c));
    updateSku(sku.id, { colors: newColors });
  }
  function addColor() {
    updateSku(sku.id, { colors: [...sku.colors, { id: uuidv4(), name: '', quantity: 0 }] });
  }
  function removeColor(colorId: string) {
    updateSku(sku.id, { colors: sku.colors.filter((c) => c.id !== colorId) });
  }

  return (
    <div className="space-y-3">
      {/* 헤더 + 컬러 토글 */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          발주량 &amp; 사이즈 분배
        </h3>
        <div className={`flex rounded-lg border border-gray-200 overflow-hidden text-xs ${readOnly ? 'opacity-50 pointer-events-none' : ''}`}>
          <button
            onClick={() => !readOnly && sku.hasColors && toggleColors()}
            className={`px-3 py-1 transition-colors ${
              !sku.hasColors ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            단색
          </button>
          <button
            onClick={() => !readOnly && !sku.hasColors && toggleColors()}
            className={`px-3 py-1 transition-colors ${
              sku.hasColors ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            컬러
          </button>
        </div>
      </div>

      {/* 사이즈 개수 / MOQ / 목표소진월수 */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">사이즈</label>
          <select
            value={sku.sizeCount}
            onChange={(e) => handleSizeCountChange(Number(e.target.value))}
            onBlur={handleBlur}
            disabled={readOnly}
            className="w-full px-2 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>{n}개</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">MOQ</label>
          {sku.hasColors ? (
            <div className="w-full px-2 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 text-gray-500 tabular-nums">
              {sku.totalOrderQty > 0 ? sku.totalOrderQty.toLocaleString() : <span className="text-gray-300">자동</span>}
            </div>
          ) : (
            <NumericInput
              value={sku.moq}
              onChange={(v) => updateSku(sku.id, { moq: v })}
              onBlur={handleBlur}
              disabled={readOnly}
              placeholder="0"
              className="w-full px-2 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
            />
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">소진월수</label>
          <NumericInput
            value={sku.targetSellThroughMonths}
            onChange={(v) => updateSku(sku.id, { targetSellThroughMonths: v })}
            onBlur={handleBlur}
            disabled={readOnly}
            allowDecimal
            placeholder="월"
            className="w-full px-2 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {/* ── 단색: 총 발주량 입력 ── */}
      {!sku.hasColors && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">총 발주량 (장)</label>
          <NumericInput
            value={sku.totalOrderQty}
            onChange={handleTotalQtyChange}
            onBlur={handleBlur}
            disabled={readOnly}
            placeholder="0"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          />
        </div>
      )}

      {/* ── 컬러 모드: 컬러별 수량 입력 ── */}
      {sku.hasColors && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500">컬러별 수량</label>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              sku.totalOrderQty > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-400'
            }`}>
              총 {sku.totalOrderQty.toLocaleString()}장
            </span>
          </div>
          <div className="space-y-1">
            {sku.colors.map((color) => {
              const pct = sku.totalOrderQty > 0 && color.quantity > 0
                ? Math.round((color.quantity / sku.totalOrderQty) * 100)
                : null;
              return (
                <div key={color.id} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={color.name}
                    onChange={(e) => handleColorChange(color.id, { name: e.target.value })}
                    onBlur={handleBlur}
                    disabled={readOnly}
                    placeholder="컬러명"
                    className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                  />
                  <NumericInput
                    value={color.quantity}
                    onChange={(v) => handleColorChange(color.id, { quantity: v })}
                    onBlur={handleBlur}
                    disabled={readOnly}
                    placeholder="수량"
                    className="w-20 px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 text-right disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                  />
                  <span className="w-9 text-right text-[11px] tabular-nums flex-shrink-0 text-indigo-400 font-medium">
                    {pct !== null ? `${pct}%` : ''}
                  </span>
                  {!readOnly && (
                    <button
                      onClick={() => removeColor(color.id)}
                      className="text-lg leading-none text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {!readOnly && (
            <button
              onClick={addColor}
              className="w-full py-1.5 text-xs border border-dashed border-indigo-200 text-indigo-500 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              + 컬러 추가
            </button>
          )}
        </div>
      )}

      {/* 사이즈별 비율 그리드 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-gray-500">사이즈별 비율</label>
          <div className="flex items-center gap-1.5">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              ratioOk
                ? 'bg-green-100 text-green-700'
                : sumRatios > 0
                ? 'bg-amber-100 text-amber-700'
                : 'bg-gray-100 text-gray-400'
            }`}>
              합계 {sumRatios}%
            </span>
            {!sku.hasColors && sku.totalOrderQty > 0 && (
              <>
                <button
                  onClick={() => exportSkuOrderXlsx(sku)}
                  className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  발주표
                </button>
                <CopyButton sku={sku} />
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {sku.sizes.map((size, idx) => (
            <div
              key={idx}
              className={`rounded-lg border p-1.5 text-center transition-colors ${
                size.isActive ? 'border-indigo-200 bg-indigo-50' : 'border-gray-100 bg-gray-50'
              }`}
            >
              <div className={`text-xs font-semibold mb-1 ${
                size.isActive ? 'text-indigo-600' : 'text-gray-300'
              }`}>
                {size.label}
              </div>
              <input
                type="text"
                inputMode="numeric"
                disabled={!size.isActive || readOnly}
                value={size.isActive ? (size.ratio === 0 ? '' : size.ratio) : ''}
                onChange={(e) => handleRatioChange(idx, Number(e.target.value) || 0)}
                onBlur={handleBlur}
                placeholder={size.isActive ? '0' : ''}
                className={`w-full text-center text-xs rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 ${
                  !size.isActive
                    ? 'border-0 bg-transparent text-gray-300 cursor-not-allowed'
                    : readOnly
                    ? 'border border-indigo-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                    : 'border border-indigo-200 bg-white text-gray-800'
                }`}
              />
              {/* 단색: 계산 수량 표시 */}
              {!sku.hasColors && (
                <div className={`text-xs mt-1 ${size.isActive ? 'text-gray-500' : 'text-gray-200'}`}>
                  {size.isActive && size.quantity > 0
                    ? size.quantity.toLocaleString()
                    : size.isActive ? '–' : '-'}
                </div>
              )}
            </div>
          ))}
        </div>
        {!sku.hasColors && (
          <div className="flex justify-between mt-1 text-xs text-gray-400">
            <span>비율 (%)</span>
            <span>↑ 계산 수량</span>
          </div>
        )}
      </div>

      {/* ── 컬러 모드: 결과 테이블 (읽기전용) ── */}
      {sku.hasColors && sku.colors.length > 0 && (
        <ColorSizeResultTable sku={sku} sumRatios={sumRatios} />
      )}

      {/* 목표 소진량 */}
      <div className="p-3 bg-emerald-50 rounded-lg space-y-1 border border-emerald-100">
        <div className="text-xs font-semibold text-emerald-700 mb-1.5">목표 소진량</div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">월간 목표 소진량</span>
          <span className="font-semibold text-emerald-700">
            {monthlyTarget > 0 ? `${monthlyTarget.toLocaleString()}장 / 월` : '–'}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">일간 목표 소진량</span>
          <span className="font-semibold text-emerald-700">
            {dailyTarget > 0 ? `${dailyTarget.toLocaleString()}장 / 일` : '–'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── 컬러×사이즈 결과 테이블 (자동 계산, 읽기전용) ──
function ColorSizeResultTable({ sku, sumRatios }: { sku: SkuData; sumRatios: number }) {
  const activeSizes = sku.sizes.filter((s) => s.isActive);
  const activeColors = sku.colors.filter((c) => c.name || c.quantity > 0);

  if (activeColors.length === 0 || activeSizes.length === 0 || sumRatios === 0) return null;

  function cellQty(colorQty: number, sizeRatio: number): number {
    return sumRatios > 0 ? Math.round((colorQty * sizeRatio) / sumRatios) : 0;
  }

  // 사이즈별 열 합계
  const colTotals = activeSizes.map((s) =>
    activeColors.reduce((sum, c) => sum + cellQty(c.quantity, s.ratio), 0),
  );
  const grandTotal = activeColors.reduce((sum, c) => sum + c.quantity, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-gray-500">컬러 × 사이즈 수량 결과</label>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">자동 계산</span>
          <button
            onClick={() => exportSkuOrderXlsx(sku)}
            className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
            </svg>
            발주표
          </button>
          <CopyButton sku={sku} />
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-2 py-1.5 text-left font-semibold text-gray-500 border-r border-gray-200 min-w-[60px]">
                컬러
              </th>
              {activeSizes.map((s) => (
                <th key={s.label} className="px-2 py-1.5 text-center font-semibold text-indigo-600 border-r border-gray-200 last:border-r-0 min-w-[44px]">
                  {s.label}
                </th>
              ))}
              <th className="px-2 py-1.5 text-center font-semibold text-gray-500 min-w-[52px]">
                합계
              </th>
            </tr>
          </thead>
          <tbody>
            {activeColors.map((color, rowIdx) => (
              <tr
                key={color.id}
                className={`border-b border-gray-100 last:border-b-0 ${
                  rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                }`}
              >
                <td className="px-2 py-1.5 border-r border-gray-200 font-medium text-gray-700 truncate max-w-[60px]">
                  {color.name || <span className="text-gray-300">(미입력)</span>}
                </td>
                {activeSizes.map((s) => {
                  const qty = cellQty(color.quantity, s.ratio);
                  return (
                    <td key={s.label} className="px-2 py-1.5 text-center text-gray-600 border-r border-gray-100 tabular-nums">
                      {qty > 0 ? qty.toLocaleString() : <span className="text-gray-300">0</span>}
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-center font-semibold text-indigo-700 tabular-nums">
                  {color.quantity > 0 ? color.quantity.toLocaleString() : <span className="text-gray-300">0</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-indigo-50 border-t-2 border-indigo-200">
              <td className="px-2 py-1.5 text-xs font-semibold text-indigo-700 border-r border-indigo-200">
                합계
              </td>
              {colTotals.map((total, i) => (
                <td key={activeSizes[i].label} className="px-2 py-1.5 text-center text-xs font-semibold text-indigo-700 border-r border-indigo-100 tabular-nums">
                  {total > 0 ? total.toLocaleString() : <span className="text-indigo-300">0</span>}
                </td>
              ))}
              <td className="px-2 py-1.5 text-center text-xs font-bold text-indigo-700 tabular-nums">
                {grandTotal > 0 ? grandTotal.toLocaleString() : '0'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
