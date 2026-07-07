import { useState } from 'react';
import type { SkuData } from '../types';
import { useExchangeRates } from '../utils/useExchangeRates';
import { useStore } from '../store';
import { useAuth } from '../store/auth';
import {
  PRICING_SCENARIOS, type PricingRates,
  SPECIAL_MAX_RATE_OPTIONS, REGULAR_MAX_RATE_OPTIONS, SEASON_OFF_RATE_OPTIONS,
} from '../utils/pricingScenarios';

const B2C_SCENARIO_IDS = ['오픈특가', '신상위크', '라이브 할인', '선단독', '상시 최대할인율', '특가 최대할인율', '시즌오프(의류전용)'];
const B2B_SCENARIO_IDS = ['B2B 오픈 할인', 'B2B 상시 운영', '사입 공급가', '글로벌 공급가', '일본 공급가'];

// 기본 비활성: 프로모션 선택 전에는 흐리게 표시
const PROMO_DIMMED_IDS = new Set(['신상위크', '라이브 할인', '선단독']);

// 클릭 시 할인율 선택 드롭다운을 노출하는 시나리오 (SKU별 정책값)
const RATE_FIELD_BY_SCENARIO_ID: Record<string, keyof PricingRates> = {
  '특가 최대할인율': 'specialMaxRate',
  '상시 최대할인율': 'regularMaxRate',
  '시즌오프(의류전용)': 'seasonOffRate',
};
const RATE_OPTIONS_BY_FIELD: Record<keyof PricingRates, readonly number[]> = {
  specialMaxRate: SPECIAL_MAX_RATE_OPTIONS,
  regularMaxRate: REGULAR_MAX_RATE_OPTIONS,
  seasonOffRate: SEASON_OFF_RATE_OPTIONS,
};

function fmtPct(v: number | null, dim: boolean) {
  if (v === null || !isFinite(v)) return <span className="text-gray-300">–</span>;
  const rounded = Math.round(v);
  if (dim) return <span className="text-gray-300">{rounded}%</span>;
  return <span className={rounded > 0 ? 'text-gray-900 font-medium' : 'text-gray-400'}>{rounded}%</span>;
}

