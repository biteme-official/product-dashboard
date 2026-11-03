/**
 * PM 확인 최종 발주량 계산 — SKU 카드 표와 발주량 검토 탭의 확정이 같은 값을 쓴다.
 * 표시 우선순위: 저장된 최종 수량 > STEP2 옵션 수량(총 발주량 비례) > 컬러 수량 · 사이즈 비율 계산.
 */
import type { ColorEntry, SizeRatio, SkuData } from '../types';

const META_KEYS = new Set(['__total__', '__confirmedStep2Total__']);
export const csKey = (cid: string, sl: string) => `cs|${cid}|${sl}`;
export const cKey = (cid: string) => `c|${cid}`;
export const sKey = (sl: string) => `s|${sl}`;

export interface FinalOrderModel {
  step2Total: number;
  orderBase: number;
  activeSizes: SizeRatio[];
  activeColors: ColorEntry[];
  hasColors: boolean;
  hasSizes: boolean;
  isFinalManual: boolean;
  dispCS: (cid: string, cQty: number, sl: string, sRatio: number) => number;
  dispC: (cid: string, cQty: number) => number;
  dispS: (sl: string, sRatio: number) => number;
  /** 화면에 보이는 옵션별 최종 수량 */
  rows: { key: string; label: string; qty: number }[];
}

/** 옵션이나 수량이 없어 최종 발주량을 만들 수 없으면 null */
export function finalOrderModel(sku: SkuData): FinalOrderModel | null {
  const step2Total = sku.channelMonthQty.reduce((s, e) => s + e.qty, 0);
  // 최종 발주량 기본값 기준 = 총 발주량 (STEP2 합계는 리오더 포함 판매 목표라 발주량과 다를 수 있음). 총 발주량이 없을 때만 STEP2 합계
  const orderBase = sku.totalOrderQty > 0 ? sku.totalOrderQty : step2Total;
  const activeSizes = sku.sizes.filter((s) => s.isActive && s.ratio > 0);
  const sumRatios = activeSizes.reduce((a, s) => a + s.ratio, 0);
  const activeColors = sku.hasColors ? sku.colors.filter((c) => !c.archived && (c.name || c.quantity > 0)) : [];
  const colorTotal = activeColors.reduce((s, c) => s + c.quantity, 0);
  const hasColors = activeColors.length > 0 && colorTotal > 0;
  const hasSizes = activeSizes.length > 0 && sumRatios > 0;
  if (orderBase === 0 || (!hasColors && !hasSizes)) return null;

  const stored2 = sku.step2OptionQty ?? {};
  const isManual2 = Object.keys(stored2).some((k) => k !== '__total__');
  const savedTotal2 = (stored2['__total__'] as number | undefined) ?? 0;
  const scale2 = isManual2 && savedTotal2 > 0 ? orderBase / savedTotal2 : 1;
  const scaled = (key: string, fallback: number) =>
    isManual2 && stored2[key] !== undefined ? Math.round(stored2[key] * scale2) : fallback;

  const finalStored = sku.finalOrderQty ?? {};
  const isFinalManual = Object.keys(finalStored).some((k) => !META_KEYS.has(k));
  const final = (key: string, fallback: number) =>
    isFinalManual && finalStored[key] !== undefined ? finalStored[key] : fallback;

  const dispCS = (cid: string, cQty: number, sl: string, sRatio: number) => {
    const k = csKey(cid, sl);
    return final(k, scaled(k, Math.round(orderBase * (cQty / colorTotal) * (sRatio / sumRatios))));
  };
  const dispC = (cid: string, cQty: number) => final(cKey(cid), scaled(cKey(cid), Math.round(orderBase * (cQty / colorTotal))));
  const dispS = (sl: string, sRatio: number) => final(sKey(sl), scaled(sKey(sl), Math.round(orderBase * (sRatio / sumRatios))));

  const rows = hasColors && hasSizes
    ? activeColors.flatMap((c) => activeSizes.map((s) => ({ key: csKey(c.id, s.label), label: `${c.name} · ${s.label}`, qty: dispCS(c.id, c.quantity, s.label, s.ratio) })))
    : hasColors
      ? activeColors.map((c) => ({ key: cKey(c.id), label: c.name, qty: dispC(c.id, c.quantity) }))
      : activeSizes.map((s) => ({ key: sKey(s.label), label: s.label, qty: dispS(s.label, s.ratio) }));

  return { step2Total, orderBase, activeSizes, activeColors, hasColors, hasSizes, isFinalManual, dispCS, dispC, dispS, rows };
}

/** 수기 수정 없이 확정할 때 저장할 값 — 기존 수기 수량은 보존하고 확정 시점 STEP2 합계를 함께 기록 */
export function finalOrderForConfirm(sku: SkuData, model: FinalOrderModel): Record<string, number> {
  const base = model.isFinalManual ? (sku.finalOrderQty ?? {}) : Object.fromEntries(model.rows.map((r) => [r.key, r.qty]));
  return { ...base, __confirmedStep2Total__: model.step2Total };
}
