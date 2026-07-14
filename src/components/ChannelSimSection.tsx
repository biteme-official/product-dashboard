import { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { useVisibleSkus } from '../hooks/useVisibleSkus';
import { useAuth } from '../store/auth';
import { isMdRole } from '../utils/pin';
import { MONTHS, CHANNELS, B2C_CHANNELS, type Month, type Channel } from '../types';
import { getChannelRate } from '../utils/calc';

const MONTH_LABELS: Record<Month, string> = {
  1: '1월', 2: '2월', 3: '3월', 4: '4월', 5: '5월', 6: '6월',
  7: '7월', 8: '8월', 9: '9월', 10: '10월', 11: '11월', 12: '12월',
};
const IS_NEXT_YEAR: Record<Month, boolean> = {
  1: true, 2: true, 3: false, 4: false, 5: false, 6: false,
  7: false, 8: false, 9: false, 10: false, 11: false, 12: false,
};

function formatWon(value: number): string {
  if (value <= 0) return '–';
  if (value >= 100_000_000) {
    const uk = value / 100_000_000;
    return `₩${Number.isInteger(uk) ? uk : uk.toFixed(1)}억`;
  }
  return `₩${Math.round(value / 10_000).toLocaleString()}만`;
}

export function ChannelSimSection() {
  const skus = useVisibleSkus();
  const activeCategory = useStore((s) => s.activeCategory);
  const activeBrand = useStore((s) => s.activeBrand);
  const updateChannelRatio = useStore((s) => s.updateChannelRatio);
  const resetChannelRatios = useStore((s) => s.resetChannelRatios);
  const applyChannelRatiosToFiltered = useStore((s) => s.applyChannelRatiosToFiltered);
  const persistSku = useStore((s) => s.persistSku);
  const { role } = useAuth();
  const canEdit = role === 'master' || isMdRole(role);

  const eligibleSkus = skus.filter(
    (sku) =>
      sku.category === activeCategory &&
      sku.monthlySplit.some((ms) => ms.ratio > 0) &&
      (activeBrand === '전체' || sku.brand === activeBrand),
  );

  const ALL_MODE = '__all__';
  const [selectedSkuId, setSelectedSkuId] = useState('');
  const isAllMode = selectedSkuId === ALL_MODE;

  useEffect(() => {
    if (eligibleSkus.length > 0 && selectedSkuId !== ALL_MODE && !eligibleSkus.find((s) => s.id === selectedSkuId)) {
      setSelectedSkuId(eligibleSkus[0].id);
    }
  }, [eligibleSkus, selectedSkuId]);

  const sku = isAllMode ? null : (skus.find((s) => s.id === selectedSkuId) ?? null);

  // 전체 합산 모드 데이터 (차트와 동일한 계산)
  const aggData = useMemo(() => {
    if (!isAllMode) return null;
    const result: Record<string, Record<number, { qty: number; rev: number }>> = {};
    for (const ch of CHANNELS) {
      result[ch] = {};
      for (const month of MONTHS) {
        let qty = 0, rev = 0;
        for (const s of eligibleSkus) {
          const ms = s.monthlySplit.find((m) => m.month === month);
          if (!ms || ms.quantity === 0) continue;
          const ratio = s.channelRatios.find((r) => r.channel === ch)?.ratio ?? 0;
          if (ratio === 0) continue;
          const q = Math.round((ms.quantity * ratio) / 100);
          qty += q;
          rev += Math.round(q * s.price * getChannelRate(ch));
        }
        result[ch][month] = { qty, rev };
      }
    }
    return result;
  }, [isAllMode, eligibleSkus]);

  const aggMonthTotals = useMemo(() => {
    if (!aggData) return null;
    return Object.fromEntries(MONTHS.map((month) => {
      const qty = CHANNELS.reduce((s, ch) => s + (aggData[ch][month]?.qty ?? 0), 0);
      const rev = CHANNELS.reduce((s, ch) => s + (aggData[ch][month]?.rev ?? 0), 0);
      return [month, { qty, rev }];
    }));
  }, [aggData]);

  const aggChannelTotals = useMemo(() => {
    if (!aggData) return null;
    return Object.fromEntries(CHANNELS.map((ch) => {
      const qty = MONTHS.reduce((s, m) => s + (aggData[ch][m]?.qty ?? 0), 0);
      const rev = MONTHS.reduce((s, m) => s + (aggData[ch][m]?.rev ?? 0), 0);
      return [ch, { qty, rev }];
    }));
  }, [aggData]);

  const aggGrandTotal = useMemo(() => {
    if (!aggChannelTotals) return null;
    const qty = CHANNELS.reduce((s, ch) => s + aggChannelTotals[ch].qty, 0);
    const rev = CHANNELS.reduce((s, ch) => s + aggChannelTotals[ch].rev, 0);
    return { qty, rev };
  }, [aggChannelTotals]);

  const totalChannelRatio = sku
    ? sku.channelRatios.reduce((sum, cr) => sum + cr.ratio, 0)
    : 0;
  const ratioOk = totalChannelRatio === 100;

  const monthlyQtys = MONTHS.map((month) => ({
    month,
    qty: sku?.monthlySplit.find((m) => m.month === month)?.quantity ?? 0,
  }));
  const grandMonthlyTotal = monthlyQtys.reduce((sum, m) => sum + m.qty, 0);

  function cellQty(channelRatio: number, monthQty: number) {
    return Math.round((monthQty * channelRatio) / 100);
  }

  function cellRevenue(channel: Channel, qty: number): number {
    if (!sku || qty <= 0) return 0;
    return Math.round(qty * sku.price * getChannelRate(channel));
  }

  // 월별 총 매출 (전 채널 합산)
  const monthlyRevenues = MONTHS.map((month) => {
    const monthQty = monthlyQtys.find((m) => m.month === month)?.qty ?? 0;
    const revenue = CHANNELS.reduce((sum, ch) => {
      const r = sku?.channelRatios.find((cr) => cr.channel === ch)?.ratio ?? 0;
      return sum + cellRevenue(ch, cellQty(r, monthQty));
    }, 0);
    return { month, revenue };
  });

  const grandTotalRevenue = monthlyRevenues.reduce((sum, m) => sum + m.revenue, 0);
  const grandTotalProfit = sku
    ? Math.round(grandTotalRevenue * sku.contributionMarginRate / 100)
    : 0;

  return (
    <section className="p-4 pb-10">
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-sm font-semibold text-gray-700 flex-shrink-0">
          채널별 / 월별 판매 비중 시뮬레이션
        </h2>

        {eligibleSkus.length === 0 ? (
          <span className="text-xs text-gray-400 px-3 py-1.5 border border-gray-200 rounded-lg bg-gray-50">
            월별 시뮬레이션에서 비중을 먼저 입력하세요
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <div className="relative inline-block">
              <select
                value={selectedSkuId}
                onChange={(e) => setSelectedSkuId(e.target.value)}
                className="text-xs pl-3 pr-8 py-1.5 border border-indigo-300 rounded-lg bg-white text-indigo-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 appearance-none cursor-pointer"
              >
                {eligibleSkus.length > 1 && (
                  <option value={ALL_MODE}>전체 SKU 합산 ({eligibleSkus.length}개)</option>
                )}
                {eligibleSkus.map((s) => (
                  <option key={s.id} value={s.id}>
                    [{s.category}] {s.skuName || '(SKU명 미입력)'}
                  </option>
                ))}
              </select>
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-400 text-[10px]">
                ▾
              </div>
            </div>
            {sku && canEdit && (
              <>
                <button
                  onClick={() => { resetChannelRatios(sku.id); persistSku(sku.id); }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors whitespace-nowrap"
                >
                  초기화(기본값)
                </button>
                <button
                  onClick={async () => { await persistSku(sku.id); await applyChannelRatiosToFiltered(sku.id); }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors whitespace-nowrap"
                >
                  전체 SKU 반영
                </button>
              </>
            )}
            {isAllMode && (
              <span className="text-xs text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                채널별 월별 매출 현황 그래프와 동일한 수치
              </span>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-400 mb-1 leading-relaxed">
        브랜드 필터 확인 후 '전체 SKU 반영' 클릭해주세요.
      </p>
      <p className="text-[11px] text-red-500 mb-3 leading-relaxed">
        *기획 단순 검토용으로 MD뷰에서 시뮬레이션 수정 시 해당 사항이 반영되지 않습니다.
      </p>

      {/* 전체 합산 모드 */}
      {isAllMode && aggData && aggMonthTotals && aggChannelTotals && aggGrandTotal && (
        <>
          <div className="flex items-center gap-4 mb-2 px-1">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">B2C</span>
              자사몰·스스·위탁 — 판매가 × 75%
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-700">B2B</span>
              쿠팡·B2B·사입및페어·글로벌·일본 — 판매가 × 55%
            </span>
          </div>

          <div className="rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
            <table className="w-full text-xs border-collapse" style={{ minWidth: '860px' }}>
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600 border-b border-r border-gray-200 w-24">채널</th>
                  {MONTHS.map((m) => (
                    <th
                      key={m}
                      className={`text-center px-2 py-2.5 font-semibold border-b border-r border-gray-200 ${
                        IS_NEXT_YEAR[m] ? 'text-blue-600 bg-blue-50/60' : 'text-gray-600'
                      }`}
                    >
                      {MONTH_LABELS[m]}
                      {IS_NEXT_YEAR[m] && <div className="text-blue-400 font-normal text-[10px] leading-tight">익년</div>}
                    </th>
                  ))}
                  <th className="text-center px-2 py-2.5 font-semibold text-gray-500 border-b border-gray-200 w-20">합계</th>
                </tr>
                <tr className="bg-indigo-50 border-b-2 border-indigo-200">
                  <td className="px-3 py-2 font-semibold text-indigo-800 border-r border-indigo-200 text-xs whitespace-nowrap">
                    월별 총매출
                  </td>
                  {MONTHS.map((month) => {
                    const rev = aggMonthTotals[month]?.rev ?? 0;
                    return (
                      <td key={month} className={`px-2 py-2 text-center font-semibold tabular-nums border-r border-indigo-100 ${IS_NEXT_YEAR[month] ? 'text-blue-700 bg-blue-100/40' : 'text-indigo-700'}`}>
                        {rev > 0 ? <span className="text-[10px]">{formatWon(rev)}</span> : <span className="text-indigo-300">–</span>}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center font-bold text-indigo-700 tabular-nums text-[10px]">
                    {aggGrandTotal.rev > 0 ? formatWon(aggGrandTotal.rev) : <span className="text-indigo-300">–</span>}
                  </td>
                </tr>
              </thead>
              <tbody>
                {CHANNELS.filter((ch) => (aggChannelTotals[ch]?.qty ?? 0) > 0).map((channel, rowIdx) => {
                  const isB2C = B2C_CHANNELS.includes(channel);
                  const chTotal = aggChannelTotals[channel];
                  return (
                    <tr key={channel} className={`border-b border-gray-100 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                      <td className="px-3 py-2 border-r border-gray-200 whitespace-nowrap font-medium text-gray-700">{channel}</td>
                      {MONTHS.map((month) => {
                        const d = aggData[channel][month];
                        return (
                          <td key={month} className={`px-2 py-1.5 text-center tabular-nums border-r border-gray-100 ${IS_NEXT_YEAR[month] ? 'bg-blue-50/30' : ''}`}>
                            <div className="text-gray-600">{d.qty > 0 ? d.qty.toLocaleString() : <span className="text-gray-300">–</span>}</div>
                            <div className={`text-[10px] mt-0.5 ${d.rev > 0 ? (isB2C ? 'text-emerald-600' : 'text-violet-600') : 'text-gray-300'}`}>
                              {formatWon(d.rev)}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-center tabular-nums">
                        <div className="font-semibold text-gray-700">{chTotal.qty > 0 ? chTotal.qty.toLocaleString() : <span className="text-gray-300">–</span>}</div>
                        <div className={`text-[10px] mt-0.5 font-medium ${chTotal.rev > 0 ? (isB2C ? 'text-emerald-600' : 'text-violet-600') : 'text-gray-300'}`}>
                          {formatWon(chTotal.rev)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                  <td className="px-3 py-2.5 font-semibold text-indigo-800 text-xs border-r border-indigo-200">합계</td>
                  {MONTHS.map((month) => {
                    const t = aggMonthTotals[month];
                    return (
                      <td key={month} className={`px-2 py-2.5 text-center tabular-nums border-r border-indigo-100 ${IS_NEXT_YEAR[month] ? 'bg-blue-100/40' : ''}`}>
                        <div className="font-semibold text-indigo-700">{t.qty > 0 ? t.qty.toLocaleString() : <span className="text-indigo-300">–</span>}</div>
                        <div className="text-[10px] mt-0.5 font-medium text-indigo-500">{formatWon(t.rev)}</div>
                      </td>
                    );
                  })}
                  <td className="px-2 py-2.5 text-center tabular-nums">
                    <div className="font-bold text-indigo-700">{aggGrandTotal.qty > 0 ? aggGrandTotal.qty.toLocaleString() : <span className="text-indigo-300">–</span>}</div>
                    <div className="text-[10px] mt-0.5 font-medium text-indigo-500">{formatWon(aggGrandTotal.rev)}</div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex items-center gap-4 mt-2 px-1 flex-wrap">
            <span className="text-xs text-gray-400">매출 = 수량 × 판매가 × (B2C 75% / B2B 55%)</span>
          </div>
        </>
      )}

      {sku && (
        <>
          {/* B2C/B2B 범례 */}
          <div className="flex items-center gap-4 mb-2 px-1">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">B2C</span>
              자사몰·스스·위탁 — 판매가 × 75%
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-700">B2B</span>
              쿠팡·B2B·사입및페어·글로벌·일본 — 판매가 × 55%
            </span>
          </div>

          <div className="rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
            <table className="w-full text-xs border-collapse" style={{ minWidth: '900px' }}>
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
                        IS_NEXT_YEAR[m] ? 'text-blue-600 bg-blue-50/60' : 'text-gray-600'
                      }`}
                    >
                      {MONTH_LABELS[m]}
                      {IS_NEXT_YEAR[m] && (
                        <div className="text-blue-400 font-normal text-[10px] leading-tight">익년</div>
                      )}
                    </th>
                  ))}
                  <th className="text-center px-2 py-2.5 font-semibold text-gray-500 border-b border-gray-200 w-20">
                    합계
                  </th>
                </tr>
                {/* 월별 총수량 행 */}
                <tr className="bg-indigo-50 border-b-2 border-indigo-200">
                  <td className="px-3 py-2 font-semibold text-indigo-800 border-r border-indigo-200 text-xs whitespace-nowrap">
                    월별 총수량
                  </td>
                  <td className="px-2 py-2 text-center text-indigo-300 border-r border-indigo-200 text-xs">–</td>
                  {monthlyQtys.map(({ month, qty }) => (
                    <td
                      key={month}
                      className={`px-2 py-2 text-center font-semibold tabular-nums border-r border-indigo-100 ${
                        IS_NEXT_YEAR[month] ? 'text-blue-700 bg-blue-100/40' : 'text-indigo-700'
                      }`}
                    >
                      {qty > 0 ? qty.toLocaleString() : <span className="text-indigo-300">–</span>}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center font-bold text-indigo-700 tabular-nums">
                    {grandMonthlyTotal > 0 ? grandMonthlyTotal.toLocaleString() : <span className="text-indigo-300">–</span>}
                  </td>
                </tr>
              </thead>

              <tbody>
                {CHANNELS.map((channel, rowIdx) => {
                  const cr = sku.channelRatios.find((r) => r.channel === channel);
                  const ratio = cr?.ratio ?? 0;
                  const isB2C = B2C_CHANNELS.includes(channel);

                  const channelTotalQty = monthlyQtys.reduce(
                    (sum, { qty }) => sum + cellQty(ratio, qty), 0,
                  );
                  const channelTotalRevenue = monthlyQtys.reduce(
                    (sum, { qty }) => sum + cellRevenue(channel, cellQty(ratio, qty)), 0,
                  );

                  return (
                    <tr
                      key={channel}
                      className={`border-b border-gray-100 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
                    >
                      {/* 채널명 */}
                      <td className="px-3 py-2 border-r border-gray-200 whitespace-nowrap">
                        <div className="font-medium text-gray-700">{channel}</div>
                      </td>
                      {/* 비중% 입력 */}
                      <td className="px-1 py-1 border-r border-gray-200">
                        <input
                          type="text"
                          inputMode="numeric"
                          disabled={!canEdit}
                          value={ratio === 0 ? '' : ratio}
                          onChange={(e) => {
                            if (!canEdit) return;
                            const val = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                            updateChannelRatio(sku.id, channel, val);
                          }}
                          onBlur={canEdit ? () => persistSku(sku.id) : undefined}
                          placeholder="0"
                          className={`w-full text-center text-xs rounded px-1 py-1 border border-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-400 ${
                            !canEdit ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'bg-white'
                          }`}
                        />
                      </td>
                      {/* 월별 수량 + 매출 */}
                      {monthlyQtys.map(({ month, qty }) => {
                        const q = cellQty(ratio, qty);
                        const rev = cellRevenue(channel, q);
                        return (
                          <td
                            key={month}
                            className={`px-2 py-1.5 text-center tabular-nums border-r border-gray-100 ${
                              IS_NEXT_YEAR[month] ? 'bg-blue-50/30' : ''
                            }`}
                          >
                            <div className="text-gray-600">
                              {q > 0 ? q.toLocaleString() : <span className="text-gray-300">–</span>}
                            </div>
                            <div className={`text-[10px] mt-0.5 ${
                              rev > 0
                                ? isB2C ? 'text-emerald-600' : 'text-violet-600'
                                : 'text-gray-300'
                            }`}>
                              {formatWon(rev)}
                            </div>
                          </td>
                        );
                      })}
                      {/* 채널 합계 */}
                      <td className="px-2 py-1.5 text-center tabular-nums">
                        <div className="font-semibold text-gray-700">
                          {channelTotalQty > 0 ? channelTotalQty.toLocaleString() : <span className="text-gray-300">–</span>}
                        </div>
                        <div className={`text-[10px] mt-0.5 font-medium ${
                          channelTotalRevenue > 0
                            ? isB2C ? 'text-emerald-600' : 'text-violet-600'
                            : 'text-gray-300'
                        }`}>
                          {formatWon(channelTotalRevenue)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                {/* 수량 + 매출 합계 행 */}
                <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                  <td className="px-3 py-2.5 font-semibold text-indigo-800 text-xs border-r border-indigo-200">
                    합계
                  </td>
                  <td className="px-2 py-2.5 text-center border-r border-indigo-200">
                    <span className={`font-bold text-xs ${
                      ratioOk ? 'text-green-600' : totalChannelRatio > 0 ? 'text-amber-600' : 'text-gray-400'
                    }`}>
                      {totalChannelRatio}%
                    </span>
                  </td>
                  {monthlyQtys.map(({ month, qty }) => {
                    const colQty = CHANNELS.reduce((sum, ch) => {
                      const r = sku.channelRatios.find((cr) => cr.channel === ch)?.ratio ?? 0;
                      return sum + cellQty(r, qty);
                    }, 0);
                    const colRev = monthlyRevenues.find((m) => m.month === month)?.revenue ?? 0;
                    return (
                      <td
                        key={month}
                        className={`px-2 py-2.5 text-center tabular-nums border-r border-indigo-100 ${
                          IS_NEXT_YEAR[month] ? 'bg-blue-100/40' : ''
                        }`}
                      >
                        <div className="font-semibold text-indigo-700">
                          {colQty > 0 ? colQty.toLocaleString() : <span className="text-indigo-300">–</span>}
                        </div>
                        <div className="text-[10px] mt-0.5 font-medium text-indigo-500">
                          {formatWon(colRev)}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-2 py-2.5 text-center tabular-nums">
                    <div className="font-bold text-indigo-700">
                      {(() => {
                        const t = CHANNELS.reduce((sum, ch) => {
                          const r = sku.channelRatios.find((cr) => cr.channel === ch)?.ratio ?? 0;
                          return sum + monthlyQtys.reduce((s, { qty }) => s + cellQty(r, qty), 0);
                        }, 0);
                        return t > 0 ? t.toLocaleString() : <span className="text-indigo-300">–</span>;
                      })()}
                    </div>
                    <div className="text-[10px] mt-0.5 font-medium text-indigo-500">
                      {formatWon(grandTotalRevenue)}
                    </div>
                  </td>
                </tr>
                {/* 공헌이익 행 */}
                <tr className="bg-indigo-50/60 border-t border-indigo-100">
                  <td colSpan={2} className="px-3 py-2 font-semibold text-indigo-700 text-xs border-r border-indigo-200 whitespace-nowrap">
                    공헌이익
                    {sku.contributionMarginRate > 0 && (
                      <span className="ml-1 text-indigo-400 font-normal">({sku.contributionMarginRate}%)</span>
                    )}
                  </td>
                  {monthlyQtys.map(({ month }) => {
                    const colRev = monthlyRevenues.find((m) => m.month === month)?.revenue ?? 0;
                    const colProfit = Math.round(colRev * sku.contributionMarginRate / 100);
                    return (
                      <td
                        key={month}
                        className={`px-2 py-2 text-center font-semibold tabular-nums text-indigo-600 border-r border-indigo-100 ${
                          IS_NEXT_YEAR[month] ? 'bg-blue-50/40' : ''
                        }`}
                      >
                        {formatWon(colProfit)}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center font-bold text-indigo-700 tabular-nums">
                    {formatWon(grandTotalProfit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 범례 */}
          <div className="flex items-center gap-4 mt-2 px-1 flex-wrap">
            <span className={`text-xs font-medium ${
              ratioOk ? 'text-green-600' : totalChannelRatio > 0 ? 'text-amber-600' : 'text-gray-400'
            }`}>
              채널 비중 합계: {totalChannelRatio}%
              {ratioOk ? ' ✓' : totalChannelRatio > 0 ? ' — 100%로 맞춰주세요' : ''}
            </span>
            <span className="text-xs text-gray-400">매출 = 수량 × 판매가 × (B2C 75% / B2B 55%)</span>
            <span className="text-xs text-gray-400">공헌이익 = 매출 × 이익률%</span>
          </div>
        </>
      )}
    </section>
  );
}
