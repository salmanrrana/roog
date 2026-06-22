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
    throw new TypeError(`Unknown port direction: ${direction}`);
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

export function createJackElement(documentRef, port) {
  const wrapper = documentRef.createElement("span");
  wrapper.className = "jack-port";

  const element = documentRef.createElement("span");
  element.className = `jack jack-${port.type}`;
  element.title = `${port.label} ${port.direction} ${port.type}`;
  element.setAttribute("aria-label", `${port.label} ${port.direction} ${port.type}`);
  element.dataset.portId = port.id;
  element.dataset.signal = port.type;
  element.dataset.direction = port.direction;

  const label = documentRef.createElement("span");
  label.className = "jack-label";
  label.textContent = port.label;

  wrapper.append(element, label);
  return wrapper;
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
  name.textContent = moduleDefinition.name;

  const hp = documentRef.createElement("small");
  hp.textContent = formatHp(moduleDefinition.hp);
  title.append(name, hp);

  const controls = documentRef.createElement("div");
  controls.className = "control-bank";
  controls.setAttribute("aria-label", `${moduleDefinition.name} controls`);

  moduleDefinition.controls.forEach((control) => {
    const controlDefinition = typeof control === "string" ? { label: control } : control;
    const controlElement = documentRef.createElement("label");
    controlElement.className = "knob";

    const label = documentRef.createElement("span");
    label.textContent = controlDefinition.label;
    controlElement.append(label);

    if (controlDefinition.type) {
      const input = documentRef.createElement(controlDefinition.type === "select" ? "select" : "input");
      input.dataset.controlId = controlDefinition.id;
      input.setAttribute("aria-label", `${moduleDefinition.name} ${controlDefinition.label}`);

      if (controlDefinition.type === "select") {
        controlDefinition.options.forEach((option) => {
          const optionElement = documentRef.createElement("option");
          optionElement.value = option;
          optionElement.textContent = option;
          input.append(optionElement);
        });
      } else {
        input.type = controlDefinition.type;
        input.min = String(controlDefinition.min);
        input.max = String(controlDefinition.max);
        input.step = String(controlDefinition.step);
      }

      input.value = String(controlDefinition.value);
      controlElement.append(input);
    }

    controls.append(controlElement);
  });

  const jacks = documentRef.createElement("div");
  jacks.className = "jack-bank";
  jacks.setAttribute("aria-label", `${moduleDefinition.name} patch points`);
  moduleDefinition.ports.forEach((port) => jacks.append(createJackElement(documentRef, port)));

  panel.append(title, controls, jacks);
  return panel;
}
