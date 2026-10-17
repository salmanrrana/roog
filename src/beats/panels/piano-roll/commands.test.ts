import { expect, test } from "vitest";
import type { Note } from "@/core/schema";
import { BAR_TICKS, STEP_TICKS } from "@/core/timing";
import { duplicateNotes, moveNotes, quantizeNotes, resizeNotes } from "./commands";

const note = (id: string, tick: number, pitch = 60, length = STEP_TICKS): Note => ({
  id,
  tick,
  length,
  pitch,
  velocity: 0.8,
});

test("moving a group clamps the shared delta so chords keep their shape", () => {
  const chord = [note("a", 24, 120), note("b", 48, 124)];
  const changes = moveNotes(chord, -100, 12);
  expect(changes.get("a")).toEqual({ tick: 0, pitch: 123 });
  expect(changes.get("b")).toEqual({ tick: 24, pitch: 127 });
});

test("resizing applies one delta to every note but never goes under the minimum", () => {
  const changes = resizeNotes([note("a", 0, 60, 48), note("b", 0, 60, 24)], -24, STEP_TICKS);
  expect(changes.get("a")).toEqual({ length: 24 });
  expect(changes.get("b")).toEqual({ length: STEP_TICKS });
});

test("quantize rounds starts to the grid and skips notes already on it", () => {
  const changes = quantizeNotes([note("a", 30), note("b", 40), note("c", 48)], STEP_TICKS);
  expect(changes.get("a")).toEqual({ tick: 24 });
  expect(changes.get("b")).toEqual({ tick: 48 });
  expect(changes.has("c")).toBe(false);
});

test("duplicate repeats a one-bar riff one bar later with fresh ids", () => {
  const riff = [note("a", 0), note("b", BAR_TICKS - STEP_TICKS)];
  const copies = duplicateNotes(riff);
  expect(copies.map((n) => n.tick)).toEqual([BAR_TICKS, 2 * BAR_TICKS - STEP_TICKS]);
  expect(copies.some((n) => n.id === "a" || n.id === "b")).toBe(false);
});

test("duplicate offset covers the beats the notes occupy", () => {
  // Starts mid-beat 2, ends inside beat 2: one beat later.
  expect(duplicateNotes([note("a", 100, 60, 10)]).map((n) => n.tick)).toEqual([196]);
});
