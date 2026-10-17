/**
 * Pure edit operations on a project. Each one mutates the project it is given, so
 * call them inside the store's `edit(draft => ...)` (Immer turns the mutation into
 * a new immutable project plus an undo step). They also work on a plain cloned
 * object, which is how tests use them.
 *
 * These are the cross-cutting edits several panels share. Panel-only edits
 * (quantize, transpose, clip slicing...) live next to their panel and build on these.
 */
import { getEffect } from "@/effects";
import { getInstrument } from "@/instruments";
import {
  type ChannelInit,
  MASTER_ID,
  createChannel,
  createMixerTrack,
  createPattern,
  createPlaylistTrack,
  createStepNote,
  nextColor,
} from "./defaults";
import { createId } from "./ids";
import { clampParam, defaultParams } from "./params";
import type { Channel, Clip, MixerTrack, Note, Pattern, PlaylistTrack, Project } from "./schema";
import { VOLUME_MAX } from "./schema";
import { MAX_BPM, MIN_BPM, STEP_TICKS } from "./timing";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * `base` if nobody uses it, else the first free "<stem> <n>" from n = 2, where the
 * stem is `base` without a trailing number: "Snare" → "Snare 2", "Snare 2" → "Snare 3".
 */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const names = new Set(taken);
  if (!names.has(base)) return base;
  const stem = base.replace(/ \d+$/, "");
  for (let n = 2; ; n += 1) {
    const name = `${stem} ${n}`;
    if (!names.has(name)) return name;
  }
}

// ---------------------------------------------------------------- lookups

export function findChannel(project: Project, id: string): Channel | undefined {
  return project.channels.find((channel) => channel.id === id);
}

export function findPattern(project: Project, id: string): Pattern | undefined {
  return project.patterns.find((pattern) => pattern.id === id);
}

/** Master or insert by id. */
export function findMixerTrack(project: Project, id: string): MixerTrack | undefined {
  return id === MASTER_ID
    ? project.mixer.master
    : project.mixer.inserts.find((track) => track.id === id);
}

/** A pattern's notes for one channel, creating the list if it is missing. */
function channelNotes(pattern: Pattern, channelId: string): Note[] {
  return (pattern.notes[channelId] ??= []);
}

function moveItem<T>(list: T[], index: number, delta: number): void {
  const target = clamp(index + delta, 0, list.length - 1);
  if (index < 0 || target === index) return;
  const [item] = list.splice(index, 1);
  if (item !== undefined) list.splice(target, 0, item);
}

// ---------------------------------------------------------------- project

export function setBpm(project: Project, bpm: number): void {
  if (Number.isFinite(bpm)) project.bpm = clamp(Math.round(bpm * 100) / 100, MIN_BPM, MAX_BPM);
}

export function setSwing(project: Project, swing: number): void {
  if (Number.isFinite(swing)) project.swing = clamp(swing, 0, 1);
}

export function renameProject(project: Project, name: string): void {
  project.name = name.trim() || project.name;
}

// ---------------------------------------------------------------- channels

export type ChannelPatch = Partial<
  Pick<Channel, "name" | "color" | "volume" | "pan" | "muted" | "mixerTrackId" | "sampleId">
>;

/**
 * Add a channel on its own new mixer insert (named after it). The name is made unique
 * ("Snare 2") and the color defaults to the first unused swatch. Returns the channel id.
 */
export function addChannel(project: Project, init: Omit<ChannelInit, "mixerTrackId">): string {
  const name = uniqueName(
    init.name,
    project.channels.map((channel) => channel.name),
  );
  const insert = createMixerTrack(name);
  const channel = createChannel({
    ...init,
    name,
    color: init.color ?? nextColor(project.channels.map((channel) => channel.color)),
    mixerTrackId: insert.id,
  });
  project.mixer.inserts.push(insert);
  project.channels.push(channel);
  return channel.id;
}

