import { v4 as uuidv4, } from 'uuid';
import { useState, useRef } from 'react';
import { useStore } from '../store';
import { useAuth } from '../store/auth';
import { usePermission } from '../contexts/PermissionsContext';
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
  void Math.round(monthlyTarget / 30); // dailyTarget — not currently displayed

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
          <label className="block text-xs text-gray-500 mb-1">총 발주량</label>
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
              총 {sku.totalOrderQty.toLocaleString()}
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

      {/* ── STEP2 기준 옵션별 발주량 ── */}
      <Step2OrderTable sku={sku} sumRatios={sumRatios} />

      {/* ── PM 확인 최종 발주량 ── */}
      <FinalOrderTable sku={sku} sumRatios={sumRatios} />
    </div>
  );
}

// ── MD 채널별 목표량 반영 옵션별 발주량 테이블 ──
function Step2OrderTable({ sku, sumRatios }: { sku: SkuData; sumRatios: number }) {
  const { updateStep2OptionQty, persistSku } = useStore();
  // 부모 리렌더 지연 없이 channelMonthQty/step2OptionQty 변경 즉시 반영
  const liveChannelMonthQty = useStore((s) => s.skus.find((x) => x.id === sku.id)?.channelMonthQty ?? sku.channelMonthQty);
  const liveStep2OptionQty = useStore((s) => s.skus.find((x) => x.id === sku.id)?.step2OptionQty);
  const [isEditing, setIsEditing] = useState(false);
  const [draftQtys, setDraftQtys] = useState<Record<string, number>>({});

  const step2Total = liveChannelMonthQty.reduce((s, e) => s + e.qty, 0);
  const activeSizes = sku.sizes.filter((s) => s.isActive && s.ratio > 0);
  const activeColors = sku.hasColors ? sku.colors.filter((c) => c.name || c.quantity > 0) : [];
  const colorTotal = activeColors.reduce((s, c) => s + c.quantity, 0);
  const hasColors = activeColors.length > 0 && colorTotal > 0;
  const hasSizes = activeSizes.length > 0 && sumRatios > 0;

  if (step2Total === 0 || (!hasColors && !hasSizes)) return null;

  // Key builders
  const csKey = (cid: string, sl: string) => `cs|${cid}|${sl}`;
  const cKey = (cid: string) => `c|${cid}`;
  const sKey = (sl: string) => `s|${sl}`;

  // Computed fallbacks from STEP2 total
  const compCS = (cQty: number, sRatio: number) =>
    sumRatios === 0 || colorTotal === 0 ? 0 : Math.round(step2Total * (cQty / colorTotal) * (sRatio / sumRatios));
  const compC = (cQty: number) => colorTotal === 0 ? 0 : Math.round(step2Total * (cQty / colorTotal));
  const compS = (sRatio: number) => sumRatios === 0 ? 0 : Math.round(step2Total * (sRatio / sumRatios));

  // Display values: stored manual overrides scaled by current/saved total ratio
  const stored = liveStep2OptionQty ?? {};
  const isManual = Object.keys(stored).some((k) => k !== '__total__');
  // 저장 시점 total 대비 현재 total 비율로 스케일링 → STEP2 변경 시 자동 반영
  const savedTotal = (stored['__total__'] as number | undefined) ?? 0;
  const scale = isManual && savedTotal > 0 && step2Total > 0 ? step2Total / savedTotal : 1;
  const dispCS = (cid: string, cQty: number, sl: string, sRatio: number) =>
    isManual && stored[csKey(cid, sl)] !== undefined ? Math.round(stored[csKey(cid, sl)] * scale) : compCS(cQty, sRatio);
  const dispC = (cid: string, cQty: number) =>
    isManual && stored[cKey(cid)] !== undefined ? Math.round(stored[cKey(cid)] * scale) : compC(cQty);
  const dispS = (sl: string, sRatio: number) =>
    isManual && stored[sKey(sl)] !== undefined ? Math.round(stored[sKey(sl)] * scale) : compS(sRatio);

  function startEdit() {
    const draft: Record<string, number> = {};
    if (hasColors && hasSizes) {
      activeColors.forEach((c) => activeSizes.forEach((s) => {
        draft[csKey(c.id, s.label)] = dispCS(c.id, c.quantity, s.label, s.ratio);
      }));
    } else if (hasColors) {
      activeColors.forEach((c) => { draft[cKey(c.id)] = dispC(c.id, c.quantity); });
    } else {
      activeSizes.forEach((s) => { draft[sKey(s.label)] = dispS(s.label, s.ratio); });
    }
    setDraftQtys(draft);
    setIsEditing(true);
  }

  function saveEdit() {
    updateStep2OptionQty(sku.id, { ...draftQtys, __total__: step2Total });
    persistSku(sku.id);
    setIsEditing(false);
  }

  function resetToComputed() {
    updateStep2OptionQty(sku.id, {});
    persistSku(sku.id);
    if (isEditing) setIsEditing(false);
  }

  const setDraft = (key: string, val: number) => setDraftQtys((prev) => ({ ...prev, [key]: val }));

  function editInput(key: string, initVal: number) {
    return (
      <input
        type="text"
        inputMode="numeric"
        className="w-full text-center text-xs border border-indigo-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 tabular-nums bg-white"
        value={draftQtys[key] ?? initVal}
        onChange={(e) => setDraft(key, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0)}
      />
    );
  }

  const tableHeader = (
    <div className="flex items-center justify-between mb-1">
      <label className="text-xs text-gray-500 font-medium">MD 채널별 목표량 반영 옵션별 발주량</label>
      <div className="flex items-center gap-1">
        <button
          onClick={resetToComputed}
          className="text-xs px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-500 transition-colors"
        >
          초기화
        </button>
        {isEditing ? (
          <button
            onClick={saveEdit}
            className="text-xs px-2 py-0.5 rounded-full border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors"
          >
            저장
          </button>
        ) : (
          <button
            onClick={startEdit}
            className="text-xs px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-500 transition-colors"
          >
            수정
          </button>
        )}
      </div>
    </div>
  );

  if (hasColors && hasSizes) {
    const getDraftCS = (cid: string, cQty: number, sl: string, sRatio: number) =>
      isEditing ? (draftQtys[csKey(cid, sl)] ?? dispCS(cid, cQty, sl, sRatio)) : dispCS(cid, cQty, sl, sRatio);
    const colTotals = activeSizes.map((s) =>
      activeColors.reduce((sum, c) => sum + getDraftCS(c.id, c.quantity, s.label, s.ratio), 0),
    );
    const grandTotal = activeColors.reduce(
      (sum, c) => sum + activeSizes.reduce((ss, s) => ss + getDraftCS(c.id, c.quantity, s.label, s.ratio), 0), 0,
    );
    return (
      <div className="mt-3 pt-3 border-t border-gray-100">
        {tableHeader}
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-2 py-1 text-left font-medium text-gray-400 border-r border-gray-200 min-w-[60px]">컬러</th>
                {activeSizes.map((s) => (
                  <th key={s.label} className="px-2 py-1 text-center font-medium text-gray-400 border-r border-gray-200 last:border-r-0 min-w-[44px]">{s.label}</th>
                ))}
                <th className="px-2 py-1 text-center font-medium text-gray-400 min-w-[42px]">합계</th>
              </tr>
            </thead>
            <tbody>
              {activeColors.map((color, rowIdx) => {
                const rowTotal = activeSizes.reduce((sum, s) => sum + getDraftCS(color.id, color.quantity, s.label, s.ratio), 0);
                return (
                  <tr key={color.id} className={`border-b border-gray-100 last:border-b-0 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                    <td className="px-2 py-1 border-r border-gray-200 text-gray-600 truncate max-w-[60px]">
                      {color.name || <span className="text-gray-300">(미입력)</span>}
                    </td>
                    {activeSizes.map((s) => {
                      const key = csKey(color.id, s.label);
                      const qty = getDraftCS(color.id, color.quantity, s.label, s.ratio);
                      return (
                        <td key={s.label} className="px-1 py-1 text-center text-gray-500 border-r border-gray-100 tabular-nums">
                          {isEditing ? editInput(key, dispCS(color.id, color.quantity, s.label, s.ratio)) : (qty > 0 ? qty.toLocaleString() : <span className="text-gray-300">0</span>)}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-center font-medium text-gray-600 tabular-nums">
                      {rowTotal > 0 ? rowTotal.toLocaleString() : <span className="text-gray-300">0</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td className="px-2 py-1 text-xs font-semibold text-gray-500 border-r border-gray-200">합계</td>
                {colTotals.map((total, i) => (
                  <td key={activeSizes[i].label} className="px-2 py-1 text-center text-xs font-semibold text-gray-600 border-r border-gray-100 tabular-nums">
                    {total > 0 ? total.toLocaleString() : <span className="text-gray-300">0</span>}
                  </td>
                ))}
                <td className="px-2 py-1 text-center text-xs font-semibold text-gray-600 tabular-nums">{grandTotal.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  if (hasColors) {
    const getDraftC = (cid: string, cQty: number) =>
      isEditing ? (draftQtys[cKey(cid)] ?? dispC(cid, cQty)) : dispC(cid, cQty);
    const grandTotal = activeColors.reduce((sum, c) => sum + getDraftC(c.id, c.quantity), 0);
    return (
      <div className="mt-3 pt-3 border-t border-gray-100">
        {tableHeader}
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-2 py-1 text-left font-medium text-gray-400 border-r border-gray-200">컬러</th>
                <th className="px-2 py-1 text-center font-medium text-gray-400">수량</th>
              </tr>
            </thead>
            <tbody>
              {activeColors.map((color, rowIdx) => {
                const key = cKey(color.id);
                const qty = getDraftC(color.id, color.quantity);
                return (
                  <tr key={color.id} className={`border-b border-gray-100 last:border-b-0 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                    <td className="px-2 py-1 border-r border-gray-200 text-gray-600">
                      {color.name || <span className="text-gray-300">(미입력)</span>}
                    </td>
                    <td className="px-1 py-1 text-center text-gray-500 tabular-nums">
                      {isEditing ? editInput(key, dispC(color.id, color.quantity)) : (qty > 0 ? qty.toLocaleString() : <span className="text-gray-300">0</span>)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td className="px-2 py-1 text-xs font-semibold text-gray-500 border-r border-gray-200">합계</td>
                <td className="px-2 py-1 text-center text-xs font-semibold text-gray-600 tabular-nums">{grandTotal.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  // size-only
  const getDraftS = (sl: string, sRatio: number) =>
    isEditing ? (draftQtys[sKey(sl)] ?? dispS(sl, sRatio)) : dispS(sl, sRatio);
  const sizeGrandTotal = activeSizes.reduce((sum, s) => sum + getDraftS(s.label, s.ratio), 0);
  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      {tableHeader}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-2 py-1 text-left font-medium text-gray-400 border-r border-gray-200 w-[52px]"></th>
              {activeSizes.map((s) => (
                <th key={s.label} className="px-2 py-1 text-center font-medium text-gray-400 border-r border-gray-200 last:border-r-0 min-w-[44px]">{s.label}</th>
              ))}
              <th className="px-2 py-1 text-center font-medium text-gray-400 min-w-[42px]">합계</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="px-2 py-1 border-r border-gray-200 text-gray-600">수량</td>
              {activeSizes.map((s) => {
                const key = sKey(s.label);
                const qty = getDraftS(s.label, s.ratio);
                return (
                  <td key={s.label} className="px-1 py-1 text-center text-gray-500 border-r border-gray-100 tabular-nums">
                    {isEditing ? editInput(key, dispS(s.label, s.ratio)) : (qty > 0 ? qty.toLocaleString() : <span className="text-gray-300">0</span>)}
                  </td>
                );
              })}
              <td className="px-2 py-1 text-center font-medium text-gray-600 tabular-nums">{sizeGrandTotal.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
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
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-gray-400">옵션별 발주량 (기본)</label>
        <CopyButton sku={sku} />
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-2 py-1 text-left font-medium text-gray-400 border-r border-gray-200 min-w-[60px]">
                컬러
              </th>
              {activeSizes.map((s) => (
                <th key={s.label} className="px-2 py-1 text-center font-medium text-gray-400 border-r border-gray-200 last:border-r-0 min-w-[44px]">
                  {s.label}
                </th>
              ))}
              <th className="px-2 py-1 text-center font-medium text-gray-400 min-w-[42px]">
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
                <td className="px-2 py-1 border-r border-gray-200 text-gray-600 truncate max-w-[60px]">
                  {color.name || <span className="text-gray-300">(미입력)</span>}
                </td>
                {activeSizes.map((s) => {
                  const qty = cellQty(color.quantity, s.ratio);
                  return (
                    <td key={s.label} className="px-2 py-1 text-center text-gray-500 border-r border-gray-100 tabular-nums">
                      {qty > 0 ? qty.toLocaleString() : <span className="text-gray-300">0</span>}
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-center font-medium text-gray-600 tabular-nums">
                  {color.quantity > 0 ? color.quantity.toLocaleString() : <span className="text-gray-300">0</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t border-gray-200">
              <td className="px-2 py-1 text-xs font-semibold text-gray-500 border-r border-gray-200">
                합계
              </td>
              {colTotals.map((total, i) => (
                <td key={activeSizes[i].label} className="px-2 py-1 text-center text-xs font-semibold text-gray-600 border-r border-gray-100 tabular-nums">
                  {total > 0 ? total.toLocaleString() : <span className="text-gray-300">0</span>}
                </td>
              ))}
              <td className="px-2 py-1 text-center text-xs font-semibold text-gray-600 tabular-nums">
                {grandTotal > 0 ? grandTotal.toLocaleString() : '0'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── PM 확인 최종 발주량 ──
function formatConfirmedAt(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${min}`;
}

function FinalOrderTable({ sku, sumRatios }: { sku: SkuData; sumRatios: number }) {
  const { setFinalOrderConfirmed } = useStore();
  const { role } = useAuth();
  const canEdit = usePermission(role).orderConfirm;

  const liveSku = useStore((s) => s.skus.find((x) => x.id === sku.id) ?? sku);
  const liveChannelMonthQty = liveSku.channelMonthQty;
  const liveStep2OptionQty = liveSku.step2OptionQty;
  const liveFinalOrderQty = liveSku.finalOrderQty;
  const liveConfirmedAt = liveSku.finalOrderConfirmedAt;

  const [isEditing, setIsEditing] = useState(false);
  const [draftQtys, setDraftQtys] = useState<Record<string, number>>({});
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const step2Total = liveChannelMonthQty.reduce((s, e) => s + e.qty, 0);
  const activeSizes = sku.sizes.filter((s) => s.isActive && s.ratio > 0);
  const activeColors = sku.hasColors ? sku.colors.filter((c) => c.name || c.quantity > 0) : [];
  const colorTotal = activeColors.reduce((s, c) => s + c.quantity, 0);
  const hasColors = activeColors.length > 0 && colorTotal > 0;
  const hasSizes = activeSizes.length > 0 && sumRatios > 0;

  if (step2Total === 0 || (!hasColors && !hasSizes)) return null;

  const csKey = (cid: string, sl: string) => `cs|${cid}|${sl}`;
  const cKey = (cid: string) => `c|${cid}`;
  const sKey = (sl: string) => `s|${sl}`;

  // Step2 fallback values
  const stored2 = liveStep2OptionQty ?? {};
  const isManual2 = Object.keys(stored2).some((k) => k !== '__total__');
  const savedTotal2 = (stored2['__total__'] as number | undefined) ?? 0;
  const scale2 = isManual2 && savedTotal2 > 0 && step2Total > 0 ? step2Total / savedTotal2 : 1;
  const compCS = (cQty: number, sRatio: number) =>
    sumRatios === 0 || colorTotal === 0 ? 0 : Math.round(step2Total * (cQty / colorTotal) * (sRatio / sumRatios));
  const compC = (cQty: number) => colorTotal === 0 ? 0 : Math.round(step2Total * (cQty / colorTotal));
  const compS = (sRatio: number) => sumRatios === 0 ? 0 : Math.round(step2Total * (sRatio / sumRatios));
  const s2DispCS = (cid: string, cQty: number, sl: string, sRatio: number) =>
    isManual2 && stored2[csKey(cid, sl)] !== undefined ? Math.round(stored2[csKey(cid, sl)] * scale2) : compCS(cQty, sRatio);
  const s2DispC = (cid: string, cQty: number) =>
    isManual2 && stored2[cKey(cid)] !== undefined ? Math.round(stored2[cKey(cid)] * scale2) : compC(cQty);
  const s2DispS = (sl: string, sRatio: number) =>
    isManual2 && stored2[sKey(sl)] !== undefined ? Math.round(stored2[sKey(sl)] * scale2) : compS(sRatio);

  // Final stored values
  const finalStored = liveFinalOrderQty ?? {};
  // 메타 키(__total__, __confirmedStep2Total__)를 제외한 실제 breakdown 키가 있는지 확인
  const META_KEYS = new Set(['__total__', '__confirmedStep2Total__']);
  const isFinalManual = Object.keys(finalStored).some((k) => !META_KEYS.has(k));
  const dispCS = (cid: string, cQty: number, sl: string, sRatio: number) =>
    isFinalManual && finalStored[csKey(cid, sl)] !== undefined ? finalStored[csKey(cid, sl)] : s2DispCS(cid, cQty, sl, sRatio);
  const dispC = (cid: string, cQty: number) =>
    isFinalManual && finalStored[cKey(cid)] !== undefined ? finalStored[cKey(cid)] : s2DispC(cid, cQty);
  const dispS = (sl: string, sRatio: number) =>
    isFinalManual && finalStored[sKey(sl)] !== undefined ? finalStored[sKey(sl)] : s2DispS(sl, sRatio);

  function startEdit() {
    const draft: Record<string, number> = {};
    if (hasColors && hasSizes) {
      activeColors.forEach((c) => activeSizes.forEach((s) => {
        draft[csKey(c.id, s.label)] = dispCS(c.id, c.quantity, s.label, s.ratio);
      }));
    } else if (hasColors) {
      activeColors.forEach((c) => { draft[cKey(c.id)] = dispC(c.id, c.quantity); });
    } else {
      activeSizes.forEach((s) => { draft[sKey(s.label)] = dispS(s.label, s.ratio); });
    }
    setDraftQtys(draft);
    setIsEditing(true);
  }

  async function handleConfirm() {
    let newFinalOrderQty: Record<string, number>;
    if (isEditing) {
      // 수기 편집 후 확정: draft 값 저장
      newFinalOrderQty = { ...draftQtys, __confirmedStep2Total__: step2Total };
      setIsEditing(false);
    } else if (!isFinalManual) {
      // 기존 breakdown 없음: 현재 표시값 스냅샷으로 고정
      const snapshot: Record<string, number> = {};
      if (hasColors && hasSizes) {
        activeColors.forEach((c) => activeSizes.forEach((s) => {
          snapshot[csKey(c.id, s.label)] = dispCS(c.id, c.quantity, s.label, s.ratio);
        }));
      } else if (hasColors) {
        activeColors.forEach((c) => { snapshot[cKey(c.id)] = dispC(c.id, c.quantity); });
      } else {
        activeSizes.forEach((s) => { snapshot[sKey(s.label)] = dispS(s.label, s.ratio); });
      }
      newFinalOrderQty = { ...snapshot, __confirmedStep2Total__: step2Total };
    } else {
      // 기존 수기 breakdown 보존, __confirmedStep2Total__만 갱신
      newFinalOrderQty = { ...(liveFinalOrderQty ?? {}), __confirmedStep2Total__: step2Total };
    }
    // finalOrderQty를 setFinalOrderConfirmed에 직접 전달 → 단일 Firestore write로 원자적 저장
    // (updateFinalOrderQty separate call을 제거해 두 write 사이 race condition 방지)
    await setFinalOrderConfirmed(sku.id, true, newFinalOrderQty);
  }

  async function handleCancelConfirm() {
    await setFinalOrderConfirmed(sku.id, false);
  }

  async function handleCopy() {
    if (copyState !== 'idle') return;
    try {
      let rows: (string | number)[][];
      if (hasColors && hasSizes) {
        rows = [
          ['컬러 \\ 사이즈', ...activeSizes.map((s) => s.label), '합계'],
          ...activeColors.map((c) => {
            const vals = activeSizes.map((s) => dispCS(c.id, c.quantity, s.label, s.ratio));
            return [c.name, ...vals, vals.reduce((a, v) => a + v, 0)];
          }),
        ];
      } else if (hasColors) {
        rows = [['컬러', '수량'], ...activeColors.map((c) => [c.name, dispC(c.id, c.quantity)])];
      } else {
        rows = [['사이즈', ...activeSizes.map((s) => s.label)], ['수량', ...activeSizes.map((s) => dispS(s.label, s.ratio))]];
      }
      const tsv = rows.map((row) => row.map((cell) => String(cell).replace(/\t/g, ' ')).join('\t')).join('\n');
      await navigator.clipboard.writeText(tsv);
      setCopyState('ok');
    } catch {
      setCopyState('err');
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopyState('idle'), 1800);
  }

  const copyLabel = copyState === 'ok' ? '복사됨 ✓' : copyState === 'err' ? '실패' : '복사';
  const copyBtnCls =
    copyState === 'ok' ? 'text-indigo-600 border-indigo-200 bg-indigo-50' :
    copyState === 'err' ? 'text-red-500 border-red-200 bg-red-50' :
    'text-gray-500 border-gray-200 bg-gray-50 hover:bg-gray-100';

  const setDraft = (key: string, val: number) => setDraftQtys((prev) => ({ ...prev, [key]: val }));
  function editInput(key: string, initVal: number) {
    return (
      <input
        type="text"
        inputMode="numeric"
        className="w-full text-center text-xs border border-indigo-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 tabular-nums bg-white"
        value={draftQtys[key] ?? initVal}
        onChange={(e) => setDraft(key, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0)}
      />
    );
  }

  const tableHeader = (
    <div className="flex items-center justify-between mb-1">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-xs font-semibold text-gray-700">PM 확인 최종 발주량</label>
        {liveConfirmedAt && (
          <span className="text-xs text-red-500 font-medium">
            [발주량 최종 확정 {formatConfirmedAt(liveConfirmedAt)}]
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {canEdit && (
          <>
            {liveConfirmedAt ? (
              <button
                onClick={handleCancelConfirm}
                className="text-xs px-2 py-0.5 rounded-full border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
              >
                확정취소
              </button>
            ) : isEditing ? (
              <>
                <button
                  onClick={() => setIsEditing(false)}
                  className="text-xs px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-500 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleConfirm}
                  className="text-xs px-2 py-0.5 rounded-full border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors"
                >
                  확정
                </button>
              </>
            ) : (
              <>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-pink-100 text-pink-600 border border-pink-200">
                  확정 전
                </span>
                <button
                  onClick={startEdit}
                  className="text-xs px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-500 transition-colors"
                >
                  수정
                </button>
              </>
            )}
          </>
        )}
        <button onClick={handleCopy} className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${copyBtnCls}`}>
          {copyState === 'idle' && (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2M16 8h2a2 2 0 012 2v8a2 2 0 01-2 2h-8a2 2 0 01-2-2v-2" />
            </svg>
          )}
          {copyLabel}
        </button>
      </div>
    </div>
  );

  // ── color × size ──
  if (hasColors && hasSizes) {
    const getDraftCS = (cid: string, cQty: number, sl: string, sRatio: number) =>
      isEditing ? (draftQtys[csKey(cid, sl)] ?? dispCS(cid, cQty, sl, sRatio)) : dispCS(cid, cQty, sl, sRatio);
    const colTotals = activeSizes.map((s) =>
      activeColors.reduce((sum, c) => sum + getDraftCS(c.id, c.quantity, s.label, s.ratio), 0),
    );
    const grandTotal = colTotals.reduce((a, v) => a + v, 0);
    return (
      <div className="mt-3 pt-3 border-t-2 border-gray-200">
        {tableHeader}
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-2 py-1 text-left font-semibold text-gray-500 border-r border-gray-200 min-w-[60px]">컬러</th>
                {activeSizes.map((s) => (
                  <th key={s.label} className="px-2 py-1 text-center font-semibold text-indigo-600 border-r border-gray-200 last:border-r-0 min-w-[44px]">{s.label}</th>
                ))}
                <th className="px-2 py-1 text-center font-semibold text-gray-500 border-r border-gray-200 min-w-[42px]">합계</th>
                <th className="px-2 py-1 text-center font-semibold text-gray-400 min-w-[35px]">비중%</th>
              </tr>
            </thead>
            <tbody>
              {activeColors.map((color, rowIdx) => {
                const rowTotal = activeSizes.reduce((sum, s) => sum + getDraftCS(color.id, color.quantity, s.label, s.ratio), 0);
                const pct = grandTotal > 0 ? (rowTotal / grandTotal * 100).toFixed(1) : '0.0';
                return (
                  <tr key={color.id} className={`border-b border-gray-100 last:border-b-0 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                    <td className="px-2 py-1 border-r border-gray-200 font-medium text-gray-700 truncate max-w-[60px]">
                      {color.name || <span className="text-gray-300">(미입력)</span>}
                    </td>
                    {activeSizes.map((s) => {
                      const key = csKey(color.id, s.label);
                      const qty = getDraftCS(color.id, color.quantity, s.label, s.ratio);
                      const cellPct = rowTotal > 0 ? (qty / rowTotal * 100).toFixed(1) : '0.0';
                      return (
                        <td key={s.label} className="px-1 py-1 text-center border-r border-gray-100 tabular-nums">
                          {isEditing ? (
                            editInput(key, dispCS(color.id, color.quantity, s.label, s.ratio))
                          ) : (
                            <div>
                              <div className="text-gray-600">{qty > 0 ? qty.toLocaleString() : <span className="text-gray-300">0</span>}</div>
                              <div className="text-[10px] text-gray-400">{cellPct}%</div>
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-center font-semibold text-indigo-700 tabular-nums border-r border-gray-200">
                      {rowTotal > 0 ? rowTotal.toLocaleString() : <span className="text-gray-300">0</span>}
                    </td>
                    <td className="px-2 py-1 text-center text-gray-500 tabular-nums text-[11px]">{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                <td className="px-2 py-1 text-xs font-semibold text-indigo-700 border-r border-indigo-200">합계</td>
                {colTotals.map((total, i) => {
                  const pct = grandTotal > 0 ? (total / grandTotal * 100).toFixed(1) : '0.0';
                  return (
                    <td key={activeSizes[i].label} className="px-2 py-1 text-center border-r border-indigo-100 tabular-nums">
                      <div className="text-xs font-semibold text-indigo-700">{total > 0 ? total.toLocaleString() : <span className="text-indigo-300">0</span>}</div>
                      <div className="text-[10px] text-indigo-400">{pct}%</div>
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-center text-xs font-bold text-indigo-700 tabular-nums border-r border-indigo-200">{grandTotal.toLocaleString()}</td>
                <td className="px-2 py-1 text-center text-[10px] text-indigo-400">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  // ── color only ──
  if (hasColors) {
    const getDraftC = (cid: string, cQty: number) =>
      isEditing ? (draftQtys[cKey(cid)] ?? dispC(cid, cQty)) : dispC(cid, cQty);
    const grandTotal = activeColors.reduce((sum, c) => sum + getDraftC(c.id, c.quantity), 0);
    return (
      <div className="mt-3 pt-3 border-t-2 border-gray-200">
        {tableHeader}
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-2 py-1 text-left font-semibold text-gray-500 border-r border-gray-200">컬러</th>
                <th className="px-2 py-1 text-center font-semibold text-indigo-600 border-r border-gray-200">수량</th>
                <th className="px-2 py-1 text-center font-semibold text-gray-400">비중%</th>
              </tr>
            </thead>
            <tbody>
              {activeColors.map((color, rowIdx) => {
                const key = cKey(color.id);
                const qty = getDraftC(color.id, color.quantity);
                const pct = grandTotal > 0 ? (qty / grandTotal * 100).toFixed(1) : '0.0';
                return (
                  <tr key={color.id} className={`border-b border-gray-100 last:border-b-0 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                    <td className="px-2 py-1 border-r border-gray-200 font-medium text-gray-700">
                      {color.name || <span className="text-gray-300">(미입력)</span>}
                    </td>
                    <td className="px-1 py-1 text-center text-gray-600 tabular-nums border-r border-gray-200">
                      {isEditing ? editInput(key, dispC(color.id, color.quantity)) : (qty > 0 ? qty.toLocaleString() : <span className="text-gray-300">0</span>)}
                    </td>
                    <td className="px-2 py-1 text-center text-gray-500 tabular-nums text-[11px]">{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                <td className="px-2 py-1 text-xs font-semibold text-indigo-700 border-r border-indigo-200">합계</td>
                <td className="px-2 py-1 text-center text-xs font-bold text-indigo-700 tabular-nums border-r border-indigo-200">{grandTotal.toLocaleString()}</td>
                <td className="px-2 py-1 text-center text-[10px] text-indigo-400">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

  // ── size only ──
  const getDraftS = (sl: string, sRatio: number) =>
    isEditing ? (draftQtys[sKey(sl)] ?? dispS(sl, sRatio)) : dispS(sl, sRatio);
  const grandTotal = activeSizes.reduce((sum, s) => sum + getDraftS(s.label, s.ratio), 0);
  return (
    <div className="mt-3 pt-3 border-t-2 border-gray-200">
      {tableHeader}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-2 py-1 text-left font-semibold text-gray-500 border-r border-gray-200 w-[52px]"></th>
              {activeSizes.map((s) => (
                <th key={s.label} className="px-2 py-1 text-center font-semibold text-indigo-600 border-r border-gray-200 last:border-r-0 min-w-[44px]">{s.label}</th>
              ))}
              <th className="px-2 py-1 text-center font-semibold text-gray-500 border-r border-gray-200 min-w-[42px]">합계</th>
              <th className="px-2 py-1 text-center font-semibold text-gray-400 min-w-[35px]">비중%</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="px-2 py-1 border-r border-gray-200 font-medium text-gray-600">수량</td>
              {activeSizes.map((s) => {
                const key = sKey(s.label);
                const qty = getDraftS(s.label, s.ratio);
                const pct = grandTotal > 0 ? (qty / grandTotal * 100).toFixed(1) : '0.0';
                return (
                  <td key={s.label} className="px-1 py-1 text-center border-r border-gray-100 tabular-nums">
                    {isEditing ? (
                      editInput(key, dispS(s.label, s.ratio))
                    ) : (
                      <div>
                        <div className="text-gray-600">{qty > 0 ? qty.toLocaleString() : <span className="text-gray-300">0</span>}</div>
                        <div className="text-[10px] text-gray-400">{pct}%</div>
                      </div>
                    )}
                  </td>
                );
              })}
              <td className="px-2 py-1 text-center font-semibold text-indigo-700 tabular-nums border-r border-gray-200">{grandTotal.toLocaleString()}</td>
              <td className="px-2 py-1 text-center text-[10px] text-gray-400">100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
