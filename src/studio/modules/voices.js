import { C4_HZ } from "../music.js";
import {
  disconnectAll,
  glide,
  noiseBurst,
  scaler,
  shaper,
  strike,
  voltage,
  waveShapes,
} from "./shared.js";

export const WORKLET_URL = new URL("../dsp/worklets.js", import.meta.url).href;

/** @type {import("../types.js").ModuleDef} */
export const vco = {
  type: "vco",
  name: "VCO",
  category: "source",
  hp: 8,
  blurb: "Analog-style oscillator with a sub octave and slow drift",
  ports: [
    { id: "pitch", label: "v/oct", type: "cv", dir: "in" },
    { id: "fm", label: "fm", type: "cv", dir: "in" },
    { id: "out", label: "out", type: "audio", dir: "out" },
    { id: "sub", label: "sub", type: "audio", dir: "out" },
  ],
  controls: [
    { id: "octave", label: "octave", value: 0, min: -4, max: 3, step: 1 },
    { id: "fine", label: "fine", value: 0, min: -100, max: 100, step: 1 },
    { id: "wave", label: "wave", value: "sawtooth", options: waveShapes },
    { id: "fmAmt", label: "fm amt", value: 0.2, min: 0, max: 1, unit: "%" },
    { id: "drift", label: "drift", value: 0.3, min: 0, max: 1, unit: "%" },
  ],
  create({ audio }) {
    const osc = audio.createOscillator();
    const sub = audio.createOscillator();
    const pitch = scaler(audio, 1200);
    const tune = voltage(audio);
    const fm = scaler(audio, 0);
    const out = scaler(audio, 0.32);
    const subOut = scaler(audio, 0.3);
    // Two slow, unrelated sines wander the tuning a few cents: analog warmth.
    const driftA = audio.createOscillator();
    const driftB = audio.createOscillator();
    const drift = scaler(audio, 0);

    osc.frequency.value = C4_HZ;
    sub.frequency.value = C4_HZ / 2;
    sub.type = "square";
    driftA.frequency.value = 0.13;
    driftB.frequency.value = 0.41;
    tune.connect(pitch);
    [pitch, fm, drift].forEach((node) => {
      node.connect(osc.detune);
      node.connect(sub.detune);
    });
    driftA.connect(drift);
    driftB.connect(drift);
    osc.connect(out);
    sub.connect(subOut);
    [osc, sub, driftA, driftB].forEach((node) => node.start());

    const values = { octave: 0, fine: 0 };

    return {
      inputs: { pitch, fm },
      outputs: { out, sub: subOut },
      set(id, value) {
        if (id === "octave" || id === "fine") {
          values[id] = Number(value);
          tune.offset.value = values.octave + values.fine / 1200;
        } else if (id === "wave") {
          osc.type = value;
        } else if (id === "fmAmt") {
          glide(fm.gain, Number(value) * 1200, audio);
        } else if (id === "drift") {
          glide(drift.gain, Number(value) * 6, audio);
        }
      },
      dispose: () =>
        disconnectAll(
          osc,
          sub,
          driftA,
          driftB,
          tune,
          pitch,
          fm,
          out,
          subOut,
          drift,
        ),
    };
  },
};

