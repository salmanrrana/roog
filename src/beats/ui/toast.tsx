import { create } from "zustand";
import { undo, useProjectStore } from "@/state/project-store";
import { Button } from "./Button";

export type ToastTone = "info" | "error";

export interface ToastAction {
  readonly label: string;
  readonly run: () => void;
}

interface Toast {
  readonly id: number;
  readonly message: string;
  readonly tone: ToastTone;
  readonly action: ToastAction | undefined;
}

const useToastStore = create<{ readonly toasts: readonly Toast[] }>()(() => ({ toasts: [] }));
let nextId = 1;

function dismiss(id: number): void {
  useToastStore.setState((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));
}

/**
 * Show a short status message ("Saved", "Couldn't read that file"). Info lasts 2.5 s,
 * errors and toasts with an action (like Undo) 6 s. The action button closes the toast.
 */
export function toast(message: string, tone: ToastTone = "info", action?: ToastAction): void {
  const id = nextId++;
  useToastStore.setState((state) => ({
    toasts: [...state.toasts.slice(-3), { id, message, tone, action }],
  }));
  setTimeout(() => dismiss(id), tone === "error" || action ? 6000 : 2500);
}

/**
 * Toast with an Undo button for an edit the user didn't watch happen. Call it right
 * after the `edit()`. Undo only steps back if no newer edit came since.
 */
export function toastWithUndo(message: string): void {
  const project = useProjectStore.getState().project;
  toast(message, "info", {
    label: "Undo",
    run: () => {
      if (useProjectStore.getState().project === project) undo();
      else toast("Newer edits came after this one. Press Ctrl+Z to step back.");
    },
  });
}

/** Renders toasts bottom-right. Mounted once by the app shell. */
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed right-3 bottom-3 z-50 flex flex-col items-end gap-2"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          className={`flex items-center gap-3 rounded-sm border bg-panel-2 px-3 py-2 text-sm shadow-xl shadow-black/50 ${item.tone === "error" ? "border-rec text-rec" : "border-line text-ink"} ${item.action ? "pointer-events-auto" : ""}`}
        >
          <p>{item.message}</p>
          {item.action && (
            <Button
              size="sm"
              onClick={() => {
                item.action?.run();
                dismiss(item.id);
              }}
            >
              {item.action.label}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