/** Remove a channel and its notes in every pattern. Its mixer insert stays (like FL). */
export function removeChannel(project: Project, channelId: string): void {
  project.channels = project.channels.filter((channel) => channel.id !== channelId);
  for (const pattern of project.patterns) delete pattern.notes[channelId];
}

/**
 * Patch a channel (volume and pan clamped). Renaming a channel also renames its own
 * insert: one only this channel feeds that still carries the channel's old name.
 * Shared or custom-named inserts keep their names.
 */
export function updateChannel(project: Project, channelId: string, patch: ChannelPatch): void {
  const channel = findChannel(project, channelId);
  if (!channel) return;
  const oldName = channel.name;
  Object.assign(channel, patch);
  if (patch.name !== undefined && patch.name !== oldName && channel.mixerTrackId !== MASTER_ID) {
    const insert = findMixerTrack(project, channel.mixerTrackId);
    const shared = project.channels.some(
      (other) => other.id !== channel.id && other.mixerTrackId === channel.mixerTrackId,
    );
    if (insert && !shared && insert.name === oldName) insert.name = patch.name;
  }
  channel.volume = clamp(channel.volume, 0, VOLUME_MAX);
  channel.pan = clamp(channel.pan, -1, 1);
  if (!findMixerTrack(project, channel.mixerTrackId)) channel.mixerTrackId = MASTER_ID;
}

/** Swap the instrument; params reset to the new instrument's defaults. */
export function setChannelInstrument(project: Project, channelId: string, kind: string): void {
  const channel = findChannel(project, channelId);
  if (!channel) return;
  channel.instrument = kind;
  channel.params = { ...defaultParams(getInstrument(kind).params) };
}

/** Set one instrument param (clamped to its spec; unknown keys are ignored). */
export function setChannelParam(
  project: Project,
  channelId: string,
  key: string,
  value: number,
): void {
  const channel = findChannel(project, channelId);
  const spec = channel ? getInstrument(channel.instrument).params[key] : undefined;
  if (channel && spec) channel.params[key] = clampParam(spec, value);
}

export function moveChannel(project: Project, channelId: string, delta: number): void {
  moveItem(
    project.channels,
    project.channels.findIndex((channel) => channel.id === channelId),
    delta,
  );
}

/** Copy a channel's settings (not its notes) right below it. Returns the new id. */
export function cloneChannel(project: Project, channelId: string): string | undefined {
  const index = project.channels.findIndex((channel) => channel.id === channelId);
  const source = project.channels[index];
  if (!source) return undefined;
  const copy: Channel = {
    ...source,
    id: createId(),
    name: uniqueName(
      source.name,
      project.channels.map((channel) => channel.name),
    ),
    params: { ...source.params },
    solo: false,
  };
  project.channels.splice(index + 1, 0, copy);
  return copy.id;
}

/** Solo one channel (the engine silences the rest); soloing it again clears solo. Mutes are untouched. */
export function toggleChannelSolo(project: Project, channelId: string): void {
  for (const channel of project.channels) channel.solo = channel.id === channelId && !channel.solo;
}

// ---------------------------------------------------------------- steps & notes

export type NotePatch = Partial<Omit<Note, "id">>;

/** True when a note starts exactly on `step` (any pitch): what the step grid shows as lit. */
export function hasStep(pattern: Pattern, channelId: string, step: number): boolean {
  return pattern.notes[channelId]?.some((note) => note.tick === step * STEP_TICKS) ?? false;
}

/** Light or clear one channel-rack step. Paint-drag decides `on` once at pointer down. */
export function setStep(
  project: Project,
  patternId: string,
  channelId: string,
  step: number,
  on: boolean,
): void {
  const pattern = findPattern(project, patternId);
  if (!pattern || step < 0) return;
  const tick = step * STEP_TICKS;
  if (on) {
    if (!hasStep(pattern, channelId, step))
      channelNotes(pattern, channelId).push(createStepNote(step));
  } else if (pattern.notes[channelId]) {
    pattern.notes[channelId] = pattern.notes[channelId].filter((note) => note.tick !== tick);
  }
}

