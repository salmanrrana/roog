import { describe, expect, test } from "vitest";
import type { Note, Project } from "./schema";
import { collectEvents, patternLength, scopeLength, songLength } from "./schedule";
import { BAR_TICKS, STEP_TICKS } from "./timing";

const note = (tick: number, length = STEP_TICKS, pitch = 60): Note => ({
  id: `n${tick}-${pitch}`,
  tick,
  length,
  pitch,
  velocity: 1,
});
const track = (id: string, muted = false) => ({ id, name: id, muted });

/** Minimal project: channel "kick" with notes in pattern "p1" (one bar long). */
function project(notes: Note[], extra: Partial<Project> = {}): Project {
  return {
    version: 1,
    id: "test",
    name: "test",
    createdAt: 0,
    updatedAt: 0,
    bpm: 120,
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
    patterns: [{ id: "p1", name: "P1", color: "#fff", steps: 16, notes: { kick: notes } }],
    playlist: { tracks: [track("t1"), track("t2")], clips: [] },
    mixer: {
      master: { id: "master", name: "Master", volume: 1, pan: 0, muted: false, effects: [] },
      inserts: [],
    },
    ...extra,
  };
}

const pattern = { kind: "pattern", patternId: "p1" } as const;
const song = { kind: "song" } as const;
const ticks = (events: { tick: number }[]) => events.map((event) => event.tick);

describe("pattern length", () => {
  test("is the step grid, grown to whole bars by note starts (not ends)", () => {
    const p = project([note(0, BAR_TICKS * 3)]).patterns[0];
    expect(p && patternLength(p)).toBe(BAR_TICKS);
    const grown = project([note(BAR_TICKS + STEP_TICKS)]).patterns[0];
    expect(grown && patternLength(grown)).toBe(BAR_TICKS * 2);
  });
});

describe("pattern mode", () => {
  const four = project([0, 4, 8, 12].map((step) => note(step * STEP_TICKS)));

  test("returns notes starting inside the window", () => {
    expect(ticks(collectEvents(four, pattern, 0, STEP_TICKS * 5))).toEqual([0, STEP_TICKS * 4]);
  });

  test("loops forever with absolute transport ticks", () => {
    const events = collectEvents(four, pattern, BAR_TICKS - STEP_TICKS, BAR_TICKS + STEP_TICKS);
    expect(ticks(events)).toEqual([BAR_TICKS]);
    expect(ticks(collectEvents(four, pattern, BAR_TICKS * 5, BAR_TICKS * 5 + 1))).toEqual([
      BAR_TICKS * 5,
    ]);
  });

  test("back-to-back windows never drop or repeat a note", () => {
    const whole = collectEvents(four, pattern, 0, BAR_TICKS * 3);
    const pieces = [];
    for (let from = 0; from < BAR_TICKS * 3; from += 37.5) {
      pieces.push(...collectEvents(four, pattern, from, Math.min(from + 37.5, BAR_TICKS * 3)));
    }
    expect(ticks(pieces)).toEqual(ticks(whole));
    expect(whole).toHaveLength(12);
  });

  test("applies swing to off-beat 16ths", () => {
    const swung = project([note(STEP_TICKS)], { swing: 1 });
    expect(ticks(collectEvents(swung, pattern, 0, BAR_TICKS))).toEqual([STEP_TICKS * 1.5]);
  });

  test("skips notes of channels that no longer exist", () => {
    const orphan = project([note(0)]);
    orphan.channels = [];
    expect(collectEvents(orphan, pattern, 0, BAR_TICKS)).toEqual([]);
  });
});

describe("song mode", () => {
  const clip = (start: number, length: number, trackId = "t1") => ({
    id: `c${start}`,
    patternId: "p1",
    trackId,
    start,
    length,
  });

  test("a clip longer than its pattern repeats it, and notes are cut at the clip end", () => {
    const p = project([note(0, BAR_TICKS)], {
      playlist: { tracks: [track("t1")], clips: [clip(BAR_TICKS, BAR_TICKS * 1.5)] },
    });
    const events = collectEvents(p, song, 0, songLength(p));
    expect(ticks(events)).toEqual([BAR_TICKS, BAR_TICKS * 2]);
    expect(events.map((event) => event.length)).toEqual([BAR_TICKS, BAR_TICKS / 2]);
  });

  test("skips muted playlist tracks", () => {
    const p = project([note(0)], {
      playlist: {
        tracks: [track("t1"), track("t2", true)],
        clips: [clip(0, BAR_TICKS), clip(BAR_TICKS, BAR_TICKS, "t2")],
      },
    });
    expect(ticks(collectEvents(p, song, 0, BAR_TICKS * 2))).toEqual([0]);
  });

  test("loops at the end of the last clip, rounded up to a bar", () => {
    const p = project([note(0)], {
      playlist: { tracks: [track("t1")], clips: [clip(0, BAR_TICKS + STEP_TICKS)] },
    });
    expect(scopeLength(p, song)).toBe(BAR_TICKS * 2);
    expect(ticks(collectEvents(p, song, BAR_TICKS * 2, BAR_TICKS * 2 + 1))).toEqual([
      BAR_TICKS * 2,
    ]);
  });
});
