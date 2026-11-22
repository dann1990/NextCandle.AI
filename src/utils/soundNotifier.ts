import { VoteType } from '../types/trading';

export const SOUND_SETTINGS_STORAGE_KEY = 'nextcandle_sound_settings_v1';

export type SoundCueType =
  | 'analysis_start'
  | 'agent_step'
  | 'success_buy'
  | 'success_sell'
  | 'success_wait'
  | 'toggle_on';

export interface SoundToneNote {
  frequencyHz: number;
  endFrequencyHz?: number;
  startOffsetSec: number;
  durationSec: number;
  peakGain: number;
  waveform: OscillatorType;
}

export interface SoundCueSpec {
  cue: SoundCueType;
  notes: SoundToneNote[];
}

export const MAX_DISCRETE_GAIN = 0.08;

export function parseStoredSoundEnabled(raw: string | null): boolean {
  if (raw === null || raw === '') return true;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === 'false' || trimmed === '0' || trimmed === 'off') return false;
  if (trimmed === 'true' || trimmed === '1' || trimmed === 'on') return true;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'boolean') return parsed;
    if (parsed && typeof parsed.enabled === 'boolean') return parsed.enabled;
  } catch {
    // Fallback safely to enabled
  }
  return true;
}

export function getSuccessCueForVerdict(verdict: VoteType): SoundCueType {
  switch (verdict) {
    case 'COMPRA':
      return 'success_buy';
    case 'VENDA':
      return 'success_sell';
    default:
      return 'success_wait';
  }
}

export function getCueEnvelopeSpec(cue: SoundCueType): SoundCueSpec {
  switch (cue) {
    case 'analysis_start':
      // Soft ambient radar ping when scan begins
      return {
        cue,
        notes: [
          {
            frequencyHz: 440,
            endFrequencyHz: 523.25,
            startOffsetSec: 0,
            durationSec: 0.11,
            peakGain: 0.032,
            waveform: 'sine',
          },
        ],
      };

    case 'agent_step':
      // Ultra-discreet step pulse during multi-agent evaluation
      return {
        cue,
        notes: [
          {
            frequencyHz: 587.33,
            startOffsetSec: 0,
            durationSec: 0.065,
            peakGain: 0.022,
            waveform: 'sine',
          },
        ],
      };

    case 'success_buy':
      // Gentle ascending major triad (C5 -> E5 -> G5) — discrete & warm
      return {
        cue,
        notes: [
          {
            frequencyHz: 523.25,
            startOffsetSec: 0,
            durationSec: 0.13,
            peakGain: 0.045,
            waveform: 'sine',
          },
          {
            frequencyHz: 659.25,
            startOffsetSec: 0.085,
            durationSec: 0.14,
            peakGain: 0.048,
            waveform: 'sine',
          },
          {
            frequencyHz: 783.99,
            startOffsetSec: 0.17,
            durationSec: 0.24,
            peakGain: 0.055,
            waveform: 'triangle',
          },
        ],
      };

    case 'success_sell':
      // Crisp resolved chime (G5 -> E5 -> C5 / D5-Bb4-G4 balanced tone)
      return {
        cue,
        notes: [
          {
            frequencyHz: 659.25,
            startOffsetSec: 0,
            durationSec: 0.13,
            peakGain: 0.045,
            waveform: 'sine',
          },
          {
            frequencyHz: 554.37,
            startOffsetSec: 0.085,
            durationSec: 0.14,
            peakGain: 0.048,
            waveform: 'sine',
          },
          {
            frequencyHz: 440.0,
            startOffsetSec: 0.17,
            durationSec: 0.24,
            peakGain: 0.052,
            waveform: 'triangle',
          },
        ],
      };

    case 'success_wait':
      // Calm neutral double-chime (F4 -> A4)
      return {
        cue,
        notes: [
          {
            frequencyHz: 440.0,
            startOffsetSec: 0,
            durationSec: 0.12,
            peakGain: 0.038,
            waveform: 'sine',
          },
          {
            frequencyHz: 523.25,
            startOffsetSec: 0.1,
            durationSec: 0.19,
            peakGain: 0.042,
            waveform: 'sine',
          },
        ],
      };

    case 'toggle_on':
      // Subtle confirmation click-chime when user re-enables sound
      return {
        cue,
        notes: [
          {
            frequencyHz: 587.33,
            startOffsetSec: 0,
            durationSec: 0.08,
            peakGain: 0.032,
            waveform: 'sine',
          },
          {
            frequencyHz: 783.99,
            startOffsetSec: 0.06,
            durationSec: 0.11,
            peakGain: 0.036,
            waveform: 'sine',
          },
        ],
      };
  }
}

