import { useState } from "react";
import { Button } from "@/ui/Button";
import { kbdClass } from "./kbd";

const STORAGE_KEY = "roog-beats:hint-dismissed";

/** Storage can throw (private mode, blocked site data): then the hint just shows. */
function wasDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** First-run tips under the header, until dismissed (remembered in this browser). */
export function HintBar() {
  const [hidden, setHidden] = useState(wasDismissed);
  if (hidden) return null;

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Not remembered; it shows again next visit.
    }
  }

  return (
    <div className="flex items-center gap-2 border-b border-line bg-panel-2 px-3 py-1 text-xs text-ink-dim">
      <p className="min-w-0 flex-1 truncate">
        New here? <kbd className={kbdClass}>Space</kbd> plays and stops · click squares in the
        Channel rack to add hits · drag sounds from the Browser onto the rack · press{" "}
        <kbd className={kbdClass}>?</kbd> for every shortcut
      </p>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Dismiss hint"
        title="Dismiss hint"
        onClick={dismiss}
      >
        ✕
      </Button>
    </div>
  );
}
