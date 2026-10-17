import { type ReactNode, useEffect, useId, useRef } from "react";
import { Button } from "./Button";

interface DialogProps {
  readonly title: string;
  /** Called once when the dialog closes (Escape, ✕, backdrop click). Unmount it then. */
  readonly onClose: () => void;
  /** Extra header content next to the title. */
  readonly aside?: ReactNode;
  /** Overrides the default width. */
  readonly className?: string;
  readonly children: ReactNode;
}

/** Modal dialog: native <dialog> shown on mount; Escape, ✕ and a backdrop click close it. */
export function Dialog({ title, onClose, aside, className, children }: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const node = dialog.current;
    if (node && !node.open) node.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        dialog.current?.close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialog.current?.close();
      }}
      className={`m-auto rounded-sm border border-line bg-panel p-0 text-ink shadow-2xl shadow-black/60 backdrop:bg-black/60 ${className ?? "w-[min(36rem,calc(100vw-2rem))]"}`}
    >
      <div className="flex flex-col gap-3 p-4">
        <header className="flex items-center gap-3">
          <h2 id={titleId} className="font-display text-xl tracking-wide uppercase">
            {title}
          </h2>
          <div className="flex flex-1 items-center gap-2">{aside}</div>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Close"
            title="Close (Esc)"
            onClick={() => dialog.current?.close()}
          >
            ✕
          </Button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
