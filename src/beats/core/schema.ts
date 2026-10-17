import * as z from "zod/mini";
import { MAX_BPM, MIN_BPM } from "./timing";

/**
 * The saved project format: one zod schema, and every domain type is derived from
 * it, so the file format and the TypeScript types can never drift apart.
 * (zod/mini: ~7 KB gzipped, versus ~50 KB for ArkType, for a parse we run once per load.)
 *
 * Changing the format:
 * - New field: wrap it in a default (`z._default(z.number(), 0)`) so older saves
 *   still parse. No version bump needed.
 * - Rename/reshape: bump PROJECT_VERSION and add a step to `migrations` in migrate.ts.
 * - Instrument/effect params are NOT part of the schema shape; they are normalized
 *   against the registries on load (see normalizeParams), so adding a param is free.
 */
export const PROJECT_VERSION = 1;

/** Linear gain ceiling for channel and mixer volume (about +2 dB). */
export const VOLUME_MAX = 1.25;

const range = (min: number, max: number) => z.number().check(z.gte(min), z.lte(max));
const paramValues = z.record(z.string(), z.number());
const volume = range(0, VOLUME_MAX);
const pan = range(-1, 1);

/** A note in a pattern. `tick` is relative to the pattern start. */
export const noteSchema = z.object({
  id: z.string(),
  tick: z.number().check(z.gte(0)),
  length: z.number().check(z.gt(0)),
  pitch: z.int().check(z.gte(0), z.lte(127)),
  velocity: range(0, 1),
});

/** One row of the channel rack: an instrument plus its strip settings. */
export const channelSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  /** Instrument registry key (instruments/index.ts). */
  instrument: z.string(),
  params: paramValues,
  /** For sample-based instruments: "factory:kick" or "user:<sha256>". */
  sampleId: z.nullable(z.string()),
  volume,
  pan,
  muted: z.boolean(),
  /** Solo is kept apart from mute: while any channel is soloed, the others are silent. */
  solo: z._default(z.boolean(), false),
  /** Mixer track this channel feeds: MASTER_ID or an insert id. */
  mixerTrackId: z.string(),
});

/**
 * A reusable loop. Notes are stored per channel. A channel-rack step is simply a
 * note one step long, so the step grid and the piano roll edit the same data.
 */
export const patternSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  /** Length of the step grid; the pattern grows past it if notes start later. */
  steps: z.int().check(z.gte(1), z.lte(256)),
  notes: z.record(z.string(), z.array(noteSchema)),
});

/** A pattern placed on the playlist. Longer than its pattern = the pattern repeats. */
export const clipSchema = z.object({
  id: z.string(),
  patternId: z.string(),
  trackId: z.string(),
  start: z.int().check(z.gte(0)),
  length: z.int().check(z.gt(0)),
});

export const playlistTrackSchema = z.object({
  id: z.string(),
  name: z.string(),
  muted: z.boolean(),
});

/** One insert effect on a mixer track. `kind` is an effects registry key. */
export const effectSlotSchema = z.object({
  id: z.string(),
  kind: z.string(),
  enabled: z.boolean(),
  params: paramValues,
});

export const mixerTrackSchema = z.object({
  id: z.string(),
  name: z.string(),
  volume,
  pan,
  muted: z.boolean(),
  /** Solo is kept apart from mute: while any insert is soloed, the others are silent. */
  solo: z._default(z.boolean(), false),
  effects: z.array(effectSlotSchema),
});

export const projectSchema = z.object({
  version: z.int(),
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  bpm: range(MIN_BPM, MAX_BPM),
  /** Global swing for all pattern notes, 0..1 (see swingTick). */
  swing: range(0, 1),
  channels: z.array(channelSchema),
  patterns: z.array(patternSchema),
  playlist: z.object({
    tracks: z.array(playlistTrackSchema),
    clips: z.array(clipSchema),
  }),
  mixer: z.object({
    master: mixerTrackSchema,
    inserts: z.array(mixerTrackSchema),
  }),
});

export type Note = z.infer<typeof noteSchema>;
export type Channel = z.infer<typeof channelSchema>;
export type Pattern = z.infer<typeof patternSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type PlaylistTrack = z.infer<typeof playlistTrackSchema>;
export type EffectSlot = z.infer<typeof effectSlotSchema>;
export type MixerTrack = z.infer<typeof mixerTrackSchema>;
export type Project = z.infer<typeof projectSchema>;
