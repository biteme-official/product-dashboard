import { useRef } from 'react';
import { useStore } from '../store';
import { useAuth } from '../store/auth';
import { isMdRole } from '../utils/pin';
import { MONTHS, getSkuMonths, type Month } from '../types';

/** 1억 이상이면 억 단위, 그 미만이면 만 단위로 표시 */
function formatWon(value: number): string {
  if (value <= 0) return '–';
  if (value >= 100_000_000) {
    const uk = value / 100_000_000;
    const str = Number.isInteger(uk) ? `${uk}억` : `${uk.toFixed(1)}억`;
    return `₩${str}`;
  }
  return `₩${Math.round(value / 10_000).toLocaleString()}만`;
}

const MONTH_LABELS: Record<Month, string> = {
  1: '1월', 2: '2월', 3: '3월', 4: '4월', 5: '5월', 6: '6월',
  7: '7월', 8: '8월', 9: '9월', 10: '10월', 11: '11월', 12: '12월',
};

/** 이 뷰는 7~2월 고정 집계이므로 1·2월만 익년 처리 */
const IS_NEXT_YEAR: Record<Month, boolean> = {
  1: true, 2: true, 3: false, 4: false, 5: false, 6: false,
  7: false, 8: false, 9: false, 10: false, 11: false, 12: false,
};

