import { useEffect, useEffectEvent } from "react";

/**
 * Keyboard shortcuts. Combos are written like "space", "mod+z", "mod+shift+z",
 * "alt+arrowup", "f5", "1", "delete" (`mod` is Ctrl, or Cmd on macOS). Letters
 * and digits match by physical key, so "alt+c" works on every layout.
 * The full shortcut map and which panel owns each key is in docs/beats-architecture.md.
 */
export type Hotkeys = Readonly<Record<string, (event: KeyboardEvent) => void>>;

const MODIFIERS = ["mod", "shift", "alt"] as const;
const layers: Array<() => Hotkeys> = [];
let listening = false;

function normalize(combo: string): string {
  const parts = combo.toLowerCase().split("+");
  const key = parts.filter((part) => !MODIFIERS.some((mod) => mod === part)).join("+");
  return [...MODIFIERS.filter((mod) => parts.includes(mod)), key].join("+");
}

function comboOf(event: KeyboardEvent): string {
  const { code } = event;
  const key = code.startsWith("Key")
    ? code.slice(3).toLowerCase()
    : code.startsWith("Digit")
      ? code.slice(5)
      : event.key === " "
        ? "space"
        : event.key.toLowerCase();
  const mods = [
    event.ctrlKey || event.metaKey ? "mod" : "",
    event.shiftKey ? "shift" : "",
    event.altKey ? "alt" : "",
  ];
  return [...mods.filter(Boolean), key].join("+");
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.matches("input:not([type=range]):not([type=checkbox]), textarea, select"))
  );
}

function onKeyDown(event: KeyboardEvent) {
  if (event.defaultPrevented || isTyping(event.target)) return;
  const combo = comboOf(event);
  // Latest layer wins, so an open panel can override a global key.
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const bindings = layers[index]?.() ?? {};
    for (const [binding, handler] of Object.entries(bindings)) {
      if (normalize(binding) === combo) {
        event.preventDefault();
        handler(event);
        return;
      }
    }
  }
}

/**
 * Register shortcuts while the component is mounted and `enabled` is true.
 * Handlers always see the latest props; no need to memoize `bindings`.
 */
export function useHotkeys(bindings: Hotkeys, enabled = true): void {
  const read = useEffectEvent(() => bindings);
  useEffect(() => {
    if (!enabled) return;
    if (!listening) {
      window.addEventListener("keydown", onKeyDown);
      listening = true;
    }
    const layer = () => read();
    layers.push(layer);
    return () => {
      layers.splice(layers.indexOf(layer), 1);
    };
  }, [enabled]);
}
