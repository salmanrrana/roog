/**
 * Musical time. Everything inside a project is measured in ticks at a fixed PPQ
 * (FL's default of 96), 4/4 only in v1. Only the engine converts ticks to seconds.
 */
export const PPQ = 96;
/** One 16th note: one step in the channel rack. */
export const STEP_TICKS = PPQ / 4;
export const BEAT_TICKS = PPQ;
export const BAR_TICKS = PPQ * 4;

export const MIN_BPM = 20;
export const MAX_BPM = 300;

export function ticksToSeconds(ticks: number, bpm: number): number {
  return (ticks * 60) / (bpm * PPQ);
}

export function secondsToTicks(seconds: number, bpm: number): number {
  return (seconds * bpm * PPQ) / 60;
}

/** Round up to the next multiple of `grid` (0 stays 0). */
export function ceilTo(value: number, grid: number): number {
  return Math.ceil(value / grid - 1e-9) * grid;
}

/**
 * Swing as a time warp inside each 8th note. `swing` 0..1 moves the off-beat 16th
 * from 50% to 75% of the 8th; everything between scales with it, so note order is
 * kept and on-beat ticks never move.
 */
export function swingTick(tick: number, swing: number): number {
  if (swing <= 0) return tick;
  const pair = STEP_TICKS * 2;
  const base = Math.floor(tick / pair) * pair;
  const pos = tick - base;
  const offbeat = STEP_TICKS * (1 + swing / 2);
  const warped =
    pos < STEP_TICKS
      ? (pos / STEP_TICKS) * offbeat
      : offbeat + ((pos - STEP_TICKS) / STEP_TICKS) * (pair - offbeat);
  return base + warped;
}

/**
 * Maps between the audio clock and transport ticks. The engine keeps one anchor
 * per tempo; changing tempo re-anchors at the last scheduled tick so audio that is
 * already scheduled stays put.
 */
export interface TransportAnchor {
  /** Audio-context time (seconds) of `tick`. */
  readonly time: number;
  readonly tick: number;
  readonly bpm: number;
}

export function tickAtTime(anchor: TransportAnchor, time: number): number {
  return anchor.tick + secondsToTicks(time - anchor.time, anchor.bpm);
}

export function timeAtTick(anchor: TransportAnchor, tick: number): number {
  return anchor.time + ticksToSeconds(tick - anchor.tick, anchor.bpm);
}

export function reanchor(anchor: TransportAnchor, tick: number, bpm: number): TransportAnchor {
  return { time: timeAtTick(anchor, tick), tick, bpm };
}
