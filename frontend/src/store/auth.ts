import { create } from "zustand";
import type { User } from "../lib/api";

const TOKEN_KEY = "am_token";
const USER_KEY = "am_user";

/** Read the persisted JWT. Exported so the API client can attach it without a
 *  store import cycle. Safe in non-browser contexts (returns null). */
export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function persist(token: string | null, user: User | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);

    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* storage unavailable (e.g. private mode) — keep in-memory state only */
  }
}

export interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  /** Store credentials after a successful login/register and persist them. */
  setAuth: (token: string, user: User) => void;
  /** Refresh just the user object (e.g. after re-validating the token). */
  setUser: (user: User) => void;
  /** Clear credentials from memory and storage. */
  logout: () => void;
  /** Restore credentials from localStorage on app start. */
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  isAuthenticated: false,

  setAuth: (token, user) => {
    persist(token, user);
    set({ token, user, isAuthenticated: true });
  },

  setUser: (user) => {
    persist(get().token, user);
    set({ user });
  },

  logout: () => {
    persist(null, null);
    set({ token: null, user: null, isAuthenticated: false });
  },

  hydrate: () => {
    const token = getStoredToken();
    const user = getStoredUser();
    set({ token, user, isAuthenticated: token != null });
  },
}));