export function addNotes(
  project: Project,
  patternId: string,
  channelId: string,
  notes: readonly Note[],
): void {
  const pattern = findPattern(project, patternId);
  if (pattern) channelNotes(pattern, channelId).push(...notes.map(sanitizeNote));
}

export function removeNotes(
  project: Project,
  patternId: string,
  channelId: string,
  ids: ReadonlySet<string>,
): void {
  const pattern = findPattern(project, patternId);
  const notes = pattern?.notes[channelId];
  if (pattern && notes) pattern.notes[channelId] = notes.filter((note) => !ids.has(note.id));
}

export function updateNotes(
  project: Project,
  patternId: string,
  channelId: string,
  changes: ReadonlyMap<string, NotePatch>,
): void {
  const notes = findPattern(project, patternId)?.notes[channelId];
  if (!notes) return;
  for (const note of notes) {
    const patch = changes.get(note.id);
    if (patch) Object.assign(note, sanitizeNote({ ...note, ...patch }));
  }
}

function sanitizeNote(note: Note): Note {
  return {
    id: note.id,
    tick: Math.max(0, Math.round(note.tick)),
    length: Math.max(1, Math.round(note.length)),
    pitch: clamp(Math.round(note.pitch), 0, 127),
    velocity: clamp(note.velocity, 0, 1),
  };
}

// ---------------------------------------------------------------- patterns

/** New empty pattern named "Pattern N" (unique) in the first unused swatch color. Returns its id. */
export function addPattern(project: Project): string {
  const pattern = createPattern(
    uniqueName(
      `Pattern ${project.patterns.length + 1}`,
      project.patterns.map((item) => item.name),
    ),
    nextColor(project.patterns.map((item) => item.color)),
  );
  project.patterns.push(pattern);
  return pattern.id;
}

/**
 * Duplicate a pattern (fresh note ids) right after it, with a unique name (the clone of
 * "Pattern 1" is the next free "Pattern N") and an unused color. Returns the new id.
 */
export function clonePattern(project: Project, patternId: string): string | undefined {
  const index = project.patterns.findIndex((pattern) => pattern.id === patternId);
  const source = project.patterns[index];
  if (!source) return undefined;
  const notes = Object.fromEntries(
    Object.entries(source.notes).map(([channelId, list]) => [
      channelId,
      list.map((note) => ({ ...note, id: createId() })),
    ]),
  );
  const copy: Pattern = {
    ...source,
    id: createId(),
    name: uniqueName(
      source.name,
      project.patterns.map((pattern) => pattern.name),
    ),
    color: nextColor(project.patterns.map((pattern) => pattern.color)),
    notes,
  };
  project.patterns.splice(index + 1, 0, copy);
  return copy.id;
}

/** Delete a pattern and its playlist clips. The last pattern can't be deleted. */
export function removePattern(project: Project, patternId: string): void {
  if (project.patterns.length <= 1) return;
  project.patterns = project.patterns.filter((pattern) => pattern.id !== patternId);
  project.playlist.clips = project.playlist.clips.filter((clip) => clip.patternId !== patternId);
}

export function updatePattern(
  project: Project,
  patternId: string,
  patch: Partial<Pick<Pattern, "name" | "color" | "steps">>,
): void {
  const pattern = findPattern(project, patternId);
  if (!pattern) return;
  Object.assign(pattern, patch);
  pattern.steps = clamp(Math.round(pattern.steps), 1, 256);
}

// ---------------------------------------------------------------- playlist

export function addClip(project: Project, clip: Omit<Clip, "id">): string {
  const id = createId();
  project.playlist.clips.push({ ...clip, id });
  return id;
}

export function updateClip(
  project: Project,
  clipId: string,
  patch: Partial<Omit<Clip, "id">>,
): void {
  const clip = project.playlist.clips.find((item) => item.id === clipId);
  if (!clip) return;
  Object.assign(clip, patch);
  clip.start = Math.max(0, Math.round(clip.start));
  clip.length = Math.max(1, Math.round(clip.length));
}

