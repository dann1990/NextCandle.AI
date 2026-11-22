import React from 'react';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  Minus,
  Sparkles
} from 'lucide-react';
import { AgentResult, MarketEnvironment, VoteType } from '../types/trading';
import { AgentVectorAvatar, AGENT_CHARACTERS, AgentCharacterId } from './AgentVectorAvatar';

interface MultiAgentVotingGridProps {
  agents: AgentResult[];
  marketEnvironment?: MarketEnvironment;
}

const VOTE_STYLE_MAP: Record<VoteType, { bg: string; icon: React.ReactNode; label: string }> = {
  COMPRA: {
    bg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    icon: <ArrowUpRight className="w-3.5 h-3.5" />,
    label: 'COMPRA',
  },
  VENDA: {
    bg: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
    icon: <ArrowDownRight className="w-3.5 h-3.5" />,
    label: 'VENDA',
  },
  AGUARDAR: {
    bg: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    icon: <Minus className="w-3.5 h-3.5" />,
    label: 'AGUARDAR',
  },
};

export const MultiAgentVotingGrid: React.FC<MultiAgentVotingGridProps> = React.memo(({
  agents,
  marketEnvironment,
}) => {

  return (
    <div className="mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>Votação dos 5 Agentes Especializados</span>
            <span className="text-[11px] font-normal text-slate-400">
              · Conselho Quantitativo Multidisciplinar
            </span>
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {marketEnvironment && (
            <span
              className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                marketEnvironment === 'MERCADO_OTC'
                  ? 'bg-purple-500/15 text-purple-300 border-purple-500/40'
                  : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
              }`}
            >
              Critério Híbrido:{' '}
              {marketEnvironment === 'MERCADO_OTC' ? 'OTC (Price Action Puro)' : 'Aberto (Liquidez & Sessão)'}
            </span>
          )}
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700">
            2 Mulheres · 3 Homens
          </span>
          <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
            Votação autônoma (80% regra)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent, index) => {
          const voteInfo = VOTE_STYLE_MAP[agent.vote] || VOTE_STYLE_MAP.AGUARDAR;
          const isJudge = agent.id === 'confluence_risk';
          const charInfo = AGENT_CHARACTERS[agent.id as AgentCharacterId] || AGENT_CHARACTERS.confluence_risk;

          return (
            <div
              key={agent.id}
              className={`rounded-xl p-4 transition-all border flex flex-col justify-between ${
                isJudge
                  ? 'md:col-span-2 lg:col-span-1 bg-gradient-to-b from-slate-900 to-indigo-950/40 border-indigo-500/40 shadow-lg shadow-indigo-950/20'
                  : 'bg-slate-900/80 hover:bg-slate-900 border-slate-800'
              }`}
            >
              <div>
                {/* Header with Vector Avatar Face */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    {/* Bespoke Vector Face */}
                    <div className="relative">
                      <AgentVectorAvatar agentId={agent.id} size={50} />
                      <span className="absolute -bottom-1 -right-1 text-[9px] font-mono font-bold px-1 rounded bg-slate-950 text-slate-300 border border-slate-700">
                        #{index + 1}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-bold text-white font-mono leading-tight">
                          {charInfo.fictionalName}
                        </h3>
                      </div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400/90 block mt-0.5">
                        {charInfo.specialty}
                      </span>
                    </div>
                  </div>

                  {/* Individual Vote Pill */}
                  <div
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono font-bold border shrink-0 ${voteInfo.bg}`}
                  >
                    {voteInfo.icon}
                    <span>{voteInfo.label}</span>
                  </div>
                </div>

                {/* Subtitle / Role */}
                <p className="text-[11px] text-slate-400 mb-3 leading-tight">
                  {agent.role}
                </p>

                {/* Confidence bar */}
                <div className="space-y-1 mb-3">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-400">Grau de Confiança:</span>
                    <span className="font-bold text-white">{agent.confidence}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        agent.vote === 'COMPRA'
                          ? 'bg-emerald-400'
                          : agent.vote === 'VENDA'
                          ? 'bg-rose-400'
                          : 'bg-amber-400'
                      }`}
                      style={{ width: `${agent.confidence}%` }}
                    />
                  </div>
                </div>

                {/* Rationale */}
                <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 mb-3 text-xs text-slate-300 leading-relaxed">
                  <span className="font-semibold text-slate-200">
                    Parecer de {charInfo.fictionalName.replace(/^Dr\.\s*/i, '').split(' ')[0]}:{' '}
                  </span>
                  {agent.rationale}
                </div>
              </div>

              {/* Signals tags */}
              {agent.signals && agent.signals.length > 0 && (
                <div className="pt-2 border-t border-slate-800/60 flex flex-wrap gap-1.5">
                  {agent.signals.map((sig, sIdx) => {
                    const isBull = sig.sentiment === 'bullish';
                    const isBear = sig.sentiment === 'bearish';

                    return (
                      <span
                        key={sIdx}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                          isBull
                            ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50'
                            : isBear
                            ? 'bg-rose-950/40 text-rose-300 border-rose-800/50'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}
                      >
                        {sig.label}: <strong className="font-semibold">{sig.value}</strong>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
