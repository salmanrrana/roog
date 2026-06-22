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
}

renderRack();
