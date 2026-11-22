import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  ArrowDownRight,
  PauseCircle,
  CheckCircle2,
  TrendingUp,
  AlertTriangle,
  Compass,
  Target,
  Award,
  Timer,
  Sparkles,
  Clock,
  Globe2,
  ShieldAlert,
  Cpu,
  Crosshair,
  Layers,
  CalendarClock,
  Scale,
  XCircle,
} from 'lucide-react';
import {
  ConsensusVerdict,
  EntryExecutionTimeframe,
  GuardrailsReport,
  KeyAnalysisInsights,
  MarketEnvironment,
  TradingPlan,
} from '../types/trading';
import { detectMarketEnvironment, evaluateMarketSession, getSecondsToNextCandle } from '../utils/timingEngine';
import { calibrateQualityAssessment } from '../utils/consensusEngine';
import {
  formatDateTimeInTimeZone,
  formatUtcOffsetLabel,
  getBrowserTimeZone,
  getTimeZoneOffsetMinutes,
  normalizeTimeZone,
} from '../utils/timezone';
import { TimezoneSelector } from './TimezoneSelector';

interface ConsensusVerdictCardProps {
  verdict: ConsensusVerdict;
  insights?: KeyAnalysisInsights;
  plan?: TradingPlan;
  asset: string;
  timeframe: string;
  entryTimeframe?: EntryExecutionTimeframe;
  analysisSource?: 'ai_vision' | 'heuristic_fallback';
  marketEnvironment?: MarketEnvironment;
  marketCriteriaSummary?: string;
  guardrails?: GuardrailsReport;
  calibrationVersion?: string;
  timezone?: string;
  onChangeTimezone?: (nextTimezone: string) => void;
  analysisTimestamp?: number;
}

