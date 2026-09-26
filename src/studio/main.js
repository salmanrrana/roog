import { createStudio } from "./engine.js";
import { createNoteInput } from "./midi.js";
import { catalog, categoryLabels } from "./modules/index.js";
import { fromNorm } from "./panel.js";
import { RACK, decodePatch, encodePatch, isPatchShape } from "./patch.js";
import { presets } from "./presets.js";
import { createVisualizer } from "./visualizer.js";

const AUTOSAVE_KEY = "roog-studio-patch-v2";
const MIDI_MAP_KEY = "roog-studio-midi-map-v1";

const $ = (selector) => document.querySelector(selector);
const statusText = $("[data-status-text]");
const powerButton = $("[data-power]");
const playButton = $("[data-play]");
const bpmInput = $("[data-bpm]");
const swingInput = $("[data-swing]");
const presetSelect = $("[data-preset]");
const hpReadout = $("[data-hp-readout]");
const learnButton = $("[data-learn]");
const recordButton = $("[data-record]");
const drawer = $("[data-drawer]");

document.documentElement.style.setProperty("--row-hp", String(RACK.rowHp));

function setStatus(message) {
  statusText.textContent = message;
}

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full storage: the rack still works, it just won't remember.
  }
}

let saveTimer = null;

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(
    () => writeJson(AUTOSAVE_KEY, studio.serialize()),
    400,
  );
}

const studio = createStudio({
  catalog,
  rack: RACK,
  rows: $("[data-rack-rows]"),
  cableLayer: $("[data-cable-layer]"),
  onStatus: setStatus,
  onChange() {
    scheduleSave();
    refreshReadout();
  },
});

function refreshReadout() {
  hpReadout.textContent = `${studio.moduleCount} modules · ${studio.cableCount} cables · ${studio.usedHp}/${studio.capacityHp} HP`;
}

function syncTransportUi() {
  bpmInput.value = String(studio.transport.bpm);
  swingInput.value = String(studio.transport.swing);
  playButton.setAttribute("aria-pressed", String(studio.transport.playing));
  playButton.querySelector(".ctrl-label").textContent = studio.transport.playing
    ? "Stop"
    : "Play";
}

function loadPatch(patch, label) {
  const skipped = studio.load(patch);

  syncTransportUi();
  refreshReadout();
  writeJson(AUTOSAVE_KEY, studio.serialize());
  setStatus(
    skipped > 0
      ? `${label} loaded · ${skipped} unknown parts skipped`
      : `${label} loaded`,
  );
}

/* ---------- power & transport ---------- */

const noteInput = createNoteInput({
  onNote: (note, velocity) => studio.noteInput(note, velocity),
  onControl: handleMidiControl,
  onStatus: setStatus,
});

async function powerOn() {
  await studio.powerOn();
  powerButton.setAttribute("aria-pressed", "true");
  document.body.dataset.power = "on";

  const devices = await noteInput.enableMidi();

  setStatus(
    devices > 0
      ? `Powered · ${devices} MIDI device(s) listening`
      : "Powered · space to play/stop · A–K plays KEYS",
  );
}

powerButton.addEventListener("click", async () => {
  if (powerButton.getAttribute("aria-pressed") === "true") {
    await studio.powerOff();
    powerButton.setAttribute("aria-pressed", "false");
    delete document.body.dataset.power;
    syncTransportUi();
    setStatus("Powered down");
    return;
  }

  await powerOn();
  studio.transport.start();
  syncTransportUi();
});

async function togglePlay() {
  if (studio.transport.playing) {
    studio.transport.stop();
  } else {
    if (powerButton.getAttribute("aria-pressed") !== "true") {
      await powerOn();
    }

    studio.transport.start();
  }

  syncTransportUi();
}

playButton.addEventListener("click", togglePlay);

document.addEventListener("keydown", (event) => {
  const typing =
    event.target instanceof HTMLElement &&
    ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(event.target.tagName);

  if (
    event.code === "Space" &&
    !typing &&
    !event.target.closest?.("[role=slider]")
  ) {
    event.preventDefault();
    togglePlay();
  }
});

