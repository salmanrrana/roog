import { create } from "zustand";
import type { Cell } from "./grid";

/**
 * Channel-rack view state that survives the rack being hidden: which channel's
 * settings are open, which name is being renamed, and the keyboard cursor on
 * the step grid. Not saved, not undoable.
 */
interface RackState {
  readonly expandedId: string | null;
  readonly renamingId: string | null;
  readonly cursor: Cell;
}

export const useRackStore = create<RackState>()(() => ({
  expandedId: null,
  renamingId: null,
  cursor: { row: 0, step: 0 },
}));

/** Open a channel's settings, or close them if they are already open. */
export function toggleExpanded(channelId: string): void {
  useRackStore.setState((state) => ({
    expandedId: state.expandedId === channelId ? null : channelId,
  }));
}

export function setRenaming(renamingId: string | null): void {
  useRackStore.setState({ renamingId });
}
