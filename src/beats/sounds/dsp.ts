/**
 * Small building blocks for the factory drum recipes. Every helper takes the
 * OfflineAudioContext a recipe renders into, so nothing here touches audio at import.
 */

/**
 * The end of every recipe: a gain stage into a soft limiter into the destination.
 * Signals pass untouched below 0.7 and bend smoothly toward 0.99 above it, so a
 * render can be hot without ever peaking past 1.
 */
export function output(ctx: OfflineAudioContext, gain = 1): GainNode {
  const level = ctx.createGain();
  const limiter = ctx.createWaveShaper();
  level.gain.value = gain;
  limiter.curve = curve((x) => {
    const size = Math.abs(x);
    return size < 0.7 ? x : Math.sign(x) * (0.7 + 0.29 * Math.tanh((size - 0.7) / 0.29));
  });
  level.connect(limiter).connect(ctx.destination);
  return level;
}

/** A WaveShaper table for `shape` over -1..1. */
export function curve(shape: (x: number) => number, size = 2048): Float32Array<ArrayBuffer> {
  const table = new Float32Array(size);
  for (let i = 0; i < size; i += 1) table[i] = shape((i * 2) / (size - 1) - 1);
  return table;
}

/** A tanh saturator: `drive` > 1 squashes peaks and adds harmonics (punch, 808 growl). */
export function saturator(ctx: OfflineAudioContext, drive: number): WaveShaperNode {
  const node = ctx.createWaveShaper();
  node.curve = curve((x) => Math.tanh(x * drive) / Math.tanh(drive));
  node.oversample = "4x";
  return node;
}

/** An oscillator started at 0 and stopped at `stop`. */
export function osc(
  ctx: OfflineAudioContext,
  type: OscillatorType,
  hz: number,
  stop: number,
): OscillatorNode {
  const node = ctx.createOscillator();
  node.type = type;
  node.frequency.value = hz;
  node.start(0);
  node.stop(stop);
  return node;
}

/** White noise started at 0 and lasting `seconds`. */
export function noise(ctx: OfflineAudioContext, seconds: number): AudioBufferSourceNode {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.start(0);
  return source;
}

export function biquad(
  ctx: OfflineAudioContext,
  type: BiquadFilterType,
  hz: number,
  q = 0.707,
): BiquadFilterNode {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = hz;
  node.Q.value = q;
  return node;
}

/**
 * A gain node with a percussive envelope: rise to `peak` over `attack`, hold for
 * `hold`, then fall exponentially (`decay` is roughly the time to -60 dB).
 */
export function vca(
  ctx: OfflineAudioContext,
  peak: number,
  decay: number,
  attack = 0.0005,
  hold = 0,
): GainNode {
  const node = ctx.createGain();
  node.gain.setValueAtTime(0, 0);
  node.gain.linearRampToValueAtTime(peak, attack);
  node.gain.setTargetAtTime(0, attack + hold, decay / 6.9);
  return node;
}

/** Exponential pitch sweep on an oscillator: `from` Hz to `to` Hz over `seconds`. */
export function sweep(node: OscillatorNode, from: number, to: number, seconds: number): void {
  node.frequency.setValueAtTime(from, 0);
  node.frequency.exponentialRampToValueAtTime(to, seconds);
}

/** The six square-wave partials of the TR-808 cymbal/hat circuit. */
export const METAL_HZ = [205.3, 304.4, 369.6, 522.7, 540, 800] as const;

/** Sum the 808 metal partials (times `ratio`) into one gain node. */
export function metal(ctx: OfflineAudioContext, seconds: number, ratio = 1): GainNode {
  const sum = ctx.createGain();
  sum.gain.value = 1 / METAL_HZ.length;
  for (const hz of METAL_HZ) osc(ctx, "square", hz * ratio, seconds).connect(sum);
  return sum;
}
