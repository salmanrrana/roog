import { dirt, space, tape } from "./fx.js";
import { out, scope } from "./output.js";
import {
  clock,
  euclidModule,
  grid,
  keys,
  steps,
  turing,
} from "./sequencing.js";
import { env, lfo, lpg, mix, quant, vca, vcf } from "./shaping.js";
import { fold, kit, string, vco } from "./voices.js";

/** Every module the studio can build, in the order the "add module" menu lists them. */
export const catalog = [
  clock,
  steps,
  grid,
  euclidModule,
  turing,
  keys,
  vco,
  fold,
  string,
  kit,
  vcf,
  lpg,
  vca,
  env,
  lfo,
  quant,
  mix,
  dirt,
  tape,
  space,
  scope,
  out,
];

export const categoryLabels = {
  sequencer: "Sequence & play",
  source: "Sound sources",
  shaper: "Filters & amps",
  modulator: "Modulation",
  fx: "Effects",
  utility: "Mix, view & out",
};
