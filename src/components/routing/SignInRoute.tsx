import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * Sign-in disabled for local/dev: any visit to `/signin` bounces to the dashboard.
 * Re-enable by restoring the `useAuth()` branch + `<SignIn />` when needed.
 */
export function SignInRoute() {
  return <Navigate to="/" replace />;
}
