// Pure music helpers shared by sequencers, the quantizer and the keys module.
// Voltage standard across the studio: 1 volt per octave, 0 V = C4.

export const C4_HZ = 261.6256;

/** Scale name → semitone offsets within one octave. */
export const scales = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  "pent maj": [0, 2, 4, 7, 9],
  "pent min": [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  hirajoshi: [0, 2, 3, 7, 8],
  whole: [0, 2, 4, 6, 8, 10],
};

export const scaleNames = Object.keys(scales);
export const noteNames = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

/** Snap a semitone number to the nearest note in a scale rooted at `root` (0 = C). */
export function quantizeSemitone(semitone, scaleName = "chromatic", root = 0) {
  const scale = scales[scaleName] ?? scales.chromatic;
  const relative = semitone - root;
  const octave = Math.floor(relative / 12);
  const degree = relative - octave * 12;
  let best = scale[0];

  for (const candidate of [...scale, scale[0] + 12]) {
    if (Math.abs(candidate - degree) < Math.abs(best - degree)) {
      best = candidate;
    }
  }

  return root + octave * 12 + best;
}

/** Pick the `index`-th note of a scale (index can run past one octave or go negative). */
export function scaleDegree(index, scaleName = "chromatic", root = 0) {
  const scale = scales[scaleName] ?? scales.chromatic;
  const octave = Math.floor(index / scale.length);
  const degree = index - octave * scale.length;

  return root + octave * 12 + scale[degree];
}

export const semitoneToVolts = (semitone) => semitone / 12;
export const voltsToHz = (volts) => C4_HZ * 2 ** volts;
export const midiToVolts = (note) => (note - 60) / 12;

/**
 * Bjorklund-style euclidean rhythm: spread `hits` as evenly as possible over
 * `steps`, then rotate. Returns an array of 0/1.
 */
export function euclid(steps, hits, rotate = 0) {
  const length = Math.max(1, Math.round(steps));
  const count = Math.max(0, Math.min(length, Math.round(hits)));
  const pattern = Array.from({ length }, (_, index) =>
    (index * count) % length < count ? 1 : 0,
  );
  const shift = ((Math.round(rotate) % length) + length) % length;

  return pattern.map((_, index) => pattern[(index - shift + length) % length]);
}

/**
 * One clock of a Turing Machine shift register. The last bit wraps to the
 * front; with probability `change` it flips, which slowly mutates the loop.
 * `random` is injectable so tests stay deterministic.
 */
export function turingStep(bits, length, change, random = Math.random) {
  const size = Math.max(2, Math.min(bits.length, Math.round(length)));
  const looped = bits[size - 1];
  const next = random() < change ? 1 - looped : looped;

  return [next, ...bits.slice(0, bits.length - 1)];
}

/** Read the first eight bits of a register as a 0..1 value. */
export function registerValue(bits) {
  return (
    bits
      .slice(0, 8)
      .reduce((sum, bit, index) => sum + bit * 2 ** (7 - index), 0) / 255
  );
}
