import { type KeyboardEvent, useEffect, useRef } from "react";
import { create } from "zustand";

export interface MenuItem {
  readonly label: string;
  readonly onSelect: () => void;
  /** Shown on the right, e.g. "Alt+C". */
  readonly shortcut?: string;
  readonly danger?: boolean;
  readonly disabled?: boolean;
}

export type MenuEntry = MenuItem | "separator";

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
        left: `min(${open.x}px, calc(100vw - 13rem))`,
        top: `min(${open.y}px, calc(100vh - ${open.entries.length * 1.9 + 0.5}rem))`,
      }}
    >
      {open.entries.map((entry, index) =>
        entry === "separator" ? (
          <hr key={index} className="my-1 border-line" />
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
            className={`flex w-full items-center justify-between gap-6 px-3 py-1 text-left text-sm outline-none hover:bg-panel focus:bg-panel disabled:opacity-40 ${entry.danger ? "text-rec" : "text-ink"}`}
          >
            {entry.label}
            {entry.shortcut && (
              <kbd className="font-mono text-[10px] text-ink-dim">{entry.shortcut}</kbd>
            )}
          </button>
        ),
      )}
    </div>
  );
}
