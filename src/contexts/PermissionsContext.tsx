import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_PERMISSIONS, subscribePermissions, type RolePermission } from '../utils/permissions';
import { ALL_ROLES, type Role } from '../utils/pin';

type PermMap = Record<Role, RolePermission>;

const defaultMap: PermMap = { ...DEFAULT_PERMISSIONS };

const PermissionsContext = createContext<PermMap>(defaultMap);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [perms, setPerms] = useState<PermMap>(defaultMap);

  useEffect(() => {
    return subscribePermissions((p) => setPerms({ ...p }));
  }, []);

  return (
    <PermissionsContext.Provider value={perms}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermission(role: Role | null | undefined): RolePermission {
  const ctx = useContext(PermissionsContext);
  if (!role || !ALL_ROLES.includes(role)) return DEFAULT_PERMISSIONS.cs;
  return ctx[role];
}
