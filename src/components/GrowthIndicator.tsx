interface MetricProps {
  label: string;
  newVal: number;
  oldVal: number;
  unit?: string;
}

function GrowthMetric({ label, newVal, oldVal, unit = '' }: MetricProps) {
  const rate = oldVal > 0 ? ((newVal - oldVal) / oldVal) * 100 : null;
  const barWidth = rate !== null ? Math.min(Math.abs(rate), 100) : 0;
  const isPositive = rate !== null && rate > 0;
  const isNegative = rate !== null && rate < 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">{label}</span>
        {rate !== null ? (
          <span
            className={`flex items-center gap-0.5 font-semibold ${
              isPositive ? 'text-green-600' : isNegative ? 'text-red-500' : 'text-gray-500'
            }`}
          >
            {isPositive ? '↑' : isNegative ? '↓' : '→'}
            {Math.abs(rate).toFixed(1)}%
          </span>
        ) : (
          <span className="text-gray-300 text-xs">–</span>
        )}
      </div>

      {/* 비교 수치 */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>
          기존 {oldVal > 0 ? oldVal.toLocaleString() + unit : '–'}
        </span>
        <span className="text-gray-600 font-medium">
          신규 {newVal > 0 ? newVal.toLocaleString() + unit : '–'}
        </span>
      </div>

      {/* 프로그레스 바 */}
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        {rate !== null && (
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isPositive ? 'bg-green-400' : isNegative ? 'bg-red-400' : 'bg-gray-300'
            }`}
            style={{ width: `${barWidth}%` }}
          />
        )}
      </div>
    </div>
  );
}

interface Props {
  newPrice: number;
  oldPrice: number;
  newMonthlyQty: number;
  oldMonthlyQty: number;
  newAnnualQty: number;
  oldAnnualQty: number;
}

export function GrowthIndicator({
  newPrice,
  oldPrice,
  newMonthlyQty,
  oldMonthlyQty,
  newAnnualQty,
  oldAnnualQty,
}: Props) {
  return (
    <div className="p-3 bg-gray-50 rounded-lg space-y-3 border border-gray-100">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        증감률 비교
      </div>
      <GrowthMetric
        label="월 출고량"
        newVal={newMonthlyQty}
        oldVal={oldMonthlyQty}
        unit="장"
      />
      <GrowthMetric
        label="연간 총출고량"
        newVal={newAnnualQty}
        oldVal={oldAnnualQty}
        unit="장"
      />
      <GrowthMetric
        label="판매가"
        newVal={newPrice}
        oldVal={oldPrice}
        unit="원"
      />
    </div>
  );
}