const CandleCountdownBadge = React.memo(({ timeframe, timezone }: { timeframe: string; timezone: string }) => {
  const [countdown, setCountdown] = useState(() => getSecondsToNextCandle(timeframe, new Date(), timezone));

  useEffect(() => {
    setCountdown(getSecondsToNextCandle(timeframe, new Date(), timezone));
    const timer = setInterval(() => {
      setCountdown(getSecondsToNextCandle(timeframe, new Date(), timezone));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeframe, timezone]);

  return (
    <span
      data-testid="candle-countdown-badge"
      className="text-xs font-mono font-bold px-3 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 tabular-nums"
      title={`Próxima virada de candle (${timeframe}) às ${countdown.nextCandleHHMM}`}
    >
      Virada em {countdown.formattedCountdown} · {countdown.nextCandleHHMM}
    </span>
  );
});

export const ConsensusVerdictCard: React.FC<ConsensusVerdictCardProps> = React.memo(({
  verdict,
  insights,
  plan,
  asset,
  timeframe,
  entryTimeframe,
  analysisSource,
  marketEnvironment,
  marketCriteriaSummary,
  guardrails,
  calibrationVersion,
  timezone,
  onChangeTimezone,
  analysisTimestamp,
}) => {
  const [metricsTab, setMetricsTab] = useState<'overview' | 'entry_timing'>('overview');

  const activeTimezone = normalizeTimeZone(timezone || insights?.timezone, getBrowserTimeZone());
  const offsetLabel = useMemo(
    () =>
      formatUtcOffsetLabel(
        getTimeZoneOffsetMinutes(
          activeTimezone,
          typeof analysisTimestamp === 'number' ? new Date(analysisTimestamp) : new Date()
        )
      ),
    [activeTimezone, analysisTimestamp]
  );
  const formattedAnalysisTimestamp = useMemo(
    () =>
      typeof analysisTimestamp === 'number'
        ? formatDateTimeInTimeZone(analysisTimestamp, activeTimezone)
        : null,
    [analysisTimestamp, activeTimezone]
  );

  const isBuy = verdict.verdict === 'COMPRA';
  const isSell = verdict.verdict === 'VENDA';
  const isNeutral = verdict.verdict === 'AGUARDAR';

  const consensusPct = Math.round(verdict.consensusRatio * 100);

  const cleanInsight = (val?: string) =>
    val && !/^(n\/a|na|nenhum|null|undefined|-)$/i.test(val.trim()) ? val : undefined;

  const effectiveTimeframe = entryTimeframe || timeframe || 'M5';
  const resolvedMarket: MarketEnvironment =
    marketEnvironment || insights?.marketEnvironment || detectMarketEnvironment(asset, insights?.keyPattern);
  const isOtc = resolvedMarket === 'MERCADO_OTC';

  const sessionFallback = useMemo(
    () => evaluateMarketSession(undefined, asset, resolvedMarket, activeTimezone),
    [asset, resolvedMarket, activeTimezone]
  );

  // Fallback defaults if insights not provided (e.g. from older records)
  const resolvedInsights: KeyAnalysisInsights = useMemo(() => {
    const fallbackQuality = calibrateQualityAssessment(verdict, insights?.qualityScore);
    return {
      trend:
        cleanInsight(insights?.trend) ||
        (isBuy
          ? 'Alta Forte (Topos e Fundos Ascendentes)'
          : isSell
          ? 'Baixa Dominante (Pressão Vendedora Contínua)'
          : 'Lateralização / Consolidação em Faixa'),
      trendDirection: insights?.trendDirection || (isBuy ? 'alta' : isSell ? 'baixa' : 'lateral'),
      keyPattern:
        cleanInsight(insights?.keyPattern) ||
        (isBuy
          ? 'Rompimento de LTB com Pullback e Engolfo'
          : isSell
          ? 'Estrela Cadente em Resistência / Falso Rompimento'
          : 'Doji de Indecisão em Região Neutra'),
      patternType: cleanInsight(insights?.patternType) || (isBuy || isSell ? 'Reversão Confirmada' : 'Indefinido'),
      quality: cleanInsight(insights?.quality) || fallbackQuality.quality,
      qualityGrade: insights?.qualityGrade || fallbackQuality.qualityGrade,
      qualityScore: insights?.qualityScore || fallbackQuality.qualityScore,
      idealExpiration:
        cleanInsight(insights?.idealExpiration) ||
        (effectiveTimeframe === 'M1' ? '2 velas (2 min)' : effectiveTimeframe === 'M5' ? '3 velas (15 min)' : `3 velas (${effectiveTimeframe})`),
      expirationRationale:
        cleanInsight(insights?.expirationRationale) ||
        `Calibrado para a volatilidade e padrão de price action no timeframe ${effectiveTimeframe}.`,
      entryTiming:
        cleanInsight(insights?.entryTiming) ||
        (isNeutral
          ? 'Aguardar rompimento confirmado fora do range'
          : `Abertura da próxima vela (${effectiveTimeframe})`),
      entryTrigger:
        cleanInsight(insights?.entryTrigger) ||
        (isNeutral ? 'Sem Gatilho Ativo' : 'Abertura Próximo Candle'),
      entryTimingRationale:
        cleanInsight(insights?.entryTimingRationale) ||
        (isNeutral
          ? 'A estrutura temporal atual indica lateralidade ou ausência de confluência de 80%. Aguarde o fechamento de um candle de força fora da zona de congestão.'
          : `Executar na virada do candle ${effectiveTimeframe} após confirmação do fechamento da estrutura atual sem pavio de rejeição contrário.`),
      sessionLiquidity:
        isOtc && !/otc/i.test(insights?.sessionLiquidity || '')
          ? sessionFallback.sessionLiquidity
          : cleanInsight(insights?.sessionLiquidity) || sessionFallback.sessionLiquidity,
      sessionAdvisory:
        isOtc && !/otc|algor[ií]tmic|calend[aá]rio/i.test(insights?.sessionAdvisory || '')
          ? sessionFallback.sessionAdvisory
          : cleanInsight(insights?.sessionAdvisory) || sessionFallback.sessionAdvisory,
    };
  }, [insights, isBuy, isSell, isNeutral, verdict, effectiveTimeframe, isOtc, sessionFallback]);

  const trendBadgeColor =
    resolvedInsights.trendDirection === 'alta'
      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
      : resolvedInsights.trendDirection === 'baixa'
      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40';

  return (
    <div
      className={`rounded-2xl border p-5 sm:p-6 mb-6 transition-all duration-300 relative overflow-hidden ${
        isBuy
          ? 'bg-gradient-to-br from-emerald-950/60 via-slate-900 to-slate-950 border-emerald-500/40 shadow-xl shadow-emerald-950/30'
          : isSell
          ? 'bg-gradient-to-br from-rose-950/60 via-slate-900 to-slate-950 border-rose-500/40 shadow-xl shadow-rose-950/30'
          : 'bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-950 border-amber-500/40 shadow-xl shadow-amber-950/20'
      }`}
    >
      {/* Background ambient decorative glow */}
      <div
        className={`absolute -top-24 -right-24 w-80 h-80 rounded-full blur-3xl pointer-events-none opacity-20 ${
          isBuy ? 'bg-emerald-400' : isSell ? 'bg-rose-500' : 'bg-amber-400'
        }`}
      />

      <div className="relative z-10">
        {analysisSource === 'heuristic_fallback' && (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-amber-300 block">
                Modo Contingência Ativo — Visão Computacional Indisponível
              </span>
              <span className="text-[11px] text-amber-200/90">
                O tempo limite da leitura multimodal foi atingido ou a chave de visão está indisponível. Por proteção estrita de capital, nenhuma entrada é autorizada neste modo.
              </span>
            </div>
          </div>
        )}

        {guardrails && !guardrails.allPassed && (
          <div className="mb-4 p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2.5">
            <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-rose-300 block">
                Sinal Bloqueado por Guardrail de Proteção ({guardrails.vetoReasons.length}{' '}
                {guardrails.vetoReasons.length === 1 ? 'critério vetado' : 'critérios vetados'})
              </span>
              <ul className="list-disc list-inside text-[11px] text-rose-200/95 space-y-0.5">
                {guardrails.vetoReasons.map((reason, idx) => (
                  <li key={idx}>{reason}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Top Header metadata */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800/80 mb-5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono font-bold text-white text-sm">
              {asset}
            </span>
            <span className="text-slate-600">·</span>
            <span className="font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-xs">
              {timeframe}
            </span>
            {entryTimeframe && (
              <span className="font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold">
                Entradas em {entryTimeframe}
              </span>
            )}
            <span
              className={`font-mono px-2 py-0.5 rounded text-[11px] font-semibold border flex items-center gap-1 ${
                isOtc
                  ? 'bg-purple-500/15 text-purple-300 border-purple-500/40'
                  : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
              }`}
              title={marketCriteriaSummary || sessionFallback.sessionAdvisory}
            >
              {isOtc ? (
                <>
                  <Cpu className="w-3 h-3" />
                  <span>Mercado OTC · Price Action Puro</span>
                </>
              ) : (
                <>
                  <Globe2 className="w-3 h-3" />
                  <span>Mercado Aberto · Liquidez Real</span>
                </>
              )}
            </span>
            {calibrationVersion && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-cyan-300 border border-slate-700 hidden sm:inline">
                IA {calibrationVersion}
              </span>
            )}
            <span
              data-testid="analysis-timezone-badge"
              className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/30"
              title={`Horários exibidos em ${activeTimezone}`}
            >
              {formattedAnalysisTimestamp ? `${formattedAnalysisTimestamp} · ${offsetLabel}` : offsetLabel}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-mono font-bold px-2.5 py-1 rounded-md flex items-center gap-1.5 ${
                verdict.hasConsensus
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}
            >
              {verdict.hasConsensus ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Consenso Validado (≥ 80%)</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{guardrails && !guardrails.allPassed ? 'Entrada Vetada pelos Filtros' : 'Consenso Abaixo de 80%'}</span>
                </>
              )}
            </span>
          </div>
        </div>

        {/* Main Verdict Row */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Col 1: Big Verdict Banner (5 cols) */}
          <div className="lg:col-span-5 flex flex-col justify-center">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1">
              Veredito Final Multiagente
            </span>

            <div className="flex items-center gap-4">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${
                  isBuy
                    ? 'bg-emerald-500 text-slate-950 shadow-emerald-500/30'
                    : isSell
                    ? 'bg-rose-500 text-white shadow-rose-500/30'
                    : 'bg-amber-500 text-slate-950 shadow-amber-500/30'
                }`}
              >
                {isBuy && <ArrowUpRight className="w-8 h-8 stroke-[2.5]" />}
                {isSell && <ArrowDownRight className="w-8 h-8 stroke-[2.5]" />}
                {isNeutral && <PauseCircle className="w-8 h-8 stroke-[2.5]" />}
              </div>

              <div>
                <h1
                  className={`text-3xl sm:text-4xl font-extrabold tracking-tight font-mono ${
                    isBuy
                      ? 'text-emerald-400'
                      : isSell
                      ? 'text-rose-400'
                      : 'text-amber-400'
                  }`}
                >
                  {verdict.verdict}
                </h1>
                <p className="text-xs text-slate-300 mt-0.5">
                  {isBuy && 'Sinal altista validado por 4+ agentes'}
                  {isSell && 'Sinal baixista validado por 4+ agentes'}
                  {isNeutral &&
                    (guardrails && !guardrails.allPassed
                      ? 'Operação vetada pelos Guardrails de Proteção (Risco / Filtro Ativo)'
                      : verdict.buyVotes > 0 && verdict.sellVotes > 0
                      ? 'Sinais divergentes entre os agentes (conflito Compra × Venda)'
                      : 'Aguardando confirmação estrutural do conselho multiagente')}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-400 mt-4 leading-relaxed bg-slate-950/40 p-3 rounded-lg border border-slate-800/80">
              {verdict.recommendedAction}
            </p>
          </div>

          {/* Col 2: Voting & Consensus Bar (7 cols) */}
          <div className="lg:col-span-7 bg-slate-950/70 border border-slate-800/90 rounded-xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-200">
                Barra de Consenso (Limiar Mínimo: 80% / 4 em 5)
              </span>
              <span className="text-xs font-mono font-bold text-white">
                {verdict.agreementCount} de {verdict.totalAgents} Agentes ({consensusPct}%)
              </span>
            </div>

            {/* Consensus Progress with 80% threshold marker */}
            <div className="relative w-full h-3.5 bg-slate-800 rounded-full overflow-hidden p-0.5 mb-2">
              {/* 80% Threshold line marker */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white z-20 shadow-sm"
                style={{ left: '80%' }}
                title="Limiar Obrigatório de 80%"
              />

              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  isBuy
                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-400'
                    : isSell
                    ? 'bg-gradient-to-r from-rose-600 to-rose-400'
                    : 'bg-gradient-to-r from-amber-600 to-amber-400'
                }`}
                style={{ width: `${consensusPct}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-4">
              <span>0%</span>
              <span className="text-slate-300 font-semibold">Limiar 80% (4 votos)</span>
              <span>100%</span>
            </div>

            {/* Voting Metrics Breakdown */}
            <div className="grid grid-cols-3 gap-2.5 pt-3 border-t border-slate-800 text-center">
              <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] uppercase font-mono text-emerald-400 block">
                  Votos Compra
                </span>
                <span className="text-base font-bold font-mono text-white tabular-nums">
                  {verdict.buyVotes} / 5
                </span>
              </div>
              <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] uppercase font-mono text-rose-400 block">
                  Votos Venda
                </span>
                <span className="text-base font-bold font-mono text-white tabular-nums">
                  {verdict.sellVotes} / 5
                </span>
              </div>
              <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                <span className="text-[10px] uppercase font-mono text-amber-400 block">
                  Neutro / Aguardar
                </span>
                <span className="text-base font-bold font-mono text-white tabular-nums">
                  {verdict.neutralVotes} / 5
                </span>
              </div>
            </div>

            {/* Overall Confidence & Confluence Score */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="flex items-center justify-between p-2.5 bg-slate-900/60 rounded-lg border border-slate-800/80">
                <span className="text-xs text-slate-400">Score de Confluência:</span>
                <span className="text-xs font-mono font-bold text-emerald-300">
                  {verdict.confluenceScore} / 100
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-900/60 rounded-lg border border-slate-800/80">
                <span className="text-xs text-slate-400">Confiança Média:</span>
                <span className="text-xs font-mono font-bold text-white">
                  {verdict.overallConfidence}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 3 Institutional Guardrails Strip */}
        {guardrails && (
          <div className="mt-5 pt-4 border-t border-slate-800/80">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold block mb-2.5">
              Auditoria dos 3 Guardrails de Assertividade
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* 1. Multi-Timeframe */}
              <div
                className={`p-2.5 rounded-lg border text-[11px] ${
                  guardrails.multiTimeframe.blocked
                    ? 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                    : 'bg-slate-950/70 border-slate-800 text-slate-300'
                }`}
                title={guardrails.multiTimeframe.summary}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-mono font-bold text-[10px] uppercase flex items-center gap-1 text-slate-300">
                    <Layers className="w-3 h-3 text-indigo-400" />
                    Multi-Timeframe
                  </span>
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      guardrails.multiTimeframe.blocked
                        ? 'bg-rose-500/20 text-rose-300'
                        : guardrails.multiTimeframe.macroAttached
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {guardrails.multiTimeframe.blocked
                      ? 'Conflito Macro'
                      : guardrails.multiTimeframe.macroAttached
                      ? `Alinhado (${guardrails.multiTimeframe.macroTrend})`
                      : 'Timeframe Único'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 line-clamp-2">{guardrails.multiTimeframe.summary}</p>
                {guardrails.multiTimeframe.timeframesAnalyzed &&
                  guardrails.multiTimeframe.timeframesAnalyzed.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {guardrails.multiTimeframe.timeframesAnalyzed.map((item) => (
                        <span
                          key={item.timeframe}
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                            item.trend === 'alta'
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              : item.trend === 'baixa'
                              ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                              : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          }`}
                        >
                          {item.timeframe}: {item.trend}
                        </span>
                      ))}
                    </div>
                  )}
              </div>

              {/* 3. Calendário Econômico Real */}
              <div
                className={`p-2.5 rounded-lg border text-[11px] ${
                  guardrails.economicCalendar.blocked
                    ? 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                    : guardrails.economicCalendar.exempt
                    ? 'bg-purple-950/20 border-purple-500/30 text-purple-200'
                    : 'bg-slate-950/70 border-slate-800 text-slate-300'
                }`}
                title={guardrails.economicCalendar.summary}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-mono font-bold text-[10px] uppercase flex items-center gap-1 text-slate-300">
                    <CalendarClock className="w-3 h-3 text-amber-400" />
                    Notícias (±15m)
                  </span>
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      guardrails.economicCalendar.blocked
                        ? 'bg-rose-500/20 text-rose-300'
                        : guardrails.economicCalendar.exempt
                        ? 'bg-purple-500/20 text-purple-300'
                        : 'bg-emerald-500/15 text-emerald-300'
                    }`}
                  >
                    {guardrails.economicCalendar.blocked
                      ? 'Notícia Ativa'
                      : guardrails.economicCalendar.exempt
                      ? 'OTC Isento'
                      : 'Janela Limpa'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 line-clamp-2">{guardrails.economicCalendar.summary}</p>
              </div>

              {/* 4. Filtro Zona Espremida (Marcus Sterling) */}
              <div
                className={`p-2.5 rounded-lg border text-[11px] ${
                  guardrails.squeezeZone.blocked
                    ? 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                    : 'bg-slate-950/70 border-slate-800 text-slate-300'
                }`}
                title={guardrails.squeezeZone.summary}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-mono font-bold text-[10px] uppercase flex items-center gap-1 text-slate-300">
                    <Scale className="w-3 h-3 text-emerald-400" />
                    Zona Espremida
                  </span>
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      guardrails.squeezeZone.blocked
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-emerald-500/15 text-emerald-300'
                    }`}
                  >
                    {guardrails.squeezeZone.blocked
                      ? `Vetado 1:${guardrails.squeezeZone.freeClearanceRR}`
                      : `Livre 1:${guardrails.squeezeZone.freeClearanceRR}`}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 line-clamp-2">{guardrails.squeezeZone.summary}</p>
              </div>
            </div>
          </div>
        )}

        {/* Métricas Críticas de Execução (5 Pilares + Aba Dedicada de Horário de Entrada) */}
        <div className="mt-6 pt-5 border-t border-slate-800/80">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono">
                Métricas Críticas de Execução
              </span>
            </div>

            {/* Dedicated Tabs inside Métricas Críticas de Execução */}
            <div
              role="tablist"
              aria-label="Métricas Críticas de Execução"
              className="inline-flex p-1 rounded-lg bg-slate-950/90 border border-slate-800 self-start sm:self-auto"
            >
              <button
                type="button"
                role="tab"
                aria-selected={metricsTab === 'overview'}
                onClick={() => setMetricsTab('overview')}
                className={`px-3 py-1 rounded-md text-[11px] font-mono font-semibold transition-all cursor-pointer ${
                  metricsTab === 'overview'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                Visão Geral (5 Pilares)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={metricsTab === 'entry_timing'}
                onClick={() => setMetricsTab('entry_timing')}
                className={`px-3 py-1 rounded-md text-[11px] font-mono font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  metricsTab === 'entry_timing'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <Clock className="w-3 h-3" />
                <span>Horário de Entrada</span>
              </button>
            </div>
          </div>

          {metricsTab === 'overview' ? (
            <div className="space-y-3">
              {/* Row 1: Tendência, Padrão Chave, Qualidade */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 1. Tendência */}
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/90 hover:border-slate-700/80 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                        <Compass className="w-3.5 h-3.5 text-cyan-400" />
                        1. Tendência
                      </span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${trendBadgeColor}`}>
                        {resolvedInsights.trendDirection}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-white font-mono leading-snug">
                      {resolvedInsights.trend}
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-2.5 block font-mono">
                    Estrutura de topos e médias
                  </span>
                </div>

                {/* 2. Padrão Chave */}
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/90 hover:border-slate-700/80 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5 text-purple-400" />
                        2. Padrão Chave
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/50">
                        {resolvedInsights.patternType || 'Validado'}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-white font-mono leading-snug">
                      {resolvedInsights.keyPattern}
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-2.5 block font-mono">
                    Formação gráfica e candle
                  </span>
                </div>

                {/* 3. Qualidade */}
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/90 hover:border-slate-700/80 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <Award className="w-3.5 h-3.5 text-emerald-400" />
                        3. Qualidade
                      </span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        Grau {resolvedInsights.qualityGrade}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-white font-mono leading-snug">
                      {resolvedInsights.quality}
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-2.5 block font-mono">
                    Probabilidade e confluência
                  </span>
                </div>
              </div>

              {/* Row 2: Expiração Ideal (Dinâmica) + Horário de Entrada Recomendado */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* 4. Expiração Ideal Dinâmica */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-amber-500/30 hover:border-amber-500/50 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                        <Timer className="w-3.5 h-3.5 text-amber-400" />
                        4. Expiração Ideal (Dinâmica)
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/50">
                        {effectiveTimeframe} · Adaptativa
                      </span>
                    </div>
                    <p className="text-sm font-bold text-white font-mono leading-snug">
                      {resolvedInsights.idealExpiration}
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                    {resolvedInsights.expirationRationale}
                  </p>
                </div>

                {/* 5. Horário de Entrada Recomendado */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-sky-500/30 hover:border-sky-500/50 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5 shrink-0">
                        <Clock className="w-3.5 h-3.5 text-sky-400" />
                        5. Horário de Entrada ({offsetLabel})
                      </span>
                      <span
                        title={resolvedInsights.entryTrigger || 'Gatilho Temporal'}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950/60 text-sky-300 border border-sky-800/50 max-w-[190px] truncate"
                      >
                        {resolvedInsights.entryTrigger || 'Gatilho Temporal'}
                      </span>
                    </div>
                    <p
                      data-testid="overview-entry-timing"
                      className="text-sm font-bold text-sky-200 font-mono leading-snug"
                    >
                      {resolvedInsights.entryTiming}
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                    {resolvedInsights.entryTimingRationale}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Dedicated Expanded Horário de Entrada Tab */
            <div className="p-5 rounded-xl bg-slate-950/90 border border-sky-500/40 shadow-inner">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-sky-500/15 border border-sky-500/40 flex items-center justify-center shrink-0">
                    <Clock className="w-6 h-6 text-sky-400" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-sky-400 font-bold block">
                      Momento / Horário de Entrada Recomendado ({offsetLabel})
                    </span>
                    <h4
                      data-testid="tab-entry-timing"
                      className="text-lg sm:text-xl font-extrabold text-white font-mono tracking-tight"
                    >
                      {resolvedInsights.entryTiming}
                    </h4>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 self-start md:self-auto shrink-0">
                  {onChangeTimezone && (
                    <TimezoneSelector
                      variant="compact"
                      value={activeTimezone}
                      onChange={onChangeTimezone}
                    />
                  )}
                  <CandleCountdownBadge timeframe={effectiveTimeframe} timezone={activeTimezone} />
                  <span
                    title={resolvedInsights.entryTrigger || 'Sincronia Temporal'}
                    className="text-xs font-mono font-bold px-3 py-1 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/40 max-w-[240px] truncate"
                  >
                    {resolvedInsights.entryTrigger || 'Sincronia Temporal'}
                  </span>
                  <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-slate-900 text-slate-300 border border-slate-700">
                    {effectiveTimeframe}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div className="md:col-span-2 bg-slate-900/70 p-3.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                    Fundamentação Visual e Temporal do Gráfico
                  </span>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    {resolvedInsights.entryTimingRationale}
                  </p>
                </div>

                <div className="bg-slate-900/70 p-3.5 rounded-lg border border-slate-800 flex flex-col justify-center">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 block mb-1">
                    Expiração Calibrada para esta Entrada
                  </span>
                  <span className="text-sm font-bold font-mono text-white">
                    {resolvedInsights.idealExpiration}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1">
                    Padrão: {resolvedInsights.keyPattern}
                  </span>
                </div>
              </div>

              {/* Sessão & Liquidez Global / Critério Híbrido + Calendário Real */}
              <div className="mt-3 bg-slate-900/70 p-3.5 rounded-lg border border-slate-800 flex flex-col gap-3">
                <div className="flex items-start gap-2.5">
                  {isOtc ? (
                    <Cpu className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                  ) : (
                    <Globe2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span
                      className={`text-[10px] font-mono uppercase tracking-wider font-bold block ${
                        isOtc ? 'text-purple-400' : 'text-emerald-400'
                      }`}
                    >
                      {isOtc
                        ? 'Modo Mercado OTC · Price Action & Repetição Algorítmica'
                        : 'Modo Mercado Aberto · Sessão, Volume & Notícias Reais'}
                    </span>
                    <p className="text-xs font-bold text-white font-mono mt-0.5">
                      {resolvedInsights.sessionLiquidity}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      {marketCriteriaSummary || resolvedInsights.sessionAdvisory}
                    </p>
                  </div>
                </div>

                {guardrails?.economicCalendar && !isOtc && (
                  <div className="pt-2.5 border-t border-slate-800/80">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold block mb-1.5">
                      Calendário Econômico Real ({guardrails.economicCalendar.affectedCurrencies.join('/') || asset})
                    </span>
                    <p className="text-[11px] text-slate-300 mb-2">{guardrails.economicCalendar.summary}</p>
                    {guardrails.economicCalendar.upcomingEvents && guardrails.economicCalendar.upcomingEvents.length > 0 && (
                      <div className="space-y-1">
                        {guardrails.economicCalendar.upcomingEvents.map((ev, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between text-[11px] font-mono bg-slate-950/60 px-2.5 py-1 rounded border border-slate-800"
                          >
                            <span className="text-slate-200 truncate">
                              <strong className="text-amber-300">{ev.currency}</strong> · {ev.title}
                            </span>
                            <span className="text-slate-400 shrink-0 ml-2">
                              {ev.timeUtc} ({ev.minutesDelta >= 0 ? `em ${ev.minutesDelta}m` : `há ${Math.abs(ev.minutesDelta)}m`})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Plano Tático de Execução & Gestão de Risco (para sinais válidos COMPRA / VENDA) */}
        {plan && !isNeutral && (
          <div className="mt-5 pt-4 border-t border-slate-800/80">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1.5">
                <Crosshair className="w-3.5 h-3.5" />
                <span>Plano Tático de Execução &amp; Gestão de Risco</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700">
                Risco: <strong className="text-white">{plan.riskLevel}</strong> · R:R{' '}
                <strong className="text-emerald-300">{plan.riskRewardRatio}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                <span className="text-[10px] font-mono uppercase text-cyan-400 block">Zona de Entrada</span>
                <span className="text-xs font-mono font-bold text-white mt-0.5 block">{plan.entryZone}</span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-lg border border-emerald-500/30">
                <span className="text-[10px] font-mono uppercase text-emerald-400 block">Alvo Principal (TP1)</span>
                <span className="text-xs font-mono font-bold text-emerald-300 mt-0.5 block">{plan.takeProfit1}</span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-lg border border-rose-500/30">
                <span className="text-[10px] font-mono uppercase text-rose-400 block">Invalidação (Stop)</span>
                <span className="text-xs font-mono font-bold text-rose-300 mt-0.5 block">{plan.stopLoss}</span>
              </div>
            </div>
          </div>
        )}

        {/* Key factors row */}
        {verdict.keyFactors && verdict.keyFactors.length > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-800/80">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block mb-2">
              Principais Justificativas Técnicas Identificadas pelos Agentes:
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {verdict.keyFactors.map((factor, idx) => (
                <div
                  key={idx}
                  className="text-xs text-slate-300 bg-slate-950/40 px-3 py-2 rounded-lg border border-slate-800/60 flex items-start gap-2"
                >
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{factor}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
