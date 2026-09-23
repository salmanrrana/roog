import { noteNames, quantizeSemitone, scaleNames } from "../music.js";
import {
  disconnectAll,
  glide,
  scaler,
  shaper,
  voltage,
  waveShapes,
} from "./shared.js";

/** @type {import("../types.js").ModuleDef} */
export const vcf = {
  type: "vcf",
  name: "VCF",
  category: "shaper",
  hp: 10,
  blurb: "Multimode filter with drive · 24dB mode screams at high resonance",
  ports: [
    { id: "in", label: "in", type: "audio", dir: "in" },
    { id: "cutoff", label: "cutoff", type: "cv", dir: "in" },
    { id: "out", label: "out", type: "audio", dir: "out" },
  ],
  controls: [
    {
      id: "cutoff",
      label: "cutoff",
      value: 1200,
      min: 30,
      max: 16000,
      curve: "exp",
      unit: "Hz",
    },
    { id: "res", label: "res", value: 4, min: 0.3, max: 26 },
    { id: "amount", label: "cv amt", value: 0.5, min: -1, max: 1 },
    { id: "drive", label: "drive", value: 0.2, min: 0, max: 1, unit: "%" },
    {
      id: "mode",
      label: "mode",
      value: "lowpass",
      options: ["lowpass", "bandpass", "highpass"],
    },
    { id: "slope", label: "slope", value: "24dB", options: ["12dB", "24dB"] },
  ],
  create({ audio }) {
    const pre = scaler(audio, 1);
    const saturate = shaper(audio, (x) => Math.tanh(x * 2.5) / Math.tanh(2.5));
    const first = audio.createBiquadFilter();
    const second = audio.createBiquadFilter();
    const out = scaler(audio, 1);
    // CV is 1 V/oct: each volt moves the cutoff one octave, times the amount knob.
    const cutoff = scaler(audio, 600);
    const state = { mode: "lowpass", slope: "24dB" };

    pre.connect(saturate);
    saturate.connect(first);
    first.connect(second);
    second.connect(out);
    cutoff.connect(first.detune);
    cutoff.connect(second.detune);
    second.Q.value = 0.7;

    function route() {
      first.type = state.mode;
      // An allpass keeps the phase chain without touching level: a clean 12dB mode.
      second.type = state.slope === "24dB" ? state.mode : "allpass";
    }

    route();

    return {
      inputs: { in: pre, cutoff },
      outputs: { out },
      set(id, value) {
        if (id === "cutoff") {
          glide(first.frequency, value, audio);
          glide(second.frequency, value, audio);
        } else if (id === "res") {
          glide(first.Q, value, audio);
        } else if (id === "amount") {
          glide(cutoff.gain, Number(value) * 1200, audio);
        } else if (id === "drive") {
          glide(pre.gain, 0.6 + Number(value) * 5, audio);
          glide(out.gain, 1 / (1 + Number(value) * 1.2), audio);
        } else {
          state[id] = value;
          route();
        }
      },
      dispose: () => disconnectAll(pre, saturate, first, second, out, cutoff),
    };
  },
};

