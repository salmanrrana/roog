import { makeFuzzCurve, placeholderModules, rackConfig } from "./rack-shell.js";
import { createAudioGraphHost } from "./audio-graph-host.js";
import { canPatchPorts, createModulePanel, createModuleRegistry } from "./module-framework.js";

const rackFrame = document.querySelector(".rack-frame");
const rackRow = document.querySelector("[data-rack-row]");
const hpGrid = document.querySelector("[data-hp-grid]");
const cableLayer = document.querySelector("[data-patch-cable-layer]");
const hpReadout = document.querySelector("[data-hp-readout]");
const powerBus = document.querySelector("[data-power-bus]");
const statusText = document.querySelector("[data-status-text]");
const layoutStorageKey = "roog-module-layout-v1";
const legacyModuleIds = new Map([["blank-left", "roog-audio-input"]]);
const moduleRegistry = createModuleRegistry();
const graphHost = createAudioGraphHost();
const patches = [];
let activePatchStart = null;
let previewPoint = null;
let patchIdSeed = 0;
let moduleOrder = [];
let draggedModuleId = null;

placeholderModules.forEach((moduleDefinition) => {
  const registeredModule = moduleRegistry.register(moduleDefinition);
  graphHost.registerModule(registeredModule);
});

moduleOrder = loadModuleOrder(moduleRegistry.list());

function createHpGrid(totalHp) {
  const fragment = document.createDocumentFragment();

  for (let hp = 1; hp <= totalHp; hp += 1) {
    const marker = document.createElement("span");
    marker.className = "hp-marker";
    marker.dataset.hp = String(hp);
    marker.setAttribute("aria-hidden", "true");

    if (hp % 4 === 0) {
      marker.classList.add("hp-marker-major");
    }

    fragment.append(marker);
  }

  hpGrid.replaceChildren(fragment);
}

function getPowerRailClass(rail) {
  if (rail.startsWith("+")) {
    return "bus-lane-positive";
  }

  if (rail.startsWith("-")) {
    return "bus-lane-negative";
  }

  return "bus-lane-ground";
}

function renderPowerBus(powerRails) {
  const label = document.createElement("span");
  label.className = "bus-label";
  label.textContent = "Power bus";

  const lanes = powerRails.map((rail) => {
    const lane = document.createElement("span");
    lane.className = `bus-lane ${getPowerRailClass(rail)}`;
    lane.textContent = rail;
    return lane;
  });

  powerBus.replaceChildren(label, ...lanes);
}

function getDefaultModuleOrder(registeredModules) {
  return registeredModules.map((moduleDefinition) => moduleDefinition.id);
}

function isOrderWithinRackCapacity(order) {
  const usedHp = order.reduce((total, moduleId) => total + (moduleRegistry.get(moduleId)?.hp ?? 0), 0);

  return usedHp <= rackConfig.totalHp;
}

function loadModuleOrder(registeredModules) {
  const defaultOrder = getDefaultModuleOrder(registeredModules);

  try {
    const savedOrder = JSON.parse(localStorage.getItem(layoutStorageKey) ?? "null");

    if (!Array.isArray(savedOrder)) {
      return defaultOrder;
    }

    const knownIds = new Set(defaultOrder);
    const migratedOrder = savedOrder.map((moduleId) => legacyModuleIds.get(moduleId) ?? moduleId);
    const restoredOrder = migratedOrder.filter(
      (moduleId, index) => knownIds.has(moduleId) && migratedOrder.indexOf(moduleId) === index
    );
    const missingIds = defaultOrder.filter((moduleId) => !restoredOrder.includes(moduleId));
    const nextOrder = [...restoredOrder, ...missingIds];

    return isOrderWithinRackCapacity(nextOrder) ? nextOrder : defaultOrder;
  } catch {
    return defaultOrder;
  }
}

function saveModuleOrder() {
  try {
    localStorage.setItem(layoutStorageKey, JSON.stringify(moduleOrder));
  } catch {
    setPatchStatus("Module order changed, but this browser could not persist the layout");
  }
}

function getOrderedModules() {
  const registeredModules = moduleRegistry.list();
  const modulesById = new Map(registeredModules.map((moduleDefinition) => [moduleDefinition.id, moduleDefinition]));
  const orderedIds = moduleOrder.filter((moduleId) => modulesById.has(moduleId));
  const missingIds = getDefaultModuleOrder(registeredModules).filter((moduleId) => !orderedIds.includes(moduleId));

  moduleOrder = [...orderedIds, ...missingIds];
  return moduleOrder.map((moduleId) => modulesById.get(moduleId));
}

