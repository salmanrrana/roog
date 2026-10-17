/**
 * Rack edits that combine several commands or open menus, shared by the rows,
 * the header, hotkeys and drag-and-drop.
 */
import {
  addChannel,
  addInsert,
  cloneChannel,
  findChannel,
  moveChannel,
  removeChannel,
  setChannelInstrument,
  uniqueName,
  updateChannel,
} from "@/core/commands";
import { MASTER_ID } from "@/core/defaults";
import { DEFAULT_INSTRUMENT, getInstrument, instruments } from "@/instruments";
import { importAudioFiles, useSampleLibrary } from "@/persistence";
import { factorySounds, getFactorySound } from "@/sounds/factory";
import { edit, useProjectStore } from "@/state/project-store";
import { openPianoRoll, selectChannel } from "@/state/ui-store";
import type { Channel, Project } from "@/core/schema";
import { type MenuEntry, openMenu } from "@/ui/menu";
import { toastWithUndo } from "@/ui/toast";
import { setRenaming, toggleExpanded } from "./rack-store";

type Point = { readonly x: number; readonly y: number };

/** Display name for a factory or user sample id. */
export function sampleName(sampleId: string): string {
  return (
    getFactorySound(sampleId)?.name ??
    useSampleLibrary.getState().samples.find((sample) => sample.id === sampleId)?.name ??
    "Sample"
  );
}

/** The soloed channel (its solo flag is set), else null. Solo is kept apart from mute. */
export function soloedChannelId(project: Project): string | null {
  return project.channels.find((channel) => channel.solo)?.id ?? null;
}

/** Add a sampler channel (on its own insert) playing `sampleId`, and select it. */
export function addSampleChannel(sampleId: string): void {
  selectChannel(edit((p) => addChannel(p, { name: sampleName(sampleId), sampleId })));
}

/** The name a channel gets for its current sound: the sample's name on a sampler with a sample, else the instrument's. */
function defaultName(channel: Pick<Channel, "instrument" | "sampleId">): string {
  const def = getInstrument(channel.instrument);
  return def.usesSample && channel.sampleId ? sampleName(channel.sampleId) : def.name;
}

/**
 * Rename a channel to its new sound's default name, but only when the user never
 * named it: its name is still the old default, ignoring a uniqueName " 2" suffix.
 * Call inside an edit, with `before` captured before the sound changed.
 */
function followSoundName(
  p: Project,
  channelId: string,
  before: Pick<Channel, "name" | "instrument" | "sampleId">,
): void {
  const channel = findChannel(p, channelId);
  if (!channel || before.name.replace(/ \d+$/, "") !== defaultName(before).replace(/ \d+$/, ""))
    return;
  const taken = p.channels.filter((other) => other.id !== channelId).map((other) => other.name);
  updateChannel(p, channelId, { name: uniqueName(defaultName(channel), taken) });
}

/**
 * Load a sample into a channel (switching to the sampler if needed). The channel
 * takes the sample's name only if it still had its default name.
 */
export function setChannelSample(channelId: string, sampleId: string): void {
  edit((p) => {
    const channel = findChannel(p, channelId);
    if (!channel) return;
    const before = {
      name: channel.name,
      instrument: channel.instrument,
      sampleId: channel.sampleId,
    };
    if (!getInstrument(channel.instrument).usesSample)
      setChannelInstrument(p, channelId, DEFAULT_INSTRUMENT);
    updateChannel(p, channelId, { sampleId });
    followSoundName(p, channelId, before);
  });
}

/** A sound dropped on a row: replace its sample, then say so with Undo (the user may not have meant it). */
export function dropOnChannel(channelId: string, sampleId: string): void {
  const name = findChannel(useProjectStore.getState().project, channelId)?.name;
  if (name === undefined) return;
  setChannelSample(channelId, sampleId);
  // setChannelSample may rename a default-named channel after its new sound.
  const after = findChannel(useProjectStore.getState().project, channelId)?.name ?? name;
  const sound = sampleName(sampleId);
  toastWithUndo(
    after === name ? `${name} now plays ${sound}` : `${name} is now ${after} (plays ${sound})`,
  );
}

/** Swap a channel's instrument, renaming it by the same rule as setChannelSample. */
export function setInstrument(channelId: string, kind: string): void {
  edit((p) => {
    const channel = findChannel(p, channelId);
    if (!channel || channel.instrument === kind) return;
    const before = {
      name: channel.name,
      instrument: channel.instrument,
      sampleId: channel.sampleId,
    };
    setChannelInstrument(p, channelId, kind);
    followSoundName(p, channelId, before);
  });
}

/**
 * Files dropped on the rack (importAudioFiles toasts the result): the first one
 * replaces the row's sound when dropped on a row, the rest add channels.
 */
