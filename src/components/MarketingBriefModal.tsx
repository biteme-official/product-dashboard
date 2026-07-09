import { useState, useCallback, useEffect, useRef } from 'react';
import type { SkuData, MarketingBrief, MarketingBriefTargetProduct } from '../types';
import { useStore } from '../store';
import { RichTextArea } from './RichTextArea';

const EMPTY_BRIEF: MarketingBrief = {
  targetProducts: [],
  targetCustomer: '',
  marketingProposal: '',
  psp: '',
  ksp: '',
  usp: '',
  note: '',
};

function newTarget(): MarketingBriefTargetProduct {
  return { id: crypto.randomUUID(), productName: '', price: 0, weeklyEstimatedSales: 0 };
}

function fmt(n: number): string {
  return n > 0 ? n.toLocaleString('ko-KR') : '';
}
function parseNum(s: string): number {
  return parseInt(s.replace(/,/g, ''), 10) || 0;
}

function competitiveness(skuPrice: number, targetPrice: number): {
  label: '고' | '중' | '하';
  diff: number;
  cls: string;
} {
  const diff = skuPrice - targetPrice;
  const pct = targetPrice > 0 ? diff / targetPrice : 0;
  if (diff < 0) return { label: '고', diff, cls: 'bg-emerald-100 text-emerald-700' };
  if (pct <= 0.1) return { label: '중', diff, cls: 'bg-yellow-100 text-yellow-700' };
  return { label: '하', diff, cls: 'bg-red-100 text-red-600' };
}



