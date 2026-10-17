import type { KeyboardEvent, ReactNode } from "react";
import type { ButtonSize } from "./Button";

export interface SegmentedOption<T> {
  readonly value: T;
  readonly label: ReactNode;
  readonly title?: string;
}

interface SegmentedProps<T extends string | number> {
  /** Accessible name of the group. */
  readonly label: string;
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly size?: ButtonSize;
  /** Fill of the chosen segment (any CSS color). */
  readonly accent?: string;
}

const SIZES: Record<ButtonSize, string> = {
  sm: "h-6 px-2 text-2xs",
  md: "h-7 px-2.5 text-xs",
};

const STEPS: Readonly<Record<string, number>> = {
  ArrowLeft: -1,
  ArrowUp: -1,
  ArrowRight: 1,
  ArrowDown: 1,
};

/**
 * Pick one of a few choices (play mode, tool, pattern length, enum params).
 * A radiogroup with roving tabindex; arrows choose. Never use a knob for this.
 */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  size = "md",
  accent = "var(--color-ink)",
}: SegmentedProps<T>) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = STEPS[event.key];
    if (step === undefined || options.length === 0) return;
    event.preventDefault();
    const index = options.findIndex((option) => option.value === value);
    const next = (index + step + options.length) % options.length;
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} className="inline-flex" onKeyDown={onKeyDown}>
      {options.map((option) => {
        const chosen = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={chosen}
            tabIndex={chosen ? 0 : -1}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`-ml-px inline-flex items-center justify-center border font-bold tracking-wider whitespace-nowrap uppercase first:ml-0 first:rounded-l-sm last:rounded-r-sm focus-visible:z-10 ${SIZES[size]} ${chosen ? "z-[1] text-well" : "border-line bg-panel-2 text-ink-dim hover:text-ink"}`}
            style={chosen ? { background: accent, borderColor: accent } : undefined}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
