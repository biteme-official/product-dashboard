import { useMemo } from 'react';
import { useStore } from '../store';
import { CHANNELS, B2C_CHANNELS, type Channel } from '../types';
import { getChannelRate } from '../utils/calc';

function formatWon(value: number): string {
  if (value <= 0) return '–';
  if (value >= 100_000_000) {
    const uk = value / 100_000_000;
    return `₩${Number.isInteger(uk) ? uk : uk.toFixed(1)}억`;
  }
  return `₩${Math.round(value / 10_000).toLocaleString()}만`;
}

function KpiCard({
  label,
  value,
  sub,
  color = 'gray',
}: {
  label: string;
  value: string;
  sub?: string;
  color?: 'gray' | 'indigo' | 'emerald' | 'violet';
}) {
  const styles = {
    gray:    'bg-white border-gray-200',
    indigo:  'bg-indigo-50 border-indigo-200',
    emerald: 'bg-emerald-50 border-emerald-200',
    violet:  'bg-violet-50 border-violet-200',
  };
  const valueStyles = {
    gray:    'text-gray-800',
    indigo:  'text-indigo-700',
    emerald: 'text-emerald-700',
    violet:  'text-violet-700',
  };
  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${styles[color]}`}>
      <p className="text-[11px] text-gray-400 mb-1">{label}</p>
      <p className={`text-base sm:text-lg font-bold tabular-nums ${valueStyles[color]}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export function MdViewSection() {
  const skus = useStore((s) => s.skus);
  const activeCategory = useStore((s) => s.activeCategory);
  const activeBrand = useStore((s) => s.activeBrand);

  const filteredSkus = useMemo(
    () =>
      skus.filter(
        (s) =>
          s.category === activeCategory &&
          (activeBrand === '전체' || s.brand === activeBrand),
      ),
    [skus, activeCategory, activeBrand],
  );

  // SKU × 채널 계산 (channelMonthlySplit 우선, 없으면 channelRatios fallback)
  const skuChannelData = useMemo(
    () =>
      filteredSkus.map((sku) => {
        const hasCMS = sku.channelMonthlySplit.some((e) => e.ratio > 0);
        const channels = CHANNELS.map((ch: Channel) => {
          let qty = 0;
          let revenue = 0;
          if (hasCMS) {
            // channelMonthlySplit 기반: 월별 합산
            for (const e of sku.channelMonthlySplit.filter((e) => e.channel === ch)) {
              const q = Math.round((sku.totalOrderQty * e.ratio) / 100);
              qty += q;
              revenue += Math.round(q * sku.price * getChannelRate(ch));
            }
          } else {
            // PM 탭 채널비중 fallback
            const ratio = sku.channelRatios.find((r) => r.channel === ch)?.ratio ?? 0;
            qty = Math.round((sku.totalOrderQty * ratio) / 100);
            revenue = Math.round(qty * sku.price * getChannelRate(ch));
          }
          const profit = Math.round(revenue * (sku.contributionMarginRate / 100));
          return { channel: ch, qty, revenue, profit };
        });
        const totalRevenue = channels.reduce((s, c) => s + c.revenue, 0);
        const totalProfit = channels.reduce((s, c) => s + c.profit, 0);
        return { sku, channels, totalRevenue, totalProfit };
      }),
    [filteredSkus],
  );

  // 채널별 합계
  const channelTotals = useMemo(
    () =>
      CHANNELS.map((ch: Channel) => {
        const qty = skuChannelData.reduce(
          (s, d) => s + (d.channels.find((c) => c.channel === ch)?.qty ?? 0),
          0,
        );
        const revenue = skuChannelData.reduce(
          (s, d) => s + (d.channels.find((c) => c.channel === ch)?.revenue ?? 0),
          0,
        );
        const profit = skuChannelData.reduce(
          (s, d) => s + (d.channels.find((c) => c.channel === ch)?.profit ?? 0),
          0,
        );
        return { channel: ch, qty, revenue, profit };
      }),
    [skuChannelData],
  );

  // 전체 합계
  const grand = useMemo(() => {
    const totalQty = filteredSkus.reduce((s, sku) => s + sku.totalOrderQty, 0);
    const totalRevenue = channelTotals.reduce((s, c) => s + c.revenue, 0);
    const totalProfit = channelTotals.reduce((s, c) => s + c.profit, 0);
    const avgCmRate =
      totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0;
    return { totalQty, totalRevenue, totalProfit, avgCmRate };
  }, [filteredSkus, channelTotals]);

  // 수량 있는 채널만
  const activeChannels = CHANNELS.filter(
    (ch) => (channelTotals.find((t) => t.channel === ch)?.qty ?? 0) > 0,
  );

  if (filteredSkus.length === 0) {
    return (
      <section className="p-4 pb-10">
        <div className="text-center py-16 text-sm text-gray-400">
          해당 카테고리·브랜드에 SKU가 없습니다.
        </div>
      </section>
    );
  }

  return (
    <section className="p-4 pb-10 space-y-6">
      {/* KPI 카드 */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">발주 요약</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            label="총 발주량"
            value={`${grand.totalQty.toLocaleString()}장`}
            sub={`SKU ${filteredSkus.length}개`}
          />
          <KpiCard
            label="예상 총매출"
            value={formatWon(grand.totalRevenue)}
            color="indigo"
          />
          <KpiCard
            label="예상 공헌이익"
            value={formatWon(grand.totalProfit)}
            color="emerald"
          />
          <KpiCard
            label="평균 CM률"
            value={`${grand.avgCmRate}%`}
            color="violet"
          />
        </div>
      </div>

      {/* 채널별 요약 */}
      <div>
        <h3 className="text-xs font-semibold text-gray-600 mb-2">채널별 요약</h3>
        {activeChannels.length === 0 ? (
          <p className="text-xs text-gray-400 px-1">
            채널 비중을 먼저 설정해주세요.
          </p>
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-xs border-collapse" style={{ minWidth: '380px' }}>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600 border-r border-gray-200">채널</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-600 border-r border-gray-200">수량</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-600 border-r border-gray-200">비중</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-600">예상매출</th>
                </tr>
              </thead>
              <tbody>
                {activeChannels.map((ch, i) => {
                  const d = channelTotals.find((t) => t.channel === ch)!;
                  const pct =
                    grand.totalQty > 0
                      ? Math.round((d.qty / grand.totalQty) * 100)
                      : 0;
                  const isB2C = B2C_CHANNELS.includes(ch);
                  return (
                    <tr
                      key={ch}
                      className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
                    >
                      <td className="px-3 py-2 border-r border-gray-200">
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
                          <span className="font-medium text-gray-700">{ch}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700 font-medium border-r border-gray-200">
                        {d.qty.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-500 border-r border-gray-200">
                        {pct}%
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums font-medium ${
                          isB2C ? 'text-emerald-700' : 'text-violet-700'
                        }`}
                      >
                        {formatWon(d.revenue)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                  <td className="px-3 py-2.5 font-semibold text-indigo-800 border-r border-indigo-200">
                    합계
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-indigo-700 tabular-nums border-r border-indigo-200">
                    {grand.totalQty.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-right text-indigo-500 border-r border-indigo-200">
                    100%
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-indigo-700 tabular-nums">
                    {formatWon(grand.totalRevenue)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {activeChannels.length > 0 && (
          <p className="text-[11px] text-gray-500 mt-2 px-1">
            예상 공헌이익 합계: <span className="font-semibold text-emerald-700">{formatWon(grand.totalProfit)}</span>
          </p>
        )}
      </div>

      {/* SKU별 채널 배분 */}
      <div>
        <h3 className="text-xs font-semibold text-gray-600 mb-2">SKU별 채널 배분</h3>
        <div
          className="rounded-xl border border-gray-200 overflow-x-auto"
        >
          <table
            className="w-full text-xs border-collapse"
            style={{ minWidth: `${400 + activeChannels.length * 72}px` }}
          >
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2.5 font-semibold text-gray-600 border-r border-gray-200 min-w-[120px]">
                  SKU명
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-gray-600 border-r border-gray-200 whitespace-nowrap">
                  발주량
                </th>
                {activeChannels.map((ch) => (
                  <th
                    key={ch}
                    className="text-right px-2 py-2.5 font-semibold text-gray-600 border-r border-gray-200 whitespace-nowrap"
                    style={{ width: '72px', minWidth: '72px' }}
                  >
                    {ch}
                  </th>
                ))}
                <th className="text-right px-3 py-2.5 font-semibold text-gray-600 border-r border-gray-200 whitespace-nowrap">
                  예상매출
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap">
                  공헌이익
                </th>
              </tr>
            </thead>
            <tbody>
              {skuChannelData.map(({ sku, channels, totalRevenue, totalProfit }, i) => (
                <tr
                  key={sku.id}
                  className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
                >
                  <td className="px-3 py-2 border-r border-gray-200 font-medium text-gray-700">
                    <span className="block max-w-[180px] truncate" title={sku.name}>
                      {sku.name || '(SKU명 미입력)'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600 border-r border-gray-200">
                    {sku.totalOrderQty.toLocaleString()}
                  </td>
                  {activeChannels.map((ch) => {
                    const d = channels.find((c) => c.channel === ch)!;
                    return (
                      <td
                        key={ch}
                        className="px-2 py-2 text-right tabular-nums text-gray-600 border-r border-gray-200"
                      >
                        {d.qty > 0 ? (
                          d.qty.toLocaleString()
                        ) : (
                          <span className="text-gray-300">–</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right tabular-nums text-indigo-600 font-medium border-r border-gray-200">
                    {formatWon(totalRevenue)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-medium">
                    {formatWon(totalProfit)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                <td className="px-3 py-2.5 font-semibold text-indigo-800 border-r border-indigo-200">
                  합계
                </td>
                <td className="px-3 py-2.5 text-right font-bold text-indigo-700 tabular-nums border-r border-indigo-200">
                  {grand.totalQty.toLocaleString()}
                </td>
                {activeChannels.map((ch) => {
                  const d = channelTotals.find((t) => t.channel === ch)!;
                  return (
                    <td
                      key={ch}
                      className="px-2 py-2.5 text-right font-semibold text-indigo-600 tabular-nums border-r border-indigo-200"
                    >
                      {d.qty > 0 ? (
                        d.qty.toLocaleString()
                      ) : (
                        <span className="text-indigo-300">–</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 text-right font-bold text-indigo-700 tabular-nums border-r border-indigo-200">
                  {formatWon(grand.totalRevenue)}
                </td>
                <td className="px-3 py-2.5 text-right font-bold text-indigo-600 tabular-nums">
                  {formatWon(grand.totalProfit)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-[11px] text-gray-400 mt-2 px-1">
          수량 = 총 발주량 × 채널 비중% · 예상매출 = 수량 × 판매가 × (B2C 80% / B2B 60%)
        </p>
      </div>
    </section>
  );
}
