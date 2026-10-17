/**
 * The only way untrusted data (an IndexedDB row, an imported file) becomes a
 * Project: migrate old versions forward, validate the shape, then normalize
 * against the current instrument/effect registries and fix dangling references.
 */
import * as z from "zod/mini";
import { getEffect } from "@/effects";
import { DEFAULT_INSTRUMENT, instruments } from "@/instruments";
import { MASTER_ID, createPattern, paletteColor } from "./defaults";
import { normalizeParams } from "./params";
import { PROJECT_VERSION, type Project, projectSchema } from "./schema";

export type ParseResult =
  { readonly ok: true; readonly project: Project } | { readonly ok: false; readonly error: string };

type Json = Record<string, unknown>;

/**
 * migrations[n] upgrades a version-n project to version n+1. Add one whenever
 * PROJECT_VERSION is bumped; never edit an old step. Return a new object.
 */
const migrations: Readonly<Record<number, (project: Json) => Json>> = {};

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate and upgrade any stored or imported project. Never throws. */
export function parseProject(raw: unknown): ParseResult {
  if (!isRecord(raw)) return { ok: false, error: "Not a project." };

  let data = raw;
  let version = data.version;
  if (typeof version !== "number" || !Number.isInteger(version))
    return { ok: false, error: "Missing project version." };
  if (version > PROJECT_VERSION)
    return { ok: false, error: "This project was made by a newer version of ROOG Beats." };

  while (version < PROJECT_VERSION) {
    const step = migrations[version];
    if (!step) return { ok: false, error: `Can't upgrade projects from version ${version}.` };
    version += 1;
    data = { ...step(data), version };
  }

  // zod builds fresh objects, so normalizing the result never touches `raw`.
  const result = projectSchema.safeParse(data);
  if (!result.success) return { ok: false, error: z.prettifyError(result.error) };
  return { ok: true, project: normalizeProject(result.data) };
}

/**
 * Bring a schema-valid project in line with this build: unknown instruments fall
 * back to the default, unknown effects are dropped, params are filled/clamped,
 * and references to deleted channels, patterns, tracks or inserts are repaired.
 * Mutates and returns `project` (parseProject hands it a private copy).
 */
export function normalizeProject(project: Project): Project {
  project.mixer.master.id = MASTER_ID;
  const mixerIds = new Set([MASTER_ID, ...project.mixer.inserts.map((track) => track.id)]);

  for (const channel of project.channels) {
    if (!(channel.instrument in instruments)) {
      channel.instrument = DEFAULT_INSTRUMENT;
      channel.params = {};
    }
    const def = instruments[channel.instrument];
    if (def) channel.params = normalizeParams(def.params, channel.params);
    if (!mixerIds.has(channel.mixerTrackId)) channel.mixerTrackId = MASTER_ID;
  }

  for (const track of [project.mixer.master, ...project.mixer.inserts]) {
    track.effects = track.effects.flatMap((slot) => {
      const def = getEffect(slot.kind);
      return def ? [{ ...slot, params: normalizeParams(def.params, slot.params) }] : [];
    });
  }

  const channelIds = new Set(project.channels.map((channel) => channel.id));
  for (const pattern of project.patterns) {
    for (const channelId of Object.keys(pattern.notes)) {
      if (!channelIds.has(channelId)) delete pattern.notes[channelId];
    }
  }
  if (project.patterns.length === 0)
    project.patterns.push(createPattern("Pattern 1", paletteColor(0)));

  const patternIds = new Set(project.patterns.map((pattern) => pattern.id));
  const trackIds = new Set(project.playlist.tracks.map((track) => track.id));
  project.playlist.clips = project.playlist.clips.filter(
    (clip) => patternIds.has(clip.patternId) && trackIds.has(clip.trackId),
  );

  return project;
}
