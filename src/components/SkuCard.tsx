import type { SkuData } from '../types';
import { BRANDS, CHANNELS, B2C_CHANNELS, B2B_CHANNELS, isSeasonOnly, getSkuMonths, moqOf, type Month, type Channel, type OptOutChannel } from '../types';
import { useStore } from '../store';
import { coverage } from '../utils/qtyPlan';
import { useAuth } from '../store/auth';
import { useCpoSync } from '../store/cpoSync';
import { getConfirmedPricingScenario, cpoPricingDeepLink, cpoProjectDeepLink, CPO_STATUS_STYLES, resolveManagerNames } from '../types/cpo';
import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import { OptionConfigColumn } from './OptionConfigColumn';
import { MemoBox } from './MemoBox';
import { useReviewCtx } from '../hooks/useReviewCtx';
import { cachedReview } from '../utils/skuReview';
import { NumericInput } from './NumericInput';
import { usePermission } from '../contexts/PermissionsContext';
import { copySkuLink } from '../utils/skuLink';
import { MarketingBriefModal } from './MarketingBriefModal';
import { finalOrderModel } from '../utils/finalOrder';
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
    <span className={`text-xs font-bold px-1.5 py-0.5 bg-pink-100 text-red-600 ${wrap ? 'inline-block' : 'inline-flex items-center gap-1 whitespace-nowrap'}`}>
      {seasonOnly && <span className="font-bold">시즌 한정 ·</span>}
      {wrap && seasonOnly ? ' ' : ''}{text}
    </span>
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
          <div><div className="text-[11px] text-gray-500">{sku.orderPlans?.decided ? `${active}안 ` : ''}발주량 · MOQ {moqOf(sku) ? moqOf(sku).toLocaleString() : '미입력'}</div><b className="text-base font-extrabold">{qty.toLocaleString()}개</b></div>
          <div><div className="text-[11px] text-gray-500">소진월 · 판정</div><div className="flex flex-wrap items-center gap-1.5"><b className="text-base font-extrabold">{coverIdx < 0 ? '미소진' : `${m.months[coverIdx].month}월`}</b><CoverageChip sku={sku} skuMonths={skuMonths} wrap /></div></div>
          <div><div className="text-[11px] text-gray-500">예상 순매출</div><b className="text-base font-extrabold">{formatWon(m.revenue)}</b></div>
          <div><div className="text-[11px] text-gray-500">예상 공헌이익{m.cm !== null ? ` · CM ${m.cm}%` : ''}</div><b className="text-base font-extrabold">{profitText}</b></div>
        </div>
        <OptionResultTable sku={sku} />
      </div>
      <ChannelMonthTable sku={sku} skuMonths={skuMonths} releaseYear={releaseYear} />
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

/** 발주량 검토 › 채널별 목표량 — 카드의 채널 표를 그대로 쓴다(월 계획 · STEP 탭 없음, 열어도 자동 저장 없음) */
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
      <div className="min-w-0 grid grid-cols-[88px_minmax(0,1fr)] md:grid-cols-1 gap-2 items-start content-start">
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

// ── 채널×월 상세수량 테이블 (STEP2 값 읽기 전용 표시) ──────────────────────
function ChannelMonthTable({ sku, skuMonths, releaseYear }: {
  sku: SkuData;
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
      if (next.has(ch)) next.delete(ch); else next.add(ch);
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

