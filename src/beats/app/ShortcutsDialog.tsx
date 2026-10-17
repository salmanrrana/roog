import { Dialog } from "@/ui/Dialog";
import { kbdClass } from "./kbd";

type Row = readonly [keys: string, does: string];

const SECTIONS: readonly { readonly title: string; readonly rows: readonly Row[] }[] = [
  {
    title: "Global",
    rows: [
      ["Space", "play / stop"],
      ["L", "pattern / song mode"],
      ["F5", "playlist"],
      ["F6", "channel rack"],
      ["F7", "piano roll"],
      ["F9", "mixer"],
      ["Ctrl+Z", "undo"],
      ["Ctrl+Shift+Z or Ctrl+Y", "redo"],
      ["Ctrl+S", "save"],
      ["[ / ]", "previous / next pattern"],
      ["?", "this sheet"],
    ],
  },
  {
    title: "Channel rack",
    rows: [
      ["1–0", "mute channel 1–10"],
      ["Shift+1–0", "solo"],
      ["Alt+↑/↓", "move selected channel"],
      ["Alt+C", "clone"],
      ["Alt+Delete", "delete"],
      ["F2 or double-click a name", "rename"],
      ["Arrows + Enter", "toggle steps on the step grid"],
    ],
  },
  {
    title: "Piano roll",
    rows: [
      ["P", "draw"],
      ["B", "paint"],
      ["D", "delete"],
      ["E", "select"],
      ["Delete", "remove selected"],
      ["Ctrl+A/C/X/V/D", "select all / copy / cut / paste / duplicate"],
      ["Ctrl+Q", "quantize"],
      ["↑/↓", "semitone"],
      ["Ctrl+↑/↓", "octave"],
      ["←/→", "nudge"],
      ["Alt+wheel", "velocity"],
    ],
  },
  {
    title: "Playlist",
    rows: [
      ["P", "draw"],
      ["B", "paint"],
      ["D", "delete"],
      ["E", "select"],
      ["Delete", "remove selected"],
      ["Ctrl+A/C/V/D", "select all / copy / paste / duplicate"],
    ],
  },
  {
    title: "Mouse",
    rows: [
      ["Wheel", "scrolls"],
      ["Shift+wheel", "scrolls sideways"],
      ["Ctrl+wheel", "zooms"],
      ["Alt while dragging", "skips snap"],
      ["Right-click", "erases"],
      ["Double-click a knob", "resets it"],
    ],
  },
];

/** Every shortcut on one sheet. Opened by "?" or the tab bar's Keyboard shortcuts button. */
export function ShortcutsDialog({ onClose }: { readonly onClose: () => void }) {
  return (
    <Dialog
      title="Keyboard shortcuts"
      onClose={onClose}
      className="w-[min(52rem,calc(100vw-2rem))]"
    >
      <div className="grid max-h-[75vh] gap-x-8 gap-y-4 overflow-y-auto sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <section key={section.title} className="flex flex-col gap-1">
            <h3 className="caption mb-1">{section.title}</h3>
            <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-xs">
              {section.rows.map(([keys, does]) => (
                <div key={keys} className="contents">
                  <dt>
                    <kbd className={kbdClass}>{keys}</kbd>
                  </dt>
                  <dd className="text-ink-dim">{does}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
