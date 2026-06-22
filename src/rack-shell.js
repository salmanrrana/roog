import { portDirections, signalTypes } from "./module-framework.js";

export const rackConfig = {
  totalHp: 112,
  railHeight: "3U",
  powerRails: ["+12V", "GND", "-12V"]
};

/** Build a hard, asymmetric clipping curve for the fuzz waveshaper. */
export function makeFuzzCurve(amount) {
  const samples = 1024;
  const curve = new Float32Array(samples);
  const k = Math.max(1, amount);

  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }

  return curve;
}

function createVcoAudioNodes(audioContext) {
  const oscillator = audioContext.createOscillator();
  const output = audioContext.createGain();

  oscillator.type = "sawtooth";
  oscillator.frequency.value = 220;
  oscillator.detune.value = 0;
  output.gain.value = 0.18;
  oscillator.connect(output);
  oscillator.start();

  return {
    oscillator,
    pitch: oscillator.frequency,
    output
  };
}

function createVcfAudioNodes(audioContext) {
  const filter = audioContext.createBiquadFilter();
  const output = audioContext.createGain();

  filter.type = "lowpass";
  filter.frequency.value = 1200;
  filter.Q.value = 1;
  output.gain.value = 1;
  filter.connect(output);

  return {
    input: filter,
    cutoff: filter.frequency,
    resonance: filter.Q,
    output
  };
}

function createVcaAudioNodes(audioContext) {
  const amplifier = audioContext.createGain();

  amplifier.gain.value = 0.75;

  return {
    input: amplifier,
    amplitude: amplifier.gain,
    output: amplifier
  };
}

function createLfoAudioNodes(audioContext) {
  const oscillator = audioContext.createOscillator();
  const depth = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 2;
  depth.gain.value = 1;
  oscillator.connect(depth);
  oscillator.start();

  return {
    oscillator,
    rate: oscillator.frequency,
    depth: depth.gain,
    output: depth
  };
}

function createEnvelopeAudioNodes(audioContext) {
  const source = audioContext.createConstantSource();
  const output = audioContext.createGain();

  source.offset.value = 1;
  output.gain.value = 0;
  source.connect(output);
  source.start();

  return {
    source,
    envelope: output.gain,
    gate: output.gain,
    attack: { value: 0.05 },
    decay: { value: 0.2 },
    sustain: { value: 0.6 },
    release: { value: 0.4 },
    output
  };
}

function createNoiseAudioNodes(audioContext) {
  const output = audioContext.createGain();
  const color = audioContext.createBiquadFilter();
  const bufferSize = 2 * audioContext.sampleRate;
  const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const channel = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i += 1) {
    channel[i] = Math.random() * 2 - 1;
  }

  const source = audioContext.createBufferSource();

  source.buffer = buffer;
  source.loop = true;
  color.type = "lowpass";
  color.frequency.value = 6000;
  output.gain.value = 0.35;
  source.connect(color);
  color.connect(output);
  source.start();

  return {
    source,
    color: color.frequency,
    level: output.gain,
    output
  };
}

function createDriveAudioNodes(audioContext) {
  const input = audioContext.createGain();
  const shaper = audioContext.createWaveShaper();
  const tone = audioContext.createBiquadFilter();
  const output = audioContext.createGain();

  input.gain.value = 6;
  shaper.curve = makeFuzzCurve(6);
  shaper.oversample = "4x";
  tone.type = "lowpass";
  tone.frequency.value = 3200;
  output.gain.value = 0.7;
  input.connect(shaper);
  shaper.connect(tone);
  tone.connect(output);

  return {
    input,
    drive: input.gain,
    shaper,
    tone: tone.frequency,
    level: output.gain,
    output
  };
}

function createSpaceAudioNodes(audioContext) {
  const input = audioContext.createGain();
  const dry = audioContext.createGain();
  const delay = audioContext.createDelay(2);
  const feedback = audioContext.createGain();
  const wet = audioContext.createGain();
  const output = audioContext.createGain();

  dry.gain.value = 0.85;
  delay.delayTime.value = 0.32;
  feedback.gain.value = 0.42;
  wet.gain.value = 0.55;
  output.gain.value = 0.9;
  input.connect(dry);
  dry.connect(output);
  input.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  wet.connect(output);

  return {
    input,
    time: delay.delayTime,
    feedback: feedback.gain,
    mix: wet.gain,
    output
  };
}

function createMixAudioNodes(audioContext) {
  const a = audioContext.createGain();
  const b = audioContext.createGain();
  const output = audioContext.createGain();

  a.gain.value = 0.7;
  b.gain.value = 0.7;
  output.gain.value = 0.9;
  a.connect(output);
  b.connect(output);

  return {
    a,
    b,
    levelA: a.gain,
    levelB: b.gain,
    output
  };
}