export async function dropFiles(files: readonly File[], channelId: string | undefined) {
  const imported = await importAudioFiles(files);
  imported.forEach((meta, index) => {
    if (index === 0 && channelId) dropOnChannel(channelId, meta.id);
    else addSampleChannel(meta.id);
  });
}

/** Clone a channel right below itself and select the copy. */
export function cloneAndSelect(channelId: string): void {
  const id = edit((p) => cloneChannel(p, channelId));
  if (id) selectChannel(id);
}

/** Delete a channel (menu or Alt+Delete) with an Undo toast. */
export function deleteChannel(channelId: string): void {
  const name = findChannel(useProjectStore.getState().project, channelId)?.name;
  if (name === undefined) return;
  edit((p) => removeChannel(p, channelId));
  toastWithUndo(`Deleted ${name}`);
}

export function nudgeChannel(channelId: string, delta: number): void {
  edit((p) => moveChannel(p, channelId, delta));
}

/** The "+ Add channel" menu: factory sounds, an empty sampler, a synth. */
export function openAddMenu(at: Point): void {
  openMenu(at, [
    { heading: "Factory sounds" },
    ...factorySounds.map((sound) => ({
      label: sound.name,
      onSelect: () => addSampleChannel(sound.id),
    })),
    { heading: "Instruments" },
    {
      label: "Sampler (empty)",
      onSelect: () =>
        selectChannel(
          edit((p) => addChannel(p, { name: "Sampler", instrument: DEFAULT_INSTRUMENT })),
        ),
    },
    ...Object.entries(instruments)
      .filter(([, def]) => !def.usesSample)
      .map(([kind, def]) => ({
        label: def.name,
        onSelect: () =>
          selectChannel(edit((p) => addChannel(p, { name: def.name, instrument: kind }))),
      })),
  ]);
}

/** Out choices for a channel: Master, then "Insert 1 · Kick", … */
export function routeOptions(inserts: readonly { readonly id: string; readonly name: string }[]) {
  return [
    { id: MASTER_ID, label: "Master" },
    ...inserts.map((insert, index) => ({
      id: insert.id,
      label: `Insert ${index + 1} · ${insert.name}`,
    })),
  ];
}

/** Pick the mixer track a channel feeds (or a new insert). */
export function openRouteMenu(at: Point, channelId: string): void {
  const { project } = useProjectStore.getState();
  const current = findChannel(project, channelId)?.mixerTrackId;
  const route = (mixerTrackId: string) =>
    edit((p) => updateChannel(p, channelId, { mixerTrackId }));
  openMenu(at, [
    ...routeOptions(project.mixer.inserts).map((track) => ({
      label: track.label,
      checked: track.id === current,
      onSelect: () => route(track.id),
    })),
    "separator",
    {
      label: "New insert",
      onSelect: () =>
        edit((p) => {
          const name = findChannel(p, channelId)?.name;
          updateChannel(p, channelId, { mixerTrackId: addInsert(p, name) });
        }),
    },
  ]);
}

function openInstrumentMenu(at: Point, channelId: string): void {
  const current = findChannel(useProjectStore.getState().project, channelId)?.instrument;
  openMenu(
    at,
    Object.entries(instruments).map(([kind, def]) => ({
      label: def.name,
      checked: kind === current,
      onSelect: () => setInstrument(channelId, kind),
    })),
  );
}

/** The channel name button's context menu. */
export function openChannelMenu(at: Point, channelId: string): void {
  const entries: MenuEntry[] = [
    { label: "Rename", shortcut: "F2", onSelect: () => setRenaming(channelId) },
    { label: "Settings", onSelect: () => toggleExpanded(channelId) },
    { label: "Piano roll", onSelect: () => openPianoRoll(channelId) },
    "separator",
    { label: "Clone", shortcut: "Alt+C", onSelect: () => cloneAndSelect(channelId) },
    { label: "Move up", shortcut: "Alt+↑", onSelect: () => nudgeChannel(channelId, -1) },
    { label: "Move down", shortcut: "Alt+↓", onSelect: () => nudgeChannel(channelId, 1) },
    { label: "Route to insert…", onSelect: () => openRouteMenu(at, channelId) },
    { label: "Change instrument…", onSelect: () => openInstrumentMenu(at, channelId) },
    "separator",
    {
      label: "Delete",
      shortcut: "Alt+Del",
      danger: true,
      onSelect: () => deleteChannel(channelId),
    },
  ];
  openMenu(at, entries);
}

/** Where to open a menu for a contextmenu event: the pointer, or the element's corner for keyboard opens. */
export function menuPoint(event: {
  readonly clientX: number;
  readonly clientY: number;
  readonly currentTarget: Element;
}): Point {
  if (event.clientX !== 0 || event.clientY !== 0) return { x: event.clientX, y: event.clientY };
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: rect.left, y: rect.bottom };
}
