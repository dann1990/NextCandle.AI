import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Erro inesperado ao renderizar a aplicação.',
    };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('NextCandle ErrorBoundary capturou erro:', error, info.componentStack);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900/90 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" aria-hidden="true" />
              <h1 className="text-lg font-bold text-white">Falha ao carregar o NextCandle.AI</h1>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              Ocorreu um erro inesperado na interface do navegador. Tente recarregar a página para
              restaurar o terminal.
            </p>
            {this.state.errorMessage && (
              <p className="text-xs font-mono text-rose-300 bg-rose-950/40 border border-rose-900/60 rounded-lg p-3 break-words">
                {this.state.errorMessage}
              </p>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full h-11 rounded-xl bg-[#7c5dfa] hover:bg-[#6d4ef2] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Recarregar Aplicação
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
