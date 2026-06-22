import { placeholderModules, rackConfig } from "./rack-shell.js";

const rackRow = document.querySelector("[data-rack-row]");
const hpGrid = document.querySelector("[data-hp-grid]");
const hpReadout = document.querySelector("[data-hp-readout]");

function formatHp(value) {
  return `${value} HP`;
}

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

function createJack(jack) {
  const element = document.createElement("span");
  element.className = `jack jack-${jack.type}`;
  element.title = `${jack.label} ${jack.direction} ${jack.type}`;
  element.setAttribute("aria-label", `${jack.label} ${jack.direction} ${jack.type}`);
  element.dataset.signal = jack.type;
  element.dataset.direction = jack.direction;
  return element;
}

function createModule(module) {
  const panel = document.createElement("article");
  panel.className = `module-panel module-${module.kind}`;
  panel.style.setProperty("--module-hp", module.hp);
  panel.role = "listitem";
  panel.setAttribute("aria-label", `${module.name}, ${formatHp(module.hp)}`);

  const title = document.createElement("header");
  title.className = "module-title";
  title.innerHTML = `
    <span>${module.name}</span>
    <small>${formatHp(module.hp)}</small>
  `;

  const controls = document.createElement("div");
  controls.className = "control-bank";
  controls.setAttribute("aria-label", `${module.name} controls`);

  module.controls.forEach((control) => {
    const controlElement = document.createElement("span");
    controlElement.className = "knob";
    controlElement.textContent = control;
    controls.append(controlElement);
  });

  const jacks = document.createElement("div");
  jacks.className = "jack-bank";
  jacks.setAttribute("aria-label", `${module.name} patch points`);
  module.jacks.forEach((jack) => jacks.append(createJack(jack)));

  panel.append(title, controls, jacks);
  return panel;
}

function renderRack() {
  createHpGrid(rackConfig.totalHp);

  const usedHp = placeholderModules.reduce((total, module) => total + module.hp, 0);
  hpReadout.textContent = `${usedHp} / ${rackConfig.totalHp} HP`;

  rackRow.replaceChildren(...placeholderModules.map(createModule));
}

renderRack();
