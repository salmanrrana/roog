import { placeholderModules, rackConfig } from "./rack-shell.js";
import { createAudioGraphHost } from "./audio-graph-host.js";
import { canPatchPorts, createModulePanel, createModuleRegistry } from "./module-framework.js";

const rackFrame = document.querySelector(".rack-frame");
const rackRow = document.querySelector("[data-rack-row]");
const hpGrid = document.querySelector("[data-hp-grid]");
const cableLayer = document.querySelector("[data-patch-cable-layer]");
const hpReadout = document.querySelector("[data-hp-readout]");
const powerBus = document.querySelector("[data-power-bus]");
const statusText = document.querySelector("[data-status-text]");
const moduleRegistry = createModuleRegistry();
const graphHost = createAudioGraphHost();
const patches = [];
let activePatchStart = null;
let previewPoint = null;
let patchIdSeed = 0;

placeholderModules.forEach((moduleDefinition) => {
  const registeredModule = moduleRegistry.register(moduleDefinition);
  graphHost.registerModule(registeredModule);
});

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

function renderCableLayer() {
  const frameWidth = Math.max(rackFrame.clientWidth, rackRow.scrollWidth);
  const frameHeight = rackFrame.clientHeight;
  const cableElements = [];

  cableLayer.setAttribute("viewBox", `0 0 ${frameWidth} ${frameHeight}`);
  cableLayer.style.width = `${frameWidth}px`;
  cableLayer.style.height = `${frameHeight}px`;

  patches.forEach((patch) => {
    if (!patch.source.jack.isConnected || !patch.target.jack.isConnected) {
      return;
    }

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.classList.add("patch-cable", `patch-cable-${patch.source.port.type}`);
    path.dataset.patchId = patch.id;
    path.setAttribute("d", getCablePath(getJackPoint(patch.source.jack), getJackPoint(patch.target.jack)));
    path.setAttribute(
      "aria-label",
      `${patch.source.moduleName} ${patch.source.port.label} to ${patch.target.moduleName} ${patch.target.port.label}`
    );
    cableElements.push(path);
  });

  if (activePatchStart && previewPoint) {
    const preview = document.createElementNS("http://www.w3.org/2000/svg", "path");
    preview.classList.add("patch-cable", "patch-cable-preview", `patch-cable-${activePatchStart.port.type}`);
    preview.setAttribute("d", getCablePath(getJackPoint(activePatchStart.jack), previewPoint));
    cableElements.push(preview);
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

function renderRack() {
  const registeredModules = moduleRegistry.list();

  createHpGrid(rackConfig.totalHp);
  renderPowerBus(rackConfig.powerRails);

  const usedHp = registeredModules.reduce((total, module) => total + module.hp, 0);
  hpReadout.textContent = `${usedHp} / ${rackConfig.totalHp} HP`;
  setPatchStatus();

  rackRow.replaceChildren(...registeredModules.map((module) => createModulePanel(document, module)));
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
  bindVcoControls();
  bindVcfControls();
  bindVcaControls();
  bindLfoControls();
  bindEnvelopeControls();
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
