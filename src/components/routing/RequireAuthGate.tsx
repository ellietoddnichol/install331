import React from 'react';
import { Outlet } from 'react-router-dom';

/**
 * Auth gate disabled for local/dev: child routes render unconditionally.
 * Re-enable by restoring the `useAuth()` check + `<Navigate to="/signin" />` when needed.
 */
export function RequireAuthGate() {
  return <Outlet />;
}