function createAudioInputNodes(audioContext) {
  const output = audioContext.createGain();
  let source = null;
  let mediaStream = null;

  output.gain.value = 0.85;

  return {
    output,
    level: output.gain,
    get mediaStream() {
      return mediaStream;
    },
    async activate(mediaDevices = globalThis.navigator?.mediaDevices) {
      if (source) {
        return mediaStream;
      }

      if (!mediaDevices?.getUserMedia || !audioContext.createMediaStreamSource) {
        throw new Error("Microphone input is unavailable in this browser");
      }

      mediaStream = await mediaDevices.getUserMedia({ audio: true });
      source = audioContext.createMediaStreamSource(mediaStream);
      source.connect(output);
      return mediaStream;
    },
    stop() {
      source?.disconnect(output);
      source = null;
      mediaStream?.getTracks?.().forEach((track) => track.stop());
      mediaStream = null;
    }
  };
}

function createOutputAudioNodes(audioContext) {
  const left = audioContext.createGain();
  const right = audioContext.createGain();

  left.gain.value = 0.8;
  right.gain.value = 0.8;

  if (audioContext.destination) {
    left.connect(audioContext.destination);
    right.connect(audioContext.destination);
  }

  return {
    left,
    right
  };
}

export const placeholderModules = [
  {
    id: "roog-audio-input",
    name: "MIC IN",
    kind: "source",
    hp: 8,
    controls: [
      {
        id: "arm",
        label: "mic",
        type: "button",
        value: "arm"
      },
      {
        id: "level",
        label: "gain",
        type: "range",
        min: 0,
        max: 1.5,
        step: 0.01,
        value: 0.85
      }
    ],
    ports: [
      { label: "audio", type: signalTypes.audio, direction: portDirections.output, node: "output" }
    ],
    createAudioNodes: createAudioInputNodes
  },
  {
    id: "roog-vco",
    name: "VCO",
    kind: "source",
    hp: 16,
    controls: [
      {
        id: "frequency",
        label: "freq",
        type: "range",
        min: 32,
        max: 2000,
        step: 1,
        value: 220
      },
      {
        id: "waveform",
        label: "shape",
        type: "select",
        options: ["sine", "square", "sawtooth", "triangle"],
        value: "sawtooth"
      },
      {
        id: "detune",
        label: "fine",
        type: "range",
        min: -1200,
        max: 1200,
        step: 1,
        value: 0
      }
    ],
    ports: [
      { label: "1V/OCT", type: signalTypes.cv, direction: portDirections.input, node: "pitch" },
      { label: "audio", type: signalTypes.audio, direction: portDirections.output, node: "output" }
    ],
    createAudioNodes: createVcoAudioNodes
  },
  {
    id: "roog-noise",
    name: "NOISE",
    kind: "source",
    hp: 6,
    controls: [
      {
        id: "color",
        label: "color",
        type: "range",
        min: 200,
        max: 12000,
        step: 1,
        value: 6000
      },
      {
        id: "level",
        label: "level",
        type: "range",
        min: 0,
        max: 1,
        step: 0.01,
        value: 0.35
      }
    ],
    ports: [
      { label: "noise", type: signalTypes.audio, direction: portDirections.output, node: "output" }
    ],
    createAudioNodes: createNoiseAudioNodes
  },
  {
    id: "roog-vcf",
    name: "VCF",
    kind: "processor",
    hp: 14,
    controls: [
      {
        id: "cutoff",
        label: "cutoff",
        type: "range",
        min: 80,
        max: 8000,
        step: 1,
        value: 1200
      },
      {
        id: "resonance",
        label: "res",
        type: "range",
        min: 0.1,
        max: 20,
        step: 0.1,
        value: 1
      }
    ],
    ports: [
      { label: "audio", type: signalTypes.audio, direction: portDirections.input, node: "input" },
      { label: "audio", type: signalTypes.audio, direction: portDirections.output, node: "output" },
      { label: "cutoff", type: signalTypes.cv, direction: portDirections.input, node: "cutoff" }
    ],
    createAudioNodes: createVcfAudioNodes
  },
  {
    id: "roog-drive",
    name: "FANG",
    kind: "processor",
    hp: 8,
    controls: [
      {
        id: "drive",
        label: "fuzz",
        type: "range",
        min: 1,
        max: 60,
        step: 0.5,
        value: 6
      },
      {
        id: "tone",
        label: "tone",
        type: "range",
        min: 400,
        max: 9000,
        step: 1,
        value: 3200
      },
      {
        id: "level",
        label: "level",
        type: "range",
        min: 0,
        max: 1.2,
        step: 0.01,
        value: 0.7
      }
    ],
    ports: [
      { label: "audio", type: signalTypes.audio, direction: portDirections.input, node: "input" },
      { label: "audio", type: signalTypes.audio, direction: portDirections.output, node: "output" },
      { label: "fuzz", type: signalTypes.cv, direction: portDirections.input, node: "drive" }
    ],
    createAudioNodes: createDriveAudioNodes
  },
  {
    id: "roog-vca",
    name: "VCA",
    kind: "processor",
    hp: 10,
    controls: [
      {
        id: "level",
        label: "level",
        type: "range",
        min: 0,
        max: 1,
        step: 0.01,
        value: 0.75
      }
    ],
    ports: [
      { label: "audio", type: signalTypes.audio, direction: portDirections.input, node: "input" },
      { label: "audio", type: signalTypes.audio, direction: portDirections.output, node: "output" },
      { label: "amp", type: signalTypes.cv, direction: portDirections.input, node: "amplitude" }
    ],
    createAudioNodes: createVcaAudioNodes
  },
  {
    id: "roog-space",
    name: "SPACE",
    kind: "processor",
    hp: 14,
    controls: [
      {
        id: "time",
        label: "time",
        type: "range",
        min: 0.02,
        max: 1.5,
        step: 0.01,
        value: 0.32
      },
      {
        id: "feedback",
        label: "regen",
        type: "range",
        min: 0,
        max: 0.95,
        step: 0.01,
        value: 0.42
      },
      {
        id: "mix",
        label: "mix",
        type: "range",
        min: 0,
        max: 1,
        step: 0.01,
        value: 0.55
      }
    ],
    ports: [
      { label: "audio", type: signalTypes.audio, direction: portDirections.input, node: "input" },
      { label: "audio", type: signalTypes.audio, direction: portDirections.output, node: "output" },
      { label: "time", type: signalTypes.cv, direction: portDirections.input, node: "time" }
    ],
    createAudioNodes: createSpaceAudioNodes
  },
  {
    id: "roog-lfo",
    name: "LFO",
    kind: "modulator",
    hp: 8,
    controls: [
      {
        id: "rate",
        label: "rate",
        type: "range",
        min: 0.05,
        max: 20,
        step: 0.05,
        value: 2
      },
      {
        id: "waveform",
        label: "shape",
        type: "select",
        options: ["sine", "square", "sawtooth", "triangle"],
        value: "sine"
      },
      {
        id: "depth",
        label: "depth",
        type: "range",
        min: 0,
        max: 2000,
        step: 1,
        value: 1
      }
    ],
    ports: [
      { label: "cv", type: signalTypes.cv, direction: portDirections.output, node: "output" }
    ],
    createAudioNodes: createLfoAudioNodes
  },
  {
    id: "roog-envelope",
    name: "ENV",
    kind: "modulator",
    hp: 10,
    controls: [
      {
        id: "trigger",
        label: "gate",
        type: "button",
        value: "trig"
      },
      {
        id: "attack",
        label: "atk",
        type: "range",
        min: 0.01,
        max: 2,
        step: 0.01,
        value: 0.05
      },
      {
        id: "decay",
        label: "dec",
        type: "range",
        min: 0.01,
        max: 2,
        step: 0.01,
        value: 0.2
      },
      {
        id: "sustain",
        label: "sus",
        type: "range",
        min: 0,
        max: 1,
        step: 0.01,
        value: 0.6
      },
      {
        id: "release",
        label: "rel",
        type: "range",
        min: 0.01,
        max: 3,
        step: 0.01,
        value: 0.4
      }
    ],
    ports: [
      { label: "gate", type: signalTypes.gate, direction: portDirections.input, node: "gate" },
      { label: "cv", type: signalTypes.cv, direction: portDirections.output, node: "output" }
    ],
    createAudioNodes: createEnvelopeAudioNodes
  },
  {
    id: "roog-mix",
    name: "MIX",
    kind: "utility",
    hp: 8,
    controls: [
      {
        id: "levelA",
        label: "ch a",
        type: "range",
        min: 0,
        max: 1.2,
        step: 0.01,
        value: 0.7
      },
      {
        id: "levelB",
        label: "ch b",
        type: "range",
        min: 0,
        max: 1.2,
        step: 0.01,
        value: 0.7
      }
    ],
    ports: [
      { label: "a", type: signalTypes.audio, direction: portDirections.input, node: "a" },
      { label: "b", type: signalTypes.audio, direction: portDirections.input, node: "b" },
      { label: "sum", type: signalTypes.audio, direction: portDirections.output, node: "output" }
    ],
    createAudioNodes: createMixAudioNodes
  },
  {
    id: "output-placeholder",
    name: "OUT",
    kind: "output",
    hp: 10,
    controls: ["level"],
    ports: [
      { label: "left", type: "audio", direction: "input", node: "left" },
      { label: "right", type: "audio", direction: "input", node: "right" }
    ],
    createAudioNodes: createOutputAudioNodes
  }
];