export function getAgentStepToneSpec(stepIndex: number): SoundCueSpec {
  const clampedStep = Math.max(0, Math.min(4, Math.floor(stepIndex)));
  // Subtle pentatonic upward progression across agents 1..5
  const stepFrequencies = [440.0, 493.88, 554.37, 659.25, 739.99];
  return {
    cue: 'agent_step',
    notes: [
      {
        frequencyHz: stepFrequencies[clampedStep],
        startOffsetSec: 0,
        durationSec: 0.065,
        peakGain: 0.022,
        waveform: 'sine',
      },
    ],
  };
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: AudioContextState | string;
  readonly destination: AudioNode;
  resume(): Promise<void>;
  close?(): Promise<void>;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
}

export type AudioContextFactory = () => AudioContextLike | null;

function defaultAudioContextFactory(): AudioContextLike | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  try {
    return new AudioCtx();
  } catch {
    return null;
  }
}

export class SoundNotifier {
  private enabled: boolean;
  private ctx: AudioContextLike | null = null;
  private readonly createContext: AudioContextFactory;

  constructor(initialEnabled = true, contextFactory: AudioContextFactory = defaultAudioContextFactory) {
    this.enabled = initialEnabled;
    this.createContext = contextFactory;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private ensureContext(): AudioContextLike | null {
    if (!this.ctx) {
      this.ctx = this.createContext();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  unlock(): void {
    if (!this.enabled) return;
    this.ensureContext();
  }

  playSpec(spec: SoundCueSpec): boolean {
    if (!this.enabled) return false;
    const ctx = this.ensureContext();
    if (!ctx) return false;

    const baseTime = ctx.currentTime + 0.01;
    let scheduledCount = 0;

    for (const note of spec.notes) {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        const startTime = baseTime + Math.max(0, note.startOffsetSec);
        const duration = Math.max(0.03, note.durationSec);
        const endTime = startTime + duration;
        const safeGain = Math.min(MAX_DISCRETE_GAIN, Math.max(0.005, note.peakGain));
        const attackEnd = startTime + Math.min(0.016, duration * 0.25);

        osc.type = note.waveform;
        osc.frequency.setValueAtTime(note.frequencyHz, startTime);
        if (typeof note.endFrequencyHz === 'number' && note.endFrequencyHz > 0) {
          osc.frequency.exponentialRampToValueAtTime(note.endFrequencyHz, endTime);
        }

        // Smooth click-free envelope
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.linearRampToValueAtTime(safeGain, attackEnd);
        gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.onended = () => {
          try {
            osc.disconnect();
            gain.disconnect();
          } catch {
            // Ignore already-disconnected audio nodes
          }
        };

        osc.start(startTime);
        osc.stop(endTime + 0.015);
        scheduledCount++;
      } catch {
        // Ignore browser autoplay or audio node errors gracefully
      }
    }

    return scheduledCount > 0;
  }

  playAnalysisStart(): boolean {
    return this.playSpec(getCueEnvelopeSpec('analysis_start'));
  }

  playAgentStep(stepIndex: number): boolean {
    return this.playSpec(getAgentStepToneSpec(stepIndex));
  }

  playAnalysisSuccess(verdict: VoteType): boolean {
    return this.playSpec(getCueEnvelopeSpec(getSuccessCueForVerdict(verdict)));
  }

  playToggleConfirmation(): boolean {
    return this.playSpec(getCueEnvelopeSpec('toggle_on'));
  }

  close(): void {
    if (this.ctx && typeof this.ctx.close === 'function') {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
  }
}

export const soundNotifier = new SoundNotifier(true);
