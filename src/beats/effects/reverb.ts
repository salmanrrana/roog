import { defineEffect } from "@/core/contracts";
import { createSmoother } from "./smooth";

/**
 * A stereo impulse response: decaying noise, independent per side for width,
 * reaching -60 dB at `seconds`.
 */
function impulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.ceil(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let side = 0; side < 2; side += 1) {
    const data = buffer.getChannelData(side);
    for (let i = 0; i < length; i += 1)
      data[i] = (Math.random() * 2 - 1) * Math.exp((-6.9 * i) / length);
  }
  return buffer;
}

/** Convolution reverb on a generated impulse, with pre-delay and damping. */
export const reverb = defineEffect({
  name: "Reverb",
  params: {
    // Stepped so a knob drag rebuilds the impulse only every 0.1 s of size.
    size: { label: "Size", min: 0.3, max: 8, default: 1.8, step: 0.1, unit: "s" },
    predelay: { label: "Pre-delay", min: 0, max: 0.2, default: 0.01, step: 0.001, unit: "s" },
    damp: { label: "Damping", min: 800, max: 20000, default: 7000, curve: "exp", unit: "Hz" },
    mix: { label: "Mix", min: 0, max: 1, default: 0.25, unit: "%" },
  },
  create(ctx) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const pre = ctx.createDelay(0.25);
    const convolver = ctx.createConvolver();
    const damp = ctx.createBiquadFilter();
    const smooth = createSmoother(ctx);
    let size = 0;

    damp.type = "lowpass";
    input.connect(dry).connect(output);
    input.connect(pre).connect(convolver).connect(damp).connect(wet).connect(output);

    return {
      input,
      output,
      update(params) {
        if (params.size !== size) {
          size = params.size;
          convolver.buffer = impulse(ctx, size);
        }
        smooth(pre.delayTime, params.predelay);
        smooth(damp.frequency, params.damp);
        smooth(dry.gain, Math.cos((params.mix * Math.PI) / 2));
        smooth(wet.gain, Math.sin((params.mix * Math.PI) / 2));
      },
      dispose() {
        for (const node of [input, output, dry, wet, pre, convolver, damp]) node.disconnect();
      },
    };
  },
});
