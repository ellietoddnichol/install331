import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient, isSupabaseBrowserConfigured } from '../client/supabaseBrowser.ts';

interface AuthContextValue {
  /** True until client storage / Supabase session has been read (avoids auth flash on hard refresh). */
  isLoading: boolean;
  isAuthenticated: boolean;
  userEmail: string | null;
  signIn: (email: string, password: string, remember: boolean) => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AUTH_KEY = 'brighten-auth-email';

function safeGetLegacyAuthEmail(): string | null {
  try {
    return localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY);
  } catch {
    return null;
  }
}

function safeSetAuthEmail(value: string): void {
  try {
    localStorage.setItem(AUTH_KEY, value);
  } catch {
    /* ignore */
  }
}

function safeSetSessionAuthEmail(value: string): void {
  try {
    sessionStorage.setItem(AUTH_KEY, value);
  } catch {
    /* ignore */
  }
}

function safeClearAuthEmail(): void {
  try {
    localStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(AUTH_KEY);
  } catch {
    /* ignore */
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const supabaseConfigured = isSupabaseBrowserConfigured();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      void supabase.auth.getSession().then(({ data }) => {
        setUserEmail(data.session?.user?.email ?? null);
        setAuthReady(true);
      });
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setUserEmail(session?.user?.email ?? null);
      });
      return () => subscription.unsubscribe();
    }

    setUserEmail(safeGetLegacyAuthEmail());
    setAuthReady(true);
    return undefined;
  }, [supabaseConfigured]);

  /**
   * Multi-path authentication waterfall (ordered by preference):
   *
   * 1. Supabase Auth (if VITE_SUPABASE_URL is configured)
   *    - Production-ready, full user management
   *    - Requires Supabase project setup
   *
   * 2. Server Password Session (if AUTH_LOGIN_PASSWORD is set)
   *    - Simple password check + HTTP-only cookie
   *    - Suitable for single-user or small team deployments
   *
   * 3. Legacy Client-Only Fallback (if neither Supabase nor password is configured)
   *    - Accepts any password, stores email in localStorage
   *    - NOT production-safe, intentionally kept for local dev convenience
   *    - Controlled by absence of both Supabase and AUTH_LOGIN_PASSWORD
   *
   * The server still enforces requireSession middleware on /api/v1/* routes.
   */
  async function signIn(email: string, password: string, remember: boolean): Promise<boolean> {
    if (!email.trim() || !password.trim()) return false;
    const normalizedEmail = email.trim().toLowerCase();

    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (!error) {
        setUserEmail(normalizedEmail);
        return true;
      }
      /* Fall through to server password session when Supabase rejects credentials. */
    }

    try {
      const res = await fetch('/api/v1/auth/password-login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      if (res.ok) {
        if (remember) {
          try {
            sessionStorage.removeItem(AUTH_KEY);
          } catch {
            /* ignore */
          }
          safeSetAuthEmail(normalizedEmail);
        } else {
          try {
            localStorage.removeItem(AUTH_KEY);
          } catch {
            /* ignore */
          }
          safeSetSessionAuthEmail(normalizedEmail);
        }
        setUserEmail(normalizedEmail);
        return true;
      }
    } catch {
      /* ignore */
    }

    /* Legacy client-only fallback when server auth is not configured (AUTH_REQUIRED=0). */
    const supabaseLegacy = getSupabaseBrowserClient();
    if (supabaseLegacy) return false;

    if (remember) {
      try {
        sessionStorage.removeItem(AUTH_KEY);
      } catch {
        /* ignore */
      }
      safeSetAuthEmail(normalizedEmail);
    } else {
      try {
        localStorage.removeItem(AUTH_KEY);
      } catch {
        /* ignore */
      }
      safeSetSessionAuthEmail(normalizedEmail);
    }
    setUserEmail(normalizedEmail);
    return true;
  }

  async function signOut(): Promise<void> {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    try {
      await fetch('/api/v1/auth/password-logout', { method: 'POST', credentials: 'same-origin' });
    } catch {
      /* ignore */
    }
    safeClearAuthEmail();
    setUserEmail(null);
  }

  const value = useMemo(
    () => ({
      isLoading: !authReady,
      isAuthenticated: !!userEmail,
      userEmail,
      signIn,
      signOut,
    }),
    [userEmail, authReady]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
