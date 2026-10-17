import { expect, test } from "vitest";
import { softClipCurve } from "./graph";

test("the master soft clipper is transparent at normal levels and never passes -0.2 dBFS", () => {
  const curve = softClipCurve();
  const at = (input: number) =>
    curve[Math.round(((input / 2 + 1) / 2) * (curve.length - 1))] ?? NaN;
  expect(at(0.5)).toBeCloseTo(0.5, 3);
  expect(at(-0.7)).toBeCloseTo(-0.7, 3);
  expect(Math.max(...curve.map(Math.abs))).toBeLessThanOrEqual(0.98);
  for (let i = 1; i < curve.length; i += 1)
    expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1] ?? 0);
});
