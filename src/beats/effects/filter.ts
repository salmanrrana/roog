import { defineEffect } from "@/core/contracts";
import { createSmoother } from "./smooth";

const TYPES = ["lowpass", "highpass", "bandpass"] as const satisfies readonly BiquadFilterType[];

/** Resonant filter insert: low, high or band pass. */
export const filter = defineEffect({
  name: "Filter",
  params: {
    type: { label: "Type", min: 0, max: 2, default: 0, options: ["Low", "High", "Band"] },
    cutoff: { label: "Cutoff", min: 20, max: 20000, default: 20000, curve: "exp", unit: "Hz" },
    resonance: { label: "Resonance", min: 0.1, max: 20, default: 0.7, curve: "exp", unit: "Q" },
  },
  create(ctx) {
    const node = ctx.createBiquadFilter();
    const smooth = createSmoother(ctx);
    return {
      input: node,
      output: node,
      update(params) {
        node.type = TYPES[params.type] ?? "lowpass";
        smooth(node.frequency, params.cutoff);
        smooth(node.Q, params.resonance);
      },
      dispose() {
        node.disconnect();
      },
    };
  },
});
