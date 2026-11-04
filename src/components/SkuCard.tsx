import type { SkuData } from '../types';
import { BRANDS, CHANNELS, B2C_CHANNELS, B2B_CHANNELS, CHANNEL_CONFIRM_GROUP, STEP2_FORCE_RECALC_MARK, getDisabledChannels, getConfirmedChannels, isSeasonOnly, isMarketingLocked, DEFAULT_CHANNEL_COMMISSION, getSkuMonths, isNextYearMonth, type Month, type Channel, type OptOutChannel } from '../types';
import type { ChannelPricing } from '../types';
import { useStore, planScopeOf } from '../store';
import { allocate, applyChannelShares, coverage, redistributeByWeights, resolveChannelShares, scaleOpenChannelsTo } from '../utils/qtyPlan';
import { useAuth } from '../store/auth';
import { useCpoSync } from '../store/cpoSync';
import { getConfirmedPricingScenario, cpoPricingDeepLink, cpoProjectDeepLink, CPO_STATUS_STYLES, resolveManagerNames } from '../types/cpo';
import { useState, useRef, useEffect, useMemo, type Dispatch, type SetStateAction, type ChangeEvent } from 'react';
import {
  fetchTeamCateData, classifyTableauError, TABLEAU_ERROR_MESSAGES,
  type TeamCateMap, type ChannelByYearMonth, type TableauErrorReason,
} from '../services/tableau';
import { OptionConfigColumn } from './OptionConfigColumn';
import { MemoBox } from './MemoBox';
import { useReviewCtx } from '../hooks/useReviewCtx';
import { cachedReview } from '../utils/skuReview';
import { NumericInput } from './NumericInput';
import { useExchangeRates } from '../utils/useExchangeRates';
import { usePermission } from '../contexts/PermissionsContext';
import { canConfirmGroup, isAllChannelRole, ownsChannel, type QtyChannel } from '../utils/channelOwnership';
import { copySkuLink } from '../utils/skuLink';
import { calcVarCostResults, compMonthlyActive, fallbackWeightsOf, getCompQtyAdj, type CompareData } from '../utils/compareData';
import { MarketingBriefModal } from './MarketingBriefModal';
import { exportSimulationXlsx } from '../utils/exportXlsx';
import { PRICING_SCENARIOS, PRICING_DEFAULT_OPT } from '../utils/pricingScenarios';
import { STEP1_OPTIONS, normalizeStep1Opt, step1Pricer } from '../utils/step1Price';
import { cellMoney, cmOf, varCostOf } from '../utils/reviewSku';
import { finalOrderModel } from '../utils/finalOrder';
import { usePricingPolicy } from '../hooks/usePricingPolicy';
import { CalendarPopup } from './CalendarPopup';

const MONTH_LABELS: Record<Month, string> = {
  1: '1월', 2: '2월', 3: '3월', 4: '4월', 5: '5월', 6: '6월',
  7: '7월', 8: '8월', 9: '9월', 10: '10월', 11: '11월', 12: '12월',
};


const CHANNEL_COLORS: Record<Channel, string> = {
  '자사몰': '#6366f1', '스스': '#8b5cf6', '위탁': '#06b6d4',
  '쿠팡': '#f97316', 'B2B': '#10b981', '사입': '#6b7280', '팝업/페어': '#a855f7',
  '글로벌': '#ec4899', '일본': '#ef4444',
};

function formatWon(value: number): string {
  if (value <= 0) return '–';
  if (value >= 100_000_000) {
    const uk = value / 100_000_000;
    return `${Number.isInteger(uk) ? uk : uk.toFixed(1)}억`;
  }
  return `${Math.round(value / 10_000).toLocaleString()}만`;
}

interface Props {
  sku: SkuData;
  /** [발주량 검토에서 열기] */
  onOpenInReview?: (sku: SkuData) => void;
}

/** 이번 발주량 대비 시즌 판매 목표 판정 칩 (STEP1·STEP2 공용) */
export function CoverageChip({ sku, skuMonths, wrap }: { sku: SkuData; skuMonths: Month[]; wrap?: boolean }) {
  const seasonOnly = isSeasonOnly(sku);
  const cov = coverage(skuMonths.map((m) => sku.monthlySplit.find((x) => x.month === m)?.quantity ?? 0), sku.totalOrderQty, seasonOnly);
  if (cov.status === 'empty') return null;
  const mLabel = (i: number) => `${skuMonths[i]}월`;
  const n = Math.abs(cov.diff).toLocaleString();
  let text: string;
  switch (cov.status) {
    case 'match':
      text = '판매 목표 = 발주량';
      break;
    case 'reorder':
      text = cov.coverUntilIdx >= 0
        ? `발주량으로 ${mLabel(cov.coverUntilIdx)}까지 커버 · ${mLabel(cov.firstOverIdx)}부터 리오더 약 ${n}개`
        : `첫 달부터 발주량 초과 · 리오더 약 ${n}개`;
      break;
    case 'stockout':
      text = cov.coverUntilIdx >= 0
        ? `품절 위험 · ${mLabel(cov.coverUntilIdx)}까지 커버 · ${mLabel(cov.firstOverIdx)} 조기 품절 예상 · 목표 대비 ${n}개 부족`
        : `품절 위험 · 첫 달 조기 품절 예상 · 목표 대비 ${n}개 부족`;
      break;
    case 'leftover':
      text = `잔여 재고 · 시즌 후 약 ${n}개 · 다음 시즌 이월`;
      break;
    default:
      text = `과재고 위험 · 시즌 후 잔여 약 ${n}개`;
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-1.5 py-0.5 bg-pink-100 text-red-600 ${wrap ? '' : 'whitespace-nowrap'}`}>
      {seasonOnly && <span className="font-bold">시즌 한정 ·</span>}
      {text}
    </span>
  );
}

/** 입력 중에는 값만 들고 있다가 포커스 해제·Enter 때 한 번 반영 (월 비중처럼 입력 도중 값이 표를 바꾸면 안 되는 칸) */
function CommitNumericInput({ value, onCommit, ...rest }: {
  value: number;
  onCommit: (value: number) => void;
  allowDecimal?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const draft = useRef<number | null>(null);
  return (
    <NumericInput
      {...rest}
      value={value}
      onChange={(v) => { draft.current = v; }}
      onBlur={() => {
        const v = draft.current;
        draft.current = null;
        if (v !== null && v !== value) onCommit(v);
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}

export function SkuCard({ sku, onOpenInReview }: Props) {
  const toggleExpanded = useStore((s) => s.toggleExpanded);
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);
  const { role } = useAuth();
  const perm = usePermission(role);
  const canEdit = perm.skuBasic;

  return (
    <div className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
      {/* 요약 헤더 */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        {/* 1행: 토글 + SKU명 + 액션 버튼 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleExpanded(sku.id)}
            className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
          >
            <svg
              className={`w-4 h-4 transition-transform ${sku.isExpanded ? 'rotate-90' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <button
            onClick={() => toggleExpanded(sku.id)}
            className="font-semibold text-gray-900 truncate flex-1 min-w-0 text-sm text-left hover:text-indigo-700 transition-colors"
          >
            {sku.skuName || '(SKU명 미입력)'}
          </button>

          <CopySkuLinkButton skuId={sku.id} />
        </div>

        {/* 2행: 배지 + 수치 요약 */}
        <div className="mt-1.5 ml-6 flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex items-center gap-1">
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{sku.category}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">{sku.skuType}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">{sku.brand}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>₩{sku.price.toLocaleString()}</span>
            <span className="text-gray-300">·</span>
            <span>{sku.totalOrderQty.toLocaleString()}</span>
          </div>
          {/* 채널별 확정 뱃지 */}
          <div className="flex items-center gap-1">
            {sku.step2PlatformConfirmed && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-emerald-600 text-white">플랫폼 확정</span>
            )}
            {sku.step2BrandConfirmed && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-amber-500 text-white">브랜드 확정</span>
            )}
            {sku.step2GlobalConfirmed && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-sky-600 text-white">글로벌 확정</span>
            )}
          </div>
        </div>
      </div>

      {/* 상세 입력 영역 (펼침) */}
      {sku.isExpanded && (
        <div className="p-4 bg-white space-y-4">
          {/* 기본 정보 영역: 썸네일 · 기본 정보 · 옵션 구성과 메모 — 썸네일과 옵션 칸 폭은 카드 폭을 따라 함께 움직임 */}
          <div className="grid gap-4 grid-cols-1 md:grid-cols-[148px_minmax(0,1fr)] lg:grid-cols-[clamp(148px,18%,220px)_minmax(0,1fr)_clamp(280px,26%,320px)] pb-4 border-b border-gray-200">
            <BasicInfoColumn sku={sku} readOnly={!canEdit} />
            <div className="md:col-span-2 lg:col-span-1 min-w-0 grid gap-4 grid-cols-1 md:grid-cols-2 lg:flex lg:flex-col lg:gap-3">
              <OptionConfigColumn sku={sku} readOnly={!canEdit || !!sku.finalOrderConfirmedAt} />
              <MemoBox skuId={sku.id} memo={sku.memo} readOnly={!canEdit}
                onSave={(html) => { if (canEdit) { updateSku(sku.id, { memo: html }); void persistSku(sku.id); } }} />
            </div>
          </div>
          <OrderResultPanel sku={sku} onOpenInReview={onOpenInReview} />
        </div>
      )}
    </div>
  );
}

/** SKU 카드 › 발주 결과 — 발주량 검토에서 정한 값을 보기만 한다. 금액은 판매 목표 전체 기준(채널별 요약과 같음) */
function OrderResultPanel({ sku, onOpenInReview }: { sku: SkuData; onOpenInReview?: (sku: SkuData) => void }) {
  const { ctx } = useReviewCtx();
  const m = cachedReview(sku, ctx, 'season').money;
  const skuMonths = getSkuMonths(sku.releaseDate);
  const releaseYear = sku.releaseDate ? parseInt(sku.releaseDate.split('-')[0], 10) : 2026;
  const qty = sku.totalOrderQty;
  const coverIdx = qty > 0 ? m.coverage.cumulative.findIndex((c) => c >= qty) : -1;
  const active = sku.orderPlans?.active ?? 1;
  const state = sku.finalOrderConfirmedAt
    ? { text: '발주 확정', cls: 'bg-gray-200 text-gray-700' }
    : sku.orderPlans?.decided ? { text: `${active}안 저장`, cls: 'bg-emerald-100 text-emerald-700' } : { text: '검토 전', cls: 'bg-amber-100 text-amber-800' };
  const changed = !!sku.finalOrderConfirmedAt && sku.finalOrderConfirmedOrderQty !== undefined && sku.finalOrderConfirmedOrderQty !== qty;
  const profitText = m.profit === null ? '–' : formatWon(m.profit);
  return (
    <div className="border-2 border-indigo-200 rounded-lg p-3 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-sm text-gray-900">발주 결과</b>
        <span className={`px-1.5 rounded-full text-[11px] font-semibold ${state.cls}`}>{state.text}</span>
        <span className="text-[11px] text-gray-500">보기 전용</span>
        {changed && <span className="text-[11px] font-medium text-amber-600">⚠ 발주량 변경됨 · 확정 {sku.finalOrderConfirmedOrderQty!.toLocaleString()}개 → 현재 {qty.toLocaleString()}개</span>}
        <span className="flex-1" />
        {onOpenInReview && <button onClick={() => onOpenInReview(sku)} className="text-xs px-3 py-1 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-700">발주량 검토에서 열기 →</button>}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-x-5 gap-y-3 items-start">
        <div className="grid grid-cols-2 gap-3 tabular-nums">
          <div><div className="text-[11px] text-gray-500">{sku.orderPlans?.decided ? `${active}안 ` : ''}발주량 · MOQ {sku.moq.toLocaleString()}</div><b className="text-base font-extrabold">{qty.toLocaleString()}개</b></div>
          <div><div className="text-[11px] text-gray-500">소진월 · 판정</div><div className="flex flex-wrap items-center gap-1.5"><b className="text-base font-extrabold">{coverIdx < 0 ? '미소진' : `${m.months[coverIdx].month}월`}</b><CoverageChip sku={sku} skuMonths={skuMonths} wrap /></div></div>
          <div><div className="text-[11px] text-gray-500">예상 순매출</div><b className="text-base font-extrabold">{formatWon(m.revenue)}</b></div>
          <div><div className="text-[11px] text-gray-500">예상 공헌이익{m.cm !== null ? ` · CM ${m.cm}%` : ''}</div><b className="text-base font-extrabold">{profitText}</b></div>
        </div>
        <OptionResultTable sku={sku} />
      </div>
      <ChannelMonthTable sku={sku} readOnly monthlySplit={sku.monthlySplit} skuMonths={skuMonths} releaseYear={releaseYear} />
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums min-w-[560px]">
          <thead><tr className="border-b border-gray-200 text-gray-500"><th className="text-left px-2 py-1 font-semibold">예상 금액 · 판매 목표 전체 기준</th>{m.months.map((x) => <th key={x.month} className="text-right px-2 py-1 font-semibold">{x.month}월</th>)}<th className="text-right px-2 py-1 font-semibold">합계</th></tr></thead>
          <tbody>
            <tr className="border-b border-gray-100"><td className="px-2 py-1 whitespace-nowrap">순매출</td>{m.months.map((x) => <td key={x.month} className="px-2 py-1 text-right">{x.revenue ? formatWon(x.revenue) : '–'}</td>)}<td className="px-2 py-1 text-right font-semibold">{formatWon(m.revenue)}</td></tr>
            <tr><td className="px-2 py-1 whitespace-nowrap">공헌이익</td>{m.months.map((x) => <td key={x.month} className="px-2 py-1 text-right">{x.profit === null || !x.revenue ? '–' : formatWon(x.profit)}</td>)}<td className="px-2 py-1 text-right font-semibold">{profitText}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400">채널을 펼치면 옵션별 수량 · 수정은 발주량 검토에서</p>
    </div>
  );
}

