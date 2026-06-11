import { useStore } from '../store';
import { useRef, useEffect, useState, useCallback, type KeyboardEvent } from 'react';
import type { SkuData } from '../types';
import { getReleaseMonth, MONTHS } from '../types';
import { GrowthIndicator } from './GrowthIndicator';
import { NumericInput } from './NumericInput';
import { revenueMultiplier, calcDynamicMultiplier } from '../utils/calc';
import {
  fetchSkuShipments,
  fetchChannelShipments,
  invalidateCache,
  searchSkus,
  calcRolling12,
  calcSamePeriod,
  aggregateByYearMonth,
  calcChannelPeriodQty,
  aggregateChannelByYearMonth,
  type SkuShipmentInfo,
  type ChannelDataMap,
  type ChannelByYearMonth,
} from '../services/tableau';

type CompareMode = 'rolling12' | 'samePeriod';

/** 월별 테이블에 표시할 비교 데이터를 mode에 따라 계산 */
function calcMonthlyDisplayData(
  byYearMonth: Record<number, Record<number, number>>,
  compareMode: CompareMode,
  releaseMonth: number | null,
  releaseYear: number | null,
): Partial<Record<number, number>> {
  const result: Partial<Record<number, number>> = {};
  const allYears = Object.keys(byYearMonth).map(Number).sort((a, b) => b - a);
  for (const m of MONTHS) {
    const isNextYearMonth = m === 1 || m === 2;
    if (compareMode === 'samePeriod') {
      const inSeason = isNextYearMonth || releaseMonth === null || m >= releaseMonth;
      if (!inSeason) continue;
      const lookupYear = isNextYearMonth ? releaseYear : (releaseYear ? releaseYear - 1 : null);
      if (!lookupYear) continue;
      const qty = byYearMonth[lookupYear]?.[m];
      if (qty !== undefined) result[m] = qty;
    } else {
      for (const y of allYears) {
        if (byYearMonth[y]?.[m] !== undefined) {
          result[m] = byYearMonth[y][m];
          break;
        }
      }
    }
  }
  return result;
}

interface Props {
  sku: SkuData;
  readOnly?: boolean;
  onComparisonDataChange?: (
    data: Partial<Record<number, number>>,
    mode: CompareMode,
    label: string,
  ) => void;
  onChannelDistChange?: (dist: Record<string, number> | null) => void;
  onChannelYMDataChange?: (data: ChannelByYearMonth | null) => void;
  step3Revenue?: number;
  step3Profit?: number;
}

