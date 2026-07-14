import { useMemo, useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LabelList, ResponsiveContainer,
} from 'recharts';
import { useStore } from '../store';
import { useVisibleSkus } from '../hooks/useVisibleSkus';
import { MONTHS, CHANNELS, type Month, type Channel } from '../types';
import { getChannelRate } from '../utils/calc';

const MONTH_LABELS: Record<Month, string> = {
  1: '1월(익년)', 2: '2월(익년)', 3: '3월', 4: '4월', 5: '5월', 6: '6월',
  7: '7월', 8: '8월', 9: '9월', 10: '10월', 11: '11월', 12: '12월',
};

const CHANNEL_COLORS: Record<Channel, string> = {
  '자사몰':    '#6366f1',
  '스스':      '#8b5cf6',
  '위탁':      '#10b981',
  '쿠팡':      '#f97316',
  'B2B':       '#ef4444',
  '사입및페어': '#f59e0b',
  '글로벌':    '#0ea5e9',
  '일본':      '#ec4899',
};

function fmtBar(v: number): string {
  if (v <= 0) return '';
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`;
  if (v >= 10_000_000)  return `${(v / 10_000_000).toFixed(1)}천만`;
  if (v >= 10_000)      return `${Math.round(v / 10_000)}만`;
  return `${Math.round(v / 1_000)}천`;
}

function fmtAxis(v: number): string {
  if (v === 0) return '0';
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(0)}억`;
  if (v >= 10_000_000)  return `${(v / 10_000_000).toFixed(0)}천만`;
  if (v >= 10_000)      return `${(v / 10_000).toFixed(0)}만`;
  return `${v}`;
}

function fmtTooltip(v: number): string {
  if (v <= 0) return '–';
  if (v >= 100_000_000) return `₩${(v / 100_000_000).toFixed(1)}억`;
  return `₩${Math.round(v / 10_000).toLocaleString()}만`;
}

// 바 맨 위 총합(또는 선택 채널값) 표시
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TopLabel(props: any) {
  const x      = props.x      as number;
  const y      = props.y      as number;
  const width  = props.width  as number;
  const value  = props.value  as number;
  if (!value || value <= 0 || !width || width < 20) return null;
  return (
    <text
      x={x + width / 2}
      y={y - 5}
      textAnchor="middle"
      fontSize={10}
      fill="#374151"
      fontWeight={700}
    >
      {fmtBar(value)}
    </text>
  );
}

// 바 세그먼트 안 "채널명 X만" 라벨
function makeLabel(channel: Channel) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function BarLabel(props: any) {
    const x      = props.x      as number;
    const y      = props.y      as number;
    const width  = props.width  as number;
    const height = props.height as number;
    const value  = props.value  as number;
    // 값 없음, 너무 작음, 영역 부족 → 스킵
    if (!value || value < 500_000 || !height || height < 14 || !width || width < 20) return null;
    // 너비 부족 시 값만, 아니면 "채널 값" 형태
    const label = width < 40 ? fmtBar(value) : `${channel} ${fmtBar(value)}`;
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
        {label}
      </text>
    );
  };
}

export function RevenueChartSection() {
  const skus = useVisibleSkus();
  const activeCategory = useStore((s) => s.activeCategory);
  const activeBrand    = useStore((s) => s.activeBrand);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);

  // MD 시뮬레이션 데이터가 있는 SKU만 대상
  const eligibleSkus = useMemo(
    () =>
      skus.filter(
        (sku) =>
          sku.category === activeCategory &&
          (activeBrand === '전체' || sku.brand === activeBrand) &&
          sku.channelMonthlySplit.some((e) => e.ratio > 0),
      ),
    [skus, activeCategory, activeBrand],
  );

  const { chartData, activeChannels, maxTotal } = useMemo(() => {
    const data = MONTHS.flatMap((month) => {
      const point: Record<string, unknown> = { monthLabel: MONTH_LABELS[month] };
      let hasData = false;
      let total   = 0;

      for (const ch of CHANNELS) {
        let rev = 0;
        for (const sku of eligibleSkus) {
          // channelMonthlySplit 기반 (MD 시뮬레이션 수량)
          const entry = sku.channelMonthlySplit.find(
            (e) => e.channel === ch && e.month === month,
          );
          if (!entry || entry.ratio === 0) continue;
          const qty = Math.round((sku.totalOrderQty * entry.ratio) / 100);
          rev += Math.round(qty * sku.price * getChannelRate(ch));
        }
        point[ch] = rev;
        total     += rev;
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

  // 선택 채널이 필터 변경으로 사라지면 초기화
  useEffect(() => {
    if (selectedChannel && !activeChannels.includes(selectedChannel)) {
      setSelectedChannel(null);
    }
  }, [activeChannels, selectedChannel]);

  const displayedChannels = selectedChannel
    ? activeChannels.filter((ch) => ch === selectedChannel)
    : activeChannels;

  const displayMax = selectedChannel
    ? Math.max(...chartData.map((d) => (d[selectedChannel] as number) ?? 0), 0)
    : maxTotal;

  if (chartData.length === 0) return null;

  return (
    <section className="p-4 pb-10">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">
        채널별 월별 매출 현황
        <span className="ml-2 text-xs text-gray-400 font-normal">
          시뮬레이션 수량 기반 · 필터 내 전체 SKU 합산
        </span>
      </h2>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <ResponsiveContainer width="100%" height={340}>
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 8, left: 0, bottom: 0 }}
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
              domain={[0, Math.ceil(displayMax * 1.15)]}
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
            {displayedChannels.map((ch, i) => {
              const isTopBar = i === displayedChannels.length - 1;
              // 단일 채널 선택 시: 해당 채널 값 위에 표시 / 전체 표시 시: 총합 위에 표시
              const topDataKey = selectedChannel ? ch : '__total__';
              return (
                <Bar
                  key={ch}
                  dataKey={ch}
                  stackId="stack"
                  fill={CHANNEL_COLORS[ch]}
                  radius={isTopBar ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                >
                  {/* 세그먼트 안 라벨 */}
                  <LabelList dataKey={ch} content={makeLabel(ch)} />
                  {/* 바 최상단 라벨 (항상 표시, 전체/단일 채널 모두) */}
                  {isTopBar && (
                    <LabelList dataKey={topDataKey} content={TopLabel} />
                  )}
                </Bar>
              );
            })}
          </BarChart>
        </ResponsiveContainer>

        {/* 범례 — 클릭 시 해당 채널만 필터 */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 px-1 border-t border-gray-100 pt-3">
          {activeChannels.map((ch) => {
            const isSelected = selectedChannel === ch;
            const isDimmed   = selectedChannel !== null && !isSelected;
            return (
              <button
                key={ch}
                onClick={() => setSelectedChannel(isSelected ? null : ch)}
                className={`flex items-center gap-1.5 text-xs transition-all ${
                  isSelected
                    ? 'font-semibold text-gray-900'
                    : isDimmed
                    ? 'text-gray-300'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <span
                  className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 transition-opacity ${isDimmed ? 'opacity-25' : ''}`}
                  style={{ backgroundColor: CHANNEL_COLORS[ch] }}
                />
                {ch}
              </button>
            );
          })}
          {selectedChannel && (
            <button
              onClick={() => setSelectedChannel(null)}
              className="text-xs text-indigo-500 hover:text-indigo-700 underline underline-offset-2 transition-colors"
            >
              전체 보기
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
