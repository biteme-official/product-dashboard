import { useState, useEffect, useRef } from 'react';
import type { SkuData, ManualScenarioEntry } from '../types';
import { useExchangeRates } from '../utils/useExchangeRates';
import { useStore } from '../store';
import { useAuth } from '../store/auth';
import { canEditPricing as hasPricingEditRole } from '../utils/pin';
import {
  PRICING_SCENARIOS, type PricingRates,
  SPECIAL_MAX_RATE_OPTIONS, REGULAR_MAX_RATE_OPTIONS, SEASON_OFF_RATE_OPTIONS,
} from '../utils/pricingScenarios';

const B2C_SCENARIO_IDS = ['오픈특가', '신상위크', '라이브 할인', '선단독', '상시 최대할인율', '특가 최대할인율', '시즌오프(의류전용)'];
const B2B_SCENARIO_IDS = ['B2B 오픈 할인', 'B2B 상시 운영', '사입 공급가', '글로벌 공급가', '일본 공급가'];

// 기본 비활성: 프로모션 선택 전에는 흐리게 표시
const PROMO_DIMMED_IDS = new Set(['오픈특가', '신상위크', '라이브 할인', '선단독']);

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

// 프라이싱 모달 수동 모드에서도 편집 불가 — 할인율 클릭선택 3종 + PricingScenario.manualLocked 시나리오(글로벌 공급가 등)
const MANUAL_LOCKED_IDS = new Set<string>([
  ...Object.keys(RATE_FIELD_BY_SCENARIO_ID),
  ...PRICING_SCENARIOS.filter((s) => s.manualLocked).map((s) => s.id),
]);

function parsePriceInput(s: string): number {
  return parseInt(s.replace(/[^0-9]/g, ''), 10) || 0;
}

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

function costRateCls(rate: number, dim: boolean): string {
  if (dim) return 'text-gray-300';
  if (rate > 40) return 'text-rose-500 font-medium';
  if (rate > 30) return 'text-amber-500';
  return 'text-emerald-600';
}

