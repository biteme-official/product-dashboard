import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LabelList, ResponsiveContainer,
} from 'recharts';
import { useStore } from '../store';
import { MONTHS, CHANNELS, type Month, type Channel } from '../types';
import { getChannelRate } from '../utils/calc';

const MONTH_LABELS: Record<Month, string> = {
  7: '7월', 8: '8월', 9: '9월', 10: '10월', 11: '11월', 12: '12월',
  1: '1월(익년)', 2: '2월(익년)',
};

const CHANNEL_COLORS: Record<Channel, string> = {
  '자사몰':   '#6366f1',
  '스스':     '#8b5cf6',
  '위탁':     '#10b981',
  '쿠팡':     '#f97316',
  'B2B':      '#ef4444',
  '사입및페어': '#f59e0b',
  '글로벌':   '#0ea5e9',
  '일본':     '#ec4899',
};

function fmtBar(v: number): string {
  if (v <= 0) return '';
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`;
  if (v >= 10_000) return `${Math.round(v / 10_000)}만`;
  return `${Math.round(v / 1_000)}천`;
}

function fmtAxis(v: number): string {
  if (v === 0) return '0';
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(0)}억`;
  if (v >= 10_000_000) return `${(v / 10_000_000).toFixed(0)}천만`;
  if (v >= 10_000) return `${(v / 10_000).toFixed(0)}만`;
  return `${v}`;
}

function fmtTooltip(v: number): string {
  if (v <= 0) return '–';
  if (v >= 100_000_000) return `₩${(v / 100_000_000).toFixed(1)}억`;
  return `₩${Math.round(v / 10_000).toLocaleString()}만`;
}

// 바 맨 위 총합 표시
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TotalLabel(props: any) {
  const x = props.x as number;
  const y = props.y as number;
  const width = props.width as number;
  const value = props.value as number;
  if (!value || value <= 0) return null;
  return (
    <text
      x={x + width / 2}
      y={y - 5}
      textAnchor="middle"
      fontSize={10}
      fill="#374151"
      fontWeight={700}
    >
      {`${(value / 100_000_000).toFixed(1)}억`}
    </text>
  );
}

// 바 세그먼트 안에 "채널명 X만" 표시
function makeLabel(channel: Channel) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function BarLabel(props: any) {
    const x = props.x as number;
    const y = props.y as number;
    const width = props.width as number;
    const height = props.height as number;
    const value = props.value as number;
    if (!value || value < 1_000_000 || height < 18 || width < 32) return null;
    return (
      <text
        x={x + width / 2}
        y={y + height / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={9}
        fill="white"
        fontWeight={600}
      >
        {`${channel} ${fmtBar(value)}`}
      </text>
    );
  };
}

export function RevenueChartSection() {
  const skus = useStore((s) => s.skus);
  const activeCategory = useStore((s) => s.activeCategory);
  const activeBrand = useStore((s) => s.activeBrand);

  const eligibleSkus = useMemo(
    () =>
      skus.filter(
        (sku) =>
          sku.category === activeCategory &&
          sku.monthlySplit.some((ms) => ms.ratio > 0) &&
          (activeBrand === '전체' || sku.brand === activeBrand),
      ),
    [skus, activeCategory, activeBrand],
  );

  const { chartData, activeChannels, maxTotal } = useMemo(() => {
    const data = MONTHS.flatMap((month) => {
      const point: Record<string, unknown> = { monthLabel: MONTH_LABELS[month] };
      let hasData = false;
      let total = 0;

      for (const ch of CHANNELS) {
        let rev = 0;
        for (const sku of eligibleSkus) {
          const ms = sku.monthlySplit.find((m) => m.month === month);
          if (!ms || ms.quantity === 0) continue;
          const cr = sku.channelRatios.find((r) => r.channel === ch);
          if (!cr || cr.ratio === 0) continue;
          const qty = Math.round((ms.quantity * cr.ratio) / 100);
          rev += Math.round(qty * sku.price * getChannelRate(ch));
        }
        point[ch] = rev;
        total += rev;
        if (rev > 0) hasData = true;
      }

      point['__total__'] = total;
      return hasData ? [point] : [];
    });

    const activeChs = CHANNELS.filter((ch) =>
      data.some((d) => ((d[ch] as number) ?? 0) > 0),
    );

    const max = Math.max(
      ...data.map((d) =>
        CHANNELS.reduce((s, ch) => s + ((d[ch] as number) ?? 0), 0),
      ),
      0,
    );

    return { chartData: data, activeChannels: activeChs, maxTotal: max };
  }, [eligibleSkus]);

  if (chartData.length === 0) return null;

  return (
    <section className="p-4 pb-10">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">
        채널별 월별 매출 현황
        <span className="ml-2 text-xs text-gray-400 font-normal">
          전체 SKU 합산 · 월별 비중 입력된 SKU · 브랜드 필터 적용
        </span>
      </h2>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <ResponsiveContainer width="100%" height={340}>
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            barCategoryGap="28%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis
              dataKey="monthLabel"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={fmtAxis}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              width={52}
              domain={[0, Math.ceil(maxTotal * 1.12)]}
            />
            <Tooltip
              cursor={{ fill: '#f9fafb' }}
              formatter={(value, name) => [fmtTooltip(value as number), name as string]}
              contentStyle={{
                fontSize: 11,
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                padding: '8px 12px',
              }}
            />
            {activeChannels.map((ch, i) => (
              <Bar
                key={ch}
                dataKey={ch}
                stackId="stack"
                fill={CHANNEL_COLORS[ch]}
                radius={
                  i === activeChannels.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]
                }
              >
                <LabelList dataKey={ch} content={makeLabel(ch)} />
                {i === activeChannels.length - 1 && (
                  <LabelList dataKey="__total__" content={TotalLabel} />
                )}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>

        {/* 범례 */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 px-1 border-t border-gray-100 pt-3">
          {activeChannels.map((ch) => (
            <span key={ch} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: CHANNEL_COLORS[ch] }}
              />
              {ch}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
