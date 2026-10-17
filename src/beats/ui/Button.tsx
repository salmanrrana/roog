import type { ComponentProps } from "react";

export type ButtonVariant = "neutral" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-sm border font-bold tracking-wider uppercase whitespace-nowrap disabled:cursor-not-allowed disabled:text-ink-mute aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-well";

const VARIANTS: Record<ButtonVariant, string> = {
  neutral: "border-line bg-panel-2 text-ink enabled:hover:border-ink-dim",
  ghost: "border-transparent text-ink-dim enabled:hover:bg-panel-2 enabled:hover:text-ink",
  danger: "border-line bg-panel-2 text-rec enabled:hover:border-rec",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-6 px-2 text-2xs",
  md: "h-7 px-2.5 text-xs",
};

/** Classes for a button look, for elements that can't be a <Button> (labels, links). */
export function buttonClass(variant: ButtonVariant = "neutral", size: ButtonSize = "md"): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]}`;
}

interface ButtonProps extends ComponentProps<"button"> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
}

/** The app's button. `type="button"` unless told otherwise; aria-pressed gives the ink "on" fill. */
export function Button({
  variant = "neutral",
  size = "md",
  type = "button",
  className = "",
  ...rest
}: ButtonProps) {
  return <button type={type} className={`${buttonClass(variant, size)} ${className}`} {...rest} />;
}

/** Styled native select with a chevron, the same height as `md` buttons. */
export function Select({ className = "", children, ...rest }: ComponentProps<"select">) {
  return (
    <span className={`relative inline-flex ${className}`}>
      <select
        className="h-7 w-full min-w-0 appearance-none rounded-sm border border-line bg-panel-2 pr-6 pl-2 text-xs text-ink hover:border-ink-dim [&_option]:bg-panel [&_option]:text-ink"
        {...rest}
      >
        {children}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-2xs text-ink-dim"
      >
        ▾
      </span>
    </span>
  );
}
