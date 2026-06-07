import { create } from 'zustand';
import type { Role } from '../utils/pin';

const SESSION_KEY = 'md-auth-role';
const STORAGE = localStorage;

interface AuthStore {
  role: Role | null;
  setRole: (role: Role) => void;
  logout: () => void;
}

export const useAuth = create<AuthStore>((set) => ({
  role: STORAGE.getItem(SESSION_KEY) as Role | null,
  setRole: (role) => {
    STORAGE.setItem(SESSION_KEY, role);
    set({ role });
  },
  logout: () => {
    STORAGE.removeItem(SESSION_KEY);
    set({ role: null });
  },
}));
