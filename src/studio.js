import { createRackEngine } from "./rack-engine.js";
import { studioModules, studioPresets, studioRackConfig } from "./studio-modules.js";

const engine = createRackEngine({
  rackConfig: studioRackConfig,
  modules: studioModules,
  presets: studioPresets,
  storageKey: "roog-studio-layout-v1",
  cableSag: 70,
  defaultPresetId: "generative"
});

engine.init();

// Debug handle for inspecting the live rack from the console.
globalThis.roogStudio = engine;
