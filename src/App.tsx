import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Header } from './components/Header';
import { ModeSelector } from './components/ModeSelector';
import { ChartUploadZone } from './components/ChartUploadZone';
import { ConsensusVerdictCard } from './components/ConsensusVerdictCard';
import { MultiAgentVotingGrid } from './components/MultiAgentVotingGrid';
import { ConfluenceRadarChart } from './components/ConfluenceRadarChart';
import { HistoryDrawer } from './components/HistoryDrawer';
import { ArchitectureModal } from './components/ArchitectureModal';
import { AnnotatedChartView } from './components/AnnotatedChartView';
import { AuthSessionState, LoginPage } from './components/LoginPage';
import { AdminPanel } from './components/AdminPanel';
import { TesterAccessBar } from './components/TesterAccessBar';
import { TimezoneSelector } from './components/TimezoneSelector';
import {
  AgentCalibrationProfile,
  AnalysisResult,
  BankrollSettings,
  EntryExecutionTimeframe,
  MarketEnvironment,
} from './types/trading';
import { compressImageForAnalysis, createHistoryThumbnail } from './utils/imageOptimizer';
import {
  computeAssetTimeframeRanking,
  computeDailyBankrollProtection,
  sanitizeBankrollSettings,
  sanitizeStoredHistory,
} from './utils/historyAnalytics';
import { normalizeExplicitMarketEnvironment } from './utils/timingEngine';
import {
  convertAnalysisForTimezone,
  formatHHMMInTimeZone,
  getBrowserTimeZone,
  normalizeTimeZone,
  TIMEZONE_STORAGE_KEY,
} from './utils/timezone';
import {
  parseStoredSoundEnabled,
  SOUND_SETTINGS_STORAGE_KEY,
  soundNotifier,
} from './utils/soundNotifier';
import { AlertCircle, ShieldAlert, ShieldCheck, Wallet } from 'lucide-react';

const LOCAL_STORAGE_KEY = 'nextcandle_analysis_history_v1';
const BANKROLL_STORAGE_KEY = 'nextcandle_bankroll_v1';
const MARKET_ENV_STORAGE_KEY = 'nextcandle_market_env_v1';

