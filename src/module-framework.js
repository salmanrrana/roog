export const signalTypes = Object.freeze({
  audio: "audio",
  cv: "cv",
  gate: "gate"
});

export const portDirections = Object.freeze({
  input: "input",
  output: "output"
});

export function formatHp(value) {
  return `${value} HP`;
}

function assertKnownSignalType(type) {
  if (!Object.values(signalTypes).includes(type)) {
    throw new TypeError(`Unknown signal type: ${type}`);
  }
}

function assertKnownDirection(direction) {
  if (!Object.values(portDirections).includes(direction)) {
    throw new TypeError(`Unknown direction: ${direction}`);
  }
}

export function normalizePort(port, moduleId) {
  if (!port?.label) {
    throw new TypeError(`Module ${moduleId} has a port without a label`);
  }

  const normalized = {
    id: port.id ?? `${moduleId}-${port.direction}-${port.label.toLowerCase().replaceAll(" ", "-")}`,
    label: port.label,
    type: port.type,
    direction: port.direction,
    node: port.node
  };

  assertKnownSignalType(normalized.type);
  assertKnownDirection(normalized.direction);

  return normalized;
}

export function canPatchPorts(sourcePort, targetPort) {
  return (
    sourcePort.direction === portDirections.output &&
    targetPort.direction === portDirections.input &&
    sourcePort.type === targetPort.type
  );
}

export function createModuleRegistry() {
  const modules = new Map();

  return {
    register(moduleDefinition) {
      if (!moduleDefinition.id) {
        throw new TypeError("Module definitions require an id");
      }

      if (modules.has(moduleDefinition.id)) {
        throw new TypeError(`Module already registered: ${moduleDefinition.id}`);
      }

      const normalizedModule = {
        ...moduleDefinition,
        hp: Number(moduleDefinition.hp),
        controls: moduleDefinition.controls ?? [],
        ports: (moduleDefinition.ports ?? moduleDefinition.jacks ?? []).map((port) =>
          normalizePort(port, moduleDefinition.id)
        )
      };

      if (!Number.isInteger(normalizedModule.hp) || normalizedModule.hp < 1) {
        throw new TypeError(`Module ${moduleDefinition.id} requires a positive integer hp width`);
      }

      modules.set(normalizedModule.id, normalizedModule);
      return normalizedModule;
    },

    get(moduleId) {
      return modules.get(moduleId) ?? null;
    },

    list() {
      return [...modules.values()];
    }
  };
}

export function createJackElement(documentRef, port, moduleId) {
  const wrapper = documentRef.createElement("span");
  wrapper.className = "jack-port";

  const element = documentRef.createElement("span");
  element.className = `jack jack-${port.type}`;
  element.title = `${port.label} ${port.direction} ${port.type}`;
  element.setAttribute("aria-label", `${port.label} ${port.direction} ${port.type}`);
  element.setAttribute("role", "button");
  element.tabIndex = 0;
  element.dataset.moduleId = moduleId;
  element.dataset.portId = port.id;
  element.dataset.signal = port.type;
  element.dataset.direction = port.direction;

  const label = documentRef.createElement("span");
  label.className = "jack-label";
  label.textContent = port.label;

  wrapper.append(element, label);
  return wrapper;
}

const KNOB_SWEEP_DEG = 270;
const KNOB_START_DEG = -135;

function getKnobRotation(control) {
  const min = Number(control.min ?? 0);
  const max = Number(control.max ?? 1);
  const value = Number(control.value ?? min);
  const span = max - min || 1;
  const ratio = Math.min(1, Math.max(0, (value - min) / span));

  return KNOB_START_DEG + ratio * KNOB_SWEEP_DEG;
}

function applyKnobRotation(pointer, rotation) {
  pointer.style.transform = `translateX(-50%) rotate(${rotation}deg)`;
}

