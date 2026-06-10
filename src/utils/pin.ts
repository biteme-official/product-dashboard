import { doc, getDoc, setDoc } from 'firebase/firestore';
import { fsdb } from '../lib/firebase';

export type Role = 'master' | 'pm' | 'platform_md' | 'brand_md' | 'global';

export const ALL_ROLES: readonly Role[] = ['master', 'pm', 'platform_md', 'brand_md', 'global'] as const;
export const MD_ROLES: readonly Role[] = ['platform_md', 'brand_md', 'global'] as const;

/** platform_md / brand_md / global 여부 확인 */
export const isMdRole = (role: Role | null | undefined): boolean =>
  !!(role && (MD_ROLES as readonly string[]).includes(role));

const PINS_DOC = doc(fsdb, 'config', 'pins');

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Firestore에서 PIN 해시 맵 가져오기
async function fetchPins(): Promise<Record<string, string>> {
  const snap = await getDoc(PINS_DOC);
  return (snap.exists() ? snap.data() : {}) as Record<string, string>;
}

export async function setPin(role: Role, pin: string): Promise<void> {
  const hash = await sha256hex(pin);
  await setDoc(PINS_DOC, { [role]: hash }, { merge: true });
}

export async function verifyPin(role: Role, pin: string): Promise<boolean> {
  const pins = await fetchPins();
  const stored = pins[role];
  if (!stored) return false;
  return (await sha256hex(pin)) === stored;
}

// 모든 역할의 PIN이 Firestore에 설정되어 있는지 확인
export async function allPinsSet(): Promise<boolean> {
  const pins = await fetchPins();
  return ALL_ROLES.every((r) => !!pins[r]);
}
