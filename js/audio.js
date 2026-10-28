// Короткие звуки, синтезированные в браузере (Web Audio): файлов нет, лицензий тоже.
// Звук запускается только после действия игрока, как требуют браузеры.

let ctx = null;
let enabled = true;

// Нотная лесенка для выбираемых букв: каждая следующая буква чуть выше.
const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 784.0];

function context() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

function tone(freq, { at = 0, dur = 0.14, type = 'sine', gain = 0.12, slideTo = null } = {}) {
  const c = context();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const start = c.currentTime + at;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(amp).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

export function setSoundEnabled(on) {
  enabled = on;
}

export const sfx = {
  // n — сколько букв выбрано сейчас
  tick(n) {
    if (!enabled) return;
    tone(SCALE[Math.min(Math.max(n, 1), SCALE.length) - 1], { dur: 0.09, type: 'triangle', gain: 0.1 });
  },
  good() {
    if (!enabled) return;
    [523.25, 659.25, 783.99].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.16, type: 'triangle', gain: 0.12 }));
  },
  bad() {
    if (!enabled) return;
    tone(220, { dur: 0.22, type: 'sawtooth', gain: 0.07, slideTo: 140 });
  },
  hint() {
    if (!enabled) return;
    tone(880, { dur: 0.1, type: 'sine', gain: 0.1 });
    tone(1174.66, { at: 0.09, dur: 0.18, type: 'sine', gain: 0.1 });
  },
  win() {
    if (!enabled) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, { at: i * 0.11, dur: 0.28, type: 'triangle', gain: 0.13 }));
  },
};