function formatKnobValue(input) {
  const value = Number(input.value);

  if (!Number.isFinite(value)) {
    return String(input.value);
  }

  if (Math.abs(value) >= 100 || Number.isInteger(value)) {
    return String(Math.round(value));
  }

  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function createKnobControl(documentRef, controlDefinition, moduleDefinition) {
  const label = documentRef.createElement("label");
  label.className = "control control-range knob";

  const dial = documentRef.createElement("span");
  dial.className = "knob-dial";

  const ticks = documentRef.createElement("span");
  ticks.className = "knob-ticks";
  ticks.setAttribute("aria-hidden", "true");

  const pointer = documentRef.createElement("span");
  pointer.className = "knob-pointer";
  pointer.setAttribute("aria-hidden", "true");

  const readout = documentRef.createElement("span");
  readout.className = "knob-value";
  readout.setAttribute("aria-hidden", "true");

  const controlLabel = documentRef.createElement("span");
  controlLabel.className = "control-label";
  controlLabel.textContent = controlDefinition.label;

  const input = documentRef.createElement("input");
  input.type = "range";
  input.className = "knob-input";
  input.dataset.controlId = controlDefinition.id;
  input.setAttribute("aria-label", `${moduleDefinition.name} ${controlDefinition.label}`);

  if (controlDefinition.min !== undefined) {
    input.min = String(controlDefinition.min);
  }

  if (controlDefinition.max !== undefined) {
    input.max = String(controlDefinition.max);
  }

  if (controlDefinition.step !== undefined) {
    input.step = String(controlDefinition.step);
  }

  input.value = String(controlDefinition.value);

  applyKnobRotation(pointer, getKnobRotation(input));
  readout.textContent = formatKnobValue(input);
  input.addEventListener("input", () => {
    applyKnobRotation(pointer, getKnobRotation(input));
    readout.textContent = formatKnobValue(input);
  });

  dial.append(ticks, pointer, readout);
  label.append(dial, controlLabel, input);
  return label;
}

function createSelectControl(documentRef, controlDefinition, moduleDefinition) {
  const label = documentRef.createElement("label");
  label.className = "control control-select";

  const controlLabel = documentRef.createElement("span");
  controlLabel.className = "control-label";
  controlLabel.textContent = controlDefinition.label;

  const select = documentRef.createElement("select");
  select.dataset.controlId = controlDefinition.id;
  select.setAttribute("aria-label", `${moduleDefinition.name} ${controlDefinition.label}`);

  controlDefinition.options.forEach((option) => {
    const optionElement = documentRef.createElement("option");
    optionElement.value = option;
    optionElement.textContent = option;
    select.append(optionElement);
  });

  select.value = String(controlDefinition.value);

  label.append(controlLabel, select);
  return label;
}

function createButtonControl(documentRef, controlDefinition, moduleDefinition) {
  const label = documentRef.createElement("label");
  label.className = "control control-button";

  const controlLabel = documentRef.createElement("span");
  controlLabel.className = "control-label";
  controlLabel.textContent = controlDefinition.label;

  const button = documentRef.createElement("button");
  button.type = "button";
  button.dataset.controlId = controlDefinition.id;
  button.setAttribute("aria-label", `${moduleDefinition.name} ${controlDefinition.label}`);
  button.textContent = controlDefinition.value ?? controlDefinition.label;

  label.append(controlLabel, button);
  return label;
}

function createSliderControl(documentRef, controlDefinition, moduleDefinition) {
  const label = documentRef.createElement("label");
  label.className = "control control-slider";

  const track = documentRef.createElement("span");
  track.className = "slider-track";

  const input = documentRef.createElement("input");
  input.type = "range";
  input.className = "slider-input";
  input.dataset.controlId = controlDefinition.id;
  input.setAttribute("aria-label", `${moduleDefinition.name} ${controlDefinition.label}`);

  if (controlDefinition.min !== undefined) {
    input.min = String(controlDefinition.min);
  }

  if (controlDefinition.max !== undefined) {
    input.max = String(controlDefinition.max);
  }

  if (controlDefinition.step !== undefined) {
    input.step = String(controlDefinition.step);
  }

  input.value = String(controlDefinition.value);

  const controlLabel = documentRef.createElement("span");
  controlLabel.className = "control-label";
  controlLabel.textContent = controlDefinition.label;

  track.append(input);
  label.append(track, controlLabel);
  return label;
}

function createScopeControl(documentRef, controlDefinition, moduleDefinition) {
  const wrap = documentRef.createElement("div");
  wrap.className = "control control-scope";

  const canvas = documentRef.createElement("canvas");
  canvas.className = "scope-screen";
  canvas.dataset.scope = controlDefinition.id ?? "scope";
  canvas.width = controlDefinition.width ?? 280;
  canvas.height = controlDefinition.height ?? 130;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", `${moduleDefinition.name} ${controlDefinition.label ?? "display"}`);

  const controlLabel = documentRef.createElement("span");
  controlLabel.className = "control-label";
  controlLabel.textContent = controlDefinition.label ?? "scope";

  wrap.append(canvas, controlLabel);
  return wrap;
}

function createControl(documentRef, controlDefinition, moduleDefinition) {
  switch (controlDefinition.type) {
    case "select":
      return createSelectControl(documentRef, controlDefinition, moduleDefinition);
    case "button":
      return createButtonControl(documentRef, controlDefinition, moduleDefinition);
    case "slider":
      return createSliderControl(documentRef, controlDefinition, moduleDefinition);
    case "scope":
    case "display":
      return createScopeControl(documentRef, controlDefinition, moduleDefinition);
    case "range":
    default:
      return createKnobControl(documentRef, controlDefinition, moduleDefinition);
  }
}

export function createModulePanel(documentRef, moduleDefinition) {
  const panel = documentRef.createElement("article");
  panel.className = `module-panel module-${moduleDefinition.kind}`;
  panel.style.setProperty("--module-hp", moduleDefinition.hp);
  panel.role = "listitem";
  panel.dataset.moduleId = moduleDefinition.id;
  panel.setAttribute("aria-label", `${moduleDefinition.name}, ${formatHp(moduleDefinition.hp)}`);

  const title = documentRef.createElement("header");
  title.className = "module-title";

  const name = documentRef.createElement("span");
  name.className = "module-name";
  name.textContent = moduleDefinition.name;

  const meta = documentRef.createElement("span");
  meta.className = "module-meta";

  const kindLabels = {
    source: "SRC",
    processor: "FX",
    modulator: "MOD",
    utility: "UTIL",
    output: "OUT"
  };

  const kind = documentRef.createElement("small");
  kind.className = "module-kind-tag";
  kind.textContent =
    moduleDefinition.tag ?? kindLabels[moduleDefinition.kind] ?? (moduleDefinition.kind ?? "").toUpperCase();

  const hp = documentRef.createElement("small");
  hp.className = "module-hp";
  hp.textContent = formatHp(moduleDefinition.hp);

  meta.append(kind, hp);
  title.append(name, meta);

  const controls = documentRef.createElement("div");
  controls.className = "control-bank";
  controls.setAttribute("aria-label", `${moduleDefinition.name} controls`);

  moduleDefinition.controls.forEach((control) => {
    const controlDefinition = typeof control === "string" ? { label: control } : control;
    controls.append(createControl(documentRef, controlDefinition, moduleDefinition));
  });

  const jacks = documentRef.createElement("div");
  jacks.className = "jack-bank";
  jacks.setAttribute("aria-label", `${moduleDefinition.name} patch points`);
  moduleDefinition.ports.forEach((port) =>
    jacks.append(createJackElement(documentRef, port, moduleDefinition.id))
  );

  panel.append(title, controls, jacks);
  return panel;
}