/** SKU 카드 › 옵션별 최종 발주량 — 발주량 검토의 옵션 표와 같은 계산값을 보기만 한다 */
function OptionResultTable({ sku }: { sku: SkuData }) {
  const model = finalOrderModel(sku);
  const head = (
    <div className="flex flex-wrap items-center gap-1.5 mb-1 text-xs">
      <b>옵션별 최종 발주량{sku.orderPlans?.decided ? ` · ${sku.orderPlans.active ?? 1}안` : ''}</b>
      <span className="text-[11px] text-gray-500">{sku.finalOrderConfirmedAt ? '발주 확정 수량' : '발주량 검토 결과'}</span>
    </div>
  );
  if (!model) return <div className="min-w-0">{head}<p className="text-[11px] text-gray-400">옵션별 수량 없음 · 발주량 검토에서 입력</p></div>;
  const { activeSizes: az, activeColors: ac, hasColors, hasSizes, dispCS, dispC, dispS } = model;
  const th = 'px-2 py-1 text-right font-semibold whitespace-nowrap';
  const td = 'px-2 py-1 text-right';
  const lead = 'px-2 py-1 text-left whitespace-nowrap';
  const pct = (v: number, base: number) => (base > 0 ? `${Math.round((v / base) * 100)}%` : '–');
  const n = (v: number) => v.toLocaleString();
  let table;
  if (hasColors && hasSizes) {
    const rows = ac.map((c) => az.map((z) => dispCS(c.id, c.quantity, z.label, z.ratio)));
    const rowTotals = rows.map((r) => r.reduce((a, b) => a + b, 0));
    const colTotals = az.map((_, i) => rows.reduce((a, r) => a + r[i], 0));
    const total = rowTotals.reduce((a, b) => a + b, 0);
    table = (
      <>
        <thead><tr className="bg-gray-50 text-gray-500"><th className={`${lead} font-semibold`}>컬러 \ 사이즈</th>{az.map((z) => <th key={z.label} className={th}>{z.label}</th>)}<th className={th}>합계</th><th className={th}>비중</th></tr></thead>
        <tbody>
          {ac.map((c, i) => (
            <tr key={c.id} className="border-t border-gray-100">
              <td className={lead}>{c.name || '이름 없음'}</td>
              {rows[i].map((v, j) => <td key={az[j].label} className={td}>{n(v)}</td>)}
              <td className={`${td} font-semibold bg-gray-50`}>{n(rowTotals[i])}</td>
              <td className={`${td} text-gray-500`}>{pct(rowTotals[i], total)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold"><td className={lead}>합계</td>{colTotals.map((v, j) => <td key={az[j].label} className={td}>{n(v)}</td>)}<td className={td}>{n(total)}</td><td className={td}>{total > 0 ? '100%' : '–'}</td></tr>
          <tr className="border-t border-gray-100 bg-gray-50 text-gray-500"><td className={lead}>비중</td>{colTotals.map((v, j) => <td key={az[j].label} className={td}>{pct(v, total)}</td>)}<td className={td}>{total > 0 ? '100%' : '–'}</td><td /></tr>
        </tbody>
      </>
    );
  } else {
    const items = hasColors
      ? ac.map((c) => ({ key: c.id, label: c.name || '이름 없음', qty: dispC(c.id, c.quantity) }))
      : az.map((z) => ({ key: z.label, label: z.label, qty: dispS(z.label, z.ratio) }));
    const total = items.reduce((a, x) => a + x.qty, 0);
    table = (
      <>
        <thead><tr className="bg-gray-50 text-gray-500"><th className={`${lead} font-semibold`}>{hasColors ? '컬러' : '사이즈'}</th>{items.map((x) => <th key={x.key} className={th}>{x.label}</th>)}<th className={th}>합계</th></tr></thead>
        <tbody>
          <tr className="border-t border-gray-100"><td className={lead}>수량</td>{items.map((x) => <td key={x.key} className={td}>{n(x.qty)}</td>)}<td className={`${td} font-semibold bg-gray-50`}>{n(total)}</td></tr>
          <tr className="border-t border-gray-100 bg-gray-50 text-gray-500"><td className={lead}>비중</td>{items.map((x) => <td key={x.key} className={td}>{pct(x.qty, total)}</td>)}<td className={td}>{total > 0 ? '100%' : '–'}</td></tr>
        </tbody>
      </>
    );
  }
  return (
    <div className="min-w-0">
      {head}
      <div className="rounded-lg border border-gray-200 overflow-x-auto"><table className="w-full text-[11px] tabular-nums">{table}</table></div>
    </div>
  );
}

/** 발주량 검토 › 채널 수량 — 카드의 채널 표를 그대로 쓴다(월 계획 · STEP 탭 없음, 열어도 자동 저장 없음) */
export function ChannelQtyPanel({ sku, compare }: { sku: SkuData; compare: CompareData }) {
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);
  const setPricingOpts: Dispatch<SetStateAction<Record<string, string>>> = (updater) => {
    const latest = useStore.getState().skus.find((s) => s.id === sku.id)?.pricingOpts ?? {};
    const next = typeof updater === 'function' ? updater(latest) : updater;
    updateSku(sku.id, { pricingOpts: next });
    persistSku(sku.id);
  };
  return (
    <MonthlyTable
      channelOnly
      sku={sku}
      readOnly={false}
      compMonthlyData={compare.monthly}
      compModeLabel={compare.modeLabel}
      compMode={compare.mode}
      compChannelDist={compare.channelDist}
      compChannelYM={compare.channelYM}
      pricingOpts={sku.pricingOpts ?? {}}
      setPricingOpts={setPricingOpts}
      onStep3TotalsChange={noopTotals}
      autoInit={false}
    />
  );
}
const noopTotals = () => {};

// ── SKU 직링크 복사 버튼 (#sku/<id>) ────────────────────────────────────
function CopySkuLinkButton({ skuId }: { skuId: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'error'>('idle');
  async function handleCopy() {
    const ok = await copySkuLink(skuId);
    setState(ok ? 'done' : 'error');
    setTimeout(() => setState('idle'), 1500);
  }
  return (
    <button
      onClick={handleCopy}
      className={`flex-shrink-0 flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full border transition-colors ${
        state === 'done'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
          : state === 'error'
            ? 'border-red-300 bg-red-50 text-red-600'
            : 'border-gray-200 bg-white text-gray-500 hover:text-indigo-700 hover:border-indigo-300'
      }`}
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
      {state === 'done' ? '복사됨' : state === 'error' ? '복사 실패' : '공유'}
    </button>
  );
}

// ── 썸네일 업로드/표시 컴포넌트 ──────────────────────────────────────────
function ThumbnailSection({ skuId, imageUrl, readOnly }: { skuId: string; imageUrl?: string; readOnly?: boolean }) {
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);
  const [uploading, setUploading] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    setSaveError(false);
    try {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            const MAX = 800;
            let { width, height } = img;
            if (width > MAX || height > MAX) {
              if (width >= height) { height = Math.round((height * MAX) / width); width = MAX; }
              else { width = Math.round((width * MAX) / height); height = MAX; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          };
          img.src = ev.target!.result as string;
        };
        reader.readAsDataURL(file);
      });
      updateSku(skuId, { imageUrl: dataUrl });
      await persistSku(skuId);
    } catch {
      // Firestore 저장 실패 → 로컬 상태 되돌리고 에러 표시
      updateSku(skuId, { imageUrl: imageUrl ?? '' });
      setSaveError(true);
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    updateSku(skuId, { imageUrl: '' });
    await persistSku(skuId);
  }

  if (uploading) {
    return (
      <div className="w-full aspect-square rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center">
        <span className="text-xs text-gray-400">업로드 중...</span>
      </div>
    );
  }

  if (saveError) {
    return (
      <div className="w-full aspect-square rounded-xl border border-red-200 bg-red-50 flex flex-col items-center justify-center gap-2 px-3 text-center">
        <span className="text-xs text-red-500 font-medium">저장 실패</span>
        <span className="text-[10px] text-red-400">이미지가 너무 크거나 네트워크 오류입니다.</span>
        <button
          onClick={() => setSaveError(false)}
          className="text-[10px] text-red-500 underline"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (imageUrl) {
    return (
      <div className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
        <img src={imageUrl} alt="SKU 썸네일" className="w-full aspect-square object-cover" />
        {!readOnly && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/45 transition-all flex flex-wrap content-center items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <button onClick={() => fileRef.current?.click()} className="px-3 py-1.5 bg-white/90 text-gray-800 text-xs rounded-lg font-medium hover:bg-white shadow-sm">교체</button>
            <button onClick={handleRemove} className="px-3 py-1.5 bg-red-500/90 text-white text-xs rounded-lg font-medium hover:bg-red-500 shadow-sm">삭제</button>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      </div>
    );
  }

  if (readOnly) {
    return (
      <div className="w-full aspect-square rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-center">
        <span className="text-xs text-gray-300">이미지 없음</span>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => fileRef.current?.click()}
        className="w-full aspect-square border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-indigo-300 hover:text-indigo-400 transition-colors bg-gray-50/50"
      >
        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="text-xs font-medium">썸네일 업로드</span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
    </div>
  );
}

// ── 날짜 필드: 텍스트 직접 입력 + 우측 캘린더 버튼 → CalendarPopup ──────────
function DateField({ value, onChange, onBlur, disabled }: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const calBtnRef = useRef<HTMLButtonElement>(null);
  const calRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!calOpen) return;
    function handleOutside(e: MouseEvent) {
      if (calRef.current && !calRef.current.contains(e.target as Node) &&
          calBtnRef.current && !calBtnRef.current.contains(e.target as Node)) {
        setCalOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) { if (e.key === 'Escape') setCalOpen(false); }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [calOpen]);

  function fmt(d: string): string {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00');
    if (isNaN(dt.getTime())) return '';
    return `${String(dt.getFullYear()).slice(2)}.${dt.getMonth() + 1}.${dt.getDate()}`;
  }

  function parse(s: string): string | null {
    const t = s.trim();
    const m2 = t.match(/^(\d{2})[./](\d{1,2})[./](\d{1,2})$/);
    if (m2) {
      const y = 2000 + parseInt(m2[1], 10);
      return `${y}-${String(parseInt(m2[2], 10)).padStart(2, '0')}-${String(parseInt(m2[3], 10)).padStart(2, '0')}`;
    }
    const m1 = t.match(/^(\d{1,2})[./](\d{1,2})$/);
    if (m1) {
      const mon = parseInt(m1[1], 10);
      const y = mon >= 7 ? 2025 : 2026;
      return `${y}-${String(mon).padStart(2, '0')}-${String(parseInt(m1[2], 10)).padStart(2, '0')}`;
    }
    return null;
  }

  function commit() {
    if (!text.trim()) { onChange(''); } else { const p = parse(text); if (p) onChange(p); }
    setEditing(false);
    onBlur();
  }

  function openCal(e: React.MouseEvent) {
    e.stopPropagation();
    const rect = calBtnRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 6, left: rect.left });
    setCalOpen((v) => !v);
  }

  return (
    <>
      <div className={`flex items-center w-full h-[30px] border rounded-md text-xs transition-colors ${
        disabled ? 'border-gray-200 bg-gray-50' : 'border-gray-200 focus-within:ring-2 focus-within:ring-indigo-400 focus-within:border-indigo-400'
      }`}>
        {editing ? (
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); } }}
            placeholder="yy.M.D"
            autoFocus
            className="flex-1 px-2 bg-transparent outline-none text-gray-700 min-w-0 w-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => { if (!disabled) { setText(fmt(value)); setEditing(true); } }}
            disabled={disabled}
            className={`flex-1 px-2 text-left bg-transparent outline-none min-w-0 ${value ? 'text-gray-700' : 'text-gray-300'} ${disabled ? 'cursor-not-allowed' : 'cursor-text'}`}
          >
            {fmt(value) || '—'}
          </button>
        )}
        {!disabled && (
          <button
            ref={calBtnRef}
            type="button"
            onClick={openCal}
            tabIndex={-1}
            className="px-1.5 text-gray-400 hover:text-indigo-500 transition-colors flex-shrink-0"
            title="캘린더에서 선택"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
        )}
      </div>
      {calOpen && (
        <CalendarPopup
          selectedDate={value}
          top={pos.top}
          left={pos.left}
          containerRef={calRef}
          onSelect={(d) => { onChange(d); onBlur(); setCalOpen(false); }}
        />
      )}
    </>
  );
}

