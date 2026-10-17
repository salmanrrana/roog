import {
  type DragEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { addChannel } from "@/core/commands";
import type { FactorySound } from "@/core/contracts";
import { engine } from "@/engine";
import { type SampleMeta, deleteSample, importAudioFiles, useSampleLibrary } from "@/persistence";
import { factorySounds } from "@/sounds/factory";
import { edit, useProjectStore } from "@/state/project-store";
import { selectChannel } from "@/state/ui-store";
import { Button } from "@/ui/Button";
import { SAMPLE_MIME } from "@/ui/dnd";
import { openMenu } from "@/ui/menu";
import { toast } from "@/ui/toast";

const GROUPS = [
  { group: "drums", label: "Drums" },
  { group: "bass", label: "Bass" },
  { group: "fx", label: "FX" },
] as const satisfies readonly { group: FactorySound["group"]; label: string }[];

/** How long a previewed row flashes, matching the `animate-flash` keyframes. */
const PREVIEW_FLASH_MS = 700;

/** Add a sampler channel (the default instrument) playing the sound and select it. */
function addToRack(sampleId: string, name: string) {
  selectChannel(edit((p) => addChannel(p, { name, sampleId })));
}

/** Delete a user sample, naming the channels that go silent, with an Undo action. */
async function deleteWithUndo(sample: SampleMeta) {
  const users = useProjectStore
    .getState()
    .project.channels.filter((channel) => channel.sampleId === sample.id)
    .map((channel) => channel.name);
  const restore = await deleteSample(sample.id);
  const silent = users.length > 0 ? `. ${users.join(", ")} will go silent.` : "";
  toast(`Deleted “${sample.name}”${silent}`, "info", { label: "Undo", run: () => void restore() });
}

interface Sound {
  readonly id: string;
  readonly name: string;
}

/**
 * One browser row: [▶ name ⠿ +]. Click or Enter previews (the row flashes),
 * double-click or + adds a channel, drag onto the rack adds one or replaces a
 * row's sample. The + is skipped by Tab; keyboard users add via the context menu.
 */
function SoundItem({ sound, onDelete }: { readonly sound: Sound; readonly onDelete?: () => void }) {
  const [previewing, setPreviewing] = useState(0);

  useEffect(() => {
    if (previewing === 0) return;
    const timer = setTimeout(() => setPreviewing(0), PREVIEW_FLASH_MS);
    return () => clearTimeout(timer);
  }, [previewing]);

  function preview() {
    engine.previewSample(sound.id);
    setPreviewing((n) => n + 1);
  }

  function onMenu(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    openMenu({ x: event.clientX, y: event.clientY }, [
      { label: "Preview", onSelect: preview },
      { label: "Add to rack", onSelect: () => addToRack(sound.id, sound.name) },
      ...(onDelete ? [{ label: "Delete sample", danger: true, onSelect: onDelete }] : []),
    ]);
  }

  return (
    <li
      className={`group flex h-7 items-center rounded-sm hover:bg-panel-2 ${previewing ? "animate-flash" : ""}`}
    >
      <button
        type="button"
        draggable
        title="Click: preview · Double-click: add to rack · Drag onto the rack"
        onClick={preview}
        onDoubleClick={() => addToRack(sound.id, sound.name)}
        onContextMenu={onMenu}
        onDragStart={(event) => {
          event.dataTransfer.setData(SAMPLE_MIME, sound.id);
          event.dataTransfer.effectAllowed = "copy";
        }}
        className="flex h-full min-w-0 flex-1 cursor-grab items-center gap-1.5 rounded-sm px-1.5 text-left text-xs text-ink active:cursor-grabbing"
      >
        <span
          aria-hidden="true"
          className={`text-2xs ${previewing ? "text-acid" : "text-ink-mute"}`}
        >
          ▶
        </span>
        <span className="min-w-0 flex-1 truncate">{sound.name}</span>
        <span
          aria-hidden="true"
          className="text-xs text-ink-mute opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          ⠿
        </span>
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Add ${sound.name} to the rack`}
        title="Add to the rack (or double-click the sound)"
        onClick={() => addToRack(sound.id, sound.name)}
        className="mr-0.5 flex size-6 items-center justify-center rounded-sm font-mono text-xs text-ink-mute hover:bg-line hover:text-ink"
      >
        +
      </button>
    </li>
  );
}

/** A collapsible group of sounds, open by default. */
function Group({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <details open className="group/details">
      <summary className="caption flex cursor-pointer list-none items-center gap-1 px-2 py-1 select-none hover:bg-panel-2 hover:text-ink">
        <span
          aria-hidden="true"
          className="inline-block w-3 transition-transform group-open/details:rotate-90"
        >
          ›
        </span>
        {label}
      </summary>
      <ul className="px-1 pb-1">{children}</ul>
    </details>
  );
}

/**
 * The left sidebar: factory sounds by group and the user's imported samples.
 * Import with the button or by dropping audio files anywhere on the browser;
 * persistence shows the import toasts.
 */
export function Browser() {
  const samples = useSampleLibrary((s) => s.samples);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dropping, setDropping] = useState(false);

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropping(true);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    const to = event.relatedTarget;
    if (!(to instanceof Node) || !event.currentTarget.contains(to)) setDropping(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setDropping(false);
    void importAudioFiles([...event.dataTransfer.files]);
  }

  return (
    <div
      data-drop={dropping || undefined}
      className="relative flex min-h-full flex-col gap-1 pb-4 data-drop:bg-acid/10 data-drop:outline-2 data-drop:-outline-offset-2 data-drop:outline-acid"
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="sticky top-0 z-10 border-b border-line bg-panel px-2 py-1.5">
        <div className="flex items-center justify-between">
          <h2 className="panel-title">Browser</h2>
          <Button size="sm" onClick={() => fileInput.current?.click()}>
            Import
          </Button>
        </div>
        <p className="mt-1 text-2xs text-ink-dim">
          Click to hear · drag onto the rack · + adds a channel
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="audio/*"
          multiple
          hidden
          onChange={(event) => {
            const files = [...(event.currentTarget.files ?? [])];
            event.currentTarget.value = "";
            void importAudioFiles(files);
          }}
        />
      </header>

      {GROUPS.map(({ group, label }) => (
        <Group key={group} label={label}>
          {factorySounds
            .filter((sound) => sound.group === group)
            .map((sound) => (
              <SoundItem key={sound.id} sound={sound} />
            ))}
        </Group>
      ))}

      <Group label="My samples">
        {samples.map((sample) => (
          <SoundItem key={sample.id} sound={sample} onDelete={() => void deleteWithUndo(sample)} />
        ))}
        {samples.length === 0 && (
          <li className="px-1.5 py-1 text-xs text-ink-dim">
            Drop audio files here or click Import.
          </li>
        )}
      </Group>

      {dropping && (
        // Pinned to the bottom of the visible sidebar (mt-auto when the list is short, sticky when it scrolls).
        <p className="caption pointer-events-none sticky bottom-2 z-20 mx-auto mt-auto w-fit rounded-sm bg-panel px-2 py-1 text-acid">
          Drop audio files to import
        </p>
      )}
    </div>
  );
}
