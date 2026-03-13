// @ts-nocheck
import React, { type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';

type ErrorBoundaryProps = PropsWithChildren<{}>;

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected application error',
    };
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    // Keep error details in console for debugging while presenting a readable fallback UI.
    console.error('App render error:', error);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#f3f5f8] p-6 grid place-items-center">
          <div className="w-full max-w-xl rounded-xl border border-red-200 bg-white p-5 shadow-sm">
            <h1 className="text-lg font-semibold text-red-700">App failed to load</h1>
            <p className="mt-2 text-sm text-slate-600">
              The app hit a runtime error while rendering. Refresh once, and if this persists, share this message with support.
            </p>
            <pre className="mt-3 overflow-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">
              {this.state.message}
            </pre>
            <button
              className="mt-4 h-9 rounded-md bg-blue-700 px-3 text-sm font-medium text-white hover:bg-blue-800"
              onClick={() => window.location.reload()}
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
