import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Upload,
  Clipboard,
  Sparkles,
  Image as ImageIcon,
  X,
  CheckCircle2,
  RefreshCw,
  Cpu,
  Activity,
  ShieldCheck,
  TrendingUp,
  BarChart3,
  Zap,
  Camera,
  Clock,
  Volume2,
  Globe,
} from 'lucide-react';
import { CameraCaptureModal } from './CameraCaptureModal';
import { EntryExecutionTimeframe, MarketEnvironment } from '../types/trading';
import { soundNotifier } from '../utils/soundNotifier';

interface ChartUploadZoneProps {
  imagePreview: string | null;
  entryTimeframe: EntryExecutionTimeframe;
  onChangeEntryTimeframe: (tf: EntryExecutionTimeframe) => void;
  marketEnvironment: MarketEnvironment;
  onChangeMarketEnvironment: (env: MarketEnvironment) => void;
  onImageSelected: (base64: string, filename?: string, autoTrigger?: boolean) => void;
  onClearImage: () => void;
  onCancelAnalysis?: () => void;
  isAnalyzing: boolean;
  isModalOpen?: boolean;
  soundEnabled?: boolean;
}

const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo de imagem.'));
    reader.readAsDataURL(file);
  });

export const ChartUploadZone: React.FC<ChartUploadZoneProps> = React.memo(({
  imagePreview,
  entryTimeframe,
  onChangeEntryTimeframe,
  marketEnvironment,
  onChangeMarketEnvironment,
  onImageSelected,
  onClearImage,
  onCancelAnalysis,
  isAnalyzing,
  isModalOpen = false,
  soundEnabled = true,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [pasteNotice, setPasteNotice] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);
  const pasteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pasteTimerRef.current) clearTimeout(pasteTimerRef.current);
    };
  }, []);

  // Cycle through agent stages while analyzing
  useEffect(() => {
    if (!isAnalyzing) {
      setAnalysisStep(0);
      return;
    }

    setAnalysisStep(0);
    const interval = setInterval(() => {
      setAnalysisStep((prev) => (prev < 4 ? prev + 1 : prev));
    }, 520);

    return () => clearInterval(interval);
  }, [isAnalyzing]);

  // Emit discrete step pulse when advancing through agent stages during active analysis
  useEffect(() => {
    if (isAnalyzing && analysisStep > 0) {
      soundNotifier.playAgentStep(analysisStep);
    }
  }, [isAnalyzing, analysisStep]);

  const processSelectedFile = useCallback(
    async (file: File, sourceLabel?: string, fromPaste = false) => {
      if (!file.type.startsWith('image/')) {
        setFileError('Formato inválido. Envie apenas arquivos de imagem (PNG, JPG ou WEBP).');
        return;
      }
      if (file.size > MAX_UPLOAD_SIZE_BYTES) {
        setFileError('Arquivo muito grande (limite de 20 MB).');
        return;
      }

      setFileError(null);
      try {
        const base64 = await readFileAsDataUrl(file);
        if (!base64) {
          setFileError('Não foi possível carregar os dados da imagem selecionada.');
          return;
        }
        onImageSelected(base64, sourceLabel || file.name, true);
        if (fromPaste) {
          setPasteNotice(true);
          if (pasteTimerRef.current) clearTimeout(pasteTimerRef.current);
          pasteTimerRef.current = setTimeout(() => setPasteNotice(false), 3000);
        }
      } catch {
        setFileError('Falha ao ler a imagem selecionada. Tente novamente.');
      }
    },
    [onImageSelected]
  );

  // Global paste handler (Ctrl+V) - Auto-analyzes chart immediately when no modal/camera/analysis blocks it
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (isAnalyzing || isModalOpen || isCameraOpen) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            soundNotifier.unlock();
            void processSelectedFile(file, 'Colado da Área de Transferência', true);
          }
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [processSelectedFile, isAnalyzing, isModalOpen, isCameraOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isAnalyzing) {
      e.target.value = '';
      return;
    }
    const file = e.target.files?.[0];
    if (file) {
      soundNotifier.unlock();
      void processSelectedFile(file);
    }
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isAnalyzing) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isAnalyzing) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      soundNotifier.unlock();
      void processSelectedFile(file);
    }
  };

  const agentSteps = [
    { label: 'Agente 1: Sofia Alencar (Price Action & Candlesticks)', icon: TrendingUp },
    { label: 'Agente 2: Dr. Lucas Vance (Indicadores & Médias)', icon: Activity },
    { label: 'Agente 3: Elena Rostova (Fluxo Delta & Volatilidade)', icon: BarChart3 },
    { label: 'Agente 4: Gabriel Chen (Séries Temporais ML)', icon: Cpu },
    { label: 'Agente 5: Marcus Sterling (Juiz de Risco & Guardrails)', icon: ShieldCheck },
  ];

  return (
    <div className="space-y-4 mb-6">
      {/* Entry Execution Timeframe Selector (M1 or M5) — Always chosen BEFORE running analysis */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-emerald-300" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-white">
                  Tempo Gráfico das Entradas
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Obrigatório: M1 ou M5
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Escolha antes de analisar em qual tempo gráfico serão feitas as entradas (velas de M1 ou M5).
              </p>
            </div>
          </div>

          <div
            role="radiogroup"
            aria-label="Tempo gráfico das entradas"
            className="grid grid-cols-2 gap-2 shrink-0 w-full sm:w-auto"
          >
            {(['M1', 'M5'] as EntryExecutionTimeframe[]).map((tf) => {
              const active = entryTimeframe === tf;
              return (
                <button
                  key={tf}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={isAnalyzing}
                  onClick={() => onChangeEntryTimeframe(tf)}
                  className={`px-3.5 py-2 rounded-lg border text-left transition-all cursor-pointer disabled:opacity-50 ${
                    active
                      ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-sm shadow-emerald-500/20'
                      : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-600 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-bold">Entradas em {tf}</span>
                    {active && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 block">
                    {tf === 'M1' ? 'Vela de 1 minuto' : 'Vela de 5 minutos'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mercado Aberto vs Mercado OTC Exclusive Agent Focus Selector */}
        <div className="mt-3.5 pt-3.5 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
                marketEnvironment === 'MERCADO_OTC'
                  ? 'bg-purple-500/15 border-purple-500/40'
                  : 'bg-cyan-500/15 border-cyan-500/40'
              }`}
            >
              {marketEnvironment === 'MERCADO_OTC' ? (
                <Cpu className="w-4 h-4 text-purple-300" />
              ) : (
                <Globe className="w-4 h-4 text-cyan-300" />
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-white">
                  Foco Exclusivo de Mercado
                </span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                    marketEnvironment === 'MERCADO_OTC'
                      ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                      : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                  }`}
                >
                  {marketEnvironment === 'MERCADO_OTC' ? 'Ativo: Mercado OTC' : 'Ativo: Mercado Aberto'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Os 5 agentes e guardrails focarão exclusivamente no mercado ativo neste botão.
              </p>
            </div>
          </div>

          <div
            role="radiogroup"
            aria-label="Foco de mercado da análise"
            className="grid grid-cols-2 gap-2 shrink-0 w-full sm:w-auto"
          >
            <button
              type="button"
              role="radio"
              aria-checked={marketEnvironment === 'MERCADO_ABERTO'}
              data-testid="market-focus-open"
              disabled={isAnalyzing}
              onClick={() => onChangeMarketEnvironment('MERCADO_ABERTO')}
              className={`px-3.5 py-2 rounded-lg border text-left transition-all cursor-pointer disabled:opacity-50 ${
                marketEnvironment === 'MERCADO_ABERTO'
                  ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-sm shadow-cyan-500/20'
                  : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-600 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono font-bold flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                  <span>Mercado Aberto</span>
                </span>
                {marketEnvironment === 'MERCADO_ABERTO' && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                )}
              </div>
              <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                Liquidez real · Notícias ±15m
              </span>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={marketEnvironment === 'MERCADO_OTC'}
              data-testid="market-focus-otc"
              disabled={isAnalyzing}
              onClick={() => onChangeMarketEnvironment('MERCADO_OTC')}
              className={`px-3.5 py-2 rounded-lg border text-left transition-all cursor-pointer disabled:opacity-50 ${
                marketEnvironment === 'MERCADO_OTC'
                  ? 'bg-purple-500/20 border-purple-400 text-white shadow-sm shadow-purple-500/20'
                  : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-600 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono font-bold flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                  <span>Mercado OTC</span>
                </span>
                {marketEnvironment === 'MERCADO_OTC' && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                )}
              </div>
              <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                Price Action puro · Sem notícias
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Single-Chart Instant Upload Box */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl transition-all duration-200 overflow-hidden ${
          isDragging
            ? 'border-emerald-500 bg-emerald-500/10'
            : imagePreview
            ? 'border-slate-700 bg-slate-900/60'
            : 'border-slate-800 hover:border-slate-700 bg-slate-950/60'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
        />
        <input
          type="file"
          ref={nativeCameraInputRef}
          onChange={handleFileChange}
          accept="image/*"
          capture="environment"
          className="hidden"
        />

        {imagePreview ? (
          <div className="p-4 sm:p-6">
            <div className="relative group max-h-[380px] overflow-hidden rounded-lg border border-slate-700 bg-black/50 flex items-center justify-center">
              <img
                src={imagePreview}
                alt="Gráfico selecionado para análise"
                referrerPolicy="no-referrer"
                className="max-h-[360px] w-auto object-contain mx-auto"
              />

              {/* High-tech scanning overlay during multiagent analysis */}
              {isAnalyzing && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center z-10">
                  <div className="w-12 h-12 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin mb-4 shadow-lg shadow-emerald-500/20" />
                  <div className="text-sm font-bold text-emerald-400 tracking-wide font-mono flex items-center gap-2">
                    <Sparkles className="w-4 h-4 animate-pulse text-emerald-300" />
                    <span>
                      PROCESSANDO 5 AGENTES ·{' '}
                      {marketEnvironment === 'MERCADO_OTC' ? 'FOCO MERCADO OTC' : 'FOCO MERCADO ABERTO'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 mt-1 max-w-md font-mono">
                    {agentSteps[analysisStep]?.label}
                  </p>

                  <div className="w-full max-w-md mt-4 bg-slate-800/90 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-emerald-400 h-full transition-all duration-300"
                      style={{ width: `${((analysisStep + 1) / agentSteps.length) * 100}%` }}
                    />
                  </div>
                  {soundEnabled && (
                    <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-300/80">
                      <Volume2 className="w-3 h-3 text-emerald-400" />
                      <span>Notificações sonoras discretas ativas</span>
                    </div>
                  )}
                  {onCancelAnalysis && (
                    <button
                      type="button"
                      data-testid="cancel-analysis-btn"
                      onClick={onCancelAnalysis}
                      className="mt-4 px-3.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/50 text-rose-200 text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Cancelar Análise</span>
                    </button>
                  )}
                </div>
              )}

              {!isAnalyzing && (
                <button
                  type="button"
                  onClick={() => {
                    setFileError(null);
                    onClearImage();
                  }}
                  aria-label="Remover imagem"
                  className="absolute top-3 right-3 p-1.5 bg-rose-500/80 hover:bg-rose-500 text-white rounded-lg shadow-md transition-colors z-20 cursor-pointer"
                  title="Remover imagem"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Agent Live Progress Badges when analyzing */}
            {isAnalyzing && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-5 gap-2">
                {agentSteps.map((step, idx) => {
                  const Icon = step.icon;
                  const isDone = analysisStep > idx;
                  const isCurrent = analysisStep === idx;
                  return (
                    <div
                      key={idx}
                      className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono flex items-center gap-1.5 transition-all ${
                        isDone
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                          : isCurrent
                          ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200 animate-pulse'
                          : 'border-slate-800 bg-slate-900/40 text-slate-500'
                      }`}
                    >
                      <Icon className="w-3 h-3 shrink-0" />
                      <span className="truncate">Agente {idx + 1}</span>
                      {isDone && <CheckCircle2 className="w-3 h-3 text-emerald-400 ml-auto shrink-0" />}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-mono text-emerald-300 font-semibold">
                  {isAnalyzing ? 'Processando análise automática...' : 'Análise concluída automaticamente'}
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-400 text-[11px]">
                  Consenso 80% + 3 Guardrails
                </span>
              </div>

              {/* Action Buttons: Camera + Nova Análise */}
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setIsCameraOpen(true)}
                  disabled={isAnalyzing}
                  className="flex-1 sm:flex-initial px-4 py-2 text-xs font-bold text-cyan-200 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 disabled:opacity-50 rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                  title="Abrir câmera para fotografar outro gráfico"
                >
                  <Camera className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Câmera</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isAnalyzing}
                  className="flex-1 sm:flex-initial px-4 py-2 text-xs font-bold text-slate-900 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-lg transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer"
                  title="Selecionar um novo gráfico para analisar automaticamente"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
                  <span>Nova Análise</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 sm:p-12 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400 shadow-inner mb-4">
              <Upload className="w-7 h-7" />
            </div>

            <h3 className="text-sm font-semibold text-white mb-1">
              Envie o print ou fotografe o gráfico (Análise Rápida)
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mb-5">
              Arraste e solte o arquivo aqui, pressione{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono text-[11px]">
                Ctrl+V
              </kbd>{' '}
              para colar diretamente do TradingView ou da corretora e iniciar a análise automática.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 text-xs font-semibold text-slate-900 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-all shadow-md shadow-emerald-500/20 flex items-center gap-2 cursor-pointer"
              >
                <ImageIcon className="w-3.5 h-3.5 text-slate-950" />
                <span>Selecionar Arquivo</span>
              </button>

              <button
                type="button"
                onClick={() => setIsCameraOpen(true)}
                className="px-4 py-2 text-xs font-semibold text-cyan-200 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 rounded-lg transition-all flex items-center gap-2 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5 text-cyan-300" />
                <span>Usar Câmera</span>
              </button>

              <div
                className={`px-3 py-1.5 rounded-lg text-xs font-mono border flex items-center gap-1.5 ${
                  marketEnvironment === 'MERCADO_OTC'
                    ? 'border-purple-500/30 bg-purple-500/10 text-purple-300'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                }`}
              >
                <Zap className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {entryTimeframe} ·{' '}
                  {marketEnvironment === 'MERCADO_OTC' ? 'Foco: Mercado OTC' : 'Foco: Mercado Aberto'}
                </span>
              </div>
            </div>

            {fileError && (
              <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded bg-rose-500/20 text-rose-300 text-xs border border-rose-500/40">
                <span>{fileError}</span>
              </div>
            )}

            {pasteNotice && (
              <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-500/20 text-emerald-300 text-xs border border-emerald-500/40">
                <Clipboard className="w-3.5 h-3.5" />
                <span>Imagem colada! Análise iniciada automaticamente...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Smartphone & Webcam Live Capture Modal */}
      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={(base64) => {
          soundNotifier.unlock();
          setFileError(null);
          onImageSelected(base64, 'Foto da Câmera', true);
        }}
        onFallbackNativeCamera={() => {
          nativeCameraInputRef.current?.click();
        }}
      />
    </div>
  );
});
