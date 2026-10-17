import type { ComponentType } from "react";
import { Mixer } from "@/panels/mixer";
import { PianoRoll } from "@/panels/piano-roll";
import { Playlist } from "@/panels/playlist";
import type { WorkspaceView } from "@/state/ui-store";

export interface WorkspaceViewDef {
  readonly id: WorkspaceView;
  readonly label: string;
  /** Global shortcut that opens it (FL's F-keys). */
  readonly hotkey: string;
  readonly Component: ComponentType;
}

/**
 * Views that take the main workspace below the channel rack. Only the active one
 * is mounted, so a panel keeps state that must survive tab switches (zoom, scroll)
 * in its own module-level store. To add a view: extend WorkspaceView, add it here.
 */
export const workspaceViews: readonly WorkspaceViewDef[] = [
  { id: "playlist", label: "Playlist", hotkey: "F5", Component: Playlist },
  { id: "pianoRoll", label: "Piano roll", hotkey: "F7", Component: PianoRoll },
  { id: "mixer", label: "Mixer", hotkey: "F9", Component: Mixer },
];
