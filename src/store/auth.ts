import { create } from 'zustand';
import { type Role, ALL_ROLES } from '../utils/pin';

const SESSION_KEY = 'md-auth-role';
const STORAGE = localStorage;

function readStoredRole(): Role | null {
  const stored = STORAGE.getItem(SESSION_KEY);
  return stored && (ALL_ROLES as readonly string[]).includes(stored)
    ? (stored as Role)
    : null;
}

interface AuthStore {
  role: Role | null;
  setRole: (role: Role) => void;
  logout: () => void;
}

export const useAuth = create<AuthStore>((set) => ({
  role: readStoredRole(),
  setRole: (role) => {
    STORAGE.setItem(SESSION_KEY, role);
    set({ role });
  },
  logout: () => {
    STORAGE.removeItem(SESSION_KEY);
    set({ role: null });
  },
}));
