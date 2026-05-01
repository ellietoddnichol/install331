import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthPageChrome } from '../components/auth/AuthPageChrome.tsx';
import { useAuth } from '../context/AuthContext';

export function SignIn() {
  const { isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const destination = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/';

  if (isAuthenticated) {
    return <Navigate to={destination} replace />;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');

    const form = event.currentTarget;
    const emailEl = form.elements.namedItem('email');
    const passwordEl = form.elements.namedItem('password');
    const emailVal =
      (emailEl instanceof HTMLInputElement ? emailEl.value : email).trim();
    const passwordVal =
      (passwordEl instanceof HTMLInputElement ? passwordEl.value : password).trim();

    const result = await signIn(emailVal, passwordVal, remember);
    if (!result.ok) {
      setError(result.message);
      setSaving(false);
      return;
    }

    navigate(destination, { replace: true });
  }

  return (
    <AuthPageChrome title="Sign In" subtitle="Access your estimates, takeoffs, and proposals.">
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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="ui-input mt-1 h-10"
            placeholder="Enter password"
          />
        </label>

        <div className="flex items-center justify-between text-xs">
          <label className="text-slate-600 flex items-center gap-2">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember me
          </label>
          <Link to="/forgot-password" className="text-blue-700 hover:text-blue-800">
            Forgot password?
          </Link>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="ui-btn-primary h-10 w-full disabled:opacity-50"
        >
          {saving ? 'Signing In...' : 'Sign In'}
        </button>

        <p className="text-xs text-slate-500 text-center">
          Need access?{' '}
          <Link to="/signup" className="text-blue-700 hover:text-blue-800">
            Create account
          </Link>
        </p>
      </form>
    </AuthPageChrome>
  );
}
