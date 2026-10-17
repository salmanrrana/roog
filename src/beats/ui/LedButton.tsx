import type { ComponentProps } from "react";

const LED = {
  hot: "bg-hot shadow-[0_0_6px_var(--color-hot)]",
  acid: "bg-acid shadow-[0_0_6px_var(--color-acid)]",
  amber: "bg-amber shadow-[0_0_6px_var(--color-amber)]",
} as const;

interface LedButtonProps extends Omit<ComponentProps<"button">, "type"> {
  readonly active: boolean;
  readonly tone?: keyof typeof LED;
}

/** A hardware-style toggle: label plus an LED that lights when active. */
export function LedButton({
  active,
  tone = "acid",
  className = "",
  children,
  ...rest
}: LedButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-sm border border-line bg-panel-2 px-2 py-1 text-xs font-bold tracking-wider text-ink uppercase hover:border-ink-dim disabled:opacity-40 ${className}`}
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
