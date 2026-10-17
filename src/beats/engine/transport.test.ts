import { describe, expect, test } from "vitest";
import type { Note, Pattern, Project } from "@/core/schema";
import { BAR_TICKS, STEP_TICKS, ticksToSeconds } from "@/core/timing";
import { type ScheduledNote, playheadAt, scheduleUntil, startTransport } from "./transport";

const note = (step: number, pitch = 60): Note => ({
  id: `n${step}-${pitch}`,
  tick: step * STEP_TICKS,
  length: STEP_TICKS,
  pitch,
  velocity: 1,
});

const pattern = (id: string, notes: Note[]): Pattern => ({
  id,
  name: id,
  color: "#fff",
  steps: 16,
  notes: { kick: notes },
});

/** One channel; p1 has a note on every step, p2 only on the downbeat (pitch 72). */
function project(bpm = 120): Project {
  return {
    version: 1,
    id: "test",
    name: "test",
    createdAt: 0,
    updatedAt: 0,
    bpm,
    swing: 0,
    channels: [
      {
        id: "kick",
        name: "Kick",
        color: "#fff",
        instrument: "sampler",
        params: {},
        sampleId: null,
        volume: 1,
        pan: 0,
        muted: false,
        mixerTrackId: "master",
      },
    ],
    patterns: [
      pattern(
        "p1",
        Array.from({ length: 16 }, (_, step) => note(step)),
      ),
      pattern("p2", [note(0, 72)]),
    ],
    playlist: { tracks: [], clips: [] },
    mixer: {
      master: { id: "master", name: "Master", volume: 1, pan: 0, muted: false, effects: [] },
      inserts: [],
    },
  };
}

const p1 = { kind: "pattern", patternId: "p1" } as const;
const p2 = { kind: "pattern", patternId: "p2" } as const;

/** Pump the scheduler like the clock does: every 25 ms with 100 ms lookahead. */
function pump(
  transport: ReturnType<typeof startTransport>,
  from: number,
  to: number,
  at: (now: number) => { project: Project; scope: typeof p1 | typeof p2 },
): ScheduledNote[] {
  const out: ScheduledNote[] = [];
  for (let now = from; now < to; now += 0.025) {
    const { project, scope } = at(now);
    out.push(...scheduleUntil(transport, project, scope, now + 0.1));
  }
  return out;
}

const step120 = ticksToSeconds(STEP_TICKS, 120);

describe("scheduleUntil", () => {
  test("schedules every step exactly once, on time, across loops", () => {
    const transport = startTransport(1, 120, p1);
    const notes = pump(transport, 1, 1 + step120 * 40, () => ({ project: project(), scope: p1 }));
    const times = notes.map((n) => n.time);
    expect(notes.length).toBeGreaterThanOrEqual(40);
    times.forEach((time, i) => expect(time).toBeCloseTo(1 + i * step120, 9));
    expect(notes[0]?.duration).toBeCloseTo(step120, 9);
  });

  test("a BPM change mid-play neither skips nor doubles a note", () => {
    const transport = startTransport(0, 120, p1);
    const notes = pump(transport, 0, 4, (now) => ({
      project: project(now < 1.013 ? 120 : 150),
      scope: p1,
    }));
    const gaps = notes.slice(1).map((n, i) => n.time - (notes[i]?.time ?? 0));
    const fast = ticksToSeconds(STEP_TICKS, 150);
    // Every gap is one step at the old tempo, the new one, or (across the change) in
    // between: no zero gaps (doubles) and no double gaps (skips).
    for (const gap of gaps) {
      expect(gap).toBeGreaterThan(fast - 1e-9);
      expect(gap).toBeLessThan(step120 + 1e-9);
    }
    expect(gaps.some((gap) => Math.abs(gap - fast) < 1e-9)).toBe(true);
  });

  test("a pattern switch starts the new pattern from its top on the current bar's grid", () => {
    const transport = startTransport(0, 120, p1);
    const bar = ticksToSeconds(BAR_TICKS, 120);
    // Switch to p2 halfway through the second bar.
    const notes = pump(transport, 0, bar * 4, (now) => ({
      project: project(),
      scope: now < bar * 1.5 ? p1 : p2,
    }));
    const p2Times = notes.filter((n) => n.pitch === 72).map((n) => n.time);
    // Bar 2's downbeat is already gone, so p2 first sounds on bar 3 and loops each bar.
    expect(p2Times[0]).toBeCloseTo(bar * 2, 9);
    expect(p2Times[1]).toBeCloseTo(bar * 3, 9);
    expect(notes.filter((n) => n.pitch === 60).every((n) => n.time < bar * 1.5 + 0.1)).toBe(true);
  });
});

describe("playheadAt", () => {
  test("keeps the old tempo until the change is audible, and loops the scope", () => {
    const transport = startTransport(0, 120, p1);
    scheduleUntil(transport, project(120), p1, 1);
    scheduleUntil(transport, project(240), p1, 1.1);
    // The change takes effect at t=1 (tick 192); just before it, the old tempo applies.
    expect(playheadAt(transport, project(240), 0.5).tick).toBeCloseTo(96, 6);
    expect(playheadAt(transport, project(240), 1.25).tick).toBeCloseTo(192 + 96, 6);
    expect(playheadAt(transport, project(240), 1.5).tick).toBeCloseTo((192 + 192) % BAR_TICKS, 6);
  });

  test("is 0 before the first downbeat", () => {
    const transport = startTransport(2, 120, p1);
    expect(playheadAt(transport, project(), 1.9).tick).toBe(0);
  });
});
