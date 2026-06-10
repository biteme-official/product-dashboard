import type { SkuData } from '../types';
import { BRANDS } from '../types';
import {
  calcSkuAllChannelTotals, addMetrics, formatWon, cmBadgeCls, ZERO_METRICS,
} from '../utils/mdSummaryCalc';

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

export function MdSummaryOverview({ skus }: { skus: SkuData[] }) {
  const allTotals = skus.reduce((acc, sku) => addMetrics(acc, calcSkuAllChannelTotals(sku)), ZERO_METRICS);
  const totalCm = allTotals.revenue > 0
    ? Math.round((allTotals.profit / allTotals.revenue) * 1000) / 10
    : null;
  const confirmedCount = skus.filter((s) => s.isConfirmed).length;
  const step2UnsetCount = skus.filter((s) => s.channelMonthQty.every((e) => e.qty === 0)).length;

  const skuRows = skus
    .map((sku) => {
      const totals = calcSkuAllChannelTotals(sku);
      const step2Total = sku.channelMonthQty.reduce((s, e) => s + e.qty, 0);
      return { sku, step2Total, ...totals };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const brandRows = BRANDS.map((brand) => {
    const bs = skus.filter((s) => s.brand === brand);
    if (bs.length === 0) return null;
    const t = bs.reduce((acc, sku) => addMetrics(acc, calcSkuAllChannelTotals(sku)), ZERO_METRICS);
    const cm = t.revenue > 0 ? Math.round((t.profit / t.revenue) * 1000) / 10 : null;
    return { brand, count: bs.length, ...t, cm };
  }).filter(Boolean) as { brand: string; count: number; qty: number; revenue: number; profit: number; cm: number | null }[];

  const totalStep1 = skus.reduce((s, sku) => s + sku.totalOrderQty, 0);

  return (
    <div className="space-y-5">
      {/* KPI 카드 */}
      <div className="flex gap-3 flex-wrap">
        <KpiCard
          label="총 SKU"
          value={`${skus.length}개`}
          sub={confirmedCount > 0 ? `확정 ${confirmedCount}개 포함` : undefined}
        />
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

      {/* 브랜드별 요약 */}
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

      {/* SKU 상세 테이블 */}
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
                      <td className="px-4 py-2.5 text-center">
                        {sku.isConfirmed && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">✓ 확정</span>
                        )}
                      </td>
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
