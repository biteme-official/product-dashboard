/**
 * 예전 채널명 → 지금 채널명 (읽을 때 변환, DB는 이관 스크립트로 한 번에 정리).
 * 2026-10: '사입및페어'를 '사입'(B2B) · '팝업/페어'(B2C)로 분리 — 기존 수량 · 판매가 선택 · 비중은 전부 '팝업/페어'로 이관.
 */
export const LEGACY_CHANNEL_RENAME: Record<string, string> = { '사입및페어': '팝업/페어' };

const rename = (ch: unknown) => (typeof ch === 'string' && ch in LEGACY_CHANNEL_RENAME ? LEGACY_CHANNEL_RENAME[ch] : ch);

/** { channel, ... } 배열 — 같은 칸에 새 이름 값이 이미 있으면 새 이름 값을 남김 */
function renameEntries(arr: unknown): unknown {
  if (!Array.isArray(arr) || !arr.some((e) => e && typeof e === 'object' && (e as { channel?: unknown }).channel as string in LEGACY_CHANNEL_RENAME)) return arr;
  const keyOf = (e: { channel?: unknown; month?: unknown }) => `${String(e.channel)}|${String(e.month ?? '')}`;
  const taken = new Set(arr.filter((e) => !((e?.channel as string) in LEGACY_CHANNEL_RENAME)).map(keyOf));
  const out: unknown[] = [];
  for (const e of arr) {
    if (!e || typeof e !== 'object' || !((e.channel as string) in LEGACY_CHANNEL_RENAME)) { out.push(e); continue; }
    const next = { ...e, channel: rename(e.channel) };
    if (!taken.has(keyOf(next))) out.push(next);
  }
  return out;
}

/** "채널-월" 키 맵 (pricingOpts) */
function renameKeys(map: unknown): unknown {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return map;
  const src = map as Record<string, unknown>;
  const olds = Object.keys(LEGACY_CHANNEL_RENAME);
  if (!Object.keys(src).some((k) => olds.some((o) => k.startsWith(`${o}-`)))) return map;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) if (!olds.some((o) => k.startsWith(`${o}-`))) out[k] = v;
  for (const [k, v] of Object.entries(src)) {
    const o = olds.find((x) => k.startsWith(`${x}-`));
    if (!o) continue;
    const nk = `${LEGACY_CHANNEL_RENAME[o]}${k.slice(o.length)}`;
    if (!(nk in out)) out[nk] = v;
  }
  return out;
}

const ENTRY_FIELDS = ['channelRatios', 'channelMonthlySplit', 'channelMonthQty', 'channelPricing', 'step2InitBaselineQty'] as const;

/** SKU 문서(원본)에서 예전 채널명을 지금 이름으로 — 바뀐 게 없으면 같은 객체를 그대로 반환 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function renameLegacyChannels<T extends Record<string, any>>(raw: T): T {
  if (!raw || typeof raw !== 'object') return raw;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, any> = { ...raw };
  let changed = false;
  for (const f of ENTRY_FIELDS) {
    const next = renameEntries(raw[f]);
    if (next !== raw[f]) { out[f] = next; changed = true; }
  }
  const opts = renameKeys(raw.pricingOpts);
  if (opts !== raw.pricingOpts) { out.pricingOpts = opts; changed = true; }
  if (raw._initialSnapshot && typeof raw._initialSnapshot === 'object') {
    const snap = renameLegacyChannels(raw._initialSnapshot);
    if (snap !== raw._initialSnapshot) { out._initialSnapshot = snap; changed = true; }
  }
  return (changed ? out : raw) as T;
}
