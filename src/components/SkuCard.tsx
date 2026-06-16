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
import { MarketingBriefModal } from './MarketingBriefModal';
import { PricingModal } from './PricingModal';
import { exportSimulationXlsx } from '../utils/exportXlsx';
import { PRICING_SCENARIOS, PRICING_DEFAULT_OPT } from '../utils/pricingScenarios';

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

// 채널 → 확정 그룹 매핑 (플랫폼/브랜드/글로벌)
const CHANNEL_CONFIRM_GROUP: Partial<Record<string, { field: 'platformConfirmed' | 'brandConfirmed' | 'globalConfirmed'; label: string }>> = {
  '자사몰': { field: 'platformConfirmed', label: '플랫폼' },
  '스스':   { field: 'brandConfirmed',    label: '브랜드' },
  '위탁':   { field: 'brandConfirmed',    label: '브랜드' },
  'B2B':    { field: 'brandConfirmed',    label: '브랜드' },
  '일본':   { field: 'globalConfirmed',   label: '글로벌' },
  '글로벌': { field: 'globalConfirmed',   label: '글로벌' },
};

/** 해당 채널이 속한 그룹이 확정됐는지 */
function isChannelLocked(sku: SkuData, channel: string): boolean {
  const group = CHANNEL_CONFIRM_GROUP[channel];
  return !!(group && sku[group.field]);
}

/** 확정된 그룹 레이블 목록 반환 (빈 배열이면 모두 미확정) */
function lockedGroupLabels(sku: SkuData, channels: readonly string[]): string[] {
  return [...new Set(
    channels
      .map(ch => CHANNEL_CONFIRM_GROUP[ch])
      .filter((g): g is NonNullable<typeof g> => !!g && !!sku[g.field])
      .map(g => g.label),
  )];
}

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
  const { role } = useAuth();
  const canEdit = role === 'master' || role === 'pm';
  const isFinalized = !!sku.finalOrderConfirmedAt;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);


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

          <button
            onClick={() => toggleExpanded(sku.id)}
            className="font-semibold text-gray-900 truncate flex-1 min-w-0 text-sm text-left hover:text-indigo-700 transition-colors"
          >
            {sku.name || '(SKU명 미입력)'}
          </button>

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
                title="이 SKU를 복사합니다"
                className="text-xs px-2 py-1 rounded-lg border border-sky-300 text-sky-700 bg-sky-50 hover:bg-sky-100 transition-colors"
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
          <div className="grid gap-4 grid-cols-1 md:grid-cols-[1fr_1.8fr_1.4fr]">
            {/* 열 1: 기본정보 */}
            <BasicInfoColumn sku={sku} readOnly={!canEdit} />
            {/* 열 2: 사이즈 분배 */}
            <SizeDistColumn sku={sku} readOnly={!canEdit || isFinalized} />
            {/* 열 3: 기존 SKU 비교 */}
            <ComparisonColumn
              sku={sku}
              readOnly={!canEdit}
              onComparisonDataChange={handleComparisonDataChange}
              onChannelDistChange={setCompChannelDist}
              onChannelYMDataChange={setCompChannelYM}
              step3Revenue={step3Totals?.revenue}
              step3Profit={step3Totals?.profit}
            />
          </div>
          <MonthlyTable
            sku={sku}
            readOnly={!canEdit}
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

// ── 날짜 입력 (yy.M.D 형식, 빈 칸에 포맷 힌트 없음) ─────────────────────────
function DateInputCompact({ value, onChange, onBlur, disabled }: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');

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

  const baseCls = 'flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed';

  return (
    <div className="flex items-center gap-1">
      {editing ? (
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          placeholder="yy.M.D"
          autoFocus
          className={`${baseCls} border-indigo-400 focus:ring-indigo-400`}
        />
      ) : (
        <button
          type="button"
          onClick={() => { if (!disabled) { setText(fmt(value)); setEditing(true); } }}
          disabled={disabled}
          className={`${baseCls} border-gray-200 text-left ${value ? 'text-gray-700' : 'text-gray-300'} hover:border-gray-300`}
        >
          {fmt(value) || '—'}
        </button>
      )}
      {!disabled && (
        <div className="relative flex-shrink-0">
          <button
            type="button"
            className="p-2 border border-gray-200 rounded-lg text-gray-400 hover:text-indigo-600 hover:border-indigo-300 transition-colors"
            tabIndex={-1}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          <input
            type="date"
            value={value}
            onChange={(e) => { onChange(e.target.value); onBlur(); }}
            className="absolute inset-0 opacity-0 cursor-pointer w-full"
            tabIndex={-1}
          />
        </div>
      )}
    </div>
  );
}

