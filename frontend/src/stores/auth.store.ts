import { create } from 'zustand';
import type { User } from '@/types';

interface AuthState {
  /** Access token lives in memory only; the refresh token is an HttpOnly cookie. */
  token: string | null;
  user: User | null;
  /** True once the initial silent-refresh attempt has finished (success or not). */
  ready: boolean;
  setSession: (token: string, user: User) => void;
  setUser: (user: User) => void;
  setReady: () => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  token: null,
  user: null,
  ready: false,
  setSession: (token, user) => set({ token, user, ready: true }),
  setUser: (user) => set({ user }),
  setReady: () => set({ ready: true }),
  clear: () => set({ token: null, user: null, ready: true }),
}));
