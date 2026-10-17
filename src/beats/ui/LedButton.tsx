import type { ComponentProps } from "react";

const LED = {
  ink: "bg-ink shadow-[0_0_6px_rgb(255_255_255/0.5)]",
  hot: "bg-hot shadow-[0_0_6px_var(--color-hot)]",
  acid: "bg-acid shadow-[0_0_6px_var(--color-acid)]",
  amber: "bg-amber shadow-[0_0_6px_var(--color-amber)]",
} as const;

interface LedButtonProps extends Omit<ComponentProps<"button">, "type"> {
  readonly active: boolean;
  readonly tone?: keyof typeof LED;
}

/**
 * A single on/off toggle styled like a `md` neutral Button; only the LED shows the pressed state.
 * The LED is ink by default; pass tone="acid" only when the toggle switches sound on.
 */
export function LedButton({
  active,
  tone = "ink",
  className = "",
  children,
  ...rest
}: LedButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`inline-flex h-7 items-center gap-1.5 rounded-sm border border-line bg-panel-2 px-2.5 text-xs font-bold tracking-wider whitespace-nowrap text-ink uppercase enabled:hover:border-ink-dim disabled:cursor-not-allowed disabled:text-ink-mute ${className}`}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${active ? LED[tone] : "bg-line"}`}
      />
      {children}
    </button>
  );
}
