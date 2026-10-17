import { beforeEach, expect, test } from "vitest";
import { addPattern, setBpm } from "@/core/commands";
import { createProject } from "@/core/defaults";
import { edit, loadProject, redo, undo, useProjectStore } from "./project-store";

const bpm = () => useProjectStore.getState().project.bpm;

beforeEach(() => loadProject(createProject()));

test("edit, undo and redo move through history", () => {
  edit((p) => setBpm(p, 90));
  edit((p) => setBpm(p, 100));
  undo();
  expect(bpm()).toBe(90);
  undo();
  expect(bpm()).toBe(128);
  redo();
  expect(bpm()).toBe(90);
});

test("edits sharing a gesture id are one undo step", () => {
  for (const value of [100, 110, 120]) edit((p) => setBpm(p, value), "drag-1");
  edit((p) => setBpm(p, 60), "drag-2");
  undo();
  expect(bpm()).toBe(120);
  undo();
  expect(bpm()).toBe(128);
});

test("edits that change nothing leave history alone", () => {
  edit((p) => setBpm(p, 128));
  expect(useProjectStore.getState().past).toHaveLength(0);
});

test("edit returns the recipe's result without treating it as a new project", () => {
  const id = edit((p) => addPattern(p));
  expect(useProjectStore.getState().project.patterns.map((pattern) => pattern.id)).toContain(id);
});

test("a new edit clears redo, and loading a project clears history", () => {
  edit((p) => setBpm(p, 90));
  undo();
  edit((p) => setBpm(p, 95));
  expect(useProjectStore.getState().future).toHaveLength(0);
  loadProject(createProject());
  expect(useProjectStore.getState().past).toHaveLength(0);
});
