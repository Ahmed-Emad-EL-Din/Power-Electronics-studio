import React from 'react';
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  name?: string;
  resetKey?: string | number;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error(`[ErrorBoundary:${this.props.name || 'Workspace'}]`, error, info);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="bg-white dark:bg-[#14171f] border border-rose-300 dark:border-rose-500/40 rounded-xl p-5 space-y-3"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-1">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-[#eef0f6]">
                {this.props.name ? `${this.props.name} encountered a rendering error` : 'View encountered an error'}
              </h3>
              <p className="text-xs font-mono text-rose-700 dark:text-rose-300 break-words">
                {this.state.errorMessage || 'Unexpected module or solver error'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry View
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-[#1c202b] border border-slate-300 dark:border-white/[0.12] text-slate-700 dark:text-[#eef0f6] cursor-pointer"
            >
              Reload Studio
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export const WorkbenchSkeleton: React.FC<{ label?: string }> = ({ label = 'Loading module…' }) => (
  <div
    role="status"
    aria-live="polite"
    className="bg-white dark:bg-[#14171f] border border-slate-200 dark:border-white/[0.08] rounded-xl p-4 sm:p-5 space-y-4 animate-pulse"
  >
    <div className="flex items-center justify-between gap-2">
      <div className="inline-flex items-center gap-2 text-xs font-mono text-blue-700 dark:text-blue-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div className="h-4 w-24 rounded bg-slate-200 dark:bg-white/[0.07]" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="h-20 rounded-lg bg-slate-100 dark:bg-white/[0.04]" />
      <div className="h-20 rounded-lg bg-slate-100 dark:bg-white/[0.04]" />
      <div className="h-20 rounded-lg bg-slate-100 dark:bg-white/[0.04]" />
    </div>
    <div className="h-56 rounded-lg bg-slate-100 dark:bg-white/[0.04]" />
  </div>
);

export const ModalLoadingFallback: React.FC<{ label?: string }> = ({ label = 'Loading panel…' }) => (
  <div
    role="status"
    aria-live="polite"
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px]"
  >
    <div className="px-4 py-3 rounded-xl bg-white dark:bg-[#14171f] border border-slate-200 dark:border-white/[0.12] shadow-2xl inline-flex items-center gap-2.5 text-xs font-mono text-slate-800 dark:text-[#eef0f6]">
      <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" aria-hidden="true" />
      <span>{label}</span>
    </div>
  </div>
);
