import type { FactorySound } from "@/core/contracts";
import { biquad, metal, noise, osc, output, saturator, sweep, vca } from "./dsp";

/**
 * Built-in sounds, synthesized into buffers on first use (the engine renders each
 * with an OfflineAudioContext). Ids are stored in projects: never rename one.
 * Recipes grew out of the Studio KIT (src/studio/modules/voices.js). Pitched
 * sounds (808, tom) sit on a C so the piano roll plays them in tune.
 */

const C2 = 65.41;

function kick(ctx: OfflineAudioContext) {
  const out = output(ctx, 0.92);
  const drive = saturator(ctx, 2.4);
  drive.connect(out);

  // Body: a fast dive from a knock to a deep sine, held briefly so it hits hard.
  const body = osc(ctx, "sine", 48, 0.8);
  body.frequency.setValueAtTime(340, 0);
  body.frequency.exponentialRampToValueAtTime(120, 0.016);
  body.frequency.exponentialRampToValueAtTime(54, 0.1);
  body.frequency.exponentialRampToValueAtTime(46, 0.5);
  body.connect(vca(ctx, 1, 0.5, 0.001, 0.035)).connect(drive);

  // Beater click: a short band of noise on top, outside the saturator so it stays crisp.
  noise(ctx, 0.03)
    .connect(biquad(ctx, "bandpass", 3800, 0.8))
    .connect(vca(ctx, 0.55, 0.014))
    .connect(out);
}

function bass808(ctx: OfflineAudioContext) {
  const out = output(ctx, 0.95);
  const tone = biquad(ctx, "lowpass", 1400);
  const drive = saturator(ctx, 1.9);
  drive.connect(tone).connect(out);

  const body = osc(ctx, "sine", C2, 2.5);
  body.frequency.setValueAtTime(C2 * 3, 0);
  body.frequency.exponentialRampToValueAtTime(C2 * 1.12, 0.035);
  body.frequency.exponentialRampToValueAtTime(C2, 0.3);
  body.connect(vca(ctx, 0.95, 2.2, 0.002, 0.06)).connect(drive);

  // Attack knock so short 808 notes still cut through on small speakers.
  const knock = osc(ctx, "triangle", C2 * 8, 0.05);
  sweep(knock, C2 * 16, C2 * 4, 0.02);
  knock.connect(vca(ctx, 0.35, 0.025)).connect(out);
}

function snare(ctx: OfflineAudioContext) {
  const out = output(ctx, 0.85);

  // Two drum-head modes with a quick pitch drop.
  const low = osc(ctx, "triangle", 185, 0.4);
  sweep(low, 320, 185, 0.035);
  low.connect(vca(ctx, 0.6, 0.17)).connect(out);
  const high = osc(ctx, "sine", 330, 0.3);
  sweep(high, 470, 330, 0.03);
  high.connect(vca(ctx, 0.3, 0.09)).connect(out);

  // Wires: bright noise with a presence bump, plus a short top-end snap.
  const presence = biquad(ctx, "peaking", 5200, 0.9);
  presence.gain.value = 6;
  noise(ctx, 0.45)
    .connect(biquad(ctx, "highpass", 1600))
    .connect(presence)
    .connect(vca(ctx, 0.75, 0.24, 0.001))
    .connect(out);
  noise(ctx, 0.05)
    .connect(biquad(ctx, "highpass", 7000))
    .connect(vca(ctx, 0.45, 0.03))
    .connect(out);
}

function clap(ctx: OfflineAudioContext) {
  const out = output(ctx, 1);
  const band = biquad(ctx, "bandpass", 1250, 1.5);
  const amp = ctx.createGain();

  // Four quick hand slaps, then the body of the clap.
  amp.gain.setValueAtTime(0, 0);
  for (const at of [0, 0.011, 0.022, 0.033]) {
    amp.gain.setValueAtTime(2.6, at);
    amp.gain.setTargetAtTime(0.25, at + 0.0005, 0.0035);
  }
  amp.gain.setValueAtTime(2.4, 0.034);
  amp.gain.setTargetAtTime(0, 0.035, 0.05);
  noise(ctx, 0.5)
    .connect(biquad(ctx, "highpass", 650))
    .connect(band)
    .connect(amp)
    .connect(out);

  // A little room behind it.
  noise(ctx, 0.5)
    .connect(biquad(ctx, "bandpass", 1700, 0.8))
    .connect(vca(ctx, 0.22, 0.38, 0.02))
    .connect(out);
}

/** Closed and open hats share the 808 metal; only the decay differs. */
function hat(decay: number) {
  return (ctx: OfflineAudioContext) => {
    const seconds = decay + 0.1;
    const out = output(ctx, 2.4);
    const shimmer = biquad(ctx, "highpass", 7200);
    shimmer.connect(vca(ctx, 1, decay, 0.0005)).connect(out);
    metal(ctx, seconds)
      .connect(biquad(ctx, "bandpass", 10000, 0.9))
      .connect(shimmer);
    // A dusting of noise keeps the metal from sounding like a ring mod.
    noise(ctx, seconds)
      .connect(biquad(ctx, "highpass", 9000))
      .connect(vca(ctx, 0.3, decay * 0.7))
      .connect(out);
  };
}

