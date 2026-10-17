import { useEffect, useEffectEvent } from "react";

/**
 * Keyboard shortcuts. Combos are written like "space", "mod+z", "mod+shift+z",
 * "alt+arrowup", "f5", "1", "delete" (`mod` is Ctrl, or Cmd on macOS). Letters
 * and digits match by physical key, so "alt+c" works on every layout.
 * The full shortcut map and which panel owns each key is in docs/beats-architecture.md.
 *
 * When a shortcut fires (spec: docs/beats-architecture.md "Design system"):
 * - Combos in ALWAYS (Ctrl/Cmd+S) fire everywhere, even while typing or in a dialog.
 * - Otherwise nothing fires while a modal <dialog> is open or a text field
 *   (input, textarea, contenteditable) has focus. A <select> is not a text field.
 * - A focused <select> owns its navigation keys (arrows, Home/End, PageUp/Down, Enter);
 *   Space stays global, so Space plays right after picking from it.
 * - A button, link, summary, radio, tab, checkbox, switch, menuitem or option owns
 *   Space and Enter only when focused from the keyboard (:focus-visible at the moment
 *   it got focus; Chromium turns any focused element :focus-visible once a key is
 *   pressed, so it's checked on focusin, not on keydown). A mouse-clicked button isn't,
 *   so Space still plays after a click. (A clicked <select> is, which is why selects
 *   have their own rule.)
 */
export type Hotkeys = Readonly<Record<string, (event: KeyboardEvent) => void>>;

const MODIFIERS = ["mod", "shift", "alt"] as const;
const layers: Array<() => Hotkeys> = [];
/** The element that last received focus from the keyboard (see the file comment). */
let keyboardFocused: EventTarget | null = null;
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

/** Combos that fire even while typing or with a dialog open. */
const ALWAYS = new Set(["mod+s"]);
const SELECT_KEYS = new Set([
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "home",
  "end",
  "pageup",
  "pagedown",
  "enter",
]);
const PRESSABLE =
  "button, a[href], summary, [role=radio], [role=tab], [role=checkbox], [role=switch], [role=menuitem], [role=option]";

/** True for text-entry targets, where typed keys belong to the field. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.matches(
        "input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=button]), textarea",
      ))
  );
}

/** True when the focused control needs this key for itself (see the file comment). */
function ownsKey(target: EventTarget | null, combo: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLSelectElement) return SELECT_KEYS.has(combo);
  return (
    (combo === "space" || combo === "enter") &&
    target.matches(PRESSABLE) &&
    target === keyboardFocused
  );
}

function onFocusIn(event: FocusEvent) {
  const { target } = event;
  keyboardFocused = target instanceof Element && target.matches(":focus-visible") ? target : null;
}

function onKeyDown(event: KeyboardEvent) {
  if (event.defaultPrevented) return;
  const combo = comboOf(event);
  if (
    !ALWAYS.has(combo) &&
    (document.querySelector("dialog[open]") ||
      isTyping(event.target) ||
      ownsKey(event.target, combo))
  )
    return;
  // Latest layer wins, so an open panel can override a global key.
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const bindings = layers[index]?.() ?? {};
    for (const [binding, handler] of Object.entries(bindings)) {
      if (normalize(binding) === combo) {
        event.preventDefault();
        handler(event);
        // A mouse-focused button would otherwise turn :focus-visible after Space/Enter.
        const { target } = event;
        if (
          target instanceof HTMLElement &&
          target.matches(PRESSABLE) &&
          target !== keyboardFocused
        )
          target.blur();
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
      document.addEventListener("focusin", onFocusIn, true);
      listening = true;
    }
    const layer = () => read();
    layers.push(layer);
    return () => {
      layers.splice(layers.indexOf(layer), 1);
    };
  }, [enabled]);
}
