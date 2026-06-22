import { placeholderModules, rackConfig } from "./rack-shell.js";
import { createAudioGraphHost } from "./audio-graph-host.js";
import { createModulePanel, createModuleRegistry } from "./module-framework.js";

const rackRow = document.querySelector("[data-rack-row]");
const hpGrid = document.querySelector("[data-hp-grid]");
const hpReadout = document.querySelector("[data-hp-readout]");
const powerBus = document.querySelector("[data-power-bus]");
const statusText = document.querySelector("[data-status-text]");
const moduleRegistry = createModuleRegistry();
const graphHost = createAudioGraphHost();

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

function renderRack() {
  const registeredModules = moduleRegistry.list();

  createHpGrid(rackConfig.totalHp);
  renderPowerBus(rackConfig.powerRails);

  const usedHp = registeredModules.reduce((total, module) => total + module.hp, 0);
  hpReadout.textContent = `${usedHp} / ${rackConfig.totalHp} HP`;
  statusText.textContent = `${graphHost.registeredModuleCount} modules registered`;

  rackRow.replaceChildren(...registeredModules.map((module) => createModulePanel(document, module)));
  bindModuleControls();
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
