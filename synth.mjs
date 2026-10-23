// Synthesises the music bed and the sound effects, sample by sample, so the reel carries no
// third-party audio. Everything is seeded: the same timeline always gives the same WAV.
import { writeFileSync } from 'node:fs';

const SR = 48000;
const TAU = Math.PI * 2;
const BAR = 2.4; // 100 bpm, 4/4
const BEAT = BAR / 4;
const CHORDS = [
  [220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63], // F
  [261.63, 329.63, 392.0], // C
  [196.0, 246.94, 293.66], // G
];
const ROOTS = [110.0, 87.31, 130.81, 98.0];

function noiseSource(seed) {
  let s = seed;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return (((r ^ (r >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

const stereo = (n) => [new Float32Array(n), new Float32Array(n)];
const lpCoef = (fc) => 1 - Math.exp((-TAU * fc) / SR);

// Adds a voice rendered by fn(tl) -> sample into buf from t0 for dur seconds, panned.
function addVoice(buf, t0, dur, pan, fn) {
  const i0 = Math.max(0, Math.round(t0 * SR));
  const i1 = Math.min(buf[0].length, Math.round((t0 + dur) * SR));
  const gl = Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = i0; i < i1; i++) {
    const v = fn((i - Math.round(t0 * SR)) / SR);
    buf[0][i] += v * gl;
    buf[1][i] += v * gr;
  }
}

function pingPong(buf, delay, feedback, wet) {
  const d = Math.round(delay * SR);
  const [l, r] = buf;
  for (let i = d; i < l.length; i++) {
    l[i] += r[i - d] * feedback * wet;
    r[i] += l[i - d] * feedback * wet;
  }
}

function music(total, sec) {
  const n = Math.ceil(total * SR);
  const pad = stereo(n);
  const arp = stereo(n);
  const drums = stereo(n);
  const noise = noiseSource(11);
  const drop = sec.reveal;
  const end = sec.beliefs ?? sec.cta; // the manifesto's second page is read over the pad alone
  const origin = drop - Math.ceil(drop / BAR) * BAR; // a bar starts exactly on the drop

  for (let b = 0; origin + b * BAR < total; b++) {
    const t0 = origin + b * BAR;
    const chord = CHORDS[((b % 4) + 4) % 4];
    const root = ROOTS[((b % 4) + 4) % 4];
    const last = t0 + BAR >= total;
    const len = last ? total - t0 : BAR + 1.4;
    // Pad: two detuned soft-saw voices per note, wide.
    chord.forEach((f, k) => {
      [-1, 1].forEach((side) => {
        const fd = f * (1 + side * 0.0035);
        addVoice(pad, t0, len, side * 0.7, (tl) => {
          const env = Math.min(1, tl / 0.6) * (tl > BAR && !last ? Math.max(0, 1 - (tl - BAR) / 1.4) : 1);
          const p = TAU * fd * tl + k;
          return 0.028 * env * (Math.sin(p) + 0.28 * Math.sin(2 * p) + 0.12 * Math.sin(3 * p));
        });
      });
    });
    for (let q = 0; q < 4; q++) {
      const bt = t0 + q * BEAT;
      if (bt >= total) break;
      // The drums rest while the handover flies, and come back for the last stretch.
      const rest = sec.continuity !== undefined && bt >= sec.continuity && bt < sec.local;
      const groove = bt >= drop - 1e-6 && bt < end - 1e-6 && !rest;
      if (groove) {
        // Sub bass on every beat.
        addVoice(drums, bt, 0.55, 0, (tl) => 0.16 * Math.min(1, tl / 0.008) * Math.exp(-tl * 3.2)
          * Math.sin(TAU * root * tl));
        // Kick on 1 and 3.
        if (q % 2 === 0) {
          let ph = 0;
          addVoice(drums, bt, 0.42, 0, (tl) => {
            ph += (TAU * (46 + 110 * Math.exp(-tl * 28))) / SR;
            return 0.5 * Math.exp(-tl * 7) * Math.sin(ph);
          });
        }
        // Clap on 2 and 4, after the terminal enters.
        if (q % 2 === 1 && bt >= sec.terminal) {
          let lp = 0;
          addVoice(drums, bt, 0.2, 0.1, (tl) => {
            lp += lpCoef(2600) * (noise() - lp);
            return 0.09 * Math.exp(-tl * 22) * lp * 3;
          });
        }
      }
      // Arp in eighths from the drop to the end.
      if (bt >= drop - 1e-6) {
        const order = [0, 1, 2, 1, 2, 0, 1, 2];
        for (let e = 0; e < 2; e++) {
          const nt = bt + e * (BEAT / 2);
          if (nt >= total - 0.3) continue;
          const f = chord[order[(q * 2 + e) % 8]] * 2;
          const fade = nt > total - 3 ? (total - nt) / 3 : 1;
          addVoice(arp, nt, 0.5, e ? 0.45 : -0.45, (tl) => {
            const p = TAU * f * tl;
            return 0.045 * fade * Math.exp(-tl * 8) * (Math.sin(p) + 0.18 * Math.sin(3 * p));
          });
        }
        // Hats on the off-beat once the groove is in.
        if (bt >= sec.terminal && bt < end) {
          let prev = 0;
          addVoice(drums, bt + BEAT / 2, 0.06, 0.3, (tl) => {
            const x = noise();
            const hp = x - prev;
            prev = x;
            return 0.05 * Math.exp(-tl * 70) * hp;
          });
        }
      }
    }
  }

  // The pad opens up at the drop and breathes with the kick.
  [0, 1].forEach((c) => {
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const open = t < drop ? 500 + 300 * (t / drop) : 2200;
      y += lpCoef(open) * (pad[c][i] - y);
      let pump = 1;
      if (t >= drop && t < end) {
        const sinceKick = (t - origin) % (BEAT * 2);
        pump = 1 - 0.45 * Math.exp(-sinceKick * 9);
      }
      pad[c][i] = y * pump;
    }
  });
  pingPong(arp, BEAT * 0.75, 0.42, 1);

  const out = stereo(n);
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      // a quick start and a long tail, so the loop's seam is a breath, not a cut
      const fade = Math.min(1, t / 0.25) * (0.35 + 0.65 * Math.min(1, (total - t) / 2.5));
      out[c][i] = (pad[c][i] * 1.4 + arp[c][i] + drums[c][i]) * fade;
    }
  }
  return out;
}

function sfx(total, events) {
  const n = Math.ceil(total * SR);
  const buf = stereo(n);
  const noise = noiseSource(23);
  const jitter = noiseSource(5);
  const tone = (t, f, dur, amp, decay, pan = 0) => addVoice(buf, t, dur, pan,
    (tl) => amp * Math.min(1, tl / 0.004) * Math.exp(-tl * decay) * Math.sin(TAU * f * tl));

  const kinds = {
    whoosh(t) {
      let y = 0;
      addVoice(buf, t - 0.4, 0.8, 0, (tl) => {
        const u = tl / 0.8;
        y += lpCoef(300 + 5000 * Math.sin(Math.PI * u) ** 2) * (noise() - y);
        return 0.32 * Math.sin(Math.PI * u) ** 2 * y;
      });
    },
    riser(t) {
      let y = 0;
      addVoice(buf, t - 1.8, 1.8, 0, (tl) => {
        const u = tl / 1.8;
        y += lpCoef(200 + 7000 * u * u) * (noise() - y);
        return 0.22 * u * u * y + 0.035 * u * Math.sin(TAU * (180 + 520 * u * u) * tl);
      });
    },
    soft(t) {
      // a low, warm swell: one note, no attack
      [110, 220, 329.63].forEach((f, k) => addVoice(buf, t, 2.4, (k - 1) * 0.3, (tl) => {
        const env = Math.min(1, tl / 0.25) * Math.exp(-tl * 1.6);
        return [0.16, 0.08, 0.04][k] * env * Math.sin(TAU * f * tl);
      }));
    },
    'riser-short'(t) {
      let y = 0;
      addVoice(buf, t - 0.9, 0.9, 0, (tl) => {
        const u = tl / 0.9;
        y += lpCoef(300 + 6000 * u * u) * (noise() - y);
        return 0.16 * u * u * y;
      });
    },
    impact(t) {
      let ph = 0;
      addVoice(buf, t, 0.7, 0, (tl) => {
        ph += (TAU * (38 + 90 * Math.exp(-tl * 18))) / SR;
        return 0.75 * Math.exp(-tl * 4.5) * Math.sin(ph);
      });
      let y = 0;
      addVoice(buf, t, 2.2, 0, (tl) => {
        y += lpCoef(6000 * Math.exp(-tl * 1.2) + 400) * (noise() - y);
        return 0.16 * Math.exp(-tl * 2.2) * y;
      });
      [440, 659.25, 880].forEach((f, k) => tone(t + k * 0.04, f, 2.2, 0.05, 1.6, k - 1));
    },
    pop(t) {
      const f = 520 + jitter() * 60;
      addVoice(buf, t, 0.12, jitter() * 0.4, (tl) => 0.16 * Math.exp(-tl * 38)
        * Math.sin(TAU * (f + 900 * tl) * tl));
    },
    tick(t) { tone(t, 1760, 0.09, 0.07, 45, 0.2); },
    key(t) {
      let prev = 0;
      const amp = 0.07 + jitter() * 0.02;
      addVoice(buf, t, 0.03, jitter() * 0.3, (tl) => {
        const x = noise();
        const hp = x - prev;
        prev = x;
        return amp * Math.exp(-tl * 160) * hp + 0.04 * Math.exp(-tl * 300) * Math.sin(TAU * 2400 * tl);
      });
    },
    ding(t) {
      tone(t, 1318.5, 0.7, 0.09, 7, 0.15);
      tone(t, 2637, 0.4, 0.03, 12, 0.15);
    },
    buzz(t) {
      addVoice(buf, t, 0.32, 0, (tl) => 0.1 * Math.exp(-tl * 6)
        * Math.tanh(4 * Math.sin(TAU * 98 * tl)) * (1 + 0.3 * Math.sin(TAU * 31 * tl)));
    },
    slam(t) {
      const at = t + 0.18; // the stamp lands after its scale-down
      let ph = 0;
      addVoice(buf, at, 0.6, 0, (tl) => {
        ph += (TAU * (40 + 120 * Math.exp(-tl * 25))) / SR;
        return 0.85 * Math.exp(-tl * 6) * Math.sin(ph);
      });
      let y = 0;
      addVoice(buf, at, 0.35, 0, (tl) => {
        y += lpCoef(2500) * (noise() - y);
        return 0.35 * Math.exp(-tl * 14) * y;
      });
    },
    thump(t) {
      let ph = 0;
      addVoice(buf, t, 0.5, 0, (tl) => {
        ph += (TAU * (50 + 80 * Math.exp(-tl * 20))) / SR;
        return 0.55 * Math.exp(-tl * 6) * Math.sin(ph);
      });
    },
    alert(t) {
      tone(t, 880, 0.18, 0.08, 10, -0.2);
      tone(t + 0.16, 660, 0.3, 0.08, 8, 0.2);
    },
    chime(t) {
      [880, 1108.73, 1318.5, 1760].forEach((f, k) => tone(t + k * 0.07, f, 1.6, 0.06, 3.2, k * 0.25 - 0.4));
    },
  };
  events.forEach((ev) => (kinds[ev.type] || (() => {}))(ev.t));
  pingPong(buf, 0.19, 0.25, 0.8);
  return buf;
}

export function writeWav(path, [l, r]) {
  const n = l.length;
  const data = Buffer.alloc(44 + n * 4);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + n * 4, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(2, 22);
  data.writeUInt32LE(SR, 24);
  data.writeUInt32LE(SR * 4, 28);
  data.writeUInt16LE(4, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, l[i])) * 32767), 44 + i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, r[i])) * 32767), 46 + i * 4);
  }
  writeFileSync(path, data);
}

export function synthesize({ total, sections, events }) {
  return { music: music(total, sections), sfx: sfx(total, events) };
}