export function MarketingBriefModal({ sku, onClose }: { sku: SkuData; onClose: () => void }) {
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);

  const [brief, setBrief] = useState<MarketingBrief>(() => ({
    ...EMPTY_BRIEF,
    ...(sku.marketingBrief ?? {}),
    targetProducts: sku.marketingBrief?.targetProducts?.length
      ? sku.marketingBrief.targetProducts
      : [],
  }));
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  const patch = useCallback((b: Partial<MarketingBrief>) => {
    setBrief((prev) => ({ ...prev, ...b }));
  }, []);

  // brief 변경 시 800ms 디바운스 자동 저장
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setSaveState('saving');
    timerRef.current = setTimeout(async () => {
      updateSku(sku.id, { marketingBrief: brief });
      try {
        await persistSku(sku.id);
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 2000);
      } catch {
        setSaveState('idle');
      }
    }, 800);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  // brief 변경에만 반응 — sku.id/updateSku/persistSku는 안정적
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief]);

  // ── 타겟 제품 행 조작 ──
  function addTarget() {
    patch({ targetProducts: [...brief.targetProducts, newTarget()] });
  }
  function removeTarget(id: string) {
    patch({ targetProducts: brief.targetProducts.filter((t) => t.id !== id) });
  }
  function updateTarget(id: string, field: keyof Omit<MarketingBriefTargetProduct, 'id'>, value: string | number) {
    patch({
      targetProducts: brief.targetProducts.map((t) =>
        t.id === id ? { ...t, [field]: value } : t,
      ),
    });
  }

  const skuPrice = sku.price ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div>
            <p className="text-[11px] text-gray-400 font-medium">{sku.brand}</p>
            <h2 className="text-base font-bold text-gray-900 leading-tight">
              {sku.skuName || '(SKU명 미입력)'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400 font-medium">Marketing Brief</span>
            <button
              onClick={onClose}
              className="ml-2 p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">

          {/* ① 경쟁사 타겟 제품 */}
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h3 className="text-xs font-semibold text-gray-700">① 경쟁사 타겟 제품</h3>
              <button
                onClick={addTarget}
                className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                행 추가
              </button>
            </div>

            {brief.targetProducts.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-gray-400">
                타겟 제품을 추가해주세요.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="px-3 py-2 text-left font-semibold text-gray-500 min-w-[160px]">제품명</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-500 min-w-[90px]">판매가 (원)</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-500 min-w-[110px]">주간예상매출 (sellha)</th>
                      <th className="px-3 py-2 text-center font-semibold text-gray-500 min-w-[100px]">가격 경쟁력</th>
                      <th className="px-2 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {brief.targetProducts.map((t) => {
                      const comp = skuPrice > 0 && t.price > 0
                        ? competitiveness(skuPrice, t.price)
                        : null;
                      return (
                        <tr key={t.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/40">
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              value={t.productName}
                              onChange={(e) => updateTarget(t.id, 'productName', e.target.value)}
                              placeholder="제품명 입력"
                              className="w-full px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={fmt(t.price)}
                              onChange={(e) => updateTarget(t.id, 'price', parseNum(e.target.value))}
                              placeholder="0"
                              className="w-full px-2 py-1 text-xs text-right border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={fmt(t.weeklyEstimatedSales)}
                              onChange={(e) => updateTarget(t.id, 'weeklyEstimatedSales', parseNum(e.target.value))}
                              placeholder="0"
                              className="w-full px-2 py-1 text-xs text-right border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            {comp ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${comp.cls}`}>
                                  {comp.label}
                                </span>
                                <span className={`text-[10px] tabular-nums ${comp.diff < 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                  {comp.diff > 0 ? '+' : ''}{comp.diff.toLocaleString()}원
                                </span>
                              </div>
                            ) : (
                              <span className="text-gray-300 text-[11px]">–</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <button
                              onClick={() => removeTarget(t.id)}
                              className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* 가격 경쟁력 기준 안내 */}
            {skuPrice > 0 && (
              <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center gap-3">
                <span className="text-[10px] text-gray-400">SKU 판매가 {skuPrice.toLocaleString()}원 기준</span>
                <span className="text-[10px] text-emerald-600 font-medium">고: SKU 더 저렴</span>
                <span className="text-[10px] text-yellow-600 font-medium">중: ±10% 이내</span>
                <span className="text-[10px] text-red-500 font-medium">하: 10% 초과 비쌈</span>
              </div>
            )}
          </section>

          {/* ② 타겟 고객 */}
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h3 className="text-xs font-semibold text-gray-700">② 타겟 고객</h3>
            </div>
            <div className="p-4">
              <RichTextArea
                value={brief.targetCustomer}
                onChange={(html) => patch({ targetCustomer: html })}
                placeholder="타겟 고객 입력"
                rows={3}
              />
            </div>
          </section>

          {/* ③ 마케팅 제안 */}
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h3 className="text-xs font-semibold text-gray-700">③ 마케팅 제안</h3>
            </div>
            <div className="p-4">
              <RichTextArea
                value={brief.marketingProposal}
                onChange={(html) => patch({ marketingProposal: html })}
                placeholder="마케팅 제안 입력"
                rows={3}
              />
            </div>
          </section>

          {/* ④ PSP / KSP / USP */}
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h3 className="text-xs font-semibold text-gray-700">④ PSP / KSP / USP</h3>
            </div>
            <div className="p-4 grid grid-cols-1 gap-4">
              {(
                [
                  { key: 'psp', label: 'PSP', sub: '구매자극요소', color: 'text-violet-600' },
                  { key: 'ksp', label: 'KSP', sub: '판매핵심요소', color: 'text-indigo-600' },
                  { key: 'usp', label: 'USP', sub: '차별화요소',   color: 'text-sky-600'    },
                ] as const
              ).map(({ key, label, sub, color }) => (
                <div key={key}>
                  <label className="flex items-baseline gap-1.5 text-xs mb-1.5">
                    <span className={`font-bold ${color}`}>{label}</span>
                    <span className="text-gray-400">{sub}</span>
                  </label>
                  <RichTextArea
                    value={brief[key]}
                    onChange={(html) => patch({ [key]: html })}
                    placeholder={`${label} 입력`}
                    rows={3}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* ⑤ 비고 */}
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h3 className="text-xs font-semibold text-gray-700">⑤ 비고</h3>
            </div>
            <div className="p-4">
              <RichTextArea
                value={brief.note}
                onChange={(html) => patch({ note: html })}
                placeholder="자유 입력"
                rows={4}
              />
            </div>
          </section>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          <span className="text-xs tabular-nums">
            {saveState === 'saving' && (
              <span className="text-gray-400">저장 중…</span>
            )}
            {saveState === 'saved' && (
              <span className="text-emerald-600 font-medium">✓ 저장됨</span>
            )}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