function ScenarioTable({
  scenarioIds, section, base, regularPrice, cost, usdKrw, jpyKrw, activeIds, promoNewWeek = false, hintOverrides = {},
  rates, canEditRates = false, onSelectRate,
  mode = 'auto', manualRows = [], canEditManual = false,
  onManualLabelChange, onManualPriceChange, onAddManualRow, onRemoveManualRow,
}: {
  scenarioIds: string[];
  section: 'B2C' | 'B2B';
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
  mode?: 'auto' | 'manual';
  manualRows?: ManualScenarioEntry[];
  canEditManual?: boolean;
  onManualLabelChange?: (rowId: string, value: string) => void;
  onManualPriceChange?: (rowId: string, value: number) => void;
  onAddManualRow?: (section: 'B2C' | 'B2B') => void;
  onRemoveManualRow?: (rowId: string) => void;
}) {
  const manualById = new Map(manualRows.map((r) => [r.id, r]));
  const customRows = mode === 'manual' ? manualRows.filter((r) => r.isCustom) : [];

  type RowSpec = {
    key: string;
    label: string;
    price: number;
    hint?: string;
    foreign?: { symbol: string; amount: number; decimals: number } | null;
    dim: boolean;
    editable: boolean;
    rowId?: string;
    isCustom?: boolean;
    rateField?: keyof PricingRates;
  };

  const renderRow = ({ key, label, price, hint, foreign, dim, editable, rowId, isCustom, rateField }: RowSpec) => {
    const discountVsPrice = base > 0 ? (1 - price / base) * 100 : null;
    const discountVsRegular = regularPrice > 0 ? (1 - price / regularPrice) * 100 : null;
    const costRate = price > 0 ? (cost / price) * 100 : null;
    const rowCls = dim
      ? 'border-b border-gray-50 last:border-0 opacity-40'
      : 'border-b border-gray-50 last:border-0 hover:bg-gray-50/40 transition-colors';

    return (
      <tr key={key} className={rowCls}>
        <td className="px-3 py-2.5 whitespace-nowrap">
          {rateField && onSelectRate ? (
            <RateLabel label={label} field={rateField} value={rates[rateField]} canEdit={canEditRates} onSelect={onSelectRate} />
          ) : editable && rowId ? (
            <input
              type="text"
              value={label}
              onChange={(e) => onManualLabelChange?.(rowId, e.target.value)}
              placeholder="시나리오명 입력"
              className="w-full min-w-[90px] bg-transparent text-[12px] font-medium text-gray-700 border-b border-dashed border-indigo-200 focus:outline-none focus:border-indigo-400 py-0.5"
            />
          ) : (
            <span className={dim ? 'text-gray-400' : 'font-medium text-gray-700'}>
              {label || <span className="text-gray-300">(시나리오명 미입력)</span>}
            </span>
          )}
          {hint && <span className="ml-1.5 text-[10px] text-gray-400 font-normal">({hint})</span>}
          {isCustom && editable && rowId && (
            <button
              type="button"
              onClick={() => onRemoveManualRow?.(rowId)}
              className="ml-1.5 align-middle text-gray-300 hover:text-rose-500 text-[13px]"
              title="행 삭제"
            >
              ×
            </button>
          )}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
          {editable && rowId ? (
            <input
              type="text"
              inputMode="numeric"
              value={price > 0 ? price.toLocaleString() : ''}
              onChange={(e) => onManualPriceChange?.(rowId, parsePriceInput(e.target.value))}
              placeholder="가격 입력"
              className="w-[92px] bg-transparent text-right text-[12px] font-bold text-gray-900 border-b border-dashed border-indigo-200 focus:outline-none focus:border-indigo-400 py-0.5 tabular-nums"
            />
          ) : (
            <>
              <span className={dim ? 'text-gray-400' : 'font-bold text-gray-900'}>
                {price > 0 ? price.toLocaleString() : '–'}
              </span>
              {foreign && !dim && (
                <span className="ml-1.5 text-[10px] text-gray-400 font-normal">
                  {foreign.symbol}{foreign.amount.toFixed(foreign.decimals)}
                </span>
              )}
            </>
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
  };

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

          // dimmed: 프로모션 대상 시나리오인데 활성화 안 된 경우 (수동 모드는 프로모션 버튼 자체가 없으므로 dim 처리 안 함)
          const isDimTarget = PROMO_DIMMED_IDS.has(id);
          const dim = mode === 'auto' && activeIds !== undefined && isDimTarget && !activeIds.has(id);
          const rateField = RATE_FIELD_BY_SCENARIO_ID[id];
          const isLocked = MANUAL_LOCKED_IDS.has(id);
          const manualRow = mode === 'manual' && !isLocked ? manualById.get(id) : undefined;
          const overridden = !!manualRow;

          const label = overridden ? manualRow.label : scenario.label;
          const price = overridden ? manualRow.price : scenario.calcKrwPrice(base, usdKrw, jpyKrw, promoNewWeek, rates);
          const foreign = overridden ? null : (scenario.foreignAmt?.(base, usdKrw, jpyKrw) ?? null);
          const hint = overridden ? undefined : (hintOverrides[id] ?? scenario.hint);

          return renderRow({
            key: id,
            label, price, hint, foreign, dim,
            editable: mode === 'manual' && !isLocked && canEditManual,
            rowId: manualRow?.id ?? id,
            isCustom: false,
            rateField,
          });
        })}
        {customRows.map((row) => renderRow({
          key: row.id,
          label: row.label,
          price: row.price,
          dim: false,
          editable: canEditManual,
          rowId: row.id,
          isCustom: true,
        }))}
        {mode === 'manual' && canEditManual && (
          <tr>
            <td colSpan={5} className="px-3 py-2">
              <button
                type="button"
                onClick={() => onAddManualRow?.(section)}
                className="text-[11px] font-semibold text-indigo-500 hover:text-indigo-700 inline-flex items-center gap-1"
              >
                <span className="text-[14px] leading-none">+</span> 시나리오 항목 추가
              </button>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function PricingModal({ sku, onClose }: { sku: SkuData; onClose: () => void }) {
  const { usdKrw, jpyKrw } = useExchangeRates();
  const role = useAuth((s) => s.role);
  const setPricingRates = useStore((s) => s.setPricingRates);
  const setPricingMemo = useStore((s) => s.setPricingMemo);
  const setPriceConfirmed = useStore((s) => s.setPriceConfirmed);
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);
  const liveSku = useStore((s) => s.skus.find((x) => x.id === sku.id)) ?? sku;

  // 가격 확정 시 프라이싱 표 전체 잠금 — 확정 해제는 마스터/PM/플랫폼MD/브랜드MD만 가능
  const isPriceLocked = liveSku.isPriceConfirmed ?? false;
  const canUnlockPrice = hasPricingEditRole(role);
  // 마스터/PM/플랫폼MD/브랜드MD가 + 잠기지 않았을 때만 프라이싱 표(할인율 선택·자동↔수동 전환·수동 시나리오명/가격) 편집 가능
  const canEditPricing = canUnlockPrice && !isPriceLocked;

  const [memoSkuId, setMemoSkuId] = useState(sku.id);
  const [memoDraft, setMemoDraft] = useState(liveSku.pricingMemo ?? '');
  if (sku.id !== memoSkuId) {
    setMemoSkuId(sku.id);
    setMemoDraft(liveSku.pricingMemo ?? '');
  }
  const commitMemo = () => {
    if (memoDraft !== (liveSku.pricingMemo ?? '')) setPricingMemo(sku.id, memoDraft).catch(console.error);
  };

  const setPricingPromo = useStore((s) => s.setPricingPromo);
  const promoOpenSpecial = liveSku.pricingPromoOpenSpecial ?? true;  // 오픈특가
  const promoNewWeek = liveSku.pricingPromoNewWeek ?? false;         // 신상위크
  const promoLive = liveSku.pricingPromoLive ?? false;               // 라이브 (단독)
  const promoExclusive = liveSku.pricingPromoExclusive ?? false;     // 선단독
  const togglePromo = (
    field: 'pricingPromoOpenSpecial' | 'pricingPromoNewWeek' | 'pricingPromoLive' | 'pricingPromoExclusive',
    current: boolean,
  ) => setPricingPromo(sku.id, { [field]: !current }).catch(console.error);

  // B2C에서 활성화된 시나리오 ID 집합
  const b2cActiveIds = new Set<string>();
  if (promoOpenSpecial) b2cActiveIds.add('오픈특가');
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

  // ── 자동/수동 모드 ──
  const pricingMode = liveSku.pricingMode ?? 'auto';

  const [manualDraft, setManualDraft] = useState<ManualScenarioEntry[]>(liveSku.manualScenarios ?? []);
  const [manualDraftSkuId, setManualDraftSkuId] = useState(sku.id);
  if (sku.id !== manualDraftSkuId) {
    setManualDraftSkuId(sku.id);
    setManualDraft(liveSku.manualScenarios ?? []);
  }

  const isFirstManualRender = useRef(true);
  useEffect(() => {
    if (isFirstManualRender.current) {
      isFirstManualRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      updateSku(sku.id, { manualScenarios: manualDraft });
      persistSku(sku.id).catch(console.error);
    }, 800);
    return () => clearTimeout(timer);
    // manualDraft 변경에만 반응 — sku.id/updateSku/persistSku는 안정적
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualDraft]);

  const setMode = (mode: 'auto' | 'manual') => {
    if (mode === 'manual' && manualDraft.length === 0) {
      // 최초 수동 전환 — 지금 자동계산값을 1회 스냅샷해서 채움 (이후 독립적으로 저장)
      const seeded: ManualScenarioEntry[] = [...B2C_SCENARIO_IDS, ...B2B_SCENARIO_IDS]
        .filter((id) => !MANUAL_LOCKED_IDS.has(id))
        .map((id) => {
          const scenario = PRICING_SCENARIOS.find((s) => s.id === id)!;
          const price = scenario.calcKrwPrice(sku.price, usdKrw, jpyKrw, promoNewWeek, rates);
          const section: 'B2C' | 'B2B' = B2C_SCENARIO_IDS.includes(id) ? 'B2C' : 'B2B';
          return { id, section, label: scenario.label, price, isCustom: false };
        });
      setManualDraft(seeded);
      updateSku(sku.id, { pricingMode: mode, manualScenarios: seeded });
    } else {
      updateSku(sku.id, { pricingMode: mode });
    }
    persistSku(sku.id).catch(console.error);
  };

  const addManualRow = (section: 'B2C' | 'B2B') => {
    setManualDraft((prev) => [...prev, { id: crypto.randomUUID(), section, label: '', price: 0, isCustom: true }]);
  };
  const removeManualRow = (rowId: string) => {
    setManualDraft((prev) => prev.filter((r) => r.id !== rowId));
  };
  const updateManualLabel = (rowId: string, value: string) => {
    setManualDraft((prev) => prev.map((r) => (r.id === rowId ? { ...r, label: value } : r)));
  };
  const updateManualPrice = (rowId: string, value: number) => {
    setManualDraft((prev) => prev.map((r) => (r.id === rowId ? { ...r, price: value } : r)));
  };

  const tableProps = { base: sku.price, regularPrice: sku.regularPrice, cost: sku.cost, usdKrw, jpyKrw, rates };
  const manualTableProps = {
    mode: pricingMode,
    canEditManual: canEditPricing,
    onManualLabelChange: updateManualLabel,
    onManualPriceChange: updateManualPrice,
    onAddManualRow: addManualRow,
    onRemoveManualRow: removeManualRow,
  };

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
              {sku.skuName || '(SKU명 미입력)'} — 프라이싱 시나리오
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

          {/* 가격 확정 잠금 안내 */}
          {isPriceLocked && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex-wrap">
              <span className="text-[12px] font-semibold text-amber-700 flex items-center gap-1.5 whitespace-nowrap">
                🔒 가격이 확정되어 프라이싱을 수정할 수 없습니다
              </span>
              {canUnlockPrice ? (
                <button
                  type="button"
                  onClick={() => setPriceConfirmed(sku.id, false).catch(console.error)}
                  className="ml-auto px-2.5 py-1 rounded-md text-[11px] font-semibold border border-amber-300 bg-white text-amber-700 hover:bg-amber-100 transition-colors whitespace-nowrap"
                >
                  확정 해제
                </button>
              ) : (
                <span className="ml-auto text-[10px] text-amber-500 whitespace-nowrap">확정 해제는 마스터·PM·플랫폼MD·브랜드MD만 가능</span>
              )}
            </div>
          )}

          {/* 자동/수동 모드 */}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 px-4 py-3 flex items-center gap-3 flex-wrap">
            {canEditPricing ? (
              <div className="inline-flex rounded-full p-0.5 bg-white border border-indigo-200 shadow-sm">
                <button
                  type="button"
                  onClick={() => setMode('auto')}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${
                    pricingMode === 'auto' ? 'bg-indigo-600 text-white' : 'text-indigo-500 hover:bg-indigo-50'
                  }`}
                >
                  자동
                </button>
                <button
                  type="button"
                  onClick={() => setMode('manual')}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${
                    pricingMode === 'manual' ? 'bg-indigo-600 text-white' : 'text-indigo-500 hover:bg-indigo-50'
                  }`}
                >
                  수동
                </button>
              </div>
            ) : (
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-white border border-indigo-200 text-indigo-500">
                {pricingMode === 'auto' ? '자동' : '수동'}
              </span>
            )}
            <span className="text-[11px] text-indigo-500 flex-1 min-w-[220px]">
              {isPriceLocked
                ? '가격 확정 중에는 자동/수동 전환도 할 수 없습니다.'
                : pricingMode === 'auto'
                  ? `지금 보시는 자동계산 값 그대로입니다.${canEditPricing ? ' 수동으로 바꾸면 이 값을 그대로 가져와 직접 고칠 수 있어요. (글로벌 공급가는 수동에서도 자동계산 고정)' : ''}`
                  : (canEditPricing
                    ? '시나리오명·실제가격을 직접 입력하세요. 할인율·원가율은 계속 자동 계산됩니다.'
                    : '수동으로 설정된 값입니다 · 편집은 마스터·PM·플랫폼MD·브랜드MD만 가능')}
            </span>
          </div>

          {/* B2C 시나리오 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            {/* B2C 헤더 + 프로모션 선택 (수동 모드에서는 전부 수기 작성이라 프로모션 선택 자체를 숨김) */}
            <div className="px-4 py-2.5 bg-sky-50 border-b border-sky-100 flex items-center gap-3 flex-wrap">
              <span className="text-[11px] font-bold tracking-wide uppercase text-sky-600">B2C</span>
              {pricingMode === 'auto' && (
                <>
                  <div className="w-px h-3.5 bg-sky-200" />
                  <span className="text-[11px] text-sky-500 font-medium">오픈 프로모션 선택</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => togglePromo('pricingPromoOpenSpecial', promoOpenSpecial)}
                      disabled={isPriceLocked}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        promoOpenSpecial
                          ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                          : 'bg-white text-indigo-400 border-indigo-200 hover:bg-indigo-50'
                      }`}
                    >
                      오픈특가
                    </button>
                    <button
                      onClick={() => togglePromo('pricingPromoNewWeek', promoNewWeek)}
                      disabled={isPriceLocked}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        promoNewWeek
                          ? 'bg-red-500 text-white border-red-500 shadow-sm'
                          : 'bg-white text-red-400 border-red-200 hover:bg-red-50'
                      }`}
                    >
                      신상위크
                    </button>
                    <button
                      onClick={() => togglePromo('pricingPromoLive', promoLive)}
                      disabled={isPriceLocked}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        promoLive
                          ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                          : 'bg-white text-orange-400 border-orange-200 hover:bg-orange-50'
                      }`}
                    >
                      라이브
                    </button>
                    <button
                      onClick={() => togglePromo('pricingPromoExclusive', promoExclusive)}
                      disabled={isPriceLocked}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        promoExclusive
                          ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                          : 'bg-white text-emerald-500 border-emerald-200 hover:bg-emerald-50'
                      }`}
                    >
                      선단독
                    </button>
                  </div>
                </>
              )}
              <div className="w-px h-3.5 bg-sky-200" />
              <span className="text-[10px] text-sky-400">
                {isPriceLocked
                  ? '가격 확정 중에는 할인율을 변경할 수 없습니다'
                  : (canEditPricing ? '할인율 항목 클릭 시 이 SKU만 변경됩니다' : '할인율 변경은 마스터·PM·플랫폼MD·브랜드MD만 가능')}
              </span>
            </div>
            {(canEditPricing || memoDraft) && (
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
                <span className="text-[10px] font-semibold text-amber-600 whitespace-nowrap">메모</span>
                <input
                  type="text"
                  value={memoDraft}
                  onChange={(e) => setMemoDraft(e.target.value)}
                  onBlur={commitMemo}
                  readOnly={!canEditPricing}
                  maxLength={200}
                  placeholder={canEditPricing ? '이 SKU 프라이싱 관련 메모…' : ''}
                  className={`flex-1 min-w-0 bg-transparent text-xs focus:outline-none ${
                    canEditPricing ? 'text-gray-700 placeholder-amber-300' : 'text-gray-500 cursor-default'
                  }`}
                />
              </div>
            )}
            <div className="overflow-x-auto">
              <ScenarioTable
                scenarioIds={B2C_SCENARIO_IDS} section="B2C" {...tableProps}
                activeIds={b2cActiveIds} promoNewWeek={promoNewWeek} hintOverrides={b2cHintOverrides}
                canEditRates={canEditPricing} onSelectRate={handleSelectRate}
                manualRows={manualDraft.filter((r) => r.section === 'B2C')}
                {...manualTableProps}
              />
            </div>
          </div>

          {/* B2B 시나리오 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 bg-violet-50 border-b border-violet-100">
              <span className="text-[11px] font-bold tracking-wide uppercase text-violet-600">B2B</span>
            </div>
            <div className="overflow-x-auto">
              <ScenarioTable
                scenarioIds={B2B_SCENARIO_IDS} section="B2B" {...tableProps}
                manualRows={manualDraft.filter((r) => r.section === 'B2B')}
                {...manualTableProps}
              />
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
