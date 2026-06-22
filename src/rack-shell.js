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

export const placeholderModules = [
  {
    id: "blank-left",
    name: "BLANK",
    kind: "blank",
    hp: 8,
    controls: ["reserve"],
    ports: []
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
    id: "mod-placeholder",
    name: "MOD",
    kind: "modulator",
    hp: 12,
    controls: ["rate", "depth"],
    ports: [
      { label: "cv", type: "cv", direction: "output" },
      { label: "gate", type: "gate", direction: "output" }
    ]
  },
  {
    id: "output-placeholder",
    name: "OUT",
    kind: "output",
    hp: 10,
    controls: ["level"],
    ports: [
      { label: "left", type: "audio", direction: "input" },
      { label: "right", type: "audio", direction: "input" }
    ]
  },
  {
    id: "blank-right",
    name: "VOID",
    kind: "blank",
    hp: 14,
    controls: ["future"],
    ports: []
  }
];
