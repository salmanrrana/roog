import { defineEffect } from "@/core/contracts";
import { createSmoother, dbToGain } from "./smooth";

/** Bus compressor (the browser's DynamicsCompressor) with makeup gain. */
export const compressor = defineEffect({
  name: "Compressor",
  params: {
    threshold: { label: "Thresh", min: -60, max: 0, default: -18, step: 0.5, unit: "dB" },
    ratio: { label: "Ratio", min: 1, max: 20, default: 4, curve: "exp" },
    attack: { label: "Attack", min: 0.001, max: 0.5, default: 0.01, curve: "exp", unit: "s" },
    release: { label: "Release", min: 0.02, max: 1, default: 0.15, curve: "exp", unit: "s" },
    knee: { label: "Knee", min: 0, max: 30, default: 6, step: 0.5, unit: "dB" },
    makeup: { label: "Makeup", min: 0, max: 24, default: 4, step: 0.1, unit: "dB" },
  },
  create(ctx) {
    const comp = ctx.createDynamicsCompressor();
    const makeup = ctx.createGain();
    const smooth = createSmoother(ctx);
    comp.connect(makeup);
    return {
      input: comp,
      output: makeup,
      update(params) {
        smooth(comp.threshold, params.threshold);
        smooth(comp.ratio, params.ratio);
        smooth(comp.attack, params.attack);
        smooth(comp.release, params.release);
        smooth(comp.knee, params.knee);
        smooth(makeup.gain, dbToGain(params.makeup));
      },
      dispose() {
        comp.disconnect();
        makeup.disconnect();
      },
    };
  },
});
