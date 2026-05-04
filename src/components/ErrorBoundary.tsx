import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface ErrorBoundaryProps {
  children?: ReactNode;
  /** `page` keeps shell/nav usable when a single route throws. */
  variant?: 'root' | 'page';
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare readonly props: Readonly<ErrorBoundaryProps>;
  public state: ErrorBoundaryState;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  get variant(): 'root' | 'page' {
    return this.props.variant ?? 'root';
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected application error',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const scope = this.props.variant === 'page' ? 'Page' : 'App';
    console.error(`${scope} render error:`, error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.variant === 'page') {
        return (
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-5 text-left">
            <h2 className="text-sm font-semibold text-red-800">This view failed to load</h2>
            <p className="mt-1 text-xs text-slate-600">
              Try another page from the sidebar, or reload. If this continues, copy the message below for support.
            </p>
            {this.state.message ? (
              <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-white/80 p-2 text-left font-mono text-[11px] text-slate-800 ring-1 ring-slate-200/80">
                {this.state.message}
              </pre>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to="/"
                className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-50"
              >
                Dashboard
              </Link>
              <button
                type="button"
                className="h-8 rounded-md bg-blue-700 px-3 text-xs font-medium text-white hover:bg-blue-800"
                onClick={() => window.location.reload()}
              >
                Reload
              </button>
            </div>
          </div>
        );
      }

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

    return this.props.children ?? null;
  }
}
