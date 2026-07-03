import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { SkuData, Channel, YearMonth } from '../types';
import { isSkuActiveForYearMonth } from '../types';
import {
  calcChannelMonthMetrics, calcSkuChannelTotals, addMetrics,
  formatWon, cmBadgeCls, ZERO_METRICS,
  type VarCostRatioMap,
} from '../utils/mdSummaryCalc';

type MonthChartPoint = { label: string; revenue: number; profit: number };

function ChannelMonthlyChart({ data }: { data: MonthChartPoint[] }) {
  if (data.every((d) => d.revenue === 0)) return null;
  const fmtWon = (v: number) => (v === 0 ? '0' : formatWon(v));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center gap-4 mb-3">
        <h3 className="text-xs font-semibold text-gray-600">월별 예상 순매출 / 공헌이익</h3>
        <div className="flex items-center gap-3 ml-auto">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-indigo-400 inline-block" />
            <span className="text-[11px] text-gray-500">순매출</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-0.5 bg-emerald-500 inline-block" />
            <span className="text-[11px] text-gray-500">공헌이익</span>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 4, right: 50, bottom: 0, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <YAxis
            yAxisId="rev"
            orientation="left"
            tickFormatter={fmtWon}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <YAxis
            yAxisId="profit"
            orientation="right"
            tickFormatter={fmtWon}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as MonthChartPoint;
              return (
                <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs min-w-[160px]">
                  <p className="font-semibold text-gray-700 mb-2">{d.label}</p>
                  <div className="space-y-1">
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-400">순매출</span>
                      <span className="text-indigo-600 font-medium tabular-nums">{formatWon(d.revenue)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-gray-400">공헌이익</span>
                      <span className={`font-medium tabular-nums ${d.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatWon(d.profit)}</span>
                    </div>
                  </div>
                </div>
              );
            }}
          />
          <Bar yAxisId="rev" dataKey="revenue" name="순매출" fill="#818cf8" radius={[3, 3, 0, 0]} maxBarSize={40} />
          <Line
            yAxisId="profit"
            dataKey="profit"
            name="공헌이익"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ fill: '#10b981', r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MdChannelDetail({ skus, channel, months, varCostMap }: { skus: SkuData[]; channel: Channel; months: YearMonth[]; varCostMap: VarCostRatioMap }) {
  const channelTotal = skus.reduce(
    (acc, sku) => addMetrics(acc, calcSkuChannelTotals(sku, channel, months, varCostMap)),
    ZERO_METRICS,
  );
  const cm = channelTotal.revenue > 0
    ? Math.round((channelTotal.profit / channelTotal.revenue) * 1000) / 10
    : null;

  // 월별 합계 (YearMonth 단위)
  const monthTotals = months.map((ym) => {
    const metrics = skus.reduce((acc, sku) => {
      if (!isSkuActiveForYearMonth(sku, ym)) return acc;
      return addMetrics(acc, calcChannelMonthMetrics(sku, channel, ym.month, varCostMap));
    }, ZERO_METRICS);
    return { ym, metrics };
  });

  const chartData: MonthChartPoint[] = months.map((ym, idx) => {
    const showYear = idx === 0 || months[idx - 1].year !== ym.year;
    const label = showYear
      ? `${ym.month}월 '${String(ym.year).slice(2)}`
      : `${ym.month}월`;
    const metrics = monthTotals[idx].metrics;
    return { label, revenue: metrics.revenue, profit: metrics.profit };
  });

  const skuRows = skus
    .map((sku) => {
      const totals = calcSkuChannelTotals(sku, channel, months, varCostMap);
      return { sku, totals };
    })
    .sort((a, b) => b.totals.revenue - a.totals.revenue);

  function monthLabel(ym: YearMonth, idx: number) {
    const showYear = idx === 0 || months[idx - 1].year !== ym.year;
    return showYear ? `${ym.month}월 '${String(ym.year).slice(2)}` : `${ym.month}월`;
  }

  return (
    <div className="space-y-4">
      {/* 채널 KPI */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[140px] bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
          <p className="text-[11px] text-gray-400 font-medium mb-1">STEP2 목표량</p>
          <p className="text-lg font-bold text-gray-900">{channelTotal.qty.toLocaleString()}</p>
        </div>
        <div className="flex-1 min-w-[140px] bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
          <p className="text-[11px] text-gray-400 font-medium mb-1">예상 순매출</p>
          <p className="text-lg font-bold text-gray-900">{formatWon(channelTotal.revenue)}</p>
          {channelTotal.revenue > 0 && (
            <p className="text-[11px] text-gray-400 mt-0.5">{channelTotal.revenue.toLocaleString()}원</p>
          )}
        </div>
        <div className="flex-1 min-w-[140px] bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
          <p className="text-[11px] text-gray-400 font-medium mb-1">예상 공헌이익</p>
          <p className="text-lg font-bold text-gray-900">{formatWon(channelTotal.profit)}</p>
          {cm !== null && (
            <p className="text-[11px] mt-0.5">
              <span className={`px-1.5 py-0.5 rounded-full font-semibold ${cmBadgeCls(cm)}`}>CM {cm}%</span>
            </p>
          )}
        </div>
      </div>

      <ChannelMonthlyChart data={chartData} />

      {/* SKU × 월 목표량 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
          <h3 className="text-xs font-semibold text-gray-600">SKU별 월별 목표량</h3>
        </div>
        {skus.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400">해당 채널에 데이터가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '160px' }} />
                {months.map((_, i) => <col key={i} />)}
                <col style={{ width: '80px' }} />
                <col style={{ width: '80px' }} />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/40">
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">SKU명</th>
                  {months.map((ym, idx) => (
                    <th key={`${ym.year}-${ym.month}`} className="px-1 py-2 text-center font-semibold text-gray-500">
                      {monthLabel(ym, idx)}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right font-semibold text-gray-500">수량</th>
                  <th className="px-2 py-2 text-right font-semibold text-gray-500">순매출</th>
                </tr>
              </thead>
              <tbody>
                {skuRows.map(({ sku, totals }) => (
                  <tr key={sku.id} className="border-b border-gray-50 last:border-0 hover:bg-indigo-50/20 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-gray-800 truncate" title={sku.name}>
                      {sku.name || <span className="text-gray-300">(미입력)</span>}
                    </td>
                    {months.map((ym) => {
                      const active = isSkuActiveForYearMonth(sku, ym);
                      if (!active) {
                        return (
                          <td key={`${ym.year}-${ym.month}`} className="px-1 py-2.5 text-center text-gray-300">–</td>
                        );
                      }
                      const metrics = calcChannelMonthMetrics(sku, channel, ym.month, varCostMap);
                      return (
                        <td key={`${ym.year}-${ym.month}`} className={`px-1 py-2.5 text-center tabular-nums ${metrics.qty === 0 ? 'text-gray-300' : 'text-gray-700 font-medium'}`}>
                          {metrics.qty === 0 ? '0' : metrics.qty.toLocaleString()}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2.5 text-right tabular-nums font-medium text-gray-700">
                      {totals.qty > 0 ? totals.qty.toLocaleString() : <span className="text-gray-300">0</span>}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-gray-700">
                      {totals.revenue > 0 ? formatWon(totals.revenue) : <span className="text-gray-300">–</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                  <td className="px-3 py-2 text-xs font-bold text-indigo-700">합계</td>
                  {monthTotals.map(({ ym, metrics }) => (
                    <td key={`${ym.year}-${ym.month}`} className="px-1 py-2 text-center tabular-nums text-xs font-bold text-indigo-700">
                      {metrics.qty > 0 ? metrics.qty.toLocaleString() : <span className="text-indigo-300">0</span>}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right tabular-nums text-xs font-bold text-indigo-700">
                    {channelTotal.qty.toLocaleString()}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-xs font-bold text-indigo-700">
                    {formatWon(channelTotal.revenue)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* SKU × 월 순매출 테이블 */}
      {channelTotal.revenue > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
            <h3 className="text-xs font-semibold text-gray-600">SKU별 월별 순매출</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '160px' }} />
                {months.map((_, i) => <col key={i} />)}
                <col style={{ width: '80px' }} />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/40">
                  <th className="px-3 py-2 text-left font-semibold text-gray-500">SKU명</th>
                  {months.map((ym, idx) => (
                    <th key={`${ym.year}-${ym.month}`} className="px-1 py-2 text-center font-semibold text-gray-500">
                      {monthLabel(ym, idx)}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right font-semibold text-gray-500">합계</th>
                </tr>
              </thead>
              <tbody>
                {skuRows.filter(({ totals }) => totals.revenue > 0).map(({ sku }) => (
                  <tr key={sku.id} className="border-b border-gray-50 last:border-0 hover:bg-indigo-50/20 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-gray-800 truncate" title={sku.name}>
                      {sku.name || <span className="text-gray-300">(미입력)</span>}
                    </td>
                    {months.map((ym) => {
                      const active = isSkuActiveForYearMonth(sku, ym);
                      if (!active) return <td key={`${ym.year}-${ym.month}`} className="px-1 py-2.5 text-center text-gray-300">–</td>;
                      const metrics = calcChannelMonthMetrics(sku, channel, ym.month, varCostMap);
                      return (
                        <td key={`${ym.year}-${ym.month}`} className={`px-1 py-2.5 text-center tabular-nums ${metrics.revenue === 0 ? 'text-gray-300' : 'text-gray-700'}`}>
                          {metrics.revenue === 0 ? '–' : formatWon(metrics.revenue)}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2.5 text-right tabular-nums font-medium text-gray-700">
                      {formatWon(calcSkuChannelTotals(sku, channel, months, varCostMap).revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                  <td className="px-3 py-2 text-xs font-bold text-indigo-700">합계</td>
                  {monthTotals.map(({ ym, metrics }) => (
                    <td key={`${ym.year}-${ym.month}`} className="px-1 py-2 text-center tabular-nums text-xs font-bold text-indigo-700">
                      {metrics.revenue > 0 ? formatWon(metrics.revenue) : <span className="text-indigo-300">–</span>}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right tabular-nums text-xs font-bold text-indigo-700">
                    {formatWon(channelTotal.revenue)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
