import React from 'react';
import { Wrench } from 'lucide-react';

export function AuthPageChrome({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(1000px_560px_at_10%_-10%,#ffffff_0%,#e9eef6_58%,#dbe5f3_100%)] grid place-items-center p-6">
      <div className="w-full max-w-[980px] grid grid-cols-1 md:grid-cols-[1.15fr_0.85fr] rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.15)] overflow-hidden">
        <section className="hidden md:flex flex-col justify-between p-8 bg-[#0f1f37] text-slate-200">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Brighten Builders</p>
            <h2 className="mt-3 text-[30px] leading-tight font-semibold text-white">Estimator Operating System</h2>
            <p className="mt-3 text-sm text-slate-300 max-w-md">
              Bid faster with structured takeoff import, catalog-driven estimating, bundle workflows, and client-ready
              proposal output.
            </p>
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
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
          {children}
        </section>
      </div>
    </div>
  );
}