// ── 기본 정보 컬럼 ────────────────────────────────────────────────────────
function BasicInfoColumn({ sku, readOnly }: { sku: SkuData; readOnly?: boolean }) {
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);
  const [briefOpen, setBriefOpen] = useState(false);

  // CPO에 대응 기획이 있으면 판매가/원가/정가는 그쪽이 원본 — Product에선 잠그고 표시만 함
  const cpoProject = useCpoSync((s) => s.cpoProjects[sku.id]);
  const cpoUsers = useCpoSync((s) => s.cpoUsers);
  const cpoScenario = cpoProject ? getConfirmedPricingScenario(cpoProject.pricing) : null;
  const cpoCost = cpoProject && cpoProject.pricing?.cost > 0 ? cpoProject.pricing.cost : null;
  const priceLockedByCpo = !!cpoProject;
  const cpoStatusStyle = cpoProject ? CPO_STATUS_STYLES[cpoProject.status] : null;
  const managerNames = cpoProject ? resolveManagerNames(cpoProject.planningManagerIds, cpoUsers) : [];

  const inputCls = `w-full h-[30px] px-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed`;
  const selectCls = `w-full h-[30px] px-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed`;
  const labelCls = 'block text-[11px] text-gray-500 mb-0.5';
  const staticCls = 'w-full h-[30px] px-2 flex items-center text-xs border border-gray-100 rounded-md bg-gray-50 text-gray-700 tabular-nums';

  function handleChange(patch: Partial<SkuData>) {
    if (readOnly) return;
    updateSku(sku.id, patch);
  }

  function handleBlur() {
    if (readOnly) return;
    persistSku(sku.id);
  }

  const discount = sku.regularPrice > 0 && sku.price > 0
    ? `${Math.round((1 - sku.price / sku.regularPrice) * 100)}%`
    : <span className="text-gray-300">—</span>;

  return (
    <>
      {/* 썸네일 · 기획 바로가기 */}
      <div className="min-w-0 grid grid-cols-[88px_minmax(0,1fr)] md:grid-cols-1 gap-2 items-start">
        <ThumbnailSection skuId={sku.id} imageUrl={sku.imageUrl} readOnly={readOnly} />
        {cpoProject ? (
          <a
            href={cpoProjectDeepLink(sku.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-between gap-1 px-2 py-1.5 text-[11px] font-semibold rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
          >
            기획 보러가기
            <span aria-hidden="true">↗</span>
          </a>
        ) : (
          <>
            <button
              onClick={() => setBriefOpen(true)}
              className={`w-full flex items-center justify-between gap-1 px-2 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors ${
                sku.marketingBrief
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                  : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}
            >
              Marketing Brief
              {sku.marketingBrief && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-200 text-indigo-700 font-bold">●</span>
              )}
            </button>
            {briefOpen && <MarketingBriefModal sku={sku} onClose={() => setBriefOpen(false)} />}
          </>
        )}
      </div>

      {/* 기본 정보 */}
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2 min-h-[20px]">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">기본 정보</h3>
          {/* CPO 진행상태 · 기획 담당자 — 읽기전용, CPO 대시보드가 원본 */}
          {cpoProject && (
            <>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${cpoStatusStyle?.bg ?? 'bg-gray-100'} ${cpoStatusStyle?.text ?? 'text-gray-600'} ${cpoStatusStyle?.border ?? 'border-gray-200'}`}
              >
                {cpoProject.status}
              </span>
              <span className="text-[11px] text-gray-500">
                기획 담당자: {managerNames.length > 0 ? managerNames.join(', ') : '–'}
              </span>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="col-span-2 min-w-0">
            <label className={labelCls}>SKU명</label>
            <input
              type="text"
              value={sku.skuName}
              onChange={(e) => handleChange({ skuName: e.target.value })}
              onBlur={handleBlur}
              disabled={readOnly || !!cpoProject}
              placeholder="SKU명 입력"
              className={inputCls}
            />
          </div>
          <div className="min-w-0">
            <label className={labelCls}>카테고리</label>
            <select
              value={sku.category}
              onChange={(e) => handleChange({ category: e.target.value as SkuData['category'] })}
              onBlur={handleBlur}
              disabled={readOnly}
              className={selectCls}
            >
              {(['식품', '용품', '잡화', '의류', '장난감'] as const).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className={labelCls}>SKU 구분</label>
            <select
              value={sku.skuType}
              onChange={(e) => handleChange({ skuType: e.target.value as SkuData['skuType'] })}
              onBlur={handleBlur}
              disabled={readOnly}
              className={selectCls}
            >
              {(['시즈널', '스테디', '미해당'] as const).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <label className={labelCls}>브랜드</label>
            <select
              value={sku.brand}
              onChange={(e) => handleChange({ brand: e.target.value as SkuData['brand'] })}
              onBlur={handleBlur}
              disabled={readOnly}
              className={selectCls}
            >
              {BRANDS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className={labelCls}>출시일</label>
            <DateField
              value={sku.releaseDate}
              onChange={(v) => handleChange({ releaseDate: v })}
              onBlur={handleBlur}
              disabled={readOnly}
            />
          </div>
          <div className="min-w-0">
            <label className={labelCls}>입고예정일</label>
            <DateField
              value={sku.arrivalDate ?? ''}
              onChange={(v) => handleChange({ arrivalDate: v })}
              onBlur={handleBlur}
              disabled={readOnly || !!cpoProject}
            />
          </div>
          <div className="min-w-0">
            <label className={labelCls}>촬영예정일</label>
            <DateField
              value={sku.shootingDate ?? ''}
              onChange={(v) => handleChange({ shootingDate: v })}
              onBlur={handleBlur}
              disabled={readOnly || !!cpoProject}
            />
          </div>

          {/* ── 프라이싱 구분 ── */}
          <div className="col-span-full flex items-center gap-2">
            <span className="text-[11px] font-semibold text-gray-400 tracking-wide uppercase whitespace-nowrap">프라이싱</span>
            <div className="flex-1 h-px bg-gray-200" />
            {sku.isPriceConfirmed && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-700 text-[10px] font-bold whitespace-nowrap">
                🔒 가격 확정됨
              </span>
            )}
          </div>

          {priceLockedByCpo ? (
            <>
              <div className="min-w-0">
                <label className={labelCls}>판매가 (₩)</label>
                <div className={staticCls}>{cpoScenario ? `₩${sku.price.toLocaleString()}` : <span className="text-gray-300">CPO 미확정</span>}</div>
              </div>
              <div className="min-w-0">
                <label className={labelCls}>원가 (₩)</label>
                <div className={staticCls}>{cpoCost !== null ? `₩${sku.cost.toLocaleString()}` : <span className="text-gray-300">CPO 미입력</span>}</div>
              </div>
              <div className="min-w-0">
                <label className={labelCls}>정가 (₩)</label>
                <div className={staticCls}>{cpoScenario ? `₩${sku.regularPrice.toLocaleString()}` : <span className="text-gray-300">CPO 미확정</span>}</div>
              </div>
            </>
          ) : (
            <>
              <div className="min-w-0">
                <label className={labelCls}>판매가 (₩)</label>
                <NumericInput value={sku.price} onChange={(v) => handleChange({ price: v })} onBlur={handleBlur} disabled={readOnly} placeholder="0" className={inputCls} />
              </div>
              <div className="min-w-0">
                <label className={labelCls}>원가 (₩)</label>
                <NumericInput value={sku.cost} onChange={(v) => handleChange({ cost: v })} onBlur={handleBlur} disabled={readOnly} placeholder="0" className={inputCls} />
              </div>
              <div className="min-w-0">
                <label className={labelCls}>정가 (₩)</label>
                <NumericInput value={sku.regularPrice} onChange={(v) => handleChange({ regularPrice: v })} onBlur={handleBlur} disabled={readOnly} placeholder="0" className={inputCls} />
              </div>
            </>
          )}
          <div className="min-w-0">
            <label className={labelCls}>상시할인율</label>
            <div className={staticCls}>{discount}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-[11px] text-gray-400">프라이싱 시나리오 · 가격 확정 → 프로젝션 › 프라이싱</p>
          {priceLockedByCpo && (
            <a
              href={cpoPricingDeepLink(sku.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-semibold text-indigo-700 hover:underline whitespace-nowrap"
            >
              기획 대시보드에서 수정 가능 <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </div>
    </>
  );
}

// ── 월별 판매 수량 테이블 ─────────────────────────────────────────────────
function MonthlyTable({
  sku,
  readOnly,
  compMonthlyData: compMonthlyTotal,
  compModeLabel,
  compMode,
  compChannelDist,
  compChannelYM,
  pricingOpts,
  setPricingOpts,
  onStep3TotalsChange,
  autoInit = true,
  channelOnly = false,
}: {
  sku: SkuData;
  readOnly: boolean;
  compMonthlyData: Partial<Record<number, number>>;
  compModeLabel: string;
  compMode: 'rolling12' | 'samePeriod';
  compChannelDist: Record<string, number> | null;
  compChannelYM: ChannelByYearMonth | null;
  pricingOpts: Record<string, string>;
  setPricingOpts: Dispatch<SetStateAction<Record<string, string>>>;
  onStep3TotalsChange: (totals: { revenue: number; profit: number | null } | null) => void;
  autoInit?: boolean;
  /** 발주량 검토 탭 — 채널별 목표량 표만 표시, 안내 문구는 접음 */
  channelOnly?: boolean;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'channel' | 'pricing'>('pricing');
  type Step2Snapshot = { channelMonthQty: SkuData['channelMonthQty']; pricingOpts: Record<string, string> };
  const [step2UndoStack, setStep2UndoStack] = useState<Step2Snapshot[]>([]);
  // step2InitBaselineQty: store(Firestore) 영구 보존값 — React state 불필요

  // 팀카테 변동비 데이터 로드
  const [teamCateMap, setTeamCateMap] = useState<TeamCateMap | null>(null);
  const [teamCateError, setTeamCateError] = useState<TableauErrorReason | null>(null);
  useEffect(() => {
    fetchTeamCateData()
      .then((m) => { setTeamCateMap(m); setTeamCateError(null); })
      .catch((err) => { console.error('[팀카테 변동비 로드 실패]', err); setTeamCateError(classifyTableauError(err)); });
  }, []);

  const releaseYear = sku.releaseDate ? parseInt(sku.releaseDate.split('-')[0], 10) : 2026;

  // 대응SKU 실적 — 채널 데이터 있으면 운영 채널 합(비운영 채널 제외), 없으면 SKU 토탈(비운영 채널 포함)
  const compMonthlyActiveOnly = useMemo(
    () => compMonthlyActive(sku, compChannelYM, compMode, getSkuMonths(sku.releaseDate), releaseYear),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [compChannelYM, compMode, sku.releaseDate, releaseYear, getDisabledChannels(sku).join('|')],
  );
  const compMonthlyData = compMonthlyActiveOnly ?? compMonthlyTotal;

  const varCostResults = useMemo<Record<string, { ratio: number; isFallback: boolean }>>(
    () => calcVarCostResults(teamCateMap, sku, compMode, compChannelYM),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teamCateMap, sku.category, sku.releaseDate, compMode, compChannelYM],
  );

  // 계산용: ratio만 추출 (공헌이익 계산, 엑셀 내보내기 등에서 사용)
  const varCostByChannel = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const [ch, r] of Object.entries(varCostResults)) out[ch] = r.ratio;
    return out;
  }, [varCostResults]);

  const { usdKrw: mtUsdKrw, jpyKrw: mtJpyKrw } = useExchangeRates();

  function captureStep2Backup() {
    // useStore.getState()로 React 렌더 지연 없이 최신 Zustand 값을 읽음
    const latestSku = useStore.getState().skus.find((s) => s.id === sku.id);
    const snapshot: Step2Snapshot = {
      channelMonthQty: [...(latestSku?.channelMonthQty ?? sku.channelMonthQty)],
      pricingOpts: { ...(latestSku?.pricingOpts ?? pricingOpts) },
    };
    setStep2UndoStack((prev) => {
      const last = prev[prev.length - 1];
      if (last &&
        JSON.stringify(last.channelMonthQty) === JSON.stringify(snapshot.channelMonthQty) &&
        JSON.stringify(last.pricingOpts) === JSON.stringify(snapshot.pricingOpts)) {
        return prev;
      }
      return [...prev, snapshot];
    });
  }
  const updateMonthlySplit = useStore((s) => s.updateMonthlySplit);
  // [채널 비중 수정] 편집안 — null이면 편집 모드 아님
  const [shareEdit, setShareEdit] = useState<Partial<Record<Channel, number>> | null>(null);
  const batchInitChannelMonthQty = useStore((s) => s.batchInitChannelMonthQty);
  const setStep2InitBaseline = useStore((s) => s.setStep2InitBaseline);
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);
  const setChannelConfirmed = useStore((s) => s.setChannelConfirmed);
  const { role } = useAuth();
  const perm = usePermission(role);
  const step1ReadOnly = !perm.step1;
  const step2ReadOnly = !perm.step2;
  // 담당 채널만 수정 (2026-10-05). 여러 채널을 한꺼번에 바꾸는 조정은 전 채널 역할(master · pm)만
  const allChannelRole = isAllChannelRole(role);
  const canEditChannel = (ch: QtyChannel) => !step2ReadOnly && ownsChannel(role, ch);

  // 대응SKU 채널 비중(비운영 채널 반영) — 없으면 기본 비중. 수량이 없던 칸을 채우거나 다시 나눌 때 쓴다
  const disabledKey = getDisabledChannels(sku).join('|');
  const fallbackWeights = useMemo<Partial<Record<Channel, number>>>(
    () => fallbackWeightsOf(sku, compChannelDist),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [compChannelDist, disabledKey],
  );
  const compareNames = sku.comparisonSku.compareSkuNames ?? [];
  const latestSku = () => useStore.getState().skus.find((s) => s.id === sku.id) ?? sku;
  const gridEmpty = sku.channelMonthQty.every((e) => e.qty === 0);

  /** 수량이 전혀 없을 때 최초 세팅: 총 발주량을 8개월 균등 → 대응SKU 채널 비중 */
  function buildInitialEntries(target: SkuData) {
    const scope = planScopeOf(target, fallbackWeights);
    const monthTargets = allocate(target.totalOrderQty, scope.months.map(() => 1));
    return redistributeByWeights(target.channelMonthQty, scope, fallbackWeights, monthTargets);
  }

  // STEP2 탭 진입 시: 비어 있으면 최초 세팅, 관리 탭 재계산 표식이 있으면 월 합계 유지한 채 대응SKU 비중으로 다시 나눔.
  // 대응SKU를 바꿨다고 자동으로 덮어쓰지 않는다 — [대응SKU 비중으로 다시 나누기]로만 반영.
  useEffect(() => {
    if (activeTab !== 'pricing') return;
    const latest = latestSku();
    // 발주량 검토: 빈 표를 자동으로 채우지 않고, 관리 탭 재계산 표식만 처리
    if (!autoInit && !(latest.channelQtyDerivedFromCompareSkus ?? []).includes(STEP2_FORCE_RECALC_MARK)) return;
    const names = latest.comparisonSku.compareSkuNames ?? [];
    // 대응SKU가 있는데 채널 비중을 아직 못 받았으면 기다린다 (기본 비중으로 먼저 채우지 않게)
    if (names.length > 0 && !compChannelDist) return;
    const isUninitialized = latest.channelMonthQty.every((e) => e.qty === 0);
    const forceRecalc = (latest.channelQtyDerivedFromCompareSkus ?? []).includes(STEP2_FORCE_RECALC_MARK);
    if (isUninitialized || forceRecalc) {
      if (isUninitialized && latest.totalOrderQty === 0) return;
      const entries = isUninitialized
        ? buildInitialEntries(latest)
        : redistributeByWeights(latest.channelMonthQty, planScopeOf(latest, fallbackWeights), fallbackWeights);
      if (entries.every((e) => e.qty === 0)) return;
      batchInitChannelMonthQty(sku.id, entries);
      setStep2InitBaseline(sku.id, entries);
      updateSku(sku.id, { channelQtyDerivedFromCompareSkus: names });
      persistSku(sku.id);
    } else if (!latest.step2InitBaselineQty || latest.step2InitBaselineQty.length === 0) {
      // 기존 데이터가 있지만 baseline이 없는 경우: 현재 값을 기준값으로 캡처
      setStep2InitBaseline(sku.id, latest.channelMonthQty);
      persistSku(sku.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, compChannelDist]);

  // 마지막으로 채널을 나눈 대응SKU와 지금 대응SKU가 다르면 안내만 한다 (자동 덮어쓰기 없음)
  const derivedFrom = sku.channelQtyDerivedFromCompareSkus;
  const compareChanged = !gridEmpty && derivedFrom !== undefined && !derivedFrom.includes(STEP2_FORCE_RECALC_MARK)
    && JSON.stringify([...derivedFrom].sort()) !== JSON.stringify([...compareNames].sort());

  function handleRedistribute() {
    captureStep2Backup();
    const latest = latestSku();
    const entries = latest.channelMonthQty.every((e) => e.qty === 0)
      ? buildInitialEntries(latest)
      : redistributeByWeights(latest.channelMonthQty, planScopeOf(latest, fallbackWeights), fallbackWeights);
    batchInitChannelMonthQty(sku.id, entries);
    setStep2InitBaseline(sku.id, entries);
    updateSku(sku.id, { channelQtyDerivedFromCompareSkus: compareNames });
    persistSku(sku.id);
  }

  function handleMonthShareCommit(month: Month, ratio: number) {
    const wasEmpty = latestSku().channelMonthQty.every((e) => e.qty === 0);
    updateMonthlySplit(sku.id, month, ratio, fallbackWeights);
    // 빈 표를 STEP1에서 처음 채웠으면 지금 대응SKU 기준으로 나눈 것으로 기록
    if (wasEmpty) updateSku(sku.id, { channelQtyDerivedFromCompareSkus: compareNames });
    persistSku(sku.id);
  }

  const shareResolution = shareEdit ? resolveChannelShares(sku.channelMonthQty, planScopeOf(sku), shareEdit) : null;

  function saveChannelShares() {
    const latest = latestSku();
    const scope = planScopeOf(latest);
    const r = resolveChannelShares(latest.channelMonthQty, scope, shareEdit ?? {});
    if (!r.ok) return;
    captureStep2Backup();
    batchInitChannelMonthQty(sku.id, applyChannelShares(latest.channelMonthQty, scope, r.shares));
    persistSku(sku.id);
    setShareEdit(null);
  }

  function fitPlanToOrderQty() {
    captureStep2Backup();
    const latest = latestSku();
    const scope = planScopeOf(latest);
    const marketing = scope.months.reduce((a, m) => a + (latest.marketingMonthQty?.[m] ?? 0), 0);
    batchInitChannelMonthQty(sku.id, scaleOpenChannelsTo(latest.channelMonthQty, scope, latest.totalOrderQty - marketing));
    persistSku(sku.id);
  }

  const activeChannelsForLock = CHANNELS.filter((c) => !getDisabledChannels(sku).includes(c));
  const confirmedChannels = getConfirmedChannels(sku);
  const allChannelsConfirmed = activeChannelsForLock.every((c) => confirmedChannels.includes(c));

  // ── 출시월 기준 동적 8개월 윈도우 ──────────────────────────────────────────
  const skuMonths = getSkuMonths(sku.releaseDate);
  const isNextYr = (m: Month): boolean => isNextYearMonth(m, sku.releaseDate);
  const year1Months = skuMonths.filter((m) => !isNextYr(m));
  const year2Months = skuMonths.filter((m) => isNextYr(m));
  const hasYear2 = year2Months.length > 0;
  const year1Label = `${releaseYear % 100}년`;
  const year2Label = `${(releaseYear + 1) % 100}년`;
  // 연도 경계 왼쪽 보더: 익년으로 넘어가는 첫 번째 열
  const yearBorderStep1 = (m: Month): string => {
    if (!isNextYr(m)) return '';
    const idx = skuMonths.indexOf(m);
    return idx > 0 && !isNextYr(skuMonths[idx - 1]) ? 'border-l-2 border-blue-300' : '';
  };

  const totalQty = sku.monthlySplit.reduce((sum, ms) => sum + ms.quantity, 0);
  const year1Split = sku.monthlySplit.filter((ms) => year1Months.includes(ms.month));
  const year2Split = sku.monthlySplit.filter((ms) => year2Months.includes(ms.month));
  const fy1Qty = year1Split.reduce((sum, ms) => sum + ms.quantity, 0);
  const fy2Qty = year2Split.reduce((sum, ms) => sum + ms.quantity, 0);
  const fy1RatioSum = year1Split.reduce((sum, ms) => sum + ms.ratio, 0);
  const fy2RatioSum = year2Split.reduce((sum, ms) => sum + ms.ratio, 0);
  const totalRatioSum = sku.monthlySplit
    .filter((ms) => skuMonths.includes(ms.month))
    .reduce((sum, ms) => sum + ms.ratio, 0);

  return (
    <div className={channelOnly ? '' : 'mt-4 pt-4 border-t border-gray-100'}>
      {/* 탭 버튼 */}
      <div className={channelOnly ? 'hidden' : 'flex gap-2 mb-3 items-end'}>
        {([
          { key: 'pricing', step: 'STEP 1', label: '월 계획 · 채널별 목표량', sub: 'PM 월 비중 · MD 채널별 수량 · 프라이싱' },
          { key: 'channel', step: 'STEP 2', label: '채널별 수량 확인', sub: 'MD  월별/옵션별 최종 수량' },
        ] as { key: 'channel' | 'pricing'; step: string; label: string; sub: string }[]).map(({ key, step, label, sub }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex flex-col items-start px-3 py-2 rounded-lg border transition-all text-left ${
                isActive
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              <span className={`text-[10px] font-bold tracking-wide ${isActive ? 'text-indigo-200' : 'text-gray-400'}`}>{step}</span>
              <span className="text-xs font-semibold leading-tight">{label}</span>
              <span className={`text-[10px] leading-tight mt-0.5 ${isActive ? 'text-indigo-200' : 'text-gray-400'}`}>{sub}</span>
            </button>
          );
        })}
      </div>

      {/* 탭별 안내 문구 */}
      {activeTab === 'pricing' && (
        <div className="flex items-start justify-between mb-2">
          {channelOnly && <button type="button" onClick={() => setNotesOpen((v) => !v)} className="text-[11px] underline text-indigo-700 flex-shrink-0">계산 안내 {notesOpen ? '▴' : '▾'}</button>}
          <div className={`flex-col gap-0.5 text-[11px] text-gray-400 ${channelOnly && !notesOpen ? 'hidden' : 'flex'}`}>
            <p>초기값: 월 계획 × 대응SKU 채널 비중 · 칸 직접 수정 시 월 비중·채널 비중 자동 재계산</p>
            <p>채널 비중: [채널 비중 수정] → 여러 채널 입력 → 저장 · 월 합계 유지 · 미수정 채널이 나머지 비중 배분 · 확정 채널 제외</p>
            <p className="text-amber-600">대응SKU 변경 시 표 자동 변경 없음 · [대응SKU 비중으로 다시 나누기] 시 수기 수정값 재계산</p>
            <p>
              {sku.coupangEnabled
                ? '쿠팡: 관리자 설정으로 활성화 · 대응SKU 실적·비중 포함'
                : '쿠팡: 신상 미등록으로 대응SKU 실적·비중 제외 · 관리 탭에서 SKU별 활성화'}
            </p>
            {(sku.disabledChannels ?? []).length > 0 && (
              <p>
                {(sku.disabledChannels ?? []).join('·')}: 관리자 설정으로 비운영 · 목표량 0 고정 · 비중은 나머지 채널로 배분 (관리 탭 › 채널 관리)
              </p>
            )}
            <p>
              {(() => {
                const off = sku.disabledChannels ?? [];
                if (off.length === 1) return `태블로 해외 출고량 전부 ${off[0] === '글로벌' ? '일본' : '글로벌'}로 반영 (${off[0]} 비운영)`;
                if (off.length >= 2) return '태블로 해외 출고량 제외 (글로벌·일본 비운영)';
                return '태블로 해외 출고량: 글로벌 40% · 인케어 60% 임의 분배';
              })()}
            </p>
            {(() => {
              // 발주 확정 후 총 발주량이 바뀌었을 때만 경고 (판매 목표·STEP2 수량 변경은 대상 아님)
              const confirmedQty = sku.finalOrderConfirmedOrderQty;
              if (!sku.finalOrderConfirmedAt || confirmedQty === undefined || confirmedQty === sku.totalOrderQty) return null;
              return (
                <p className="font-medium text-amber-600 mt-0.5">
                  ⚠ 발주량 변경됨 · 확정 {confirmedQty.toLocaleString()}개 → 현재 {sku.totalOrderQty.toLocaleString()}개
                </p>
              );
            })()}
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-3">
            {!channelOnly && <CoverageChip sku={sku} skuMonths={skuMonths} />}
            {shareEdit !== null && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-indigo-50 text-[11px]">
                <span className="text-indigo-800">
                  <b>채널 비중 수정 중</b>
                  {' · '}
                  {(() => {
                    const r = shareResolution;
                    const pct = (v: number) => `${Math.round(v * 10) / 10}%`;
                    if (!r || r.reason === 'noChange') return '여러 채널 입력 후 한 번에 저장';
                    if (r.reason === 'over100') return <span className="text-red-600 font-semibold">수정·확정 채널 합계 {pct(r.fixedSum)} · 100% 초과</span>;
                    if (r.reason === 'notHundred') return <span className="text-red-600 font-semibold">합계 {pct(r.fixedSum)} · 100%로 조정 필요</span>;
                    return r.absorbing.length > 0
                      ? `${r.edited.length}개 채널 수정 · 나머지 ${pct(r.rest)}는 미수정 ${r.absorbing.length}개 채널에 현재 비율대로 배분 · 월 합계 유지`
                      : `${r.edited.length}개 채널 수정 · 합계 100% · 월 합계 유지`;
                  })()}
                </span>
                <button onClick={() => setShareEdit(null)} className="px-2 py-0.5 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">취소</button>
                <button
                  onClick={saveChannelShares}
                  disabled={!shareResolution?.ok}
                  className="px-2 py-0.5 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  저장
                </button>
              </div>
            )}
            {/* 버튼 행 */}
            <div className={`flex items-center gap-1.5 ${shareEdit !== null ? 'hidden' : ''}`}>
              {step2UndoStack.length > 0 && (
                <>
                  <span className="text-[11px] text-red-500 font-medium">* 카드 닫으면 되돌리기 불가!</span>
                  <button
                    onClick={() => {
                      const target = step2UndoStack[step2UndoStack.length - 1];
                      batchInitChannelMonthQty(sku.id, target.channelMonthQty);
                      setPricingOpts(target.pricingOpts);
                      setStep2UndoStack((prev) => prev.slice(0, -1));
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors"
                  >
                    ↩ 되돌리기 ({step2UndoStack.length})
                  </button>
                </>
              )}
              {!channelOnly && isSeasonOnly(sku) && !step2ReadOnly && allChannelRole && (() => {
                const planTotal = skuMonths.reduce((a, m) => a + (sku.monthlySplit.find((x) => x.month === m)?.quantity ?? 0), 0);
                if (planTotal === 0 || sku.totalOrderQty === 0 || planTotal === sku.totalOrderQty) return null;
                return (
                  <button
                    onClick={fitPlanToOrderQty}
                    className="text-[11px] px-2.5 py-1 rounded-lg border border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors whitespace-nowrap"
                  >
                    판매 목표를 발주량에 맞추기 ({planTotal.toLocaleString()} → {sku.totalOrderQty.toLocaleString()})
                  </button>
                );
              })()}
              {!step2ReadOnly && allChannelRole && !gridEmpty && !allChannelsConfirmed && (
                <button
                  onClick={() => setShareEdit({})}
                  className="text-[11px] px-2.5 py-1 rounded-lg border border-indigo-300 bg-white hover:bg-indigo-50 text-indigo-700 font-semibold transition-colors whitespace-nowrap"
                >
                  채널 비중 수정
                </button>
              )}
              {compareChanged && (
                <span className="text-[10px] font-semibold text-amber-600 whitespace-nowrap">대응SKU 변경됨 ·</span>
              )}
              <button
                onClick={handleRedistribute}
                disabled={step2ReadOnly || !allChannelRole || allChannelsConfirmed}
                title={!allChannelRole ? '여러 채널을 함께 바꾸는 조정이라 PM · MASTER만 가능' : undefined}
                className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                  compareChanged ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100' : 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-500'
                }`}
              >
                {gridEmpty ? '대응SKU 기준 채우기' : '대응SKU 비중으로 다시 나누기'}
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                disabled={!teamCateMap}
                title={teamCateMap ? undefined : '변동비 데이터를 불러온 뒤 내보낼 수 있어요'}
                onClick={() => exportSimulationXlsx({
                  sku,
                  pricingOpts,
                  compMonthlyData,
                  compMonthlyActiveOnly: !!compMonthlyActiveOnly,
                  compChannelDist,
                  varCostByChannel,
                  usdKrw: mtUsdKrw,
                  jpyKrw: mtJpyKrw,
                })}
                className="text-[11px] px-2.5 py-1 rounded-lg border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-700 transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ↓ 시뮬레이션 엑셀
              </button>
              {(
                [
                  { field: 'step2PlatformConfirmed', label: '플랫폼 확정', on: 'bg-emerald-600 text-white hover:bg-emerald-700', off: 'border border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
                  { field: 'step2BrandConfirmed',    label: '브랜드 확정', on: 'bg-amber-500 text-white hover:bg-amber-600',     off: 'border border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100'   },
                  { field: 'step2GlobalConfirmed',   label: '글로벌 확정', on: 'bg-sky-600 text-white hover:bg-sky-700',         off: 'border border-sky-400 bg-sky-50 text-sky-700 hover:bg-sky-100'           },
                ] as { field: 'step2PlatformConfirmed' | 'step2BrandConfirmed' | 'step2GlobalConfirmed'; label: string; on: string; off: string }[]
              ).filter(({ field }) =>
                // 글로벌·일본 둘 다 비운영이면 확정할 채널이 없으므로 글로벌 확정 버튼 숨김
                field !== 'step2GlobalConfirmed' || !(['글로벌', '일본'] as const).every((ch) => (sku.disabledChannels ?? []).includes(ch)),
              ).map(({ field, label, on, off }) => {
                const isOn = !!sku[field];
                const canConfirm = !step2ReadOnly && canConfirmGroup(role, field);
                return (
                  <button
                    key={field}
                    onClick={() => setChannelConfirmed(sku.id, field, !isOn)}
                    disabled={!canConfirm}
                    title={canConfirm ? undefined : '담당 그룹만 확정 · 해제 가능'}
                    className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${isOn ? on : off}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'pricing' ? (
        <>
          {!channelOnly && <>
          {/* 월 계획 (PM) */}
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-[11px] font-bold text-gray-600">월 계획</span>
            <span className="text-[11px] text-gray-400">
              월 비중(%) = 총 발주량 대비 월 판매 목표 · 리오더 계획 시 합계 100% 초과 가능 · 입력 시 채널 구성비 유지 · 확정 채널 제외
            </span>
            {sku.totalOrderQty === 0 && <span className="text-[11px] text-amber-600">총 발주량 미입력 · 발주량&amp;사이즈분배에서 먼저 입력</span>}
          </div>
      <div className="rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-xs min-w-[640px]" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '80px' }} />
            {skuMonths.map((m) => <col key={m} style={{ width: '60px' }} />)}
            <col style={{ width: '72px' }} />
            {hasYear2 && <col style={{ width: '72px' }} />}
            <col style={{ width: '72px' }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2 text-left text-gray-500 font-semibold">구분</th>
              {skuMonths.map((m) => (
                <th
                  key={m}
                  className={`px-2 py-2 text-center font-semibold ${yearBorderStep1(m)} ${
                    isNextYr(m) ? 'text-blue-600 bg-blue-50/60' : 'text-gray-600'
                  }`}
                >
                  {MONTH_LABELS[m]}
                  {isNextYr(m) && (
                    <div className="text-[10px] text-blue-400 font-normal leading-tight">{year2Label}</div>
                  )}
                </th>
              ))}
              <th className="px-2 py-2 text-center text-indigo-700 font-semibold bg-indigo-100/70 whitespace-nowrap">{year1Label} 소계</th>
              {hasYear2 && <th className="px-2 py-2 text-center text-blue-700 font-semibold bg-blue-50/80 whitespace-nowrap">{year2Label} 소계</th>}
              <th className="px-2 py-2 text-center text-gray-600 font-semibold bg-gray-100 whitespace-nowrap">합계</th>
            </tr>
          </thead>
          <tbody>
            {/* 대응SKU 실적 행 */}
            {(() => {
              const hasData = Object.keys(compMonthlyData).length > 0;
              const fy1Sum = year1Months.reduce((s, m) => s + (compMonthlyData[m] ?? 0), 0);
              const fy2Sum = year2Months.reduce((s, m) => s + (compMonthlyData[m] ?? 0), 0);
              const totalSum = skuMonths.reduce((s, m) => s + (compMonthlyData[m] ?? 0), 0);
              return (
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="text-gray-500 font-medium text-[11px]">대응SKU 실적{hasData && <span className="font-normal text-gray-400"> ({compMonthlyActiveOnly ? '비운영 채널 제외' : '비운영 채널 포함'})</span>}</div>
                    <div className="text-[10px] leading-tight mt-0.5">
                      {hasData ? (
                        <span className="text-indigo-400">{compModeLabel}</span>
                      ) : (
                        <span className="text-gray-300">SKU 미설정</span>
                      )}
                    </div>
                  </td>
                  {skuMonths.map((m) => {
                    const qty = compMonthlyData[m];
                    return (
                      <td
                        key={m}
                        className={`px-2 py-2 text-center tabular-nums ${yearBorderStep1(m)} ${isNextYr(m) ? 'bg-blue-50/20' : ''}`}
                      >
                        {qty !== undefined ? (
                          <span className="text-gray-600">{qty.toLocaleString()}</span>
                        ) : (
                          <span className="text-gray-300">–</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center bg-indigo-50/50 tabular-nums">
                    {fy1Sum > 0
                      ? <span className="font-semibold text-indigo-600">{fy1Sum.toLocaleString()}</span>
                      : <span className="text-gray-300">–</span>}
                  </td>
                  {hasYear2 && (
                    <td className="px-2 py-2 text-center bg-blue-50/40 tabular-nums">
                      {fy2Sum > 0
                        ? <span className="font-semibold text-blue-600">{fy2Sum.toLocaleString()}</span>
                        : <span className="text-gray-300">–</span>}
                    </td>
                  )}
                  <td className="px-2 py-2 text-center bg-gray-100/60 tabular-nums">
                    {totalSum > 0
                      ? <span className="font-semibold text-gray-600">{totalSum.toLocaleString()}</span>
                      : <span className="text-gray-300">–</span>}
                  </td>
                </tr>
              );
            })()}

            {/* 수량 행 — 읽기 전용 표시 */}
            <tr className="border-b border-gray-100">
              <td className="px-3 py-2 text-gray-500 font-medium whitespace-nowrap">수량</td>
              {skuMonths.map((m) => {
                const ms = sku.monthlySplit.find((x) => x.month === m);
                return (
                  <td key={m} className={`px-2 py-2 text-center tabular-nums ${yearBorderStep1(m)} ${isNextYr(m) ? 'bg-blue-50/30' : ''}`}>
                    {!ms || ms.quantity === 0 ? (
                      <span className="text-gray-300">–</span>
                    ) : (
                      <span className="text-gray-700">{ms.quantity.toLocaleString()}</span>
                    )}
                  </td>
                );
              })}
              <td className="px-2 py-2 text-center font-semibold text-indigo-700 bg-indigo-50/50 tabular-nums whitespace-nowrap">
                {fy1Qty > 0 ? fy1Qty.toLocaleString() : <span className="text-gray-300">–</span>}
              </td>
              {hasYear2 && (
                <td className="px-2 py-2 text-center font-semibold text-blue-700 bg-blue-50/40 tabular-nums whitespace-nowrap">
                  {fy2Qty > 0 ? fy2Qty.toLocaleString() : <span className="text-gray-300">–</span>}
                </td>
              )}
              <td className="px-2 py-2 text-center font-semibold text-gray-700 bg-gray-50 tabular-nums whitespace-nowrap">
                {totalQty > 0 ? totalQty.toLocaleString() : <span className="text-gray-300">–</span>}
              </td>
            </tr>

            {/* 비중 행 — 퍼센티지 입력, 수량은 위 행에 표시 */}
            <tr className="border-b border-gray-100">
              <td className="px-3 py-2 text-gray-400 font-medium whitespace-nowrap text-[11px]">비중</td>
              {skuMonths.map((m) => {
                const ms = sku.monthlySplit.find((x) => x.month === m);
                return (
                  <td key={m} className={`px-1 py-1 ${yearBorderStep1(m)} ${isNextYr(m) ? 'bg-blue-50/20' : ''}`}>
                    <div className="relative flex items-center">
                      <CommitNumericInput
                        value={ms?.ratio ?? 0}
                        onCommit={(val) => handleMonthShareCommit(m, val)}
                        allowDecimal
                        disabled={step1ReadOnly || allChannelsConfirmed || sku.totalOrderQty === 0}
                        placeholder="0"
                        className={`w-full text-center rounded px-1 py-1 border border-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-[11px] ${
                          step1ReadOnly || allChannelsConfirmed || sku.totalOrderQty === 0 ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'bg-white'
                        }`}
                      />
                      <span className="absolute right-1.5 text-[10px] text-gray-400 pointer-events-none">%</span>
                    </div>
                  </td>
                );
              })}
              <td className="px-2 py-2 text-center bg-indigo-50/50 tabular-nums whitespace-nowrap">
                {fy1RatioSum > 0
                  ? <span className="text-indigo-600 text-[11px] font-semibold">{Math.round(fy1RatioSum)}%</span>
                  : <span className="text-gray-300">–</span>}
              </td>
              {hasYear2 && (
                <td className="px-2 py-2 text-center bg-blue-50/40 tabular-nums whitespace-nowrap">
                  {fy2RatioSum > 0
                    ? <span className="text-blue-600 text-[11px] font-semibold">{Math.round(fy2RatioSum)}%</span>
                    : <span className="text-gray-300">–</span>}
                </td>
              )}
              <td className="px-2 py-2 text-center bg-gray-50 tabular-nums">
                {totalRatioSum > 0
                  ? <span className="text-[11px] font-semibold text-gray-500">
                      {Math.round(totalRatioSum)}%
                    </span>
                  : <span className="text-gray-300">–</span>}
              </td>
            </tr>

            {/* 누적 판매 목표 vs 총 발주량 — 발주량을 넘는 달부터 리오더(시즌 한정은 품절) 구간 */}
            {(() => {
              const seasonOnly = isSeasonOnly(sku);
              const cov = coverage(skuMonths.map((m) => sku.monthlySplit.find((x) => x.month === m)?.quantity ?? 0), sku.totalOrderQty, seasonOnly);
              if (cov.status === 'empty') return null;
              return (
                <tr className="border-b border-gray-100">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="text-gray-500 font-medium text-[11px]">누적</div>
                    <div className="text-[10px] text-gray-300 leading-tight mt-0.5">발주 {sku.totalOrderQty.toLocaleString()} 기준</div>
                  </td>
                  {skuMonths.map((m, i) => {
                    const over = cov.firstOverIdx >= 0 && i >= cov.firstOverIdx;
                    return (
                      <td key={m} className={`px-2 py-2 text-center tabular-nums text-[11px] ${yearBorderStep1(m)} ${over ? 'bg-amber-50 text-amber-700 font-semibold' : 'text-gray-500'}`}>
                        {cov.cumulative[i].toLocaleString()}
                        {i === cov.firstOverIdx && <div className="text-[9px] font-bold">{seasonOnly ? '품절 예상' : '리오더 시작'}</div>}
                      </td>
                    );
                  })}
                  <td colSpan={hasYear2 ? 3 : 2} className="px-2 py-2 text-center text-[11px] text-gray-500 bg-gray-50 tabular-nums">
                    {cov.diff > 0 ? `발주량 +${cov.diff.toLocaleString()}` : cov.diff < 0 ? `발주량 −${Math.abs(cov.diff).toLocaleString()}` : '발주량과 같음'}
                  </td>
                </tr>
              );
            })()}

            {/* 증감율 vs 대응SKU 행 */}
            {(() => {
              const hasComp = Object.keys(compMonthlyData).length > 0;
              const calcRate = (planned: number, ref: number | undefined) =>
                ref !== undefined && ref > 0
                  ? Math.round(((planned - ref) / ref) * 100)
                  : null;

              const fy1Comp = year1Months.reduce((s, m) => s + (compMonthlyData[m] ?? 0), 0);
              const fy2Comp = year2Months.reduce((s, m) => s + (compMonthlyData[m] ?? 0), 0);
              const totalComp = skuMonths.reduce((s, m) => s + (compMonthlyData[m] ?? 0), 0);
              const fy1Rate = calcRate(fy1Qty, fy1Comp > 0 ? fy1Comp : undefined);
              const fy2Rate = calcRate(fy2Qty, fy2Comp > 0 ? fy2Comp : undefined);
              const totalRate = calcRate(totalQty, totalComp > 0 ? totalComp : undefined);

              const RateBadge = ({ rate }: { rate: number | null }) => {
                if (rate === null) return <span className="text-gray-300">–</span>;
                const pos = rate > 0;
                const neg = rate < 0;
                return (
                  <span className={`inline-flex items-center gap-0.5 font-semibold text-[11px] ${
                    pos ? 'text-blue-500' : neg ? 'text-red-500' : 'text-gray-400'
                  }`}>
                    {pos ? '▲' : neg ? '▼' : '–'}
                    {pos ? '+' : ''}{rate}%
                  </span>
                );
              };

              return (
                <tr className="border-b border-gray-100 bg-white">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="text-gray-500 font-medium text-[11px]">증감율</div>
                    <div className="text-[10px] text-gray-300 leading-tight mt-0.5">vs 대응SKU</div>
                  </td>
                  {skuMonths.map((m) => {
                    const ms = sku.monthlySplit.find((x) => x.month === m);
                    const rate = hasComp ? calcRate(ms?.quantity ?? 0, compMonthlyData[m]) : null;
                    return (
                      <td
                        key={m}
                        className={`px-2 py-2 text-center ${yearBorderStep1(m)} ${isNextYr(m) ? 'bg-blue-50/20' : ''}`}
                      >
                        <RateBadge rate={rate} />
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center bg-indigo-50/50">
                    <RateBadge rate={fy1Rate} />
                  </td>
                  {hasYear2 && (
                    <td className="px-2 py-2 text-center bg-blue-50/40">
                      <RateBadge rate={fy2Rate} />
                    </td>
                  )}
                  <td className="px-2 py-2 text-center bg-gray-50">
                    <RateBadge rate={totalRate} />
                  </td>
                </tr>
              );
            })()}

          </tbody>
        </table>
      </div>
          </>}
          {/* 채널별 목표량 (MD) */}
          <div className="flex items-baseline gap-2 mt-4 mb-1">
            <span className="text-[11px] font-bold text-gray-600">채널별 목표량</span>
            <span className="text-[11px] text-gray-400">채널을 펼치면 월별 수량 · 판매가 시나리오 입력</span>
          </div>
        <PricingChannelTable
          sku={sku}
          readOnly={step2ReadOnly}
          pricingOpts={pricingOpts}
          setPricingOpts={setPricingOpts}
          onTotalsChange={onStep3TotalsChange}
          onBeforeEdit={captureStep2Backup}
          varCostReady={teamCateMap !== null}
          varCostResults={varCostResults}
          teamCateError={teamCateError}
          compChannelYM={compChannelYM}
          compMode={compMode}
          compModeLabel={compModeLabel}
          step2Baseline={sku.step2InitBaselineQty ?? null}
          skuMonths={skuMonths}
          releaseYear={releaseYear}
          shareEdit={shareEdit}
          sharePreview={shareResolution?.ok ? shareResolution.shares : null}
          onShareEdit={(ch, v) => setShareEdit((prev) => ({ ...(prev ?? {}), [ch]: v }))}
          canEditChannel={canEditChannel}
        />
        </>
      ) : activeTab === 'channel' ? (
        <>
          <ChannelMonthTable sku={sku} readOnly={readOnly} monthlySplit={sku.monthlySplit} compChannelDist={compChannelDist} skuMonths={skuMonths} releaseYear={releaseYear} />
          <p className="text-[11px] text-gray-400 mt-2">채널별 토글을 열어 옵션별 수량을 확인하세요. (옵션별 수량 및 비중 임의 수정 불가)</p>
        </>
      ) : null}
    </div>
  );
}

// ── 채널×월 상세수량 테이블 (STEP2 값 읽기 전용 표시) ──────────────────────
function ChannelMonthTable({ sku, monthlySplit: _monthlySplit, skuMonths, releaseYear }: {
  sku: SkuData;
  readOnly: boolean;
  monthlySplit: SkuData['monthlySplit'];
  compChannelDist?: Record<string, number> | null;
  skuMonths: Month[];
  releaseYear: number;
}) {
  const releaseMonth = skuMonths[0];
  const isNextYr = (m: Month): boolean => m < releaseMonth;
  const year1Months = skuMonths.filter((m) => !isNextYr(m));
  const year2Months = skuMonths.filter((m) => isNextYr(m));
  const hasYear2 = year2Months.length > 0;
  const year1Label = `${releaseYear % 100}년`;
  const year2Label = `${(releaseYear + 1) % 100}년`;
  const yearBorder = (m: Month): string => {
    if (!isNextYr(m)) return '';
    const idx = skuMonths.indexOf(m);
    return idx > 0 && !isNextYr(skuMonths[idx - 1]) ? 'border-l-2 border-blue-300' : '';
  };
  const [expandedChannels, setExpandedChannels] = useState<Set<Channel>>(new Set());

  const toggleChannel = (ch: Channel) =>
    setExpandedChannels((prev) => {
      const next = new Set(prev);
      next.has(ch) ? next.delete(ch) : next.add(ch);
      return next;
    });

  const getQty = (channel: Channel, month: Month) =>
    sku.channelMonthQty.find((e) => e.channel === channel && e.month === month)?.qty ?? 0;

  const getMktQty = (month: Month) =>
    (sku.marketingMonthQty ?? {})[month] ?? 0;

  const channelTotal = (channel: Channel) =>
    skuMonths.reduce((sum, m) => sum + getQty(channel, m), 0);

  const monthTotal = (month: Month) =>
    CHANNELS.reduce((sum, ch) => sum + getQty(ch, month), 0) + getMktQty(month);

  const channelYear1Total = (channel: Channel) =>
    year1Months.reduce((sum, m) => sum + getQty(channel, m), 0);
  const channelYear2Total = (channel: Channel) =>
    year2Months.reduce((sum, m) => sum + getQty(channel, m), 0);

  const grandTotal = skuMonths.reduce((sum, m) => sum + monthTotal(m), 0);
  const grandYear1Total = year1Months.reduce((sum, m) => sum + monthTotal(m), 0);
  const grandYear2Total = year2Months.reduce((sum, m) => sum + monthTotal(m), 0);

  // 옵션 목록 계산
  // 컬러+사이즈 모두 있으면 "컬러 사이즈" 조합, 컬러만 있으면 컬러별, 없으면 사이즈별
  const activeSizes = sku.sizes.filter((s) => s.isActive && s.ratio > 0);
  const activeColors = sku.hasColors ? sku.colors.filter((c) => !c.archived && c.quantity > 0) : [];
  const colorTotal = activeColors.reduce((s, c) => s + c.quantity, 0);
  const multiSize = activeSizes.length > 1;
  const multiColor = activeColors.length > 1 && colorTotal > 0;

  const optionRows: { label: string; ratio: number; displayRatio: number }[] = (() => {
    if (multiColor && multiSize) {
      // 컬러 × 사이즈 조합: ratio는 전체 대비(수량 계산용), displayRatio는 컬러 내 사이즈 비중
      return activeColors.flatMap((c) =>
        activeSizes.map((s) => ({
          label: `${c.name} ${s.label}`,
          ratio: (c.quantity / colorTotal) * (s.ratio / 100),
          displayRatio: s.ratio / 100,
        })),
      );
    }
    if (multiColor) {
      return activeColors.map((c) => ({ label: c.name, ratio: c.quantity / colorTotal, displayRatio: c.quantity / colorTotal }));
    }
    if (multiSize) {
      return activeSizes.map((s) => ({ label: s.label, ratio: s.ratio / 100, displayRatio: s.ratio / 100 }));
    }
    return [];
  })();

  const renderChannelRow = (channel: Channel, groupBg: string) => {
    const isExpanded = expandedChannels.has(channel);
    const total = channelTotal(channel);
    const total1 = channelYear1Total(channel);
    const total2 = channelYear2Total(channel);
    const ratio = grandTotal > 0 ? Math.round((total / grandTotal) * 100) : null;
    const canExpand = optionRows.length > 1 && total > 0;

    return (
      <>
        <tr key={channel} className={`border-b border-gray-100 ${groupBg}`}>
          {/* 토글 + 채널명 */}
          <td className="px-2 py-1.5 font-medium text-gray-700 whitespace-nowrap text-[11px]">
            <div className="flex items-center gap-1.5">
              {canExpand ? (
                <button
                  onClick={() => toggleChannel(channel)}
                  className={`text-[10px] text-gray-400 transition-transform duration-150 flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                >▶</button>
              ) : (
                <span className="w-2.5 flex-shrink-0" />
              )}
              <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: CHANNEL_COLORS[channel] }} />
              <span>{channel}</span>
              {(sku.disabledChannels ?? []).includes(channel as OptOutChannel) && (
                <span className="text-[9px] px-1 rounded bg-gray-100 text-gray-400 font-normal">비운영</span>
              )}
            </div>
          </td>
          <td className="px-2 py-1.5 text-center tabular-nums text-[11px]">
            {ratio !== null && ratio > 0
              ? <span className="text-gray-500 font-medium">{ratio}%</span>
              : <span className="text-gray-300">–</span>}
          </td>
          {skuMonths.map((m) => {
            const qty = getQty(channel, m);
            return (
              <td key={m} className={`px-2 py-1.5 text-center tabular-nums text-[11px] ${yearBorder(m)} ${isNextYr(m) ? 'bg-blue-50/40' : ''}`}>
                {qty > 0
                  ? <span className="text-gray-700 font-medium">{qty.toLocaleString()}</span>
                  : <span className="text-gray-300">–</span>}
              </td>
            );
          })}
          <td className="px-2 py-1.5 text-center font-semibold tabular-nums text-indigo-700 bg-indigo-50/50 whitespace-nowrap text-[11px]">
            {total1 > 0 ? total1.toLocaleString() : <span className="text-gray-300">–</span>}
          </td>
          {hasYear2 && (
            <td className="px-2 py-1.5 text-center font-semibold tabular-nums text-blue-700 bg-blue-50/40 whitespace-nowrap text-[11px]">
              {total2 > 0 ? total2.toLocaleString() : <span className="text-gray-300">–</span>}
            </td>
          )}
          <td className="px-2 py-1.5 text-center font-semibold tabular-nums text-gray-700 bg-gray-50 whitespace-nowrap text-[11px]">
            {total > 0 ? total.toLocaleString() : <span className="text-gray-300">–</span>}
          </td>
        </tr>

        {/* 옵션 상세 (펼침) */}
        {isExpanded && canExpand && (
          <>
            <tr key={`${channel}-opt-header`} className="border-t border-gray-300 bg-gray-100">
              <td colSpan={2} className="pl-6 pr-2 py-1 text-[10px] font-semibold text-gray-500 tracking-wide">
                {multiColor && multiSize ? '컬러·사이즈별' : multiColor ? '컬러별' : '사이즈별'}
              </td>
              {skuMonths.map((m) => (
                <td key={m} className={`px-2 py-1 text-center text-[10px] font-medium text-gray-400 ${yearBorder(m)} ${isNextYr(m) ? 'bg-blue-50/30' : ''}`}>
                  {MONTH_LABELS[m]}
                </td>
              ))}
              <td className="px-2 py-1 text-center text-[10px] font-medium text-gray-400 bg-indigo-50/40">{year1Label} 소계</td>
              {hasYear2 && <td className="px-2 py-1 text-center text-[10px] font-medium text-gray-400 bg-blue-50/30">{year2Label} 소계</td>}
              <td className="px-2 py-1 text-center text-[10px] font-medium text-gray-400 bg-gray-200/50">합계</td>
            </tr>
            {optionRows.map((opt, i) => {
              const isLast = i === optionRows.length - 1;
              const opt1 = year1Months.reduce((s, m) => s + Math.round(getQty(channel, m) * opt.ratio), 0);
              const opt2 = year2Months.reduce((s, m) => s + Math.round(getQty(channel, m) * opt.ratio), 0);
              const optTotal = skuMonths.reduce((s, m) => s + Math.round(getQty(channel, m) * opt.ratio), 0);
              return (
                <tr
                  key={`${channel}-${opt.label}`}
                  className={`bg-gray-50 ${isLast ? 'border-b border-gray-300' : 'border-b border-gray-100'}`}
                >
                  <td className="pl-6 pr-2 py-1 text-[10px] text-gray-600 whitespace-nowrap">
                    <span className="font-medium">{opt.label}</span>
                    <span className="ml-1.5 text-gray-400">{Math.round(opt.displayRatio * 100)}%</span>
                  </td>
                  <td className="px-2 py-1" />
                  {skuMonths.map((m) => {
                    const qty = Math.round(getQty(channel, m) * opt.ratio);
                    return (
                      <td key={m} className={`px-2 py-1 text-center tabular-nums text-[10px] ${yearBorder(m)} ${isNextYr(m) ? 'bg-blue-50/20' : ''}`}>
                        {qty > 0
                          ? <span className="text-gray-600">{qty.toLocaleString()}</span>
                          : <span className="text-gray-300">–</span>}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-center tabular-nums text-[10px] text-gray-600 bg-indigo-50/30">
                    {opt1 > 0 ? opt1.toLocaleString() : <span className="text-gray-300">–</span>}
                  </td>
                  {hasYear2 && (
                    <td className="px-2 py-1 text-center tabular-nums text-[10px] text-gray-600 bg-blue-50/20">
                      {opt2 > 0 ? opt2.toLocaleString() : <span className="text-gray-300">–</span>}
                    </td>
                  )}
                  <td className="px-2 py-1 text-center tabular-nums text-[10px] text-gray-600 bg-gray-100/80">
                    {optTotal > 0 ? optTotal.toLocaleString() : <span className="text-gray-300">–</span>}
                  </td>
                </tr>
              );
            })}
          </>
        )}
      </>
    );
  };

  return (
    <div className="space-y-1.5">
    <div className="rounded-lg border border-gray-200 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-2 py-2 text-left text-gray-500 font-semibold whitespace-nowrap">채널</th>
            <th className="px-2 py-2 text-center text-gray-500 font-semibold whitespace-nowrap w-10">비중</th>
            {skuMonths.map((m) => (
              <th
                key={m}
                className={`px-1 py-2 text-center font-semibold whitespace-nowrap text-[11px] ${yearBorder(m)} ${isNextYr(m) ? 'text-blue-600 bg-blue-50/60' : 'text-gray-600'}`}
              >
                {MONTH_LABELS[m]}
                {isNextYr(m) && (
                  <div className="text-[10px] text-blue-400 font-normal leading-tight">{year2Label}</div>
                )}
              </th>
            ))}
            <th className="px-2 py-2 text-center text-indigo-700 font-semibold bg-indigo-100/70 whitespace-nowrap text-[11px]">{year1Label} 소계</th>
            {hasYear2 && <th className="px-2 py-2 text-center text-blue-700 font-semibold bg-blue-50/80 whitespace-nowrap text-[11px]">{year2Label} 소계</th>}
            <th className="px-2 py-2 text-center text-gray-600 font-semibold bg-gray-100 whitespace-nowrap text-[11px]">합계</th>
          </tr>
        </thead>
        <tbody>
          {/* B2C 그룹 */}
          <tr className="bg-sky-50/60 border-b border-sky-200">
            <td colSpan={2 + skuMonths.length + (hasYear2 ? 3 : 2)} className="px-3 py-0.5">
              <span className="text-[10px] font-bold text-sky-600 tracking-wide uppercase">B2C</span>
            </td>
          </tr>
          {B2C_CHANNELS.map((ch) => renderChannelRow(ch, 'hover:bg-sky-50/30'))}
          {/* 마케팅 그룹 */}
          <tr className="bg-pink-50/60 border-b border-pink-200">
            <td colSpan={2 + skuMonths.length + (hasYear2 ? 3 : 2)} className="px-3 py-0.5">
              <span className="text-[10px] font-bold text-pink-600 tracking-wide">마케팅</span>
            </td>
          </tr>
          <tr className="border-b border-gray-100 hover:bg-pink-50/30">
            <td className="px-2 py-1.5 font-medium text-gray-700 whitespace-nowrap text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 flex-shrink-0" />
                <span className="inline-block w-2 h-2 rounded-full flex-shrink-0 bg-pink-400" />
                <span>마케팅</span>
              </div>
            </td>
            <td className="px-2 py-1.5 text-center text-gray-300 text-[11px]">–</td>
            {skuMonths.map((m) => {
              const qty = getMktQty(m);
              return (
                <td key={m} className={`px-2 py-1.5 text-center tabular-nums text-[11px] ${yearBorder(m)} ${isNextYr(m) ? 'bg-blue-50/40' : ''}`}>
                  {qty > 0
                    ? <span className="text-pink-600 font-medium">{qty.toLocaleString()}</span>
                    : <span className="text-gray-300">–</span>}
                </td>
              );
            })}
            {(() => {
              const t1 = year1Months.reduce((s, m) => s + getMktQty(m), 0);
              const t2 = year2Months.reduce((s, m) => s + getMktQty(m), 0);
              const tAll = skuMonths.reduce((s, m) => s + getMktQty(m), 0);
              return (
                <>
                  <td className="px-2 py-1.5 text-center font-semibold tabular-nums text-pink-600 bg-indigo-50/50 whitespace-nowrap text-[11px]">
                    {t1 > 0 ? t1.toLocaleString() : <span className="text-gray-300">–</span>}
                  </td>
                  {hasYear2 && (
                    <td className="px-2 py-1.5 text-center font-semibold tabular-nums text-pink-500 bg-blue-50/30 whitespace-nowrap text-[11px]">
                      {t2 > 0 ? t2.toLocaleString() : <span className="text-gray-300">–</span>}
                    </td>
                  )}
                  <td className="px-2 py-1.5 text-center font-semibold tabular-nums text-pink-500 bg-gray-50 whitespace-nowrap text-[11px]">
                    {tAll > 0 ? tAll.toLocaleString() : <span className="text-gray-300">–</span>}
                  </td>
                </>
              );
            })()}
          </tr>
          {/* B2B 그룹 */}
          <tr className="bg-violet-50/60 border-b border-violet-200">
            <td colSpan={2 + skuMonths.length + (hasYear2 ? 3 : 2)} className="px-3 py-0.5">
              <span className="text-[10px] font-bold text-violet-600 tracking-wide uppercase">B2B</span>
            </td>
          </tr>
          {B2B_CHANNELS.map((ch) => renderChannelRow(ch, 'hover:bg-violet-50/30'))}
        </tbody>
        <tfoot>
          <tr className="bg-indigo-50 border-t-2 border-indigo-200">
            <td colSpan={2} className="px-3 py-2 font-semibold text-indigo-800 whitespace-nowrap text-[11px]">합계</td>
            {skuMonths.map((m) => {
              const total = monthTotal(m);
              return (
                <td
                  key={m}
                  className={`px-1 py-2 text-center font-semibold tabular-nums text-indigo-700 whitespace-nowrap text-[11px] ${yearBorder(m)} ${isNextYr(m) ? 'bg-blue-100/40' : ''}`}
                >
                  {total > 0 ? total.toLocaleString() : <span className="text-indigo-300">–</span>}
                </td>
              );
            })}
            <td className="px-2 py-2 text-center font-semibold tabular-nums text-indigo-700 bg-indigo-100/70 whitespace-nowrap text-[11px]">
              {grandYear1Total > 0 ? grandYear1Total.toLocaleString() : <span className="text-indigo-300">–</span>}
            </td>
            {hasYear2 && (
              <td className="px-2 py-2 text-center font-semibold tabular-nums text-blue-700 bg-blue-100/50 whitespace-nowrap text-[11px]">
                {grandYear2Total > 0 ? grandYear2Total.toLocaleString() : <span className="text-indigo-300">–</span>}
              </td>
            )}
            <td className="px-2 py-2 text-center font-semibold tabular-nums text-indigo-800 bg-indigo-100 whitespace-nowrap text-[11px]">
              {grandTotal > 0 ? grandTotal.toLocaleString() : <span className="text-indigo-300">–</span>}
            </td>
          </tr>
          {grandTotal > 0 && (
            <tr className="bg-gray-50 border-t border-gray-200 text-gray-500">
              <td colSpan={2} className="px-3 py-1.5 font-medium whitespace-nowrap text-[11px]">월 출고 비중</td>
              {skuMonths.map((m) => {
                const total = monthTotal(m);
                return (
                  <td key={m} className={`px-1 py-1.5 text-center tabular-nums whitespace-nowrap text-[11px] ${yearBorder(m)}`}>
                    {total > 0 ? `${Math.round((total / grandTotal) * 100)}%` : <span className="text-gray-300">–</span>}
                  </td>
                );
              })}
              <td className="px-2 py-1.5 text-center tabular-nums whitespace-nowrap text-[11px]">{Math.round((grandYear1Total / grandTotal) * 100)}%</td>
              {hasYear2 && <td className="px-2 py-1.5 text-center tabular-nums whitespace-nowrap text-[11px]">{Math.round((grandYear2Total / grandTotal) * 100)}%</td>}
              <td className="px-2 py-1.5 text-center tabular-nums whitespace-nowrap text-[11px]">100%</td>
            </tr>
          )}
        </tfoot>
      </table>
    </div>
    </div>
  );
}

// ── STEP 2 판매가 시나리오 정의 (공유 상수는 utils/pricingScenarios.ts 참조) ──

// ── STEP 2 채널별 목표량 테이블 ──────────────────────────────────────────
function PricingChannelTable({
  sku, readOnly,
  pricingOpts, setPricingOpts,
  onTotalsChange,
  onBeforeEdit,
  varCostReady = false,
  varCostResults = {},
  teamCateError = null,
  compChannelYM,
  compMode,
  compModeLabel,
  step2Baseline,
  skuMonths,
  releaseYear,
  shareEdit = null,
  sharePreview = null,
  onShareEdit,
  canEditChannel = () => !readOnly,
}: {
  sku: SkuData;
  readOnly: boolean;
  pricingOpts: Record<string, string>;
  setPricingOpts: Dispatch<SetStateAction<Record<string, string>>>;
  onTotalsChange?: (totals: { revenue: number; profit: number | null }) => void;
  onBeforeEdit?: () => void;
  teamCateError?: TableauErrorReason | null;
  varCostReady?: boolean;
  varCostResults?: Record<string, { ratio: number; isFallback: boolean }>;
  compChannelYM?: ChannelByYearMonth | null;
  compMode?: 'rolling12' | 'samePeriod';
  compModeLabel?: string;
  step2Baseline?: SkuData['channelMonthQty'] | null;
  skuMonths: Month[];
  releaseYear: number;
  /** [채널 비중 수정] 편집안 — null이면 읽기 모드 */
  shareEdit?: Partial<Record<Channel, number>> | null;
  /** 저장 시 적용될 비중 미리보기 (미수정 채널 포함) */
  sharePreview?: Record<Channel, number> | null;
  onShareEdit?: (channel: Channel, value: number) => void;
  /** 담당 채널만 수정 — 목표 수량 · 판매가 시나리오 · 비중 입력 · 마케팅 */
  canEditChannel?: (channel: QtyChannel) => boolean;
}) {
  const releaseMonthStep2 = skuMonths[0];
  const isNextYrStep2 = (m: Month): boolean => m < releaseMonthStep2;
  const year1MonthsStep2 = skuMonths.filter((m) => !isNextYrStep2(m));
  const year2MonthsStep2 = skuMonths.filter((m) => isNextYrStep2(m));
  const hasYear2Step2 = year2MonthsStep2.length > 0;
  const year1LabelStep2 = `${releaseYear % 100}년`;
  const year2LabelStep2 = `${(releaseYear + 1) % 100}년`;
  const yearBorderStep2 = (m: Month): string => {
    if (!isNextYrStep2(m)) return '';
    const idx = skuMonths.indexOf(m);
    return idx > 0 && !isNextYrStep2(skuMonths[idx - 1]) ? 'border-l-2 border-blue-300' : '';
  };
  const updateChannelMonthQty = useStore((s) => s.updateChannelMonthQty);
  const updateMarketingMonthQty = useStore((s) => s.updateMarketingMonthQty);
  const persistSku = useStore((s) => s.persistSku);
  const [expandedChannels, setExpandedChannels] = useState<Set<Channel>>(new Set());
  const [marketingExpanded, setMarketingExpanded] = useState(false);
  // 채널별 일괄반영 선택값 (UI-only, 로컬)
  const [channelBulkOpt, setChannelBulkOpt] = useState<Partial<Record<Channel, string>>>({});
  const { usdKrw, jpyKrw, isLive } = useExchangeRates();
  const { policy } = usePricingPolicy();

  // prop 드릴링 대신 스토어에서 확정 상태를 직접 구독 — 버튼 클릭 즉시 인풋이 비활성화됨
  const liveConfirmKey = useStore((s) => {
    const found = s.skus.find((sk) => sk.id === sku.id);
    return `${found?.step2PlatformConfirmed ?? false}|${found?.step2BrandConfirmed ?? false}|${found?.step2GlobalConfirmed ?? false}`;
  });
  const [livePlatform, liveBrand, liveGlobal] = liveConfirmKey.split('|').map((v) => v === 'true');
  const isChannelLockedLive = (channel: string): boolean => {
    const group = CHANNEL_CONFIRM_GROUP[channel as Channel];
    if (!group) return false;
    if (group.field === 'step2PlatformConfirmed') return livePlatform;
    if (group.field === 'step2BrandConfirmed') return liveBrand;
    return liveGlobal;
  };

  const toggleChannel = (channel: Channel) => {
    setExpandedChannels((prev) => {
      const next = new Set(prev);
      next.has(channel) ? next.delete(channel) : next.add(channel);
      return next;
    });
  };

  // 예전 선택지(신상위크 · 선단독)는 주력 = 선오픈 최저가 · 일반 = 라이브로 보여줌
  const getPricingOpt = (channel: Channel, month: Month) =>
    normalizeStep1Opt(pricingOpts[`${channel}-${month}`] ?? PRICING_DEFAULT_OPT[channel] ?? '', !!sku.coreSku);

  const setPricingOpt = (channel: Channel, month: Month, optId: string) =>
    setPricingOpts((prev) => ({ ...prev, [`${channel}-${month}`]: optId }));

  // 대응SKU 채널×월 비교 수량
  // - 동기간: 출시월 기준 정확한 연도 매핑으로 해당 월 실적을 그대로 표시 (시즈널 비교용)
  // - 직전 12개월: 컬럼별로 연도가 뒤섞이는 걸 방지하기 위해, 채널별 직전 실적 월평균을
  //   윈도우 전체 월에 균등 배분해서 표시
  // - 비운영 채널은 –, 해외 한쪽 OFF면 남은 쪽에 합산 (채우기와 같은 규칙 · 원본은 대응SKU 채널별 실적 차트)
  const getCompQty = (channel: Channel, month: Month): number | null =>
    getCompQtyAdj(sku, compChannelYM, compMode, channel, month, skuMonths, releaseYear);

  /** basePrice 기준 선택지 가격 — 프라이싱 탭과 같은 가격 (할인 정책 · 확정 가격, 선택지 없으면 base 그대로) */
  const calcScenarioPrice = step1Pricer(sku, policy, { usd: usdKrw, jpy: jpyKrw });
  const step1Opts = STEP1_OPTIONS.filter((o) => !o.coreOnly || sku.coreSku);
  const optSuffix = (id: string, base: number) => (base > 0 ? `${Math.round((1 - calcScenarioPrice(id, base) / base) * 100)}%` : '');

  const getPricing = (channel: Channel): ChannelPricing => {
    const found = sku.channelPricing?.find((cp) => cp.channel === channel);
    return found ?? { channel, price: 0, commissionRate: DEFAULT_CHANNEL_COMMISSION[channel] };
  };

  const getMonthQty = (channel: Channel, month: Month) =>
    sku.channelMonthQty.find((e) => e.channel === channel && e.month === month)?.qty ?? 0;
  // 변동비를 못 불러왔으면 null → 공헌이익을 대체값으로 계산하지 않고 비운다
  const channelVarRatio = (channel: Channel) => varCostOf(varCostReady ? varCostResults : null, channel).ratio;

  const getChannelQty = (channel: Channel) =>
    skuMonths.reduce((sum, m) => sum + getMonthQty(channel, m), 0);

  const getMarketingQty = (month: Month) =>
    (sku.marketingMonthQty ?? {})[month] ?? 0;
  const marketingTotalQty = skuMonths.reduce((s, m) => s + getMarketingQty(m), 0);
  const marketingCost = sku.cost * marketingTotalQty;

  const calcRow = (channel: Channel) => {
    const cp = getPricing(channel);
    const effectivePrice = cp.price > 0 ? cp.price : sku.price;
    const qty = getChannelQty(channel);
    // 실매출단가 = 월별 (수량 × 시나리오가격) 합계 / 총수량 (수수료 미반영)
    const vr = channelVarRatio(channel);
    let revenue = 0;
    let profit: number | null = 0;
    let gross = 0;
    skuMonths.forEach((m) => {
      const price = calcScenarioPrice(getPricingOpt(channel, m), effectivePrice);
      const mQty = getMonthQty(channel, m);
      const cell = cellMoney(price, mQty, sku.cost, vr);
      gross += price * mQty;
      revenue += cell.revenue;
      profit = profit === null || cell.profit === null ? null : profit + cell.profit;
    });
    const netPrice = qty > 0 ? Math.round(gross / qty) : effectivePrice;
    const cm = cmOf(revenue, profit);
    return { effectivePrice, netPrice, qty, revenue, profit, cm };
  };

  const cmBadgeCls = (cm: number | null) => {
    if (cm === null) return 'bg-gray-100 text-gray-400';
    if (cm >= 40) return 'bg-emerald-100 text-emerald-800';
    if (cm >= 30) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-700';
  };

  const allChannelRows = [...B2C_CHANNELS, ...B2B_CHANNELS] as Channel[];

  const totals = allChannelRows.reduce(
    (acc, ch) => {
      const r = calcRow(ch);
      return { qty: acc.qty + r.qty, revenue: acc.revenue + r.revenue, profit: acc.profit === null || r.profit === null ? null : acc.profit + r.profit };
    },
    { qty: 0, revenue: 0, profit: 0 as number | null },
  );
  // 마케팅은 매출 0 처리, 공헌이익에서만 원가×수량 차감
  const adjustedRevenue = totals.revenue;
  const adjustedProfit = totals.profit === null ? null : totals.profit - marketingCost;
  const totalCm = cmOf(adjustedRevenue, adjustedProfit);

  useEffect(() => {
    onTotalsChange?.({ revenue: adjustedRevenue, profit: adjustedProfit });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustedRevenue, adjustedProfit]);

  const weightedAvgPrice = totals.qty > 0
    ? Math.round(allChannelRows.reduce((acc, ch) => {
        const r = calcRow(ch);
        return acc + r.netPrice * r.qty;
      }, 0) / totals.qty)
    : null;

  const renderGroup = (channels: readonly Channel[], groupLabel: string, groupColor: string) => (
    <>
      <tr className={`border-b ${groupColor}`}>
        <td colSpan={8} className="px-3 py-0.5">
          <span className="text-[10px] font-bold tracking-wide uppercase" style={{ color: 'inherit' }}>{groupLabel}</span>
        </td>
      </tr>
      {channels.map((channel) => {
        const cp = getPricing(channel);
        const { netPrice, qty, revenue, profit, cm } = calcRow(channel);
        const isExpanded = expandedChannels.has(channel);
        const channelMonthTotal = skuMonths.reduce((s, m) => s + getMonthQty(channel, m), 0);
        const displayQty = channelMonthTotal > 0 ? channelMonthTotal : qty;
        const baselineChannelTotal = step2Baseline
          ? skuMonths.reduce((s, m) => s + (step2Baseline.find((e) => e.channel === channel && e.month === m)?.qty ?? 0), 0)
          : null;
        const channelDiff = baselineChannelTotal !== null ? displayQty - baselineChannelTotal : null;
        return (
          <>
            <tr key={channel} className={`border-b border-gray-100 transition-colors ${isExpanded ? 'bg-indigo-50/60 border-l-2 border-l-indigo-400' : 'hover:bg-gray-50/40'}`}>
              {/* 채널명 + 토글 */}
              <td className="px-2 py-1.5">
                <button
                  onClick={() => toggleChannel(channel)}
                  className="flex items-center gap-1.5 w-full text-left group"
                >
                  <span className={`text-[10px] transition-transform duration-150 ${isExpanded ? 'rotate-90 text-indigo-500' : 'text-gray-400'}`}>▶</span>
                  <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: CHANNEL_COLORS[channel] }} />
                  <span className={`text-[11px] truncate ${isExpanded ? 'font-bold text-indigo-700' : 'font-medium text-gray-700 group-hover:text-indigo-600'}`}>{channel}</span>
                  {(sku.disabledChannels ?? []).includes(channel as OptOutChannel) && (
                    <span className="text-[9px] px-1 rounded bg-gray-100 text-gray-400 flex-shrink-0">비운영</span>
                  )}
                </button>
              </td>
              {/* 채널 비중 — [채널 비중 수정] 중에는 미확정·운영 채널만 입력 */}
              <td className={`px-2 py-1.5 text-center tabular-nums text-[11px] truncate ${isExpanded ? 'font-bold text-indigo-600' : 'text-gray-500'}`}>
                {shareEdit && canEditChannel(channel) && !(getDisabledChannels(sku) as readonly string[]).includes(channel) && !isChannelLockedLive(channel) ? (
                  <div className="relative flex items-center">
                    <NumericInput
                      allowDecimal
                      value={shareEdit[channel] ?? Math.round((sharePreview?.[channel] ?? (totals.qty > 0 ? (displayQty / totals.qty) * 100 : 0)) * 10) / 10}
                      onChange={(v) => onShareEdit?.(channel, v)}
                      className={`w-full text-right rounded px-1 py-0.5 pr-4 border text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-400 ${
                        shareEdit[channel] !== undefined ? 'border-indigo-400 bg-indigo-50 font-semibold text-indigo-700' : 'border-gray-200 bg-white'
                      }`}
                    />
                    <span className="absolute right-1 text-[9px] text-gray-400 pointer-events-none">%</span>
                  </div>
                ) : totals.qty > 0 && displayQty > 0
                  ? `${Math.round((displayQty / totals.qty) * 100)}%`
                  : <span className="text-gray-300">–</span>}
              </td>
              {/* 총수량 — 토글 입력값 합산 + 기존 세팅값/차이 */}
              <td className={`px-2 py-1.5 text-right tabular-nums text-[11px] ${isExpanded ? 'font-bold text-indigo-700' : 'font-medium text-gray-700'}`}>
                {displayQty > 0 ? (
                  <div className="inline-flex flex-col items-end gap-0.5">
                    <span>{displayQty.toLocaleString()}</span>
                    {baselineChannelTotal !== null && baselineChannelTotal > 0 && (
                      <span className="text-[9px] font-normal text-gray-400 whitespace-nowrap">
                        기존 {baselineChannelTotal.toLocaleString()}
                        {channelDiff !== null && channelDiff !== 0 && (
                          <span className={channelDiff > 0 ? 'text-emerald-600' : 'text-red-500'}>
                            {' '}{channelDiff > 0 ? '+' : ''}{channelDiff.toLocaleString()}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                ) : <span className="text-gray-300">–</span>}
              </td>
              {/* 실매출단가 — 월별 시나리오 가중평균 */}
              <td className={`px-2 py-1.5 text-right tabular-nums text-[11px] truncate ${isExpanded ? 'font-semibold text-indigo-600' : 'text-gray-600'}`}>
                {qty > 0 ? netPrice.toLocaleString() : <span className="text-gray-300">–</span>}
              </td>
              {/* 총매출 */}
              <td className={`px-2 py-1.5 text-right tabular-nums text-[11px] truncate ${isExpanded ? 'font-bold text-indigo-700' : 'font-medium text-gray-700'}`}>
                {revenue > 0 ? formatWon(revenue) : <span className="text-gray-300">–</span>}
              </td>
              {/* 공헌이익 */}
              <td className={`px-2 py-1.5 text-right tabular-nums text-[11px] truncate ${isExpanded ? 'font-bold' : 'font-medium'} text-emerald-700`}>
                {profit === null || profit === 0 ? <span className="text-gray-300">–</span> : profit > 0 ? formatWon(profit) : <span className="text-red-500">{formatWon(Math.abs(profit))}</span>}
              </td>
              {/* 변동비율 */}
              <td className="px-2 py-1.5 text-center tabular-nums text-[11px] truncate">
                {(() => {
                  const r = varCostResults[channel];
                  if (!varCostReady) {
                    return teamCateError
                      ? <span className="text-red-500 font-semibold" title={`Tableau 팀카테 데이터 로드 실패 — ${TABLEAU_ERROR_MESSAGES[teamCateError]}`}>로드 실패</span>
                      : <span className="text-gray-300">–</span>;
                  }
                  if (!r) {
                    return <span className="text-amber-600 font-semibold" title="이 카테고리·채널의 팀카테 데이터 없음 — 25%로 대체 계산">25.0% 대체</span>;
                  }
                  const pct = (r.ratio * 100).toFixed(1);
                  return r.isFallback
                    ? <span className="text-orange-400 font-semibold" title="지정 기간 데이터 없음 — 가용 최신 데이터로 근사">~{pct}%</span>
                    : <span className="text-orange-600 font-semibold">{pct}%</span>;
                })()}
              </td>
              {/* CM% */}
              <td className="px-2 py-1.5 text-right truncate">
                {cm !== null ? (
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${cmBadgeCls(cm)}`}>{cm}%</span>
                ) : <span className="text-gray-300">–</span>}
              </td>
            </tr>

            {/* 월별 상세 (펼침) — 월을 열로, 항목을 행으로 */}
            {isExpanded && (() => {
              const FY26 = year1MonthsStep2;
              const FY27 = year2MonthsStep2;
              const yearBorderInner = (m: Month) => yearBorderStep2(m);
              const labelCell = 'px-3 py-2 border-r border-gray-200 bg-gray-100 whitespace-nowrap';
              const totalCell = 'px-3 py-2 text-right tabular-nums text-[11px] font-bold whitespace-nowrap border-l border-gray-200 bg-gray-100';
              // 옵션별 비중 계산 (STEP3와 동일 로직)
              const activeSizes = sku.sizes.filter((s) => s.isActive && s.ratio > 0);
              const activeColors = sku.hasColors ? sku.colors.filter((c) => !c.archived && c.quantity > 0) : [];
              const colorTotal = activeColors.reduce((s, c) => s + c.quantity, 0);
              const multiSize = activeSizes.length > 1;
              const multiColor = activeColors.length > 1 && colorTotal > 0;
              const optionRows: { label: string; ratio: number; displayRatio: number }[] = multiColor && multiSize
                ? activeColors.flatMap((c) => activeSizes.map((s) => ({ label: `${c.name} ${s.label}`, ratio: (c.quantity / colorTotal) * (s.ratio / 100), displayRatio: s.ratio / 100 })))
                : multiColor ? activeColors.map((c) => ({ label: c.name, ratio: c.quantity / colorTotal, displayRatio: c.quantity / colorTotal }))
                : multiSize ? activeSizes.map((s) => ({ label: s.label, ratio: s.ratio / 100, displayRatio: s.ratio / 100 }))
                : [];
              return (
                <tr key={`${channel}-monthly`} className="border-b border-gray-200 bg-gray-50/60">
                  <td colSpan={8} className="px-4 py-3">
                    {/* 일괄 적용 툴바 */}
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="text-[11px] font-semibold text-gray-500 whitespace-nowrap">판매가 일괄 설정</span>
                      <select
                        value={channelBulkOpt[channel] ?? ''}
                        disabled={!canEditChannel(channel) || isChannelLockedLive(channel)}
                        onChange={(e) => setChannelBulkOpt((prev) => ({ ...prev, [channel]: e.target.value }))}
                        className="text-[11px] rounded border border-gray-300 px-1.5 py-0.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400"
                      >
                        <option value="">-- 전략 선택 --</option>
                        {step1Opts.map((o) => (
                          <option key={o.id} value={o.id}>{o.label} ({optSuffix(o.id, cp.price > 0 ? cp.price : sku.price)})</option>
                        ))}
                      </select>
                      <button
                        onClick={() => {
                          onBeforeEdit?.();
                          const opt = channelBulkOpt[channel] ?? '';
                          setPricingOpts((prev) => {
                            const next = { ...prev };
                            skuMonths.forEach((m) => { next[`${channel}-${m}`] = opt; });
                            return next;
                          });
                        }}
                        disabled={!channelBulkOpt[channel] || !canEditChannel(channel) || isChannelLockedLive(channel)}
                        className="text-[11px] px-2.5 py-0.5 rounded-md bg-gray-700 text-white font-semibold hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                      >
                        일괄반영
                      </button>
                    </div>

                    {/* 테이블 */}
                    <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="text-xs w-full">
                          <thead>
                            <tr className="bg-gray-100 border-b-2 border-gray-300">
                              <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-500 whitespace-nowrap border-r border-gray-200" style={{ minWidth: '80px' }}>구분</th>
                              {skuMonths.map((m) => (
                                <th key={m} className={`px-2 py-2 text-center font-bold whitespace-nowrap ${yearBorderInner(m)} ${isNextYrStep2(m) ? 'text-gray-500 bg-gray-200/60' : 'text-gray-600'}`} style={{ minWidth: '76px' }}>
                                  <div className="text-[13px]">{MONTH_LABELS[m]}</div>
                                  {isNextYrStep2(m) && <div className="text-[9px] text-gray-400 font-normal">{year2LabelStep2}</div>}
                                </th>
                              ))}
                              <th className="px-3 py-2 text-center text-[11px] font-bold text-gray-500 whitespace-nowrap border-l-2 border-gray-300 bg-gray-200/50" style={{ minWidth: '72px' }}>{year1LabelStep2}<br/>합계</th>
                              {hasYear2Step2 && <th className="px-3 py-2 text-center text-[11px] font-bold text-gray-400 whitespace-nowrap border-l border-gray-200 bg-gray-200/50" style={{ minWidth: '72px' }}>{year2LabelStep2}<br/>합계</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {/* 대응SKU 비교 행 */}
                            {compChannelYM && (
                              <tr className="border-b border-gray-400/30 bg-gray-300/30">
                                <td className="px-3 py-0.5 border-r border-gray-300 bg-gray-400/20 whitespace-nowrap">
                                  <div className="text-[9px] font-bold text-gray-600 leading-tight">대응SKU</div>
                                  <div className="text-[8px] text-gray-400 font-normal leading-tight">{compModeLabel ?? ''}</div>
                                </td>
                                {skuMonths.map((m) => {
                                  const compQty = getCompQty(channel, m);
                                  return (
                                    <td key={m} className={`px-2 py-0.5 text-right tabular-nums ${yearBorderInner(m)} ${isNextYrStep2(m) ? 'bg-gray-300/20' : ''}`}>
                                      {compQty !== null
                                        ? <span className="text-[10px] font-medium text-gray-600">{compQty.toLocaleString()}</span>
                                        : <span className="text-[10px] text-gray-300">–</span>}
                                    </td>
                                  );
                                })}
                                <td className="px-3 py-0.5 text-right tabular-nums border-l-2 border-gray-400/40 bg-gray-400/20 whitespace-nowrap">
                                  {(() => {
                                    const t = FY26.reduce((s, m) => s + (getCompQty(channel, m) ?? 0), 0);
                                    return t > 0 ? <span className="text-[10px] font-semibold text-gray-600">{t.toLocaleString()}</span> : <span className="text-[10px] text-gray-300">–</span>;
                                  })()}
                                </td>
                                {hasYear2Step2 && (
                                  <td className="px-3 py-0.5 text-right tabular-nums border-l border-gray-300 bg-gray-400/20 whitespace-nowrap">
                                    {(() => {
                                      const t = FY27.reduce((s, m) => s + (getCompQty(channel, m) ?? 0), 0);
                                      return t > 0 ? <span className="text-[10px] font-semibold text-gray-500">{t.toLocaleString()}</span> : <span className="text-[10px] text-gray-300">–</span>;
                                    })()}
                                  </td>
                                )}
                              </tr>
                            )}
                            {/* 수량 행 */}
                            <tr className="border-b border-gray-100 bg-white">
                              <td className={labelCell}>
                                <span className="text-[11px] font-bold text-gray-600">수량</span>
                              </td>
                              {skuMonths.map((m) => {
                                const compQty = getCompQty(channel, m);
                                const monthQtyVal = getMonthQty(channel, m);
                                const growthRate = compQty && compQty > 0
                                  ? ((monthQtyVal - compQty) / compQty * 100)
                                  : null;
                                const baseQty = step2Baseline?.find(e => e.channel === channel && e.month === m)?.qty ?? null;
                                const diff = baseQty !== null ? monthQtyVal - baseQty : null;
                                return (
                                  <td key={m} className={`px-1 py-1 ${yearBorderInner(m)} ${isNextYrStep2(m) ? 'bg-gray-50/60' : ''}`}>
                                    <div className="flex flex-col items-center gap-0">
                                      <div className="flex items-center gap-0.5">
                                        <NumericInput
                                          value={monthQtyVal}
                                          onChange={(val) => updateChannelMonthQty(sku.id, channel, m, val)}
                                          onBlur={() => persistSku(sku.id)}
                                          onFocus={() => onBeforeEdit?.()}
                                          disabled={readOnly || !canEditChannel(channel) || (getDisabledChannels(sku) as readonly string[]).includes(channel) || isChannelLockedLive(channel)}
                                          placeholder="0"
                                          className={`text-right rounded-md px-1 py-1 text-[11px] border focus:outline-none focus:ring-1 focus:ring-gray-400 ${
                                            readOnly || !canEditChannel(channel) || (getDisabledChannels(sku) as readonly string[]).includes(channel) || isChannelLockedLive(channel) ? 'bg-gray-50 text-gray-400 cursor-not-allowed border-gray-200' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                                          }`}
                                          style={{ width: '52px' }}
                                        />
                                        {growthRate !== null && (
                                          <span className={`text-[9px] font-semibold leading-none whitespace-nowrap ${growthRate > 0 ? 'text-emerald-600' : growthRate < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                                            {growthRate > 0 ? '+' : ''}{growthRate.toFixed(1)}%
                                          </span>
                                        )}
                                      </div>
                                      {/* 기준값 + 차이 */}
                                      {baseQty !== null && (baseQty > 0 || monthQtyVal > 0) && (
                                        <div className="text-[8px] tabular-nums leading-none text-center mt-0.5 whitespace-nowrap">
                                          <span className="text-gray-300">{baseQty.toLocaleString()}</span>
                                          {diff !== null && diff !== 0 && (
                                            <span className={diff > 0 ? ' text-emerald-500' : ' text-red-400'}>
                                              {' '}{diff > 0 ? '+' : ''}{diff.toLocaleString()}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                              <td className={`${totalCell} border-l-2 border-gray-300 text-gray-700`}>
                                {(() => { const t = FY26.reduce((s, m) => s + getMonthQty(channel, m), 0); return t > 0 ? t.toLocaleString() : <span className="text-gray-300">–</span>; })()}
                              </td>
                              {hasYear2Step2 && (
                                <td className={`${totalCell} text-gray-500`}>
                                  {(() => { const t = FY27.reduce((s, m) => s + getMonthQty(channel, m), 0); return t > 0 ? t.toLocaleString() : <span className="text-gray-300">–</span>; })()}
                                </td>
                              )}
                            </tr>
                            {/* 판매가 설정 행 */}
                            <tr className="border-b border-gray-100 bg-gray-50/50">
                              <td className={labelCell}>
                                <span className="text-[11px] font-bold text-gray-600">판매가 설정</span>
                              </td>
                              {skuMonths.map((m) => {
                                const optId = getPricingOpt(channel, m);
                                const basePrice = cp.price > 0 ? cp.price : sku.price;
                                return (
                                  <td key={m} className={`px-1.5 py-1.5 ${yearBorderInner(m)} ${isNextYrStep2(m) ? 'bg-gray-50/60' : ''}`}>
                                    <select
                                      value={optId}
                                      disabled={!canEditChannel(channel) || isChannelLockedLive(channel)}
                                      onChange={(e) => { onBeforeEdit?.(); setPricingOpt(channel, m, e.target.value); }}
                                      className="w-full text-[10px] rounded border border-gray-200 px-1 py-0.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400 hover:border-gray-400"
                                    >
                                      <option value="">채널가</option>
                                      {step1Opts.map((o) => (
                                        <option key={o.id} value={o.id}>{o.label} ({optSuffix(o.id, basePrice)})</option>
                                      ))}
                                    </select>
                                  </td>
                                );
                              })}
                              <td className="border-l-2 border-gray-300 bg-gray-100" />
                              {hasYear2Step2 && <td className="border-l border-gray-200 bg-gray-100" />}
                            </tr>
                            {/* 실 판매가 행 */}
                            <tr className="border-b-2 border-gray-200 bg-white">
                              <td className={labelCell}>
                                <span className="text-[11px] font-semibold text-gray-500">실 판매가</span>
                                {/* 환율은 외화 공급가를 쓰는 해외 채널에만 표시 */}
                                {(channel === '글로벌' || channel === '일본') && (
                                  <span className={`block text-[9px] mt-0.5 ${isLive ? 'text-indigo-300' : 'text-gray-300'}`}>
                                    ${usdKrw.toLocaleString()} · ¥{jpyKrw.toFixed(1)}
                                  </span>
                                )}
                              </td>
                              {skuMonths.map((m) => {
                                const optId = getPricingOpt(channel, m);
                                const basePrice = cp.price > 0 ? cp.price : sku.price;
                                const scenarioKrwPrice = calcScenarioPrice(optId, basePrice);
                                const scenario = PRICING_SCENARIOS.find((x) => x.id === optId);
                                const foreign = scenario?.foreignAmt?.(basePrice, usdKrw, jpyKrw) ?? null;
                                return (
                                  <td key={m} className={`px-2 py-2 text-right tabular-nums ${yearBorderInner(m)} ${isNextYrStep2(m) ? 'bg-gray-50/60' : ''}`}>
                                    {scenarioKrwPrice > 0
                                      ? <div className="flex flex-col items-end gap-0.5">
                                          <span className="text-[11px] text-gray-700 font-semibold">{scenarioKrwPrice.toLocaleString()}</span>
                                          {foreign && (
                                            <span className="text-[9px] text-indigo-400 font-medium leading-none">
                                              {foreign.symbol}{foreign.amount.toFixed(foreign.decimals)}
                                            </span>
                                          )}
                                        </div>
                                      : <span className="text-gray-300 text-[11px]">–</span>}
                                  </td>
                                );
                              })}
                              <td className="border-l-2 border-gray-300 bg-gray-100" />
                              {hasYear2Step2 && <td className="border-l border-gray-200 bg-gray-100" />}
                            </tr>
                            {/* 예상 순매출 행 */}
                            <tr className="border-b border-blue-100 bg-blue-50/50">
                              <td className="px-3 py-2 border-r border-blue-200 bg-blue-100/70 whitespace-nowrap">
                                <span className="text-[11px] font-bold text-blue-700">예상 순매출</span>
                              </td>
                              {skuMonths.map((m) => {
                                const optId = getPricingOpt(channel, m);
                                const basePrice = cp.price > 0 ? cp.price : sku.price;
                                const scenarioKrwPrice = calcScenarioPrice(optId, basePrice);
                                const monthQty = getMonthQty(channel, m);
                                const netRevenue = Math.round(scenarioKrwPrice / 1.1 * monthQty);
                                return (
                                  <td key={m} className={`px-2 py-2 text-right tabular-nums text-[11px] font-semibold text-blue-700 ${yearBorderInner(m)} ${isNextYrStep2(m) ? 'bg-blue-50/40' : ''}`}>
                                    {netRevenue > 0 ? formatWon(netRevenue) : <span className="text-blue-200">–</span>}
                                  </td>
                                );
                              })}
                              <td className="px-3 py-2 text-right tabular-nums text-[11px] font-bold text-blue-700 border-l-2 border-blue-300 bg-blue-100/70 whitespace-nowrap">
                                {(() => {
                                  const vr = channelVarRatio(channel);
                                  const base = cp.price > 0 ? cp.price : sku.price;
                                  const t = FY26.reduce<number | null>((s, m) => {
                                    const p = cellMoney(calcScenarioPrice(getPricingOpt(channel, m), base), getMonthQty(channel, m), sku.cost, vr).profit;
                                    return s === null || p === null ? null : s + p;
                                  }, 0);
                                  if (t === null || FY26.every((m) => getMonthQty(channel, m) === 0)) return <span className="text-gray-300">–</span>;
                                  return t >= 0 ? <span className="text-emerald-700">{formatWon(t)}</span> : <span className="text-red-500">-{formatWon(Math.abs(t))}</span>;
                                })()}
                              </td>
                              {hasYear2Step2 && (
                                <td className={`${totalCell}`}>
                                  {(() => {
                                    const vr = channelVarRatio(channel);
                                    const base = cp.price > 0 ? cp.price : sku.price;
                                    const t = FY27.reduce<number | null>((s, m) => {
                                      const p = cellMoney(calcScenarioPrice(getPricingOpt(channel, m), base), getMonthQty(channel, m), sku.cost, vr).profit;
                                      return s === null || p === null ? null : s + p;
                                    }, 0);
                                    if (t === null || FY27.every((m) => getMonthQty(channel, m) === 0)) return <span className="text-gray-300">–</span>;
                                    return t >= 0 ? <span className="text-emerald-600">{formatWon(t)}</span> : <span className="text-red-500">-{formatWon(Math.abs(t))}</span>;
                                  })()}
                                </td>
                              )}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* 최종 옵션 수량 */}
                    {optionRows.length > 1 && (
                      <div className="mt-3 rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
                          <span className="text-[11px] font-bold text-gray-600">최종 옵션 수량</span>
                          <span className="text-[10px] text-gray-400">
                            {multiColor && multiSize ? '컬러·사이즈별' : multiColor ? '컬러별' : '사이즈별'} · 위 수량 수정 시 자동 반영
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="text-xs w-full">
                            <thead>
                              <tr className="bg-gray-100 border-b border-gray-200">
                                <th className="px-3 py-1.5 text-left text-[11px] font-semibold text-gray-500 whitespace-nowrap border-r border-gray-200" style={{ minWidth: '90px' }}>옵션</th>
                                <th className="px-2 py-1.5 text-center text-[10px] font-semibold text-gray-400 whitespace-nowrap border-r border-gray-200 w-10">비중</th>
                                {skuMonths.map((m) => (
                                  <th key={m} className={`px-2 py-1.5 text-center font-semibold whitespace-nowrap text-[11px] ${yearBorderInner(m)} ${isNextYrStep2(m) ? 'text-gray-500 bg-gray-200/60' : 'text-gray-500'}`} style={{ minWidth: '52px' }}>
                                    {MONTH_LABELS[m]}
                                  </th>
                                ))}
                                <th className="px-2 py-1.5 text-center text-[10px] font-semibold text-indigo-600 whitespace-nowrap border-l-2 border-gray-300 bg-indigo-50/60">{year1LabelStep2}</th>
                                {hasYear2Step2 && <th className="px-2 py-1.5 text-center text-[10px] font-semibold text-gray-500 whitespace-nowrap border-l border-gray-200 bg-gray-100/80">{year2LabelStep2}</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {optionRows.map((opt, i) => {
                                const isLast = i === optionRows.length - 1;
                                // 컬러+사이즈 조합일 때 새 컬러 그룹 시작 지점에 구분선
                                const isColorGroupStart = multiColor && multiSize && i > 0 && i % activeSizes.length === 0;
                                const optFY26 = FY26.reduce((s, m) => s + Math.round(getMonthQty(channel, m) * opt.ratio), 0);
                                const optFY27 = FY27.reduce((s, m) => s + Math.round(getMonthQty(channel, m) * opt.ratio), 0);
                                return (
                                  <tr key={opt.label} className={`${isLast ? '' : 'border-b border-gray-100'} ${isColorGroupStart ? 'border-t-2 border-gray-300' : ''} even:bg-gray-50/30`}>
                                    <td className="px-3 py-1.5 text-[11px] font-medium text-gray-700 whitespace-nowrap border-r border-gray-200">
                                      {opt.label}
                                    </td>
                                    <td className="px-2 py-1.5 text-center text-[10px] text-gray-400 border-r border-gray-200">
                                      {Math.round(opt.displayRatio * 100)}%
                                    </td>
                                    {skuMonths.map((m) => {
                                      const qty = Math.round(getMonthQty(channel, m) * opt.ratio);
                                      return (
                                        <td key={m} className={`px-2 py-1.5 text-center tabular-nums text-[11px] ${yearBorderInner(m)} ${isNextYrStep2(m) ? 'bg-blue-50/20' : ''}`}>
                                          {qty > 0 ? <span className="text-gray-700">{qty.toLocaleString()}</span> : <span className="text-gray-300">–</span>}
                                        </td>
                                      );
                                    })}
                                    <td className="px-2 py-1.5 text-center tabular-nums text-[11px] text-indigo-600 border-l-2 border-gray-300 bg-indigo-50/30">
                                      {optFY26 > 0 ? optFY26.toLocaleString() : <span className="text-gray-300">–</span>}
                                    </td>
                                    {hasYear2Step2 && (
                                      <td className="px-2 py-1.5 text-center tabular-nums text-[11px] text-gray-600 border-l border-gray-200 bg-gray-100/50">
                                        {optFY27 > 0 ? optFY27.toLocaleString() : <span className="text-gray-300">–</span>}
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })()}
          </>
        );
      })}
    </>
  );

  return (
    <div className="space-y-2">
    <div className="rounded-lg border border-gray-200 overflow-x-auto">
      <table className="w-full text-xs" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '18%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '10%' }} />
        </colgroup>
        <thead>
          <tr className="bg-indigo-50 border-b border-indigo-200">
            <th className="px-3 py-2 text-center text-indigo-600 font-semibold truncate">채널</th>
            <th className="px-2 py-2 text-center text-indigo-600 font-semibold truncate">비중</th>
            <th className="px-2 py-2 text-center text-indigo-600 font-semibold truncate">총수량</th>
            <th className="px-2 py-2 text-center text-indigo-600 font-semibold truncate">실매출단가</th>
            <th className="px-2 py-2 text-center text-indigo-600 font-semibold truncate">순매출</th>
            <th className="px-2 py-2 text-center text-indigo-600 font-semibold truncate">
              공헌이익
              <div className="text-[9px] text-indigo-400 font-normal">변동비(Tableau)</div>
            </th>
            <th className="px-2 py-2 text-center text-orange-500 font-semibold truncate">변동비율</th>
            <th className="px-2 py-2 text-center text-indigo-600 font-semibold truncate">CM%</th>
          </tr>
        </thead>
        <tbody>
          {renderGroup(B2C_CHANNELS, 'B2C', 'bg-sky-50/60 border-sky-200 text-sky-600')}
          {/* 마케팅 그룹 */}
          <tr className="bg-pink-50/60 border-b border-pink-200">
            <td colSpan={8} className="px-3 py-0.5">
              <span className="text-[10px] font-bold text-pink-600 tracking-wide">마케팅</span>
            </td>
          </tr>
          {/* 마케팅 채널 행 */}
          <tr className={`border-b border-gray-100 transition-colors ${marketingExpanded ? 'bg-pink-50/60 border-l-2 border-l-pink-400' : 'hover:bg-gray-50/40'}`}>
            <td className="px-2 py-1.5">
              <button
                onClick={() => setMarketingExpanded((v) => !v)}
                className="flex items-center gap-1.5 w-full text-left group"
              >
                <span className={`text-[10px] transition-transform duration-150 ${marketingExpanded ? 'rotate-90 text-pink-500' : 'text-gray-400'}`}>▶</span>
                <span className="inline-block w-2 h-2 rounded-full flex-shrink-0 bg-pink-400" />
                <span className={`text-[11px] truncate ${marketingExpanded ? 'font-bold text-pink-700' : 'font-medium text-gray-700 group-hover:text-pink-600'}`}>마케팅</span>
              </button>
            </td>
            <td className="px-2 py-1.5 text-center text-gray-300 text-[11px]">–</td>
            <td className={`px-2 py-1.5 text-right tabular-nums text-[11px] ${marketingExpanded ? 'font-bold text-pink-700' : 'font-medium text-gray-700'}`}>
              {marketingTotalQty > 0 ? marketingTotalQty.toLocaleString() : <span className="text-gray-300">–</span>}
            </td>
            <td className="px-2 py-1.5 text-center text-gray-300 text-[11px]">–</td>
            <td className="px-2 py-1.5 text-center text-gray-300 text-[11px]">–</td>
            <td className="px-2 py-1.5 text-right tabular-nums text-[11px] font-semibold text-red-500">
              {marketingCost > 0 ? <span>-{formatWon(marketingCost)}</span> : <span className="text-gray-300">–</span>}
            </td>
            <td className="px-2 py-1.5 text-center text-gray-300 text-[11px]">–</td>
            <td className="px-2 py-1.5 text-center text-gray-300 text-[11px]">–</td>
          </tr>
          {/* 마케팅 월별 상세 (펼침) */}
          {marketingExpanded && (() => {
            const FY26m = year1MonthsStep2;
            const FY27m = year2MonthsStep2;
            const yearBorderMkt = (m: Month) => yearBorderStep2(m);
            const labelCell = 'px-3 py-2 border-r border-gray-200 bg-gray-100 whitespace-nowrap';
            const totalCell = 'px-3 py-2 text-right tabular-nums text-[11px] font-bold whitespace-nowrap border-l border-gray-200 bg-gray-100';
            return (
              <tr className="border-b border-gray-200 bg-gray-50/60">
                <td colSpan={8} className="px-4 py-3">
                  <div className="rounded-xl border border-pink-200 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="text-xs w-full">
                        <thead>
                          <tr className="bg-pink-50 border-b-2 border-pink-200">
                            <th className="px-3 py-2 text-left text-[11px] font-bold text-pink-500 whitespace-nowrap border-r border-pink-200" style={{ minWidth: '80px' }}>구분</th>
                            {skuMonths.map((m) => (
                              <th key={m} className={`px-2 py-2 text-center font-bold whitespace-nowrap ${yearBorderMkt(m)} ${isNextYrStep2(m) ? 'text-gray-500 bg-pink-100/50' : 'text-pink-600'}`} style={{ minWidth: '76px' }}>
                                <div className="text-[13px]">{MONTH_LABELS[m]}</div>
                                {isNextYrStep2(m) && <div className="text-[9px] text-gray-400 font-normal">{year2LabelStep2}</div>}
                              </th>
                            ))}
                            <th className="px-3 py-2 text-center text-[11px] font-bold text-gray-500 whitespace-nowrap border-l-2 border-pink-200 bg-pink-100/50" style={{ minWidth: '72px' }}>{year1LabelStep2}<br/>합계</th>
                            {hasYear2Step2 && <th className="px-3 py-2 text-center text-[11px] font-bold text-gray-400 whitespace-nowrap border-l border-pink-100 bg-pink-100/50" style={{ minWidth: '72px' }}>{year2LabelStep2}<br/>합계</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {/* 수량 행 */}
                          <tr className="border-b border-pink-100 bg-white">
                            <td className={labelCell}>
                              <span className="text-[11px] font-bold text-gray-600">수량</span>
                            </td>
                            {skuMonths.map((m) => {
                              const mQty = getMarketingQty(m);
                              return (
                                <td key={m} className={`px-1 py-1 ${yearBorderMkt(m)} ${isNextYrStep2(m) ? 'bg-gray-50/60' : ''}`}>
                                  <NumericInput
                                    value={mQty}
                                    onChange={(val) => updateMarketingMonthQty(sku.id, m, val)}
                                    onBlur={() => persistSku(sku.id)}
                                    onFocus={() => onBeforeEdit?.()}
                                    disabled={readOnly || !canEditChannel('마케팅') || isMarketingLocked(sku)}
                                    placeholder="0"
                                    className={`text-right rounded-md px-1 py-1 text-[11px] border focus:outline-none focus:ring-1 focus:ring-pink-400 ${
                                      readOnly || !canEditChannel('마케팅') || isMarketingLocked(sku) ? 'bg-gray-50 text-gray-400 cursor-not-allowed border-gray-200' : 'bg-white text-gray-700 border-pink-200 hover:border-pink-400'
                                    }`}
                                    style={{ width: '52px' }}
                                  />
                                </td>
                              );
                            })}
                            <td className={`${totalCell} border-l-2 border-gray-300 text-gray-700`}>
                              {(() => { const t = FY26m.reduce((s, m) => s + getMarketingQty(m), 0); return t > 0 ? t.toLocaleString() : <span className="text-gray-300">–</span>; })()}
                            </td>
                            {hasYear2Step2 && (
                              <td className={`${totalCell} text-gray-500`}>
                                {(() => { const t = FY27m.reduce((s, m) => s + getMarketingQty(m), 0); return t > 0 ? t.toLocaleString() : <span className="text-gray-300">–</span>; })()}
                              </td>
                            )}
                          </tr>
                          {/* 예상 비용 (공헌이익 차감) 행 */}
                          <tr className="bg-red-50/50">
                            <td className="px-3 py-2 border-r border-red-200 bg-red-100/70 whitespace-nowrap">
                              <span className="text-[11px] font-bold text-red-600">예상 비용</span>
                              <span className="block text-[9px] text-red-400 mt-0.5">공헌이익 차감</span>
                            </td>
                            {skuMonths.map((m) => {
                              const mCost = sku.cost * getMarketingQty(m);
                              return (
                                <td key={m} className={`px-2 py-2 text-right tabular-nums text-[11px] font-semibold text-red-600 ${yearBorderMkt(m)} ${isNextYrStep2(m) ? 'bg-red-50/40' : ''}`}>
                                  {mCost > 0 ? <span>-{formatWon(mCost)}</span> : <span className="text-red-200">–</span>}
                                </td>
                              );
                            })}
                            <td className="px-3 py-2 text-right tabular-nums text-[11px] font-bold text-red-600 border-l-2 border-red-300 bg-red-100/70 whitespace-nowrap">
                              {(() => { const t = FY26m.reduce((s, m) => s + sku.cost * getMarketingQty(m), 0); return t > 0 ? <span>-{formatWon(t)}</span> : <span className="text-red-200">–</span>; })()}
                            </td>
                            {hasYear2Step2 && (
                              <td className="px-3 py-2 text-right tabular-nums text-[11px] font-bold text-red-500 border-l border-red-200 bg-red-100/70 whitespace-nowrap">
                                {(() => { const t = FY27m.reduce((s, m) => s + sku.cost * getMarketingQty(m), 0); return t > 0 ? <span>-{formatWon(t)}</span> : <span className="text-red-200">–</span>; })()}
                              </td>
                            )}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </td>
              </tr>
            );
          })()}
          {renderGroup(B2B_CHANNELS, 'B2B', 'bg-violet-50/60 border-violet-200 text-violet-600')}
        </tbody>
        <tfoot>
          <tr className="bg-indigo-50 border-t-2 border-indigo-200">
            <td className="px-3 py-2 font-semibold text-indigo-800 whitespace-nowrap text-[11px]">합계</td>
            <td className="px-2 py-2 text-center text-indigo-300 text-[11px]">–</td>
            <td className="px-2 py-2 text-right tabular-nums font-semibold text-indigo-700 text-[11px] whitespace-nowrap">
              {totals.qty > 0 ? totals.qty.toLocaleString() : '–'}
            </td>
            <td className="px-2 py-2 text-right text-[10px] text-indigo-600 whitespace-nowrap">
              {weightedAvgPrice ? `avg ₩${weightedAvgPrice.toLocaleString()}` : '–'}
            </td>
            <td className="px-2 py-2 text-right font-semibold tabular-nums text-indigo-700 text-[11px] whitespace-nowrap">
              {totals.revenue > 0 ? formatWon(totals.revenue) : '–'}
            </td>
            <td className="px-2 py-2 text-right font-semibold tabular-nums text-[11px] whitespace-nowrap">
              {adjustedProfit === null || adjustedProfit === 0
                ? '–'
                : adjustedProfit > 0
                  ? <span className="text-emerald-700">{formatWon(adjustedProfit)}</span>
                  : <span className="text-red-500">-{formatWon(Math.abs(adjustedProfit))}</span>}
            </td>
            <td className="px-2 py-2 text-center text-gray-300 text-[11px]">–</td>
            <td className="px-2 py-2 text-right whitespace-nowrap">
              {totalCm !== null ? (
                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${cmBadgeCls(totalCm)}`}>{totalCm}%</span>
              ) : '–'}
            </td>
          </tr>
          <tr className="border-t border-gray-100">
            <td colSpan={8} className="px-3 py-1.5 text-[10px] text-gray-400">
              실매출단가 = ∑(월수량×시나리오가격) ÷ 총수량 &nbsp;·&nbsp; 공헌이익 = 순매출 − 변동비 − 원가×수량 &nbsp;*변동비 = 같은 카테고리×채널의 팀카테 실적 역산 · 대응SKU는 기간만 결정(없으면 최근 12개월) · 해당 데이터 없는 채널만 25% 대체 · 로드 실패 시 공헌이익 비움
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
    </div>
  );
}
