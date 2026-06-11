import type { SkuData } from '../types';
import { BRANDS, MONTHS, CHANNELS, B2C_CHANNELS, B2B_CHANNELS, DISABLED_CHANNELS, DEFAULT_CHANNEL_COMMISSION, getReleaseMonth, simPosition, type Month, type Channel } from '../types';
import type { ChannelMonthQtyEntry, ChannelPricing } from '../types';
import { useStore } from '../store';
import { useAuth } from '../store/auth';
import { revenueMultiplier, calcDynamicMultiplier } from '../utils/calc';
import { useState, useRef, useEffect, useMemo, type Dispatch, type SetStateAction, type ChangeEvent } from 'react';
import { fetchTeamCateData, calcVariableCostRatio, type TeamCateMap, type ChannelByYearMonth } from '../services/tableau';
import { SizeDistColumn } from './SizeDistColumn';
import { ComparisonColumn } from './ComparisonColumn';
import { NumericInput } from './NumericInput';
import { useExchangeRates } from '../utils/useExchangeRates';
import { isMdRole } from '../utils/pin';

const MONTH_LABELS: Record<Month, string> = {
  7: '7월', 8: '8월', 9: '9월', 10: '10월', 11: '11월', 12: '12월',
  1: '1월', 2: '2월',
};
const IS_NEXT_YEAR: Record<Month, boolean> = {
  7: false, 8: false, 9: false, 10: false, 11: false, 12: false,
  1: true, 2: true,
};

const DEFAULT_CHANNEL_RATIO_PCT: Record<Channel, number> = {
  '자사몰': 20, '스스': 30, '위탁': 5,
  '쿠팡': 10, 'B2B': 15, '사입및페어': 5, '글로벌': 5, '일본': 10,
};

const CHANNEL_COLORS: Record<Channel, string> = {
  '자사몰': '#6366f1', '스스': '#8b5cf6', '위탁': '#06b6d4',
  '쿠팡': '#f97316', 'B2B': '#10b981', '사입및페어': '#6b7280',
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
}

