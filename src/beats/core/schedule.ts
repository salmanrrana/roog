/**
 * The one scheduling function. Given a project, what is playing (a pattern loop or
 * the song) and a window of transport ticks, it returns every note that starts in
 * that window. The realtime engine calls it every ~25 ms with a small lookahead
 * window; WAV export calls it once for the whole song. Pure and allocation-light.
 */
import type { Pattern, Project } from "./schema";
import { BAR_TICKS, STEP_TICKS, ceilTo, swingTick } from "./timing";

export type PlaybackScope =
  { readonly kind: "pattern"; readonly patternId: string } | { readonly kind: "song" };

export interface NoteEvent {
  /** Absolute transport tick; fractional when swung. Transport tick 0 = play pressed. */
  readonly tick: number;
  /** Ticks. Cut at the clip's end in song mode. */
  readonly length: number;
  readonly channelId: string;
  readonly pitch: number;
  readonly velocity: number;
}

/**
 * Loop length of a pattern in ticks: its step grid, grown to whole bars when a note
 * starts past it. Uses note starts (not ends) so a long 808 tail on the last step
 * doesn't double the loop.
 */
export function patternLength(pattern: Pattern): number {
  let lastStart = -1;
  for (const notes of Object.values(pattern.notes)) {
    for (const note of notes) lastStart = Math.max(lastStart, note.tick);
  }
  return Math.max(pattern.steps * STEP_TICKS, ceilTo(lastStart + 1, BAR_TICKS));
}

/** End of the last clip, rounded up to a bar; at least one bar. */
export function songLength(project: Project): number {
  let end = 0;
  for (const clip of project.playlist.clips) end = Math.max(end, clip.start + clip.length);
  return Math.max(BAR_TICKS, ceilTo(end, BAR_TICKS));
}

/** How many ticks before the scope loops back to tick 0. */
export function scopeLength(project: Project, scope: PlaybackScope): number {
  if (scope.kind === "song") return songLength(project);
  const pattern = project.patterns.find((p) => p.id === scope.patternId);
  return pattern ? patternLength(pattern) : BAR_TICKS;
}

/**
 * Every note starting in transport ticks [from, to), looping the scope forever.
 * Consecutive windows never drop or repeat a note. Swing is applied here; channel
 * mute is not (the engine mutes at the strip so held notes cut off instantly), but
 * muted playlist tracks are skipped. Events come back sorted by tick.
 */
export function collectEvents(
  project: Project,
  scope: PlaybackScope,
  from: number,
  to: number,
): NoteEvent[] {
  const events: NoteEvent[] = [];
  if (to <= from) return events;

  const loop = scopeLength(project, scope);
  const live = new Set(project.channels.map((channel) => channel.id));
  const mutedTracks = new Set(
    project.playlist.tracks.filter((track) => track.muted).map((track) => track.id),
  );
  const patterns = new Map(project.patterns.map((pattern) => [pattern.id, pattern]));

  for (let k = Math.floor(from / loop); k * loop < to; k += 1) {
    const base = k * loop;
    const lo = from - base;
    const hi = to - base;

    if (scope.kind === "pattern") {
      const pattern = patterns.get(scope.patternId);
      if (pattern) {
        collectPattern(events, pattern, project.swing, live, {
          base,
          offset: 0,
          lo,
          hi,
          cut: Infinity,
        });
      }
      continue;
    }

    for (const clip of project.playlist.clips) {
      const clipEnd = clip.start + clip.length;
      const pattern = patterns.get(clip.patternId);
      if (!pattern || mutedTracks.has(clip.trackId) || clipEnd <= lo || clip.start >= hi) continue;

      // The pattern repeats inside a clip that is longer than it.
      const repeat = patternLength(pattern);
      const first = Math.max(0, Math.floor((lo - clip.start) / repeat));
      for (let r = first; clip.start + r * repeat < Math.min(hi, clipEnd); r += 1) {
        collectPattern(events, pattern, project.swing, live, {
          base,
          offset: clip.start + r * repeat,
          lo,
          hi: Math.min(hi, clipEnd),
          cut: clipEnd,
        });
      }
    }
  }

  return events.sort((a, b) => a.tick - b.tick);
}

interface Placement {
  /** Transport tick where this loop iteration starts. */
  readonly base: number;
  /** Loop-relative tick where the pattern's tick 0 lands. */
  readonly offset: number;
  /** Loop-relative window [lo, hi). */
  readonly lo: number;
  readonly hi: number;
  /** Loop-relative tick where notes are cut off (clip end). */
  readonly cut: number;
}

function collectPattern(
  out: NoteEvent[],
  pattern: Pattern,
  swing: number,
  live: ReadonlySet<string>,
  { base, offset, lo, hi, cut }: Placement,
): void {
  const length = patternLength(pattern);

  for (const [channelId, notes] of Object.entries(pattern.notes)) {
    if (!live.has(channelId)) continue;

    for (const note of notes) {
      // Swing can push a note past the pattern end in odd-length patterns; keep it inside.
      const at = offset + Math.min(swingTick(note.tick, swing), length - 1e-3);
      if (at < lo || at >= hi) continue;

      out.push({
        tick: base + at,
        length: Math.min(note.length, cut - at),
        channelId,
        pitch: note.pitch,
        velocity: note.velocity,
      });
    }
  }
}