function getPortDescriptor(jack) {
  const moduleDefinition = moduleRegistry.get(jack.dataset.moduleId);
  const port = moduleDefinition?.ports.find((candidate) => candidate.id === jack.dataset.portId);

  if (!moduleDefinition || !port) {
    return null;
  }

  return {
    jack,
    moduleId: moduleDefinition.id,
    moduleName: moduleDefinition.name,
    port
  };
}

function normalizePatchEndpoints(start, end) {
  if (canPatchPorts(start.port, end.port)) {
    return { source: start, target: end };
  }

  if (canPatchPorts(end.port, start.port)) {
    return { source: end, target: start };
  }

  return null;
}

function getJackPoint(jack) {
  const jackRect = jack.getBoundingClientRect();
  const rackRect = rackFrame.getBoundingClientRect();

  return {
    x: jackRect.left + jackRect.width / 2 - rackRect.left + rackFrame.scrollLeft,
    y: jackRect.top + jackRect.height / 2 - rackRect.top + rackFrame.scrollTop
  };
}

function refreshEndpointJack(endpoint) {
  if (endpoint.jack?.isConnected) {
    return endpoint.jack;
  }

  const jack = [...rackRow.querySelectorAll(".jack")].find(
    (candidate) =>
      candidate.dataset.moduleId === endpoint.moduleId && candidate.dataset.portId === endpoint.port.id
  );

  endpoint.jack = jack ?? null;
  return endpoint.jack;
}

function getCablePath(startPoint, endPoint) {
  const slack = Math.max(48, Math.abs(endPoint.x - startPoint.x) * 0.38);

  return [
    `M ${startPoint.x} ${startPoint.y}`,
    `C ${startPoint.x + slack} ${startPoint.y}`,
    `${endPoint.x - slack} ${endPoint.y}`,
    `${endPoint.x} ${endPoint.y}`
  ].join(" ");
}

