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

/** Saturated signal colors (PRODUCT.md: loud color only where it carries signal). */
export const PALETTE = [
  "#ff5a1f",
  "#ffb020",
  "#c8f02e",
  "#2ee6a6",
  "#2ec4ff",
  "#7a7cff",
  "#d65cff",
  "#ff4f8b",
] as const;

/** Pick the palette color for the n-th item. */
export function paletteColor(index: number): string {
  return PALETTE[index % PALETTE.length] ?? PALETTE[0];
}

export function createMixerTrack(name: string, id: string = createId()): MixerTrack {
  return { id, name, volume: 1, pan: 0, muted: false, effects: [] };
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
    color: init.color ?? PALETTE[0],
    instrument,
    params: { ...defaultParams(getInstrument(instrument).params) },
    sampleId: init.sampleId ?? null,
    volume: DEFAULT_CHANNEL_VOLUME,
    pan: 0,
    muted: false,
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
 * The project a first visit (or "New") opens: a small kit, each channel on its
 * own mixer insert, a starter beat in Pattern 1, and that pattern on the playlist.
 */
export function createProject(name = "Untitled beat", now = Date.now()): Project {
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
    if (sound.steps.length > 0)
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
      clips: firstTrack
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
