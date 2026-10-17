import { type DragEvent, type MouseEvent, type ReactNode, useRef } from "react";
import { addChannel } from "@/core/commands";
import type { FactorySound } from "@/core/contracts";
import { engine } from "@/engine";
import { type SampleMeta, deleteSample, importAudioFiles, useSampleLibrary } from "@/persistence";
import { factorySounds } from "@/sounds/factory";
import { edit } from "@/state/project-store";
import { selectChannel } from "@/state/ui-store";
import { SAMPLE_MIME } from "@/ui/dnd";
import { openMenu } from "@/ui/menu";
import { toast } from "@/ui/toast";

const GROUPS = [
  { group: "drums", label: "Drums" },
  { group: "bass", label: "Bass" },
  { group: "fx", label: "FX" },
] as const satisfies readonly { group: FactorySound["group"]; label: string }[];

/** Import picked or dropped files into "My samples". */
async function importFiles(files: readonly File[]) {
  const { length } = await importAudioFiles(files);
  if (length > 0) toast(`Imported ${length} sample${length === 1 ? "" : "s"}`);
}

/** Add a sampler channel (the default instrument) playing the sound and select it. */
function addToRack(sampleId: string, name: string) {
  selectChannel(edit((p) => addChannel(p, { name, sampleId })));
}

interface Sound {
  readonly id: string;
  readonly name: string;
}

/**
 * One browser entry. Click previews, double-click (or the + button) adds a
 * channel, drag onto the rack adds one or replaces a row's sample.
 */
function SoundItem({ sound, onDelete }: { readonly sound: Sound; readonly onDelete?: () => void }) {
  function onMenu(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    openMenu({ x: event.clientX, y: event.clientY }, [
      { label: "Preview", onSelect: () => engine.previewSample(sound.id) },
      { label: "Add to rack", onSelect: () => addToRack(sound.id, sound.name) },
      ...(onDelete ? [{ label: "Delete sample", danger: true, onSelect: onDelete }] : []),
    ]);
  }

  return (
    <li className="group flex items-center">
      <button
        type="button"
        draggable
        title="Click: preview · Double-click: add to rack · Drag onto the rack"
        onClick={() => engine.previewSample(sound.id)}
        onDoubleClick={() => addToRack(sound.id, sound.name)}
        onContextMenu={onMenu}
        onDragStart={(event) => {
          event.dataTransfer.setData(SAMPLE_MIME, sound.id);
          event.dataTransfer.effectAllowed = "copy";
        }}
        className="min-w-0 flex-1 cursor-grab truncate rounded-sm px-2 py-1 text-left text-xs text-ink-dim hover:bg-panel-2 hover:text-ink active:cursor-grabbing"
      >
        {sound.name}
      </button>
      <button
        type="button"
        aria-label={`Add ${sound.name} to the rack`}
        onClick={() => addToRack(sound.id, sound.name)}
        className="px-2 py-1 font-mono text-xs text-ink-dim opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-acid focus:opacity-100"
      >
        +
      </button>
    </li>
  );
}

function Group({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <details open className="group/details">
      <summary className="cursor-pointer list-none px-2 py-1 font-mono text-[10px] font-bold tracking-widest text-ink-dim uppercase select-none hover:text-ink">
        <span className="inline-block w-3 transition-transform group-open/details:rotate-90">
          ›
        </span>
        {label}
      </summary>
      <ul className="pb-1 pl-2">{children}</ul>
    </details>
  );
}

function deleteWithConfirm(sample: SampleMeta) {
  if (window.confirm(`Delete "${sample.name}" from My samples? Channels using it go silent.`))
    void deleteSample(sample.id);
}

/**
 * The left sidebar: factory sounds by group and the user's imported samples.
 * Import with the button or by dropping audio files anywhere on the browser.
 */
export function Browser() {
  const samples = useSampleLibrary((s) => s.samples);
  const fileInput = useRef<HTMLInputElement>(null);

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    event.currentTarget.setAttribute("data-drop", "");
  }

  function clearDrop(event: DragEvent<HTMLDivElement>) {
    const to = event.relatedTarget;
    if (!(to instanceof Node) || !event.currentTarget.contains(to))
      event.currentTarget.removeAttribute("data-drop");
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.currentTarget.removeAttribute("data-drop");
    void importFiles([...event.dataTransfer.files]);
  }

  return (
    <div
      className="flex min-h-full flex-col gap-1 pb-4 data-drop:bg-acid/10 data-drop:outline-2 data-drop:-outline-offset-2 data-drop:outline-acid"
      onDragOver={onDragOver}
      onDragLeave={clearDrop}
      onDrop={onDrop}
    >
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-panel px-2 py-1.5">
        <h2 className="font-display text-base leading-none tracking-wider uppercase">Browser</h2>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="rounded-sm border border-line bg-panel-2 px-2 py-0.5 text-[11px] font-bold tracking-wider uppercase hover:border-acid hover:text-acid"
        >
          Import
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="audio/*"
          multiple
          hidden
          onChange={(event) => {
            const files = [...(event.currentTarget.files ?? [])];
            event.currentTarget.value = "";
            void importFiles(files);
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
          <SoundItem key={sample.id} sound={sample} onDelete={() => deleteWithConfirm(sample)} />
        ))}
        {samples.length === 0 && (
          <li className="px-2 py-1 text-[11px] leading-snug text-ink-dim">
            Drop audio files here or hit Import.
          </li>
        )}
      </Group>
    </div>
  );
}
