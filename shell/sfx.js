// Tiny WebAudio synth — square-wave bleeps and noise bursts, no assets.
// The AudioContext is created/resumed only from a user gesture (autoplay
// policy); until then play() is a silent no-op. M toggles mute, persisted.

const PREF_KEY = 'late-shift-arcade:muted';

export function createSfx() {
  let ctx = null;
  let muted = false;
  try {
    muted = globalThis.localStorage?.getItem(PREF_KEY) === '1';
  } catch {
    // storage blocked: default to sound on
  }

  function unlock() {
    const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
  }

  function tone({ freq = 440, end = freq, dur = 0.08, type = 'square', vol = 0.1, delay = 0 }) {
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(end, 1), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise({ dur = 0.25, vol = 0.18, delay = 0 }) {
    const t0 = ctx.currentTime + delay;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(gain).connect(ctx.destination);
    src.start(t0);
  }

  const bank = {
    move: () => tone({ freq: 320, dur: 0.035, vol: 0.05 }),
    click: () => tone({ freq: 640, dur: 0.03, vol: 0.06 }),
    coin: () => {
      tone({ freq: 988, dur: 0.06, vol: 0.09 });
      tone({ freq: 1319, dur: 0.18, delay: 0.06, vol: 0.09 });
    },
    start: () => {
      tone({ freq: 392, dur: 0.07 });
      tone({ freq: 523, dur: 0.12, delay: 0.08 });
    },
    pause: () => tone({ freq: 200, end: 140, dur: 0.12, type: 'triangle' }),
    hit: () => tone({ freq: 420, end: 500, dur: 0.045 }),
    wall: () => tone({ freq: 210, end: 190, dur: 0.04, vol: 0.07 }),
    score: () => {
      tone({ freq: 660, dur: 0.07 });
      tone({ freq: 880, dur: 0.12, delay: 0.07 });
    },
    brick: () => tone({ freq: 520, end: 660, dur: 0.04, type: 'triangle', vol: 0.09 }),
    capsule: () => {
      tone({ freq: 523, dur: 0.05 });
      tone({ freq: 784, dur: 0.09, delay: 0.05 });
    },
    launch: () => tone({ freq: 700, end: 1250, dur: 0.14, type: 'sawtooth', vol: 0.05 }),
    boom: () => noise({ dur: 0.22, vol: 0.14 }),
    bigboom: () => {
      noise({ dur: 0.45, vol: 0.24 });
      tone({ freq: 90, end: 40, dur: 0.4, type: 'sine', vol: 0.2 });
    },
    lose: () => tone({ freq: 300, end: 80, dur: 0.45, type: 'sawtooth', vol: 0.1 }),
    death: () => tone({ freq: 392, end: 130, dur: 0.6, type: 'triangle', vol: 0.11 }),
    fanfare: () => {
      tone({ freq: 523, dur: 0.09 });
      tone({ freq: 659, dur: 0.09, delay: 0.09 });
      tone({ freq: 784, dur: 0.22, delay: 0.18 });
    },
  };

  return {
    unlock,
    play(name) {
      if (muted || !ctx || ctx.state !== 'running') return;
      bank[name]?.();
    },
    toggleMute() {
      muted = !muted;
      try {
        globalThis.localStorage?.setItem(PREF_KEY, muted ? '1' : '0');
      } catch {
        // fine — the preference just won't survive the visit
      }
      return muted;
    },
    get muted() {
      return muted;
    },
  };
}