/** 퍼센티지 클릭 시 뜨는 작은 선택 모달 (표 영역에 클리핑되지 않도록 화면 중앙에 fixed로 배치) */
function RateOptionModal({
  label, field, value, options, onSelect, onClose,
}: {
  label: string;
  field: keyof PricingRates;
  value: number;
  options: readonly number[];
  onSelect: (field: keyof PricingRates, value: number) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-xl w-36 overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
          <p className="text-[11px] font-semibold text-gray-500 whitespace-nowrap">{label}</p>
        </div>
        <div className="py-1">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onSelect(field, opt); onClose(); }}
              className={`block w-full text-left px-3 py-2 text-xs whitespace-nowrap bg-white hover:bg-indigo-50 ${
                opt === value ? 'text-indigo-600 font-semibold' : 'text-gray-700'
              }`}
            >
              {opt}%
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function RateLabel({
  label, field, value, canEdit, onSelect,
}: {
  label: string;
  field: keyof PricingRates;
  value: number;
  canEdit: boolean;
  onSelect: (field: keyof PricingRates, value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = RATE_OPTIONS_BY_FIELD[field];

  if (!canEdit) {
    return <span className="font-medium text-gray-700">{label} <span className="text-gray-400 font-normal">({value}%)</span></span>;
  }

  return (
    <span className="font-medium text-gray-700">
      {label}{' '}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-indigo-500 font-semibold underline decoration-dotted underline-offset-2 hover:text-indigo-600 focus:outline-none"
      >
        ({value}%)
      </button>
      {open && (
        <RateOptionModal
          label={label} field={field} value={value} options={options}
          onSelect={onSelect} onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
}

function ScenarioTable({
  scenarioIds, base, regularPrice, cost, usdKrw, jpyKrw, activeIds, promoNewWeek = false, hintOverrides = {},
  rates, canEditRates = false, onSelectRate,
}: {
  scenarioIds: string[];
  base: number;
  regularPrice: number;
  cost: number;
  usdKrw: number;
  jpyKrw: number;
  activeIds?: Set<string>;  // undefined = 전부 활성 (B2B)
  promoNewWeek?: boolean;
  hintOverrides?: Record<string, string>;
  rates: Required<PricingRates>;
  canEditRates?: boolean;
  onSelectRate?: (field: keyof PricingRates, value: number) => void;
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-gray-100 bg-gray-50/60">
          <th className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">시나리오</th>
          <th className="px-3 py-2 text-right font-semibold text-gray-500 whitespace-nowrap">실제가격</th>
          <th className="px-3 py-2 text-right font-semibold text-gray-500 whitespace-nowrap">상시가 대비 할인율</th>
          <th className="px-3 py-2 text-right font-semibold text-gray-500 whitespace-nowrap">정가 대비 할인율</th>
          <th className="px-3 py-2 text-right font-semibold text-gray-500 whitespace-nowrap">원가율</th>
        </tr>
      </thead>
      <tbody>
        {scenarioIds.map((id) => {
          const scenario = PRICING_SCENARIOS.find((s) => s.id === id);
          if (!scenario) return null;

          // dimmed: 프로모션 대상 시나리오인데 활성화 안 된 경우
          const isDimTarget = PROMO_DIMMED_IDS.has(id);
          const dim = activeIds !== undefined && isDimTarget && !activeIds.has(id);

          const actualPrice = scenario.calcKrwPrice(base, usdKrw, jpyKrw, promoNewWeek, rates);
          const discountVsPrice = base > 0 ? (1 - actualPrice / base) * 100 : null;
          const discountVsRegular = regularPrice > 0 ? (1 - actualPrice / regularPrice) * 100 : null;
          const costRate = actualPrice > 0 ? (cost / actualPrice) * 100 : null;
          const foreign = scenario.foreignAmt?.(base, usdKrw, jpyKrw) ?? null;

          const rowCls = dim
            ? 'border-b border-gray-50 last:border-0 opacity-40'
            : 'border-b border-gray-50 last:border-0 hover:bg-gray-50/40 transition-colors';

          const rateField = RATE_FIELD_BY_SCENARIO_ID[id];

          return (
            <tr key={id} className={rowCls}>
              <td className="px-3 py-2.5 whitespace-nowrap">
                {rateField && onSelectRate ? (
                  <RateLabel
                    label={scenario.label}
                    field={rateField}
                    value={rates[rateField]}
                    canEdit={canEditRates}
                    onSelect={onSelectRate}
                  />
                ) : (
                  <span className={dim ? 'text-gray-400' : 'font-medium text-gray-700'}>
                    {scenario.label}
                  </span>
                )}
                {(hintOverrides[id] ?? scenario.hint) && (
                  <span className="ml-1.5 text-[10px] text-gray-400 font-normal">({hintOverrides[id] ?? scenario.hint})</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                <span className={dim ? 'text-gray-400' : 'font-bold text-gray-900'}>
                  {actualPrice > 0 ? actualPrice.toLocaleString() : '–'}
                </span>
                {foreign && !dim && (
                  <span className="ml-1.5 text-[10px] text-gray-400 font-normal">
                    {foreign.symbol}{foreign.amount.toFixed(foreign.decimals)}
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{fmtPct(discountVsPrice, dim)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{fmtPct(discountVsRegular, dim)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                {costRate !== null && isFinite(costRate) ? (
                  <span className={costRateCls(costRate, dim)}>
                    {Math.round(costRate)}%
                  </span>
                ) : <span className="text-gray-300">–</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function costRateCls(rate: number, dim: boolean): string {
  if (dim) return 'text-gray-300';
  if (rate > 40) return 'text-rose-500 font-medium';
  if (rate > 30) return 'text-amber-500';
  return 'text-emerald-600';
}

export function PricingModal({ sku, onClose }: { sku: SkuData; onClose: () => void }) {
  const { usdKrw, jpyKrw } = useExchangeRates();
  const role = useAuth((s) => s.role);
  const setPricingRates = useStore((s) => s.setPricingRates);
  const setPricingMemo = useStore((s) => s.setPricingMemo);
  const liveSku = useStore((s) => s.skus.find((x) => x.id === sku.id)) ?? sku;
  const isMaster = role === 'master';
  const canEditPricingMemo = role === 'master' || role === 'platform_md' || role === 'brand_md';

  const [memoSkuId, setMemoSkuId] = useState(sku.id);
  const [memoDraft, setMemoDraft] = useState(liveSku.pricingMemo ?? '');
  if (sku.id !== memoSkuId) {
    setMemoSkuId(sku.id);
    setMemoDraft(liveSku.pricingMemo ?? '');
  }
  const commitMemo = () => {
    if (memoDraft !== (liveSku.pricingMemo ?? '')) setPricingMemo(sku.id, memoDraft).catch(console.error);
  };

  const [promoNewWeek, setPromoNewWeek] = useState(false);   // 신상위크
  const [promoLive, setPromoLive] = useState(false);          // 라이브 (단독)
  const [promoExclusive, setPromoExclusive] = useState(false); // 선단독

  // B2C에서 활성화된 시나리오 ID 집합
  const b2cActiveIds = new Set<string>();
  if (promoNewWeek) { b2cActiveIds.add('신상위크'); b2cActiveIds.add('라이브 할인'); }
  if (promoLive) b2cActiveIds.add('라이브 할인');
  if (promoExclusive) b2cActiveIds.add('선단독');

  // 라이브 할인 행 hint: 신상위크 활성 여부에 따라 다르게 표시
  const liveHint = promoNewWeek ? '신상위크 5% 추가할인, max 1,000원' : '오픈특가 5% 추가할인, max 1,000원';
  const b2cHintOverrides = { '라이브 할인': liveHint };

  const discountRate = sku.regularPrice > 0 && sku.price > 0
    ? Math.round((1 - sku.price / sku.regularPrice) * 1000) / 10
    : null;
  const costRateBase = sku.price > 0
    ? Math.round((sku.cost / sku.price) * 1000) / 10
    : null;

  const rates: Required<PricingRates> = {
    specialMaxRate: liveSku.specialMaxRate ?? 20,
    regularMaxRate: liveSku.regularMaxRate ?? 15,
    seasonOffRate: liveSku.seasonOffRate ?? 25,
  };
  const handleSelectRate = (field: keyof PricingRates, value: number) => {
    setPricingRates(sku.id, { [field]: value }).catch(console.error);
  };

  const tableProps = { base: sku.price, regularPrice: sku.regularPrice, cost: sku.cost, usdKrw, jpyKrw, rates };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div>
            <p className="text-[11px] text-gray-400 font-medium">{sku.brand} · {sku.category}</p>
            <h2 className="text-sm font-bold text-gray-900 leading-tight mt-0.5">
              {sku.name || '(SKU명 미입력)'} — 프라이싱 시나리오
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* 상단 KPI */}
          <div className="flex gap-3 flex-wrap">
            {[
              { label: '원가',       value: sku.cost > 0 ? `${sku.cost.toLocaleString()}원` : '–' },
              { label: '판매가',     value: sku.price > 0 ? `${sku.price.toLocaleString()}원` : '–' },
              { label: '정가',       value: sku.regularPrice > 0 ? `${sku.regularPrice.toLocaleString()}원` : '–' },
              { label: '상시할인율', value: discountRate !== null ? `${discountRate}%` : '–' },
              { label: '원가율',     value: costRateBase !== null ? `${costRateBase}%` : '–' },
            ].map(({ label, value }) => (
              <div key={label} className="flex-1 min-w-[80px] bg-gray-50 rounded-xl border border-gray-200 px-3 py-2.5 text-center">
                <p className="text-[10px] text-gray-400 font-medium mb-0.5">{label}</p>
                <p className="text-sm font-bold text-gray-900 tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          {/* B2C 시나리오 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            {/* B2C 헤더 + 프로모션 선택 */}
            <div className="px-4 py-2.5 bg-sky-50 border-b border-sky-100 flex items-center gap-3 flex-wrap">
              <span className="text-[11px] font-bold tracking-wide uppercase text-sky-600">B2C</span>
              <div className="w-px h-3.5 bg-sky-200" />
              <span className="text-[11px] text-sky-500 font-medium">오픈 프로모션 선택</span>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setPromoNewWeek((v) => !v)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                    promoNewWeek
                      ? 'bg-red-500 text-white border-red-500 shadow-sm'
                      : 'bg-white text-red-400 border-red-200 hover:bg-red-50'
                  }`}
                >
                  신상위크
                </button>
                <button
                  onClick={() => setPromoLive((v) => !v)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                    promoLive
                      ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                      : 'bg-white text-orange-400 border-orange-200 hover:bg-orange-50'
                  }`}
                >
                  라이브
                </button>
                <button
                  onClick={() => setPromoExclusive((v) => !v)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                    promoExclusive
                      ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                      : 'bg-white text-emerald-500 border-emerald-200 hover:bg-emerald-50'
                  }`}
                >
                  선단독
                </button>
                <div className="w-px h-3.5 bg-sky-200" />
                <span className="text-[10px] text-sky-400">
                  {isMaster ? '할인율 항목 클릭 시 이 SKU만 변경됩니다' : '할인율 변경은 master만 가능'}
                </span>
              </div>
            </div>
            {(canEditPricingMemo || memoDraft) && (
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
                <span className="text-[10px] font-semibold text-amber-600 whitespace-nowrap">메모</span>
                <input
                  type="text"
                  value={memoDraft}
                  onChange={(e) => setMemoDraft(e.target.value)}
                  onBlur={commitMemo}
                  readOnly={!canEditPricingMemo}
                  maxLength={200}
                  placeholder={canEditPricingMemo ? '이 SKU 프라이싱 관련 메모…' : ''}
                  className={`flex-1 min-w-0 bg-transparent text-xs focus:outline-none ${
                    canEditPricingMemo ? 'text-gray-700 placeholder-amber-300' : 'text-gray-500 cursor-default'
                  }`}
                />
              </div>
            )}
            <div className="overflow-x-auto">
              <ScenarioTable
                scenarioIds={B2C_SCENARIO_IDS} {...tableProps}
                activeIds={b2cActiveIds} promoNewWeek={promoNewWeek} hintOverrides={b2cHintOverrides}
                canEditRates={isMaster} onSelectRate={handleSelectRate}
              />
            </div>
          </div>

          {/* B2B 시나리오 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 bg-violet-50 border-b border-violet-100">
              <span className="text-[11px] font-bold tracking-wide uppercase text-violet-600">B2B</span>
            </div>
            <div className="overflow-x-auto">
              <ScenarioTable scenarioIds={B2B_SCENARIO_IDS} {...tableProps} />
            </div>
          </div>

          <p className="text-[10px] text-gray-400 text-right">
            * 판매가({sku.price.toLocaleString()}원) 기준 · 환율 ${usdKrw.toLocaleString()} · ¥{jpyKrw.toFixed(1)}
          </p>
        </div>
      </div>
    </div>
  );
}
