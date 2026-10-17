import { engine } from "@/engine";
import { Browser } from "@/panels/browser";
import { ChannelRack } from "@/panels/channel-rack";
import { saveNow } from "@/persistence";
import { redo, undo } from "@/state/project-store";
import { setView, stepPattern, toggleRack, togglePlayMode, useUiStore } from "@/state/ui-store";
import { useHotkeys } from "@/ui/hotkeys";
import { LedButton } from "@/ui/LedButton";
import { MenuHost } from "@/ui/menu";
import { ToastHost } from "@/ui/toast";
import { TransportBar } from "./TransportBar";
import { workspaceViews } from "./views";

/**
 * Page shell: transport on top, browser on the left, channel rack above a tabbed
 * workspace (playlist / piano roll / mixer). Global shortcuts live here; panel
 * shortcuts live in each panel (see the shortcut map in the architecture doc).
 */
export function App() {
  const view = useUiStore((s) => s.view);
  const rackOpen = useUiStore((s) => s.rackOpen);
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
  });

  return (
    <div className="grid h-dvh grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <TransportBar />
      <div className="grid min-h-0 grid-cols-[13rem_minmax(0,1fr)]">
        <aside
          aria-label="Browser"
          className="min-h-0 overflow-y-auto border-r border-line bg-panel"
        >
          <Browser />
        </aside>
        <main className="flex min-h-0 flex-col">
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
            className="flex items-center gap-1 border-b border-line bg-panel px-2 py-1"
          >
            {workspaceViews.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={item.id === active?.id}
                onClick={() => setView(item.id)}
                className="rounded-sm px-2.5 py-1 text-xs font-bold tracking-wider text-ink-dim uppercase hover:text-ink aria-selected:bg-panel-2 aria-selected:text-ink"
              >
                {item.label}{" "}
                <kbd className="ml-1 font-mono text-[10px] font-normal text-ink-dim">
                  {item.hotkey}
                </kbd>
              </button>
            ))}
            <LedButton
              active={rackOpen}
              onClick={toggleRack}
              className="ml-auto"
              title="Show or hide the channel rack (F6)"
            >
              Rack
            </LedButton>
          </nav>
          <section role="tabpanel" aria-label={active?.label} className="min-h-0 flex-1 bg-well">
            {active && <active.Component />}
          </section>
        </main>
      </div>
      <MenuHost />
      <ToastHost />
    </div>
  );
}
