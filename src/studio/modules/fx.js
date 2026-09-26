import { disconnectAll, glide, scaler, shaper } from "./shared.js";
import { WORKLET_URL } from "./voices.js";

/** Dry/wet pair feeding one output. */
function wetDry(audio) {
  const dry = scaler(audio, 1);
  const wet = scaler(audio, 0);
  const out = audio.createGain();

  dry.connect(out);
  wet.connect(out);

  return {
    dry,
    wet,
    out,
    mix(amount) {
      glide(wet.gain, amount, audio);
      glide(dry.gain, 1 - amount * 0.7, audio);
    },
  };
}

/** @type {import("../types.js").ModuleDef} */
export const dirt = {
  type: "dirt",
  name: "DIRT",
  category: "fx",
  hp: 8,
  blurb:
    "Fuzz into a bit crusher · lower BITS and RATE for broken-console grit",
  worklet: WORKLET_URL,
  ports: [
    { id: "in", label: "in", type: "audio", dir: "in" },
    { id: "out", label: "out", type: "audio", dir: "out" },
  ],
  controls: [
    { id: "drive", label: "fuzz", value: 0.4, min: 0, max: 1, unit: "%" },
    { id: "bits", label: "bits", value: 16, min: 2, max: 16, step: 1 },
    { id: "rate", label: "rate", value: 1, min: 1, max: 40, step: 1 },
    {
      id: "tone",
      label: "tone",
      value: 5000,
      min: 200,
      max: 16000,
      curve: "exp",
      unit: "Hz",
    },
    { id: "mix", label: "mix", value: 0.7, min: 0, max: 1, unit: "%" },
  ],
  create({ audio }) {
    const input = audio.createGain();
    const pre = scaler(audio, 4);
    // Asymmetric clipping: the positive side squashes harder, like a starved transistor.
    const fuzz = shaper(audio, (x) =>
      x > 0 ? Math.tanh(x * 2.2) : Math.tanh(x * 1.2) * 0.8,
    );
    const crush = new AudioWorkletNode(audio, "roog-crush", {
      outputChannelCount: [1],
    });
    const tone = audio.createBiquadFilter();
    const blend = wetDry(audio);

    tone.type = "lowpass";
    input.connect(blend.dry);
    input.connect(pre);
    pre.connect(fuzz);
    fuzz.connect(crush);
    crush.connect(tone);
    tone.connect(scaler(audio, 0.5, blend.wet));

    return {
      inputs: { in: input },
      outputs: { out: blend.out },
      set(id, value) {
        if (id === "drive") {
          glide(pre.gain, 1 + Number(value) * 40, audio);
        } else if (id === "bits" || id === "rate") {
          crush.parameters
            .get(id)
            .setValueAtTime(Number(value), audio.currentTime);
        } else if (id === "tone") {
          glide(tone.frequency, value, audio);
        } else if (id === "mix") {
          blend.mix(Number(value));
        }
      },
      dispose: () =>
        disconnectAll(
          input,
          pre,
          fuzz,
          crush,
          tone,
          blend.dry,
          blend.wet,
          blend.out,
        ),
    };
  },
};

// Tape delay times as multiples of the master 16th note.
const TAPE_SYNC = {
  free: 0,
  "1/16": 1,
  "1/8": 2,
  "3/16": 3,
  "1/4": 4,
  "3/8": 6,
  "1/2": 8,
};

