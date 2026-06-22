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
    id: "vcf-placeholder",
    name: "VCF",
    kind: "processor",
    hp: 14,
    controls: ["cutoff", "res"],
    ports: [
      { label: "audio", type: "audio", direction: "input" },
      { label: "audio", type: "audio", direction: "output" },
      { label: "cutoff", type: "cv", direction: "input" }
    ]
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
    hp: 24,
    controls: ["future"],
    ports: []
  }
];