/** @type {import("../types.js").ModuleDef} */
export const lpg = {
  type: "lpg",
  name: "LPG",
  category: "shaper",
  hp: 6,
  blurb: "Low pass gate: a vactrol-style bongo pluck on every trigger",
  ports: [
    { id: "in", label: "in", type: "audio", dir: "in" },
    { id: "strike", label: "strike", type: "gate", dir: "in" },
    { id: "cv", label: "level", type: "cv", dir: "in" },
    { id: "out", label: "out", type: "audio", dir: "out" },
  ],
  controls: [
    {
      id: "decay",
      label: "decay",
      value: 0.35,
      min: 0.04,
      max: 3,
      curve: "exp",
      unit: "s",
    },
    { id: "res", label: "res", value: 0.3, min: 0, max: 1, unit: "%" },
    {
      id: "mode",
      label: "mode",
      value: "combo",
      options: ["combo", "lp", "vca"],
    },
  ],
  create({ audio, values }) {
    const filter = audio.createBiquadFilter();
    const vca = audio.createGain();
    const vactrol = voltage(audio);
    const sum = audio.createGain();
    const cv = scaler(audio, 0.2, sum);
    const toVca = scaler(audio, 1);
    const toFilter = scaler(audio, 9000);

    filter.type = "lowpass";
    filter.frequency.value = 80;
    vca.gain.value = 0;
    vactrol.connect(sum);
    sum.connect(toVca);
    sum.connect(toFilter);
    toVca.connect(vca.gain);
    toFilter.connect(filter.detune);
    filter.connect(vca);

    return {
      inputs: { in: filter, cv },
      outputs: { out: vca },
      gates: {
        // Vactrols open fast and close slowly, with a long soft tail.
        strike(time, velocity) {
          if (velocity > 0) {
            const decay = Number(values.decay);

            vactrol.offset.cancelScheduledValues(time);
            vactrol.offset.setTargetAtTime(velocity, time, 0.002);
            vactrol.offset.setTargetAtTime(0, time + 0.008, decay / 4);
          }
        },
      },
      set(id, value) {
        if (id === "res") {
          filter.Q.value = 0.5 + Number(value) * 12;
        } else if (id === "mode") {
          vca.gain.value = value === "lp" ? 1 : 0;
          toVca.gain.value = value === "lp" ? 0 : 1;
          toFilter.gain.value = value === "vca" ? 0 : 9000;
          filter.frequency.value = value === "vca" ? 20000 : 80;
        }
      },
      dispose: () =>
        disconnectAll(filter, vca, vactrol, sum, cv, toVca, toFilter),
    };
  },
};

/** @type {import("../types.js").ModuleDef} */
export const vca = {
  type: "vca",
  name: "VCA",
  category: "shaper",
  hp: 4,
  blurb: "Voltage controlled amp · 5 V of cv = full volume",
  ports: [
    { id: "in", label: "in", type: "audio", dir: "in" },
    { id: "cv", label: "cv", type: "cv", dir: "in" },
    { id: "out", label: "out", type: "audio", dir: "out" },
  ],
  controls: [
    { id: "level", label: "level", value: 0, min: 0, max: 1, unit: "%" },
  ],
  create({ audio }) {
    const amp = audio.createGain();
    const cv = scaler(audio, 0.2, amp.gain);

    amp.gain.value = 0;

    return {
      inputs: { in: amp, cv },
      outputs: { out: amp },
      set: (id, value) => glide(amp.gain, value, audio),
      dispose: () => disconnectAll(amp, cv),
    };
  },
};

/** @type {import("../types.js").ModuleDef} */
export const env = {
  type: "env",
  name: "ENV",
  category: "modulator",
  hp: 8,
  blurb: "ADSR envelope, 0–5 V · velocity scales the peak (accents hit harder)",
  ports: [
    { id: "gate", label: "gate", type: "gate", dir: "in" },
    { id: "out", label: "out", type: "cv", dir: "out" },
    { id: "inv", label: "inv", type: "cv", dir: "out" },
  ],
  controls: [
    {
      id: "attack",
      label: "attack",
      value: 0.004,
      min: 0.001,
      max: 4,
      curve: "exp",
      unit: "s",
    },
    {
      id: "decay",
      label: "decay",
      value: 0.25,
      min: 0.005,
      max: 4,
      curve: "exp",
      unit: "s",
    },
    { id: "sustain", label: "sustain", value: 0.3, min: 0, max: 1, unit: "%" },
    {
      id: "release",
      label: "release",
      value: 0.3,
      min: 0.005,
      max: 6,
      curve: "exp",
      unit: "s",
    },
  ],
  create({ audio, values }) {
    const out = voltage(audio);
    const inv = scaler(audio, -1);
    const level = out.offset;

    out.connect(inv);

    return {
      outputs: { out, inv },
      gates: {
        gate(time, velocity) {
          level.cancelScheduledValues(time);

          if (velocity > 0) {
            const peak = 5 * velocity;
            const attack = Number(values.attack);

            level.setTargetAtTime(peak, time, attack / 3);
            level.setTargetAtTime(
              peak * Number(values.sustain),
              time + attack,
              Number(values.decay) / 3,
            );
          } else {
            level.setTargetAtTime(0, time, Number(values.release) / 3);
          }
        },
      },
      dispose: () => disconnectAll(out, inv),
    };
  },
};

