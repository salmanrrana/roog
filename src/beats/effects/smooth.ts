/**
 * Param smoothing for effects. The first value a param receives (right after
 * create) lands instantly; later changes glide so knob moves never click or zipper.
 *
 *   const smooth = createSmoother(ctx);
 *   smooth(node.frequency, params.cutoff);
 */
export function createSmoother(ctx: BaseAudioContext, seconds = 0.015) {
  const started = new WeakSet<AudioParam>();
  return (param: AudioParam, value: number): void => {
    if (started.has(param)) {
      param.setTargetAtTime(value, ctx.currentTime, seconds);
    } else {
      started.add(param);
      param.setValueAtTime(value, ctx.currentTime);
    }
  };
}

/** Decibels to linear gain. */
export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}
