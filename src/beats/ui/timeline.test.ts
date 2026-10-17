import { expect, test } from "vitest";
import { BAR_TICKS, STEP_TICKS } from "@/core/timing";
import { snapTick, tickToX, xToTick, zoomAt } from "./timeline";

test("snapping floors for placement and rounds for moves", () => {
  expect(snapTick(STEP_TICKS * 1.6, "step")).toBe(STEP_TICKS);
  expect(snapTick(STEP_TICKS * 1.6, "step", "round")).toBe(STEP_TICKS * 2);
  expect(snapTick(BAR_TICKS - 1, "bar")).toBe(0);
  expect(snapTick(37, "none")).toBe(37);
});

test("zooming keeps the tick under the cursor in place", () => {
  const view = { scrollTick: 100, pxPerTick: 0.5 };
  const zoomed = zoomAt(view, 2, 300);
  expect(xToTick(zoomed, 300)).toBeCloseTo(xToTick(view, 300));
  expect(tickToX(zoomed, xToTick(view, 300))).toBeCloseTo(300);
});
