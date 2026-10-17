interface RenameFieldProps {
  readonly value: string;
  /** Called with the trimmed name when it is non-empty and changed. */
  readonly onRename: (name: string) => void;
  /** Called when editing ends (commit or cancel). */
  readonly onDone: () => void;
  /** Accessible name, e.g. "Channel name". */
  readonly label: string;
  readonly className?: string;
}

/** Inline rename input: Enter or blur commits, Escape cancels, empty reverts. */
export function RenameField({ value, onRename, onDone, label, className = "" }: RenameFieldProps) {
  return (
    <input
      autoFocus
      aria-label={label}
      defaultValue={value}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={(event) => {
        const name = event.currentTarget.value.trim();
        if (name && name !== value) onRename(name);
        onDone();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.currentTarget.value = value;
          event.currentTarget.blur();
        }
      }}
      className={`w-full min-w-0 rounded-sm border border-focus bg-well px-1 py-0.5 text-xs text-ink outline-none ${className}`}
    />
  );
}
