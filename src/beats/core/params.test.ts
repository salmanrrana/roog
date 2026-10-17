import { expect, test } from "vitest";
import {
  type ParamSpec,
  clampParam,
  formatParam,
  normToParam,
  normalizeParams,
  paramToNorm,
} from "./params";

const cutoff: ParamSpec = {
  label: "Cutoff",
  min: 20,
  max: 20000,
  default: 1000,
  curve: "exp",
  unit: "Hz",
};
const wave: ParamSpec = {
  label: "Wave",
  min: 0,
  max: 2,
  default: 0,
  options: ["Saw", "Square", "Sine"],
};

test("exp knobs put the geometric middle at the center and round-trip", () => {
  expect(normToParam(cutoff, 0.5)).toBeCloseTo(632.46, 1);
  expect(normToParam(cutoff, paramToNorm(cutoff, 440))).toBeCloseTo(440);
});

test("enums snap to an option and format as its label", () => {
  expect(clampParam(wave, 1.4)).toBe(1);
  expect(formatParam(wave, normToParam(wave, 0.8))).toBe("Sine");
});

test("normalizeParams fills defaults, clamps and drops unknown keys", () => {
  expect(normalizeParams({ cutoff, wave }, { cutoff: 1e9, junk: 1 })).toEqual({
    cutoff: 20000,
    wave: 0,
  });
});
