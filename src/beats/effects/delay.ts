import { defineEffect } from "@/core/contracts";
import { createSmoother } from "./smooth";

const MAX_SECONDS = 2;

/** Feedback delay with a tone filter in the loop (repeats get darker) and a ping-pong mode. */
export const delay = defineEffect({
  name: "Delay",
  params: {
    time: { label: "Time", min: 0.01, max: MAX_SECONDS, default: 0.375, curve: "exp", unit: "s" },
    feedback: { label: "Feedback", min: 0, max: 0.95, default: 0.4, unit: "%" },
    tone: { label: "Tone", min: 300, max: 18000, default: 4500, curve: "exp", unit: "Hz" },
    mix: { label: "Mix", min: 0, max: 1, default: 0.3, unit: "%" },
    mode: { label: "Mode", min: 0, max: 1, default: 0, options: ["Mono", "Ping-pong"] },
  },
  create(ctx) {
    const input = ctx.createGain();
    const output = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const left = ctx.createDelay(MAX_SECONDS);
    const right = ctx.createDelay(MAX_SECONDS);
    const tone = ctx.createBiquadFilter();
    const feedback = ctx.createGain();
    const merger = ctx.createChannelMerger(2);
    const smooth = createSmoother(ctx);
    let mode = -1;

    // input → dry → output; input → left → tone → feedback ↺ and → wet.
    input.connect(dry).connect(output);
    input.connect(left);
    left.connect(tone);
    tone.connect(feedback);
    merger.connect(wet).connect(output);

    /** Mono: one tap on both sides. Ping-pong: the right tap echoes the left one. */
    function route(next: number) {
      if (next === mode) return;
      mode = next;
      tone.disconnect();
      feedback.disconnect();
      tone.connect(feedback);
      tone.connect(merger, 0, 0);
      if (mode === 1) {
        feedback.connect(right);
        right.connect(merger, 0, 1);
        right.connect(left);
      } else {
        right.disconnect();
        tone.connect(merger, 0, 1);
        feedback.connect(left);
      }
    }

    return {
      input,
      output,
      update(params) {
        route(params.mode);
        smooth(left.delayTime, params.time);
        smooth(right.delayTime, params.time);
        smooth(feedback.gain, params.feedback);
        smooth(tone.frequency, params.tone);
        // Equal-power crossfade so turning up the mix doesn't change loudness much.
        smooth(dry.gain, Math.cos((params.mix * Math.PI) / 2));
        smooth(wet.gain, Math.sin((params.mix * Math.PI) / 2));
      },
      dispose() {
        for (const node of [input, output, dry, wet, left, right, tone, feedback, merger])
          node.disconnect();
      },
    };
  },
});
