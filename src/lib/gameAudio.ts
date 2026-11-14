// Synthesized lightweight Web Audio API sound effects (no external audio dependencies)

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) {
    audioCtx = new Ctor();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType = 'sine',
  gainVal = 0.08,
  delay = 0
) {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + delay;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(gainVal, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  } catch {
    // Ignore audio context errors in restricted environments
  }
}

export function playGameSound(
  kind: 'correct' | 'wrong' | 'click' | 'win',
  enabled: boolean
) {
  if (!enabled) return;
  if (kind === 'correct') {
    tone(523.25, 0.12, 'triangle', 0.09, 0);
    tone(659.25, 0.16, 'triangle', 0.09, 0.08);
  } else if (kind === 'wrong') {
    tone(220, 0.16, 'sawtooth', 0.05, 0);
    tone(174.61, 0.22, 'sawtooth', 0.05, 0.1);
  } else if (kind === 'click') {
    tone(440, 0.05, 'sine', 0.04, 0);
  } else if (kind === 'win') {
    tone(523.25, 0.14, 'triangle', 0.09, 0);
    tone(659.25, 0.14, 'triangle', 0.09, 0.1);
    tone(783.99, 0.16, 'triangle', 0.09, 0.2);
    tone(1046.5, 0.32, 'triangle', 0.1, 0.32);
  }
}
