import { create } from "zustand";
import { MASTER_ID } from "@/core/defaults";

/** Mixer view state that survives tab switches: the selected track and FX slot. */
export const useMixerView = create<{ readonly trackId: string; readonly slotId: string | null }>()(
  () => ({ trackId: MASTER_ID, slotId: null }),
);

export function selectTrack(trackId: string): void {
  if (useMixerView.getState().trackId !== trackId) useMixerView.setState({ trackId, slotId: null });
}

export function selectSlot(slotId: string): void {
  useMixerView.setState({ slotId });
}