bpmInput.addEventListener("change", () => {
  studio.transport.bpm = Number(bpmInput.value) || 120;
  bpmInput.value = String(studio.transport.bpm);
  scheduleSave();
});

swingInput.addEventListener("input", () => {
  studio.transport.swing = Number(swingInput.value);
  scheduleSave();
});

$("[data-tap]").addEventListener("click", () => {
  bpmInput.value = String(studio.transport.tap());
  scheduleSave();
});

/* ---------- patches ---------- */

presetSelect.append(
  ...presets.map((preset) => new Option(preset.name, preset.id)),
);
presetSelect.addEventListener("change", () => {
  const preset = presets.find(
    (candidate) => candidate.id === presetSelect.value,
  );

  if (preset) {
    loadPatch(preset.patch, `${preset.name} · ${preset.blurb}`);
  }
});

$("[data-clear]").addEventListener("click", () => {
  loadPatch(
    {
      modules: [{ id: "out", type: "out" }],
      cables: [],
      bpm: studio.transport.bpm,
    },
    "Empty rack · add modules with + MODULE",
  );
  presetSelect.value = "";
});

$("[data-share]").addEventListener("click", async () => {
  const url = `${location.origin}${location.pathname}#patch=${encodePatch(studio.serialize())}`;

  history.replaceState(null, "", url);

  try {
    await navigator.clipboard.writeText(url);
    setStatus("Share link copied · anyone who opens it gets this exact patch");
  } catch {
    setStatus("Share link is in the address bar · copy it from there");
  }
});

/* ---------- add-module drawer ---------- */

function buildDrawer() {
  const groups = Object.entries(categoryLabels).map(([category, label]) => {
    const section = document.createElement("section");
    const heading = document.createElement("h3");
    const list = document.createElement("div");

    heading.textContent = label;
    list.className = "drawer-list";
    section.className = `drawer-group module-${category}`;

    catalog
      .filter((def) => def.category === category)
      .forEach((def) => {
        const button = document.createElement("button");
        const parts = [
          ["drawer-name", def.name],
          ["drawer-hp", `${def.hp}HP`],
          ["drawer-blurb", def.blurb],
        ].map(([className, text]) => {
          const span = document.createElement("span");

          span.className = className;
          span.textContent = text;
          return span;
        });

        button.type = "button";
        button.className = "drawer-item";
        button.append(...parts);
        button.addEventListener("click", () => {
          const id = studio.addModule(def.type);

          if (id) {
            drawer.close();
            requestAnimationFrame(() =>
              document
                .querySelector(`[data-module-id="${id}"]`)
                ?.scrollIntoView({ block: "nearest", inline: "nearest" }),
            );
          }
        });
        list.append(button);
      });

    section.append(heading, list);
    return section;
  });

  drawer.querySelector("[data-drawer-body]").replaceChildren(...groups);
}

buildDrawer();
$("[data-add]").addEventListener("click", () => drawer.showModal());
$("[data-drawer-close]").addEventListener("click", () => drawer.close());
drawer.addEventListener("click", (event) => {
  if (event.target === drawer) {
    drawer.close();
  }
});

/* ---------- recording ---------- */

let recorder = null;

