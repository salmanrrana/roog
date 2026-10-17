import { defineEffect } from "@/core/contracts";
import { createSmoother, dbToGain } from "./smooth";

/** tanh saturation normalized so a full-scale input still peaks at 1. */
function driveCurve(amount: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(2048);
  const norm = Math.tanh(amount);
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i * 2) / (curve.length - 1) - 1;
    curve[i] = Math.tanh(x * amount) / norm;
  }
  return curve;
}

/** Saturation/distortion with a post tone filter, wet/dry mix and output trim. */
export const drive = defineEffect({
  name: "Drive",
  params: {
    drive: { label: "Drive", min: 0, max: 36, default: 12, step: 0.5, unit: "dB" },
    tone: { label: "Tone", min: 500, max: 20000, default: 9000, curve: "exp", unit: "Hz" },
    mix: { label: "Mix", min: 0, max: 1, default: 1, unit: "%" },
    output: { label: "Out", min: -24, max: 6, default: 0, step: 0.1, unit: "dB" },
  },
  create(ctx) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const shaper = ctx.createWaveShaper();
    const tone = ctx.createBiquadFilter();
    const smooth = createSmoother(ctx);
    let amount = -1;

    shaper.oversample = "4x";
    tone.type = "lowpass";
    input.connect(dry).connect(output);
    input.connect(shaper).connect(tone).connect(wet).connect(output);

    return {
      input,
      output,
      update(params) {
        const next = dbToGain(params.drive);
        if (next !== amount) {
          amount = next;
          shaper.curve = driveCurve(amount);
        }
        // Small signals gain about amount/tanh(amount); give half of that (in dB) back.
        const makeup = Math.sqrt(Math.tanh(amount) / amount);
        smooth(tone.frequency, params.tone);
        smooth(dry.gain, 1 - params.mix);
        smooth(wet.gain, params.mix * makeup);
        smooth(output.gain, dbToGain(params.output));
      },
      dispose() {
        for (const node of [input, output, dry, wet, shaper, tone]) node.disconnect();
      },
    };
  },
});
