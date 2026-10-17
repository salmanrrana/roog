/**
 * The project store: the current Project (immutable, Immer-produced) plus undo
 * history. Components read it with narrow selectors:
 *
 *   const bpm = useProjectStore((s) => s.project.bpm);
 *
 * and write through `edit` with a command from core/commands.ts:
 *
 *   edit((p) => setStep(p, patternId, channelId, step, true), gesture);
 *
 * History is snapshot based: every edit pushes the previous project, which costs
 * almost nothing because unchanged branches are shared between snapshots.
 */
import { type Draft, createDraft, finishDraft, freeze } from "immer";
import { create } from "zustand";
import { createProject } from "@/core/defaults";
import type { Project } from "@/core/schema";

const HISTORY_LIMIT = 200;

export interface ProjectState {
  readonly project: Project;
  readonly past: readonly Project[];
  readonly future: readonly Project[];
  /** Gesture id of the latest edit. A later edit with the same id merges into its undo step. */
  readonly gesture: string | null;
}

export const useProjectStore = create<ProjectState>()(() => ({
  project: freeze(createProject(), true),
  past: [],
  future: [],
  gesture: null,
}));

/**
 * Apply an undoable edit and return whatever the recipe returns (handy for
 * commands that create things: `const id = edit((p) => addPattern(p))`).
 * Pass the same `gesture` id (e.g. one per pointerdown, from createId()) for every
 * edit of a drag so the whole drag is one undo step. Edits that change nothing
 * are ignored.
 */
export function edit<R>(recipe: (draft: Draft<Project>) => R, gesture?: string): R {
  const state = useProjectStore.getState();
  // createDraft/finishDraft instead of produce(): a recipe may return a value
  // (an id), which produce() would mistake for a replacement project.
  const draft = createDraft(state.project);
  const result = recipe(draft);
  const project = finishDraft(draft);
  if (project === state.project) return result;

  const merge = gesture !== undefined && gesture === state.gesture;
  useProjectStore.setState({
    project,
    past: merge ? state.past : [...state.past.slice(-(HISTORY_LIMIT - 1)), state.project],
    future: [],
    gesture: gesture ?? null,
  });
  return result;
}

export function undo(): void {
  const { project, past, future } = useProjectStore.getState();
  const previous = past.at(-1);
  if (!previous) return;
  useProjectStore.setState({
    project: previous,
    past: past.slice(0, -1),
    future: [project, ...future],
    gesture: null,
  });
}

export function redo(): void {
  const { project, past, future } = useProjectStore.getState();
  const next = future[0];
  if (!next) return;
  useProjectStore.setState({
    project: next,
    past: [...past, project],
    future: future.slice(1),
    gesture: null,
  });
}

/** Replace the whole project (open, new, import). Clears history. */
export function loadProject(project: Project): void {
  useProjectStore.setState({ project: freeze(project, true), past: [], future: [], gesture: null });
}

export const selectCanUndo = (state: ProjectState): boolean => state.past.length > 0;
export const selectCanRedo = (state: ProjectState): boolean => state.future.length > 0;
