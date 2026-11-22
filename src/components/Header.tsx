import React from 'react';
import { ShieldCheck, Shield, History, BookOpen, Volume2, VolumeX, LogOut } from 'lucide-react';
import { NextCandleBrandLogo } from './NextCandleBrandLogo';

interface HeaderProps {
  onOpenHistory: () => void;
  onOpenArchitecture: () => void;
  historyCount: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  userEmail?: string;
  userRole?: 'admin' | 'tester';
  isAdminViewOpen?: boolean;
  onToggleAdminView?: () => void;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenHistory,
  onOpenArchitecture,
  historyCount,
  soundEnabled,
  onToggleSound,
  userEmail,
  userRole,
  isAdminViewOpen,
  onToggleAdminView,
  onLogout,
}) => {
  return (
    <header className="border-b border-slate-800 bg-[#0b0f19]/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Zone 1: Brand Wordmark & Attached Logo */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center shrink-0">
            <NextCandleBrandLogo variant="icon" className="w-8 h-8 sm:w-10 sm:h-10" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-lg font-bold tracking-tight text-white whitespace-nowrap">
                Next<span className="font-normal text-slate-300">Candle</span>
              </span>
            </div>
            <p className="hidden sm:block text-[11px] text-slate-400 leading-none whitespace-nowrap">
              Terminal Quantitativo · Visão Computacional
            </p>
          </div>
        </div>

        {/* Zone 2: Navigation & Status */}
        <nav className="flex items-center gap-1.5 sm:gap-2.5 lg:gap-3 text-sm font-medium text-slate-400 shrink-0">
          <div className="hidden xl:flex items-center gap-2 text-xs font-mono text-emerald-400/90 bg-emerald-950/40 border border-emerald-800/50 px-2.5 py-1 rounded-md whitespace-nowrap">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Regra de Consenso: 80% (4 em 5)</span>
          </div>

          <button
            type="button"
            onClick={onToggleSound}
            aria-pressed={soundEnabled}
            aria-label={soundEnabled ? 'Silenciar notificações sonoras' : 'Ativar notificações sonoras'}
            data-testid="sound-toggle-btn"
            title={
              soundEnabled
                ? 'Notificações sonoras discretas ativadas (clique para silenciar)'
                : 'Notificações sonoras silenciadas (clique para ativar)'
            }
            className={`transition-colors whitespace-nowrap shrink-0 flex items-center justify-center gap-1.5 text-xs border h-8 sm:h-auto px-2 sm:px-2.5 sm:py-1.5 rounded-lg cursor-pointer ${
              soundEnabled
                ? 'text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/50 border-emerald-800/60'
                : 'text-slate-400 bg-slate-900/80 hover:bg-slate-800 border-slate-800 hover:text-slate-200'
            }`}
          >
            {soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-slate-500" />
            )}
            <span className="hidden md:inline font-mono">
              {soundEnabled ? 'Som Ativo' : 'Silenciado'}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenArchitecture}
            aria-label="Como Funciona os 5 Agentes"
            title="Como Funciona os 5 Agentes"
            className="hover:text-slate-200 transition-colors whitespace-nowrap shrink-0 flex items-center justify-center gap-1.5 text-xs text-slate-300 bg-slate-900/80 sm:bg-transparent hover:bg-slate-800 sm:hover:bg-transparent border border-slate-800 sm:border-transparent h-8 sm:h-auto px-2 sm:px-1 rounded-lg cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Como Funciona os 5 Agentes</span>
            <span className="hidden sm:inline lg:hidden">Agentes</span>
          </button>

          <button
            type="button"
            onClick={onOpenHistory}
            aria-label={`Histórico (${historyCount})`}
            className="hover:text-slate-200 transition-colors whitespace-nowrap shrink-0 flex items-center justify-center gap-1.5 text-xs text-slate-300 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 h-8 sm:h-auto px-2 sm:px-3 sm:py-1.5 rounded-lg cursor-pointer"
          >
            <History className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Histórico ({historyCount})</span>
            <span className="sm:hidden">({historyCount})</span>
          </button>

          {userRole === 'admin' && onToggleAdminView && (
            <button
              type="button"
              onClick={onToggleAdminView}
              data-testid="admin-panel-toggle-btn"
              className={`transition-colors whitespace-nowrap shrink-0 flex items-center justify-center gap-1.5 text-xs border h-8 sm:h-auto px-2 sm:px-3 sm:py-1.5 rounded-lg cursor-pointer ${
                isAdminViewOpen
                  ? 'bg-[#7c5dfa] text-white border-[#7c5dfa]'
                  : 'text-[#b5a3ff] bg-[#7c5dfa]/15 hover:bg-[#7c5dfa]/25 border-[#7c5dfa]/40'
              }`}
            >
              <Shield className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Painel Admin</span>
              <span className="sm:hidden">Admin</span>
            </button>
          )}

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              title={userEmail ? `Terminar sessão (${userEmail})` : 'Terminar sessão'}
              aria-label="Terminar sessão"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 flex items-center justify-center gap-1.5 text-xs text-slate-400 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 h-8 sm:h-auto px-2 sm:px-3 sm:py-1.5 rounded-lg cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          )}
        </nav>
      </div>
    </header>
  );
};