// ── 기본 정보 컬럼 ────────────────────────────────────────────────────────
function BasicInfoColumn({ sku, readOnly }: { sku: SkuData; readOnly?: boolean }) {
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);
  const [briefOpen, setBriefOpen] = useState(false);
  const [pricingModalOpen, setPricingModalOpen] = useState(false);

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
        <button
          onClick={() => setBriefOpen(true)}
          className={`mt-2 w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
            sku.marketingBrief
              ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Marketing Brief
          </span>
          {sku.marketingBrief && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-200 text-indigo-700 font-bold">●</span>
          )}
        </button>
        {briefOpen && <MarketingBriefModal sku={sku} onClose={() => setBriefOpen(false)} />}
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
          <label className="block text-xs text-gray-500 mb-1">입고예정일</label>
          <DateInputCompact
            value={sku.arrivalDate ?? ''}
            onChange={(v) => handleChange({ arrivalDate: v })}
            onBlur={handleBlur}
            disabled={readOnly}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">촬영예정일</label>
          <DateInputCompact
            value={sku.shootingDate ?? ''}
            onChange={(v) => handleChange({ shootingDate: v })}
            onBlur={handleBlur}
            disabled={readOnly}
          />
        </div>
      </div>

      {/* ── 프라이싱 구분 ── */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[11px] font-semibold text-gray-400 tracking-wide uppercase whitespace-nowrap">프라이싱</span>
        <div className="flex-1 h-px bg-gray-200" />
        {sku.isPriceConfirmed && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-700 text-[10px] font-bold whitespace-nowrap">
            🔒 가격 확정됨
          </span>
        )}
      </div>

      <button
        onClick={() => setPricingModalOpen(true)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-lg border transition-colors border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700"
      >
        <span className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a2 2 0 012-2z" />
          </svg>
          프라이싱 시나리오
        </span>
      </button>
      {pricingModalOpen && <PricingModal sku={sku} onClose={() => setPricingModalOpen(false)} />}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">판매가 (₩)</label>
          <NumericInput
            value={sku.price}
            onChange={(v) => handleChange({ price: v })}
            onBlur={handleBlur}
            disabled={readOnly || !!sku.isPriceConfirmed}
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
            disabled={readOnly || !!sku.isPriceConfirmed}
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

// STEP2 초기화 로직: 대응SKU 있으면 그 채널비중 사용, 없으면 DEFAULT_CHANNEL_RATIO_PCT 사용.
// 기준 총량 = STEP1 월별 합계 (비중 합이 100% 초과 가능). STEP1 미입력 시 totalOrderQty 사용.
// 월별 배분은 STEP1 monthlySplit 비율 기준 (없으면 균등 배분).
function buildChannelMonthEntries(
  compChannelDist: Record<string, number> | null | undefined,
  sku: SkuData,
): ChannelMonthQtyEntry[] {
  // STEP1 월별 수량 합산 — 비중 합이 100% 초과하면 totalOrderQty보다 클 수 있음
  const monthQtys = MONTHS.map((m) => sku.monthlySplit.find((ms) => ms.month === m)?.quantity ?? 0);
  const totalMonthly = monthQtys.reduce((s, q) => s + q, 0);

  // STEP1 합계를 기준으로 사용, 미입력이면 totalOrderQty fallback
  const baseQty = totalMonthly > 0 ? totalMonthly : sku.totalOrderQty;
  if (baseQty === 0) {
    return CHANNELS.flatMap((channel) => MONTHS.map((month) => ({ channel, month, qty: 0 })));
  }

  const isDisabledCh = (ch: string) => (DISABLED_CHANNELS as readonly string[]).includes(ch);
  const activeChannels = CHANNELS.filter((ch) => !isDisabledCh(ch));

  // 비활성 채널(쿠팡) 제외 후 합산 — 포함하면 해당 비중만큼 합계가 줄어드는 버그 방지
  const distTotal = compChannelDist
    ? activeChannels.reduce((s, ch) => s + (compChannelDist[ch] ?? 0), 0)
    : 0;
  // 기본값도 비활성 채널 제외 후 정규화
  const activeDefaultSum = activeChannels.reduce((s, ch) => s + DEFAULT_CHANNEL_RATIO_PCT[ch], 0);

  return CHANNELS.flatMap((channel) => {
    if (isDisabledCh(channel)) {
      return MONTHS.map((month) => ({ channel, month, qty: 0 }));
    }
    const channelRatio = compChannelDist && distTotal > 0
      ? (compChannelDist[channel] ?? 0) / distTotal
      : DEFAULT_CHANNEL_RATIO_PCT[channel] / activeDefaultSum;
    const channelTotal = Math.round(baseQty * channelRatio);

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
  // step2InitBaselineQty: store(Firestore) 영구 보존값 — React state 불필요

  // 팀카테 변동비 데이터 로드
  const [teamCateMap, setTeamCateMap] = useState<TeamCateMap | null>(null);
  useEffect(() => { fetchTeamCateData().then(setTeamCateMap).catch(() => {}); }, []);

  const releaseYear = sku.releaseDate ? parseInt(sku.releaseDate.split('-')[0], 10) : null;

  // 대응SKU 출고 데이터에서 직전12개월 기간 추출 (변동비 비중 기간 동기화용)
  const rolling12Periods = useMemo<{ year: number; month: number }[]>(() => {
    if (!compChannelYM || compMode !== 'rolling12') return [];
    const ymSet = new Set<string>();
    for (const byYM of Object.values(compChannelYM)) {
      for (const [yearNum, months] of Object.entries(byYM)) {
        for (const [monthNum, qty] of Object.entries(months as Record<string, number>)) {
          if (qty > 0) ymSet.add(`${yearNum}|${monthNum}`);
        }
      }
    }
    return [...ymSet]
      .map(s => { const [y, m] = s.split('|').map(Number); return { year: y, month: m }; })
      .sort((a, b) => a.year !== b.year ? b.year - a.year : b.month - a.month)
      .slice(0, 12);
  }, [compChannelYM, compMode]);

  const varCostResults = useMemo<Record<string, { ratio: number; isFallback: boolean }>>(() => {
    if (!teamCateMap) return {};
    const result: Record<string, { ratio: number; isFallback: boolean }> = {};
    for (const ch of [...B2C_CHANNELS, ...B2B_CHANNELS]) {
      const r = calcVariableCostRatio(
        teamCateMap, sku.category, ch, compMode,
        getReleaseMonth(sku.releaseDate), releaseYear,
        rolling12Periods.length > 0 ? rolling12Periods : undefined,
      );
      if (r !== null) result[ch] = r;
    }
    return result;
  }, [teamCateMap, sku.category, sku.releaseDate, compMode, releaseYear, rolling12Periods]);

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
  const batchInitChannelMonthQty = useStore((s) => s.batchInitChannelMonthQty);
  const setStep2InitBaseline = useStore((s) => s.setStep2InitBaseline);
  const persistSku = useStore((s) => s.persistSku);
  const setChannelConfirmed = useStore((s) => s.setChannelConfirmed);
  const { role } = useAuth();
  const canEdit = role === 'master' || role === 'pm';
  // STEP 1은 PM/master만 편집 가능
  const step1ReadOnly = readOnly || isMdRole(role);
  // STEP 2는 MD 역할도 편집 가능, 확정 여부와 무관하게 채널 편집 권한 보유 역할 수정 가능
  const step2ReadOnly = !canEdit && !isMdRole(role);

  // STEP2 탭 진입 시, channelMonthQty가 미초기화 상태면 대응SKU 채널 비중으로 자동 세팅
  useEffect(() => {
    if (activeTab !== 'pricing') return;
    // store 최신값으로 판단 — props sku가 stale할 수 있으므로
    const latestSku = useStore.getState().skus.find((s) => s.id === sku.id) ?? sku;
    const isUninitialized = latestSku.channelMonthQty.every((e) => e.qty === 0);
    if (isUninitialized) {
      // 신규 초기화: 대응SKU 채널 비중으로 자동 세팅
      const step1Total = latestSku.monthlySplit.reduce((s, ms) => s + ms.quantity, 0);
      if (step1Total === 0 && latestSku.totalOrderQty === 0) return;
      const entries = buildChannelMonthEntries(compChannelDist, latestSku);
      if (entries.every((e) => e.qty === 0)) return;
      batchInitChannelMonthQty(sku.id, entries);
      setStep2InitBaseline(sku.id, entries);
      persistSku(sku.id);
    } else if (!latestSku.step2InitBaselineQty || latestSku.step2InitBaselineQty.length === 0) {
      // 기존 데이터가 있지만 baseline이 없는 경우: 현재 값을 기준값으로 캡처
      setStep2InitBaseline(sku.id, latestSku.channelMonthQty);
      persistSku(sku.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, compChannelDist]);

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
          <div className="flex flex-col gap-0.5">
            <p className="text-[11px] text-gray-400">대응 SKU의 채널 비중으로 초기 세팅됩니다. 전략에 맞추어 월별 목표량을 수정해주세요.</p>
            <p className="text-[11px] text-gray-400">쿠팡 - 신상 미등록으로 대응SKU 실적 및 비중에서 제외.</p>
            <p className="text-[11px] text-gray-400">태블로 해외 출고량은 글로벌 40% 인케어 60% 임의 분배.</p>
            {(() => {
              if (!sku.finalOrderConfirmedAt) return null;
              const confirmedTotal = (sku.finalOrderQty as Record<string, number> | undefined)?.__confirmedStep2Total__;
              const step2Total = sku.channelMonthQty.reduce((s, e) => s + e.qty, 0);
              if (confirmedTotal === undefined || step2Total === confirmedTotal) return null;
              return (
                <p className="text-[11px] font-medium text-amber-600 mt-0.5">
                  ⚠ 발주량 변경됨 — 확정 {confirmedTotal.toLocaleString()}개 → 현재 {step2Total.toLocaleString()}개
                </p>
              );
            })()}
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-3">
            {/* MOQ 미달 배지 — 버튼 행 위 우측 */}
            {(() => {
              const step2Total = sku.channelMonthQty.reduce((s, e) => s + e.qty, 0);
              const step1Target = totalQty > 0 ? totalQty : sku.totalOrderQty;
              if (step2Total > 0 && step1Target > 0 && step2Total < step1Target) {
                return (
                  <span className="text-[10px] font-semibold text-white bg-red-500 px-2 py-0.5 rounded-full whitespace-nowrap">
                    * MOQ 미달! 수정하세요
                  </span>
                );
              }
              return null;
            })()}
            {/* 버튼 행 */}
            <div className="flex items-center gap-1.5">
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
                const step1Target = totalQty > 0 ? totalQty : sku.totalOrderQty;
                if (step2Total === 0 || step1Target === 0 || step2Total === step1Target) return null;
                return (
                  <button
                    onClick={() => {
                      const locked = lockedGroupLabels(sku, [...B2C_CHANNELS, ...B2B_CHANNELS]);
                      if (locked.length > 0) {
                        alert(`${locked.join(', ')} 채널 확정 취소 후 수정해주세요.`);
                        return;
                      }
                      captureStep2Backup();
                      const scaled = sku.channelMonthQty.map((e) => ({
                        ...e,
                        qty: (DISABLED_CHANNELS as readonly string[]).includes(e.channel)
                          ? 0
                          : Math.round(e.qty * step1Target / step2Total),
                      }));
                      batchInitChannelMonthQty(sku.id, scaled);
                      persistSku(sku.id);
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-lg border border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors whitespace-nowrap"
                  >
                    비례반영 ({step2Total.toLocaleString()} → {step1Target.toLocaleString()})
                  </button>
                );
              })()}
              <button
                onClick={() => {
                  const locked = lockedGroupLabels(sku, [...B2C_CHANNELS, ...B2B_CHANNELS]);
                  if (locked.length > 0) {
                    alert(`${locked.join(', ')} 채널 확정 취소 후 수정해주세요.`);
                    return;
                  }
                  captureStep2Backup();
                  const latestSku = useStore.getState().skus.find((s) => s.id === sku.id) ?? sku;
                  const entries = buildChannelMonthEntries(compChannelDist, latestSku);
                  batchInitChannelMonthQty(sku.id, entries);
                  setStep2InitBaseline(sku.id, entries);
                  persistSku(sku.id);
                }}
                className="text-[11px] px-2.5 py-1 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-500 transition-colors"
              >
                초기화
              </button>
              <button
                onClick={() => exportSimulationXlsx({
                  sku,
                  pricingOpts,
                  compMonthlyData,
                  compChannelDist,
                  varCostByChannel,
                  usdKrw: mtUsdKrw,
                  jpyKrw: mtJpyKrw,
                })}
                className="text-[11px] px-2.5 py-1 rounded-lg border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-700 transition-colors whitespace-nowrap"
              >
                ↓ 시뮬레이션 엑셀
              </button>
              {(
                [
                  { field: 'platformConfirmed', label: '플랫폼 확정', on: 'bg-emerald-600 text-white hover:bg-emerald-700', off: 'border border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
                  { field: 'brandConfirmed',    label: '브랜드 확정', on: 'bg-amber-500 text-white hover:bg-amber-600',     off: 'border border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100'   },
                  { field: 'globalConfirmed',   label: '글로벌 확정', on: 'bg-sky-600 text-white hover:bg-sky-700',         off: 'border border-sky-400 bg-sky-50 text-sky-700 hover:bg-sky-100'           },
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
          varCostResults={varCostResults}
          compChannelYM={compChannelYM}
          compMode={compMode}
          compModeLabel={compModeLabel}
          step2Baseline={sku.step2InitBaselineQty ?? null}
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

  const getMktQty = (month: Month) =>
    (sku.marketingMonthQty ?? {})[month] ?? 0;

  const channelTotal = (channel: Channel) =>
    MONTHS.reduce((sum, m) => sum + getQty(channel, m), 0);

  const monthTotal = (month: Month) =>
    CHANNELS.reduce((sum, ch) => sum + getQty(ch, month), 0) + getMktQty(month);

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
          {/* 마케팅 그룹 */}
          <tr className="bg-pink-50/60 border-b border-pink-200">
            <td colSpan={2 + MONTHS.length + 2} className="px-3 py-0.5">
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
            {MONTHS.map((m) => {
              const qty = getMktQty(m);
              return (
                <td key={m} className={`px-2 py-1.5 text-center tabular-nums text-[11px] ${IS_NEXT_YEAR[m] ? 'bg-blue-50/40' : ''}`}>
                  {qty > 0
                    ? <span className="text-pink-600 font-medium">{qty.toLocaleString()}</span>
                    : <span className="text-gray-300">–</span>}
                </td>
              );
            })}
            {(() => {
              const t26 = MONTHS.filter((m) => !IS_NEXT_YEAR[m]).reduce((s, m) => s + getMktQty(m), 0);
              const tAll = MONTHS.reduce((s, m) => s + getMktQty(m), 0);
              return (
                <>
                  <td className="px-2 py-1.5 text-center font-semibold tabular-nums text-pink-600 bg-indigo-50/50 whitespace-nowrap text-[11px]">
                    {t26 > 0 ? t26.toLocaleString() : <span className="text-gray-300">–</span>}
                  </td>
                  <td className="px-2 py-1.5 text-center font-semibold tabular-nums text-pink-500 bg-gray-50 whitespace-nowrap text-[11px]">
                    {tAll > 0 ? tAll.toLocaleString() : <span className="text-gray-300">–</span>}
                  </td>
                </>
              );
            })()}
          </tr>
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

// ── STEP 2 판매가 시나리오 정의 (공유 상수는 utils/pricingScenarios.ts 참조) ──

// ── STEP 2 채널별 목표량 테이블 ──────────────────────────────────────────
function PricingChannelTable({
  sku, readOnly,
  pricingOpts, setPricingOpts,
  onTotalsChange,
  onBeforeEdit,
  varCostByChannel = {},
  varCostResults = {},
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
  varCostResults?: Record<string, { ratio: number; isFallback: boolean }>;
  compChannelYM?: ChannelByYearMonth | null;
  compMode?: 'rolling12' | 'samePeriod';
  compModeLabel?: string;
  step2Baseline?: SkuData['channelMonthQty'] | null;
}) {
  const updateChannelMonthQty = useStore((s) => s.updateChannelMonthQty);
  const updateMarketingMonthQty = useStore((s) => s.updateMarketingMonthQty);
  const persistSku = useStore((s) => s.persistSku);
  const [expandedChannels, setExpandedChannels] = useState<Set<Channel>>(new Set());
  const [marketingExpanded, setMarketingExpanded] = useState(false);
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

  const getPricingOpt = (channel: Channel, month: Month) =>
    pricingOpts[`${channel}-${month}`] ?? PRICING_DEFAULT_OPT[channel] ?? '';

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

  const getMarketingQty = (month: Month) =>
    (sku.marketingMonthQty ?? {})[month] ?? 0;
  const marketingTotalQty = MONTHS.reduce((s, m) => s + getMarketingQty(m), 0);
  const marketingCost = sku.cost * marketingTotalQty;

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
  // 마케팅은 매출 0 처리, 공헌이익에서만 원가×수량 차감
  const adjustedRevenue = totals.revenue;
  const adjustedProfit = totals.profit - marketingCost;
  const totalCm = adjustedRevenue > 0 ? Math.round((adjustedProfit / adjustedRevenue) * 1000) / 10 : null;

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
        const channelMonthTotal = MONTHS.reduce((s, m) => s + getMonthQty(channel, m), 0);
        const displayQty = channelMonthTotal > 0 ? channelMonthTotal : qty;
        const baselineChannelTotal = step2Baseline
          ? MONTHS.reduce((s, m) => s + (step2Baseline.find((e) => e.channel === channel && e.month === m)?.qty ?? 0), 0)
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
                </button>
              </td>
              {/* 채널 비중 */}
              <td className={`px-2 py-1.5 text-center tabular-nums text-[11px] truncate ${isExpanded ? 'font-bold text-indigo-600' : 'text-gray-500'}`}>
                {totals.qty > 0 && displayQty > 0
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
                {profit > 0 ? formatWon(profit) : profit < 0 ? <span className="text-red-500">{formatWon(Math.abs(profit))}</span> : <span className="text-gray-300">–</span>}
              </td>
              {/* 변동비율 */}
              <td className="px-2 py-1.5 text-center tabular-nums text-[11px] truncate">
                {(() => {
                  const r = varCostResults[channel];
                  if (!r) return <span className="text-gray-400 font-semibold">25.0%</span>;
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
                  <td colSpan={8} className="px-4 py-3">
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
                                          disabled={readOnly || (DISABLED_CHANNELS as readonly string[]).includes(channel) || isChannelLocked(sku, channel)}
                                          placeholder="0"
                                          className={`text-right rounded-md px-1 py-1 text-[11px] border focus:outline-none focus:ring-1 focus:ring-gray-400 ${
                                            readOnly || (DISABLED_CHANNELS as readonly string[]).includes(channel) || isChannelLocked(sku, channel) ? 'bg-gray-50 text-gray-400 cursor-not-allowed border-gray-200' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
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
            const FY26 = MONTHS.filter((m) => !IS_NEXT_YEAR[m]);
            const FY27 = MONTHS.filter((m) => IS_NEXT_YEAR[m]);
            const yearBorder = (m: Month) => IS_NEXT_YEAR[m] && !IS_NEXT_YEAR[MONTHS[MONTHS.indexOf(m) - 1] as Month] ? 'border-l-2 border-gray-400' : '';
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
                            {MONTHS.map((m) => (
                              <th key={m} className={`px-2 py-2 text-center font-bold whitespace-nowrap ${yearBorder(m)} ${IS_NEXT_YEAR[m] ? 'text-gray-500 bg-pink-100/50' : 'text-pink-600'}`} style={{ minWidth: '76px' }}>
                                <div className="text-[13px]">{MONTH_LABELS[m]}</div>
                                {IS_NEXT_YEAR[m] && <div className="text-[9px] text-gray-400 font-normal">27년</div>}
                              </th>
                            ))}
                            <th className="px-3 py-2 text-center text-[11px] font-bold text-gray-500 whitespace-nowrap border-l-2 border-pink-200 bg-pink-100/50" style={{ minWidth: '72px' }}>26년<br/>합계</th>
                            <th className="px-3 py-2 text-center text-[11px] font-bold text-gray-400 whitespace-nowrap border-l border-pink-100 bg-pink-100/50" style={{ minWidth: '72px' }}>27년<br/>합계</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* 수량 행 */}
                          <tr className="border-b border-pink-100 bg-white">
                            <td className={labelCell}>
                              <span className="text-[11px] font-bold text-gray-600">수량</span>
                            </td>
                            {MONTHS.map((m) => {
                              const mQty = getMarketingQty(m);
                              return (
                                <td key={m} className={`px-1 py-1 ${yearBorder(m)} ${IS_NEXT_YEAR[m] ? 'bg-gray-50/60' : ''}`}>
                                  <NumericInput
                                    value={mQty}
                                    onChange={(val) => updateMarketingMonthQty(sku.id, m, val)}
                                    onBlur={() => persistSku(sku.id)}
                                    onFocus={() => onBeforeEdit?.()}
                                    disabled={readOnly}
                                    placeholder="0"
                                    className={`text-right rounded-md px-1 py-1 text-[11px] border focus:outline-none focus:ring-1 focus:ring-pink-400 ${
                                      readOnly ? 'bg-gray-50 text-gray-400 cursor-not-allowed border-gray-200' : 'bg-white text-gray-700 border-pink-200 hover:border-pink-400'
                                    }`}
                                    style={{ width: '52px' }}
                                  />
                                </td>
                              );
                            })}
                            <td className={`${totalCell} border-l-2 border-gray-300 text-gray-700`}>
                              {(() => { const t = FY26.reduce((s, m) => s + getMarketingQty(m), 0); return t > 0 ? t.toLocaleString() : <span className="text-gray-300">–</span>; })()}
                            </td>
                            <td className={`${totalCell} text-gray-500`}>
                              {(() => { const t = FY27.reduce((s, m) => s + getMarketingQty(m), 0); return t > 0 ? t.toLocaleString() : <span className="text-gray-300">–</span>; })()}
                            </td>
                          </tr>
                          {/* 예상 비용 (공헌이익 차감) 행 */}
                          <tr className="bg-red-50/50">
                            <td className="px-3 py-2 border-r border-red-200 bg-red-100/70 whitespace-nowrap">
                              <span className="text-[11px] font-bold text-red-600">예상 비용</span>
                              <span className="block text-[9px] text-red-400 mt-0.5">공헌이익 차감</span>
                            </td>
                            {MONTHS.map((m) => {
                              const mCost = sku.cost * getMarketingQty(m);
                              return (
                                <td key={m} className={`px-2 py-2 text-right tabular-nums text-[11px] font-semibold text-red-600 ${yearBorder(m)} ${IS_NEXT_YEAR[m] ? 'bg-red-50/40' : ''}`}>
                                  {mCost > 0 ? <span>-{formatWon(mCost)}</span> : <span className="text-red-200">–</span>}
                                </td>
                              );
                            })}
                            <td className="px-3 py-2 text-right tabular-nums text-[11px] font-bold text-red-600 border-l-2 border-red-300 bg-red-100/70 whitespace-nowrap">
                              {(() => { const t = FY26.reduce((s, m) => s + sku.cost * getMarketingQty(m), 0); return t > 0 ? <span>-{formatWon(t)}</span> : <span className="text-red-200">–</span>; })()}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-[11px] font-bold text-red-500 border-l border-red-200 bg-red-100/70 whitespace-nowrap">
                              {(() => { const t = FY27.reduce((s, m) => s + sku.cost * getMarketingQty(m), 0); return t > 0 ? <span>-{formatWon(t)}</span> : <span className="text-red-200">–</span>; })()}
                            </td>
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
              {adjustedProfit > 0
                ? <span className="text-emerald-700">{formatWon(adjustedProfit)}</span>
                : adjustedProfit < 0
                  ? <span className="text-red-500">-{formatWon(Math.abs(adjustedProfit))}</span>
                  : '–'}
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
              실매출단가 = ∑(월수량×시나리오가격) ÷ 총수량 &nbsp;·&nbsp; 공헌이익 = 순매출 − 변동비 − 원가×수량 &nbsp;*변동비는 해당 카테고리의 대응SKU 동기간 평균 변동비 비중으로 계산됩니다. 대응SKU 없을 시 25%로 임의계산됩니다.
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
    </div>
  );
}
