import { defineInstrument } from "@/core/contracts";

const WAVES = [
  "sawtooth",
  "square",
  "triangle",
  "sine",
] as const satisfies readonly OscillatorType[];

interface Voice {
  readonly oscs: readonly OscillatorNode[];
  readonly amp: GainNode;
}

/** Per-voice level: leaves headroom for chords before the mixer. */
const VOICE_GAIN = 0.28;

/**
 * A small subtractive poly synth for bass lines, leads and chords: one or two
 * detuned oscillators → resonant lowpass with its own decay envelope → ADSR amp.
 */
export const synth = defineInstrument({
  name: "Synth",
  usesSample: false,
  params: {
    wave: { label: "Wave", min: 0, max: 3, default: 0, options: ["Saw", "Square", "Tri", "Sine"] },
    detune: { label: "Detune", min: 0, max: 50, default: 0, step: 1, unit: "ct" },
    cutoff: { label: "Cutoff", min: 40, max: 18000, default: 2400, curve: "exp", unit: "Hz" },
    resonance: { label: "Resonance", min: 0.1, max: 20, default: 1, curve: "exp", unit: "Q" },
    envAmount: { label: "Filter envelope", min: 0, max: 6, default: 2, step: 0.1, unit: "oct" },
    filterDecay: {
      label: "Filter decay",
      min: 0.01,
      max: 4,
      default: 0.3,
      curve: "exp",
      unit: "s",
    },
    attack: { label: "Attack", min: 0.001, max: 2, default: 0.005, curve: "exp", unit: "s" },
    decay: { label: "Decay", min: 0.01, max: 4, default: 0.25, curve: "exp", unit: "s" },
    sustain: { label: "Sustain", min: 0, max: 1, default: 0.7, unit: "%" },
    release: { label: "Release", min: 0.01, max: 4, default: 0.2, curve: "exp", unit: "s" },
  },
  create({ ctx, output }) {
    const playing = new Set<Voice>();

    function silence({ oscs, amp }: Voice, time: number) {
      const at = Math.max(time, ctx.currentTime);
      amp.gain.cancelScheduledValues(at);
      amp.gain.setTargetAtTime(0, at, 0.004);
      for (const osc of oscs) osc.stop(at + 0.05);
    }

    return {
      trigger(note, { params }) {
        const start = note.time;
        // Short notes still get their full attack, so the release never jumps back up.
        const attack = Math.min(params.attack, note.duration);
        const end = start + note.duration;
        const stop = end + params.release * 1.5;
        const hz = 440 * 2 ** ((note.pitch - 69) / 12);
        const peak = note.velocity * VOICE_GAIN;

        const filter = ctx.createBiquadFilter();
        const amp = ctx.createGain();
        const detuned = params.detune > 0 ? [-params.detune, params.detune] : [0];
        const oscs = detuned.map((cents) => {
          const osc = ctx.createOscillator();
          osc.type = WAVES[params.wave] ?? "sawtooth";
          osc.frequency.value = hz;
          osc.detune.value = cents;
          osc.connect(filter);
          osc.start(start);
          osc.stop(stop);
          return osc;
        });
        const voice = { oscs, amp };

        // Filter: open by envAmount octaves at the strike, fall back to cutoff.
        const top = Math.min(params.cutoff * 2 ** params.envAmount, 20000);
        filter.Q.value = params.resonance;
        filter.frequency.setValueAtTime(top, start);
        filter.frequency.setTargetAtTime(params.cutoff, start, params.filterDecay / 4);

        // Amp ADSR. Two oscillators are summed, so each half keeps the level steady.
        const level = peak / Math.sqrt(oscs.length);
        amp.gain.setValueAtTime(0, start);
        amp.gain.linearRampToValueAtTime(level, start + attack);
        amp.gain.setTargetAtTime(level * params.sustain, start + attack, params.decay / 4);
        amp.gain.setTargetAtTime(0, end, params.release / 5);

        filter.connect(amp).connect(output);
        const last = oscs.at(-1);
        if (last)
          last.onended = () => {
            amp.disconnect();
            playing.delete(voice);
          };
        playing.add(voice);
      },
      stopAll(time) {
        for (const voice of playing) silence(voice, time);
      },
      dispose() {
        for (const voice of playing) silence(voice, ctx.currentTime);
        playing.clear();
      },
    };
  },
});
