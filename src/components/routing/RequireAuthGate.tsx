import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.tsx';
import { RouteFallback } from '../RouteFallback.tsx';

/** Auth gate for the authenticated branch of the route tree; child routes render via `<Outlet />`. */
export function RequireAuthGate() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <RouteFallback label="Checking session…" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/signin" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
