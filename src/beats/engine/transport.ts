/**
 * Pure transport math for the realtime scheduler: which notes to schedule in the
 * next lookahead window, at which audio times, and where the audible playhead is.
 * No Web Audio here, so it is unit-tested directly.
 *
 * Transport ticks count from play (tick 0 = first downbeat) and never jump. A
 * segment maps them to audio time (its anchor) and says what plays (its scope).
 * A BPM or scope change starts a new segment at the last scheduled tick, so notes
 * already handed to Web Audio stay put and the next window continues exactly where
 * the last one ended: nothing is skipped or played twice.
 */
import type { NoteTrigger, Playhead } from "@/core/contracts";
import { type PlaybackScope, collectEvents, scopeLength } from "@/core/schedule";
import type { Project } from "@/core/schema";
import {
  BAR_TICKS,
  type TransportAnchor,
  reanchor,
  tickAtTime,
  ticksToSeconds,
  timeAtTick,
} from "@/core/timing";

export interface Segment {
  readonly anchor: TransportAnchor;
  /** Transport tick where the scope's tick 0 sits. */
  readonly offset: number;
  readonly scope: PlaybackScope;
}

export interface Transport {
  current: Segment;
  /** Earlier segments, still needed by the playhead until their audio has played. */
  past: Segment[];
  /** Everything before this transport tick has been scheduled. */
  scheduledTo: number;
}

export type ScheduledNote = NoteTrigger & { readonly channelId: string };

/** Enough for many BPM changes inside one lookahead window. */
const MAX_PAST = 16;

/** A transport whose tick 0 plays at audio time `time`. */
export function startTransport(time: number, bpm: number, scope: PlaybackScope): Transport {
  return {
    current: { anchor: { time, tick: 0, bpm }, offset: 0, scope },
    past: [],
    scheduledTo: 0,
  };
}

const sameScope = (a: PlaybackScope, b: PlaybackScope) =>
  a.kind === b.kind && (a.kind === "song" || (b.kind === "pattern" && a.patternId === b.patternId));

/**
 * Advance the transport to audio time `horizon` and return the notes to schedule.
 * Picks up BPM and scope changes: a new scope starts from its top as if it had
 * begun on the current bar's downbeat, so the beat grid never shifts.
 */
export function scheduleUntil(
  transport: Transport,
  project: Project,
  scope: PlaybackScope,
  horizon: number,
): ScheduledNote[] {
  const { current, scheduledTo } = transport;
  const scopeChanged = !sameScope(current.scope, scope);
  if (scopeChanged || current.anchor.bpm !== project.bpm) {
    transport.past.push(current);
    if (transport.past.length > MAX_PAST) transport.past.shift();
    transport.current = {
      anchor: reanchor(current.anchor, scheduledTo, project.bpm),
      offset: scopeChanged ? Math.floor(scheduledTo / BAR_TICKS) * BAR_TICKS : current.offset,
      scope,
    };
  }

  const { anchor, offset } = transport.current;
  const to = tickAtTime(anchor, horizon);
  if (to <= scheduledTo) return [];
  transport.scheduledTo = to;

  return collectEvents(project, scope, scheduledTo - offset, to - offset).map((event) => ({
    channelId: event.channelId,
    time: timeAtTick(anchor, event.tick + offset),
    duration: ticksToSeconds(event.length, anchor.bpm),
    pitch: event.pitch,
    velocity: event.velocity,
  }));
}

/** Where the transport is at audio time `time` (already latency-corrected by the caller). */
export function playheadAt(transport: Transport, project: Project, time: number): Playhead {
  let segment = transport.past[0] ?? transport.current;
  for (const candidate of transport.past) if (candidate.anchor.time <= time) segment = candidate;
  if (transport.current.anchor.time <= time) segment = transport.current;

  const tick = Math.max(0, tickAtTime(segment.anchor, time) - segment.offset);
  return { tick: tick % scopeLength(project, segment.scope), scope: segment.scope };
}
