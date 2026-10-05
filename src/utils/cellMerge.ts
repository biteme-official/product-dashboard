/**
 * 칸 단위 3-way 병합 — base(이 탭이 마지막으로 받은 서버 값) 대비 local에서 바뀐 칸만 server 위에 얹는다.
 * 같은 SKU의 다른 칸을 다른 사람이 동시에 고쳐도 서로 덮지 않게 하기 위함 (store/index.ts writeSkusMerged).
 */

/** 키 순서와 무관한 비교용 직렬화 */
function stable(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const obj = v as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`).join(',')}}`;
}

export function mergeQtyEntries<E extends { channel: string; month: number; qty: number }>(
  base: E[] | undefined,
  local: E[],
  server: E[] | undefined,
): E[] {
  const key = (e: { channel: string; month: number }) => `${e.channel}|${e.month}`;
  const baseMap = new Map((base ?? []).map((e) => [key(e), e.qty]));
  const out = (server ?? []).map((e) => ({ ...e }));
  const outIdx = new Map(out.map((e, i) => [key(e), i]));
  for (const e of local) {
    if (baseMap.get(key(e)) === e.qty) continue; // 이 탭이 안 바꾼 칸은 서버 값 유지
    const i = outIdx.get(key(e));
    if (i === undefined) { outIdx.set(key(e), out.length); out.push({ ...e }); }
    else out[i] = { ...out[i], qty: e.qty };
  }
  return out;
}

export function mergeRecord<V>(
  base: Record<string, V> | undefined,
  local: Record<string, V> | undefined,
  server: Record<string, V> | undefined,
): Record<string, V> {
  const out: Record<string, V> = { ...(server ?? {}) };
  for (const [k, v] of Object.entries(local ?? {})) {
    if (stable(base?.[k]) !== stable(v)) out[k] = v;
  }
  // 이 탭이 지운 키(base엔 있고 local엔 없음)는 서버에서도 지운다 — 되돌리기로 "기본값"으로 돌아갈 때 필요
  for (const k of removedKeys(base, local)) delete out[k];
  return out;
}

/** base엔 있는데 local엔 없는 키 — 저장 시 deleteField로 지워야 함 (merge 저장은 빠진 키를 지우지 않는다) */
export function removedKeys<V>(base: Record<string, V> | undefined, local: Record<string, V> | undefined): string[] {
  return Object.keys(base ?? {}).filter((k) => !(k in (local ?? {})));
}
