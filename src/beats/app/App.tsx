import { engine } from "@/engine";
import { Browser } from "@/panels/browser";
import { ChannelRack } from "@/panels/channel-rack";
import { saveNow } from "@/persistence";
import { redo, undo } from "@/state/project-store";
import { setView, stepPattern, toggleRack, togglePlayMode, useUiStore } from "@/state/ui-store";
import { useState } from "react";
import { Button } from "@/ui/Button";
import { useHotkeys } from "@/ui/hotkeys";
import { LedButton } from "@/ui/LedButton";
import { MenuHost } from "@/ui/menu";
import { ToastHost } from "@/ui/toast";
import { HintBar } from "./HintBar";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { TransportBar } from "./TransportBar";
import { workspaceViews } from "./views";

/**
 * Page shell: transport on top, a first-run hint bar, browser on the left, channel
 * rack above a tabbed workspace (playlist / piano roll / mixer). <main> comes before
 * the browser in the DOM so Tab visits transport, workspace, then browser; the grid
 * still places the browser on the left. Global shortcuts (and the "?" shortcuts sheet)
 * live here; panel shortcuts live in each panel (see the architecture doc).
 */
export function App() {
  const view = useUiStore((s) => s.view);
  const rackOpen = useUiStore((s) => s.rackOpen);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const active = workspaceViews.find((item) => item.id === view) ?? workspaceViews[0];

  useHotkeys({
    space: () => engine.togglePlay(),
    "mod+z": undo,
    "mod+shift+z": redo,
    "mod+y": redo,
    l: togglePlayMode,
    f5: () => setView("playlist"),
    f6: toggleRack,
    f7: () => setView("pianoRoll"),
    f9: () => setView("mixer"),
    "mod+s": () => void saveNow(),
    "]": () => stepPattern(1),
    "[": () => stepPattern(-1),
    "shift+?": () => setShowShortcuts(true),
  });

  return (
    <div className="grid h-dvh grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden">
      <TransportBar />
      <HintBar />
      <div className="row-start-3 grid min-h-0 grid-cols-[13rem_minmax(0,1fr)]">
        <main className="col-start-2 row-start-1 flex min-h-0 flex-col">
          {rackOpen && (
            <section
              aria-label="Channel rack"
              className="max-h-[45vh] shrink-0 overflow-y-auto border-b border-line bg-panel"
            >
              <ChannelRack />
            </section>
          )}
          <nav
            role="tablist"
            aria-label="Workspace"
            className="flex items-center gap-1 border-b border-line bg-panel px-2"
          >
            {workspaceViews.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={item.id === active?.id}
                onClick={() => setView(item.id)}
                className="-mb-px border-b-2 border-transparent px-2.5 py-2 text-xs font-bold tracking-wider text-ink-dim uppercase hover:text-ink aria-selected:border-ink aria-selected:text-ink"
              >
                {item.label}{" "}
                <kbd className="ml-1 font-mono text-2xs font-normal text-ink-dim">
                  {item.hotkey}
                </kbd>
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2 py-1">
              <Button
                variant="ghost"
                aria-label="Keyboard shortcuts"
                title="Keyboard shortcuts (?)"
                onClick={() => setShowShortcuts(true)}
              >
                <span aria-hidden="true">?</span>
                <span className="hidden xl:inline">Shortcuts</span>
              </Button>
              <LedButton
                active={rackOpen}
                onClick={toggleRack}
                title="Show or hide the channel rack (F6)"
              >
                Channel rack
                <kbd className="font-mono text-2xs font-normal text-ink-dim">F6</kbd>
              </LedButton>
            </div>
          </nav>
          <section role="tabpanel" aria-label={active?.label} className="min-h-0 flex-1 bg-well">
            {active && <active.Component />}
          </section>
        </main>
        <aside
          aria-label="Browser"
          className="col-start-1 row-start-1 min-h-0 overflow-y-auto border-r border-line bg-panel"
        >
          <Browser />
        </aside>
      </div>
      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
      <MenuHost />
      <ToastHost />
    </div>
  );
}
