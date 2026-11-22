import React, { useEffect, useMemo, useState } from 'react';
import { AnalysisResult, BankrollSettings } from '../types/trading';
import { detectMarketEnvironment } from '../utils/timingEngine';
import { computeAssetTimeframeRanking, computeDailyBankrollProtection } from '../utils/historyAnalytics';
import {
  convertAnalysisForTimezone,
  formatDateTimeInTimeZone,
  getBrowserTimeZone,
  normalizeTimeZone,
} from '../utils/timezone';
import {
  History,
  X,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  ArrowRight,
  ShieldAlert,
  Wallet,
  Trophy,
} from 'lucide-react';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  records: AnalysisResult[];
  bankrollSettings: BankrollSettings;
  onUpdateBankrollSettings: (next: BankrollSettings) => void;
  onSelectRecord: (record: AnalysisResult) => void;
  onToggleOutcome: (id: string, outcome: 'win' | 'loss' | 'pending') => void;
  onClearHistory: () => void;
  timezone?: string;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = React.memo(({
  isOpen,
  onClose,
  records,
  bankrollSettings,
  onUpdateBankrollSettings,
  onSelectRecord,
  onToggleOutcome,
  onClearHistory,
  timezone,
}) => {
  const activeTimezone = normalizeTimeZone(timezone, getBrowserTimeZone());
  const [activeTab, setActiveTab] = useState<'operations' | 'bankroll_ranking'>('operations');
  const [bankrollDraft, setBankrollDraft] = useState<string>(String(bankrollSettings.bankrollAmount));

  useEffect(() => {
    setBankrollDraft(String(bankrollSettings.bankrollAmount));
  }, [bankrollSettings.bankrollAmount]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const drawerStats = useMemo(() => {
    if (!isOpen) return null;

    let totalWins = 0;
    let totalLosses = 0;
    let openDecided = 0;
    let openWins = 0;
    let otcDecided = 0;
    let otcWins = 0;

    for (const r of records) {
      if (r.outcome !== 'win' && r.outcome !== 'loss') continue;
      const isWin = r.outcome === 'win';
      if (isWin) totalWins++;
      else totalLosses++;

      const env = r.marketEnvironment || detectMarketEnvironment(r.asset);
      if (env === 'MERCADO_ABERTO') {
        openDecided++;
        if (isWin) openWins++;
      } else {
        otcDecided++;
        if (isWin) otcWins++;
      }
    }

    const totalDecided = totalWins + totalLosses;
    const winRate = totalDecided > 0 ? Math.round((totalWins / totalDecided) * 100) : 0;
    const openWinRate = openDecided > 0 ? Math.round((openWins / openDecided) * 100) : null;
    const otcWinRate = otcDecided > 0 ? Math.round((otcWins / otcDecided) * 100) : null;

    const ranking = computeAssetTimeframeRanking(records);
    const bankrollProtection = computeDailyBankrollProtection(
      records,
      bankrollSettings.bankrollAmount,
      bankrollSettings.riskPercent
    );

    return {
      totalWins,
      totalLosses,
      winRate,
      openDecided,
      openWinRate,
      otcDecided,
      otcWinRate,
      ranking,
      bankrollProtection,
    };
  }, [isOpen, records, bankrollSettings.bankrollAmount, bankrollSettings.riskPercent]);

  if (!isOpen || !drawerStats) return null;

  const {
    totalWins,
    totalLosses,
    winRate,
    openDecided,
    openWinRate,
    otcDecided,
    otcWinRate,
    ranking,
    bankrollProtection,
  } = drawerStats;

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Histórico, Banca e Ranking"
    >
      <div className="w-full max-w-xl bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-sm font-bold text-white">Histórico, Banca &amp; Ranking</h2>
              <span className="text-xs text-slate-400">Assertividade por ativo e proteção diária</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar histórico"
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Strip + Persistent Stop Diário Alert */}
        <div className="p-4 bg-slate-950/80 border-b border-slate-800 space-y-2.5">
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] uppercase font-mono text-slate-400 block">Total</span>
              <span className="text-sm font-bold font-mono text-white tabular-nums">{records.length}</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] uppercase font-mono text-emerald-400 block">Wins</span>
              <span className="text-sm font-bold font-mono text-emerald-300 tabular-nums">{totalWins}</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] uppercase font-mono text-rose-400 block">Loss</span>
              <span className="text-sm font-bold font-mono text-rose-300 tabular-nums">
                {totalLosses}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] uppercase font-mono text-cyan-400 block">Assertividade</span>
              <span className="text-sm font-bold font-mono text-cyan-300 tabular-nums">{winRate}%</span>
            </div>
          </div>

          {(openWinRate !== null || otcWinRate !== null) && (
            <div className="flex items-center justify-between gap-2 text-[10px] font-mono px-2.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800">
              <span className="text-cyan-300">
                Mercado Aberto: <strong>{openWinRate !== null ? `${openWinRate}% (${openDecided})` : '—'}</strong>
              </span>
              <span className="text-purple-300">
                Mercado OTC: <strong>{otcWinRate !== null ? `${otcWinRate}% (${otcDecided})` : '—'}</strong>
              </span>
            </div>
          )}

          {/* Persistent Daily Loss Protection Warning */}
          {bankrollProtection.protectionLevel !== 'normal' && (
            <div
              className={`p-2.5 rounded-lg border text-[11px] flex items-start gap-2 ${
                bankrollProtection.protectionLevel === 'stop_daily'
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
              }`}
            >
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-mono">{bankrollProtection.alertTitle}</strong>
                <span className="text-[10px] opacity-90">{bankrollProtection.alertMessage}</span>
              </div>
            </div>
          )}

          {/* Drawer Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-slate-900 border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('operations')}
              className={`py-1.5 px-2 rounded-md text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'operations'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Operações ({records.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bankroll_ranking')}
              className={`py-1.5 px-2 rounded-md text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'bankroll_ranking'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Banca &amp; Ranking ({ranking.length})</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {activeTab === 'bankroll_ranking' ? (
            <div className="space-y-4">
              {/* Bankroll & Stake Sizing Card */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Wallet className="w-4 h-4 text-emerald-400" />
                    Gestão de Banca &amp; Stop Diário
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Hoje: {bankrollProtection.todayWins}W / {bankrollProtection.todayLosses}L
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="bankroll-input"
                      className="text-[10px] font-mono uppercase text-slate-400 block mb-1"
                    >
                      Banca Atual (R$)
                    </label>
                    <input
                      id="bankroll-input"
                      type="number"
                      min={10}
                      step={50}
                      value={bankrollDraft}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setBankrollDraft(raw);
                        const val = parseFloat(raw);
                        if (Number.isFinite(val) && val >= 10) {
                          onUpdateBankrollSettings({
                            ...bankrollSettings,
                            bankrollAmount: val,
                          });
                        }
                      }}
                      onBlur={() => {
                        const val = parseFloat(bankrollDraft);
                        const normalized = Number.isFinite(val) && val >= 10 ? val : 100;
                        setBankrollDraft(String(normalized));
                        if (normalized !== bankrollSettings.bankrollAmount) {
                          onUpdateBankrollSettings({
                            ...bankrollSettings,
                            bankrollAmount: normalized,
                          });
                        }
                      }}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-emerald-400"
                    />
                  </div>

                  <div>
                    <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                      Mão Fixa Recomendada (1% – 2%)
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([1, 1.5, 2] as const).map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => onUpdateBankrollSettings({ ...bankrollSettings, riskPercent: pct })}
                          className={`py-1.5 rounded-lg text-xs font-mono font-bold border transition-colors cursor-pointer ${
                            bankrollSettings.riskPercent === pct
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-center">
                  <div className="p-2 rounded-lg bg-slate-900/70 border border-slate-800">
                    <span className="text-[10px] font-mono text-slate-400 block">Mínima (1%)</span>
                    <span className="text-xs font-mono font-bold text-slate-200 tabular-nums">
                      R$ {bankrollProtection.conservativeStake.toFixed(2)}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                    <span className="text-[10px] font-mono text-emerald-300 block">
                      Sugerida ({bankrollProtection.riskPercent}%)
                    </span>
                    <span className="text-xs font-mono font-bold text-emerald-300 tabular-nums">
                      R$ {bankrollProtection.suggestedStake.toFixed(2)}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-900/70 border border-slate-800">
                    <span className="text-[10px] font-mono text-slate-400 block">Teto (2%)</span>
                    <span className="text-xs font-mono font-bold text-slate-200 tabular-nums">
                      R$ {bankrollProtection.maxStake.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div
                  className={`p-2.5 rounded-lg border text-[11px] ${
                    bankrollProtection.protectionLevel === 'stop_daily'
                      ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                      : bankrollProtection.protectionLevel === 'warning'
                      ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                      : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
                  }`}
                >
                  <strong className="block font-mono">{bankrollProtection.alertTitle}</strong>
                  <span className="text-[10px] opacity-90">{bankrollProtection.alertMessage}</span>
                </div>
              </div>

              {/* Asset & Timeframe Assertiveness Ranking */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    Ranking de Assertividade (Ativo &amp; Timeframe)
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">Baseado em Win / Loss</span>
                </div>

                {ranking.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">
                    Marque suas análises como <strong>Win</strong> ou <strong>Loss</strong> para gerar o ranking automático por par e timeframe.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {ranking.map((item, idx) => (
                      <div
                        key={item.key}
                        className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-amber-300">
                              #{idx + 1}
                            </span>
                            <span className="font-mono font-bold text-white truncate">{item.asset}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                              {item.timeframe}
                            </span>
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                                item.marketEnvironment === 'MERCADO_OTC'
                                  ? 'bg-purple-500/15 text-purple-300'
                                  : 'bg-cyan-500/15 text-cyan-300'
                              }`}
                            >
                              {item.marketEnvironment === 'MERCADO_OTC' ? 'OTC' : 'Aberto'}
                            </span>
                          </div>
                          <div className="text-right shrink-0 font-mono">
                            <span
                              className={`text-xs font-bold ${
                                item.winRate >= 70
                                  ? 'text-emerald-300'
                                  : item.winRate >= 50
                                  ? 'text-amber-300'
                                  : 'text-rose-300'
                              }`}
                            >
                              {item.winRate}%
                            </span>
                            <span className="text-[10px] text-slate-400 ml-1.5">
                              ({item.wins}W/{item.losses}L)
                            </span>
                          </div>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              item.winRate >= 70
                                ? 'bg-emerald-400'
                                : item.winRate >= 50
                                ? 'bg-amber-400'
                                : 'bg-rose-400'
                            }`}
                            style={{ width: `${item.winRate}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-xs">Nenhuma análise salva no histórico local ainda.</p>
              <p className="text-[11px] text-slate-600 mt-1">
                Todas as análises realizadas ficam salvas aqui para você medir a assertividade.
              </p>
            </div>
          ) : (
            records.map((rawRec) => {
              const rec = convertAnalysisForTimezone(rawRec, activeTimezone);
              const isBuy = rec.verdict.verdict === 'COMPRA';
              const isSell = rec.verdict.verdict === 'VENDA';
              const formattedDate = Number.isFinite(rec.timestamp)
                ? formatDateTimeInTimeZone(rec.timestamp, activeTimezone)
                : '--/-- --:--';

              return (
                <div
                  key={rec.id}
                  className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 hover:border-slate-700 transition-all flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      {rec.imagePreview && (
                        <img
                          src={rec.imagePreview}
                          alt="Thumbnail do gráfico"
                          className="w-10 h-10 object-cover rounded bg-slate-900 border border-slate-800 shrink-0"
                        />
                      )}
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-mono font-bold text-white">{rec.asset}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {rec.timeframe}
                          </span>
                          {(rec.marketEnvironment || detectMarketEnvironment(rec.asset)) === 'MERCADO_OTC' ? (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/40">
                              OTC
                            </span>
                          ) : (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/40">
                              Aberto
                            </span>
                          )}
                          {(rec.macroImagePreview || (rec.timeframeImages && rec.timeframeImages.length > 0)) && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/40">
                              {rec.timeframeImages && rec.timeframeImages.length > 0
                                ? `Multi-TF (${rec.timeframeImages.map((t) => t.timeframe).join('+')})`
                                : 'Multi-TF'}
                            </span>
                          )}
                          {rec.entryTimeframe && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                              Entradas {rec.entryTimeframe}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {formattedDate} · Híbrido Automático
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                          isBuy
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : isSell
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        {rec.verdict.verdict} ({rec.verdict.agreementCount}/5)
                      </span>
                    </div>
                  </div>

                  {/* 5 Pillars Summary Strip */}
                  {rec.insights && (
                    <div className="grid grid-cols-2 gap-1.5 py-1.5 px-2 bg-slate-900/60 rounded-lg border border-slate-800/80 text-[10px] font-mono">
                      <div className="truncate text-slate-300">
                        <span className="text-cyan-400 font-bold">1. Tend:</span> {rec.insights.trendDirection}
                      </div>
                      <div className="truncate text-slate-300" title={rec.insights.keyPattern}>
                        <span className="text-purple-400 font-bold">2. Padrão:</span> {rec.insights.keyPattern}
                      </div>
                      <div className="truncate text-slate-300">
                        <span className="text-emerald-400 font-bold">3. Qual:</span> Grau {rec.insights.qualityGrade}
                      </div>
                      <div className="truncate text-slate-300" title={rec.insights.idealExpiration}>
                        <span className="text-amber-400 font-bold">4. Exp:</span> {rec.insights.idealExpiration}
                      </div>
                      {rec.insights.entryTiming && (
                        <div className="col-span-2 truncate text-slate-200 pt-0.5 border-t border-slate-800/60" title={rec.insights.entryTiming}>
                          <span className="text-sky-400 font-bold">5. Entrada:</span> {rec.insights.entryTiming}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Outcome Tagging Strip */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-slate-400 mr-1">Resultado:</span>
                      <button
                        type="button"
                        onClick={() => onToggleOutcome(rec.id, 'win')}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 transition-colors cursor-pointer ${
                          rec.outcome === 'win'
                            ? 'bg-emerald-500 text-slate-950 font-bold'
                            : 'bg-slate-900 text-slate-400 hover:text-emerald-300 border border-slate-800'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Win</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleOutcome(rec.id, 'loss')}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 transition-colors cursor-pointer ${
                          rec.outcome === 'loss'
                            ? 'bg-rose-500 text-white font-bold'
                            : 'bg-slate-900 text-slate-400 hover:text-rose-300 border border-slate-800'
                        }`}
                      >
                        <XCircle className="w-3 h-3" />
                        <span>Loss</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleOutcome(rec.id, 'pending')}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 transition-colors cursor-pointer ${
                          rec.outcome === 'pending'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        <span>Pendente</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onSelectRecord(rec);
                        onClose();
                      }}
                      className="text-[11px] font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                    >
                      <span>Abrir</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {records.length > 0 && (
          <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
            <button
              type="button"
              onClick={onClearHistory}
              className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpar Histórico Local</span>
            </button>
            <span className="text-[11px] text-slate-500">Salvo no navegador</span>
          </div>
        )}
      </div>
    </div>
  );
});
