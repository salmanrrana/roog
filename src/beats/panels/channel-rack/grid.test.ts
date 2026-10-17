import { describe, expect, test } from "vitest";
import { createStepNote } from "@/core/defaults";
import { STEP_TICKS } from "@/core/timing";
import { CELL_W, ROW_H, cellAt, isStepsOnly, litSteps, rowAt, stepsBetween } from "./grid";

describe("cellAt", () => {
  const grid = { rows: 3, steps: 16 };

  test("maps a point to its row and step", () => {
    expect(cellAt(CELL_W * 2 + 1, ROW_H * 1 + 1, grid)).toEqual({ row: 1, step: 2 });
    expect(cellAt(0, 0, grid)).toEqual({ row: 0, step: 0 });
  });

  test("misses outside the grid unless clamped", () => {
    expect(cellAt(CELL_W * 16, 0, grid)).toBeNull();
    expect(cellAt(-1, 0, grid)).toBeNull();
    expect(cellAt(0, ROW_H * 3, grid)).toBeNull();
    expect(cellAt(CELL_W * 99, -50, grid, true)).toEqual({ row: 0, step: 15 });
  });

  test("an empty rack has no cells", () => {
    expect(cellAt(0, 0, { rows: 0, steps: 16 }, true)).toBeNull();
  });
});

test("rowAt returns -1 outside the rows", () => {
  expect(rowAt(ROW_H * 2.5, 3)).toBe(2);
  expect(rowAt(ROW_H * 3, 3)).toBe(-1);
  expect(rowAt(-1, 3)).toBe(-1);
});

test("stepsBetween fills the gap a fast drag skips, in drag order", () => {
  expect(stepsBetween(2, 5)).toEqual([3, 4, 5]);
  expect(stepsBetween(5, 2)).toEqual([4, 3, 2]);
  expect(stepsBetween(4, 4)).toEqual([]);
});

describe("isStepsOnly", () => {
  test("plain steps (any velocity) and empty rows are steps", () => {
    expect(isStepsOnly([])).toBe(true);
    expect(isStepsOnly([createStepNote(0), createStepNote(3, undefined, 0.2)])).toBe(true);
  });

  test("piano-roll edits switch the row to a note preview", () => {
    const step = createStepNote(0);
    expect(isStepsOnly([{ ...step, pitch: 62 }])).toBe(false);
    expect(isStepsOnly([{ ...step, length: STEP_TICKS * 2 }])).toBe(false);
    expect(isStepsOnly([{ ...step, tick: 12 }])).toBe(false);
  });
});

test("litSteps reports each step's velocity and ignores notes past the grid", () => {
  const notes = [createStepNote(1, undefined, 0.5), createStepNote(20)];
  expect(litSteps(notes, 4)).toEqual([0, 0.5, 0, 0]);
});
