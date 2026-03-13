import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Wrench } from 'lucide-react';
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

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');

    const ok = await signIn(email, password, remember);
    if (!ok) {
      setError('Enter your email and password to continue.');
      setSaving(false);
      return;
    }

    navigate(destination, { replace: true });
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(1000px_560px_at_10%_-10%,#ffffff_0%,#e9eef6_58%,#dbe5f3_100%)] grid place-items-center p-6">
      <div className="w-full max-w-[980px] grid grid-cols-1 md:grid-cols-[1.15fr_0.85fr] rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.15)] overflow-hidden">
        <section className="hidden md:flex flex-col justify-between p-8 bg-[#0f1f37] text-slate-200">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Brighten Builders</p>
            <h2 className="mt-3 text-[30px] leading-tight font-semibold text-white">Estimator Operating System</h2>
            <p className="mt-3 text-sm text-slate-300 max-w-md">Bid faster with structured takeoff import, catalog-driven estimating, bundle workflows, and client-ready proposal output.</p>
          </div>
          <div className="text-xs text-slate-400">Secure sign-in required to access project workflows.</div>
        </section>

        <section className="px-6 py-6 md:px-8 md:py-7">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-800 grid place-items-center">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-slate-500">Brighten / CWA Install</p>
              <p className="text-sm font-semibold text-slate-900">Estimator Platform</p>
            </div>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Sign In</h1>
          <p className="text-sm text-slate-500 mt-1">Access your estimates, takeoffs, and proposals.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-xs font-medium text-slate-600">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="ui-input mt-1 h-10"
              placeholder="you@company.com"
            />
          </label>

          <label className="block text-xs font-medium text-slate-600">
            Password
            <input
              type="password"
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
            <Link to="#" className="text-blue-700 hover:text-blue-800">Forgot password?</Link>
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
            Need access? <Link to="#" className="text-blue-700 hover:text-blue-800">Create account</Link>
          </p>
          </form>
        </section>
      </div>
    </div>
  );
}