export default function App() {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [entryTimeframe, setEntryTimeframe] = useState<EntryExecutionTimeframe>('M5');
  const [marketEnvironment, setMarketEnvironment] = useState<MarketEnvironment>(() => {
    try {
      return normalizeExplicitMarketEnvironment(localStorage.getItem(MARKET_ENV_STORAGE_KEY)) || 'MERCADO_ABERTO';
    } catch {
      return 'MERCADO_ABERTO';
    }
  });
  const [selectedTimezone, setSelectedTimezone] = useState<string>(() => {
    try {
      return normalizeTimeZone(localStorage.getItem(TIMEZONE_STORAGE_KEY), getBrowserTimeZone());
    } catch {
      return getBrowserTimeZone();
    }
  });

  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [authSession, setAuthSession] = useState<AuthSessionState | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'setup'>('login');
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'terminal' | 'admin'>('terminal');

  const [history, setHistory] = useState<AnalysisResult[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [isArchitectureOpen, setIsArchitectureOpen] = useState<boolean>(false);

  const [calibrationProfile, setCalibrationProfile] = useState<AgentCalibrationProfile | null>(null);

  const [bankrollSettings, setBankrollSettings] = useState<BankrollSettings>({
    bankrollAmount: 1000,
    riskPercent: 1.5,
  });

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return parseStoredSoundEnabled(localStorage.getItem(SOUND_SETTINGS_STORAGE_KEY));
    } catch {
      return true;
    }
  });

  const activeRequestIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRef = useRef<AnalysisResult[]>([]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    soundNotifier.setEnabled(soundEnabled);
  }, [soundEnabled]);

  // Load history & bankroll settings from localStorage with strict schema sanitization, and fetch active AI agent calibration
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const sanitizedHistory = sanitizeStoredHistory(JSON.parse(stored));
        historyRef.current = sanitizedHistory;
        setHistory(sanitizedHistory);
      }
    } catch (e) {
      console.error('Erro ao ler histórico local:', e);
    }

    try {
      const storedBankroll = localStorage.getItem(BANKROLL_STORAGE_KEY);
      if (storedBankroll) {
        const sanitizedBankroll = sanitizeBankrollSettings(JSON.parse(storedBankroll));
        if (sanitizedBankroll) {
          setBankrollSettings(sanitizedBankroll);
        }
      }
    } catch (e) {
      console.error('Erro ao ler gestão de banca local:', e);
    }

    const statusAbort = new AbortController();
    fetch('/api/auth/status', { signal: statusAbort.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && (data.mode === 'setup' || data.mode === 'login')) {
          setAuthMode(data.mode);
        }
      })
      .catch(() => {});

    return () => {
      statusAbort.abort();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!authSession) return;
    const calAbort = new AbortController();
    fetch('/api/agent-calibration', {
      signal: calAbort.signal,
      headers: { Authorization: `Bearer ${authSession.token}` },
    })
      .then(async (res) => {
        if (res.status === 401) {
          const errData = await res.json().catch(() => ({}));
          setAuthSession(null);
          setActiveView('terminal');
          setAuthNotice(
            errData.error || 'Sessão expirada. Inicia sessão novamente.'
          );
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => {
        if (data && data.version) setCalibrationProfile(data);
      })
      .catch(() => {});

    return () => {
      calAbort.abort();
    };
  }, [authSession]);

  // Periodically verify active temporary tester session against the server (catches revocations & 24h expiry)
  useEffect(() => {
    if (!authSession || authSession.role !== 'tester') return;

    const verifySession = async () => {
      try {
        const res = await fetch('/api/auth/session', {
          headers: { Authorization: `Bearer ${authSession.token}` },
        });
        if (res.status === 401) {
          const errData = await res.json().catch(() => ({}));
          setAuthSession(null);
          setActiveView('terminal');
          setAuthNotice(
            errData.error ||
              'O acesso temporário de 24 horas expirou e a conta foi bloqueada automaticamente.'
          );
          return;
        }
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data && typeof data.serverNow === 'number') {
            setAuthSession((prev) =>
              prev ? { ...prev, clockOffsetMs: data.serverNow - Date.now() } : prev
            );
          }
        }
      } catch {
        // Ignore transient network hiccups; local timer still enforces 24h boundary
      }
    };

    const intervalId = setInterval(() => {
      void verifySession();
    }, 30000);

    return () => clearInterval(intervalId);
  }, [authSession]);

  const handleUpdateBankrollSettings = useCallback((next: BankrollSettings) => {
    setBankrollSettings(next);
    try {
      localStorage.setItem(BANKROLL_STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.error('Erro ao salvar gestão de banca:', e);
    }
  }, []);

  const handleToggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      soundNotifier.setEnabled(next);
      try {
        localStorage.setItem(SOUND_SETTINGS_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage quota errors
      }
      if (next) {
        soundNotifier.unlock();
        soundNotifier.playToggleConfirmation();
      }
      return next;
    });
  }, []);

  const handleChangeMarketEnvironment = useCallback((nextEnv: MarketEnvironment) => {
    setMarketEnvironment(nextEnv);
    try {
      localStorage.setItem(MARKET_ENV_STORAGE_KEY, nextEnv);
    } catch {
      // Ignore storage quota errors
    }
  }, []);

  const handleChangeTimezone = useCallback((rawTz: string) => {
    const normalized = normalizeTimeZone(rawTz, getBrowserTimeZone());
    setSelectedTimezone(normalized);
    try {
      localStorage.setItem(TIMEZONE_STORAGE_KEY, normalized);
    } catch {
      // Ignore storage quota errors
    }
  }, []);

  // Save history to localStorage with QuotaExceededError protection
  const persistHistory = useCallback((updatedHistory: AnalysisResult[]) => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedHistory));
    } catch {
      try {
        const compacted = updatedHistory.slice(0, 25).map((item, idx) =>
          idx < 10
            ? { ...item, macroImagePreview: undefined, timeframeImages: undefined }
            : { ...item, imagePreview: undefined, macroImagePreview: undefined, timeframeImages: undefined }
        );
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(compacted));
      } catch {
        try {
          const minimal = updatedHistory.slice(0, 15).map((item, idx) =>
            idx === 0
              ? { ...item, macroImagePreview: undefined, timeframeImages: undefined }
              : { ...item, imagePreview: undefined, macroImagePreview: undefined, timeframeImages: undefined }
          );
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(minimal));
        } catch (err) {
          console.error('Erro ao salvar histórico local (limite de armazenamento):', err);
        }
      }
    }
  }, []);

  const saveHistory = useCallback(
    (updater: AnalysisResult[] | ((prev: AnalysisResult[]) => AnalysisResult[])) => {
      const next = typeof updater === 'function' ? updater(historyRef.current) : updater;
      historyRef.current = next;
      setHistory(next);
      persistHistory(next);
    },
    [persistHistory]
  );

  const syncCalibrationAutomatically = useCallback(async (recordsToAnalyze: AnalysisResult[]) => {
    try {
      const decided = recordsToAnalyze.filter((r) => r.outcome === 'win' || r.outcome === 'loss');
      const wins = decided.filter((r) => r.outcome === 'win').length;
      const openDecided = decided.filter(
        (r) => (r.marketEnvironment || 'MERCADO_ABERTO') === 'MERCADO_ABERTO'
      );
      const otcDecided = decided.filter(
        (r) => (r.marketEnvironment || 'MERCADO_ABERTO') === 'MERCADO_OTC'
      );
      const ranking = computeAssetTimeframeRanking(recordsToAnalyze);

      const performanceFeedback = {
        totalDecided: decided.length,
        overallWinRate: decided.length > 0 ? Math.round((wins / decided.length) * 100) : 0,
        openWinRate:
          openDecided.length > 0
            ? Math.round((openDecided.filter((r) => r.outcome === 'win').length / openDecided.length) * 100)
            : null,
        otcWinRate:
          otcDecided.length > 0
            ? Math.round((otcDecided.filter((r) => r.outcome === 'win').length / otcDecided.length) * 100)
            : null,
        strongestAssets: ranking.slice(0, 2).map((s) => `${s.asset} ${s.timeframe} (${s.winRate}%)`),
        weakestAssets: ranking
          .filter((s) => s.winRate < 55)
          .slice(-2)
          .map((s) => `${s.asset} ${s.timeframe} (${s.winRate}%)`),
      };

      const res = await fetch('/api/agent-calibration/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authSession ? { Authorization: `Bearer ${authSession.token}` } : {}),
        },
        body: JSON.stringify({ performanceFeedback }),
      });

      if (res.status === 401) {
        const errData = await res.json().catch(() => ({}));
        setAuthSession(null);
        setActiveView('terminal');
        setAuthNotice(errData.error || 'Sessão expirada. Inicia sessão novamente.');
        return;
      }

      if (res.ok) {
        const updated: AgentCalibrationProfile = await res.json();
        setCalibrationProfile(updated);
      }
    } catch {
      // Background adaptive calibration fails silently without interrupting workflow
    }
  }, [authSession]);

  const handleAnalyze = useCallback(
    async (overrideImage?: string) => {
      const targetImage = overrideImage || imagePreview;
      if (!targetImage) {
        setErrorMessage('Por favor, envie ou selecione uma imagem de gráfico antes de analisar.');
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const requestId = ++activeRequestIdRef.current;
      setIsAnalyzing(true);
      setErrorMessage(null);
      soundNotifier.unlock();
      soundNotifier.playAnalysisStart();

      try {
        const now = new Date();
        const optimizedImage = await compressImageForAnalysis(targetImage);
        if (controller.signal.aborted || requestId !== activeRequestIdRef.current) return;

        const response = await fetch('/api/analyze-chart', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authSession ? { Authorization: `Bearer ${authSession.token}` } : {}),
          },
          signal: controller.signal,
          body: JSON.stringify({
            imageBase64: optimizedImage,
            mode: 'simple',
            asset: '',
            timeframe: entryTimeframe,
            entryTimeframe,
            marketEnvironment,
            additionalContext: `Tempo gráfico das entradas selecionado: ${entryTimeframe} | Foco exclusivo no mercado selecionado: ${marketEnvironment === 'MERCADO_OTC' ? 'Mercado OTC' : 'Mercado Aberto'} | Fuso horário selecionado: ${selectedTimezone}`,
            clientTime: formatHHMMInTimeZone(now, selectedTimezone),
            utcHour: now.getUTCHours(),
            timezone: selectedTimezone,
            analysisTimestampMs: now.getTime(),
          }),
        });

        if (response.status === 401) {
          const errData = await response.json().catch(() => ({}));
          setAuthSession(null);
          setActiveView('terminal');
          setAuthNotice(errData.error || 'Sessão expirada. Inicia sessão novamente.');
          return;
        }

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Falha na requisição (Status ${response.status})`);
        }

        const data: AnalysisResult = await response.json();
        if (requestId !== activeRequestIdRef.current) return;

        setCurrentAnalysis(data);
        soundNotifier.playAnalysisSuccess(data.verdict.verdict);

        const thumbnail = await createHistoryThumbnail(data.imagePreview || optimizedImage);
        if (requestId !== activeRequestIdRef.current) return;

        const historyRecord: AnalysisResult = {
          ...data,
          imagePreview: thumbnail,
          timeframeImages: undefined,
        };

        saveHistory((prev) => [historyRecord, ...prev.filter((h) => h.id !== data.id)].slice(0, 50));

        if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = setTimeout(() => {
          const resultsElement = document.getElementById('results-section');
          if (resultsElement) {
            resultsElement.scrollIntoView({ behavior: 'smooth' });
          }
        }, 150);
      } catch (err: any) {
        if (err?.name === 'AbortError' || requestId !== activeRequestIdRef.current) return;
        console.error('Falha ao analisar gráfico:', err);
        setErrorMessage(err.message || 'Ocorreu um erro ao processar o gráfico com os 5 agentes.');
      } finally {
        if (requestId === activeRequestIdRef.current) {
          setIsAnalyzing(false);
        }
      }
    },
    [authSession, entryTimeframe, marketEnvironment, selectedTimezone, imagePreview, saveHistory]
  );

  const handleImageSelected = useCallback(
    (base64: string, _filename?: string, autoTrigger = true) => {
      setImagePreview(base64);
      setErrorMessage(null);
      if (autoTrigger) {
        void handleAnalyze(base64);
      }
    },
    [handleAnalyze]
  );

  const handleClearImage = useCallback(() => {
    setImagePreview(null);
    setCurrentAnalysis(null);
    setErrorMessage(null);
  }, []);

  const handleToggleOutcome = useCallback(
    (id: string, outcome: 'win' | 'loss' | 'pending') => {
      const nextRecords = historyRef.current.map((item) =>
        item.id === id ? { ...item, outcome } : item
      );
      historyRef.current = nextRecords;
      setHistory(nextRecords);
      persistHistory(nextRecords);

      if (outcome === 'win' || outcome === 'loss') {
        void syncCalibrationAutomatically(nextRecords);
      }
      setCurrentAnalysis((prev) => (prev && prev.id === id ? { ...prev, outcome } : prev));
    },
    [persistHistory, syncCalibrationAutomatically]
  );

  const localizedAnalysis = useMemo(
    () => (currentAnalysis ? convertAnalysisForTimezone(currentAnalysis, selectedTimezone) : null),
    [currentAnalysis, selectedTimezone]
  );

  const dailyBankrollProtection = useMemo(
    () =>
      computeDailyBankrollProtection(
        history,
        bankrollSettings.bankrollAmount,
        bankrollSettings.riskPercent
      ),
    [history, bankrollSettings.bankrollAmount, bankrollSettings.riskPercent]
  );

  const handleClearHistory = useCallback(() => {
    saveHistory([]);
  }, [saveHistory]);

  const handleSelectRecord = useCallback((rec: AnalysisResult) => {
    setCurrentAnalysis(rec);
    setImagePreview(rec.imagePreview || null);
    if (rec.entryTimeframe === 'M1' || rec.entryTimeframe === 'M5') {
      setEntryTimeframe(rec.entryTimeframe);
    }
    if (rec.marketEnvironment === 'MERCADO_ABERTO' || rec.marketEnvironment === 'MERCADO_OTC') {
      handleChangeMarketEnvironment(rec.marketEnvironment);
    }
  }, [handleChangeMarketEnvironment]);

  const handleLogout = useCallback(
    (reasonNotice?: string) => {
      const token = authSession?.token;
      if (token) {
        fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setAuthSession(null);
      setActiveView('terminal');
      setAuthMode('login');
      setAuthNotice(typeof reasonNotice === 'string' ? reasonNotice : null);
      setImagePreview(null);
      setCurrentAnalysis(null);
      setErrorMessage(null);
      setIsHistoryOpen(false);
      setIsArchitectureOpen(false);
    },
    [authSession]
  );

  const handleTesterExpired = useCallback(() => {
    handleLogout(
      'O acesso temporário de 24 horas expirou e a conta foi bloqueada automaticamente.'
    );
  }, [handleLogout]);

  if (!authSession) {
    return (
      <LoginPage
        authMode={authMode}
        initialNotice={authNotice}
        onAuthenticated={(session) => {
          setAuthSession(session);
          setActiveView('terminal');
          setAuthMode('login');
          setAuthNotice(null);
          setImagePreview(null);
          setCurrentAnalysis(null);
          setErrorMessage(null);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <Header
        onOpenHistory={() => {
          setActiveView('terminal');
          setIsHistoryOpen(true);
        }}
        onOpenArchitecture={() => setIsArchitectureOpen(true)}
        historyCount={history.length}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        userEmail={authSession.email}
        userRole={authSession.role}
        isAdminViewOpen={activeView === 'admin'}
        onToggleAdminView={() =>
          setActiveView((prev) => (prev === 'admin' ? 'terminal' : 'admin'))
        }
        onLogout={() => handleLogout()}
      />

      {/* Live Remaining Access Time Bar for Temporary 24h Test Users */}
      {authSession.role === 'tester' && typeof authSession.expiresAt === 'number' && (
        <TesterAccessBar
          email={authSession.email}
          expiresAt={authSession.expiresAt}
          clockOffsetMs={authSession.clockOffsetMs}
          timezone={selectedTimezone}
          onExpired={handleTesterExpired}
        />
      )}

      {/* Main Content Area: Admin Panel OR Quantitative Terminal */}
      {authSession.role === 'admin' && activeView === 'admin' ? (
        <main className="flex-1 w-full">
          <AdminPanel
            token={authSession.token}
            adminEmail={authSession.email}
            timezone={selectedTimezone}
            onBackToTerminal={() => setActiveView('terminal')}
            onSessionExpired={(msg) => handleLogout(msg)}
          />
        </main>
      ) : (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Hero Tagline Strip */}
        <div className="mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/40 p-4 rounded-xl border border-slate-800">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Análise Preditiva & Visão Computacional Multiagente
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              5 IAs especializadas analisam Price Action, Indicadores, Fluxo, Modelos Preditivos e Risco antes de votar com consenso mínimo de 80% e 3 guardrails institucionais.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Consenso Seguro: 4/5 Votos</span>
            </div>
          </div>
        </div>

        {/* Global Country / Timezone Selector Strip */}
        <TimezoneSelector
          value={selectedTimezone}
          onChange={handleChangeTimezone}
          disabled={isAnalyzing}
        />

        {/* Error notification */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-slate-400 hover:text-white text-xs font-mono"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Step 1: Modo de Analise & Calibração Adaptativa Automática */}
        <ModeSelector calibrationProfile={calibrationProfile} marketEnvironment={marketEnvironment} />

        {/* Proactive Stop Diário / Bankroll Protection Alert before next trade */}
        {dailyBankrollProtection.protectionLevel !== 'normal' && (
          <div
            role="alert"
            className={`mb-5 p-3.5 sm:p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              dailyBankrollProtection.protectionLevel === 'stop_daily'
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-100'
                : 'bg-amber-500/15 border-amber-500/40 text-amber-100'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <ShieldAlert
                className={`w-5 h-5 shrink-0 mt-0.5 ${
                  dailyBankrollProtection.protectionLevel === 'stop_daily' ? 'text-rose-400' : 'text-amber-400'
                }`}
              />
              <div>
                <span className="text-xs font-mono font-bold block">
                  {dailyBankrollProtection.alertTitle}
                </span>
                <p className="text-[11px] opacity-90 mt-0.5">
                  {dailyBankrollProtection.alertMessage}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsHistoryOpen(true)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-white flex items-center gap-1.5 self-start sm:self-auto shrink-0 cursor-pointer"
            >
              <Wallet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Gestão de Banca</span>
            </button>
          </div>
        )}

        {/* Step 2: Entry Timeframe (M1/M5) + Market Focus (Aberto/OTC) + Quick Single Upload */}
        <ChartUploadZone
          imagePreview={imagePreview}
          entryTimeframe={entryTimeframe}
          onChangeEntryTimeframe={setEntryTimeframe}
          marketEnvironment={marketEnvironment}
          onChangeMarketEnvironment={handleChangeMarketEnvironment}
          onImageSelected={handleImageSelected}
          onClearImage={handleClearImage}
          isAnalyzing={isAnalyzing}
          soundEnabled={soundEnabled}
        />

        {/* Step 3: Analysis Results Section */}
        {localizedAnalysis && (
          <div id="results-section" className="pt-4 space-y-6">
            {/* Primary Decision Banner (Consensus Verdict with 3 Guardrails + 5 Pillars) */}
            <ConsensusVerdictCard
              verdict={localizedAnalysis.verdict}
              insights={localizedAnalysis.insights}
              plan={localizedAnalysis.plan}
              asset={localizedAnalysis.asset}
              timeframe={localizedAnalysis.timeframe}
              entryTimeframe={localizedAnalysis.entryTimeframe}
              analysisSource={localizedAnalysis.analysisSource}
              marketEnvironment={localizedAnalysis.marketEnvironment}
              marketCriteriaSummary={localizedAnalysis.marketCriteriaSummary}
              guardrails={localizedAnalysis.guardrails}
              calibrationVersion={localizedAnalysis.calibrationVersion}
              timezone={selectedTimezone}
              onChangeTimezone={handleChangeTimezone}
              analysisTimestamp={localizedAnalysis.timestamp}
            />

            {/* Versão Anotada Passo a Passo na Própria Imagem */}
            {localizedAnalysis.imagePreview && <AnnotatedChartView analysis={localizedAnalysis} />}

            {/* Radar de Confluência Multiagente */}
            <ConfluenceRadarChart metrics={localizedAnalysis.radarMetrics} />

            {/* The 5 Specialized Agents Voting Grid */}
            <MultiAgentVotingGrid
              agents={localizedAnalysis.agents}
              marketEnvironment={localizedAnalysis.marketEnvironment}
            />
          </div>
        )}
      </main>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-[#070b12] py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>
            NextCandle.AI Quantitative Terminal · Análise probabilística baseada em visão computacional e modelos preditivos
          </p>
          <p className="font-mono text-[11px] text-slate-600">
            Regra de Votação: Limiar de 80% (mínimo 4 de 5 agentes concordantes)
          </p>
        </div>
      </footer>

      {/* History Drawer + Gestão de Banca & Ranking */}
      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        records={history}
        bankrollSettings={bankrollSettings}
        onUpdateBankrollSettings={handleUpdateBankrollSettings}
        onSelectRecord={handleSelectRecord}
        onToggleOutcome={handleToggleOutcome}
        onClearHistory={handleClearHistory}
        timezone={selectedTimezone}
      />

      {/* Architecture Explainer Modal */}
      <ArchitectureModal
        isOpen={isArchitectureOpen}
        onClose={() => setIsArchitectureOpen(false)}
        calibrationProfile={calibrationProfile}
      />
    </div>
  );
}
