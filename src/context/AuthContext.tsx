import React, { createContext, useContext, useMemo, useState } from 'react';

interface AuthContextValue {
  isAuthenticated: boolean;
  userEmail: string | null;
  signIn: (email: string, password: string, remember: boolean) => Promise<boolean>;
  signOut: () => void;
}

const AUTH_KEY = 'brighten-auth-email';

function safeGetAuthEmail(): string | null {
  try {
    return localStorage.getItem(AUTH_KEY);
  } catch {
    return null;
  }
}

function safeSetAuthEmail(value: string): void {
  try {
    localStorage.setItem(AUTH_KEY, value);
  } catch {
    // Ignore storage failures; keep auth in-memory for current session.
  }
}

function safeClearAuthEmail(): void {
  try {
    localStorage.removeItem(AUTH_KEY);
  } catch {
    // Ignore storage failures; in-memory state still updates.
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userEmail, setUserEmail] = useState<string | null>(() => safeGetAuthEmail());

  async function signIn(email: string, password: string, remember: boolean): Promise<boolean> {
    if (!email.trim() || !password.trim()) return false;

    const normalizedEmail = email.trim().toLowerCase();

    if (remember) {
      safeSetAuthEmail(normalizedEmail);
    } else {
      safeClearAuthEmail();
    }

    setUserEmail(normalizedEmail);
    return true;
  }

  function signOut() {
    safeClearAuthEmail();
    setUserEmail(null);
  }

  const value = useMemo(
    () => ({
      isAuthenticated: !!userEmail,
      userEmail,
      signIn,
      signOut,
    }),
    [userEmail]
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
