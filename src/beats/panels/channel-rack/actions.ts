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
  updateChannel,
} from "@/core/commands";
import { MASTER_ID } from "@/core/defaults";
import { DEFAULT_INSTRUMENT, getInstrument, instruments } from "@/instruments";
import { importAudioFiles, useSampleLibrary } from "@/persistence";
import { factorySounds, getFactorySound } from "@/sounds/factory";
import { edit, useProjectStore } from "@/state/project-store";
import { openPianoRoll, selectChannel } from "@/state/ui-store";
import { type MenuEntry, openMenu } from "@/ui/menu";
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

/** Add a sampler channel (on its own insert) playing `sampleId`, and select it. */
export function addSampleChannel(sampleId: string): void {
  selectChannel(edit((p) => addChannel(p, { name: sampleName(sampleId), sampleId })));
}

/** Load a sample into a channel (switching to the sampler if needed) and name the channel after it. */
export function setChannelSample(channelId: string, sampleId: string): void {
  edit((p) => {
    const channel = findChannel(p, channelId);
    if (!channel) return;
    if (!getInstrument(channel.instrument).usesSample)
      setChannelInstrument(p, channelId, DEFAULT_INSTRUMENT);
    updateChannel(p, channelId, { sampleId, name: sampleName(sampleId) });
  });
}

/** Files dropped on the rack: the first replaces the row's sample (if dropped on a row), the rest add channels. */
export async function dropFiles(files: readonly File[], channelId: string | undefined) {
  const imported = await importAudioFiles(files);
  imported.forEach((meta, index) => {
    if (index === 0 && channelId) setChannelSample(channelId, meta.id);
    else addSampleChannel(meta.id);
  });
}

/** Clone a channel right below itself and select the copy. */
export function cloneAndSelect(channelId: string): void {
  const id = edit((p) => cloneChannel(p, channelId));
  if (id) selectChannel(id);
}

export function deleteChannel(channelId: string): void {
  edit((p) => removeChannel(p, channelId));
}

export function nudgeChannel(channelId: string, delta: number): void {
  edit((p) => moveChannel(p, channelId, delta));
}

/** The "+ Add" menu: factory sounds, an empty sampler, a synth. */
export function openAddMenu(at: Point): void {
  openMenu(at, [
    ...factorySounds.map((sound) => ({
      label: sound.name,
      onSelect: () => addSampleChannel(sound.id),
    })),
    "separator",
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

/** Pick the mixer track a channel feeds (or a new insert). */
export function openRouteMenu(at: Point, channelId: string): void {
  const { project } = useProjectStore.getState();
  const current = findChannel(project, channelId)?.mixerTrackId;
  const route = (mixerTrackId: string) =>
    edit((p) => updateChannel(p, channelId, { mixerTrackId }));
  const tracks = [
    { id: MASTER_ID, label: "Master" },
    ...project.mixer.inserts.map((insert, index) => ({
      id: insert.id,
      label: `${index + 1}  ${insert.name}`,
    })),
  ];
  openMenu(at, [
    ...tracks.map((track) => ({
      label: `${track.id === current ? "● " : ""}${track.label}`,
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
      label: `${kind === current ? "● " : ""}${def.name}`,
      onSelect: () => edit((p) => setChannelInstrument(p, channelId, kind)),
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
