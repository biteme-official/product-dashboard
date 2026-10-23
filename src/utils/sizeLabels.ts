import type { SizeRatio } from '../types';

/**
 * CPO에서 고른 사이즈 라벨을 Product 사이즈 분배에 그대로 반영하기 위한 순수 함수 모음.
 * (예전엔 CPO 사이즈 "개수"만 받고 라벨은 S부터 연속 프리셋을 붙여서 M·L·XL을 골라도 S·M·L로 보였음 — #44)
 * 검증: node scripts/sizeLabels.check.ts
 */

/** CPO 사이즈 → Product 라벨. 비어 있으면 OS, Product 칸 수(maxSizes)를 넘으면 앞에서부터 자른다 */
export function cpoSizeLabels(cpoSizes: string[] | undefined, maxSizes: number): string[] {
  const sizes = (cpoSizes ?? []).filter(Boolean);
  return sizes.length === 0 ? ['OS'] : sizes.slice(0, maxSizes);
}

/**
 * 옛 라벨 → 새 라벨 대응표.
 * - positional: 같은 칸끼리 (프리셋 라벨이 붙어 있던 기존 SKU를 처음 맞출 때 — 칸 위치가 실제 CPO 사이즈였음)
 * - 아니면 같은 이름끼리 (이미 CPO 라벨로 맞춘 뒤 CPO에서 사이즈를 추가/삭제한 경우)
 */
export function mapSizeLabels(oldLabels: string[], newLabels: string[], positional: boolean): Map<string, string> {
  const mapping = new Map<string, string>();
  if (positional) {
    oldLabels.forEach((l, i) => { if (i < newLabels.length) mapping.set(l, newLabels[i]); });
  } else {
    oldLabels.forEach((l) => { if (newLabels.includes(l)) mapping.set(l, l); });
  }
  return mapping;
}

/** 새 라벨로 사이즈 칸을 다시 만든다 — 비율은 대응표로 옮기고, 옮길 비율이 하나도 없으면 균등 분배. 수량은 호출부에서 재계산 */
export function buildSizesFromLabels(
  current: SizeRatio[],
  oldLabels: string[],
  newLabels: string[],
  mapping: Map<string, string>,
  maxSizes: number,
): SizeRatio[] {
  const ratioByNew = new Map<string, number>();
  current.forEach((s) => {
    if (!s.isActive || !oldLabels.includes(s.label)) return;
    const to = mapping.get(s.label);
    if (to !== undefined) ratioByNew.set(to, s.ratio);
  });
  const hasRatio = newLabels.some((l) => (ratioByNew.get(l) ?? 0) > 0);
  const evenRatio = Math.round(100 / newLabels.length);
  return Array.from({ length: maxSizes }, (_, i) => ({
    label: i < newLabels.length ? newLabels[i] : '-',
    ratio: i < newLabels.length ? (hasRatio ? (ratioByNew.get(newLabels[i]) ?? 0) : evenRatio) : 0,
    quantity: 0,
    isActive: i < newLabels.length,
  }));
}

/**
 * 사이즈 라벨로 저장된 수동 수량 키(`s|라벨`, `cs|컬러id|라벨`)를 대응표대로 옮긴다.
 * 대응 없는 라벨의 키는 버리고, 컬러 키(`c|`)·합계(`__total__` 등)는 그대로 둔다.
 * removed: 원래 있었는데 결과에 없는 키 — merge 저장은 빠진 키를 지우지 않으므로 deleteField 대상.
 */
export function remapSizeKeys(
  rec: Record<string, number> | undefined,
  mapping: Map<string, string>,
): { next: Record<string, number>; removed: string[]; changed: boolean } {
  const src = rec ?? {};
  const next: Record<string, number> = {};
  for (const [k, v] of Object.entries(src)) {
    const parts = k.split('|');
    const isSizeKey = (parts[0] === 's' && parts.length === 2) || (parts[0] === 'cs' && parts.length === 3);
    if (!isSizeKey) { next[k] = v; continue; }
    const to = mapping.get(parts[parts.length - 1]);
    if (to === undefined) continue;
    next[[...parts.slice(0, -1), to].join('|')] = v;
  }
  const removed = Object.keys(src).filter((k) => !(k in next));
  const changed = removed.length > 0 || Object.keys(next).some((k) => src[k] !== next[k]);
  return { next, removed, changed };
}
