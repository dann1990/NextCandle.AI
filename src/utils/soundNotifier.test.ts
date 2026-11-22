import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AudioContextLike,
  getAgentStepToneSpec,
  getCueEnvelopeSpec,
  getSuccessCueForVerdict,
  MAX_DISCRETE_GAIN,
  parseStoredSoundEnabled,
  SoundCueType,
  SoundNotifier,
} from './soundNotifier';

test('parseStoredSoundEnabled handles defaults, strings, and JSON safely', () => {
  assert.equal(parseStoredSoundEnabled(null), true);
  assert.equal(parseStoredSoundEnabled(''), true);
  assert.equal(parseStoredSoundEnabled('true'), true);
  assert.equal(parseStoredSoundEnabled('false'), false);
  assert.equal(parseStoredSoundEnabled('0'), false);
  assert.equal(parseStoredSoundEnabled('{"enabled":false}'), false);
  assert.equal(parseStoredSoundEnabled('{"enabled":true}'), true);
  assert.equal(parseStoredSoundEnabled('{malformed'), true);
});

test('getSuccessCueForVerdict maps verdicts to distinct discrete sound cues', () => {
  assert.equal(getSuccessCueForVerdict('COMPRA'), 'success_buy');
  assert.equal(getSuccessCueForVerdict('VENDA'), 'success_sell');
  assert.equal(getSuccessCueForVerdict('AGUARDAR'), 'success_wait');
});

test('all cue specs enforce discrete gain bounds and smooth durations', () => {
  const cues: SoundCueType[] = [
    'analysis_start',
    'agent_step',
    'success_buy',
    'success_sell',
    'success_wait',
    'toggle_on',
  ];

  for (const cue of cues) {
    const spec = getCueEnvelopeSpec(cue);
    assert.ok(spec.notes.length > 0, `${cue} should have at least one note`);
    for (const note of spec.notes) {
      assert.ok(note.peakGain > 0 && note.peakGain <= MAX_DISCRETE_GAIN, `${cue} peakGain exceeds discrete limit`);
      assert.ok(note.durationSec >= 0.03 && note.durationSec <= 0.35, `${cue} duration out of discrete range`);
      assert.ok(note.frequencyHz >= 200 && note.frequencyHz <= 1200, `${cue} frequency out of pleasant range`);
    }
  }
});

test('getAgentStepToneSpec ascends gently across the 5 agent steps', () => {
  const freqs = [0, 1, 2, 3, 4].map((idx) => getAgentStepToneSpec(idx).notes[0].frequencyHz);
  for (let i = 1; i < freqs.length; i++) {
    assert.ok(freqs[i] > freqs[i - 1], 'Agent step frequencies should gently ascend');
  }
  // Clamping out-of-range indices
  assert.equal(getAgentStepToneSpec(-2).notes[0].frequencyHz, freqs[0]);
  assert.equal(getAgentStepToneSpec(99).notes[0].frequencyHz, freqs[4]);
});

test('SoundNotifier schedules oscillators when enabled and blocks playback when muted', () => {
  let oscillatorCount = 0;
  let resumeCalls = 0;

  const createMockCtx = (): AudioContextLike => ({
    currentTime: 10,
    state: 'suspended',
    destination: {} as AudioNode,
    resume: async () => {
      resumeCalls++;
    },
    createOscillator: () => {
      oscillatorCount++;
      return {
        type: 'sine',
        frequency: {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
        connect: () => {},
        start: () => {},
        stop: () => {},
      } as unknown as OscillatorNode;
    },
    createGain: () =>
      ({
        gain: {
          setValueAtTime: () => {},
          linearRampToValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        },
        connect: () => {},
      }) as unknown as GainNode,
  });

  const notifier = new SoundNotifier(true, createMockCtx);
  assert.equal(notifier.playAnalysisStart(), true);
  assert.equal(resumeCalls, 1);
  assert.equal(oscillatorCount, 1);

  assert.equal(notifier.playAgentStep(2), true);
  assert.equal(oscillatorCount, 2);

  assert.equal(notifier.playAnalysisSuccess('COMPRA'), true);
  assert.equal(oscillatorCount, 5); // 3 notes in success_buy

  notifier.setEnabled(false);
  assert.equal(notifier.isEnabled(), false);
  assert.equal(notifier.playAnalysisStart(), false);
  assert.equal(notifier.playAgentStep(3), false);
  assert.equal(notifier.playAnalysisSuccess('VENDA'), false);
  assert.equal(oscillatorCount, 5);
});

test('SoundNotifier fails silently when AudioContext is unavailable', () => {
  const unavailable = new SoundNotifier(true, () => null);
  assert.doesNotThrow(() => unavailable.unlock());
  assert.equal(unavailable.playAnalysisStart(), false);
  assert.equal(unavailable.playAnalysisSuccess('AGUARDAR'), false);
});
