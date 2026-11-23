import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, X, SwitchCamera, AlertTriangle, Aperture, Smartphone } from 'lucide-react';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (base64Image: string) => void;
  onFallbackNativeCamera: () => void;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  onFallbackNativeCamera,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraAttemptRef = useRef<number>(0);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    cameraAttemptRef.current += 1;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsReady(false);
  }, []);

  const startCamera = useCallback(
    async (targetFacing: 'environment' | 'user') => {
      stopStream();
      const attemptId = ++cameraAttemptRef.current;
      setCameraError(null);
      setIsInitializing(true);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (cameraAttemptRef.current === attemptId) {
          setIsInitializing(false);
          setCameraError(
            'Seu navegador não suporta acesso direto à câmera ao vivo neste contexto. Use a câmera nativa do aparelho abaixo.'
          );
        }
        return;
      }

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: targetFacing },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          });
        } catch {
          // Fallback to generic video constraint if ideal facingMode fails on desktop/webcam
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        // Critical: if modal closed or user switched camera while getUserMedia was pending, stop hardware tracks immediately
        if (cameraAttemptRef.current !== attemptId) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          if (cameraAttemptRef.current === attemptId) {
            setIsReady(true);
          }
        }
      } catch (err: any) {
        if (cameraAttemptRef.current !== attemptId) return;
        const name = err?.name || '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setCameraError(
            'Permissão de câmera negada. Libere o acesso à câmera nas configurações do navegador ou use a câmera nativa do celular.'
          );
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setCameraError(
            'Nenhuma câmera foi detectada neste dispositivo. Você pode usar a câmera nativa ou enviar uma imagem da galeria.'
          );
        } else {
          setCameraError(
            'Não foi possível iniciar a câmera ao vivo. Tente usar a câmera nativa do smartphone abaixo.'
          );
        }
      } finally {
        if (cameraAttemptRef.current === attemptId) {
          setIsInitializing(false);
        }
      }
    },
    [stopStream]
  );

  useEffect(() => {
    if (isOpen) {
      startCamera(facingMode);
    } else {
      stopStream();
      setCameraError(null);
    }
    return () => {
      stopStream();
    };
  }, [isOpen, facingMode, startCamera, stopStream]);

  const handleClose = useCallback(() => {
    stopStream();
    onClose();
  }, [stopStream, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const handleTakePhoto = () => {
    const video = videoRef.current;
    if (!video || !isReady) return;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    let dataUrl = '';
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, width, height);
      dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }

    stopStream();
    onCapture(dataUrl);
    onClose();
  };

  const handleToggleCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Câmera — Fotografar Gráfico"
    >
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center">
              <Camera className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Câmera — Fotografar Gráfico</h3>
              <p className="text-[11px] text-slate-400">
                Aponte para o gráfico na tela e capture para análise instantânea
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Fechar câmera"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder */}
        <div className="relative bg-black aspect-[4/3] sm:aspect-video w-full flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-contain ${cameraError ? 'hidden' : 'block'}`}
          />

          {/* Framing guide overlay when active */}
          {!cameraError && isReady && (
            <div className="absolute inset-4 sm:inset-6 border-2 border-dashed border-emerald-400/50 rounded-xl pointer-events-none flex items-end justify-center pb-2">
              <span className="text-[10px] font-mono bg-slate-950/80 text-emerald-300 px-2.5 py-0.5 rounded border border-emerald-500/30">
                Enquadre os candles e o eixo de tempo
              </span>
            </div>
          )}

          {/* Loading state */}
          {isInitializing && !cameraError && (
            <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center gap-3">
              <div className="w-9 h-9 rounded-full border-2 border-cyan-500/30 border-t-cyan-400 animate-spin" />
              <span className="text-xs font-mono text-cyan-300">Ativando câmera...</span>
            </div>
          )}

          {/* Error / Permission fallback state */}
          {cameraError && (
            <div className="p-6 text-center max-w-md flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">{cameraError}</p>
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  onFallbackNativeCamera();
                }}
                className="mt-1 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Smartphone className="w-4 h-4" />
                <span>Abrir Câmera Nativa do Smartphone</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="px-4 py-3.5 bg-slate-950/80 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleToggleCamera}
            disabled={isInitializing || Boolean(cameraError)}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-mono flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer"
          >
            <SwitchCamera className="w-4 h-4 text-cyan-400" />
            <span>{facingMode === 'environment' ? 'Traseira' : 'Frontal'}</span>
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => {
                handleClose();
                onFallbackNativeCamera();
              }}
              aria-label="Usar câmera nativa do smartphone"
              className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-mono border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Abrir aplicativo de câmera nativo do celular"
            >
              <Smartphone className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Câmera Nativa</span>
            </button>

            <button
              type="button"
              onClick={handleTakePhoto}
              disabled={!isReady || Boolean(cameraError)}
              className="px-4 py-2 rounded-lg bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 text-slate-950 text-xs font-bold flex items-center gap-2 shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
            >
              <Aperture className="w-4 h-4" />
              <span>Capturar e Analisar</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
