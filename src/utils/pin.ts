export type Role = 'master' | 'pm' | 'md';

const PIN_KEYS: Record<Role, string> = {
  master: 'md-pin-master',
  pm:     'md-pin-pm',
  md:     'md-pin-md',
};

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function setPin(role: Role, pin: string): Promise<void> {
  localStorage.setItem(PIN_KEYS[role], await sha256hex(pin));
}

export async function verifyPin(role: Role, pin: string): Promise<boolean> {
  const stored = localStorage.getItem(PIN_KEYS[role]);
  if (!stored) return false;
  return (await sha256hex(pin)) === stored;
}

export function hasPinSet(role: Role): boolean {
  return !!localStorage.getItem(PIN_KEYS[role]);
}

export function allPinsSet(): boolean {
  return hasPinSet('master') && hasPinSet('pm') && hasPinSet('md');
}