export function SkuCard({ sku }: Props) {
  const toggleExpanded = useStore((s) => s.toggleExpanded);
  const deleteSku = useStore((s) => s.deleteSku);
  const resetSku = useStore((s) => s.resetSku);
  const duplicateSku = useStore((s) => s.duplicateSku);
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);
  const skus = useStore((s) => s.skus);
  const activeCategory = useStore((s) => s.activeCategory);
  const { role } = useAuth();
  const canEdit = role === 'master' || role === 'pm';
  const isFinalized = !!sku.finalOrderConfirmedAt;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isAtMax = skus.filter((s) => s.category === activeCategory).length >= 15;

  // 대응SKU 월별 실적 (ComparisonColumn → MonthlyTable 브릿지)
  const [compMonthlyData, setCompMonthlyData] = useState<Partial<Record<number, number>>>({});
  const [compMode, setCompMode] = useState<'rolling12' | 'samePeriod'>('rolling12');
  const [compModeLabel, setCompModeLabel] = useState('직전 12개월');
  // 대응SKU 채널 분포 (Tableau 채널별 실적 → STEP2 기본값 산출에 사용)
  const [compChannelDist, setCompChannelDist] = useState<Record<string, number> | null>(null);
  // 대응SKU 채널×연월 원시 데이터 (STEP2 월별 비교행용)
  const [compChannelYM, setCompChannelYM] = useState<ChannelByYearMonth | null>(null);

  function handleComparisonDataChange(
    data: Partial<Record<number, number>>,
    mode: 'rolling12' | 'samePeriod',
    label: string,
  ) {
    setCompMonthlyData(data);
    setCompMode(mode);
    setCompModeLabel(label);
  }


  // STEP3 pricingOpts — sku 데이터로 초기화해 새로고침 후에도 유지됨
  const [pricingOpts, _setPricingOpts] = useState<Record<string, string>>(sku.pricingOpts ?? {});
  const [step3Totals, setStep3Totals] = useState<{ revenue: number; profit: number } | null>(null);

  const setPricingOpts: Dispatch<SetStateAction<Record<string, string>>> = (updater) => {
    _setPricingOpts((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      updateSku(sku.id, { pricingOpts: next });
      persistSku(sku.id);
      return next;
    });
  };

  const multiplier = calcDynamicMultiplier(sku.channelRatios) ?? revenueMultiplier(sku.category);
  void multiplier; // 하위 컴포넌트(ComparisonColumn)에서 사용

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

          <span className="font-semibold text-gray-900 truncate flex-1 min-w-0 text-sm">
            {sku.name || '(SKU명 미입력)'}
          </span>

          {sku.isConfirmed && (
            <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
              ✓ 확정
            </span>
          )}

          {canEdit && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => resetSku(sku.id)}
                className="text-xs px-2 py-1 rounded-lg border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
              >
                초기화
              </button>
              <button
                onClick={() => duplicateSku(sku.id)}
                disabled={isAtMax}
                title={isAtMax ? '최대 15개 도달' : '이 SKU를 복사합니다'}
                className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                  isAtMax
                    ? 'border-gray-200 text-gray-300 bg-gray-50 cursor-not-allowed'
                    : 'border-sky-300 text-sky-700 bg-sky-50 hover:bg-sky-100'
                }`}
              >
                복사
              </button>
              {showDeleteConfirm ? (
                <div className="flex items-center gap-1">
                  <button onClick={() => deleteSku(sku.id)} className="text-xs px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600">삭제</button>
                  <button onClick={() => setShowDeleteConfirm(false)} className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300">취소</button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-xs px-2 py-1 rounded-lg border border-red-200 text-red-500 bg-red-50 hover:bg-red-100 transition-colors"
                >
                  삭제
                </button>
              )}
            </div>
          )}
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
            {sku.platformConfirmed && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-emerald-600 text-white">플랫폼 확정</span>
            )}
            {sku.brandConfirmed && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-amber-500 text-white">브랜드 확정</span>
            )}
            {sku.globalConfirmed && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-sky-600 text-white">글로벌 확정</span>
            )}
          </div>
        </div>
      </div>

      {/* 상세 입력 영역 (펼침) */}
      {sku.isExpanded && (
        <div className="p-4 bg-white">
          {sku.isConfirmed && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200 whitespace-nowrap">
                🔒 수량 확정
              </span>
              <span className="text-xs text-red-500">수량 수정 MD 협의 필요</span>
            </div>
          )}
          <div className="grid gap-4 grid-cols-1 md:grid-cols-[1fr_2fr_1.2fr]">
            {/* 열 1: 기본정보 */}
            <BasicInfoColumn sku={sku} readOnly={!canEdit || isFinalized} />
            {/* 열 2: 사이즈 분배 */}
            <SizeDistColumn sku={sku} readOnly={!canEdit || isFinalized} />
            {/* 열 3: 기존 SKU 비교 */}
            <ComparisonColumn
              sku={sku}
              readOnly={!canEdit || isFinalized}
              onComparisonDataChange={handleComparisonDataChange}
              onChannelDistChange={setCompChannelDist}
              onChannelYMDataChange={setCompChannelYM}
              step3Revenue={step3Totals?.revenue}
              step3Profit={step3Totals?.profit}
            />
          </div>
          <MonthlyTable
            sku={sku}
            readOnly={!canEdit || isFinalized}
            compMonthlyData={compMonthlyData}
            compModeLabel={compModeLabel}
            compMode={compMode}
            compChannelDist={compChannelDist}
            compChannelYM={compChannelYM}
            pricingOpts={pricingOpts}
            setPricingOpts={setPricingOpts}
            onStep3TotalsChange={setStep3Totals}
          />
        </div>
      )}
    </div>
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
      <div className="mb-3 w-full aspect-square rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center">
        <span className="text-xs text-gray-400">업로드 중...</span>
      </div>
    );
  }

  if (saveError) {
    return (
      <div className="mb-3 w-full aspect-square rounded-xl border border-red-200 bg-red-50 flex flex-col items-center justify-center gap-2 px-3 text-center">
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
      <div className="relative group rounded-xl overflow-hidden border border-gray-200 mb-3 bg-gray-50">
        <img src={imageUrl} alt="SKU 썸네일" className="w-full aspect-square object-cover" />
        {!readOnly && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/45 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
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
      <div className="mb-3 w-full aspect-square rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-center">
        <span className="text-xs text-gray-300">이미지 없음</span>
      </div>
    );
  }

  return (
    <div className="mb-3">
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

// ── 기본 정보 컬럼 ────────────────────────────────────────────────────────
function BasicInfoColumn({ sku, readOnly }: { sku: SkuData; readOnly?: boolean }) {
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);

  const inputCls = `w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed`;
  const selectCls = `w-full px-2 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed`;

  function handleChange(patch: Partial<SkuData>) {
    if (readOnly) return;
    updateSku(sku.id, patch);
  }

  function handleBlur() {
    if (readOnly) return;
    persistSku(sku.id);
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">기본 정보</h3>

      {/* 썸네일 — SKU명 위에 배치 */}
      <ThumbnailSection skuId={sku.id} imageUrl={sku.imageUrl} readOnly={readOnly} />

      <div>
        <label className="block text-xs text-gray-500 mb-1">SKU명</label>
        <input
          type="text"
          value={sku.name}
          onChange={(e) => handleChange({ name: e.target.value })}
          onBlur={handleBlur}
          disabled={readOnly}
          placeholder="SKU명 입력"
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">카테고리</label>
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
        <div>
          <label className="block text-xs text-gray-500 mb-1">SKU 구분</label>
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
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">브랜드</label>
        <select
          value={sku.brand}
          onChange={(e) => handleChange({ brand: e.target.value as SkuData['brand'] })}
          onBlur={handleBlur}
          disabled={readOnly}
          className={`w-full px-2 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed`}
        >
          {BRANDS.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">출시일</label>
        <input
          type="date"
          value={sku.releaseDate}
          onChange={(e) => handleChange({ releaseDate: e.target.value })}
          onBlur={handleBlur}
          disabled={readOnly}
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">판매가 (₩)</label>
          <NumericInput
            value={sku.price}
            onChange={(v) => handleChange({ price: v })}
            onBlur={handleBlur}
            disabled={readOnly}
            placeholder="0"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">원가 (₩)</label>
          <NumericInput
            value={sku.cost}
            onChange={(v) => handleChange({ cost: v })}
            onBlur={handleBlur}
            disabled={readOnly}
            placeholder="0"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">정가 (₩)</label>
          <NumericInput
            value={sku.regularPrice}
            onChange={(v) => handleChange({ regularPrice: v })}
            onBlur={handleBlur}
            disabled={readOnly}
            placeholder="0"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">상시할인율</label>
          <div className="w-full px-3 py-2 text-sm border border-gray-100 rounded-lg bg-gray-50 text-gray-700 tabular-nums">
            {sku.regularPrice > 0 && sku.price > 0
              ? `${Math.round((1 - sku.price / sku.regularPrice) * 100)}%`
              : <span className="text-gray-300">—</span>}
          </div>
        </div>
      </div>

    </div>
  );
}

// 대응SKU 채널 분포를 기반으로 channelMonthQty 초기화 (STEP2 자동 세팅용)
// 채널 합계 = totalOrderQty × 채널비중, 월별 배분은 STEP1 비율 (없으면 균등)
function buildChannelMonthEntries(
  compChannelDist: Record<string, number> | null | undefined,
  sku: SkuData,
): ChannelMonthQtyEntry[] {
  const totalOrderQty = sku.totalOrderQty;
  if (totalOrderQty === 0) {
    return CHANNELS.flatMap((channel) => MONTHS.map((month) => ({ channel, month, qty: 0 })));
  }

  const distTotal = compChannelDist
    ? Object.values(compChannelDist).reduce((s, q) => s + q, 0)
    : 0;

  // STEP1 월별 수량 기반 배분 비율
  const monthQtys = MONTHS.map((m) => sku.monthlySplit.find((ms) => ms.month === m)?.quantity ?? 0);
  const totalMonthly = monthQtys.reduce((s, q) => s + q, 0);

  return CHANNELS.flatMap((channel) => {
    const channelRatio = compChannelDist && distTotal > 0
      ? (compChannelDist[channel] ?? 0) / distTotal
      : DEFAULT_CHANNEL_RATIO_PCT[channel] / 100;
    const channelTotal = Math.round(totalOrderQty * channelRatio);

    return MONTHS.map((month, mi) => {
      // STEP1 미입력이면 균등 배분
      const fraction = totalMonthly > 0 ? monthQtys[mi] / totalMonthly : 1 / MONTHS.length;
      return { channel, month, qty: Math.round(channelTotal * fraction) };
    });
  });
}

// ── 월별 판매 수량 테이블 ─────────────────────────────────────────────────
function MonthlyTable({
  sku,
  readOnly,
  compMonthlyData,
  compModeLabel,
  compMode,
  compChannelDist,
  compChannelYM,
  pricingOpts,
  setPricingOpts,
  onStep3TotalsChange,
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
  onStep3TotalsChange: (totals: { revenue: number; profit: number } | null) => void;
}) {
  const [activeTab, setActiveTab] = useState<'monthly' | 'channel' | 'pricing'>('monthly');
  type Step2Snapshot = { channelMonthQty: SkuData['channelMonthQty']; pricingOpts: Record<string, string> };
  const [step2UndoStack, setStep2UndoStack] = useState<Step2Snapshot[]>([]);
  // STEP2 탭 첫 진입 시 기준값 스냅샷 (편집 전 초기 세팅 수량 표시용)
  const [step2Baseline, setStep2Baseline] = useState<SkuData['channelMonthQty'] | null>(null);
  const step2BaselineCaptured = useRef(false);

  // 팀카테 변동비 데이터 로드
  const [teamCateMap, setTeamCateMap] = useState<TeamCateMap | null>(null);
  useEffect(() => { fetchTeamCateData().then(setTeamCateMap).catch(() => {}); }, []);

  const releaseYear = sku.releaseDate ? parseInt(sku.releaseDate.split('-')[0], 10) : null;
  const varCostByChannel = useMemo<Record<string, number>>(() => {
    if (!teamCateMap) return {};
    const result: Record<string, number> = {};
    for (const ch of [...B2C_CHANNELS, ...B2B_CHANNELS]) {
      const r = calcVariableCostRatio(teamCateMap, sku.category, ch, compMode, getReleaseMonth(sku.releaseDate), releaseYear);
      if (r !== null) result[ch] = r;
    }
    return result;
  }, [teamCateMap, sku.category, sku.releaseDate, compMode, releaseYear]);

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
  const batchInitChannelMonthQty = useStore((s) => s.batchInitChannelMonthQty);
  const persistSku = useStore((s) => s.persistSku);
  const setChannelConfirmed = useStore((s) => s.setChannelConfirmed);
  const { role } = useAuth();
  // STEP 1은 PM/master만 편집 가능
  const step1ReadOnly = readOnly || isMdRole(role);
  // STEP 2는 MD 역할도 편집 가능, 단 최종발주 확정 후에는 모든 역할 잠김
  const isFinalized2 = !!sku.finalOrderConfirmedAt;
  const step2ReadOnly = (isMdRole(role) && !isFinalized2) ? false : readOnly;

  // STEP2 탭 진입 시, channelMonthQty가 미초기화 상태면 대응SKU 채널 비중으로 자동 세팅
  useEffect(() => {
    if (activeTab !== 'pricing') return;
    const isUninitialized = sku.channelMonthQty.every((e) => e.qty === 0);
    if (!isUninitialized) return;
    if (sku.totalOrderQty === 0) return;
    const entries = buildChannelMonthEntries(compChannelDist, sku);
    if (entries.every((e) => e.qty === 0)) return;
    batchInitChannelMonthQty(sku.id, entries);
    persistSku(sku.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, compChannelDist]);

  // STEP2 탭 첫 진입 후 초기 수량이 확정되면 기준값으로 캡처 (편집 전 비교용)
  useEffect(() => {
    if (activeTab !== 'pricing') return;
    if (step2BaselineCaptured.current) return;
    if (sku.channelMonthQty.every((e) => e.qty === 0)) return; // 아직 자동세팅 전
    step2BaselineCaptured.current = true;
    setStep2Baseline([...sku.channelMonthQty]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, sku.channelMonthQty]);

  const releaseMonth = getReleaseMonth(sku.releaseDate);
  const isDisabled = (m: Month) =>
    releaseMonth !== null && simPosition(m) < simPosition(releaseMonth);

  const totalQty = sku.monthlySplit.reduce((sum, ms) => sum + ms.quantity, 0);
  const fy26Split = sku.monthlySplit.filter((ms) => !IS_NEXT_YEAR[ms.month]);
  const fy26Qty = fy26Split.reduce((sum, ms) => sum + ms.quantity, 0);
  const fy26RatioSum = fy26Split
    .filter((ms) => !isDisabled(ms.month))
    .reduce((sum, ms) => sum + ms.ratio, 0);
  const totalRatioSum = sku.monthlySplit
    .filter((ms) => !isDisabled(ms.month))
    .reduce((sum, ms) => sum + ms.ratio, 0);

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      {/* 탭 버튼 */}
      <div className="flex gap-2 mb-3 items-end">
        {([
          { key: 'monthly', step: 'STEP 1', label: '월별 계획', sub: 'PM · MOQ 기반 월별 수량 확인' },
          { key: 'pricing', step: 'STEP 2', label: '채널별 목표량 설정', sub: 'MD · 채널별 수량 · 프라이싱 검토' },
          { key: 'channel', step: 'STEP 3', label: '채널별 수량 확인', sub: 'MD  월별/옵션별 최종 수량' },
        ] as { key: 'monthly' | 'channel' | 'pricing'; step: string; label: string; sub: string }[]).map(({ key, step, label, sub }) => {
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
      {activeTab === 'monthly' && (
        <p className="text-[11px] text-gray-400 mb-2">* 월별 목표량 수기 입력</p>
      )}
      {activeTab === 'pricing' && (
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] text-gray-400">대응 SKU의 채널 비중으로 초기 세팅됩니다. 전략에 맞추어 월별 목표량을 수정해주세요.</p>
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
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
            {(() => {
              const step2Total = sku.channelMonthQty.reduce((s, e) => s + e.qty, 0);
              if (step2Total === 0 || sku.totalOrderQty === 0 || step2Total === sku.totalOrderQty) return null;
              const isShort = step2Total < sku.totalOrderQty;
              return (
                <>
                  {isShort && (
                    <span className="text-[11px] font-semibold text-white bg-red-500 px-2 py-0.5 rounded-full whitespace-nowrap">
                      * MOQ 미달! 수정하세요
                    </span>
                  )}
                  <button
                    onClick={() => {
                      captureStep2Backup();
                      const total = step2Total;
                      const scaled = sku.channelMonthQty.map((e) => ({
                        ...e,
                        qty: (DISABLED_CHANNELS as readonly string[]).includes(e.channel)
                          ? 0
                          : Math.round(e.qty * sku.totalOrderQty / total),
                      }));
                      batchInitChannelMonthQty(sku.id, scaled);
                      persistSku(sku.id);
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-lg border border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors whitespace-nowrap"
                  >
                    비례반영 ({step2Total.toLocaleString()} → {sku.totalOrderQty.toLocaleString()})
                  </button>
                </>
              );
            })()}
            <button
              onClick={() => {
                captureStep2Backup();
                const entries = buildChannelMonthEntries(compChannelDist, sku);
                batchInitChannelMonthQty(sku.id, entries);
                persistSku(sku.id);
                // 초기화 후 기준값도 새 초기화 수량으로 갱신
                step2BaselineCaptured.current = false;
                setStep2Baseline(null);
              }}
              className="text-[11px] px-2.5 py-1 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-500 transition-colors"
            >
              초기화
            </button>
            {(
              [
                { field: 'platformConfirmed', label: '플랫폼 확정', on: 'bg-emerald-600 text-white hover:bg-emerald-700', off: 'border border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
                { field: 'brandConfirmed',    label: '브랜드 확정', on: 'bg-amber-500 text-white hover:bg-amber-600',   off: 'border border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100'   },
                { field: 'globalConfirmed',   label: '글로벌 확정', on: 'bg-sky-600 text-white hover:bg-sky-700',       off: 'border border-sky-400 bg-sky-50 text-sky-700 hover:bg-sky-100'           },
              ] as { field: 'platformConfirmed' | 'brandConfirmed' | 'globalConfirmed'; label: string; on: string; off: string }[]
            ).map(({ field, label, on, off }) => {
              const isOn = !!sku[field];
              return (
                <button
                  key={field}
                  onClick={() => setChannelConfirmed(sku.id, field, !isOn)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap ${isOn ? on : off}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'pricing' ? (
        <PricingChannelTable
          sku={sku}
          readOnly={step2ReadOnly}
          pricingOpts={pricingOpts}
          setPricingOpts={setPricingOpts}
          onTotalsChange={onStep3TotalsChange}
          onBeforeEdit={captureStep2Backup}
          varCostByChannel={varCostByChannel}
          compChannelYM={compChannelYM}
          compMode={compMode}
          compModeLabel={compModeLabel}
          step2Baseline={step2Baseline}
        />
      ) : activeTab === 'channel' ? (
        <>
          <ChannelMonthTable sku={sku} readOnly={readOnly} monthlySplit={sku.monthlySplit} compChannelDist={compChannelDist} />
          <p className="text-[11px] text-gray-400 mt-2">채널별 토글을 열어 옵션별 수량을 확인하세요. (옵션별 수량 및 비중 임의 수정 불가)</p>
        </>
      ) : (
      <div className="rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-xs min-w-[640px]" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '80px' }} />
            {MONTHS.map((m) => <col key={m} style={{ width: '60px' }} />)}
            <col style={{ width: '72px' }} />
            <col style={{ width: '72px' }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2 text-left text-gray-500 font-semibold">구분</th>
              {MONTHS.map((m) => (
                <th
                  key={m}
                  className={`px-2 py-2 text-center font-semibold ${
                    IS_NEXT_YEAR[m] ? 'text-blue-600 bg-blue-50/60' : 'text-gray-600'
                  }`}
                >
                  {MONTH_LABELS[m]}
                  {IS_NEXT_YEAR[m] && (
                    <div className="text-[10px] text-blue-400 font-normal leading-tight">27년</div>
                  )}
                </th>
              ))}
              <th className="px-2 py-2 text-center text-indigo-700 font-semibold bg-indigo-100/70 whitespace-nowrap">26년 연간</th>
              <th className="px-2 py-2 text-center text-gray-600 font-semibold bg-gray-100 whitespace-nowrap">합계</th>
            </tr>
          </thead>
          <tbody>
            {/* 대응SKU 실적 행 */}
            {(() => {
              const hasData = Object.keys(compMonthlyData).length > 0;
              const fy26Sum = MONTHS.filter((m) => !IS_NEXT_YEAR[m])
                .reduce((s, m) => s + (compMonthlyData[m] ?? 0), 0);
              const totalSum = MONTHS.reduce((s, m) => s + (compMonthlyData[m] ?? 0), 0);
              return (
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="text-gray-500 font-medium text-[11px]">대응SKU 실적</div>
                    <div className="text-[10px] leading-tight mt-0.5">
                      {hasData ? (
                        <span className="text-indigo-400">{compModeLabel}</span>
                      ) : (
                        <span className="text-gray-300">SKU 미설정</span>
                      )}
                    </div>
                  </td>
                  {MONTHS.map((m) => {
                    const qty = compMonthlyData[m];
                    return (
                      <td
                        key={m}
                        className={`px-2 py-2 text-center tabular-nums ${IS_NEXT_YEAR[m] ? 'bg-blue-50/20' : ''}`}
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
                    {fy26Sum > 0
                      ? <span className="font-semibold text-indigo-600">{fy26Sum.toLocaleString()}</span>
                      : <span className="text-gray-300">–</span>}
                  </td>
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
              {MONTHS.map((m) => {
                const ms = sku.monthlySplit.find((x) => x.month === m)!;
                const disabled = isDisabled(m);
                return (
                  <td key={m} className={`px-2 py-2 text-center tabular-nums ${IS_NEXT_YEAR[m] ? 'bg-blue-50/30' : ''}`}>
                    {disabled || ms.quantity === 0 ? (
                      <span className="text-gray-300">–</span>
                    ) : (
                      <span className="text-gray-700">{ms.quantity.toLocaleString()}</span>
                    )}
                  </td>
                );
              })}
              <td className="px-2 py-2 text-center font-semibold text-indigo-700 bg-indigo-50/50 tabular-nums whitespace-nowrap">
                {fy26Qty > 0 ? fy26Qty.toLocaleString() : <span className="text-gray-300">–</span>}
              </td>
              <td className="px-2 py-2 text-center font-semibold text-gray-700 bg-gray-50 tabular-nums whitespace-nowrap">
                {totalQty > 0 ? totalQty.toLocaleString() : <span className="text-gray-300">–</span>}
              </td>
            </tr>

            {/* 비중 행 — 퍼센티지 입력, 수량은 위 행에 표시 */}
            <tr className="border-b border-gray-100">
              <td className="px-3 py-2 text-gray-400 font-medium whitespace-nowrap text-[11px]">비중</td>
              {MONTHS.map((m) => {
                const ms = sku.monthlySplit.find((x) => x.month === m)!;
                const disabled = isDisabled(m);
                return (
                  <td key={m} className={`px-1 py-1 ${IS_NEXT_YEAR[m] ? 'bg-blue-50/20' : ''}`}>
                    {disabled ? (
                      <div className="text-center text-gray-300">–</div>
                    ) : (
                      <div className="relative flex items-center">
                        <NumericInput
                          value={ms.ratio}
                          onChange={(val) => updateMonthlySplit(sku.id, m, val)}
                          onBlur={() => persistSku(sku.id)}
                          disabled={step1ReadOnly}
                          placeholder="0"
                          className={`w-full text-center rounded px-1 py-1 border border-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-[11px] ${
                            step1ReadOnly ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'bg-white'
                          }`}
                        />
                        <span className="absolute right-1.5 text-[10px] text-gray-400 pointer-events-none">%</span>
                      </div>
                    )}
                  </td>
                );
              })}
              <td className="px-2 py-2 text-center bg-indigo-50/50 tabular-nums whitespace-nowrap">
                {fy26RatioSum > 0
                  ? <span className="text-indigo-600 text-[11px] font-semibold">{Math.round(fy26RatioSum)}%</span>
                  : <span className="text-gray-300">–</span>}
              </td>
              <td className="px-2 py-2 text-center bg-gray-50 tabular-nums">
                {totalRatioSum > 0
                  ? <span className={`text-[11px] font-semibold ${Math.round(totalRatioSum) === 100 ? 'text-gray-500' : 'text-amber-500'}`}>
                      {Math.round(totalRatioSum)}%
                    </span>
                  : <span className="text-gray-300">–</span>}
              </td>
            </tr>

            {/* 증감율 vs 대응SKU 행 */}
            {(() => {
              const hasComp = Object.keys(compMonthlyData).length > 0;
              const calcRate = (planned: number, ref: number | undefined) =>
                ref !== undefined && ref > 0
                  ? Math.round(((planned - ref) / ref) * 100)
                  : null;

              const fy26Comp = MONTHS.filter((m) => !IS_NEXT_YEAR[m])
                .reduce((s, m) => s + (compMonthlyData[m] ?? 0), 0);
              const totalComp = MONTHS.reduce((s, m) => s + (compMonthlyData[m] ?? 0), 0);
              const fy26Rate = calcRate(fy26Qty, fy26Comp > 0 ? fy26Comp : undefined);
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
                  {MONTHS.map((m) => {
                    const ms = sku.monthlySplit.find((x) => x.month === m)!;
                    const disabled = isDisabled(m);
                    const rate = !disabled && hasComp
                      ? calcRate(ms.quantity, compMonthlyData[m])
                      : null;
                    return (
                      <td
                        key={m}
                        className={`px-2 py-2 text-center ${IS_NEXT_YEAR[m] ? 'bg-blue-50/20' : ''}`}
                      >
                        <RateBadge rate={rate} />
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center bg-indigo-50/50">
                    <RateBadge rate={fy26Rate} />
                  </td>
                  <td className="px-2 py-2 text-center bg-gray-50">
                    <RateBadge rate={totalRate} />
                  </td>
                </tr>
              );
            })()}

          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

// ── 채널×월 상세수량 테이블 (STEP2 값 읽기 전용 표시) ──────────────────────
function ChannelMonthTable({ sku, monthlySplit: _monthlySplit }: {
  sku: SkuData;
  readOnly: boolean;
  monthlySplit: SkuData['monthlySplit'];
  compChannelDist?: Record<string, number> | null;
}) {
  const [expandedChannels, setExpandedChannels] = useState<Set<Channel>>(new Set());

  const toggleChannel = (ch: Channel) =>
    setExpandedChannels((prev) => {
      const next = new Set(prev);
      next.has(ch) ? next.delete(ch) : next.add(ch);
      return next;
    });

  const getQty = (channel: Channel, month: Month) =>
    sku.channelMonthQty.find((e) => e.channel === channel && e.month === month)?.qty ?? 0;

  const channelTotal = (channel: Channel) =>
    MONTHS.reduce((sum, m) => sum + getQty(channel, m), 0);

  const monthTotal = (month: Month) =>
    CHANNELS.reduce((sum, ch) => sum + getQty(ch, month), 0);

  const channel26Total = (channel: Channel) =>
    MONTHS.filter((m) => !IS_NEXT_YEAR[m]).reduce((sum, m) => sum + getQty(channel, m), 0);

  const grandTotal = MONTHS.reduce((sum, m) => sum + monthTotal(m), 0);
  const grand26Total = MONTHS.filter((m) => !IS_NEXT_YEAR[m]).reduce((sum, m) => sum + monthTotal(m), 0);

  // 옵션 목록 계산
  // 컬러+사이즈 모두 있으면 "컬러 사이즈" 조합, 컬러만 있으면 컬러별, 없으면 사이즈별
  const activeSizes = sku.sizes.filter((s) => s.isActive && s.ratio > 0);
  const activeColors = sku.hasColors ? sku.colors.filter((c) => c.quantity > 0) : [];
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
    const total26 = channel26Total(channel);
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
            </div>
          </td>
          <td className="px-2 py-1.5 text-center tabular-nums text-[11px]">
            {ratio !== null && ratio > 0
              ? <span className="text-gray-500 font-medium">{ratio}%</span>
              : <span className="text-gray-300">–</span>}
          </td>
          {MONTHS.map((m) => {
            const qty = getQty(channel, m);
            return (
              <td key={m} className={`px-2 py-1.5 text-center tabular-nums text-[11px] ${IS_NEXT_YEAR[m] ? 'bg-blue-50/40' : ''}`}>
                {qty > 0
                  ? <span className="text-gray-700 font-medium">{qty.toLocaleString()}</span>
                  : <span className="text-gray-300">–</span>}
              </td>
            );
          })}
          <td className="px-2 py-1.5 text-center font-semibold tabular-nums text-indigo-700 bg-indigo-50/50 whitespace-nowrap text-[11px]">
            {total26 > 0 ? total26.toLocaleString() : <span className="text-gray-300">–</span>}
          </td>
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
              {MONTHS.map((m) => (
                <td key={m} className={`px-2 py-1 text-center text-[10px] font-medium text-gray-400 ${IS_NEXT_YEAR[m] ? 'bg-blue-50/30' : ''}`}>
                  {MONTH_LABELS[m]}
                </td>
              ))}
              <td className="px-2 py-1 text-center text-[10px] font-medium text-gray-400 bg-indigo-50/40">연간</td>
              <td className="px-2 py-1 text-center text-[10px] font-medium text-gray-400 bg-gray-200/50">합계</td>
            </tr>
            {optionRows.map((opt, i) => {
              const isLast = i === optionRows.length - 1;
              const opt26 = MONTHS.filter((m) => !IS_NEXT_YEAR[m])
                .reduce((s, m) => s + Math.round(getQty(channel, m) * opt.ratio), 0);
              const optTotal = MONTHS.reduce((s, m) => s + Math.round(getQty(channel, m) * opt.ratio), 0);
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
                  {MONTHS.map((m) => {
                    const qty = Math.round(getQty(channel, m) * opt.ratio);
                    return (
                      <td key={m} className={`px-2 py-1 text-center tabular-nums text-[10px] ${IS_NEXT_YEAR[m] ? 'bg-blue-50/20' : ''}`}>
                        {qty > 0
                          ? <span className="text-gray-600">{qty.toLocaleString()}</span>
                          : <span className="text-gray-300">–</span>}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-center tabular-nums text-[10px] text-gray-600 bg-indigo-50/30">
                    {opt26 > 0 ? opt26.toLocaleString() : <span className="text-gray-300">–</span>}
                  </td>
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
            {MONTHS.map((m) => (
              <th
                key={m}
                className={`px-1 py-2 text-center font-semibold whitespace-nowrap text-[11px] ${IS_NEXT_YEAR[m] ? 'text-blue-600 bg-blue-50/60' : 'text-gray-600'}`}
              >
                {MONTH_LABELS[m]}
                {IS_NEXT_YEAR[m] && (
                  <div className="text-[10px] text-blue-400 font-normal leading-tight">27년</div>
                )}
              </th>
            ))}
            <th className="px-2 py-2 text-center text-indigo-700 font-semibold bg-indigo-100/70 whitespace-nowrap text-[11px]">26년 연간</th>
            <th className="px-2 py-2 text-center text-gray-600 font-semibold bg-gray-100 whitespace-nowrap text-[11px]">합계</th>
          </tr>
        </thead>
        <tbody>
          {/* B2C 그룹 */}
          <tr className="bg-sky-50/60 border-b border-sky-200">
            <td colSpan={2 + MONTHS.length + 2} className="px-3 py-0.5">
              <span className="text-[10px] font-bold text-sky-600 tracking-wide uppercase">B2C</span>
            </td>
          </tr>
          {B2C_CHANNELS.map((ch) => renderChannelRow(ch, 'hover:bg-sky-50/30'))}
          {/* B2B 그룹 */}
          <tr className="bg-violet-50/60 border-b border-violet-200">
            <td colSpan={2 + MONTHS.length + 2} className="px-3 py-0.5">
              <span className="text-[10px] font-bold text-violet-600 tracking-wide uppercase">B2B</span>
            </td>
          </tr>
          {B2B_CHANNELS.map((ch) => renderChannelRow(ch, 'hover:bg-violet-50/30'))}
        </tbody>
        <tfoot>
          <tr className="bg-indigo-50 border-t-2 border-indigo-200">
            <td colSpan={2} className="px-3 py-2 font-semibold text-indigo-800 whitespace-nowrap text-[11px]">합계</td>
            {MONTHS.map((m) => {
              const total = monthTotal(m);
              return (
                <td
                  key={m}
                  className={`px-1 py-2 text-center font-semibold tabular-nums text-indigo-700 whitespace-nowrap text-[11px] ${IS_NEXT_YEAR[m] ? 'bg-blue-100/40' : ''}`}
                >
                  {total > 0 ? total.toLocaleString() : <span className="text-indigo-300">–</span>}
                </td>
              );
            })}
            <td className="px-2 py-2 text-center font-semibold tabular-nums text-indigo-700 bg-indigo-100/70 whitespace-nowrap text-[11px]">
              {grand26Total > 0 ? grand26Total.toLocaleString() : <span className="text-indigo-300">–</span>}
            </td>
            <td className="px-2 py-2 text-center font-semibold tabular-nums text-indigo-800 bg-indigo-100 whitespace-nowrap text-[11px]">
              {grandTotal > 0 ? grandTotal.toLocaleString() : <span className="text-indigo-300">–</span>}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
    </div>
  );
}

// ── STEP 2 판매가 시나리오 정의 ──────────────────────────────────────────
interface PricingScenario {
  id: string;
  label: string;
  /** 드롭다운 괄호 힌트. 지정 시 % 계산 대신 이 텍스트를 표시 */
  hint?: string;
  /** 채널 판매가(base)와 환율을 받아 KRW 시나리오 가격 반환 */
  calcKrwPrice: (base: number, usdRate?: number, jpyRate?: number) => number;
  /** 외화 보조 표시: 원화 환산 전 외화 금액 반환 */
  foreignAmt?: (base: number, usdRate?: number, jpyRate?: number) => { symbol: string; amount: number; decimals: number } | null;
}

/** 비율 계산 결과를 10원 단위 버림 */
const floor10 = (x: number) => Math.floor(x / 10) * 10;

/**
 * 오픈특가: 판매가 기준 상시 운영(20% 할인)보다 저렴하며 900원 단위로 끝나는 가격
 * 예) 20% 할인가 9,520 → 8,900
 */
const calcOpenSpecialPrice = (base: number): number => {
  const twentyOff = floor10(base * 0.80);
  return Math.floor((twentyOff - 901) / 1000) * 1000 + 900;
};

const PRICING_SCENARIOS: PricingScenario[] = [
  { id: '오픈특가',        label: '오픈특가',        hint: '특가최대-900단위',  calcKrwPrice: (b) => calcOpenSpecialPrice(b) },
  { id: '신상위크',        label: '신상위크',        hint: '오픈특가-천원',     calcKrwPrice: (b) => Math.max(0, calcOpenSpecialPrice(b) - 1000) },
  { id: '신상위크 라이브', label: '신상위크 라이브', hint: '신상위크-천원',     calcKrwPrice: (b) => Math.max(0, calcOpenSpecialPrice(b) - 2000) },
  { id: '선단독',          label: '선단독',          hint: '오픈특가-천원',     calcKrwPrice: (b) => Math.max(0, calcOpenSpecialPrice(b) - 1000) },
  { id: '상시 최대할인율', label: '상시 최대할인율',                            calcKrwPrice: (b) => floor10(b * 0.85) },
  { id: '특가 최대할인율', label: '특가 최대할인율',                            calcKrwPrice: (b) => floor10(b * 0.80) },
  { id: '시즌오프(의류전용)', label: '시즌오프(의류전용)',                       calcKrwPrice: (b) => floor10(b * 0.75) },
  { id: 'B2B 오픈 할인',   label: 'B2B 오픈 할인',                             calcKrwPrice: (b) => floor10(b * 0.65 * 0.90) },
  { id: 'B2B 상시 운영',   label: 'B2B 상시 운영',                             calcKrwPrice: (b) => floor10(b * 0.65) },
  { id: '사입 공급가',     label: '사입 공급가',                               calcKrwPrice: (b) => floor10(b * 0.50) },
  {
    id: '글로벌 공급가', label: '글로벌 공급가', hint: 'USD 공급가',
    // (판매가 / 1250 * 1.6) / 2 * USDKRW — sku.pricingUsdRate 사용
    calcKrwPrice: (b, usdRate = 1400) => floor10((b / 1250 * 1.6) / 2 * usdRate),
    foreignAmt: (b) => ({ symbol: 'USD $', amount: Math.round((b / 1250 * 1.6) / 2 * 100) / 100, decimals: 2 }),
  },
  {
    id: '일본 공급가', label: '일본 공급가', hint: 'JPY 공급가',
    // JPY공급가 = (판매가 / jpyKrw * 1.3) / 2  →  KRW환산 = JPY공급가 * jpyKrw = 판매가 * 0.65
    calcKrwPrice: (b, _usd, jpyRate = 9.0) => floor10((b / jpyRate * 1.3) / 2 * jpyRate),
    foreignAmt: (b, _usd, jpyRate = 9.0) => ({ symbol: 'JPY ¥', amount: Math.round((b / jpyRate * 1.3) / 2), decimals: 0 }),
  },
];

// ── STEP 2 채널별 목표량 테이블 ──────────────────────────────────────────
function PricingChannelTable({
  sku, readOnly,
  pricingOpts, setPricingOpts,
  onTotalsChange,
  onBeforeEdit,
  varCostByChannel = {},
  compChannelYM,
  compMode,
  compModeLabel,
  step2Baseline,
}: {
  sku: SkuData;
  readOnly: boolean;
  pricingOpts: Record<string, string>;
  setPricingOpts: Dispatch<SetStateAction<Record<string, string>>>;
  onTotalsChange?: (totals: { revenue: number; profit: number }) => void;
  onBeforeEdit?: () => void;
  varCostByChannel?: Record<string, number>;
  compChannelYM?: ChannelByYearMonth | null;
  compMode?: 'rolling12' | 'samePeriod';
  compModeLabel?: string;
  step2Baseline?: SkuData['channelMonthQty'] | null;
}) {
  const updateChannelMonthQty = useStore((s) => s.updateChannelMonthQty);
  const persistSku = useStore((s) => s.persistSku);
  const [expandedChannels, setExpandedChannels] = useState<Set<Channel>>(new Set());
  // 채널별 일괄반영 선택값 (UI-only, 로컬)
  const [channelBulkOpt, setChannelBulkOpt] = useState<Partial<Record<Channel, string>>>({});
  const { usdKrw, jpyKrw, isLive } = useExchangeRates();;

  const toggleChannel = (channel: Channel) => {
    setExpandedChannels((prev) => {
      const next = new Set(prev);
      next.has(channel) ? next.delete(channel) : next.add(channel);
      return next;
    });
  };

  const DEFAULT_OPT: Partial<Record<Channel, string>> = {
    '쿠팡': 'B2B 상시 운영',
    'B2B': 'B2B 상시 운영',
    '사입및페어': 'B2B 상시 운영',
    '글로벌': '글로벌 공급가',
    '일본': '일본 공급가',
  };

  const getPricingOpt = (channel: Channel, month: Month) =>
    pricingOpts[`${channel}-${month}`] ?? DEFAULT_OPT[channel] ?? '';

  const setPricingOpt = (channel: Channel, month: Month, optId: string) =>
    setPricingOpts((prev) => ({ ...prev, [`${channel}-${month}`]: optId }));

  // 대응SKU 채널×월 비교 수량 (compMode에 따라 year 매핑)
  const releaseYear = sku.releaseDate ? parseInt(sku.releaseDate.split('-')[0], 10) : null;
  const getCompQty = (channel: Channel, month: Month): number | null => {
    if (!compChannelYM) return null;
    const byYM = compChannelYM[channel];
    if (!byYM) return null;
    const isNextYr = IS_NEXT_YEAR[month];
    if (compMode === 'samePeriod') {
      const lookupYear = isNextYr ? releaseYear : (releaseYear ? releaseYear - 1 : null);
      if (!lookupYear) return null;
      return byYM[lookupYear]?.[month] ?? null;
    } else {
      const allYears = Object.keys(byYM).map(Number).sort((a, b) => b - a);
      for (const y of allYears) {
        if (byYM[y]?.[month] !== undefined) return byYM[y][month];
      }
      return null;
    }
  };

  /** basePrice 기준으로 시나리오 KRW 가격을 반환 (시나리오 없으면 base 그대로) */
  const calcScenarioPrice = (optId: string, base: number): number => {
    if (!optId) return base;
    const s = PRICING_SCENARIOS.find((x) => x.id === optId);
    return s ? s.calcKrwPrice(base, usdKrw, jpyKrw) : base;
  };

  const getPricing = (channel: Channel): ChannelPricing => {
    const found = sku.channelPricing?.find((cp) => cp.channel === channel);
    return found ?? { channel, price: 0, commissionRate: DEFAULT_CHANNEL_COMMISSION[channel] };
  };

  const getMonthQty = (channel: Channel, month: Month) =>
    sku.channelMonthQty.find((e) => e.channel === channel && e.month === month)?.qty ?? 0;

  const getChannelQty = (channel: Channel) =>
    MONTHS.reduce((sum, m) => sum + getMonthQty(channel, m), 0);

  const calcRow = (channel: Channel) => {
    const cp = getPricing(channel);
    const effectivePrice = cp.price > 0 ? cp.price : sku.price;
    const qty = getChannelQty(channel);
    // 실매출단가 = 월별 (수량 × 시나리오가격) 합계 / 총수량 (수수료 미반영)
    const netPrice = qty > 0
      ? Math.round(
          MONTHS.reduce((s, m) => {
            const mQty = getMonthQty(channel, m);
            const opt = getPricingOpt(channel, m);
            return s + calcScenarioPrice(opt, effectivePrice) * mQty;
          }, 0) / qty,
        )
      : effectivePrice;
    const revenue = Math.round(netPrice / 1.1 * qty);
    // 공헌이익 = 순매출 − 원가 − 변동비(Tableau 역산, fallback 25%)
    const varRatio = varCostByChannel[channel] ?? 0.25;
    const profit = Math.round(revenue * (1 - varRatio) - sku.cost * qty);
    const cm = revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null;
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
      return { qty: acc.qty + r.qty, revenue: acc.revenue + r.revenue, profit: acc.profit + r.profit };
    },
    { qty: 0, revenue: 0, profit: 0 },
  );
  const totalCm = totals.revenue > 0 ? Math.round((totals.profit / totals.revenue) * 1000) / 10 : null;

  useEffect(() => {
    onTotalsChange?.({ revenue: totals.revenue, profit: totals.profit });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals.revenue, totals.profit]);

  const weightedAvgPrice = totals.qty > 0
    ? Math.round(allChannelRows.reduce((acc, ch) => {
        const r = calcRow(ch);
        return acc + r.netPrice * r.qty;
      }, 0) / totals.qty)
    : null;

  const renderGroup = (channels: readonly Channel[], groupLabel: string, groupColor: string) => (
    <>
      <tr className={`border-b ${groupColor}`}>
        <td colSpan={7} className="px-3 py-0.5">
          <span className="text-[10px] font-bold tracking-wide uppercase" style={{ color: 'inherit' }}>{groupLabel}</span>
        </td>
      </tr>
      {channels.map((channel) => {
        const cp = getPricing(channel);
        const { netPrice, qty, revenue, profit, cm } = calcRow(channel);
        const isExpanded = expandedChannels.has(channel);
        const channelMonthTotal = MONTHS.reduce((s, m) => s + getMonthQty(channel, m), 0);
        const displayQty = channelMonthTotal > 0 ? channelMonthTotal : qty;
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
                </button>
              </td>
              {/* 채널 비중 */}
              <td className={`px-2 py-1.5 text-center tabular-nums text-[11px] truncate ${isExpanded ? 'font-bold text-indigo-600' : 'text-gray-500'}`}>
                {totals.qty > 0 && displayQty > 0
                  ? `${Math.round((displayQty / totals.qty) * 100)}%`
                  : <span className="text-gray-300">–</span>}
              </td>
              {/* 총수량 — 토글 입력값 합산 */}
              <td className={`px-2 py-1.5 text-right tabular-nums text-[11px] truncate ${isExpanded ? 'font-bold text-indigo-700' : 'font-medium text-gray-700'}`}>
                {displayQty > 0 ? displayQty.toLocaleString() : <span className="text-gray-300">–</span>}
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
                {profit > 0 ? formatWon(profit) : profit < 0 ? <span className="text-red-500">{formatWon(Math.abs(profit))}</span> : <span className="text-gray-300">–</span>}
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
              const FY26 = MONTHS.filter((m) => !IS_NEXT_YEAR[m]);
              const FY27 = MONTHS.filter((m) => IS_NEXT_YEAR[m]);
              const yearBorder = (m: Month) => IS_NEXT_YEAR[m] && !IS_NEXT_YEAR[MONTHS[MONTHS.indexOf(m) - 1] as Month] ? 'border-l-2 border-gray-400' : '';
              const labelCell = 'px-3 py-2 border-r border-gray-200 bg-gray-100 whitespace-nowrap';
              const totalCell = 'px-3 py-2 text-right tabular-nums text-[11px] font-bold whitespace-nowrap border-l border-gray-200 bg-gray-100';
              // 옵션별 비중 계산 (STEP3와 동일 로직)
              const activeSizes = sku.sizes.filter((s) => s.isActive && s.ratio > 0);
              const activeColors = sku.hasColors ? sku.colors.filter((c) => c.quantity > 0) : [];
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
                  <td colSpan={7} className="px-4 py-3">
                    {/* 일괄 적용 툴바 */}
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="text-[11px] font-semibold text-gray-500 whitespace-nowrap">판매가 일괄 설정</span>
                      <select
                        value={channelBulkOpt[channel] ?? ''}
                        onChange={(e) => setChannelBulkOpt((prev) => ({ ...prev, [channel]: e.target.value }))}
                        className="text-[11px] rounded border border-gray-300 px-1.5 py-0.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400"
                      >
                        <option value="">-- 전략 선택 --</option>
                        {PRICING_SCENARIOS.map((s) => {
                          const bPrice = cp.price > 0 ? cp.price : sku.price;
                          const suffix = s.hint ?? (bPrice > 0 ? `${Math.round((1 - s.calcKrwPrice(bPrice) / bPrice) * 100)}%` : '');
                          return <option key={s.id} value={s.id}>{s.label} ({suffix})</option>;
                        })}
                      </select>
                      <button
                        onClick={() => {
                          onBeforeEdit?.();
                          const opt = channelBulkOpt[channel] ?? '';
                          setPricingOpts((prev) => {
                            const next = { ...prev };
                            MONTHS.forEach((m) => { next[`${channel}-${m}`] = opt; });
                            return next;
                          });
                        }}
                        disabled={!channelBulkOpt[channel]}
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
                              {MONTHS.map((m) => (
                                <th key={m} className={`px-2 py-2 text-center font-bold whitespace-nowrap ${yearBorder(m)} ${IS_NEXT_YEAR[m] ? 'text-gray-500 bg-gray-200/60' : 'text-gray-600'}`} style={{ minWidth: '76px' }}>
                                  <div className="text-[13px]">{MONTH_LABELS[m]}</div>
                                  {IS_NEXT_YEAR[m] && <div className="text-[9px] text-gray-400 font-normal">27년</div>}
                                </th>
                              ))}
                              <th className="px-3 py-2 text-center text-[11px] font-bold text-gray-500 whitespace-nowrap border-l-2 border-gray-300 bg-gray-200/50" style={{ minWidth: '72px' }}>26년<br/>합계</th>
                              <th className="px-3 py-2 text-center text-[11px] font-bold text-gray-400 whitespace-nowrap border-l border-gray-200 bg-gray-200/50" style={{ minWidth: '72px' }}>27년<br/>합계</th>
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
                                {MONTHS.map((m) => {
                                  const compQty = getCompQty(channel, m);
                                  return (
                                    <td key={m} className={`px-2 py-0.5 text-right tabular-nums ${yearBorder(m)} ${IS_NEXT_YEAR[m] ? 'bg-gray-300/20' : ''}`}>
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
                                <td className="px-3 py-0.5 text-right tabular-nums border-l border-gray-300 bg-gray-400/20 whitespace-nowrap">
                                  {(() => {
                                    const t = FY27.reduce((s, m) => s + (getCompQty(channel, m) ?? 0), 0);
                                    return t > 0 ? <span className="text-[10px] font-semibold text-gray-500">{t.toLocaleString()}</span> : <span className="text-[10px] text-gray-300">–</span>;
                                  })()}
                                </td>
                              </tr>
                            )}
                            {/* 수량 행 */}
                            <tr className="border-b border-gray-100 bg-white">
                              <td className={labelCell}>
                                <span className="text-[11px] font-bold text-gray-600">수량</span>
                              </td>
                              {MONTHS.map((m) => {
                                const compQty = getCompQty(channel, m);
                                const monthQtyVal = getMonthQty(channel, m);
                                const growthRate = compQty && compQty > 0
                                  ? ((monthQtyVal - compQty) / compQty * 100)
                                  : null;
                                const baseQty = step2Baseline?.find(e => e.channel === channel && e.month === m)?.qty ?? null;
                                const diff = baseQty !== null ? monthQtyVal - baseQty : null;
                                return (
                                  <td key={m} className={`px-1 py-1 ${yearBorder(m)} ${IS_NEXT_YEAR[m] ? 'bg-gray-50/60' : ''}`}>
                                    <div className="flex flex-col items-center gap-0">
                                      <div className="flex items-center gap-0.5">
                                        <NumericInput
                                          value={monthQtyVal}
                                          onChange={(val) => updateChannelMonthQty(sku.id, channel, m, val)}
                                          onBlur={() => persistSku(sku.id)}
                                          onFocus={() => onBeforeEdit?.()}
                                          disabled={readOnly || (DISABLED_CHANNELS as readonly string[]).includes(channel)}
                                          placeholder="0"
                                          className={`text-right rounded-md px-1 py-1 text-[11px] border focus:outline-none focus:ring-1 focus:ring-gray-400 ${
                                            readOnly || (DISABLED_CHANNELS as readonly string[]).includes(channel) ? 'bg-gray-50 text-gray-400 cursor-not-allowed border-gray-200' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
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
                              <td className={`${totalCell} text-gray-500`}>
                                {(() => { const t = FY27.reduce((s, m) => s + getMonthQty(channel, m), 0); return t > 0 ? t.toLocaleString() : <span className="text-gray-300">–</span>; })()}
                              </td>
                            </tr>
                            {/* 판매가 설정 행 */}
                            <tr className="border-b border-gray-100 bg-gray-50/50">
                              <td className={labelCell}>
                                <span className="text-[11px] font-bold text-gray-600">판매가 설정</span>
                              </td>
                              {MONTHS.map((m) => {
                                const optId = getPricingOpt(channel, m);
                                const basePrice = cp.price > 0 ? cp.price : sku.price;
                                return (
                                  <td key={m} className={`px-1.5 py-1.5 ${yearBorder(m)} ${IS_NEXT_YEAR[m] ? 'bg-gray-50/60' : ''}`}>
                                    <select
                                      value={optId}
                                      onChange={(e) => { onBeforeEdit?.(); setPricingOpt(channel, m, e.target.value); }}
                                      className="w-full text-[10px] rounded border border-gray-200 px-1 py-0.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400 hover:border-gray-400"
                                    >
                                      <option value="">채널가</option>
                                      {PRICING_SCENARIOS.map((s) => {
                                        const suffix = s.hint ?? (basePrice > 0 ? `${Math.round((1 - s.calcKrwPrice(basePrice) / basePrice) * 100)}%` : '');
                                        return <option key={s.id} value={s.id}>{s.label} ({suffix})</option>;
                                      })}
                                    </select>
                                  </td>
                                );
                              })}
                              <td className="border-l-2 border-gray-300 bg-gray-100" />
                              <td className="border-l border-gray-200 bg-gray-100" />
                            </tr>
                            {/* 실 판매가 행 */}
                            <tr className="border-b-2 border-gray-200 bg-white">
                              <td className={labelCell}>
                                <span className="text-[11px] font-semibold text-gray-500">실 판매가</span>
                                <span className={`block text-[9px] mt-0.5 ${isLive ? 'text-indigo-300' : 'text-gray-300'}`}>
                                  ${usdKrw.toLocaleString()} · ¥{jpyKrw.toFixed(1)}
                                </span>
                              </td>
                              {MONTHS.map((m) => {
                                const optId = getPricingOpt(channel, m);
                                const basePrice = cp.price > 0 ? cp.price : sku.price;
                                const scenarioKrwPrice = calcScenarioPrice(optId, basePrice);
                                const scenario = PRICING_SCENARIOS.find((x) => x.id === optId);
                                const foreign = scenario?.foreignAmt?.(basePrice, usdKrw, jpyKrw) ?? null;
                                return (
                                  <td key={m} className={`px-2 py-2 text-right tabular-nums ${yearBorder(m)} ${IS_NEXT_YEAR[m] ? 'bg-gray-50/60' : ''}`}>
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
                              <td className="border-l border-gray-200 bg-gray-100" />
                            </tr>
                            {/* 예상 순매출 행 */}
                            <tr className="border-b border-blue-100 bg-blue-50/50">
                              <td className="px-3 py-2 border-r border-blue-200 bg-blue-100/70 whitespace-nowrap">
                                <span className="text-[11px] font-bold text-blue-700">예상 순매출</span>
                              </td>
                              {MONTHS.map((m) => {
                                const optId = getPricingOpt(channel, m);
                                const basePrice = cp.price > 0 ? cp.price : sku.price;
                                const scenarioKrwPrice = calcScenarioPrice(optId, basePrice);
                                const monthQty = getMonthQty(channel, m);
                                const netRevenue = Math.round(scenarioKrwPrice / 1.1 * monthQty);
                                return (
                                  <td key={m} className={`px-2 py-2 text-right tabular-nums text-[11px] font-semibold text-blue-700 ${yearBorder(m)} ${IS_NEXT_YEAR[m] ? 'bg-blue-50/40' : ''}`}>
                                    {netRevenue > 0 ? formatWon(netRevenue) : <span className="text-blue-200">–</span>}
                                  </td>
                                );
                              })}
                              <td className="px-3 py-2 text-right tabular-nums text-[11px] font-bold text-blue-700 border-l-2 border-blue-300 bg-blue-100/70 whitespace-nowrap">
                                {(() => {
                                  const t = FY26.reduce((s, m) => {
                                    const base = cp.price > 0 ? cp.price : sku.price;
                                    const sp = calcScenarioPrice(getPricingOpt(channel, m), base);
                                    return s + Math.round(sp / 1.1 * getMonthQty(channel, m));
                                  }, 0);
                                  return t > 0 ? formatWon(t) : <span className="text-blue-200">–</span>;
                                })()}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-[11px] font-bold text-blue-600 border-l border-blue-200 bg-blue-100/70 whitespace-nowrap">
                                {(() => {
                                  const t = FY27.reduce((s, m) => {
                                    const base = cp.price > 0 ? cp.price : sku.price;
                                    const sp = calcScenarioPrice(getPricingOpt(channel, m), base);
                                    return s + Math.round(sp / 1.1 * getMonthQty(channel, m));
                                  }, 0);
                                  return t > 0 ? formatWon(t) : <span className="text-blue-200">–</span>;
                                })()}
                              </td>
                            </tr>
                            {/* 예상 공헌이익 행 */}
                            <tr className="bg-emerald-50/50">
                              <td className={`${labelCell} border-r-emerald-200`}>
                                <span className="text-[11px] font-bold text-emerald-700">예상 공헌이익</span>
                              </td>
                              {MONTHS.map((m) => {
                                const optId = getPricingOpt(channel, m);
                                const basePrice = cp.price > 0 ? cp.price : sku.price;
                                const scenarioKrwPrice = calcScenarioPrice(optId, basePrice);
                                const monthQty = getMonthQty(channel, m);
                                const netRevenue = Math.round(scenarioKrwPrice / 1.1 * monthQty);
                                const varRatio = varCostByChannel[channel] ?? 0.25;
                                const monthContrib = Math.round(netRevenue * (1 - varRatio) - sku.cost * monthQty);
                                return (
                                  <td key={m} className={`px-2 py-2 text-right tabular-nums text-[11px] font-semibold ${yearBorder(m)} ${IS_NEXT_YEAR[m] ? 'bg-emerald-50/30' : ''}`}>
                                    {monthQty > 0
                                      ? monthContrib >= 0
                                        ? <span className="text-emerald-700">{formatWon(monthContrib)}</span>
                                        : <span className="text-red-500">-{formatWon(Math.abs(monthContrib))}</span>
                                      : <span className="text-gray-300">–</span>}
                                  </td>
                                );
                              })}
                              <td className={`${totalCell} border-l-2 border-gray-300`}>
                                {(() => {
                                  const t = FY26.reduce((s, m) => {
                                    const base = cp.price > 0 ? cp.price : sku.price;
                                    const sp = calcScenarioPrice(getPricingOpt(channel, m), base);
                                    const mQty = getMonthQty(channel, m);
                                    const rev = Math.round(sp / 1.1 * mQty);
                                    const vr = varCostByChannel[channel] ?? 0.25;
                                    return s + Math.round(rev * (1 - vr) - sku.cost * mQty);
                                  }, 0);
                                  if (FY26.every((m) => getMonthQty(channel, m) === 0)) return <span className="text-gray-300">–</span>;
                                  return t >= 0 ? <span className="text-emerald-700">{formatWon(t)}</span> : <span className="text-red-500">-{formatWon(Math.abs(t))}</span>;
                                })()}
                              </td>
                              <td className={`${totalCell}`}>
                                {(() => {
                                  const t = FY27.reduce((s, m) => {
                                    const base = cp.price > 0 ? cp.price : sku.price;
                                    const sp = calcScenarioPrice(getPricingOpt(channel, m), base);
                                    const mQty = getMonthQty(channel, m);
                                    const rev = Math.round(sp / 1.1 * mQty);
                                    const vr = varCostByChannel[channel] ?? 0.25;
                                    return s + Math.round(rev * (1 - vr) - sku.cost * mQty);
                                  }, 0);
                                  if (FY27.every((m) => getMonthQty(channel, m) === 0)) return <span className="text-gray-300">–</span>;
                                  return t >= 0 ? <span className="text-emerald-600">{formatWon(t)}</span> : <span className="text-red-500">-{formatWon(Math.abs(t))}</span>;
                                })()}
                              </td>
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
                                {MONTHS.map((m) => (
                                  <th key={m} className={`px-2 py-1.5 text-center font-semibold whitespace-nowrap text-[11px] ${yearBorder(m)} ${IS_NEXT_YEAR[m] ? 'text-gray-500 bg-gray-200/60' : 'text-gray-500'}`} style={{ minWidth: '52px' }}>
                                    {MONTH_LABELS[m]}
                                  </th>
                                ))}
                                <th className="px-2 py-1.5 text-center text-[10px] font-semibold text-indigo-600 whitespace-nowrap border-l-2 border-gray-300 bg-indigo-50/60">FY26</th>
                                <th className="px-2 py-1.5 text-center text-[10px] font-semibold text-gray-500 whitespace-nowrap border-l border-gray-200 bg-gray-100/80">FY27</th>
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
                                    {MONTHS.map((m) => {
                                      const qty = Math.round(getMonthQty(channel, m) * opt.ratio);
                                      return (
                                        <td key={m} className={`px-2 py-1.5 text-center tabular-nums text-[11px] ${yearBorder(m)} ${IS_NEXT_YEAR[m] ? 'bg-blue-50/20' : ''}`}>
                                          {qty > 0 ? <span className="text-gray-700">{qty.toLocaleString()}</span> : <span className="text-gray-300">–</span>}
                                        </td>
                                      );
                                    })}
                                    <td className="px-2 py-1.5 text-center tabular-nums text-[11px] text-indigo-600 border-l-2 border-gray-300 bg-indigo-50/30">
                                      {optFY26 > 0 ? optFY26.toLocaleString() : <span className="text-gray-300">–</span>}
                                    </td>
                                    <td className="px-2 py-1.5 text-center tabular-nums text-[11px] text-gray-600 border-l border-gray-200 bg-gray-100/50">
                                      {optFY27 > 0 ? optFY27.toLocaleString() : <span className="text-gray-300">–</span>}
                                    </td>
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
          <col style={{ width: '20%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '17%' }} />
          <col style={{ width: '17%' }} />
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
            <th className="px-2 py-2 text-center text-indigo-600 font-semibold truncate">CM%</th>
          </tr>
        </thead>
        <tbody>
          {renderGroup(B2C_CHANNELS, 'B2C', 'bg-sky-50/60 border-sky-200 text-sky-600')}
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
            <td className="px-2 py-2 text-right font-semibold tabular-nums text-emerald-700 text-[11px] whitespace-nowrap">
              {totals.profit > 0 ? formatWon(totals.profit) : '–'}
            </td>
            <td className="px-2 py-2 text-right whitespace-nowrap">
              {totalCm !== null ? (
                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${cmBadgeCls(totalCm)}`}>{totalCm}%</span>
              ) : '–'}
            </td>
          </tr>
          <tr className="border-t border-gray-100">
            <td colSpan={7} className="px-3 py-1.5 text-[10px] text-gray-400">
              실매출단가 = ∑(월수량×시나리오가격) ÷ 총수량 &nbsp;·&nbsp; 공헌이익 = 순매출 − 변동비 − 원가×수량 &nbsp;*변동비는 해당 카테고리의 대응SKU 동기간 평균 변동비 비중으로 계산됩니다. 대응SKU 없을 시 25%로 임의계산됩니다.
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
    </div>
  );
}
