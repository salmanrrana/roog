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
    ports: []
  },
  {
    id: "vco-placeholder",
    name: "VCO",
    kind: "source",
    hp: 16,
    controls: ["freq", "shape", "fine"],
    ports: [
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
