import { describe, expect, it } from "vitest";
import { FACTORY_PREFIX } from "@/core/samples";
import { effects } from "@/effects";
import { factorySounds } from "@/sounds/factory";
import { instruments } from "./index";

const specs = [
  ...Object.entries(instruments).map(([key, def]) => [`instrument ${key}`, def.params] as const),
  ...Object.entries(effects).map(([key, def]) => [`effect ${key}`, def.params] as const),
].flatMap(([owner, params]) =>
  Object.entries(params).map(([name, spec]) => ({ owner, name, spec })),
);

describe("registry param specs", () => {
  it.each(specs)("$owner.$name is sane", ({ spec }) => {
    expect(spec.min).toBeLessThan(spec.max);
    expect(spec.default).toBeGreaterThanOrEqual(spec.min);
    expect(spec.default).toBeLessThanOrEqual(spec.max);
    if (spec.curve === "exp") expect(spec.min).toBeGreaterThan(0);
    if (spec.options) {
      expect(spec.min).toBe(0);
      expect(spec.max).toBe(spec.options.length - 1);
    }
  });
});

describe("factory sounds", () => {
  it("have unique, prefixed ids", () => {
    const ids = factorySounds.map((sound) => sound.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith(FACTORY_PREFIX)).toBe(true);
  });
});
