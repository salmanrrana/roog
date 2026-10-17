import type { InstrumentDef } from "@/core/contracts";
import { sampler } from "./sampler";
import { synth } from "./synth";

/**
 * Instrument registry. To add one: write `defineInstrument({...})` in its own file
 * and list it here. Keys are stored in projects, so never rename a key.
 * Modules here must be import-safe: no audio work at module scope.
 */
export const instruments: Readonly<Record<string, InstrumentDef>> = { sampler, synth };

export const DEFAULT_INSTRUMENT = "sampler";

/** Look up an instrument; unknown kinds fall back to the sampler. */
export function getInstrument(kind: string): InstrumentDef {
  return instruments[kind] ?? sampler;
}
