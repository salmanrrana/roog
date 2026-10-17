import { createId } from "@/core/ids";
import type { ParamSpec } from "@/core/params";
import { Knob } from "./Knob";
import { Segmented } from "./Segmented";

interface ParamControlProps {
  readonly spec: ParamSpec;
  readonly value: number;
  readonly onChange: (value: number, gesture: string) => void;
  /** Accent: knob arc and chosen segment (e.g. the channel color). */
  readonly color?: string;
}

/** One control for any param: a Knob for numbers, a captioned Segmented for `spec.options`. */
export function ParamControl({ spec, value, onChange, color }: ParamControlProps) {
  if (spec.options) {
    return (
      <div className="flex flex-col items-start gap-1">
        <span className="caption">{spec.label}</span>
        <Segmented
          label={spec.label}
          options={spec.options.map((text, index) => ({ value: index, label: text }))}
          value={Math.round(value)}
          onChange={(index) => onChange(index, createId())}
          size="sm"
          {...(color === undefined ? {} : { accent: color })}
        />
      </div>
    );
  }
  return (
    <Knob
      spec={spec}
      value={value}
      onChange={onChange}
      layout="stack"
      {...(color === undefined ? {} : { color })}
    />
  );
}
