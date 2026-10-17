interface MuteLedProps {
  readonly muted: boolean;
  /** Channel or track name, used in the accessible name "Mute <name>". */
  readonly name: string;
  readonly onToggle: () => void;
  /** Shown in the tooltip, e.g. "1". */
  readonly shortcut?: string;
}

/** Sound on/off for rack channels, playlist tracks and mixer strips. Lit acid = sound on. */
export function MuteLed({ muted, name, onToggle, shortcut }: MuteLedProps) {
  const title = `${muted ? "Unmute" : "Mute"} ${name}${shortcut ? ` (${shortcut})` : ""} · lit = sound on`;
  return (
    <button
      type="button"
      aria-label={`Mute ${name}`}
      aria-pressed={muted}
      title={title}
      onClick={onToggle}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm border border-line bg-well hover:border-ink-dim"
    >
      <span
        aria-hidden="true"
        className={`size-2.5 rounded-full ${muted ? "bg-line" : "bg-acid shadow-[0_0_6px_var(--color-acid)]"}`}
      />
    </button>
  );
}
