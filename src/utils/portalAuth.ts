import { type Role, ALL_ROLES } from './pin';

const PORTAL_URL = import.meta.env.VITE_PORTAL_URL as string | undefined;

interface VerifyResult {
  valid: boolean;
  user?: {
    uid: string;
    email: string;
    name: string;
    slug: string;
    dashboardRole: string;
  };
}

export async function verifyPortalToken(token: string): Promise<Role | null> {
  const baseUrl = PORTAL_URL || window.location.ancestorOrigins?.[0] || '';
  if (!baseUrl) return null;

  try {
    const res = await fetch(`${baseUrl}/api/auth/verify-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) return null;

    const data: VerifyResult = await res.json();
    if (!data.valid || !data.user) return null;

    const role = data.user.dashboardRole;
    if ((ALL_ROLES as readonly string[]).includes(role)) {
      return role as Role;
    }
    if (role === 'admin') return 'master';
    return null;
  } catch {
    return null;
  }
}

export function getPortalToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('portal_token');
}

export function cleanPortalToken(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('portal_token');
  window.history.replaceState({}, '', url.toString());
}
