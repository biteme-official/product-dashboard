import { create } from 'zustand';
import type { Role } from '../utils/pin';

const SESSION_KEY = 'md-auth-role';

interface AuthStore {
  role: Role | null;
  setRole: (role: Role) => void;
  logout: () => void;
}

export const useAuth = create<AuthStore>((set) => ({
  role: sessionStorage.getItem(SESSION_KEY) as Role | null,
  setRole: (role) => {
    sessionStorage.setItem(SESSION_KEY, role);
    set({ role });
  },
  logout: () => {
    sessionStorage.removeItem(SESSION_KEY);
    set({ role: null });
  },
}));
