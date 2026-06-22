export const rackConfig = {
  totalHp: 84,
  railHeight: "3U",
  powerRails: ["+12V", "GND", "-12V"]
};

export const placeholderModules = [
  {
    id: "blank-left",
    name: "BLANK",
    kind: "blank",
    hp: 8,
    controls: ["reserve"],
    jacks: []
  },
  {
    id: "vco-placeholder",
    name: "VCO",
    kind: "source",
    hp: 16,
    controls: ["freq", "shape", "fine"],
    jacks: [
      { label: "1V/OCT", type: "cv", direction: "input" },
      { label: "audio", type: "audio", direction: "output" }
    ]
  },
  {
    id: "vcf-placeholder",
    name: "VCF",
    kind: "processor",
    hp: 14,
    controls: ["cutoff", "res"],
    jacks: [
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
    jacks: [
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
    jacks: [
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
    jacks: []
  }
];