const LFO_SYNC = {
  free: 0,
  "4 bar": 64,
  "1 bar": 16,
  "1/2": 8,
  "1/4": 4,
  "1/8": 2,
};

/** @type {import("../types.js").ModuleDef} */
export const lfo = {
  type: "lfo",
  name: "LFO",
  category: "modulator",
  hp: 6,
  blurb: "Slow wobble, ±5 V · sync it to the clock for tempo-locked sweeps",
  ports: [{ id: "out", label: "out", type: "cv", dir: "out" }],
  controls: [
    {
      id: "rate",
      label: "rate",
      value: 0.4,
      min: 0.02,
      max: 40,
      curve: "exp",
      unit: "Hz",
    },
    { id: "depth", label: "depth", value: 5, min: 0, max: 5 },
    { id: "wave", label: "wave", value: "sine", options: waveShapes },
    {
      id: "sync",
      label: "sync",
      value: "free",
      options: Object.keys(LFO_SYNC),
    },
  ],
  create({ audio, values, onClock }) {
    const osc = audio.createOscillator();
    const out = scaler(audio, 5);

    osc.connect(out);
    osc.start();

    // Re-read tempo every tick so synced LFOs follow BPM changes.
    function retime(step) {
      const steps = LFO_SYNC[String(values.sync)];

      osc.frequency.value = steps ? 1 / (step * steps) : Number(values.rate);
    }

    onClock((_, step) => retime(step));

    return {
      outputs: { out },
      set(id, value) {
        if (id === "wave") {
          osc.type = value;
        } else if (id === "depth") {
          glide(out.gain, value, audio);
        } else if (id === "rate") {
          osc.frequency.value = Number(value);
        }
      },
      dispose: () => disconnectAll(osc, out),
    };
  },
};

// The quantizer is a WaveShaper staircase: ±8 V squeezed into the shaper's ±1 range.
const QUANT_RANGE = 8;

/** @type {import("../types.js").ModuleDef} */
export const quant = {
  type: "quant",
  name: "QUANT",
  category: "modulator",
  hp: 6,
  blurb: "Snaps any cv to notes of a scale · LFO in, melody out",
  ports: [
    { id: "in", label: "in", type: "cv", dir: "in" },
    { id: "out", label: "out", type: "cv", dir: "out" },
  ],
  controls: [
    { id: "scale", label: "scale", value: "pent maj", options: scaleNames },
    { id: "root", label: "root", value: "C", options: noteNames },
  ],
  create({ audio, values }) {
    const input = scaler(audio, 1 / QUANT_RANGE);
    const stairs = audio.createWaveShaper();
    const out = scaler(audio, QUANT_RANGE);

    input.connect(stairs);
    stairs.connect(out);

    return {
      inputs: { in: input },
      outputs: { out },
      set() {
        const root = noteNames.indexOf(String(values.root));
        const table = new Float32Array(8192);

        for (let index = 0; index < table.length; index += 1) {
          const volts = ((index * 2) / (table.length - 1) - 1) * QUANT_RANGE;

          table[index] =
            quantizeSemitone(
              Math.round(volts * 12),
              String(values.scale),
              root,
            ) /
            12 /
            QUANT_RANGE;
        }

        stairs.curve = table;
      },
      dispose: () => disconnectAll(input, stairs, out),
    };
  },
};

/** @type {import("../types.js").ModuleDef} */
export const mix = {
  type: "mix",
  name: "MIX",
  category: "utility",
  hp: 8,
  blurb: "Four-channel mixer",
  ports: [
    ...["a", "b", "c", "d"].map((id) => ({
      id,
      label: id,
      type: "audio",
      dir: "in",
    })),
    { id: "out", label: "out", type: "audio", dir: "out" },
  ],
  controls: ["a", "b", "c", "d"].map((id) => ({
    id,
    label: id,
    value: 0.8,
    min: 0,
    max: 1.2,
  })),
  create({ audio }) {
    const out = audio.createGain();
    const channels = Object.fromEntries(
      ["a", "b", "c", "d"].map((id) => [id, scaler(audio, 0.8, out)]),
    );

    return {
      inputs: channels,
      outputs: { out },
      set: (id, value) => glide(channels[id].gain, value, audio),
      dispose: () => disconnectAll(out, ...Object.values(channels)),
    };
  },
};
