import type { SkuData } from '../types';
import { BRANDS } from '../types';
import { useStore } from '../store';
import { useAuth } from '../store/auth';
import { revenueMultiplier, calcDynamicMultiplier } from '../utils/calc';
import { useState, useRef, type ChangeEvent } from 'react';
import { SizeDistColumn } from './SizeDistColumn';
import { ComparisonColumn } from './ComparisonColumn';
import { NumericInput } from './NumericInput';

interface Props {
  sku: SkuData;
}

export function SkuCard({ sku }: Props) {
  const toggleExpanded = useStore((s) => s.toggleExpanded);
  const deleteSku = useStore((s) => s.deleteSku);
  const resetSku = useStore((s) => s.resetSku);
  const duplicateSku = useStore((s) => s.duplicateSku);
  const skus = useStore((s) => s.skus);
  const activeCategory = useStore((s) => s.activeCategory);
  const { role } = useAuth();
  const canEdit = role === 'master' || role === 'pm';
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isAtMax = skus.filter((s) => s.category === activeCategory).length >= 15;

  const multiplier = calcDynamicMultiplier(sku.channelRatios) ?? revenueMultiplier(sku.category);
  const expectedRevenue = Math.round(sku.totalOrderQty * sku.price * multiplier);

  return (
    <div className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
      {/* 요약 헤더 */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <button
          onClick={() => toggleExpanded(sku.id)}
          className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
        >
          <svg
            className={`w-4 h-4 transition-transform ${sku.isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-semibold text-gray-900 truncate">
            {sku.name || '(SKU명 미입력)'}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 flex-shrink-0">
            {sku.category}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 flex-shrink-0">
            {sku.skuType}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 flex-shrink-0">
            {sku.brand}
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm text-gray-600 flex-shrink-0">
          <div className="text-right">
            <div className="text-xs text-gray-400">판매가</div>
            <div className="font-medium">₩{sku.price.toLocaleString()}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">총 발주량</div>
            <div className="font-medium">{sku.totalOrderQty.toLocaleString()}장</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">예상 매출</div>
            <div className="font-medium text-indigo-600">
              ₩{expectedRevenue.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {canEdit && (
            <>
              <button
                onClick={() => resetSku(sku.id)}
                className="text-xs px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
              >
                초기화
              </button>
              <button
                onClick={() => duplicateSku(sku.id)}
                disabled={isAtMax}
                title={isAtMax ? '최대 15개 도달' : '이 SKU를 복사합니다'}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  isAtMax
                    ? 'border-gray-200 text-gray-300 bg-gray-50 cursor-not-allowed'
                    : 'border-sky-300 text-sky-700 bg-sky-50 hover:bg-sky-100'
                }`}
              >
                복사
              </button>
              {showDeleteConfirm ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-red-600">정말 삭제?</span>
                  <button
                    onClick={() => deleteSku(sku.id)}
                    className="text-xs px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600"
                  >
                    삭제
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                  >
                    취소
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-500 bg-red-50 hover:bg-red-100 transition-colors"
                >
                  삭제
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* 상세 입력 영역 (펼침) */}
      {sku.isExpanded && (
        <div className="p-4 bg-white">
          <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 2fr 1.2fr' }}>
            {/* 열 1: 기본정보 */}
            <BasicInfoColumn sku={sku} readOnly={!canEdit} />
            {/* 열 2: 사이즈 분배 */}
            <SizeDistColumn sku={sku} readOnly={!canEdit} />
            {/* 열 3: 기존 SKU 비교 */}
            <ComparisonColumn sku={sku} readOnly={!canEdit} />
          </div>
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

      <div>
        <label className="block text-xs text-gray-500 mb-1">공헌이익률 (%)</label>
        <NumericInput
          value={sku.contributionMarginRate}
          onChange={(v) => handleChange({ contributionMarginRate: v })}
          onBlur={handleBlur}
          disabled={readOnly}
          allowDecimal
          placeholder="예: 35"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
        />
      </div>

    </div>
  );
}