/** @type {import("../types.js").ModuleDef} */
export const tape = {
  type: "tape",
  name: "TAPE",
  category: "fx",
  hp: 10,
  blurb: "Tape echo with wow & flutter · feedback past 100% runs away (safely)",
  ports: [
    { id: "in", label: "in", type: "audio", dir: "in" },
    { id: "time", label: "time", type: "cv", dir: "in" },
    { id: "out", label: "out", type: "audio", dir: "out" },
  ],
  controls: [
    {
      id: "time",
      label: "time",
      value: 0.375,
      min: 0.02,
      max: 1.8,
      curve: "exp",
      unit: "s",
    },
    {
      id: "feedback",
      label: "repeats",
      value: 0.45,
      min: 0,
      max: 1.1,
      unit: "%",
    },
    {
      id: "tone",
      label: "tone",
      value: 2600,
      min: 300,
      max: 12000,
      curve: "exp",
      unit: "Hz",
    },
    { id: "wow", label: "wow", value: 0.3, min: 0, max: 1, unit: "%" },
    { id: "mix", label: "mix", value: 0.35, min: 0, max: 1, unit: "%" },
    {
      id: "sync",
      label: "sync",
      value: "3/16",
      options: Object.keys(TAPE_SYNC),
    },
  ],
  create({ audio, values, onClock }) {
    const input = audio.createGain();
    const delay = audio.createDelay(4);
    // Unity gain for small signals, soft ceiling for loud ones: repeats saturate instead of exploding.
    const saturate = shaper(audio, (x) => Math.tanh(x * 1.4) / 1.4);
    const tone = audio.createBiquadFilter();
    const lowCut = audio.createBiquadFilter();
    const feedback = scaler(audio, 0.45);
    const blend = wetDry(audio);
    const timeCv = scaler(audio, 0.01, delay.delayTime);
    const wowOsc = audio.createOscillator();
    const flutterOsc = audio.createOscillator();
    const wow = scaler(audio, 0, delay.delayTime);
    const flutter = scaler(audio, 0, delay.delayTime);

    tone.type = "lowpass";
    lowCut.type = "highpass";
    lowCut.frequency.value = 70;
    wowOsc.frequency.value = 0.55;
    flutterOsc.frequency.value = 6.3;
    input.connect(blend.dry);
    input.connect(delay);
    delay.connect(saturate);
    saturate.connect(tone);
    tone.connect(lowCut);
    lowCut.connect(feedback);
    feedback.connect(delay);
    lowCut.connect(blend.wet);
    wowOsc.connect(wow);
    flutterOsc.connect(flutter);
    wowOsc.start();
    flutterOsc.start();

    // Changing time glides the tape head, so you hear the pitch bend of real tape.
    function retime(step) {
      const steps = TAPE_SYNC[String(values.sync)];
      const seconds = steps ? step * steps : Number(values.time);

      delay.delayTime.setTargetAtTime(
        Math.min(3.9, seconds),
        audio.currentTime,
        0.12,
      );
    }

    let lastStep = 0.125;

    onClock((_, step) => {
      if (Math.abs(step - lastStep) > 0.0005) {
        lastStep = step;
        retime(step);
      }
    });

    return {
      inputs: { in: input, time: timeCv },
      outputs: { out: blend.out },
      set(id, value) {
        if (id === "time" || id === "sync") {
          retime(lastStep);
        } else if (id === "feedback") {
          glide(feedback.gain, value, audio);
        } else if (id === "tone") {
          glide(tone.frequency, value, audio);
        } else if (id === "wow") {
          glide(wow.gain, Number(value) * 0.004, audio);
          glide(flutter.gain, Number(value) * 0.0004, audio);
        } else if (id === "mix") {
          blend.mix(Number(value));
        }
      },
      dispose: () =>
        disconnectAll(
          input,
          delay,
          saturate,
          tone,
          lowCut,
          feedback,
          blend.dry,
          blend.wet,
          blend.out,
          timeCv,
          wowOsc,
          flutterOsc,
          wow,
          flutter,
        ),
    };
  },
};

function impulse(audio, seconds) {
  const length = Math.max(1, Math.floor(audio.sampleRate * seconds));
  const buffer = audio.createBuffer(2, length, audio.sampleRate);

  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);

    for (let index = 0; index < length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 2.4;
    }
  }

  return buffer;
}

/** @type {import("../types.js").ModuleDef} */
export const space = {
  type: "space",
  name: "SPACE",
  category: "fx",
  hp: 8,
  blurb: "Big dark reverb · crank SIZE for endless halls",
  ports: [
    { id: "in", label: "in", type: "audio", dir: "in" },
    { id: "out", label: "out", type: "audio", dir: "out" },
  ],
  controls: [
    {
      id: "size",
      label: "size",
      value: 2.6,
      min: 0.3,
      max: 9,
      curve: "exp",
      unit: "s",
    },
    {
      id: "damp",
      label: "damp",
      value: 5000,
      min: 400,
      max: 16000,
      curve: "exp",
      unit: "Hz",
    },
    { id: "pre", label: "pre", value: 0.02, min: 0, max: 0.25, unit: "s" },
    { id: "mix", label: "mix", value: 0.3, min: 0, max: 1, unit: "%" },
  ],
  create({ audio }) {
    const input = audio.createGain();
    const preDelay = audio.createDelay(0.5);
    const convolver = audio.createConvolver();
    const damp = audio.createBiquadFilter();
    const blend = wetDry(audio);
    let rebuild = null;

    damp.type = "lowpass";
    convolver.buffer = impulse(audio, 2.6);
    input.connect(blend.dry);
    input.connect(preDelay);
    preDelay.connect(convolver);
    convolver.connect(damp);
    damp.connect(blend.wet);

    return {
      inputs: { in: input },
      outputs: { out: blend.out },
      set(id, value) {
        if (id === "size") {
          // Building an impulse is heavy; wait for the knob to settle.
          clearTimeout(rebuild);
          rebuild = setTimeout(() => {
            convolver.buffer = impulse(audio, Number(value));
          }, 120);
        } else if (id === "damp") {
          glide(damp.frequency, value, audio);
        } else if (id === "pre") {
          glide(preDelay.delayTime, value, audio);
        } else if (id === "mix") {
          blend.mix(Number(value));
        }
      },
      dispose() {
        clearTimeout(rebuild);
        disconnectAll(
          input,
          preDelay,
          convolver,
          damp,
          blend.dry,
          blend.wet,
          blend.out,
        );
      },
    };
  },
};
