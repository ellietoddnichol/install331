import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.tsx';
import { SignIn } from '../../pages/SignIn.tsx';
import { RouteFallback } from '../RouteFallback.tsx';

export function SignInRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <RouteFallback label="Checking session…" />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <SignIn />;
}
