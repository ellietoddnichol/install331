
import React from 'react';
import { AppShell } from './shell/AppShell';

export function Layout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
