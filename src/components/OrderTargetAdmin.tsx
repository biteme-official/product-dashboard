import { useMemo, useState } from 'react';
import { CATEGORIES } from '../types';
import { saveOrderTarget, useOrderTargets } from '../hooks/useOrderTargets';
import { CellInput } from './CellInput';

const MAN = 10_000;

/** 관리 › SKU 관리 › 월 목표 — 판매월 × 카테고리 순매출 · 공헌이익 목표 (만원 단위 입력) */
export function OrderTargetAdmin() {
  const targets = useOrderTargets();
  const [key, setKey] = useState<'rev' | 'pro'>('rev');
  const [error, setError] = useState<string | null>(null);
  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 18 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
  }, []);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">프로젝션 › 발주량 검토 합계 차트의 월 목표 · 만원 단위</span>
        <span className="flex-1" />
        {([['rev', '순매출'], ['pro', '공헌이익']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setKey(k)} className={`text-xs px-2.5 py-1 rounded-full border ${key === k ? 'bg-gray-800 text-white border-gray-800 font-semibold' : 'border-gray-200 text-gray-600'}`}>{l}</button>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-2 py-1.5 text-left font-semibold text-gray-600">판매월</th>
              {CATEGORIES.map((c) => <th key={c} className="px-2 py-1.5 text-right font-semibold text-gray-600">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {months.map((ym) => (
              <tr key={ym} className="border-b border-gray-100">
                <td className="px-2 py-1 tabular-nums text-gray-700 whitespace-nowrap">{ym.replace('-', '.')}</td>
                {CATEGORIES.map((c) => (
                  <td key={c} className="px-1 py-1 min-w-[84px]">
                    <CellInput
                      value={Math.round((targets[ym]?.[c]?.[key] ?? 0) / MAN)}
                      onCommit={(v) => { setError(null); saveOrderTarget(ym, c, key, v * MAN).catch(() => setError('저장에 실패했어요. 새로고침 후 다시 입력해 주세요.')); }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
