import type { ParamSpec } from "@/core/params";
import { DEFAULT_CHANNEL_VOLUME } from "@/core/defaults";
import { VOLUME_MAX } from "@/core/schema";

/** Specs for the strip controls every channel and mixer track has, so they can use <Knob>. */
export const VOLUME_SPEC: ParamSpec = {
  label: "Vol",
  min: 0,
  max: VOLUME_MAX,
  default: DEFAULT_CHANNEL_VOLUME,
  unit: "%",
};
export const MIXER_VOLUME_SPEC: ParamSpec = { ...VOLUME_SPEC, default: 1 };
export const PAN_SPEC: ParamSpec = { label: "Pan", min: -1, max: 1, default: 0 };
export const SWING_SPEC: ParamSpec = {
  label: "Swing",
  min: 0,
  max: 1,
  default: 0,
  step: 0.01,
  unit: "%",
};

/** "C", "L 40", "R 100": FL-style pan readout. */
export function formatPan(value: number): string {
  const amount = Math.round(Math.abs(value) * 100);
  return amount === 0 ? "C" : `${value < 0 ? "L" : "R"} ${amount}`;
}
