/** Factories for new domain objects, and the starter project a first visit opens. */
import { DEFAULT_INSTRUMENT, getInstrument } from "@/instruments";
import { createId } from "./ids";
import { defaultParams } from "./params";
import type { Channel, MixerTrack, Note, Pattern, PlaylistTrack, Project } from "./schema";
import { PROJECT_VERSION } from "./schema";
import { BAR_TICKS, STEP_TICKS } from "./timing";

export const MASTER_ID = "master";
/** Pitch a channel-rack step plays (C5 in FL naming = original sample pitch). */
export const ROOT_PITCH = 60;
export const DEFAULT_STEPS = 16;
export const DEFAULT_VELOCITY = 0.8;
export const DEFAULT_CHANNEL_VOLUME = 0.8;

export const DEFAULT_PROJECT_NAME = "Untitled beat";

/**
 * Identity colors for channels and patterns. Cool hues only: warm hues (hot, amber,
 * acid, rec) are reserved for UI state, so a channel color never reads as a signal.
 */
export const SWATCHES = [
  { name: "Sky", color: "#38bdf8" },
  { name: "Pink", color: "#f472b6" },
  { name: "Teal", color: "#2dd4bf" },
  { name: "Violet", color: "#a78bfa" },
  { name: "Ice", color: "#a5f3fc" },
  { name: "Magenta", color: "#e879f9" },
  { name: "Blue", color: "#6c8cff" },
  { name: "Purple", color: "#c77dff" },
] as const satisfies readonly { name: string; color: string }[];

/** Swatch colors in order. */
export const PALETTE: readonly string[] = SWATCHES.map((swatch) => swatch.color);

/** Pick the palette color for the n-th item. */
export function paletteColor(index: number): string {
  return PALETTE[index % PALETTE.length] ?? SWATCHES[0].color;
}

/** First swatch color not in `used`; once all are taken, cycles by count. */
export function nextColor(used: readonly string[]): string {
  return PALETTE.find((color) => !used.includes(color)) ?? paletteColor(used.length);
}

export function createMixerTrack(name: string, id: string = createId()): MixerTrack {
  return { id, name, volume: 1, pan: 0, muted: false, solo: false, effects: [] };
}

export function createPlaylistTrack(name: string): PlaylistTrack {
  return { id: createId(), name, muted: false };
}

export interface ChannelInit {
  name: string;
  mixerTrackId: string;
  instrument?: string;
  sampleId?: string | null;
  color?: string;
}

/** A channel with the instrument's default params. Does not touch the mixer. */
export function createChannel(init: ChannelInit): Channel {
  const instrument = init.instrument ?? DEFAULT_INSTRUMENT;
  return {
    id: createId(),
    name: init.name,
    color: init.color ?? paletteColor(0),
    instrument,
    params: { ...defaultParams(getInstrument(instrument).params) },
    sampleId: init.sampleId ?? null,
    volume: DEFAULT_CHANNEL_VOLUME,
    pan: 0,
    muted: false,
    solo: false,
    mixerTrackId: init.mixerTrackId,
  };
}

export function createPattern(name: string, color: string): Pattern {
  return { id: createId(), name, color, steps: DEFAULT_STEPS, notes: {} };
}

/** A one-step note at `step`, as the channel rack writes it. */
export function createStepNote(
  step: number,
  pitch = ROOT_PITCH,
  velocity = DEFAULT_VELOCITY,
): Note {
  return { id: createId(), tick: step * STEP_TICKS, length: STEP_TICKS, pitch, velocity };
}

const STARTER_KIT = [
  { name: "Kick", sampleId: "factory:kick", steps: [0, 4, 8, 12] },
  { name: "Clap", sampleId: "factory:clap", steps: [4, 12] },
  { name: "Hat", sampleId: "factory:hat", steps: [0, 2, 4, 6, 8, 10, 12, 14] },
  { name: "Snare", sampleId: "factory:snare", steps: [] },
  { name: "Open Hat", sampleId: "factory:openhat", steps: [14] },
  { name: "808", sampleId: "factory:808", steps: [] },
] as const;

/**
 * A new project: a small kit, each channel on its own mixer insert, and Pattern 1.
 * "demo" (first visit, "New from demo beat") adds a starter beat and puts it on the
 * playlist; "blank" ("New project") has the same kit with no notes and no clips.
 */
export function createProject(
  name = DEFAULT_PROJECT_NAME,
  now = Date.now(),
  kind: "demo" | "blank" = "demo",
): Project {
  const inserts: MixerTrack[] = [];
  const channels: Channel[] = [];
  const pattern = createPattern("Pattern 1", paletteColor(0));

  STARTER_KIT.forEach((sound, index) => {
    const insert = createMixerTrack(sound.name);
    const channel = createChannel({
      name: sound.name,
      sampleId: sound.sampleId,
      mixerTrackId: insert.id,
      color: paletteColor(index),
    });
    inserts.push(insert);
    channels.push(channel);
    if (kind === "demo" && sound.steps.length > 0)
      pattern.notes[channel.id] = sound.steps.map((step) => createStepNote(step));
  });

  const tracks = Array.from({ length: 8 }, (_, index) => createPlaylistTrack(`Track ${index + 1}`));
  const firstTrack = tracks[0];

  return {
    version: PROJECT_VERSION,
    id: createId(),
    name,
    createdAt: now,
    updatedAt: now,
    bpm: 128,
    swing: 0,
    channels,
    patterns: [pattern],
    playlist: {
      tracks,
      clips:
        kind === "demo" && firstTrack
          ? [
              {
                id: createId(),
                patternId: pattern.id,
                trackId: firstTrack.id,
                start: 0,
                length: BAR_TICKS * 4,
              },
            ]
          : [],
    },
    mixer: { master: createMixerTrack("Master", MASTER_ID), inserts },
  };
}
