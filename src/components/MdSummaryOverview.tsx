import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { SkuData, Channel, YearMonth } from '../types';
import { BRANDS, CHANNELS, fmtYearMonth, isSkuActiveForYearMonth } from '../types';
import {
  calcChannelMonthMetrics, addMetrics,
  formatWon, cmBadgeCls, ZERO_METRICS,
  calcSkuAllChannelTotals,
  type VarCostRatioMap,
} from '../utils/mdSummaryCalc';

const CHANNEL_COLORS: Record<string, string> = {
  '자사몰': '#6366f1', '스스': '#8b5cf6', '위탁': '#a78bfa',
  '쿠팡': '#f97316', 'B2B': '#10b981', '사입및페어': '#6b7280',
  '글로벌': '#0ea5e9', '일본': '#f59e0b',
};

type MonthChartPoint = {
  label: string;
  revenue: number;
  profit: number;
  channels: Record<string, { revenue: number; profit: number }>;
};

function buildMonthlyChartData(
  skus: SkuData[], months: YearMonth[], varCostMap: VarCostRatioMap, usdKrw: number, jpyKrw: number,
): MonthChartPoint[] {
  return months.map((ym, idx) => {
    const showYear = idx === 0 || months[idx - 1].year !== ym.year;
    const label = showYear
      ? `${ym.month}월 '${String(ym.year).slice(2)}`
      : `${ym.month}월`;

    const channels: Record<string, { revenue: number; profit: number }> = {};
    let totalRevenue = 0;
    let totalProfit = 0;

    for (const channel of CHANNELS) {
      const metrics = skus.reduce((acc, sku) => {
        if (!isSkuActiveForYearMonth(sku, ym)) return acc;
        return addMetrics(acc, calcChannelMonthMetrics(sku, channel as Channel, ym.month, varCostMap, usdKrw, jpyKrw));
      }, ZERO_METRICS);
      channels[channel] = { revenue: metrics.revenue, profit: metrics.profit };
      totalRevenue += metrics.revenue;
      totalProfit += metrics.profit;
    }

    return { label, revenue: totalRevenue, profit: totalProfit, channels };
  });
}