recordButton.addEventListener("click", async () => {
  if (recorder) {
    recorder.stop();
    return;
  }

  await powerOn();

  const destination = studio.audio.createMediaStreamDestination();
  const chunks = [];

  studio.bus.output.connect(destination);
  recorder = new MediaRecorder(destination.stream);
  recorder.ondataavailable = (event) => chunks.push(event.data);
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: recorder.mimeType });
    const link = document.createElement("a");

    link.href = URL.createObjectURL(blob);
    link.download = `roog-${new Date().toISOString().slice(0, 19).replaceAll(":", "")}.${recorder.mimeType.includes("ogg") ? "ogg" : "webm"}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
    studio.bus.output.disconnect(destination);
    recorder = null;
    recordButton.setAttribute("aria-pressed", "false");
    setStatus("Recording saved to your downloads");
  };
  recorder.start();
  recordButton.setAttribute("aria-pressed", "true");
  setStatus("Recording the master output · press REC again to stop");
});

/* ---------- MIDI learn ---------- */

const midiMap = readJson(MIDI_MAP_KEY) ?? {};
let learning = null;

learnButton.addEventListener("click", () => {
  const on = learnButton.getAttribute("aria-pressed") !== "true";

  learnButton.setAttribute("aria-pressed", String(on));
  document.body.classList.toggle("midi-learning", on);
  document.querySelector(".knob-learn")?.classList.remove("knob-learn");
  learning = null;
  setStatus(
    on
      ? "MIDI learn: click a knob, then move a knob on your controller"
      : "MIDI learn off",
  );

  if (on) {
    noteInput.enableMidi();
  }
});

// While learning, clicking a knob selects it instead of turning it.
document.addEventListener(
  "pointerdown",
  (event) => {
    const knob = event.target.closest?.(".knob");

    if (!document.body.classList.contains("midi-learning") || !knob) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    document.querySelector(".knob-learn")?.classList.remove("knob-learn");
    knob.classList.add("knob-learn");
    learning = {
      module: knob.closest(".module-panel").dataset.moduleId,
      control: knob.dataset.controlId,
    };
    setStatus("Now move a knob or fader on your MIDI controller");
  },
  true,
);

function handleMidiControl(key, value) {
  if (learning) {
    midiMap[key] = learning;
    writeJson(MIDI_MAP_KEY, midiMap);
    setStatus(
      `CC ${key.split(":")[1]} → ${learning.module} ${learning.control}`,
    );
    document.querySelector(".knob-learn")?.classList.remove("knob-learn");
    learning = null;
    return;
  }

  const target = midiMap[key];
  const control = target && studio.controlOf(target.module, target.control);

  if (control && !control.options) {
    studio.setValue(target.module, target.control, fromNorm(control, value));
  }
}

/* ---------- cable visibility ---------- */

const CABLE_MODES = ["solid", "ghost", "hidden"];
const cablesButton = $("[data-cables]");

cablesButton.addEventListener("click", () => {
  const next =
    CABLE_MODES[
      (CABLE_MODES.indexOf(document.body.dataset.cables ?? "solid") + 1) %
        CABLE_MODES.length
    ];

  document.body.dataset.cables = next;
  cablesButton.querySelector(".ctrl-label").textContent = `Cables: ${next}`;
});

/* ---------- visualizer ---------- */

const visualizer = createVisualizer($("[data-visualizer]"), { studio });
const modeButtons = document.querySelectorAll("[data-vis-mode]");

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    visualizer.mode = button.dataset.visMode;
    modeButtons.forEach((candidate) =>
      candidate.setAttribute("aria-pressed", String(candidate === button)),
    );
  });
});

$("[data-vis-full]").addEventListener("click", () => {
  const stage = $(".visualizer");

  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    stage.requestFullscreen?.();
  }
});

/* ---------- boot ---------- */

function initialPatch() {
  const shared = location.hash.startsWith("#patch=")
    ? decodePatch(location.hash.slice(7))
    : null;

  if (shared) {
    return { patch: shared, label: "Shared patch" };
  }

  const saved = readJson(AUTOSAVE_KEY);

  if (isPatchShape(saved)) {
    return { patch: saved, label: "Your last patch" };
  }

  return {
    patch: presets[0].patch,
    label: `${presets[0].name} · ${presets[0].blurb}`,
  };
}

const { patch, label } = initialPatch();

loadPatch(patch, `${label} · hit POWER`);
presetSelect.value = patch === presets[0].patch ? presets[0].id : "";

// Console handle for poking at the live rack.
globalThis.roog = studio;
