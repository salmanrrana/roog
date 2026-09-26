// Builds a module's front panel: header, custom view, knobs/selects, jacks.
// Knobs are drag-to-turn (vertical), with wheel, arrow keys, shift for fine
// moves and double-click to reset.

const KNOB_DRAG_PX = 160;

/** @param {import("./types.js").ControlDef} control */
export function toNorm(control, value) {
  const { min = 0, max = 1 } = control;

  if (control.curve === "exp") {
    return Math.log(value / min) / Math.log(max / min);
  }

  return (value - min) / (max - min || 1);
}

/** @param {import("./types.js").ControlDef} control */
export function fromNorm(control, norm) {
  const { min = 0, max = 1, step } = control;
  const n = Math.min(1, Math.max(0, norm));
  const raw =
    control.curve === "exp" ? min * (max / min) ** n : min + n * (max - min);
  const snapped = step ? Math.round(raw / step) * step : raw;

  return Math.min(max, Math.max(min, Number(snapped.toFixed(4))));
}

export function formatValue(control, value) {
  if (typeof value === "string") {
    return value;
  }

  const unit = control.unit ?? "";

  if (unit === "Hz" && value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }

  if (unit === "%") {
    return `${Math.round(value * 100)}%`;
  }

  if (unit === "s" && value < 1) {
    return `${Math.round(value * 1000)}ms`;
  }

  const digits =
    Math.abs(value) >= 100 || Number.isInteger(value)
      ? 0
      : Math.abs(value) >= 10
        ? 1
        : 2;
  return `${value.toFixed(digits)}${unit === "Hz" || unit === "s" ? unit : ""}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (text !== undefined) {
    node.textContent = text;
  }

  return node;
}

function createKnob(control, value, moduleName, onChange) {
  const wrap = el("div", "knob");
  const dial = el("div", "knob-dial");
  const readout = el("span", "knob-value");

  wrap.dataset.controlId = control.id;
  dial.tabIndex = 0;
  dial.setAttribute("role", "slider");
  dial.setAttribute("aria-label", `${moduleName} ${control.label}`);
  dial.setAttribute("aria-valuemin", String(control.min));
  dial.setAttribute("aria-valuemax", String(control.max));
  dial.title = "Drag up/down · shift = fine · double-click = reset";
  dial.append(el("span", "knob-pointer"));
  wrap.append(dial, readout, el("span", "control-label", control.label));

  let current = Number(value);

  function show(next) {
    current = next;
    dial.style.setProperty("--n", String(toNorm(control, next)));
    dial.setAttribute("aria-valuenow", String(next));
    dial.setAttribute("aria-valuetext", formatValue(control, next));
    readout.textContent = formatValue(control, next);
  }

  function commit(next) {
    if (next !== current) {
      show(next);
      onChange(next);
    }
  }

  function nudge(deltaNorm) {
    commit(fromNorm(control, toNorm(control, current) + deltaNorm));
  }

  dial.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dial.setPointerCapture(event.pointerId);
    dial.focus();
    wrap.classList.add("knob-active");

    let lastY = event.clientY;
    let norm = toNorm(control, current);

    const move = (moveEvent) => {
      norm = Math.min(
        1,
        Math.max(
          0,
          norm +
            (lastY - moveEvent.clientY) /
              (moveEvent.shiftKey ? KNOB_DRAG_PX * 5 : KNOB_DRAG_PX),
        ),
      );
      lastY = moveEvent.clientY;
      commit(fromNorm(control, norm));
    };
    const end = () => {
      wrap.classList.remove("knob-active");
      dial.removeEventListener("pointermove", move);
      dial.removeEventListener("pointerup", end);
      dial.removeEventListener("pointercancel", end);
    };

    dial.addEventListener("pointermove", move);
    dial.addEventListener("pointerup", end);
    dial.addEventListener("pointercancel", end);
  });

  dial.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      nudge((event.deltaY < 0 ? 1 : -1) * (event.shiftKey ? 0.004 : 0.02));
    },
    { passive: false },
  );

  dial.addEventListener("keydown", (event) => {
    const fine = event.shiftKey ? 0.2 : 1;
    const moves = {
      ArrowUp: 0.02,
      ArrowRight: 0.02,
      ArrowDown: -0.02,
      ArrowLeft: -0.02,
      PageUp: 0.1,
      PageDown: -0.1,
    };

    if (event.key in moves) {
      event.preventDefault();
      nudge(moves[event.key] * fine);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      commit(event.key === "Home" ? control.min : control.max);
    }
  });

  dial.addEventListener("dblclick", () => commit(Number(control.value)));

  show(current);
  return { el: wrap, set: show };
}

function createSelect(control, value, moduleName, onChange) {
  const wrap = el("label", "control-select");
  const select = el("select");

  wrap.dataset.controlId = control.id;
  select.setAttribute("aria-label", `${moduleName} ${control.label}`);
  control.options.forEach((option) =>
    select.append(new Option(option, option)),
  );
  select.value = String(value);
  select.addEventListener("change", () => onChange(select.value));
  wrap.append(select, el("span", "control-label", control.label));

  return {
    el: wrap,
    set: (next) => {
      select.value = String(next);
    },
  };
}

function createJack(moduleId, port) {
  const wrap = el("span", `jack-port jack-port-${port.dir}`);
  const jack = el("button", `jack jack-${port.type}`);

  jack.type = "button";
  jack.dataset.moduleId = moduleId;
  jack.dataset.portId = port.id;
  jack.setAttribute(
    "aria-label",
    `${port.label} ${port.type} ${port.dir === "in" ? "input" : "output"}`,
  );
  jack.title = `${port.label} · ${port.type} ${port.dir === "in" ? "in" : "out"}`;
  wrap.append(jack, el("span", "jack-label", port.label));

  return { wrap, jack };
}

/**
 * @param {{ id: string, def: import("./types.js").ModuleDef, values: Record<string, any> }} instance
 * @param {{ onValue: (controlId: string, value: any) => void, onRemove: () => void, mountView: (host: HTMLElement) => void }} handlers
 */
export function renderPanel(instance, handlers) {
  const { def } = instance;
  const panel = el("article", `module-panel module-${def.category}`);
  const header = el("header", "module-title");
  const name = el("span", "module-name", def.name);
  const remove = el("button", "module-remove", "×");
  const controls = new Map();
  const jacks = new Map();

  panel.dataset.moduleId = instance.id;
  panel.classList.toggle("module-narrow", def.hp <= 6);
  panel.style.setProperty("--module-hp", String(def.hp));
  panel.setAttribute("role", "listitem");
  panel.setAttribute("aria-label", `${def.name} module`);

  header.tabIndex = 0;
  header.title = `${def.blurb}\nDrag (or arrow keys) to move`;
  remove.type = "button";
  remove.title = `Remove ${def.name}`;
  remove.setAttribute("aria-label", `Remove ${def.name}`);
  remove.addEventListener("click", handlers.onRemove);
  header.append(name);
  panel.append(remove);

  const view = el("div", "module-view");

  if (def.view) {
    handlers.mountView(view);
  }

  const bank = el("div", "control-bank");

  def.controls.forEach((control) => {
    const onChange = (value) => handlers.onValue(control.id, value);
    const widget = control.options
      ? createSelect(control, instance.values[control.id], def.name, onChange)
      : createKnob(control, instance.values[control.id], def.name, onChange);

    controls.set(control.id, widget);
    bank.append(widget.el);
  });

  const jackBank = el("div", "jack-bank");
  const inputs = el("div", "jack-group jack-group-in");
  const outputs = el("div", "jack-group jack-group-out");

  def.ports.forEach((port) => {
    const { wrap, jack } = createJack(instance.id, port);

    jacks.set(port.id, jack);
    (port.dir === "in" ? inputs : outputs).append(wrap);
  });

  jackBank.append(
    ...[inputs, outputs].filter((group) => group.childElementCount > 0),
  );
  panel.prepend(header, ...(def.view ? [view] : []), bank, jackBank);

  return {
    el: panel,
    jacks,
    setValue(controlId, value) {
      controls.get(controlId)?.set(value);
    },
  };
}
