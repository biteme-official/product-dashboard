import { useState, useMemo } from 'react';
import { useStore } from '../store';
import { parseCsvBulk, type ParsedRow } from '../utils/parseCsvBulk';
import type { SkuData } from '../types';

const PLACEHOLDER = `카테고리\t브랜드\t타입\tSKU명\t출시일\t사이즈 수\t원가\t판매가\t정가\tMOQ
의류\t바잇미\t시즈널\t산리오 기모 후드_26\t2026-09-01\t4\t15000\t39000\t39000\t100
의류\tSSFW\t스테디\t스탠다드 맨투맨_26\t2026-10-01\t3\t18000\t45000\t45000\t50`;

export function BulkImportModal({ onClose }: { onClose: () => void }) {
  const importSkus = useStore((s) => s.importSkus);

  const [csvText, setCsvText] = useState('');
  const [status, setStatus] = useState<'idle' | 'importing' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const rows: ParsedRow[] = useMemo(
    () => (csvText.trim() ? parseCsvBulk(csvText) : []),
    [csvText],
  );

  const validRows = rows.filter((r) => r.errors.length === 0);
  const errorRows = rows.filter((r) => r.errors.length > 0);

  async function handleImport() {
    if (validRows.length === 0) return;
    setStatus('importing');
    try {
      const skus = validRows.map((r) => ({
        ...r.sku!,
        isExpanded: true,
        _initialSnapshot: JSON.parse(JSON.stringify(r.sku!)),
      })) as SkuData[];
      await importSkus(skus);
      setStatus('done');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '알 수 없는 오류');
      setStatus('error');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div>
            <h2 className="text-sm font-bold text-gray-900">SKU 일괄 추가</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Excel에서 복사한 탭 구분 데이터 또는 쉼표(,) 구분 CSV를 붙여넣으세요.
            </p>
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

        <div className="p-6 space-y-4">
          {/* 컬럼 가이드 */}
          <div className="bg-indigo-50 rounded-lg px-4 py-2.5 text-[11px] text-indigo-700 font-mono">
            카테고리 · 브랜드 · 타입 · SKU명 · 출시일(YYYY-MM-DD) · 사이즈수(1~8) · 원가 · 판매가 · 정가 · MOQ
          </div>

          {/* 입력 영역 */}
          <textarea
            className="w-full h-44 px-3 py-2.5 text-xs font-mono border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder:text-gray-300"
            placeholder={PLACEHOLDER}
            value={csvText}
            onChange={(e) => { setCsvText(e.target.value); setStatus('idle'); }}
            spellCheck={false}
          />

          {/* 파싱 결과 미리보기 */}
          {rows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-xs">
                <span className="font-semibold text-gray-700">{rows.length}행 감지</span>
                {validRows.length > 0 && (
                  <span className="text-emerald-600 font-medium">✓ 유효 {validRows.length}개</span>
                )}
                {errorRows.length > 0 && (
                  <span className="text-red-500 font-medium">✗ 오류 {errorRows.length}개</span>
                )}
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-2 py-2 text-center font-semibold text-gray-500 w-8">#</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-500">카테고리</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-500">브랜드</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-500">타입</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-500 min-w-[140px]">SKU명</th>
                      <th className="px-2 py-2 text-center font-semibold text-gray-500">출시일</th>
                      <th className="px-2 py-2 text-center font-semibold text-gray-500">사이즈</th>
                      <th className="px-2 py-2 text-right font-semibold text-gray-500">원가</th>
                      <th className="px-2 py-2 text-right font-semibold text-gray-500">판매가</th>
                      <th className="px-2 py-2 text-right font-semibold text-gray-500">정가</th>
                      <th className="px-2 py-2 text-right font-semibold text-gray-500">MOQ</th>
                      <th className="px-2 py-2 text-center font-semibold text-gray-500">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const hasErr = row.errors.length > 0;
                      return (
                        <tr
                          key={row.rowNum}
                          className={`border-b border-gray-50 last:border-0 ${hasErr ? 'bg-red-50' : 'hover:bg-indigo-50/20'}`}
                        >
                          <td className="px-2 py-1.5 text-center text-gray-400">{row.rowNum}</td>
                          <td className="px-2 py-1.5 text-gray-700">{row.raw.category}</td>
                          <td className="px-2 py-1.5 text-gray-700">{row.raw.brand}</td>
                          <td className="px-2 py-1.5 text-gray-700">{row.raw.skuType}</td>
                          <td className="px-2 py-1.5 text-gray-700 font-medium">{row.raw.name || <span className="text-gray-300">(없음)</span>}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums text-gray-600">{row.raw.releaseDate || '–'}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums text-gray-600">{row.raw.sizeCount}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">{row.raw.cost ? Number(row.raw.cost.replace(/,/g, '')).toLocaleString() : '–'}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-gray-700 font-medium">{row.raw.price ? Number(row.raw.price.replace(/,/g, '')).toLocaleString() : '–'}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">{row.raw.regularPrice ? Number(row.raw.regularPrice.replace(/,/g, '')).toLocaleString() : '–'}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">{row.raw.moq || '–'}</td>
                          <td className="px-2 py-1.5 text-center">
                            {hasErr ? (
                              <span className="text-red-500" title={row.errors.join('\n')}>✗</span>
                            ) : (
                              <span className="text-emerald-500">✓</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 오류 상세 */}
              {errorRows.length > 0 && (
                <div className="space-y-1">
                  {errorRows.map((row) => (
                    <div key={row.rowNum} className="text-[11px] text-red-500">
                      <span className="font-semibold">{row.rowNum}행:</span>{' '}
                      {row.errors.join(' / ')}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="text-xs">
            {status === 'done' && (
              <span className="text-emerald-600 font-semibold">✓ {validRows.length}개 SKU가 추가되었습니다</span>
            )}
            {status === 'error' && (
              <span className="text-red-500">추가 실패: {errorMsg}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            >
              {status === 'done' ? '닫기' : '취소'}
            </button>
            {status !== 'done' && (
              <button
                onClick={handleImport}
                disabled={validRows.length === 0 || status === 'importing'}
                className="px-5 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {status === 'importing'
                  ? '추가 중…'
                  : `SKU ${validRows.length}개 추가`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
