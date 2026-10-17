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

test("formatParam reads units naturally", () => {
  const seconds = { label: "Attack", min: 0, max: 4, default: 0, unit: "s" };
  const hertz = { label: "Cutoff", min: 20, max: 20000, default: 1000, unit: "Hz" };
  expect(formatParam(seconds, 0.001)).toBe("1 ms");
  expect(formatParam(seconds, 0.0055)).toBe("5.5 ms");
  expect(formatParam(seconds, 0.08)).toBe("80 ms");
  expect(formatParam(seconds, 1.8)).toBe("1.80 s");
  expect(formatParam(hertz, 440)).toBe("440 Hz");
  expect(formatParam(hertz, 2400)).toBe("2.4 kHz");
  expect(formatParam(hertz, 20000)).toBe("20 kHz");
  expect(formatParam({ label: "Vol", min: 0, max: 1, default: 1, unit: "%" }, 0.8)).toBe("80%");
});

test("formatParam prefers the spec's format hook", () => {
  const pan = { label: "Pan", min: -1, max: 1, default: 0, unit: "%", format: () => "L 40" };
  expect(formatParam(pan, -0.4)).toBe("L 40");
});
