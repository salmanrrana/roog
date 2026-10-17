import { defineEffect } from "@/core/contracts";
import { createSmoother } from "./smooth";

const gain = (label: string) =>
  ({ label, min: -18, max: 18, default: 0, step: 0.1, unit: "dB" }) as const;

/** Three-band EQ: low shelf, sweepable mid bell, high shelf. */
export const eq = defineEffect({
  name: "EQ",
  params: {
    low: gain("Low"),
    lowFreq: { label: "Lo Hz", min: 30, max: 600, default: 120, curve: "exp", unit: "Hz" },
    mid: gain("Mid"),
    midFreq: { label: "Mid Hz", min: 150, max: 8000, default: 1000, curve: "exp", unit: "Hz" },
    midQ: { label: "Mid Q", min: 0.2, max: 8, default: 0.9, curve: "exp" },
    high: gain("High"),
    highFreq: { label: "Hi Hz", min: 1500, max: 16000, default: 6000, curve: "exp", unit: "Hz" },
  },
  create(ctx) {
    const low = ctx.createBiquadFilter();
    const mid = ctx.createBiquadFilter();
    const high = ctx.createBiquadFilter();
    const smooth = createSmoother(ctx);
    low.type = "lowshelf";
    mid.type = "peaking";
    high.type = "highshelf";
    low.connect(mid).connect(high);
    return {
      input: low,
      output: high,
      update(params) {
        smooth(low.gain, params.low);
        smooth(low.frequency, params.lowFreq);
        smooth(mid.gain, params.mid);
        smooth(mid.frequency, params.midFreq);
        smooth(mid.Q, params.midQ);
        smooth(high.gain, params.high);
        smooth(high.frequency, params.highFreq);
      },
      dispose() {
        for (const node of [low, mid, high]) node.disconnect();
      },
    };
  },
});
