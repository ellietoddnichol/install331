import React from 'react';
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';

export function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div>
        <p className="text-sm font-semibold text-slate-500">404</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">This page does not exist</h1>
        <p className="mt-2 max-w-md text-sm text-slate-600">
          The link may be broken or the address was mistyped. Use the sidebar or go back to the dashboard.
        </p>
      </div>
      <Link
        to="/"
        className="ui-btn-primary inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium"
      >
        <Home className="h-4 w-4" />
        Back to dashboard
      </Link>
    </div>
  );
}