function ChartTooltip({ active, payload, data }: {
  active?: boolean;
  payload?: { payload: MonthChartPoint }[];
  data: MonthChartPoint[];
}) {
  if (!active || !payload?.length) return null;
  const point = data.find((d) => d.label === payload[0].payload.label);
  if (!point) return null;

  const channelRows = CHANNELS
    .map((ch) => ({ ch, ...point.channels[ch] }))
    .filter((e) => e.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs min-w-[200px]">
      <p className="font-semibold text-gray-700 mb-2">{point.label}</p>
      <div className="flex gap-3 mb-2 pb-2 border-b border-gray-100">
        <span className="text-indigo-600 font-medium">매출 {formatWon(point.revenue)}</span>
        <span className={`font-medium ${point.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          공헌 {formatWon(point.profit)}
        </span>
      </div>
      {channelRows.length > 0 && (
        <div className="space-y-1">
          {channelRows.map(({ ch, revenue, profit }) => (
            <div key={ch} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CHANNEL_COLORS[ch] ?? '#9ca3af' }} />
                <span className="text-gray-500">{ch}</span>
              </div>
              <div className="flex gap-2 tabular-nums">
                <span className="text-gray-700">{formatWon(revenue)}</span>
                <span className={profit >= 0 ? 'text-emerald-600' : 'text-red-500'}>{formatWon(profit)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MonthlyChart({ skus, months, varCostMap, usdKrw, jpyKrw }: {
  skus: SkuData[]; months: YearMonth[]; varCostMap: VarCostRatioMap; usdKrw: number; jpyKrw: number;
}) {
  const data = buildMonthlyChartData(skus, months, varCostMap, usdKrw, jpyKrw);
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
          <Tooltip content={(props) => <ChartTooltip active={props.active} payload={props.payload as unknown as { payload: MonthChartPoint }[] | undefined} data={data} />} />
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

function KpiCard({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="flex-1 min-w-[140px] bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
      <p className="text-[11px] text-gray-400 font-medium mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-900 leading-tight">{value}</p>
      {sub && (
        <p className={`text-[11px] mt-0.5 ${warn ? 'text-amber-500 font-medium' : 'text-gray-400'}`}>{sub}</p>
      )}
    </div>
  );
}

export function MdSummaryOverview({ skus, months, varCostMap, usdKrw, jpyKrw }: {
  skus: SkuData[]; months: YearMonth[]; varCostMap: VarCostRatioMap; usdKrw: number; jpyKrw: number;
}) {
  const allTotals = skus.reduce((acc, sku) => addMetrics(acc, calcSkuAllChannelTotals(sku, months, varCostMap, usdKrw, jpyKrw)), ZERO_METRICS);
  const totalCm = allTotals.revenue > 0
    ? Math.round((allTotals.profit / allTotals.revenue) * 1000) / 10
    : null;
  const step2UnsetCount = skus.filter((s) => s.channelMonthQty.every((e) => e.qty === 0)).length;

  const skuRows = skus
    .map((sku) => {
      const totals = calcSkuAllChannelTotals(sku, months, varCostMap, usdKrw, jpyKrw);
      const step2Total = sku.channelMonthQty.reduce((s, e) => s + e.qty, 0);
      return { sku, step2Total, ...totals };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const brandRows = BRANDS.map((brand) => {
    const bs = skus.filter((s) => s.brand === brand);
    if (bs.length === 0) return null;
    const t = bs.reduce((acc, sku) => addMetrics(acc, calcSkuAllChannelTotals(sku, months, varCostMap, usdKrw, jpyKrw)), ZERO_METRICS);
    const cm = t.revenue > 0 ? Math.round((t.profit / t.revenue) * 1000) / 10 : null;
    return { brand, count: bs.length, ...t, cm };
  }).filter(Boolean) as { brand: string; count: number; qty: number; revenue: number; profit: number; cm: number | null }[];

  const totalStep1 = skus.reduce((s, sku) => s + sku.totalOrderQty, 0);

  const rangeLabel = months.length > 0
    ? months.length === 1
      ? fmtYearMonth(months[0])
      : `${fmtYearMonth(months[0])} ~ ${fmtYearMonth(months[months.length - 1])}`
    : '';

  return (
    <div className="space-y-5">
      {rangeLabel && (
        <p className="text-[11px] text-gray-400 px-0.5">집계 기간: {rangeLabel}</p>
      )}

      <div className="flex gap-3 flex-wrap">
        <KpiCard label="총 SKU" value={`${skus.length}개`} />
        <KpiCard
          label="STEP2 총 목표량"
          value={allTotals.qty.toLocaleString()}
          sub={step2UnsetCount > 0 ? `⚠ 미설정 ${step2UnsetCount}개` : '전 SKU 설정 완료'}
          warn={step2UnsetCount > 0}
        />
        <KpiCard
          label="총 예상 순매출"
          value={formatWon(allTotals.revenue)}
          sub={allTotals.revenue > 0 ? `${allTotals.revenue.toLocaleString()}원` : undefined}
        />
        <KpiCard
          label="총 예상 공헌이익"
          value={formatWon(allTotals.profit)}
          sub={totalCm !== null ? `CM율 ${totalCm}%` : undefined}
        />
      </div>

      <MonthlyChart skus={skus} months={months} varCostMap={varCostMap} usdKrw={usdKrw} jpyKrw={jpyKrw} />

      {brandRows.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
            <h3 className="text-xs font-semibold text-gray-600">브랜드별 요약</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/40">
                  <th className="px-4 py-2 text-left font-semibold text-gray-500">브랜드</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-500">SKU</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-500">STEP2 목표량</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-500">순매출</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-500">공헌이익</th>
                  <th className="px-4 py-2 text-center font-semibold text-gray-500">CM율</th>
                </tr>
              </thead>
              <tbody>
                {brandRows.map((row) => (
                  <tr key={row.brand} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/40">
                    <td className="px-4 py-2.5">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                        row.brand === 'SSFW'
                          ? 'bg-sky-50 text-sky-700'
                          : row.brand === '바잇미'
                            ? 'bg-violet-100 text-violet-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}>{row.brand}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{row.count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 font-medium">{row.qty.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 font-medium">{formatWon(row.revenue)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 font-medium">{formatWon(row.profit)}</td>
                    <td className="px-4 py-2.5 text-center">
                      {row.cm !== null
                        ? <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${cmBadgeCls(row.cm)}`}>{row.cm}%</span>
                        : <span className="text-gray-300">–</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
          <h3 className="text-xs font-semibold text-gray-600">SKU별 요약</h3>
        </div>
        {skus.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400">해당 카테고리에 SKU가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/40">
                  <th className="px-4 py-2 text-left font-semibold text-gray-500 min-w-[160px]">SKU명</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-500">브랜드</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-500">총 발주량</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-500">STEP2 목표량</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-500">순매출</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-500">공헌이익</th>
                  <th className="px-4 py-2 text-center font-semibold text-gray-500">CM율</th>
                  <th className="px-4 py-2 text-center font-semibold text-gray-500">확정</th>
                </tr>
              </thead>
              <tbody>
                {skuRows.map(({ sku, step2Total, qty: _qty, revenue, profit, cm }) => {
                  const isUnset = step2Total === 0;
                  return (
                    <tr key={sku.id} className="border-b border-gray-50 last:border-0 hover:bg-indigo-50/20 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-gray-800 max-w-[220px] truncate" title={sku.name}>
                        {sku.name || <span className="text-gray-300">(미입력)</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          sku.brand === 'SSFW'
                            ? 'bg-sky-50 text-sky-700'
                            : sku.brand === '바잇미'
                              ? 'bg-violet-100 text-violet-700'
                              : 'bg-gray-100 text-gray-600'
                        }`}>{sku.brand}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                        {sku.totalOrderQty.toLocaleString()}
                      </td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${isUnset ? 'text-amber-500' : 'text-gray-700'}`}>
                        {isUnset ? <span className="text-[11px]">⚠ 미설정</span> : step2Total.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-700">
                        {isUnset ? <span className="text-gray-300">–</span> : formatWon(revenue)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-700">
                        {isUnset ? <span className="text-gray-300">–</span> : formatWon(profit)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {!isUnset && cm !== null
                          ? <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${cmBadgeCls(cm)}`}>{cm}%</span>
                          : <span className="text-gray-300">–</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center" />
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                  <td colSpan={2} className="px-4 py-2 text-xs font-bold text-indigo-700">합계</td>
                  <td className="px-4 py-2 text-right tabular-nums text-xs font-bold text-indigo-700">
                    {totalStep1.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-xs font-bold text-indigo-700">
                    {allTotals.qty.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-xs font-bold text-indigo-700">
                    {formatWon(allTotals.revenue)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-xs font-bold text-indigo-700">
                    {formatWon(allTotals.profit)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {totalCm !== null && (
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${cmBadgeCls(totalCm)}`}>{totalCm}%</span>
                    )}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
