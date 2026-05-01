import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AuthPageChrome } from '../components/auth/AuthPageChrome.tsx';
import { getSupabaseBrowserClient } from '../client/supabaseBrowser.ts';
import { useAuth } from '../context/AuthContext.tsx';

export function SignUp() {
  const { isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [saving, setSaving] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setInfo('');

    const form = event.currentTarget;
    const emailEl = form.elements.namedItem('email');
    const passwordEl = form.elements.namedItem('password');
    const emailVal = (emailEl instanceof HTMLInputElement ? emailEl.value : email).trim();
    const passwordVal = (passwordEl instanceof HTMLInputElement ? passwordEl.value : password).trim();

    if (!emailVal || !passwordVal) {
      setError('Enter an email and password to create your account.');
      setSaving(false);
      return;
    }
    if (passwordVal.length < 8) {
      setError('Use at least 8 characters for your password.');
      setSaving(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError('Sign-up is not configured. Ask an administrator for access.');
      setSaving(false);
      return;
    }

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const { error: signErr } = await supabase.auth.signUp({
      email: emailVal.toLowerCase(),
      password: passwordVal,
      options: {
        emailRedirectTo: origin ? `${origin}/signin` : undefined,
      },
    });

    setSaving(false);
    if (signErr) {
      setError(signErr.message || 'Could not create account.');
      return;
    }

    setInfo(
      'Check your email to confirm your account if required. You can sign in once your email is confirmed.',
    );
  }

  return (
    <AuthPageChrome
      title="Create account"
      subtitle="Use your work email. You may need to confirm your email before signing in."
    >
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block text-xs font-medium text-slate-600">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="ui-input mt-1 h-10"
            placeholder="you@company.com"
          />
        </label>

        <label className="block text-xs font-medium text-slate-600">
          Password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="ui-input mt-1 h-10"
            placeholder="At least 8 characters"
          />
        </label>

        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        {info ? <p className="text-xs text-slate-600">{info}</p> : null}

        <button type="submit" disabled={saving} className="ui-btn-primary h-10 w-full disabled:opacity-50">
          {saving ? 'Creating account…' : 'Create account'}
        </button>

        <p className="text-xs text-slate-500 text-center">
          Already have an account?{' '}
          <Link to="/signin" className="text-blue-700 hover:text-blue-800">
            Sign in
          </Link>
        </p>
      </form>
    </AuthPageChrome>
  );
}
