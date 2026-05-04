import React, { Suspense, lazy } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.tsx';
import { RouteFallback } from '../RouteFallback.tsx';

const SignUp = lazy(() => import('../../pages/SignUp.tsx').then((m) => ({ default: m.SignUp })));

export function SignUpRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <RouteFallback label="Checking session…" />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <Suspense fallback={<RouteFallback label="Loading…" />}>
      <SignUp />
    </Suspense>
  );
}