function rim(ctx: OfflineAudioContext) {
  const out = output(ctx, 0.8);
  const thin = biquad(ctx, "highpass", 320);
  thin.connect(out);
  osc(ctx, "triangle", 1700, 0.15)
    .connect(vca(ctx, 0.6, 0.035))
    .connect(thin);
  osc(ctx, "sine", 455, 0.15)
    .connect(vca(ctx, 0.55, 0.06))
    .connect(thin);
  noise(ctx, 0.02)
    .connect(biquad(ctx, "highpass", 3000))
    .connect(vca(ctx, 0.5, 0.008))
    .connect(thin);
}

function tom(ctx: OfflineAudioContext) {
  const out = output(ctx, 0.9);
  const drive = saturator(ctx, 1.6);
  drive.connect(out);
  // Lands on C3 so tom fills on the piano roll stay in key.
  const body = osc(ctx, "sine", C2 * 2, 0.6);
  sweep(body, C2 * 3.4, C2 * 2, 0.22);
  body.connect(vca(ctx, 1, 0.48, 0.001, 0.01)).connect(drive);
  noise(ctx, 0.1)
    .connect(biquad(ctx, "bandpass", 900, 1.2))
    .connect(vca(ctx, 0.25, 0.07))
    .connect(out);
}

function zap(ctx: OfflineAudioContext) {
  const out = output(ctx, 1);
  const carrier = osc(ctx, "sine", 400, 0.4);
  sweep(carrier, 2400, 70, 0.18);
  carrier.connect(vca(ctx, 0.75, 0.3)).connect(out);
  // FM: the modulator's depth dies away as the pitch falls, like a laser.
  const modulator = osc(ctx, "sine", 900, 0.4);
  sweep(modulator, 1800, 120, 0.2);
  modulator.connect(vca(ctx, 1400, 0.22)).connect(carrier.frequency);
}

function cowbell(ctx: OfflineAudioContext) {
  const out = output(ctx, 1);
  const tone = biquad(ctx, "bandpass", 1100, 0.9);
  const sum = ctx.createGain();
  sum.gain.value = 0.5;
  osc(ctx, "square", 540, 0.6).connect(sum);
  osc(ctx, "square", 800, 0.6).connect(sum);
  sum.connect(biquad(ctx, "highpass", 450)).connect(tone);
  // 808 two-stage envelope: a sharp strike over a short ring.
  tone.connect(vca(ctx, 0.9, 0.06)).connect(out);
  tone.connect(vca(ctx, 0.5, 0.45)).connect(out);
}

function shaker(ctx: OfflineAudioContext) {
  const out = output(ctx, 1);
  noise(ctx, 0.25)
    .connect(biquad(ctx, "highpass", 5500))
    .connect(biquad(ctx, "peaking", 9000, 1))
    .connect(vca(ctx, 0.55, 0.12, 0.018))
    .connect(out);
}

function crash(ctx: OfflineAudioContext) {
  const out = output(ctx, 1.4);
  const air = biquad(ctx, "highpass", 4800);
  air.connect(vca(ctx, 1, 2.1, 0.001)).connect(out);
  // Two detuned metal banks make a wash instead of a pitch.
  metal(ctx, 2.5).connect(air);
  metal(ctx, 2.5, 1.47).connect(air);
  noise(ctx, 2.5)
    .connect(biquad(ctx, "highpass", 7000))
    .connect(vca(ctx, 0.35, 1.6))
    .connect(out);
}

export const factorySounds: readonly FactorySound[] = [
  { id: "factory:kick", name: "Kick", group: "drums", seconds: 0.7, render: kick },
  { id: "factory:snare", name: "Snare", group: "drums", seconds: 0.45, render: snare },
  { id: "factory:clap", name: "Clap", group: "drums", seconds: 0.5, render: clap },
  { id: "factory:hat", name: "Hat", group: "drums", seconds: 0.18, render: hat(0.075) },
  { id: "factory:openhat", name: "Open Hat", group: "drums", seconds: 0.8, render: hat(0.6) },
  { id: "factory:rim", name: "Rim", group: "drums", seconds: 0.15, render: rim },
  { id: "factory:tom", name: "Tom", group: "drums", seconds: 0.6, render: tom },
  { id: "factory:cowbell", name: "Cowbell", group: "drums", seconds: 0.6, render: cowbell },
  { id: "factory:shaker", name: "Shaker", group: "drums", seconds: 0.25, render: shaker },
  { id: "factory:crash", name: "Crash", group: "drums", seconds: 2.5, render: crash },
  { id: "factory:808", name: "808", group: "bass", seconds: 2.5, render: bass808 },
  { id: "factory:zap", name: "Zap", group: "fx", seconds: 0.4, render: zap },
];

/** Look up a factory sound by id; undefined for ids this build doesn't ship. */
export function getFactorySound(id: string): FactorySound | undefined {
  return factorySounds.find((sound) => sound.id === id);
}
