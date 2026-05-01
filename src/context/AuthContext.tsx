import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient, isSupabaseBrowserConfigured } from '../client/supabaseBrowser.ts';

export type SignInResult = { ok: true } | { ok: false; message: string };

interface AuthContextValue {
  /** True until client storage / Supabase session has been read (avoids auth flash on hard refresh). */
  isLoading: boolean;
  isAuthenticated: boolean;
  userEmail: string | null;
  signIn: (email: string, password: string, remember: boolean) => Promise<SignInResult>;
  signOut: () => Promise<void>;
}

const AUTH_KEY = 'brighten-auth-email';

/** User-safe copy for Supabase GoTrue errors (sign-in only). */
function mapSupabaseSignInError(error: { message?: string; code?: string }): string {
  const code = String(error.code || '').toLowerCase();
  const msg = String(error.message || '').toLowerCase();

  if (
    code === 'email_not_confirmed' ||
    msg.includes('email not confirmed') ||
    (msg.includes('confirm') && msg.includes('email'))
  ) {
    return 'This email is not confirmed yet. Use the confirmation link from Supabase, or confirm the user in Supabase Auth → Users.';
  }

  if (
    code === 'too_many_requests' ||
    msg.includes('too many requests') ||
    msg.includes('rate limit') ||
    msg.includes('security purposes')
  ) {
    return 'Too many sign-in attempts. Wait a few minutes and try again.';
  }

  if (code === 'user_banned' || msg.includes('user is banned') || msg.includes('banned')) {
    return 'This account is disabled in Supabase. Ask an administrator to unban the user.';
  }

  return 'Invalid email or password. If your password manager is locked, unlock it or paste the password manually.';
}

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

  async function signIn(email: string, password: string, remember: boolean): Promise<SignInResult> {
    if (!email.trim() || !password.trim()) {
      return { ok: false, message: 'Enter your email and password to continue.' };
    }
    const normalizedEmail = email.trim().toLowerCase();

    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error) {
        const errMeta = error as { message?: string; code?: string; status?: number };
        console.warn('[auth] signInWithPassword failed — open DevTools → Console for details.', {
          message: errMeta.message,
          code: errMeta.code,
          status: errMeta.status,
        });
        return {
          ok: false,
          message: mapSupabaseSignInError(error),
        };
      }
      setUserEmail(normalizedEmail);
      return { ok: true };
    }

    /* Local dev fallback when Vite Supabase env is not set (AUTH_REQUIRED=0 on server). */
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
    return { ok: true };
  }

  async function signOut(): Promise<void> {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
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
