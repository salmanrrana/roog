import { create } from "zustand";

export type ToastTone = "info" | "error";

interface Toast {
  readonly id: number;
  readonly message: string;
  readonly tone: ToastTone;
}

const useToastStore = create<{ readonly toasts: readonly Toast[] }>()(() => ({ toasts: [] }));
let nextId = 1;

/** Show a short status message ("Saved", "Couldn't read that file"). Errors stay longer. */
export function toast(message: string, tone: ToastTone = "info"): void {
  const id = nextId++;
  useToastStore.setState((state) => ({
    toasts: [...state.toasts.slice(-3), { id, message, tone }],
  }));
  setTimeout(
    () =>
      useToastStore.setState((state) => ({
        toasts: state.toasts.filter((item) => item.id !== id),
      })),
    tone === "error" ? 6000 : 2500,
  );
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
        <p
          key={item.id}
          className={`rounded-sm border bg-panel-2 px-3 py-2 text-sm shadow-xl shadow-black/50 ${item.tone === "error" ? "border-rec text-rec" : "border-line text-ink"}`}
        >
          {item.message}
        </p>
      ))}
    </div>
  );
}
