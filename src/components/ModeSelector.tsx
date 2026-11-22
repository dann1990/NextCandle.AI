import React from 'react';
import { Zap, Info, Sparkles } from 'lucide-react';
import { AgentCalibrationProfile, MarketEnvironment } from '../types/trading';

interface ModeSelectorProps {
  calibrationProfile?: AgentCalibrationProfile | null;
  marketEnvironment?: MarketEnvironment;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  calibrationProfile,
  marketEnvironment = 'MERCADO_ABERTO',
}) => {
  const isOtc = marketEnvironment === 'MERCADO_OTC';

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 sm:p-5 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
          <h2 className="text-sm font-semibold text-white">
            Modo de Analise
          </h2>
          <span className="text-[11px] font-normal text-slate-400 hidden sm:inline">
            · Foco Exclusivo no Mercado Selecionado
          </span>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md border text-xs font-mono font-semibold self-start sm:self-auto shrink-0 ${
            isOtc
              ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
              : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>{isOtc ? 'Modo OTC Exclusivo' : 'Mercado Aberto Exclusivo'}</span>
        </span>
      </div>

      <div className="pt-3 text-xs text-slate-400 flex items-start gap-2.5 bg-slate-950/40 p-3 rounded-lg border border-slate-800/60 mt-3">
        <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          {isOtc ? (
            <>
              <strong className="text-purple-300">Foco Exclusivo Ativo — Mercado OTC:</strong>{' '}
              Os 5 agentes analisarão o gráfico usando estritamente <strong className="text-slate-200">Price Action puro, zonas fortes de S/R, pavios e padrões de repetição algorítmica</strong>, desconsiderando notícias econômicas e sessões institucionais.
            </>
          ) : (
            <>
              <strong className="text-cyan-300">Foco Exclusivo Ativo — Mercado Aberto:</strong>{' '}
              Os 5 agentes analisarão o gráfico considerando estritamente <strong className="text-slate-200">liquidez institucional, volume real, horário de sessão e calendário econômico real (±15m)</strong>, sem heurísticas de OTC.
            </>
          )}
        </p>
      </div>

      {calibrationProfile && (
        <div className="mt-3 pt-3 border-t border-slate-800/70 space-y-2 text-[11px]">
          <div className="flex items-start sm:items-center justify-between gap-2.5">
            <div className="flex items-start sm:items-center gap-2 text-slate-300">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5 sm:mt-0" />
              <span>
                <strong className="text-cyan-300 font-mono">
                  Calibração Adaptativa Automática ({calibrationProfile.version}):
                </strong>{' '}
                <span className="text-slate-400">{calibrationProfile.marketRegimeSummary}</span>
              </span>
            </div>

            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 shrink-0 hidden sm:inline">
              Sincronização Automática
            </span>
          </div>

          {calibrationProfile.notice && (
            <p className="text-[10px] font-mono text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
              {calibrationProfile.notice}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
