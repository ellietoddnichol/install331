import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AuthPageChrome } from '../components/auth/AuthPageChrome.tsx';
import { getSupabaseBrowserClient } from '../client/supabaseBrowser.ts';
import { useAuth } from '../context/AuthContext.tsx';

export function ForgotPassword() {
  const { isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [sending, setSending] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError('');
    setInfo('');

    const form = event.currentTarget;
    const emailEl = form.elements.namedItem('email');
    const emailVal = (emailEl instanceof HTMLInputElement ? emailEl.value : email).trim();

    if (!emailVal) {
      setError('Enter your email address.');
      setSending(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError('Password reset is not configured. Contact an administrator.');
      setSending(false);
      return;
    }

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(emailVal.toLowerCase(), {
      redirectTo: origin ? `${origin}/signin` : undefined,
    });

    setSending(false);
    if (resetErr) {
      setError(resetErr.message || 'Could not send reset email.');
      return;
    }

    setInfo(
      'If an account exists for that email, Supabase will send a reset link. Check spam and your Supabase Auth redirect URL settings.',
    );
  }

  return (
    <AuthPageChrome
      title="Forgot password"
      subtitle="We will email you a link to reset your password."
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

        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        {info ? <p className="text-xs text-slate-600">{info}</p> : null}

        <button type="submit" disabled={sending} className="ui-btn-primary h-10 w-full disabled:opacity-50">
          {sending ? 'Sending…' : 'Send reset link'}
        </button>

        <p className="text-xs text-slate-500 text-center">
          <Link to="/signin" className="text-blue-700 hover:text-blue-800">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthPageChrome>
  );
}
