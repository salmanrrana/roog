/**
 * Sample ids say where the audio lives. Factory sounds are synthesized at startup
 * (see sounds/factory.ts); user samples are imported files stored in IndexedDB and
 * keyed by content hash, so importing the same file twice reuses one entry.
 */
export const FACTORY_PREFIX = "factory:";
export const USER_PREFIX = "user:";

export type SampleSource = "factory" | "user";

export function sampleSource(sampleId: string): SampleSource | null {
  if (sampleId.startsWith(FACTORY_PREFIX)) return "factory";
  if (sampleId.startsWith(USER_PREFIX)) return "user";
  return null;
}
