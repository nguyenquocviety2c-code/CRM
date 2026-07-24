import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Public staff profile returned by /api/auth/me. Never includes the password.
 */
export interface AuthUser {
  id: string;
  name: string;
  username?: string | null;
  email?: string | null;
  role?: string | null;
  avatar?: string | null;
  groupName?: string | null;
  groupId?: string | null;
  permissions?: Record<string, boolean>;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean; // true while the initial /api/auth/me fetch is in-flight
  /** Hydrate the store from the server cookie (call once on app mount). */
  fetchUser: () => Promise<void>;
  /**
   * Re-fetch the current user's profile (incl. permissions) WITHOUT the
   * logout-on-failure behavior of `fetchUser`. Use this to refresh the
   * session after a permissions change so permission-gated UI updates
   * immediately. On any error it keeps the existing user intact (no
   * redirect to /login).
   */
  refreshSession: () => Promise<void>;
  /** Log in with a username/email + password. Returns {ok, error?}. */
  login: (login: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  /** Log out (clears the cookie + store). */
  logout: () => Promise<void>;
  /** Check if the current user has a specific permission. */
  hasPermission: (action: string) => boolean;
}

/**
 * The auth store uses `persist` to save the `user` object in localStorage.
 * This prevents losing the session on Fast Refresh (when code edits trigger
 * a remount of Providers): the store restores `user` from localStorage
 * immediately, so the Shell guard doesn't redirect to /login while
 * `fetchUser()` is re-validating with the server.
 *
 * `loading` is NOT persisted — it starts as `true` on every mount so
 * `fetchUser()` runs to re-validate. But because `user` is already restored,
 * the Shell guard sees a non-null user and doesn't redirect.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      loading: true,

      fetchUser: async () => {
        try {
          const res = await fetch("/api/auth/me");
          const json = await res.json();
          if (json.ok && json.data) {
            set({ user: json.data as AuthUser, loading: false });
          } else {
            // Server says not logged in (cookie expired or invalid). Clear
            // the persisted user so the guard redirects to /login.
            set({ user: null, loading: false });
          }
        } catch {
          // Network error — keep the persisted user (optimistic) but mark
          // loading as done so the guard can proceed. The httpOnly cookie
          // is the real source of truth; if it's still valid, the next
          // fetchUser will restore the user.
          set({ loading: false });
        }
      },

      refreshSession: async () => {
        // Re-fetch the profile (incl. permissions) but NEVER clear the user
        // on failure — this is a silent refresh used after a permissions
        // change. The session cookie is unaffected by that change, so a
        // failure here is transient and shouldn't log the user out.
        try {
          const res = await fetch("/api/auth/me");
          const json = await res.json();
          if (json.ok && json.data) {
            set({ user: json.data as AuthUser });
          }
          // On !ok or network error: keep the existing user intact.
        } catch {
          /* keep existing user */
        }
      },

      login: async (login, password) => {
        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login, password }),
          });
          const json = await res.json();
          if (!json.ok) {
            return { ok: false, error: json.error || "Đăng nhập thất bại" };
          }
          set({ user: json.data as AuthUser, loading: false });
          return { ok: true };
        } catch {
          return { ok: false, error: "Đăng nhập thất bại" };
        }
      },

      logout: async () => {
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } catch {
          /* ignore — clear local state regardless */
        }
        set({ user: null });
      },

      hasPermission: (action: string) => {
        const { user } = get();
        if (!user?.permissions) return false;
        return user.permissions[action] === true;
      },
    }),
    {
      name: "crm-auth",
      // Only persist the `user` object — NOT `loading` (which should start
      // true on every mount so fetchUser re-validates).
      partialize: (state) => ({ user: state.user }),
    }
  )
);
