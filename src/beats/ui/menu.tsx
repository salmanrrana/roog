import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { create } from "zustand";

export interface MenuItem {
  readonly label: string;
  readonly onSelect: () => void;
  /** Shown on the right, e.g. "Alt+C". */
  readonly shortcut?: string;
  readonly danger?: boolean;
  readonly disabled?: boolean;
  /** Check state. When any item in a menu sets it, every item gets a ✓ column. */
  readonly checked?: boolean;
  /** Second line in small dim text, e.g. what the item does. */
  readonly hint?: string;
}

/** An item, a divider, or a non-interactive caption row (skipped by arrow keys). */
export type MenuEntry = MenuItem | "separator" | { readonly heading: string };

interface OpenMenu {
  readonly x: number;
  readonly y: number;
  readonly entries: readonly MenuEntry[];
}

const useMenuStore = create<{ readonly open: OpenMenu | null }>()(() => ({ open: null }));

/**
 * Open the app's single context menu at a screen point. Typical use:
 *   onContextMenu={(e) => { e.preventDefault(); openMenu({ x: e.clientX, y: e.clientY }, [...]) }}
 * For a dropdown button, pass the button's bottom-left corner.
 */
export function openMenu(
  at: { readonly x: number; readonly y: number },
  entries: readonly MenuEntry[],
) {
  useMenuStore.setState({ open: { x: at.x, y: at.y, entries } });
}

export function closeMenu(): void {
  useMenuStore.setState({ open: null });
}

/** Renders the open menu. Mounted once by the app shell. */
export function MenuHost() {
  const open = useMenuStore((s) => s.open);
  const menu = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

  // Measure the real menu and keep it inside the viewport.
  useLayoutEffect(() => {
    const node = menu.current;
    if (!open || !node) return setPlace(null);
    const { width, height } = node.getBoundingClientRect();
    setPlace({
      left: Math.max(4, Math.min(open.x, window.innerWidth - width - 4)),
      top: Math.max(4, Math.min(open.y, window.innerHeight - height - 4)),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !menu.current?.contains(event.target)) closeMenu();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!open) return null;
  const hasChecks = open.entries.some(
    (entry) => typeof entry === "object" && "checked" in entry && entry.checked !== undefined,
  );

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const delta = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const items = [
      ...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []),
    ];
    const index = items.findIndex((item) => item === document.activeElement);
    items[(index + delta + items.length) % items.length]?.focus();
  }

  return (
    <div
      ref={menu}
      role="menu"
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      className="fixed z-50 min-w-48 rounded-sm border border-line bg-panel-2 py-1 shadow-2xl shadow-black/60"
      style={{
        left: place?.left ?? open.x,
        top: place?.top ?? open.y,
        visibility: place ? "visible" : "hidden",
      }}
    >
      {open.entries.map((entry, index) =>
        entry === "separator" ? (
          <hr key={index} className="my-1 border-line" />
        ) : "heading" in entry ? (
          <p key={index} className="caption px-3 pt-2 pb-0.5">
            {entry.heading}
          </p>
        ) : (
          <button
            key={index}
            type="button"
            role="menuitem"
            disabled={entry.disabled}
            onClick={() => {
              closeMenu();
              entry.onSelect();
            }}
            className={`flex w-full items-start gap-2 px-3 py-1 text-left text-sm outline-none hover:bg-panel focus:bg-panel disabled:cursor-not-allowed disabled:text-ink-mute ${entry.danger ? "text-rec" : "text-ink"}`}
          >
            {hasChecks && (
              <span aria-hidden="true" className="w-4 shrink-0">
                {entry.checked ? "✓" : ""}
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              {entry.label}
              {entry.hint && <span className="text-2xs text-ink-dim">{entry.hint}</span>}
            </span>
            {entry.shortcut && (
              <kbd className="ml-4 font-mono text-2xs leading-5 text-ink-dim">{entry.shortcut}</kbd>
            )}
          </button>
        ),
      )}
    </div>
  );
}