export function MonthlySalesSection() {
  const skus = useStore((s) => s.skus);
  const activeCategory = useStore((s) => s.activeCategory);
  const activeBrand = useStore((s) => s.activeBrand);
  const updateMonthlySplit = useStore((s) => s.updateMonthlySplit);
  const persistSku = useStore((s) => s.persistSku);
  const { role } = useAuth();
  const canEdit = role === 'master' || isMdRole(role);

  const filteredSkus = skus.filter(
    (s) =>
      s.category === activeCategory &&
      (activeBrand === '전체' || s.brand === activeBrand),
  );
  if (filteredSkus.length === 0) return null;

  // 월별 합계 (각 SKU의 출시월 기준 8개월 윈도우만 합산)
  const monthTotals = MONTHS.map((month) => ({
    month,
    totalRevenue: filteredSkus.reduce((sum, sku) => {
      const skuMs = sku.monthlySplit.find((m) => m.month === month);
      if (!skuMs) return sum;
      const skuMonthSet = new Set(getSkuMonths(sku.releaseDate));
      return sum + (skuMonthSet.has(month) ? skuMs.revenue : 0);
    }, 0),
    totalProfit: filteredSkus.reduce((sum, sku) => {
      const skuMs = sku.monthlySplit.find((m) => m.month === month);
      if (!skuMs) return sum;
      const skuMonthSet = new Set(getSkuMonths(sku.releaseDate));
      return sum + (skuMonthSet.has(month) ? skuMs.contributionProfit : 0);
    }, 0),
  }));

  return (
    <section className="p-4 pb-8">
      <h2 className="text-sm font-semibold text-gray-700 mb-1">
        월별 판매 비중 시뮬레이션
        <span className="ml-2 text-xs text-gray-400 font-normal">7월 – 익년 2월</span>
      </h2>
      <p className="text-[11px] text-red-500 mb-3 leading-relaxed">
        *기획 단순 검토용으로 MD뷰에서 시뮬레이션 수정 시 해당 사항이 반영되지 않습니다.
      </p>

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-3 py-2.5 font-semibold text-gray-600 border-b border-r border-gray-200 w-36">
                SKU명
              </th>
              <th className="text-right px-3 py-2.5 font-semibold text-gray-600 border-b border-r border-gray-200 w-20">
                총발주
              </th>
              <th className="text-left px-3 py-2.5 font-semibold text-gray-600 border-b border-r border-gray-200 w-24">
                출시일
              </th>
              {MONTHS.map((m) => (
                <th
                  key={m}
                  className={`text-center px-2 py-2.5 font-semibold border-b border-r border-gray-200 last:border-r-0 w-[9%] ${
                    IS_NEXT_YEAR[m]
                      ? 'text-blue-600 bg-blue-50/60'
                      : 'text-gray-600'
                  }`}
                >
                  {MONTH_LABELS[m]}
                  {IS_NEXT_YEAR[m] && (
                    <div className="text-blue-400 font-normal text-[10px] leading-tight">익년</div>
                  )}
                </th>
              ))}
            </tr>
            {/* 서브 헤더 */}
            <tr className="bg-gray-50 border-b border-gray-200">
              <th colSpan={3} className="border-r border-gray-200" />
              {MONTHS.map((m) => (
                <th key={m} className={`border-r border-gray-100 last:border-r-0 px-1 pb-1.5 ${IS_NEXT_YEAR[m] ? 'bg-blue-50/60' : ''}`}>
                  <div className="grid grid-cols-2 gap-0.5 text-center">
                    <span className="text-gray-400 font-normal">비중%</span>
                    <span className="text-gray-400 font-normal">수량</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filteredSkus.map((sku, rowIdx) => {
              const skuMonthSet = new Set(getSkuMonths(sku.releaseDate));

              // 활성 월들의 비중 합산
              const activeRatioSum = sku.monthlySplit
                .filter((ms) => skuMonthSet.has(ms.month))
                .reduce((sum, ms) => sum + ms.ratio, 0);
              const hasAnyRatio = activeRatioSum > 0;
              const isWarning = hasAnyRatio && activeRatioSum !== 100;
              const isComplete = hasAnyRatio && activeRatioSum === 100;

              return (
                <tr
                  key={sku.id}
                  className={`border-b border-gray-100 ${
                    rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                  }`}
                >
                  {/* SKU명 + 경고 */}
                  <td className="px-3 py-2 border-r border-gray-100">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-gray-800 leading-tight truncate">
                        {sku.name || '(미입력)'}
                      </span>
                      <div className="flex gap-1">
                        {isWarning && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                            ⚠ {activeRatioSum}%
                          </span>
                        )}
                        {isComplete && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 whitespace-nowrap">
                            ✓ 100%
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* 총발주량 */}
                  <td className="px-3 py-2 text-right text-gray-700 border-r border-gray-100 whitespace-nowrap">
                    {sku.totalOrderQty.toLocaleString()}
                  </td>

                  {/* 출시일 */}
                  <td className="px-3 py-2 text-gray-500 border-r border-gray-100 whitespace-nowrap">
                    {sku.releaseDate
                      ? sku.releaseDate.slice(2).replace(/-/g, '.')
                      : '–'}
                  </td>

                  {/* 월별 셀 */}
                  {MONTHS.map((month) => {
                    const ms = sku.monthlySplit.find((m) => m.month === month);
                    const disabled = !skuMonthSet.has(month);
                    return (
                      <MonthCell
                        key={month}
                        ratio={ms?.ratio ?? 0}
                        quantity={ms?.quantity ?? 0}
                        disabled={disabled}
                        readOnly={!canEdit}
                        isNextYear={IS_NEXT_YEAR[month]}
                        onRatioChange={(val) => updateMonthlySplit(sku.id, month, val)}
                        onBlur={() => persistSku(sku.id)}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>

          {/* 합계 행 */}
          <tfoot>
            <tr className="bg-indigo-50 border-t-2 border-indigo-200">
              <td colSpan={3} className="px-3 py-2.5 border-r border-indigo-200">
                <div className="font-semibold text-indigo-800 text-xs">월별 합계</div>
                <div className="text-indigo-400 text-xs mt-0.5">매출 / 공헌이익</div>
              </td>
              {monthTotals.map(({ month, totalRevenue, totalProfit }) => (
                <td
                  key={month}
                  className={`px-2 py-2.5 text-center border-r border-indigo-100 last:border-r-0 ${IS_NEXT_YEAR[month as Month] ? 'bg-blue-100/40' : ''}`}
                >
                  <div className="font-semibold text-indigo-700 whitespace-nowrap">
                    {formatWon(totalRevenue)}
                  </div>
                  <div className="text-emerald-600 text-xs mt-0.5 whitespace-nowrap">
                    {formatWon(totalProfit)}
                  </div>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 범례 */}
      <div className="flex items-center gap-4 mt-2 px-1">
        <span className="flex items-center gap-1 text-xs text-gray-400">
          <span className="w-2 h-2 rounded-full bg-gray-200 inline-block" />
          출시 전 월 (비활성)
        </span>
        <span className="flex items-center gap-1 text-xs text-gray-400">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          비중 합계 ≠ 100%
        </span>
        <span className="flex items-center gap-1 text-xs text-gray-400">
          <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
          비중 합계 = 100%
        </span>
        <span className="text-xs text-gray-400">합계 행: 만원 단위</span>
      </div>
    </section>
  );
}

interface MonthCellProps {
  ratio: number;
  quantity: number;
  disabled: boolean;
  readOnly?: boolean;
  isNextYear: boolean;
  onRatioChange: (val: number) => void;
  onBlur: () => void;
}

function MonthCell({ ratio, quantity, disabled, readOnly, isNextYear, onRatioChange, onBlur }: MonthCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const nextYearCls = isNextYear ? 'bg-blue-50/40' : '';

  if (disabled) {
    return (
      <td className={`border-r border-gray-100 last:border-r-0 px-1 py-1.5 bg-gray-50 ${nextYearCls}`}>
        <div className="grid grid-cols-2 gap-0.5 items-center">
          <div className="text-center text-gray-300 text-xs">–</div>
          <div className="text-center text-gray-300 text-xs">–</div>
        </div>
      </td>
    );
  }

  return (
    <td
      className={`border-r border-gray-100 last:border-r-0 px-1 py-1.5 ${nextYearCls}`}
      onClick={() => !readOnly && inputRef.current?.focus()}
    >
      <div className="grid grid-cols-2 gap-0.5 items-center">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          disabled={readOnly}
          value={ratio === 0 ? '' : ratio}
          onChange={(e) => {
            if (readOnly) return;
            const val = Math.min(100, Math.max(0, Number(e.target.value) || 0));
            onRatioChange(val);
          }}
          onBlur={readOnly ? undefined : onBlur}
          placeholder="0"
          className={`w-full text-center text-xs rounded px-1 py-1 border border-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-400 ${
            readOnly ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'bg-white'
          }`}
        />
        <div className="text-center text-gray-500 font-medium tabular-nums">
          {quantity > 0 ? (
            quantity.toLocaleString()
          ) : (
            <span className="text-gray-300">–</span>
          )}
        </div>
      </div>
    </td>
  );
}
