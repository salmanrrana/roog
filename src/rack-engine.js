import { canPatchPorts, createModulePanel, createModuleRegistry } from "./module-framework.js";
import { createAudioGraphHost } from "./audio-graph-host.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * A reusable, config-driven Eurorack engine. It owns the module registry,
 * the Web Audio graph host, patch-cable interaction, module reordering,
 * preset loading and power — everything that is identical between racks.
 *
 * Per-rack flavour comes entirely from config:
 *   - modules: definitions (control.param / control.apply auto-bind to nodes,
 *     module.bind(api) handles buttons/scopes, module.onPower(nodes,isOn,ctx))
 *   - presets: named patches (connections + control values)
 *   - cableSag: gravity droop in px (0 = flat S-curve, >0 = VCV hanging cable)
 */
export function createRackEngine(config) {
  const {
    rackConfig,
    modules,
    presets = [],
    storageKey,
    legacyIds = {},
    cableSag = 0,
    defaultPresetId,
    autoRunOnPower = false
  } = config;

  const root = config.root ?? document;
  const rackFrame = root.querySelector(".rack-frame");
  const rackRow = root.querySelector("[data-rack-row]");
  const hpGrid = root.querySelector("[data-hp-grid]");
  const cableLayer = root.querySelector("[data-patch-cable-layer]");
  const hpReadout = root.querySelector("[data-hp-readout]");
  const powerBus = root.querySelector("[data-power-bus]");
  const statusText = root.querySelector("[data-status-text]");
  const powerButton = root.querySelector("[data-power]");
  const presetSelect = root.querySelector("[data-preset]");
  const statusStrip = root.querySelector(".status-strip");

  const legacyModuleIds = new Map(Object.entries(legacyIds));
  const moduleRegistry = createModuleRegistry();
  const graphHost = createAudioGraphHost();
  const patches = [];

  let activePatchStart = null;
  let previewPoint = null;
  let patchIdSeed = 0;
  let moduleOrder = [];
  let draggedModuleId = null;

  modules.forEach((moduleDefinition) => {
    const registeredModule = moduleRegistry.register(moduleDefinition);
    graphHost.registerModule(registeredModule);
  });

  moduleOrder = loadModuleOrder(moduleRegistry.list());

  /* ---------- rack chrome ---------- */

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

  /* ---------- module order ---------- */

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
      const savedOrder = JSON.parse(localStorage.getItem(storageKey) ?? "null");

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
      localStorage.setItem(storageKey, JSON.stringify(moduleOrder));
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

  /* ---------- patch geometry ---------- */

  function getPortDescriptor(jack) {
    const moduleDefinition = moduleRegistry.get(jack.dataset.moduleId);
    const port = moduleDefinition?.ports.find((candidate) => candidate.id === jack.dataset.portId);

    if (!moduleDefinition || !port) {
      return null;
    }

    return { jack, moduleId: moduleDefinition.id, moduleName: moduleDefinition.name, port };
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
    if (cableSag <= 0) {
      const slack = Math.max(48, Math.abs(endPoint.x - startPoint.x) * 0.38);

      return [
        `M ${startPoint.x} ${startPoint.y}`,
        `C ${startPoint.x + slack} ${startPoint.y}`,
        `${endPoint.x - slack} ${endPoint.y}`,
        `${endPoint.x} ${endPoint.y}`
      ].join(" ");
    }

    // VCV-style hanging cable: control points dropped below each jack by a
    // droop proportional to the span, so the cable sags under gravity.
    const span = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y);
    const droop = cableSag + span * 0.3;

    return [
      `M ${startPoint.x} ${startPoint.y}`,
      `C ${startPoint.x} ${startPoint.y + droop}`,
      `${endPoint.x} ${endPoint.y + droop}`,
      `${endPoint.x} ${endPoint.y}`
    ].join(" ");
  }

  /* ---------- cable rendering ---------- */

  function setPatchStatus(message) {
    const patchCount = patches.length === 1 ? "1 cable" : `${patches.length} cables`;
    statusText.textContent = message ?? `${graphHost.registeredModuleCount} modules registered · ${patchCount}`;
  }

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

  /* ---------- patching ---------- */

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

  /* ---------- module reordering ---------- */

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
    setPatchStatus(`Dragging ${panel.querySelector(".module-name")?.textContent ?? "module"}`);
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

  /* ---------- control bindings ---------- */

  function getModuleNodes(moduleId) {
    const moduleDefinition = moduleRegistry.get(moduleId);

    return moduleDefinition ? graphHost.registerModule(moduleDefinition).nodes : null;
  }

  function setAudioParamValue(audioParam, value) {
    if (audioParam) {
      audioParam.value = Number(value);
    }
  }

  function makeBindApi(moduleId, panel) {
    return {
      moduleId,
      panel,
      getControl: (controlId) => panel.querySelector(`[data-control-id="${controlId}"]`),
      getCanvas: (scopeId) => panel.querySelector(`[data-scope="${scopeId}"]`),
      nodes: () => getModuleNodes(moduleId),
      context: () => graphHost.context,
      status: (message) => setPatchStatus(message)
    };
  }

  function bindModuleControls() {
    getOrderedModules().forEach((moduleDefinition) => {
      const panel = rackRow.querySelector(`[data-module-id="${moduleDefinition.id}"]`);

      if (!panel) {
        return;
      }

      (moduleDefinition.controls ?? []).forEach((control) => {
        if (typeof control === "string" || (!control.param && !control.apply)) {
          return;
        }

        const input = panel.querySelector(`[data-control-id="${control.id}"]`);

        input?.addEventListener("input", () => {
          const nodes = getModuleNodes(moduleDefinition.id);

          if (!nodes) {
            return;
          }

          if (control.apply) {
            control.apply(nodes, input.value, graphHost.context);
          } else {
            setAudioParamValue(nodes[control.param], input.value);
          }
        });
      });

      moduleDefinition.bind?.(makeBindApi(moduleDefinition.id, panel));
    });
  }

  /* ---------- presets ---------- */

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

    return rackRow.querySelector(`.jack[data-module-id="${moduleId}"][data-port-id="${port.id}"]`);
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

    setPatchStatus("Patch bay cleared · fresh slate · pick a patch or wire your own");
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

  function loadSurprisePreset() {
    const candidates = presets.filter((preset) => preset.id !== presetSelect?.value);
    const pool = candidates.length > 0 ? candidates : presets;

    if (pool.length === 0) {
      return;
    }

    loadPreset(pool[Math.floor(Math.random() * pool.length)].id);
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

  /* ---------- power ---------- */

  async function togglePower() {
    if (!powerButton) {
      return;
    }

    const isOn = powerButton.getAttribute("aria-pressed") === "true";

    if (isOn) {
      runPowerHooks(false);
      await graphHost.context?.suspend?.();
      powerButton.setAttribute("aria-pressed", "false");
      statusStrip?.removeAttribute("data-power");
      rackFrame?.removeAttribute("data-power");
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
    runPowerHooks(true);
    powerButton.setAttribute("aria-pressed", "true");
    statusStrip?.setAttribute("data-power", "on");
    rackFrame?.setAttribute("data-power", "on");
    setPatchStatus(
      patches.length > 0
        ? `Powered on · ${patches.length} cables live · make some noise`
        : "Powered on · patch a signal to play"
    );
  }

  function runPowerHooks(isOn) {
    moduleRegistry.list().forEach((moduleDefinition) => {
      if (typeof moduleDefinition.onPower !== "function") {
        return;
      }

      const nodes = getModuleNodes(moduleDefinition.id);

      if (nodes) {
        moduleDefinition.onPower(nodes, isOn, graphHost.context);
      }
    });
  }

  function bindControlBar() {
    powerButton?.addEventListener("click", togglePower);
    presetSelect?.addEventListener("change", () => loadPreset(presetSelect.value));
    root.querySelector("[data-surprise]")?.addEventListener("click", loadSurprisePreset);
    root.querySelector("[data-clear]")?.addEventListener("click", clearAllPatches);
  }

  /* ---------- render ---------- */

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

  function init() {
    renderRack();
    bindPatchCables();
    bindModuleReordering();
    populatePresetSelect();
    bindControlBar();

    if (defaultPresetId) {
      loadPreset(defaultPresetId);
    }

    if (autoRunOnPower) {
      // nothing yet — onPower hooks fire on the first power toggle
    }
  }

  return { init, loadPreset, clearAllPatches, graphHost, moduleRegistry };
}
