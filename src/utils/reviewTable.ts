/**
 * 발주량 검토 표 공통 값 — SKU별 결정 통합 표 · 채널 일괄 · 월 계획 일괄 (개편 5단계)
 */
import type { Month } from '../types';

/** 소진월 이후(리오더 · 품절 구간) 빗금 */
export const HATCH = { backgroundImage: 'repeating-linear-gradient(135deg, #ffedd5 0 4px, transparent 4px 9px)' };

/** 누적 판매 목표가 발주량에 처음 닿는 달 (없으면 -1) */
export const coverIndexOf = (cumulative: number[], orderQty: number) =>
  orderQty > 0 && cumulative.length > 0 && cumulative[cumulative.length - 1] > 0 ? cumulative.findIndex((c) => c >= orderQty) : -1;

/** 월 머리 표기 — 출시연도 기준, 출시월보다 작은 달은 다음 해 → "26.10월" */
export const monthHeadLabel = (m: Month, months: Month[], releaseYear: number) =>
  `${String((m < months[0] ? releaseYear + 1 : releaseYear) % 100).padStart(2, '0')}.${m}월`;