/** @type {import("../types.js").ModuleDef} */
export const fold = {
  type: "fold",
  name: "FOLD",
  category: "source",
  hp: 10,
  blurb: "West-coast complex oscillator: FM into a wavefolder",
  ports: [
    { id: "pitch", label: "v/oct", type: "cv", dir: "in" },
    { id: "index", label: "index", type: "cv", dir: "in" },
    { id: "fold", label: "fold", type: "cv", dir: "in" },
    { id: "out", label: "out", type: "audio", dir: "out" },
  ],
  controls: [
    { id: "octave", label: "octave", value: -1, min: -4, max: 3, step: 1 },
    {
      id: "ratio",
      label: "ratio",
      value: 2,
      min: 0.25,
      max: 8,
      step: 0.01,
      curve: "exp",
    },
    { id: "index", label: "index", value: 0.3, min: 0, max: 3 },
    { id: "fold", label: "fold", value: 0.35, min: 0, max: 1, unit: "%" },
    { id: "level", label: "level", value: 0.7, min: 0, max: 1, unit: "%" },
  ],
  create({ audio }) {
    const carrier = audio.createOscillator();
    const modulator = audio.createOscillator();
    const pitch = scaler(audio, 1200);
    const tune = voltage(audio);
    const fmDepth = scaler(audio, 0);
    const indexCv = scaler(audio, 0);
    const pre = scaler(audio, 0.3);
    const foldCv = scaler(audio, 0.12);
    // Sine folding: more gain in, more times the wave folds back on itself.
    const folder = shaper(audio, (x) => Math.sin(x * Math.PI * 3), 8192);
    const out = scaler(audio, 0.3);
    const state = { octave: -1, ratio: 2, index: 0.3 };

    carrier.frequency.value = C4_HZ;
    modulator.frequency.value = C4_HZ * 2;
    tune.connect(pitch);
    pitch.connect(carrier.detune);
    pitch.connect(modulator.detune);
    modulator.connect(fmDepth);
    fmDepth.connect(carrier.frequency);
    indexCv.connect(fmDepth.gain);
    carrier.connect(pre);
    foldCv.connect(pre.gain);
    pre.connect(folder);
    folder.connect(out);
    carrier.start();
    modulator.start();

    // Linear FM depth is in Hz, so scale it with the base pitch to keep the timbre steady across octaves.
    function retune() {
      const base = C4_HZ * 2 ** state.octave;

      tune.offset.value = state.octave;
      modulator.frequency.value = C4_HZ * state.ratio;
      glide(fmDepth.gain, state.index * base * state.ratio, audio);
      indexCv.gain.value = base * state.ratio * 0.3;
    }

    return {
      inputs: { pitch, index: indexCv, fold: foldCv },
      outputs: { out },
      set(id, value) {
        if (id in state) {
          state[id] = Number(value);
          retune();
        } else if (id === "fold") {
          glide(pre.gain, 0.12 + Number(value) * 0.88, audio);
        } else if (id === "level") {
          glide(out.gain, Number(value) * 0.45, audio);
        }
      },
      dispose: () =>
        disconnectAll(
          carrier,
          modulator,
          tune,
          pitch,
          fmDepth,
          indexCv,
          pre,
          foldCv,
          folder,
          out,
        ),
    };
  },
};

