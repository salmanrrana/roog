import type { EffectDef } from "@/core/contracts";
import { compressor } from "./compressor";
import { delay } from "./delay";
import { drive } from "./drive";
import { eq } from "./eq";
import { filter } from "./filter";
import { reverb } from "./reverb";

/**
 * Mixer insert effect registry. To add one: write `defineEffect({...})` in its own
 * file and list it here. Keys are stored in projects, so never rename a key.
 * Modules here must be import-safe: no audio work at module scope.
 * The mixer's "add effect" menu lists them in this order.
 */
export const effects: Readonly<Record<string, EffectDef>> = {
  eq,
  filter,
  compressor,
  drive,
  delay,
  reverb,
};

/** Look up an effect; undefined for kinds this build doesn't know. */
export function getEffect(kind: string): EffectDef | undefined {
  return effects[kind];
}
