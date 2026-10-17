/**
 * Theme colors for canvas drawing. styles.css is the single source of truth;
 * this reads its CSS variables once, so canvases and Tailwind classes always match.
 */
const TOKENS = [
  "well",
  "panel",
  "panel-2",
  "line",
  "ink",
  "ink-dim",
  "hot",
  "amber",
  "acid",
  "rec",
] as const;

export type ThemeColor = (typeof TOKENS)[number];

let cache: Readonly<Record<ThemeColor, string>> | null = null;

export function themeColors(): Readonly<Record<ThemeColor, string>> {
  if (!cache) {
    const style = getComputedStyle(document.documentElement);
    cache = Object.fromEntries(
      TOKENS.map((token) => [token, style.getPropertyValue(`--color-${token}`).trim() || "#f0f"]),
    ) as Record<ThemeColor, string>;
  }
  return cache;
}