export function ComparisonColumn({ sku, readOnly, onComparisonDataChange, onChannelDistChange, onChannelYMDataChange, step3Revenue, step3Profit }: Props) {
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);

  // Tableau 전체 데이터
  const [allSkus, setAllSkus] = useState<SkuShipmentInfo[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  // 채널별 데이터
  const [channelMap, setChannelMap] = useState<ChannelDataMap | null>(null);
  const [channelConfigured, setChannelConfigured] = useState(true); // VIEW_ID 설정 여부
  const [channelPeriodQty, setChannelPeriodQty] = useState<Record<string, number> | null>(null);

  // 의류·잡화는 동기간이 기본값
  const defaultMode: CompareMode = (sku.category === '의류' || sku.category === '잡화') ? 'samePeriod' : 'rolling12';

  // 선택된 대응 SKU 목록 (복수)
  const [selectedSkus, setSelectedSkus] = useState<SkuShipmentInfo[]>([]);
  const [compareMode, setCompareMode] = useState<CompareMode>(() =>
    (sku.category === '의류' || sku.category === '잡화') ? 'samePeriod' : 'rolling12'
  );

  // 검색 UI
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SkuShipmentInfo[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // SKU 카드 변경 시 초기화 (의류·잡화는 동기간으로 리셋)
  useEffect(() => {
    setQuery('');
    setCompareMode(defaultMode);
    setSelectedSkus([]);
    onComparisonDataChange?.({}, defaultMode, defaultMode === 'samePeriod' ? '동기간' : '직전 12개월');
    onChannelDistChange?.(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sku.id]);

  // Tableau 전체 데이터 로드 (retryTick 변경 시 재시도)
  useEffect(() => {
    setLoading(true);
    setAllSkus([]);
    fetchSkuShipments()
      .then((data) => { setAllSkus(data); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryTick]);

  // 채널 데이터 로드 (VIEW_ID 설정된 경우만, retryTick 변경 시 재시도)
  useEffect(() => {
    fetchChannelShipments()
      .then((map) => {
        if (map === null) { setChannelConfigured(false); return; }
        setChannelMap(map);
      })
      .catch((err) => { console.error('[채널 데이터 로드 실패]', err); setChannelConfigured(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryTick]);

  // allSkus 로드 후 저장된 선택 SKU 자동 복원
  // 의류·잡화는 동기간으로 복원 + store 값도 갱신 (일괄반영)
  useEffect(() => {
    if (allSkus.length === 0 || selectedSkus.length > 0) return;
    const savedNames = sku.comparisonSku.compareSkuNames ?? (sku.comparisonSku.name ? [sku.comparisonSku.name] : []);
    if (savedNames.length === 0) return;
    const found = savedNames.map((n) => allSkus.find((s) => s.name === n)).filter(Boolean) as SkuShipmentInfo[];
    if (found.length === 0) return;
    setSelectedSkus(found);
    setCompareMode(defaultMode);
    applySelection(found, defaultMode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSkus]);

  // 채널 기간별 집계 재계산
  useEffect(() => {
    if (!channelMap || selectedSkus.length === 0) {
      setChannelPeriodQty(null);
      onChannelDistChange?.(null);
      onChannelYMDataChange?.(null);
      return;
    }
    const rm = getReleaseMonth(sku.releaseDate);
    const ry = sku.releaseDate ? parseInt(sku.releaseDate.split('-')[0], 10) : null;
    const skuNames = selectedSkus.map(s => s.name);
    const aggregated = aggregateChannelByYearMonth(skuNames, channelMap);
    const qty = calcChannelPeriodQty(aggregated, compareMode, rm, ry);
    const dist = Object.keys(qty).length > 0 ? qty : null;
    setChannelPeriodQty(dist);
    onChannelDistChange?.(dist);
    onChannelYMDataChange?.(Object.keys(aggregated).length > 0 ? aggregated : null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSkus, compareMode, channelMap]);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        !inputRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) setShowDropdown(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // 검색어 변경 → 드롭다운 필터
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (allSkus.length > 0) {
      setSuggestions(searchSkus(allSkus, value));
      setShowDropdown(true);
    }
  }, [allSkus]);

  // 집계 byYearMonth 계산 후 저장 + 콜백 호출
  function applySelection(skus: SkuShipmentInfo[], mode: CompareMode) {
    if (skus.length === 0) {
      updateSku(sku.id, {
        comparisonSku: {
          ...sku.comparisonSku,
          name: '',
          compareSkuNames: [],
          monthlyShipment: 0,
          annualShipment: 0,
        },
      });
      persistSku(sku.id);
      onComparisonDataChange?.({}, mode, mode === 'rolling12' ? '직전 12개월' : '');
      return;
    }

    const aggregated = aggregateByYearMonth(skus);
    const rm = getReleaseMonth(sku.releaseDate);
    const ry = sku.releaseDate ? parseInt(sku.releaseDate.split('-')[0], 10) : null;

    let annual: number, monthly: number, label: string;
    if (mode === 'samePeriod' && rm && ry) {
      ({ annual, monthly, label } = calcSamePeriod(aggregated, rm, ry));
    } else {
      ({ annual, monthly } = calcRolling12(aggregated));
      label = '직전 12개월';
    }

    const displayName = skus.length === 1 ? skus[0].name : `${skus.length}개 SKU 합산`;
    updateSku(sku.id, {
      comparisonSku: {
        ...sku.comparisonSku,
        name: displayName,
        compareSkuNames: skus.map((s) => s.name),
        monthlyShipment: monthly,
        annualShipment: annual,
      },
    });
    persistSku(sku.id);

    const data = calcMonthlyDisplayData(aggregated, mode, rm, ry);
    onComparisonDataChange?.(data, mode, label);
  }

  function toggleSku(s: SkuShipmentInfo) {
    const isSelected = selectedSkus.some((x) => x.name === s.name);
    const next = isSelected
      ? selectedSkus.filter((x) => x.name !== s.name)
      : [...selectedSkus, s];
    setSelectedSkus(next);
    setCompareMode(defaultMode);
    applySelection(next, defaultMode);
  }

  function removeChip(name: string) {
    const next = selectedSkus.filter((s) => s.name !== name);
    setSelectedSkus(next);
    setCompareMode(defaultMode);
    applySelection(next, defaultMode);
  }

  function handleModeToggle() {
    if (selectedSkus.length === 0 || readOnly) return;
    const rm = getReleaseMonth(sku.releaseDate);
    const ry = sku.releaseDate ? parseInt(sku.releaseDate.split('-')[0], 10) : null;
    const aggregated = aggregateByYearMonth(selectedSkus);

    if (compareMode === 'rolling12') {
      if (!rm || !ry) return;
      const { annual, monthly, label } = calcSamePeriod(aggregated, rm, ry);
      updateSku(sku.id, {
        comparisonSku: { ...sku.comparisonSku, monthlyShipment: monthly, annualShipment: annual },
      });
      persistSku(sku.id);
      setCompareMode('samePeriod');
      const data = calcMonthlyDisplayData(aggregated, 'samePeriod', rm, ry);
      onComparisonDataChange?.(data, 'samePeriod', label);
    } else {
      const { annual, monthly } = calcRolling12(aggregated);
      updateSku(sku.id, {
        comparisonSku: { ...sku.comparisonSku, monthlyShipment: monthly, annualShipment: annual },
      });
      persistSku(sku.id);
      setCompareMode('rolling12');
      const data = calcMonthlyDisplayData(aggregated, 'rolling12', rm, ry);
      onComparisonDataChange?.(data, 'rolling12', '직전 12개월');
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') setShowDropdown(false);
  }

  // 동기간 레이블
  const releaseMonth = getReleaseMonth(sku.releaseDate);
  const releaseYear = sku.releaseDate ? parseInt(sku.releaseDate.split('-')[0], 10) : null;
  const samePeriodLabel = releaseMonth && releaseYear
    ? calcSamePeriod({}, releaseMonth, releaseYear).label
    : null;
  const canSamePeriod = !!releaseMonth && selectedSkus.length > 0;

  // 드롭다운 아이템 목록: 검색어가 있으면 필터, 없으면 전체
  const dropdownItems = query.trim() ? suggestions : allSkus.slice(0, 20);

  const inputCls = `w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed`;
  const monthlyTarget = sku.targetSellThroughMonths > 0
    ? Math.round(sku.totalOrderQty / sku.targetSellThroughMonths) : 0;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        기존 대응 SKU 비교
      </h3>

      {/* SKU 검색 + 다중 선택 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-500">기존 SKU명 검색</label>
          {loading && <span className="text-[10px] text-indigo-400 animate-pulse">로딩 중…</span>}
          {loadError && !loading && (
            <span className="flex items-center gap-1.5">
              <span className="text-[10px] text-red-400">연결 실패</span>
              <button
                onClick={() => { invalidateCache(); setRetryTick(t => t + 1); }}
                className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-red-500 hover:bg-red-100 transition-colors"
              >
                재시도
              </button>
            </span>
          )}
          {!loading && !loadError && allSkus.length > 0 && selectedSkus.length === 0 && (
            <span className="text-[10px] text-gray-300">{allSkus.length}개 SKU</span>
          )}
          {selectedSkus.length > 0 && (
            <span className="text-[10px] font-semibold text-indigo-500">
              {selectedSkus.length}개 선택됨
            </span>
          )}
        </div>

        {/* 선택된 SKU 칩 */}
        {selectedSkus.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {selectedSkus.map((s) => (
              <span
                key={s.name}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-100 text-indigo-700 border border-indigo-200"
              >
                {s.name}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeChip(s.name)}
                    className="text-indigo-400 hover:text-indigo-700 leading-none"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {/* 검색 인풋 */}
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => setShowDropdown(true)}
            onKeyDown={handleKeyDown}
            disabled={readOnly}
            placeholder={loading ? '로딩 중…' : 'SKU명 입력해서 검색'}
            className={inputCls}
          />

          {/* 드롭다운 */}
          {showDropdown && dropdownItems.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-52 overflow-y-auto"
            >
              {dropdownItems.map((s) => {
                const isChecked = selectedSkus.some((x) => x.name === s.name);
                return (
                  <label
                    key={s.name}
                    className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-indigo-50 transition-colors ${
                      isChecked ? 'bg-indigo-50/60' : ''
                    }`}
                    onMouseDown={(e) => { e.preventDefault(); toggleSku(s); }}
                  >
                    <span className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                      isChecked
                        ? 'bg-indigo-600 border-indigo-600'
                        : 'border-gray-300 bg-white'
                    }`}>
                      {isChecked && (
                        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                          <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </span>
                    <span className="flex-1 text-xs text-gray-700 truncate">{s.name}</span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0 whitespace-nowrap">
                      연 {s.annualShipment.toLocaleString()} ({s.latestYear})
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Tableau 연동 뱃지 + 모드 토글 */}
        {selectedSkus.length > 0 && (
          <div className="mt-1.5 space-y-1.5">
            <span className="text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-500 rounded border border-indigo-100 font-medium inline-block">
              Tableau 연동
            </span>
            {!readOnly && (
              <div className="flex items-center justify-end">
                {compareMode === 'rolling12' ? (
                  canSamePeriod ? (
                    <button
                      onClick={handleModeToggle}
                      className="text-[10px] px-2 py-1 rounded border border-violet-200 bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors font-medium"
                    >
                      동기간 ({samePeriodLabel})
                    </button>
                  ) : (
                    <span className="text-[10px] text-gray-300 italic">동기간 비교: 출시일을 먼저 입력해주세요</span>
                  )
                ) : (
                  <button
                    onClick={handleModeToggle}
                    className="text-[10px] px-2 py-1 rounded border border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors font-medium"
                  >
                    직전 12개월로 변경
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 판매가 / 원가 */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">기존 판매가 (₩)</label>
          <NumericInput
            value={sku.comparisonSku.price}
            onChange={(v) => { if (!readOnly) updateSku(sku.id, { comparisonSku: { ...sku.comparisonSku, price: v } }); }}
            onBlur={() => { if (!readOnly) persistSku(sku.id); }}
            disabled={readOnly}
            placeholder="0"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">기존 원가 (₩)</label>
          <NumericInput
            value={sku.comparisonSku.cost}
            onChange={(v) => { if (!readOnly) updateSku(sku.id, { comparisonSku: { ...sku.comparisonSku, cost: v } }); }}
            onBlur={() => { if (!readOnly) persistSku(sku.id); }}
            disabled={readOnly}
            placeholder="0"
            className={inputCls}
          />
        </div>
      </div>

      {/* 월 출고량 / 연간 총출고량 */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">기존 월 출고량</label>
          <NumericInput
            value={sku.comparisonSku.monthlyShipment}
            onChange={(v) => { if (!readOnly && selectedSkus.length === 0) updateSku(sku.id, { comparisonSku: { ...sku.comparisonSku, monthlyShipment: v } }); }}
            onBlur={() => { if (!readOnly && selectedSkus.length === 0) persistSku(sku.id); }}
            disabled={readOnly || selectedSkus.length > 0}
            placeholder="0"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">기존 연간 총출고량</label>
          <NumericInput
            value={sku.comparisonSku.annualShipment}
            onChange={(v) => { if (!readOnly && selectedSkus.length === 0) updateSku(sku.id, { comparisonSku: { ...sku.comparisonSku, annualShipment: v } }); }}
            onBlur={() => { if (!readOnly && selectedSkus.length === 0) persistSku(sku.id); }}
            disabled={readOnly || selectedSkus.length > 0}
            placeholder="0"
            className={inputCls}
          />
          <p className="text-[10px] text-gray-400 mt-0.5 px-0.5">*동기간 비교시 해당 기간 총 수량</p>
        </div>
      </div>

      {/* 채널별 월평균 출고 차트 */}
      {selectedSkus.length > 0 && (
        <ChannelDistChart
          channelQty={channelPeriodQty}
          configured={channelConfigured}
          compareMode={compareMode}
          samePeriodLabel={samePeriodLabel}
          releaseMonth={releaseMonth}
          releaseYear={releaseYear}
        />
      )}

      <GrowthIndicator
        newPrice={sku.price}
        oldPrice={sku.comparisonSku.price}
        newMonthlyQty={monthlyTarget}
        oldMonthlyQty={sku.comparisonSku.monthlyShipment}
        newAnnualQty={sku.totalOrderQty}
        oldAnnualQty={sku.comparisonSku.annualShipment}
      />

      {(() => {
        const m = calcDynamicMultiplier(sku.channelRatios) ?? revenueMultiplier(sku.category);
        const baseRev = Math.round(sku.totalOrderQty * sku.price / 1.1 * m);
        const baseProfit = Math.round(baseRev * sku.contributionMarginRate / 100);
        const hasStep3 = step3Revenue !== undefined && step3Revenue > 0;
        const displayRev = hasStep3 ? step3Revenue! : baseRev;
        const displayProfit = hasStep3 ? (step3Profit ?? baseProfit) : baseProfit;
        const cmRate = hasStep3 && displayRev > 0
          ? Math.round((displayProfit / displayRev) * 1000) / 10
          : sku.contributionMarginRate;
        const hasValue = hasStep3 || (sku.totalOrderQty > 0 && sku.price > 0);
        return (
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-2">
              <ScoreCard
                label="예상 순매출"
                value={hasValue ? `₩${displayRev.toLocaleString()}` : '–'}
                sub={hasStep3 ? 'STEP3 기준' : ''}
              />
              <ScoreCard
                label="공헌이익"
                value={hasValue ? `₩${displayProfit.toLocaleString()}` : '–'}
                sub={`이익률 ${cmRate}%`}
                color="emerald"
              />
            </div>
            <p className="text-[10px] text-gray-400 px-0.5">
              {hasStep3 ? '* STEP3 채널별 실매출 기준' : '* 하단 채널 비중 변경 시 자동반영'}
            </p>
          </div>
        );
      })()}

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
function MemoBox({ skuId, memo, readOnly, onSave }: {
  skuId: string; memo: string; readOnly?: boolean; onSave: (html: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = memo ?? '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skuId]);

  function applyBold() { editorRef.current?.focus(); document.execCommand('bold'); }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); document.execCommand('bold'); }
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
          >B</button>
        )}
      </div>
      <div
        ref={editorRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onBlur={readOnly ? undefined : () => onSave(editorRef.current?.innerHTML ?? '')}
        onKeyDown={readOnly ? undefined : handleKeyDown}
        className={`w-full min-h-[90px] px-3 py-2.5 text-sm text-gray-700 leading-relaxed border border-gray-200 rounded-lg resize-none overflow-y-auto break-words ${
          readOnly ? 'bg-gray-50 cursor-not-allowed' : 'focus:outline-none focus:ring-2 focus:ring-indigo-400'
        }`}
        style={{ wordBreak: 'break-word' }}
        data-placeholder="메모를 입력하세요..."
      />
      <style>{`[contenteditable]:empty:before{content:attr(data-placeholder);color:#d1d5db;pointer-events:none}`}</style>
    </div>
  );
}

// ── 채널별 출고 분포 차트 ────────────────────────────────────────────────
const CH_COLORS: Record<string, string> = {
  '자사몰': '#6366f1', '스스': '#8b5cf6', '위탁': '#06b6d4',
  '쿠팡': '#f97316', 'B2B': '#10b981', '사입및페어': '#6b7280',
  '글로벌': '#ec4899', '일본': '#ef4444',
};

function ChannelDistChart({
  channelQty, configured, compareMode, samePeriodLabel, releaseMonth, releaseYear: _releaseYear,
}: {
  channelQty: Record<string, number> | null;
  configured: boolean;
  compareMode: 'rolling12' | 'samePeriod';
  samePeriodLabel: string | null;
  releaseMonth: number | null;
  releaseYear: number | null;
}) {
  const periodMonths = compareMode === 'samePeriod' && releaseMonth
    ? 12 - releaseMonth + 1
    : 12;
  const periodLabel = compareMode === 'samePeriod' ? samePeriodLabel : '직전 12개월';

  return (
    <div className="rounded-lg border border-gray-200 p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-600">채널별 월평균 출고 (자동)</span>
        {periodLabel && (
          <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">{periodLabel}</span>
        )}
      </div>

      {!configured ? (
        <div className="text-[10px] text-gray-400 text-center py-2">
          채널 데이터 미연결
          <div className="mt-0.5 text-gray-300">VITE_TABLEAU_CHANNEL_VIEW_ID 설정 필요</div>
        </div>
      ) : channelQty === null ? (
        <div className="text-[10px] text-gray-400 text-center py-2">채널 데이터 없음</div>
      ) : (() => {
        const total = Object.values(channelQty).reduce((s, q) => s + q, 0);
        const sorted = Object.entries(channelQty)
          .map(([ch, qty]) => ({ ch, qty, avgMonthly: Math.round(qty / periodMonths) }))
          .filter(({ avgMonthly }) => avgMonthly >= 10)
          .sort((a, b) => b.qty - a.qty);
        return (
          <div className="space-y-1.5">
            {sorted.map(({ ch, qty, avgMonthly }) => {
              const pct = total > 0 ? Math.round((qty / total) * 100) : 0;
              const color = CH_COLORS[ch] ?? '#94a3b8';
              return (
                <div key={ch} className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-600 w-12 text-right shrink-0 truncate">{ch}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <span className="text-[10px] font-semibold w-6 text-right shrink-0" style={{ color }}>{pct}%</span>
                  <span className="text-[10px] text-gray-400 w-12 text-right shrink-0">월 {avgMonthly.toLocaleString()}</span>
                </div>
              );
            })}
            <div className="flex items-center justify-between pt-1 border-t border-gray-100 mt-1">
              <span className="text-[10px] text-gray-400">합계</span>
              <span className="text-[10px] font-semibold text-gray-600">
                월평균 {Math.round(total / periodMonths).toLocaleString()} · 연 {total.toLocaleString()}
              </span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function ScoreCard({ label, value, sub, color = 'indigo' }: { label: string; value: string; sub: string; color?: 'indigo' | 'emerald' }) {
  const cls = color === 'emerald'
    ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
    : 'border-indigo-100 bg-indigo-50 text-indigo-700';
  return (
    <div className={`p-2.5 rounded-lg border text-center ${cls}`}>
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className={`text-sm font-bold break-all ${color === 'emerald' ? 'text-emerald-700' : 'text-indigo-700'}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
    </div>
  );
}
