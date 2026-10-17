/**
 * Parameters are how instruments and effects expose knobs. Every param is a plain
 * number so one knob component, one normalizer and (later) one automation path
 * work for all of them. Enum params store the index into `options`.
 */
export interface ParamSpec {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly default: number;
  /** Snap increment. Enum params are always stepped by 1. */
  readonly step?: number;
  /** Knob feel. "exp" suits Hz and seconds and needs min > 0. */
  readonly curve?: "linear" | "exp";
  readonly unit?: string;
  /** Labels for an enum param; the value is the index. */
  readonly options?: readonly string[];
  /** Custom readout (e.g. pan "L 40"). Display only, never stored. */
  readonly format?: (value: number) => string;
}

export type ParamSpecs = Readonly<Record<string, ParamSpec>>;

/** The values an instrument or effect receives, keyed exactly like its specs. */
export type ParamValues<P extends ParamSpecs> = { readonly [K in keyof P]: number };

/** Default value for every param in a spec map. */
export function defaultParams<P extends ParamSpecs>(specs: P): ParamValues<P> {
  return Object.fromEntries(
    Object.entries(specs).map(([key, spec]) => [key, spec.default]),
  ) as ParamValues<P>;
}

/** Clamp a value into its spec's range and snap it to the spec's step. */
export function clampParam(spec: ParamSpec, value: number): number {
  if (!Number.isFinite(value)) return spec.default;
  const step = spec.options ? 1 : spec.step;
  const snapped = step ? spec.min + Math.round((value - spec.min) / step) * step : value;
  return Math.min(spec.max, Math.max(spec.min, snapped));
}

/**
 * Make a stored param map match its specs: fill missing keys with defaults, drop
 * unknown keys, clamp the rest. Used when loading files and switching instruments,
 * so adding or removing a param never needs a migration.
 */
export function normalizeParams(
  specs: ParamSpecs,
  values: Readonly<Record<string, number>>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(specs).map(([key, spec]) => {
      const value = values[key];
      return [key, value === undefined ? spec.default : clampParam(spec, value)];
    }),
  );
}

/** Value → knob position in 0..1, honoring the spec's curve. */
export function paramToNorm(spec: ParamSpec, value: number): number {
  if (spec.max === spec.min) return 0;
  const norm =
    spec.curve === "exp"
      ? Math.log(value / spec.min) / Math.log(spec.max / spec.min)
      : (value - spec.min) / (spec.max - spec.min);
  return Math.min(1, Math.max(0, norm));
}

/** Knob position in 0..1 → clamped, snapped value. */
export function normToParam(spec: ParamSpec, norm: number): number {
  const n = Math.min(1, Math.max(0, norm));
  const raw =
    spec.curve === "exp"
      ? spec.min * Math.pow(spec.max / spec.min, n)
      : spec.min + n * (spec.max - spec.min);
  return clampParam(spec, raw);
}

/**
 * Human-readable value for knob readouts: the option label, else `spec.format`, else
 * by unit: "80%", "1 ms" / "80 ms" / "1.80 s", "440 Hz" / "2.4 kHz", "-3 st".
 */
export function formatParam(spec: ParamSpec, value: number): string {
  if (spec.options) return spec.options[Math.round(value)] ?? "?";
  if (spec.format) return spec.format(value);
  const abs = Math.abs(value);
  if (spec.unit === "%") return `${Math.round(value * 100)}%`;
  if (spec.unit === "s" && abs < 1) {
    const ms = value * 1000;
    const whole = Math.abs(ms - Math.round(ms)) < 1e-6;
    return `${Math.abs(ms) < 10 && !whole ? ms.toFixed(1) : Math.round(ms)} ms`;
  }
  if (spec.unit === "s") return `${value.toFixed(2)} s`;
  if (spec.unit === "Hz" && abs >= 1000) {
    const khz = value / 1000;
    return `${Math.abs(khz) < 10 ? Number(khz.toFixed(1)) : Math.round(khz)} kHz`;
  }
  if (spec.unit === "Hz") return `${Math.round(value)} Hz`;
  const digits = abs >= 100 || Number.isInteger(value) ? 0 : abs >= 10 ? 1 : 2;
  const text = value.toFixed(digits);
  return spec.unit ? `${text} ${spec.unit}` : text;
}