export function removeClips(project: Project, clipIds: ReadonlySet<string>): void {
  project.playlist.clips = project.playlist.clips.filter((clip) => !clipIds.has(clip.id));
}

export function addPlaylistTrack(project: Project): string {
  const track = createPlaylistTrack(`Track ${project.playlist.tracks.length + 1}`);
  project.playlist.tracks.push(track);
  return track.id;
}

/** Delete a playlist track and its clips. The last track can't be deleted. */
export function removePlaylistTrack(project: Project, trackId: string): void {
  if (project.playlist.tracks.length <= 1) return;
  project.playlist.tracks = project.playlist.tracks.filter((track) => track.id !== trackId);
  project.playlist.clips = project.playlist.clips.filter((clip) => clip.trackId !== trackId);
}

export function updatePlaylistTrack(
  project: Project,
  trackId: string,
  patch: Partial<Pick<PlaylistTrack, "name" | "muted">>,
): void {
  const track = project.playlist.tracks.find((item) => item.id === trackId);
  if (track) Object.assign(track, patch);
}

// ---------------------------------------------------------------- mixer

export function addInsert(
  project: Project,
  name = `Insert ${project.mixer.inserts.length + 1}`,
): string {
  const track = createMixerTrack(name);
  project.mixer.inserts.push(track);
  return track.id;
}

/** Delete an insert; channels routed to it fall back to the master. */
export function removeInsert(project: Project, trackId: string): void {
  project.mixer.inserts = project.mixer.inserts.filter((track) => track.id !== trackId);
  for (const channel of project.channels) {
    if (channel.mixerTrackId === trackId) channel.mixerTrackId = MASTER_ID;
  }
}

export function updateMixerTrack(
  project: Project,
  trackId: string,
  patch: Partial<Pick<MixerTrack, "name" | "volume" | "pan" | "muted">>,
): void {
  const track = findMixerTrack(project, trackId);
  if (!track) return;
  Object.assign(track, patch);
  track.volume = clamp(track.volume, 0, VOLUME_MAX);
  track.pan = clamp(track.pan, -1, 1);
}

/** Solo one insert (the engine silences the rest; never the master); again clears solo. Mutes are untouched. */
export function toggleInsertSolo(project: Project, trackId: string): void {
  for (const track of project.mixer.inserts) track.solo = track.id === trackId && !track.solo;
}

/** Append an effect with default params. Returns its slot id, or undefined for unknown kinds. */
export function addEffect(project: Project, trackId: string, kind: string): string | undefined {
  const track = findMixerTrack(project, trackId);
  const def = getEffect(kind);
  if (!track || !def) return undefined;
  const id = createId();
  track.effects.push({ id, kind, enabled: true, params: { ...defaultParams(def.params) } });
  return id;
}

export function removeEffect(project: Project, trackId: string, effectId: string): void {
  const track = findMixerTrack(project, trackId);
  if (track) track.effects = track.effects.filter((effect) => effect.id !== effectId);
}

export function setEffectEnabled(
  project: Project,
  trackId: string,
  effectId: string,
  enabled: boolean,
): void {
  const effect = findMixerTrack(project, trackId)?.effects.find((slot) => slot.id === effectId);
  if (effect) effect.enabled = enabled;
}

export function setEffectParam(
  project: Project,
  trackId: string,
  effectId: string,
  key: string,
  value: number,
): void {
  const effect = findMixerTrack(project, trackId)?.effects.find((slot) => slot.id === effectId);
  const spec = effect ? getEffect(effect.kind)?.params[key] : undefined;
  if (effect && spec) effect.params[key] = clampParam(spec, value);
}

export function moveEffect(
  project: Project,
  trackId: string,
  effectId: string,
  delta: number,
): void {
  const track = findMixerTrack(project, trackId);
  if (track)
    moveItem(
      track.effects,
      track.effects.findIndex((effect) => effect.id === effectId),
      delta,
    );
}