function setPatchStatus(message) {
  const patchCount = patches.length === 1 ? "1 cable" : `${patches.length} cables`;
  statusText.textContent = message ?? `${graphHost.registeredModuleCount} modules registered · ${patchCount}`;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function createCablePath(pathData, type, extraClass, patchId) {
  const path = document.createElementNS(SVG_NS, "path");
  path.classList.add("patch-cable", `patch-cable-${type}`);

  if (extraClass) {
    path.classList.add(extraClass);
  }

  if (patchId) {
    path.dataset.patchId = patchId;
  }

  path.setAttribute("d", pathData);
  return path;
}

function createPlug(point, type) {
  const plug = document.createElementNS(SVG_NS, "circle");
  plug.classList.add("patch-plug", `patch-plug-${type}`);
  plug.setAttribute("cx", String(point.x));
  plug.setAttribute("cy", String(point.y));
  plug.setAttribute("r", "8");
  return plug;
}

function renderCableLayer() {
  const frameWidth = Math.max(rackFrame.clientWidth, rackRow.scrollWidth);
  const frameHeight = rackFrame.clientHeight;
  const cableElements = [];

  cableLayer.setAttribute("viewBox", `0 0 ${frameWidth} ${frameHeight}`);
  cableLayer.style.width = `${frameWidth}px`;
  cableLayer.style.height = `${frameHeight}px`;

  patches.forEach((patch) => {
    const sourceJack = refreshEndpointJack(patch.source);
    const targetJack = refreshEndpointJack(patch.target);

    if (!sourceJack || !targetJack) {
      return;
    }

    const type = patch.source.port.type;
    const startPoint = getJackPoint(patch.source.jack);
    const endPoint = getJackPoint(patch.target.jack);
    const pathData = getCablePath(startPoint, endPoint);

    const core = createCablePath(pathData, type, null, patch.id);
    core.setAttribute(
      "aria-label",
      `${patch.source.moduleName} ${patch.source.port.label} to ${patch.target.moduleName} ${patch.target.port.label}`
    );

    cableElements.push(
      createCablePath(pathData, type, "patch-cable-underlay"),
      core,
      createCablePath(pathData, type, "patch-cable-sheen"),
      createPlug(startPoint, type),
      createPlug(endPoint, type)
    );
  });

  if (activePatchStart && previewPoint) {
    const startPoint = getJackPoint(activePatchStart.jack);
    const pathData = getCablePath(startPoint, previewPoint);

    cableElements.push(
      createCablePath(pathData, activePatchStart.port.type, "patch-cable-preview"),
      createPlug(startPoint, activePatchStart.port.type)
    );
  }

  cableLayer.replaceChildren(...cableElements);
}

function clearActivePatch() {
  activePatchStart?.jack.classList.remove("jack-patching");
  activePatchStart = null;
  previewPoint = null;
  rackRow.querySelectorAll(".jack-compatible, .jack-incompatible").forEach((jack) => {
    jack.classList.remove("jack-compatible", "jack-incompatible");
  });
  renderCableLayer();
}

function markPatchTargets(start) {
  rackRow.querySelectorAll(".jack").forEach((jack) => {
    if (jack === start.jack) {
      return;
    }

    const target = getPortDescriptor(jack);

    if (!target) {
      return;
    }

    jack.classList.add(normalizePatchEndpoints(start, target) ? "jack-compatible" : "jack-incompatible");
  });
}

function connectPatch(start, end) {
  const endpoints = normalizePatchEndpoints(start, end);

  if (!endpoints) {
    setPatchStatus("Incompatible patch: signal type or direction does not match");
    return;
  }

  try {
    const connectionId = graphHost.connectPorts(
      endpoints.source.moduleId,
      endpoints.source.port,
      endpoints.target.moduleId,
      endpoints.target.port
    );

    patchIdSeed += 1;
    patches.push({
      id: `patch-${patchIdSeed}`,
      connectionId,
      source: endpoints.source,
      target: endpoints.target
    });
    setPatchStatus(
      `Patched ${endpoints.source.moduleName} ${endpoints.source.port.label} to ${endpoints.target.moduleName} ${endpoints.target.port.label}`
    );
  } catch (error) {
    setPatchStatus(error.message);
  }
}

function startPatch(start) {
  activePatchStart = start;
  previewPoint = getJackPoint(start.jack);
  start.jack.classList.add("jack-patching");
  markPatchTargets(start);
  setPatchStatus(`Patching from ${start.moduleName} ${start.port.label}`);
  renderCableLayer();
}

function removePatch(patchId) {
  const patchIndex = patches.findIndex((patch) => patch.id === patchId);

  if (patchIndex === -1) {
    return;
  }

  const [patch] = patches.splice(patchIndex, 1);
  graphHost.disconnect(patch.connectionId);
  setPatchStatus(`Removed ${patch.source.moduleName} to ${patch.target.moduleName} patch`);
  renderCableLayer();
}

function handlePatchPointerDown(event) {
  const jack = event.target.closest(".jack");

  if (!jack) {
    return;
  }

  const start = getPortDescriptor(jack);

  if (!start) {
    return;
  }

  event.preventDefault();
  startPatch(start);
}

function handlePatchPointerMove(event) {
  if (!activePatchStart) {
    return;
  }

  const rackRect = rackFrame.getBoundingClientRect();
  previewPoint = {
    x: event.clientX - rackRect.left + rackFrame.scrollLeft,
    y: event.clientY - rackRect.top + rackFrame.scrollTop
  };
  renderCableLayer();
}

function handlePatchPointerUp(event) {
  if (!activePatchStart) {
    return;
  }

  const jack = document.elementFromPoint(event.clientX, event.clientY)?.closest(".jack");
  const target = jack && jack !== activePatchStart.jack ? getPortDescriptor(jack) : null;

  if (target) {
    connectPatch(activePatchStart, target);
  }

  clearActivePatch();
}

function bindPatchCables() {
  rackRow.addEventListener("pointerdown", handlePatchPointerDown);
  rackRow.addEventListener("keydown", (event) => {
    const jack = event.target.closest(".jack");

    if (!jack) {
      return;
    }

    if (event.key === "Escape") {
      clearActivePatch();
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const target = getPortDescriptor(jack);

    if (!target) {
      return;
    }

    event.preventDefault();

    if (!activePatchStart) {
      startPatch(target);
      return;
    }

    if (target.jack !== activePatchStart.jack) {
      connectPatch(activePatchStart, target);
    }

    clearActivePatch();
  });
  document.addEventListener("pointermove", handlePatchPointerMove);
  document.addEventListener("pointerup", handlePatchPointerUp);
  cableLayer.addEventListener("click", (event) => {
    const cable = event.target.closest(".patch-cable[data-patch-id]");

    if (cable) {
      removePatch(cable.dataset.patchId);
    }
  });
  rackFrame.addEventListener("scroll", renderCableLayer);
  window.addEventListener("resize", renderCableLayer);
}

function moveModule(moduleId, targetIndex) {
  const currentIndex = moduleOrder.indexOf(moduleId);

  if (currentIndex === -1 || targetIndex === currentIndex) {
    return false;
  }

  const nextOrder = moduleOrder.slice();

  nextOrder.splice(currentIndex, 1);
  nextOrder.splice(targetIndex, 0, moduleId);

  if (!isOrderWithinRackCapacity(nextOrder)) {
    setPatchStatus("Cannot move module: rack layout exceeds row capacity");
    return false;
  }

  moduleOrder = nextOrder;
  saveModuleOrder();
  renderRack();
  renderCableLayer();
  return true;
}

function moveDraggedModule(overPanel, clientX) {
  if (!draggedModuleId || overPanel.dataset.moduleId === draggedModuleId) {
    return;
  }

  const overIndex = moduleOrder.indexOf(overPanel.dataset.moduleId);
  const currentIndex = moduleOrder.indexOf(draggedModuleId);

  if (overIndex === -1 || currentIndex === -1) {
    return;
  }

  const overRect = overPanel.getBoundingClientRect();
  let targetIndex = clientX > overRect.left + overRect.width / 2 ? overIndex + 1 : overIndex;

  if (currentIndex < targetIndex) {
    targetIndex -= 1;
  }

  if (moveModule(draggedModuleId, targetIndex)) {
    const draggedPanel = rackRow.querySelector(`[data-module-id="${draggedModuleId}"]`);

    draggedPanel?.classList.add("module-dragging");
    draggedPanel?.setAttribute("aria-grabbed", "true");
  }
}

function handleModuleReorderPointerDown(event) {
  const dragHandle = event.target.closest(".module-title");
  const panel = dragHandle?.closest(".module-panel");

  if (!panel) {
    return;
  }

  event.preventDefault();
  draggedModuleId = panel.dataset.moduleId;
  panel.classList.add("module-dragging");
  panel.setAttribute("aria-grabbed", "true");
  setPatchStatus(`Dragging ${panel.querySelector(".module-title span")?.textContent ?? "module"}`);
}

function handleModuleReorderPointerMove(event) {
  if (!draggedModuleId) {
    return;
  }

  const overPanel = document.elementFromPoint(event.clientX, event.clientY)?.closest(".module-panel");

  if (overPanel) {
    moveDraggedModule(overPanel, event.clientX);
  }
}

function clearModuleDrag() {
  if (!draggedModuleId) {
    return;
  }

  const moduleDefinition = moduleRegistry.get(draggedModuleId);
  const draggedPanel = rackRow.querySelector(`[data-module-id="${draggedModuleId}"]`);

  draggedPanel?.classList.remove("module-dragging");
  draggedPanel?.setAttribute("aria-grabbed", "false");
  setPatchStatus(`${moduleDefinition?.name ?? "Module"} moved · layout saved`);
  draggedModuleId = null;
}

function handleModuleReorderKeyDown(event) {
  const dragHandle = event.target.closest(".module-title");
  const panel = dragHandle?.closest(".module-panel");

  if (!panel || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) {
    return;
  }

  const currentIndex = moduleOrder.indexOf(panel.dataset.moduleId);
  const targetIndex = event.key === "ArrowLeft" ? currentIndex - 1 : currentIndex + 1;

  if (targetIndex < 0 || targetIndex >= moduleOrder.length) {
    return;
  }

  event.preventDefault();

  if (moveModule(panel.dataset.moduleId, targetIndex)) {
    rackRow.querySelector(`[data-module-id="${panel.dataset.moduleId}"] .module-title`)?.focus();
    setPatchStatus("Module moved with keyboard · layout saved");
  }
}

function bindModuleReordering() {
  rackRow.addEventListener("pointerdown", handleModuleReorderPointerDown);
  rackRow.addEventListener("keydown", handleModuleReorderKeyDown);
  document.addEventListener("pointermove", handleModuleReorderPointerMove);
  document.addEventListener("pointerup", clearModuleDrag);
  document.addEventListener("pointercancel", clearModuleDrag);
}

const powerButton = document.querySelector("[data-power]");
const statusStrip = document.querySelector(".status-strip");
const rackFramePower = document.querySelector(".rack-frame");
const presetSelect = document.querySelector("[data-preset]");

const presets = [
  {
    id: "classic-bass",
    name: "Classic Bass",
    blurb: "Moog-style subtractive growl",
    connections: [
      ["roog-vco", "audio", "output", "roog-vcf", "audio", "input"],
      ["roog-vcf", "audio", "output", "roog-vca", "audio", "input"],
      ["roog-vca", "audio", "output", "output-placeholder", "left", "input"],
      ["roog-vca", "audio", "output", "output-placeholder", "right", "input"],
      ["roog-lfo", "cv", "output", "roog-vcf", "cutoff", "input"],
      ["roog-envelope", "cv", "output", "roog-vca", "amp", "input"]
    ],
    controls: {
      "roog-vco": { frequency: 110, waveform: "sawtooth", detune: 0 },
      "roog-vcf": { cutoff: 420, resonance: 7 },
      "roog-lfo": { rate: 0.25, waveform: "sine", depth: 520 },
      "roog-vca": { level: 0.22 }
    }
  },
  {
    id: "fuzz-storm",
    name: "Fuzz Storm",
    blurb: "VCO slammed through the FANG into a screaming filter",
    connections: [
      ["roog-vco", "audio", "output", "roog-drive", "audio", "input"],
      ["roog-drive", "audio", "output", "roog-vcf", "audio", "input"],
      ["roog-vcf", "audio", "output", "roog-vca", "audio", "input"],
      ["roog-vca", "audio", "output", "output-placeholder", "left", "input"],
      ["roog-vca", "audio", "output", "output-placeholder", "right", "input"],
      ["roog-lfo", "cv", "output", "roog-vcf", "cutoff", "input"],
      ["roog-envelope", "cv", "output", "roog-vca", "amp", "input"]
    ],
    controls: {
      "roog-vco": { frequency: 70, waveform: "square", detune: 7 },
      "roog-drive": { drive: 42, tone: 2600, level: 0.6 },
      "roog-vcf": { cutoff: 1600, resonance: 9 },
      "roog-lfo": { rate: 5, waveform: "triangle", depth: 900 },
      "roog-vca": { level: 0.3 }
    }
  },
  {
    id: "noise-wash",
    name: "Noise Wash",
    blurb: "Filtered noise drifting through SPACE echo",
    connections: [
      ["roog-noise", "noise", "output", "roog-vcf", "audio", "input"],
      ["roog-vcf", "audio", "output", "roog-space", "audio", "input"],
      ["roog-space", "audio", "output", "roog-mix", "a", "input"],
      ["roog-mix", "sum", "output", "output-placeholder", "left", "input"],
      ["roog-mix", "sum", "output", "output-placeholder", "right", "input"],
      ["roog-lfo", "cv", "output", "roog-vcf", "cutoff", "input"]
    ],
    controls: {
      "roog-noise": { color: 4200, level: 0.4 },
      "roog-vcf": { cutoff: 640, resonance: 4 },
      "roog-space": { time: 0.6, feedback: 0.7, mix: 0.72 },
      "roog-lfo": { rate: 0.12, waveform: "sine", depth: 520 },
      "roog-mix": { levelA: 0.85, levelB: 0 }
    }
  },
  {
    id: "mic-mangler",
    name: "Mic Mangler",
    blurb: "Arm MIC IN, then drown your voice in fuzz and echo",
    connections: [
      ["roog-audio-input", "audio", "output", "roog-drive", "audio", "input"],
      ["roog-drive", "audio", "output", "roog-space", "audio", "input"],
      ["roog-space", "audio", "output", "output-placeholder", "left", "input"],
      ["roog-space", "audio", "output", "output-placeholder", "right", "input"]
    ],
    controls: {
      "roog-audio-input": { level: 0.9 },
      "roog-drive": { drive: 26, tone: 3200, level: 0.5 },
      "roog-space": { time: 0.28, feedback: 0.55, mix: 0.5 }
    }
  }
];

function findJack(moduleId, portLabel, direction) {
  const moduleDefinition = moduleRegistry.get(moduleId);

  if (!moduleDefinition) {
    return null;
  }

  const port = moduleDefinition.ports.find(
    (candidate) =>
      candidate.label.toLowerCase() === portLabel.toLowerCase() && candidate.direction === direction
  );

  if (!port) {
    return null;
  }

  return rackRow.querySelector(
    `.jack[data-module-id="${moduleId}"][data-port-id="${port.id}"]`
  );
}

function setControlValue(moduleId, controlId, value) {
  const panel = rackRow.querySelector(`[data-module-id="${moduleId}"]`);
  const input = panel?.querySelector(`[data-control-id="${controlId}"]`);

  if (!input) {
    return;
  }

  input.value = String(value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function applyPresetControls(controls) {
  Object.entries(controls ?? {}).forEach(([moduleId, moduleControls]) => {
    Object.entries(moduleControls).forEach(([controlId, value]) => {
      setControlValue(moduleId, controlId, value);
    });
  });
}

function connectPresetCables(connections) {
  let connected = 0;

  connections.forEach(([srcModule, srcLabel, srcDir, tgtModule, tgtLabel, tgtDir]) => {
    const srcJack = findJack(srcModule, srcLabel, srcDir);
    const tgtJack = findJack(tgtModule, tgtLabel, tgtDir);

    if (!srcJack || !tgtJack) {
      return;
    }

    const src = getPortDescriptor(srcJack);
    const tgt = getPortDescriptor(tgtJack);

    if (src && tgt) {
      connectPatch(src, tgt);
      connected += 1;
    }
  });

  return connected;
}

function clearAllPatches() {
  while (patches.length > 0) {
    const [patch] = patches.splice(0, 1);
    graphHost.disconnect(patch.connectionId);
  }

  clearActivePatch();
  renderCableLayer();

  if (presetSelect) {
    presetSelect.value = "";
  }

  setPatchStatus("Patch bay cleared · fresh slate · pick a preset or patch your own");
}

function loadPreset(presetId) {
  const preset = presets.find((candidate) => candidate.id === presetId);

  if (!preset) {
    return;
  }

  clearAllPatches();
  applyPresetControls(preset.controls);

  const connected = connectPresetCables(preset.connections);

  if (presetSelect) {
    presetSelect.value = preset.id;
  }

  renderCableLayer();
  setPatchStatus(
    connected > 0
      ? `${preset.name} loaded · ${connected} cables · ${preset.blurb}`
      : `${preset.name} could not load`
  );
}

function populatePresetSelect() {
  if (!presetSelect) {
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "— custom patch —";
  placeholder.disabled = true;

  const options = presets.map((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.name;
    return option;
  });

  presetSelect.replaceChildren(placeholder, ...options);
}

async function togglePower() {
  if (!powerButton) {
    return;
  }

  const isOn = powerButton.getAttribute("aria-pressed") === "true";

  if (isOn) {
    await graphHost.context?.suspend?.();
    powerButton.setAttribute("aria-pressed", "false");
    statusStrip?.removeAttribute("data-power");
    rackFramePower?.removeAttribute("data-power");
    setPatchStatus("Powered off · rack silent");
    return;
  }

  if (!graphHost.context) {
    const anyModule = moduleRegistry.list()[0];

    if (anyModule) {
      graphHost.registerModule(anyModule).nodes;
    }
  }

  await graphHost.context?.resume?.();
  powerButton.setAttribute("aria-pressed", "true");
  statusStrip?.setAttribute("data-power", "on");
  rackFramePower?.setAttribute("data-power", "on");
  setPatchStatus(
    patches.length > 0
      ? `Powered on · ${patches.length} cables live · hit ENV trig to play`
      : "Powered on · patch a signal to play"
  );
}

function loadSurprisePreset() {
  const candidates = presets.filter((preset) => preset.id !== presetSelect?.value);
  const pool = candidates.length > 0 ? candidates : presets;
  const choice = pool[Math.floor(Math.random() * pool.length)];

  loadPreset(choice.id);
}

function bindControlBar() {
  powerButton?.addEventListener("click", togglePower);
  presetSelect?.addEventListener("change", () => loadPreset(presetSelect.value));
  document.querySelector("[data-surprise]")?.addEventListener("click", loadSurprisePreset);
  document.querySelector("[data-clear]")?.addEventListener("click", clearAllPatches);
}

function createRackModulePanel(moduleDefinition) {
  const panel = createModulePanel(document, moduleDefinition);
  const dragHandle = panel.querySelector(".module-title");

  panel.setAttribute("aria-grabbed", "false");

  if (dragHandle) {
    dragHandle.tabIndex = 0;
    dragHandle.title = "Drag or use Left/Right arrows to rearrange this module";
    dragHandle.setAttribute("aria-label", `Move ${moduleDefinition.name} module`);
  }

  return panel;
}

function renderRack() {
  const registeredModules = getOrderedModules();

  rackFrame.style.setProperty("--rack-hp", String(rackConfig.totalHp));
  createHpGrid(rackConfig.totalHp);
  renderPowerBus(rackConfig.powerRails);

  const usedHp = registeredModules.reduce((total, module) => total + module.hp, 0);
  hpReadout.textContent = `${usedHp} / ${rackConfig.totalHp} HP`;
  setPatchStatus();

  rackRow.replaceChildren(...registeredModules.map(createRackModulePanel));
  bindModuleControls();
  renderCableLayer();
}

function getModuleNodes(moduleId) {
  const moduleDefinition = moduleRegistry.get(moduleId);

  return moduleDefinition ? graphHost.registerModule(moduleDefinition).nodes : null;
}

function setAudioParamValue(audioParam, value) {
  if (audioParam) {
    audioParam.value = Number(value);
  }
}

function bindModuleControls() {
  bindAudioInputControls();
  bindVcoControls();
  bindNoiseControls();
  bindVcfControls();
  bindDriveControls();
  bindVcaControls();
  bindSpaceControls();
  bindLfoControls();
  bindEnvelopeControls();
  bindMixControls();
}

function bindParamControls(moduleId, paramByControlId) {
  const panel = rackRow.querySelector(`[data-module-id="${moduleId}"]`);

  if (!panel) {
    return;
  }

  Object.entries(paramByControlId).forEach(([controlId, nodeKey]) => {
    const input = panel.querySelector(`[data-control-id="${controlId}"]`);

    input?.addEventListener("input", () => {
      setAudioParamValue(getModuleNodes(moduleId)?.[nodeKey], input.value);
    });
  });
}

function bindNoiseControls() {
  bindParamControls("roog-noise", { color: "color", level: "level" });
}

function bindDriveControls() {
  const panel = rackRow.querySelector('[data-module-id="roog-drive"]');

  if (!panel) {
    return;
  }

  bindParamControls("roog-drive", { tone: "tone", level: "level" });

  const drive = panel.querySelector('[data-control-id="drive"]');

  drive?.addEventListener("input", () => {
    const nodes = getModuleNodes("roog-drive");

    setAudioParamValue(nodes?.drive, drive.value);

    if (nodes?.shaper) {
      nodes.shaper.curve = makeFuzzCurve(Number(drive.value));
    }
  });
}

function bindSpaceControls() {
  bindParamControls("roog-space", { time: "time", feedback: "feedback", mix: "mix" });
}

function bindMixControls() {
  bindParamControls("roog-mix", { levelA: "levelA", levelB: "levelB" });
}

function bindAudioInputControls() {
  const inputPanel = rackRow.querySelector('[data-module-id="roog-audio-input"]');

  if (!inputPanel) {
    return;
  }

  const arm = inputPanel.querySelector('[data-control-id="arm"]');
  const level = inputPanel.querySelector('[data-control-id="level"]');

  level?.addEventListener("input", () => {
    const nodes = getModuleNodes("roog-audio-input");

    setAudioParamValue(nodes?.level, level.value);
  });
  arm?.addEventListener("click", async () => {
    const nodes = getModuleNodes("roog-audio-input");

    if (!nodes) {
      return;
    }

    if (nodes.mediaStream) {
      setPatchStatus("Microphone input is already armed");
      return;
    }

    try {
      arm.disabled = true;
      setPatchStatus("Requesting microphone access...");
      await graphHost.context?.resume?.();
      await nodes.activate();
      arm.textContent = "live";
      arm.dataset.state = "live";
      setPatchStatus("Microphone input armed · patch MIC IN audio to a processor or output");
    } catch (error) {
      arm.disabled = false;
      arm.textContent = "arm";
      arm.dataset.state = "";
      setPatchStatus(error instanceof Error ? error.message : "Microphone input could not start");
    }
  });
}

function bindVcoControls() {
  const vcoPanel = rackRow.querySelector('[data-module-id="roog-vco"]');

  if (!vcoPanel) {
    return;
  }

  const frequency = vcoPanel.querySelector('[data-control-id="frequency"]');
  const waveform = vcoPanel.querySelector('[data-control-id="waveform"]');
  const detune = vcoPanel.querySelector('[data-control-id="detune"]');

  frequency?.addEventListener("input", () => {
    const nodes = getModuleNodes("roog-vco");

    setAudioParamValue(nodes?.oscillator.frequency, frequency.value);
  });
  waveform?.addEventListener("input", () => {
    const nodes = getModuleNodes("roog-vco");

    if (nodes) {
      nodes.oscillator.type = waveform.value;
    }
  });
  detune?.addEventListener("input", () => {
    const nodes = getModuleNodes("roog-vco");

    setAudioParamValue(nodes?.oscillator.detune, detune.value);
  });
}

function bindVcfControls() {
  const vcfPanel = rackRow.querySelector('[data-module-id="roog-vcf"]');

  if (!vcfPanel) {
    return;
  }

  const cutoff = vcfPanel.querySelector('[data-control-id="cutoff"]');
  const resonance = vcfPanel.querySelector('[data-control-id="resonance"]');

  cutoff?.addEventListener("input", () => {
    const nodes = getModuleNodes("roog-vcf");

    setAudioParamValue(nodes?.cutoff, cutoff.value);
  });
  resonance?.addEventListener("input", () => {
    const nodes = getModuleNodes("roog-vcf");

    setAudioParamValue(nodes?.resonance, resonance.value);
  });
}

function bindVcaControls() {
  const vcaPanel = rackRow.querySelector('[data-module-id="roog-vca"]');

  if (!vcaPanel) {
    return;
  }

  const level = vcaPanel.querySelector('[data-control-id="level"]');

  level?.addEventListener("input", () => {
    const nodes = getModuleNodes("roog-vca");

    setAudioParamValue(nodes?.amplitude, level.value);
  });
}

function bindLfoControls() {
  const lfoPanel = rackRow.querySelector('[data-module-id="roog-lfo"]');

  if (!lfoPanel) {
    return;
  }

  const rate = lfoPanel.querySelector('[data-control-id="rate"]');
  const waveform = lfoPanel.querySelector('[data-control-id="waveform"]');
  const depth = lfoPanel.querySelector('[data-control-id="depth"]');

  rate?.addEventListener("input", () => {
    const nodes = getModuleNodes("roog-lfo");

    setAudioParamValue(nodes?.rate, rate.value);
  });
  waveform?.addEventListener("input", () => {
    const nodes = getModuleNodes("roog-lfo");

    if (nodes) {
      nodes.oscillator.type = waveform.value;
    }
  });
  depth?.addEventListener("input", () => {
    const nodes = getModuleNodes("roog-lfo");

    setAudioParamValue(nodes?.depth, depth.value);
  });
}

function bindEnvelopeControls() {
  const envelopePanel = rackRow.querySelector('[data-module-id="roog-envelope"]');

  if (!envelopePanel) {
    return;
  }

  const attack = envelopePanel.querySelector('[data-control-id="attack"]');
  const decay = envelopePanel.querySelector('[data-control-id="decay"]');
  const sustain = envelopePanel.querySelector('[data-control-id="sustain"]');
  const release = envelopePanel.querySelector('[data-control-id="release"]');
  const trigger = envelopePanel.querySelector('[data-control-id="trigger"]');

  [attack, decay, sustain, release].forEach((control) => {
    control?.addEventListener("input", () => {
      const nodes = getModuleNodes("roog-envelope");

      setAudioParamValue(nodes?.[control.dataset.controlId], control.value);
    });
  });
  trigger?.addEventListener("click", () => {
    const nodes = getModuleNodes("roog-envelope");

    if (nodes) {
      triggerEnvelope(nodes);
    }
  });
}

function triggerEnvelope(nodes) {
  const now = graphHost.context?.currentTime ?? 0;
  const attack = Number(nodes.attack.value);
  const decay = Number(nodes.decay.value);
  const sustain = Number(nodes.sustain.value);
  const release = Number(nodes.release.value);
  const envelope = nodes.envelope;
  const sustainTime = now + attack + decay;

  envelope.cancelScheduledValues(now);
  envelope.setValueAtTime(envelope.value, now);
  envelope.linearRampToValueAtTime(1, now + attack);
  envelope.linearRampToValueAtTime(sustain, sustainTime);
  envelope.linearRampToValueAtTime(0, sustainTime + release);
}

renderRack();
bindPatchCables();
bindModuleReordering();
populatePresetSelect();
bindControlBar();
loadPreset("classic-bass");
