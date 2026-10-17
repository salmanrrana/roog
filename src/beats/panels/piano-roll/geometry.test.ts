import { expect, test } from "vitest";
import type { Note } from "@/core/schema";
import { type RollView, noteAt, notesInRect, pitchName, pitchToY, yToPitch } from "./geometry";

const view: RollView = { scrollTick: 0, pxPerTick: 1, scrollY: 0, rowHeight: 10 };
const note = (id: string, tick: number, pitch: number, length = 48): Note => ({
  id,
  tick,
  length,
  pitch,
  velocity: 1,
});

test("rows map both ways and clamp to the keyboard", () => {
  const scrolled = { ...view, scrollY: 25 };
  expect(yToPitch(scrolled, pitchToY(scrolled, 60) + 5)).toBe(60);
  expect(yToPitch(view, -50)).toBe(127);
  expect(yToPitch(view, 99_999)).toBe(0);
});

test("hit-testing finds the topmost note and the resize handle", () => {
  const y = pitchToY(view, 60) + 5;
  const notes = [note("under", 0, 60), note("over", 24, 60)];
  expect(noteAt(notes, view, 30, y)?.note.id).toBe("over");
  expect(noteAt(notes, view, 10, y)).toEqual({ note: notes[0], zone: "body" });
  expect(noteAt(notes, view, 70, y)?.zone).toBe("end");
  expect(noteAt(notes, view, 80, y)).toBeNull();
  expect(noteAt(notes, view, 10, y + 10)).toBeNull();
});

test("marquee selects notes it overlaps, dragged in any direction", () => {
  const notes = [note("a", 0, 60), note("b", 100, 60), note("c", 0, 50)];
  const y = pitchToY(view, 60);
  expect(notesInRect(notes, view, { x0: 60, y0: y + 9, x1: 40, y1: y + 1 })).toEqual(
    new Set(["a"]),
  );
});

test("pitch names use FL octaves", () => {
  expect(pitchName(60)).toBe("C5");
  expect(pitchName(70)).toBe("A#5");
});
