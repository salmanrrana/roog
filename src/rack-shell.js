import { portDirections, signalTypes } from "./module-framework.js";

export const rackConfig = {
  totalHp: 84,
  railHeight: "3U",
  powerRails: ["+12V", "GND", "-12V"]
};

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
        max: 1,
        step: 0.01,
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
  },
  {
    id: "blank-right",
    name: "VOID",
    kind: "blank",
    hp: 8,
    controls: ["future"],
    ports: []
  }
];
