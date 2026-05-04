import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.tsx';
import { QueryProvider } from './providers/QueryProvider.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { appRouter } from './router.tsx';

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <QueryProvider>
          <RouterProvider router={appRouter} />
        </QueryProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
