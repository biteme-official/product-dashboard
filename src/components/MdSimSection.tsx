import { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { useAuth } from '../store/auth';
import { MONTHS, CHANNELS, B2C_CHANNELS, type Month, type Channel } from '../types';
import { getChannelRate } from '../utils/calc';

const MONTH_LABELS: Record<Month, string> = {
  7: '7월', 8: '8월', 9: '9월', 10: '10월', 11: '11월', 12: '12월',
  1: '1월', 2: '2월',
};
const IS_NEXT_YEAR: Record<Month, boolean> = {
  7: false, 8: false, 9: false, 10: false, 11: false, 12: false,
  1: true, 2: true,
};

function formatWon(value: number): string {
  if (value <= 0) return '–';
  if (value >= 100_000_000) {
    const uk = value / 100_000_000;
    return `₩${Number.isInteger(uk) ? uk : uk.toFixed(1)}억`;
  }
  return `₩${Math.round(value / 10_000).toLocaleString()}만`;
}

export function MdSimSection() {
  const skus = useStore((s) => s.skus);
  const activeCategory = useStore((s) => s.activeCategory);
  const activeBrand = useStore((s) => s.activeBrand);
  const updateChannelMonthRatio = useStore((s) => s.updateChannelMonthRatio);
  const persistSku = useStore((s) => s.persistSku);
  const { role } = useAuth();
  const canEdit = role === 'master' || role === 'md';

  const eligibleSkus = useMemo(
    () =>
      skus.filter(
        (s) =>
          s.category === activeCategory &&
          (activeBrand === '전체' || s.brand === activeBrand),
      ),
    [skus, activeCategory, activeBrand],
  );

  const [selectedSkuId, setSelectedSkuId] = useState('');

  useEffect(() => {
    if (
      eligibleSkus.length > 0 &&
      !eligibleSkus.find((s) => s.id === selectedSkuId)
    ) {
      setSelectedSkuId(eligibleSkus[0].id);
    }
  }, [eligibleSkus, selectedSkuId]);

  const sku = skus.find((s) => s.id === selectedSkuId) ?? null;

  // 특정 채널+월의 비중 조회
  function getCMRatio(channel: Channel, month: Month): number {
    if (!sku) return 0;
    return (
      sku.channelMonthlySplit.find(
        (e) => e.channel === channel && e.month === month,
      )?.ratio ?? 0
    );
  }

  // 채널별 합계 (모든 월 합산)
  const channelTotals = useMemo(() => {
    if (!sku) return [];
    return CHANNELS.map((ch) => {
      let totalRatio = 0;
      let totalQty = 0;
      let totalRevenue = 0;
      for (const month of MONTHS) {
        const r = getCMRatio(ch, month);
        const qty = Math.round((sku.totalOrderQty * r) / 100);
        totalRatio += r;
        totalQty += qty;
        totalRevenue += Math.round(qty * sku.price * getChannelRate(ch));
      }
      const totalProfit = Math.round(
        totalRevenue * (sku.contributionMarginRate / 100),
      );
      return { channel: ch, totalRatio, totalQty, totalRevenue, totalProfit };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sku, selectedSkuId]);

  // 월별 합계 (모든 채널 합산)
  const monthTotals = useMemo(() => {
    if (!sku) return [];
    return MONTHS.map((month) => {
      let totalRatio = 0;
      let totalQty = 0;
      for (const ch of CHANNELS) {
        const r = getCMRatio(ch, month);
        totalRatio += r;
        totalQty += Math.round((sku.totalOrderQty * r) / 100);
      }
      return { month, totalRatio, totalQty };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sku, selectedSkuId]);

  const grandTotalRatio = channelTotals.reduce((s, c) => s + c.totalRatio, 0);
  const grandTotalQty = channelTotals.reduce((s, c) => s + c.totalQty, 0);
  const grandTotalRevenue = channelTotals.reduce((s, c) => s + c.totalRevenue, 0);
  const grandTotalProfit = channelTotals.reduce((s, c) => s + c.totalProfit, 0);

  const ratioOk = Math.round(grandTotalRatio) === 100;

  return (
    <section className="p-4 pb-10">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-700 flex-shrink-0">
          채널 × 월별 출고 시뮬레이션
        </h2>

        {eligibleSkus.length === 0 ? (
          <span className="text-xs text-gray-400 px-3 py-1.5 border border-gray-200 rounded-lg bg-gray-50">
            해당 카테고리에 SKU가 없습니다.
          </span>
        ) : (
          <div className="relative inline-block">
            <select
              value={selectedSkuId}
              onChange={(e) => setSelectedSkuId(e.target.value)}
              className="text-xs pl-3 pr-8 py-1.5 border border-indigo-300 rounded-lg bg-white text-indigo-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 appearance-none cursor-pointer"
            >
              {eligibleSkus.map((s) => (
                <option key={s.id} value={s.id}>
                  [{s.brand}] {s.name || '(SKU명 미입력)'}
                </option>
              ))}
            </select>
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-400 text-[10px]">
              ▾
            </div>
          </div>
        )}

        {sku && (
          <span className="text-xs text-gray-400">
            총 발주량:{' '}
            <span className="font-semibold text-gray-600">
              {sku.totalOrderQty.toLocaleString()}장
            </span>
          </span>
        )}
      </div>

      <p className="text-[11px] text-gray-400 mb-3 leading-relaxed">
        각 셀에 채널×월 출고 비중(%)을 직접 입력하세요. 전체 합계가 100%가 되도록 맞춰주세요.
      </p>

      {sku && (
        <>
          {/* B2C/B2B 범례 */}
          <div className="flex items-center gap-4 mb-2 px-1 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                B2C
              </span>
              자사몰·스스·위탁 — 판매가 × 80%
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-700">
                B2B
              </span>
              쿠팡·B2B·사입및페어·글로벌·일본 — 판매가 × 60%
            </span>
          </div>

          <div className="rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
            <table
              className="w-full text-xs border-collapse"
              style={{ minWidth: '860px' }}
            >
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600 border-b border-r border-gray-200 w-24">
                    채널
                  </th>
                  <th className="text-center px-2 py-2.5 font-semibold text-gray-600 border-b border-r border-gray-200 w-14">
                    비중%
                  </th>
                  {MONTHS.map((m) => (
                    <th
                      key={m}
                      className={`text-center px-2 py-2.5 font-semibold border-b border-r border-gray-200 ${
                        IS_NEXT_YEAR[m]
                          ? 'text-blue-600 bg-blue-50/60'
                          : 'text-gray-600'
                      }`}
                    >
                      {MONTH_LABELS[m]}
                      {IS_NEXT_YEAR[m] && (
                        <div className="text-blue-400 font-normal text-[10px] leading-tight">
                          익년
                        </div>
                      )}
                    </th>
                  ))}
                  <th className="text-center px-2 py-2.5 font-semibold text-gray-500 border-b border-gray-200 w-24">
                    합계
                  </th>
                </tr>
              </thead>

              <tbody>
                {CHANNELS.map((channel, rowIdx) => {
                  const ct = channelTotals.find((c) => c.channel === channel)!;
                  const isB2C = B2C_CHANNELS.includes(channel);
                  return (
                    <tr
                      key={channel}
                      className={`border-b border-gray-100 ${
                        rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                      }`}
                    >
                      {/* 채널명 */}
                      <td className="px-3 py-2 border-r border-gray-200 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] font-semibold px-1 py-0.5 rounded ${
                              isB2C
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-violet-100 text-violet-700'
                            }`}
                          >
                            {isB2C ? 'B2C' : 'B2B'}
                          </span>
                          <span className="font-medium text-gray-700">{channel}</span>
                        </div>
                      </td>

                      {/* 비중% 합산 (읽기전용) */}
                      <td className="px-2 py-2 text-center border-r border-gray-200">
                        <span
                          className={`text-xs font-semibold ${
                            ct.totalRatio > 0 ? 'text-indigo-600' : 'text-gray-300'
                          }`}
                        >
                          {ct.totalRatio > 0
                            ? `${Math.round(ct.totalRatio * 10) / 10}%`
                            : '–'}
                        </span>
                      </td>

                      {/* 월별 셀: ratio 입력 + qty 표시 */}
                      {MONTHS.map((month) => {
                        const ratio = getCMRatio(channel, month);
                        const qty = Math.round((sku.totalOrderQty * ratio) / 100);
                        return (
                          <td
                            key={month}
                            className={`px-1.5 py-1 text-center border-r border-gray-100 ${
                              IS_NEXT_YEAR[month] ? 'bg-blue-50/30' : ''
                            }`}
                          >
                            <div className="flex items-center justify-center gap-0.5">
                              <input
                                type="text"
                                inputMode="decimal"
                                disabled={!canEdit}
                                value={ratio === 0 ? '' : ratio}
                                onChange={(e) => {
                                  if (!canEdit) return;
                                  const val = Math.max(
                                    0,
                                    Math.min(100, parseFloat(e.target.value) || 0),
                                  );
                                  updateChannelMonthRatio(sku.id, channel, month, val);
                                }}
                                onBlur={canEdit ? () => persistSku(sku.id) : undefined}
                                placeholder="0"
                                className={`w-11 text-center text-xs rounded px-1 py-0.5 border border-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-400 tabular-nums ${
                                  !canEdit
                                    ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                                    : 'bg-white'
                                }`}
                              />
                              <span className="text-gray-400 text-[10px]">%</span>
                            </div>
                            <div className="text-[10px] mt-0.5 text-gray-500 tabular-nums">
                              {qty > 0 ? qty.toLocaleString() : (
                                <span className="text-gray-300">–</span>
                              )}
                            </div>
                          </td>
                        );
                      })}

                      {/* 채널 합계 */}
                      <td className="px-2 py-1.5 text-center tabular-nums">
                        <div
                          className={`font-semibold text-xs ${
                            ct.totalQty > 0 ? 'text-gray-700' : 'text-gray-300'
                          }`}
                        >
                          {ct.totalQty > 0 ? ct.totalQty.toLocaleString() : '–'}
                        </div>
                        <div
                          className={`text-[10px] mt-0.5 font-medium ${
                            ct.totalRevenue > 0
                              ? isB2C
                                ? 'text-emerald-600'
                                : 'text-violet-600'
                              : 'text-gray-300'
                          }`}
                        >
                          {formatWon(ct.totalRevenue)}
                        </div>
                        <div
                          className={`text-[10px] mt-0.5 ${
                            ct.totalProfit > 0 ? 'text-indigo-500' : 'text-gray-300'
                          }`}
                        >
                          {formatWon(ct.totalProfit)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                {/* 월별 합계 행 */}
                <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                  <td className="px-3 py-2.5 font-semibold text-indigo-800 text-xs border-r border-indigo-200">
                    합계
                  </td>
                  <td className="px-2 py-2.5 text-center border-r border-indigo-200">
                    <span
                      className={`font-bold text-xs ${
                        ratioOk
                          ? 'text-green-600'
                          : grandTotalRatio > 0
                          ? 'text-amber-600'
                          : 'text-gray-400'
                      }`}
                    >
                      {Math.round(grandTotalRatio * 10) / 10}%
                      {ratioOk ? ' ✓' : ''}
                    </span>
                  </td>
                  {monthTotals.map(({ month, totalRatio, totalQty }) => (
                    <td
                      key={month}
                      className={`px-2 py-2.5 text-center tabular-nums border-r border-indigo-100 ${
                        IS_NEXT_YEAR[month] ? 'bg-blue-100/40' : ''
                      }`}
                    >
                      <div
                        className={`font-semibold text-xs ${
                          totalRatio > 0 ? 'text-indigo-600' : 'text-indigo-300'
                        }`}
                      >
                        {totalRatio > 0
                          ? `${Math.round(totalRatio * 10) / 10}%`
                          : '–'}
                      </div>
                      <div className="text-[10px] mt-0.5 font-medium text-indigo-500">
                        {totalQty > 0 ? totalQty.toLocaleString() : (
                          <span className="text-indigo-300">–</span>
                        )}
                      </div>
                    </td>
                  ))}
                  <td className="px-2 py-2.5 text-center tabular-nums">
                    <div className="font-bold text-indigo-700 text-xs">
                      {grandTotalQty > 0 ? grandTotalQty.toLocaleString() : (
                        <span className="text-indigo-300">–</span>
                      )}
                    </div>
                    <div className="text-[10px] mt-0.5 font-medium text-indigo-500">
                      {formatWon(grandTotalRevenue)}
                    </div>
                    <div className="text-[10px] mt-0.5 text-indigo-400">
                      {formatWon(grandTotalProfit)}
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 하단 범례 */}
          <div className="flex items-center gap-4 mt-2 px-1 flex-wrap">
            <span
              className={`text-xs font-medium ${
                ratioOk
                  ? 'text-green-600'
                  : grandTotalRatio > 0
                  ? 'text-amber-600'
                  : 'text-gray-400'
              }`}
            >
              전체 비중 합계: {Math.round(grandTotalRatio * 10) / 10}%
              {ratioOk ? ' ✓' : grandTotalRatio > 0 ? ' — 100%로 맞춰주세요' : ''}
            </span>
            <span className="text-xs text-gray-400">
              수량 = 총 발주량 × 비중%
            </span>
            <span className="text-xs text-gray-400">
              매출 = 수량 × 판매가 × (B2C 80% / B2B 60%)
            </span>
            <span className="text-xs text-gray-400">
              공헌이익 = 매출 × {sku.contributionMarginRate}%
            </span>
          </div>
        </>
      )}
    </section>
  );
}
