import React, { useEffect } from 'react';
import { X, Cpu, ShieldCheck, Key, CheckCircle2, Sparkles, Layers, ExternalLink } from 'lucide-react';
import { AgentVectorAvatar } from './AgentVectorAvatar';
import { AgentCalibrationProfile } from '../types/trading';

interface ArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
  calibrationProfile?: AgentCalibrationProfile | null;
}

export const ArchitectureModal: React.FC<ArchitectureModalProps> = ({
  isOpen,
  onClose,
  calibrationProfile,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Arquitetura Multiagente NextCandle.AI"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar arquitetura"
          className="absolute top-5 right-5 p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-3 mb-6 pb-4 pr-8 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center text-slate-950 shrink-0">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">
              Arquitetura Multiagente NextCandle.AI &amp; 3 Guardrails de Assertividade
            </h2>
            <p className="text-xs text-slate-400">
              Terminal quantitativo NextCandle.AI com atualização adaptativa automática
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6 text-xs text-slate-300 leading-relaxed max-h-[70vh] overflow-y-auto pr-2">
          {/* Section 1: Live AI Calibration Profile */}
          <div className="bg-cyan-950/25 border border-cyan-500/30 p-4 rounded-xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-cyan-300 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                Calibração Adaptativa Automática ({calibrationProfile?.version || 'v2.0-Híbrido'})
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-200 border border-cyan-500/30 self-start sm:self-auto">
                Atualização Contínua em Segundo Plano
              </span>
            </div>

            <p className="text-[11px] text-slate-300">
              {calibrationProfile?.marketRegimeSummary ||
                'O motor adapta continuamente e de forma automática as diretrizes dos 5 agentes e os indicadores prioritários com base no regime de volatilidade atual e no seu histórico real de Win/Loss.'}
            </p>

            {calibrationProfile?.notice && (
              <p className="text-[10px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
                {calibrationProfile.notice}
              </p>
            )}

            {calibrationProfile && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] font-mono uppercase text-cyan-400 font-bold block mb-1">
                    Indicadores Prioritários · Mercado Aberto
                  </span>
                  <p className="text-[11px] text-slate-300">
                    {calibrationProfile.openMarketIndicators.join(' · ')}
                  </p>
                </div>
                <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] font-mono uppercase text-purple-400 font-bold block mb-1">
                    Indicadores Prioritários · Mercado OTC
                  </span>
                  <p className="text-[11px] text-slate-300">
                    {calibrationProfile.otcIndicators.join(' · ')}
                  </p>
                </div>
              </div>
            )}

            {calibrationProfile?.groundedSources && calibrationProfile.groundedSources.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px] font-mono text-slate-400">
                <span>Fontes consultadas:</span>
                {calibrationProfile.groundedSources
                  .filter((src) => /^https?:\/\//i.test(src.uri))
                  .map((src, i) => (
                    <a
                      key={i}
                      href={src.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-cyan-300 hover:underline"
                    >
                      <span>{src.title}</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ))}
              </div>
            )}
          </div>

          {/* Section 2: 3 Guardrails */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-2.5">
            <h3 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
              <Layers className="w-4 h-4" />
              3 Guardrails Automáticos de Bloqueio (Proteção de Assertividade)
            </h3>
            <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-300">
              <li className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <strong className="text-white block mb-0.5">1. Alinhamento Estrutural</strong>
                Verifica tendência dominante e estrutura do gráfico antes de liberar entradas calibradas em M1 ou M5.
              </li>
              <li className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <strong className="text-white block mb-0.5">2. Calendário Econômico Real (±15m)</strong>
                Bloqueia pares em Mercado Aberto 15 min antes/depois de notícias de alto impacto (OTC 100% livre).
              </li>
              <li className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <strong className="text-white block mb-0.5">3. Filtro Zona Espremida (1:1.5)</strong>
                Marcus Sterling veta COMPRA colada em resistência ou VENDA em cima de suporte sem espaço livre ≥ 1:1.5.
              </li>
            </ul>
          </div>

          {/* Section 3: The 5 Agents */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">
                Os 5 Especialistas do Conselho Quantitativo
              </h3>
              <span className="text-[11px] font-mono text-emerald-400">Regra de 80% (4/5)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-slate-950/80 p-3.5 rounded-lg border border-slate-800 flex gap-3">
                <AgentVectorAvatar agentId="price_action" size={44} />
                <div>
                  <div className="flex items-center gap-2 text-emerald-400 font-bold mb-0.5">
                    <span>1. Sofia Alencar (Price Action)</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Mapeia topos/fundos, suportes, resistências, canais e padrões de candlestick em tempo real.
                  </p>
                </div>
              </div>

              <div className="bg-slate-950/80 p-3.5 rounded-lg border border-slate-800 flex gap-3">
                <AgentVectorAvatar agentId="indicators" size={44} />
                <div>
                  <div className="flex items-center gap-2 text-cyan-400 font-bold mb-0.5">
                    <span>2. Dr. Lucas Vance (Indicadores)</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Extrai médias exponenciais (EMA 20, 50, 200), Bollinger, RSI (14) e histograma MACD.
                  </p>
                </div>
              </div>

              <div className="bg-slate-950/80 p-3.5 rounded-lg border border-slate-800 flex gap-3">
                <AgentVectorAvatar agentId="flow_volatility" size={44} />
                <div>
                  <div className="flex items-center gap-2 text-purple-400 font-bold mb-0.5">
                    <span>3. Elena Rostova (Fluxo Delta)</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Mede agressão institucional, pavios de rejeição, simetria algorítmica OTC e armadilhas de liquidez.
                  </p>
                </div>
              </div>

              <div className="bg-slate-950/80 p-3.5 rounded-lg border border-slate-800 flex gap-3">
                <AgentVectorAvatar agentId="predictive_ml" size={44} />
                <div>
                  <div className="flex items-center gap-2 text-amber-400 font-bold mb-0.5">
                    <span>4. Gabriel Chen (Preditivo ML)</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Modelagem de séries temporais e probabilidade direcional calibrada por volatilidade e timeframe.
                  </p>
                </div>
              </div>

              <div className="sm:col-span-2 bg-gradient-to-r from-slate-950 to-indigo-950/40 p-3.5 rounded-lg border border-indigo-500/30 flex gap-3">
                <AgentVectorAvatar agentId="confluence_risk" size={44} />
                <div>
                  <div className="flex items-center gap-2 text-indigo-400 font-bold mb-0.5">
                    <span>5. Marcus Sterling (Juiz Chefe de Confluência &amp; Risco)</span>
                  </div>
                  <p className="text-slate-300 text-[11px]">
                    Valida os 3 guardrails (macro multi-timeframe, notícias ±15m e zona espremida R:R ≥ 1:1.5) e só libera sinais com consenso ≥ 80%.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: The 80% Rule & API */}
          <div className="bg-emerald-950/30 border border-emerald-500/30 p-4 rounded-xl">
            <h3 className="text-sm font-semibold text-emerald-300 mb-1 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              A Regra de Ouro do Consenso Mínimo de 80% (4 em 5)
            </h3>
            <p className="text-slate-300">
              Para que um sinal de <strong>COMPRA</strong> ou <strong>VENDA</strong> seja autorizado, <strong>pelo menos 4 dos 5 agentes precisam concordar</strong> e todos os 3 guardrails devem estar livres.
            </p>
          </div>

          <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800">
            <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <Key className="w-4 h-4 text-cyan-400" />
              Motor Multimodal &amp; Busca em Tempo Real
            </h3>
            <p className="text-slate-400">
              Executa visão computacional multimodal com <code>gemini-4-hydrogen</code> via <code>@google/genai</code> e calibração contínua via Google Search Grounding e calendário econômico ao vivo.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors cursor-pointer"
          >
            Entendido, Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