/** @type {import("../types.js").ModuleDef} */
export const string = {
  type: "string",
  name: "STRING",
  category: "source",
  hp: 8,
  blurb:
    "Plucked Karplus-Strong string · patch audio into EXCITE to make it resonate",
  worklet: WORKLET_URL,
  ports: [
    { id: "pitch", label: "v/oct", type: "cv", dir: "in" },
    { id: "pluck", label: "pluck", type: "gate", dir: "in" },
    { id: "excite", label: "excite", type: "audio", dir: "in" },
    { id: "out", label: "out", type: "audio", dir: "out" },
  ],
  controls: [
    { id: "tune", label: "octave", value: 0, min: -3, max: 2, step: 1 },
    { id: "bright", label: "bright", value: 0.55, min: 0, max: 1, unit: "%" },
    { id: "decay", label: "decay", value: 0.75, min: 0, max: 1, unit: "%" },
    { id: "body", label: "body", value: 0.5, min: 0, max: 1, unit: "%" },
  ],
  create({ audio }) {
    const node = new AudioWorkletNode(audio, "roog-string", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    const out = scaler(audio, 0.6);

    node.connect(out);

    return {
      inputs: { pitch: node.parameters.get("pitch"), excite: node },
      outputs: { out },
      gates: {
        pluck(time, velocity) {
          if (velocity > 0) {
            node.port.postMessage({ time, velocity: 0.4 + velocity * 0.6 });
          }
        },
      },
      set(id, value) {
        node.parameters
          .get(id)
          .setValueAtTime(Number(value), audio.currentTime);
      },
      dispose: () => disconnectAll(node, out),
    };
  },
};

// Hi-hat metal: six detuned square waves at the TR-808's cymbal frequencies.
const METAL_HZ = [205.3, 304.4, 369.6, 522.7, 540, 800];

/** @type {import("../types.js").ModuleDef} */
export const kit = {
  type: "kit",
  name: "KIT",
  category: "source",
  hp: 18,
  blurb: "Six synthesized drum voices · closed hat chokes the open hat",
  ports: [
    { id: "kick", label: "kick", type: "gate", dir: "in" },
    { id: "snare", label: "snare", type: "gate", dir: "in" },
    { id: "hat", label: "hat", type: "gate", dir: "in" },
    { id: "open", label: "open", type: "gate", dir: "in" },
    { id: "clap", label: "clap", type: "gate", dir: "in" },
    { id: "zap", label: "zap", type: "gate", dir: "in" },
    { id: "out", label: "out", type: "audio", dir: "out" },
  ],
  controls: [
    { id: "kickTune", label: "kick", value: 48, min: 30, max: 90, unit: "Hz" },
    {
      id: "kickDecay",
      label: "boom",
      value: 0.45,
      min: 0.08,
      max: 1.6,
      curve: "exp",
      unit: "s",
    },
    { id: "punch", label: "punch", value: 0.5, min: 0, max: 1, unit: "%" },
    {
      id: "snareTune",
      label: "snare",
      value: 190,
      min: 110,
      max: 420,
      unit: "Hz",
    },
    { id: "snap", label: "snap", value: 0.6, min: 0, max: 1, unit: "%" },
    {
      id: "hatDecay",
      label: "hat",
      value: 0.05,
      min: 0.015,
      max: 0.3,
      curve: "exp",
      unit: "s",
    },
    {
      id: "openDecay",
      label: "open",
      value: 0.38,
      min: 0.08,
      max: 1.2,
      curve: "exp",
      unit: "s",
    },
    {
      id: "zapTune",
      label: "zap",
      value: 520,
      min: 80,
      max: 2400,
      curve: "exp",
      unit: "Hz",
    },
    { id: "color", label: "color", value: 0.5, min: 0, max: 1, unit: "%" },
    { id: "level", label: "level", value: 0.9, min: 0, max: 1.4 },
  ],
  create({ audio }) {
    const out = scaler(audio, 0.9);
    const kickBus = scaler(audio, 1);
    const punch = shaper(audio, (x) => Math.tanh(x * 3));
    const kickDrive = scaler(audio, 1);
    const metal = scaler(audio, 0.18);
    const metalBand = audio.createBiquadFilter();
    const metalHigh = audio.createBiquadFilter();
    const hatVca = scaler(audio, 0, out);
    const openVca = scaler(audio, 0, out);
    const clapBand = audio.createBiquadFilter();
    const clapVca = scaler(audio, 0, out);
    const snareNoiseFilter = audio.createBiquadFilter();
    const v = {};

    kickBus.connect(kickDrive);
    kickDrive.connect(punch);
    punch.connect(out);
    metalBand.type = "bandpass";
    metalBand.frequency.value = 10000;
    metalBand.Q.value = 0.8;
    metalHigh.type = "highpass";
    metalHigh.frequency.value = 7000;
    metal.connect(metalBand);
    metalBand.connect(metalHigh);
    metalHigh.connect(hatVca);
    metalHigh.connect(openVca);
    clapBand.type = "bandpass";
    clapBand.frequency.value = 1150;
    clapBand.Q.value = 1.4;
    clapBand.connect(clapVca);
    snareNoiseFilter.type = "highpass";
    snareNoiseFilter.frequency.value = 1400;
    snareNoiseFilter.connect(out);

    const metalOscillators = METAL_HZ.map((hz) => {
      const osc = audio.createOscillator();

      osc.type = "square";
      osc.frequency.value = hz;
      osc.connect(metal);
      osc.start();
      return osc;
    });

    // One-shot voices build throwaway nodes per hit; the browser frees them after stop().
    function blip(type, time, from, to, sweep, level, decay, destination) {
      const osc = audio.createOscillator();
      const amp = audio.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(from, time);
      osc.frequency.exponentialRampToValueAtTime(to, time + sweep);
      strike(amp.gain, time, level, decay);
      osc.connect(amp);
      amp.connect(destination);
      osc.start(time);
      osc.stop(time + decay * 2 + 0.05);
      return osc;
    }

    const gates = {
      kick(time, velocity) {
        if (velocity > 0) {
          blip(
            "sine",
            time,
            v.kickTune * 5,
            v.kickTune,
            0.07,
            0.6 + velocity * 0.5,
            v.kickDecay,
            kickBus,
          );
          blip(
            "triangle",
            time,
            v.kickTune * 14,
            v.kickTune * 2,
            0.012,
            0.25 * v.punch,
            0.018,
            kickBus,
          );
        }
      },
      snare(time, velocity) {
        if (velocity > 0) {
          const noise = noiseBurst(audio, time, 0.4);
          const amp = audio.createGain();

          blip(
            "triangle",
            time,
            v.snareTune * 1.6,
            v.snareTune,
            0.03,
            0.45 * velocity,
            0.12,
            out,
          );
          strike(
            amp.gain,
            time,
            (0.2 + v.snap * 0.6) * velocity,
            0.08 + v.snap * 0.14,
          );
          noise.connect(amp);
          amp.connect(snareNoiseFilter);
        }
      },
      hat(time, velocity) {
        if (velocity > 0) {
          strike(openVca.gain, time, 0, 0.01);
          strike(hatVca.gain, time, velocity, v.hatDecay);
        }
      },
      open(time, velocity) {
        if (velocity > 0) {
          strike(openVca.gain, time, velocity * 0.8, v.openDecay);
        }
      },
      clap(time, velocity) {
        if (velocity > 0) {
          const noise = noiseBurst(audio, time, 0.5);
          const gain = clapVca.gain;

          noise.connect(clapBand);
          gain.cancelScheduledValues(time);
          [0, 0.011, 0.022].forEach((offset) => {
            gain.setValueAtTime(velocity * 1.4, time + offset);
            gain.setTargetAtTime(0.05, time + offset + 0.001, 0.003);
          });
          gain.setValueAtTime(velocity, time + 0.033);
          gain.setTargetAtTime(0, time + 0.034, 0.06);
        }
      },
      // FM blip: the modulator's index follows COLOR, pitch dives like a laser zap.
      zap(time, velocity) {
        if (velocity > 0) {
          const carrier = blip(
            "sine",
            time,
            v.zapTune * 2,
            v.zapTune * 0.5,
            0.09,
            0.35 * velocity,
            0.16,
            out,
          );
          const modulator = audio.createOscillator();
          const depth = audio.createGain();

          modulator.frequency.setValueAtTime(v.zapTune * 1.41, time);
          strike(depth.gain, time, v.zapTune * v.color * 6, 0.12);
          modulator.connect(depth);
          depth.connect(carrier.frequency);
          modulator.start(time);
          modulator.stop(time + 0.4);
        }
      },
    };

    return {
      inputs: {},
      outputs: { out },
      gates,
      set(id, value) {
        v[id] = Number(value);

        if (id === "punch") {
          kickDrive.gain.value = 0.6 + v.punch * 2.4;
        } else if (id === "level") {
          glide(out.gain, v.level, audio);
        } else if (id === "color") {
          metalBand.frequency.value = 7000 + v.color * 6000;
          clapBand.frequency.value = 800 + v.color * 900;
        }
      },
      dispose: () =>
        disconnectAll(
          out,
          kickBus,
          punch,
          kickDrive,
          metal,
          metalBand,
          metalHigh,
          hatVca,
          openVca,
          clapBand,
          clapVca,
          snareNoiseFilter,
          ...metalOscillators,
        ),
    };
  },
};
