import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { fsdb } from '../lib/firebase';
import { ALL_ROLES, type Role } from './pin';

export type RolePermission = {
  skuBasic: boolean;
  step1: boolean;
  step2: boolean;
  projectionConfirm: boolean;
  orderConfirm: boolean;
};

export const PERM_LABELS: Record<keyof RolePermission, string> = {
  skuBasic:          'SKU 기본정보',
  step1:             'STEP1',
  step2:             'STEP2',
  projectionConfirm: '오픈일정 확정',
  orderConfirm:      '발주 확정',
};

const PERM_KEYS = Object.keys(PERM_LABELS) as (keyof RolePermission)[];

const MASTER_PERM: RolePermission = {
  skuBasic: true, step1: true, step2: true, projectionConfirm: true, orderConfirm: true,
};

export const DEFAULT_PERMISSIONS: Record<Role, RolePermission> = {
  master:      { skuBasic: true,  step1: true,  step2: true,  projectionConfirm: true,  orderConfirm: true  },
  pm:          { skuBasic: true,  step1: true,  step2: true,  projectionConfirm: true,  orderConfirm: true  },
  platform_md: { skuBasic: false, step1: false, step2: true,  projectionConfirm: true,  orderConfirm: false },
  brand_md:    { skuBasic: false, step1: false, step2: true,  projectionConfirm: true,  orderConfirm: false },
  global:      { skuBasic: false, step1: false, step2: true,  projectionConfirm: true,  orderConfirm: false },
  marketing:   { skuBasic: false, step1: false, step2: false, projectionConfirm: false, orderConfirm: false },
  cs:          { skuBasic: false, step1: false, step2: false, projectionConfirm: false, orderConfirm: false },
};

const ROLES_DOC = doc(fsdb, 'config', 'roles');

function buildPermMap(stored: Partial<Record<string, Partial<RolePermission>>>): Record<Role, RolePermission> {
  const result = {} as Record<Role, RolePermission>;
  for (const role of ALL_ROLES) {
    if (role === 'master') {
      result.master = MASTER_PERM;
      continue;
    }
    const raw = stored[role] ?? {};
    result[role] = { ...DEFAULT_PERMISSIONS[role] };
    for (const k of PERM_KEYS) {
      if (typeof raw[k] === 'boolean') result[role][k] = raw[k] as boolean;
    }
  }
  return result;
}

export function subscribePermissions(
  cb: (perms: Record<Role, RolePermission>) => void,
): () => void {
  return onSnapshot(ROLES_DOC, (snap) => {
    const stored = snap.exists()
      ? (snap.data() as Partial<Record<string, Partial<RolePermission>>>)
      : {};
    cb(buildPermMap(stored));
  });
}

export async function saveRolePermission(
  role: Exclude<Role, 'master'>,
  perm: RolePermission,
): Promise<void> {
  await setDoc(ROLES_DOC, { [role]: perm }, { merge: true });
}
