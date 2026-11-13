/**
 * 발주량 검토 표 공통 조각 — SKU별 결정 통합 표 · 월 계획 일괄이 같은 모양을 쓰도록 (개편 5단계)
 */
import { HATCH } from '../utils/reviewTable';

/** 비교 대비 차이 — % (증감률) 또는 p (비중 차이) · ▲ 파랑 ▼ 빨강 */
export function Delta({ cur, base, unit }: { cur: number; base: number | null; unit: '%' | 'p' }) {
  if (base === null || (unit === '%' && !base)) return null;
  const d = unit === '%' ? Math.round(((cur - base) / base) * 100) : Math.round(cur - base);
  if (d === 0) return <span className="ml-1 text-[10px] text-gray-400">±0{unit}</span>;
  return <span className={`ml-1 text-[10px] ${d > 0 ? 'text-blue-600' : 'text-red-500'}`}>{d > 0 ? '▲' : '▼'}{Math.abs(d)}{unit}</span>;
}

/** 표 위 범례 한 줄 */
export function TableLegend({ overLabel, mine }: { overLabel: string; mine?: boolean }) {
  return (
    <span className="flex flex-wrap gap-x-3 text-[11px] text-gray-500">
      <span className="inline-flex items-center gap-1"><i className="w-3 h-3 rounded-sm border border-gray-300 bg-white" />입력 칸</span>
      <span className="inline-flex items-center gap-1"><b className="text-emerald-700">▼</b>소진월</span>
      <span className="inline-flex items-center gap-1"><i className="w-3 h-3 rounded-sm border border-gray-200" style={HATCH} />{overLabel} 구간</span>
      {mine && <span className="inline-flex items-center gap-1 text-teal-800"><i className="w-3 h-3 rounded-sm bg-teal-50 border-l-2 border-teal-500" />내 담당 채널</span>}
    </span>
  );
}
