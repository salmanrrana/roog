import { PATCH_VERSION, canPatch, layoutRows } from "./patch.js";
import { renderPanel } from "./panel.js";
import { createTransport } from "./transport.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const CABLE_SAG = 56;

/**
 * The studio rack: owns module instances, cables, the master clock and the
 * master bus. Audio/cv cables are Web Audio connections; gate cables are
 * routed as timed events. main.js wires the top bar, MIDI and visualizer to it.
 *
 * @param {{
 *   catalog: import("./types.js").ModuleDef[],
 *   rack: { rows: number, rowHp: number },
 *   rows: HTMLElement,
 *   cableLayer: SVGSVGElement,
 *   onStatus: (message: string) => void,
 *   onChange: () => void
 * }} options
 */
export function createStudio({
  catalog,
  rack,
  rows: rowsHost,
  cableLayer,
  onStatus,
  onChange,
}) {
  const defs = new Map(catalog.map((def) => [def.type, def]));
  const instances = new Map();
  const cables = [];
  const cableElements = new Map();
  const gateObservers = new Set();
  const noteListeners = new Set();
  const transport = createTransport({
    get currentTime() {
      return audio?.currentTime ?? 0;
    },
  });

  /** @type {AudioContext | null} */
  let audio = null;
  let bus = null;
  let order = [];
  let cableSeed = 0;
  let patching = null;

  // One broken module must not stop the clock for everyone else.
  transport.onTick((tick, time, duration) => {
    instances.forEach((instance) => {
      if (instance.clockListener && !isPatched(instance.id, "clock")) {
        try {
          instance.clockListener(time, duration, tick);
        } catch (error) {
          instance.clockListener = null;
          onStatus(
            `${instance.def.name} crashed and was paused: ${error.message}`,
          );
        }
      }
    });
  });

  transport.onStart((time) => {
    instances.forEach((instance) => instance.runtime?.reset?.(time));
  });

  /* ---------- instances ---------- */

  /** Patches can come from share links, so every saved value is checked against its control. */
  function controlValue(control, saved) {
    if (control.options) {
      return control.options.includes(saved) ? saved : control.value;
    }

    const number = Number(saved);

    return saved !== undefined && Number.isFinite(number)
      ? Math.min(control.max, Math.max(control.min, number))
      : control.value;
  }

  function nextId(type) {
    let index = 1;

    while (instances.has(`${type}-${index}`)) {
      index += 1;
    }

    return `${type}-${index}`;
  }

  function createInstance(type, id = nextId(type), values = {}, data) {
    const def = defs.get(type);

    if (!def || instances.has(id)) {
      return null;
    }

    const instance = {
      id,
      def,
      values: Object.fromEntries(
        def.controls.map((control) => [
          control.id,
          controlValue(control, values?.[control.id]),
        ]),
      ),
      data: data ? structuredClone(data) : (def.initialData?.() ?? {}),
      runtime: null,
      panel: null,
      clockListener: null,
      lastClock: null,
      viewListeners: new Map(),
      cleanup: [],
    };

    const buildPanel = () =>
      renderPanel(instance, {
        onValue: (controlId, value) => setValue(id, controlId, value, true),
        onRemove: () => removeModule(id),
        mountView: (host) =>
          def.view(host, {
            id,
            data: instance.data,
            values: instance.values,
            on: (name, listener) => {
              const listeners = instance.viewListeners.get(name) ?? [];
              instance.viewListeners.set(name, [...listeners, listener]);
            },
            changed: onChange,
            probe: (name) => instance.runtime?.probes?.[name] ?? null,
          }),
      });

    try {
      instance.panel = buildPanel();
    } catch {
      // Saved module state didn't fit this module (old or hand-edited patch): start it fresh.
      instance.data = def.initialData?.() ?? {};
      instance.viewListeners.clear();
      instance.panel = buildPanel();
    }

    instances.set(id, instance);

    if (audio) {
      startRuntime(instance);
    }

    return instance;
  }

  function startRuntime(instance) {
    const ctx = {
      id: instance.id,
      audio,
      values: instance.values,
      data: instance.data,
      master: bus.input,
      emit: (port, time, velocity) => routeGate(instance, port, time, velocity),
      signal: (name, payload, time) =>
        signalView(instance, name, payload, time),
      onClock: (listener) => {
        instance.clockListener = listener;
      },
      isPatched: (port) => isPatched(instance.id, port),
      onNote: (listener) => {
        noteListeners.add(listener);
        instance.cleanup.push(() => noteListeners.delete(listener));
      },
      stepSeconds: () => transport.stepSeconds,
    };

    try {
      instance.runtime = instance.def.create(ctx);
      Object.entries(instance.values).forEach(([controlId, value]) =>
        instance.runtime.set?.(controlId, value),
      );
    } catch (error) {
      instance.runtime = {};
      onStatus(`${instance.def.name} failed to start: ${error.message}`);
    }
  }

  function stopRuntime(instance) {
    instance.cleanup.forEach((cleanup) => cleanup());
    instance.cleanup = [];
    instance.clockListener = null;

    try {
      instance.runtime?.dispose?.();
    } catch {
      // A half-built runtime can fail to dispose; it is being dropped anyway.
    }

    instance.runtime = null;
  }

  function hpOf(id) {
    return instances.get(id)?.def.hp ?? 0;
  }

  function addModule(type) {
    const def = defs.get(type);

    if (!def) {
      return null;
    }

    if (
      !layoutRows(
        [...order, `${type}-probe`],
        (id) => (id === `${type}-probe` ? def.hp : hpOf(id)),
        rack,
      )
    ) {
      onStatus(`No room for ${def.name} (${def.hp}HP) · remove a module first`);
      return null;
    }

    const instance = createInstance(type);

    order.push(instance.id);
    renderRack();
    onStatus(`Added ${def.name} · ${def.blurb}`);
    onChange();
    return instance.id;
  }

  function removeModule(id) {
    const instance = instances.get(id);

    if (!instance) {
      return;
    }

    [...cables]
      .filter((cable) => cable.from.module === id || cable.to.module === id)
      .forEach((cable) => removeCable(cable.id, true));
    stopRuntime(instance);
    instance.panel.el.remove();
    instances.delete(id);
    order = order.filter((candidate) => candidate !== id);
    renderRack();
    onStatus(`Removed ${instance.def.name}`);
    onChange();
  }

  function setValue(id, controlId, value, fromPanel = false) {
    const instance = instances.get(id);

    if (!instance || !(controlId in instance.values)) {
      return;
    }

    instance.values[controlId] = value;
    instance.runtime?.set?.(controlId, value);
    signalView(instance, "value", { id: controlId, value });

    if (!fromPanel) {
      instance.panel.setValue(controlId, value);
    }

    onChange();
  }

  /* ---------- signals ---------- */

  function isPatched(id, port) {
    return cables.some(
      (cable) =>
        (cable.from.module === id && cable.from.port === port) ||
        (cable.to.module === id && cable.to.port === port),
    );
  }

  function delayUntil(time) {
    return audio && time !== undefined
      ? Math.max(0, (time - audio.currentTime) * 1000)
      : 0;
  }

  function signalView(instance, name, payload, time) {
    const listeners = instance.viewListeners.get(name);

    if (listeners) {
      setTimeout(
        () => listeners.forEach((listener) => listener(payload)),
        delayUntil(time),
      );
    }
  }

  function deliverGate(instance, port, time, velocity) {
    if (port === "clock" && instance.clockListener) {
      if (velocity > 0) {
        const gap =
          instance.lastClock === null
            ? transport.stepSeconds
            : time - instance.lastClock;

        instance.lastClock = time;
        instance.clockListener(time, Math.min(2, Math.max(0.02, gap)));
      }

      return;
    }

    if (port === "reset" && !instance.runtime?.gates?.reset) {
      if (velocity > 0) {
        instance.runtime?.reset?.(time);
      }

      return;
    }

    instance.runtime?.gates?.[port]?.(time, velocity);
  }

  function routeGate(source, port, time, velocity) {
    const routed = cables.filter(
      (cable) => cable.from.module === source.id && cable.from.port === port,
    );

    routed.forEach((cable) => {
      const target = instances.get(cable.to.module);

      if (target) {
        deliverGate(target, cable.to.port, time, velocity);
      }
    });

    if (velocity > 0 && routed.length > 0) {
      const event = {
        moduleId: source.id,
        port,
        time,
        velocity,
        category: source.def.category,
      };

      gateObservers.forEach((observer) => observer(event));
      setTimeout(
        () => routed.forEach((cable) => flashCable(cable.id)),
        delayUntil(time),
      );
    }
  }

  /* ---------- cables ---------- */

  function portOf(id, portId) {
    return (
      instances.get(id)?.def.ports.find((port) => port.id === portId) ?? null
    );
  }

  function connectAudio(cable) {
    const output = instances.get(cable.from.module)?.runtime?.outputs?.[
      cable.from.port
    ];
    const input = instances.get(cable.to.module)?.runtime?.inputs?.[
      cable.to.port
    ];

    if (output && input) {
      output.connect(input);
    }
  }

  function disconnectAudio(cable) {
    const output = instances.get(cable.from.module)?.runtime?.outputs?.[
      cable.from.port
    ];
    const input = instances.get(cable.to.module)?.runtime?.inputs?.[
      cable.to.port
    ];

    try {
      output?.disconnect(input);
    } catch {
      // Already disconnected (e.g. runtime rebuilt); nothing to undo.
    }
  }

  function notifyPatched(cable) {
    instances.get(cable.from.module)?.runtime?.patched?.();
    instances.get(cable.to.module)?.runtime?.patched?.();
  }

  function addCable(fromId, fromPort, toId, toPort, quiet = false) {
    const from = portOf(fromId, fromPort);
    const to = portOf(toId, toPort);

    if (!from || !to || !canPatch(from, to)) {
      if (!quiet) {
        onStatus(
          "Those jacks don't fit · gates only patch to gates, outputs to inputs",
        );
      }

      return null;
    }

    // One cable per input, like a real jack: a new plug replaces the old one.
    cables
      .filter((cable) => cable.to.module === toId && cable.to.port === toPort)
      .forEach((cable) => removeCable(cable.id, true));

    cableSeed += 1;
    const cable = {
      id: `cable-${cableSeed}`,
      from: { module: fromId, port: fromPort },
      to: { module: toId, port: toPort },
      type: from.type,
    };

    cables.push(cable);

    if (cable.type !== "gate" && audio) {
      connectAudio(cable);
    }

    notifyPatched(cable);

    if (!quiet) {
      renderCables();
      onStatus(
        `${instances.get(fromId).def.name} ${from.label} → ${instances.get(toId).def.name} ${to.label}`,
      );
      onChange();
    }

    return cable.id;
  }

  function removeCable(cableId, quiet = false) {
    const index = cables.findIndex((cable) => cable.id === cableId);

    if (index === -1) {
      return;
    }

    const [cable] = cables.splice(index, 1);

    if (cable.type !== "gate" && audio) {
      disconnectAudio(cable);
    }

    notifyPatched(cable);

    if (!quiet) {
      renderCables();
      onStatus("Cable pulled");
      onChange();
    }
  }

  /* ---------- rendering ---------- */

  function renderRack() {
    const layout = layoutRows(order, hpOf, rack) ?? [order];
    const rowElements = [];

    for (let index = 0; index < rack.rows; index += 1) {
      const row = document.createElement("div");

      row.className = "rack-row";
      row.setAttribute("role", "list");
      row.setAttribute("aria-label", `Rack row ${index + 1}`);
      row.append(
        ...(layout[index] ?? []).map((id) => instances.get(id).panel.el),
      );
      rowElements.push(row);
    }

    rowsHost.replaceChildren(...rowElements);
    requestAnimationFrame(renderCables);
  }

  function jackPoint(jack) {
    const rect = jack.getBoundingClientRect();
    const host = rowsHost.getBoundingClientRect();

    return {
      x: rect.left + rect.width / 2 - host.left,
      y: rect.top + rect.height / 2 - host.top,
    };
  }

  function cablePath(a, b) {
    const droop = CABLE_SAG + Math.hypot(b.x - a.x, b.y - a.y) * 0.25;

    return `M ${a.x} ${a.y} C ${a.x} ${a.y + droop} ${b.x} ${b.y + droop} ${b.x} ${b.y}`;
  }

  function svg(tag, attributes) {
    const node = document.createElementNS(SVG_NS, tag);

    Object.entries(attributes).forEach(([key, value]) =>
      node.setAttribute(key, String(value)),
    );
    return node;
  }

  // Plugs sit on top of their jacks, so they carry the jack's identity: grabbing a plug grabs the jack.
  function plug(point, end) {
    const circle = svg("circle", {
      cx: point.x,
      cy: point.y,
      r: 9,
      class: "cable-plug",
    });

    if (end) {
      circle.dataset.moduleId = end.module;
      circle.dataset.portId = end.port;
    }

    return circle;
  }

  function drawCable(a, b, type, extraClass = "", ends = {}) {
    const group = svg("g", { class: `cable cable-${type} ${extraClass}` });
    const d = cablePath(a, b);

    group.append(
      svg("path", { d, class: "cable-shadow" }),
      svg("path", { d, class: "cable-core" }),
      svg("path", { d, class: "cable-sheen" }),
      plug(a, ends.from),
      plug(b, ends.to),
    );
    return group;
  }

  function renderCables() {
    const width = rowsHost.scrollWidth;
    const height = rowsHost.scrollHeight;
    const groups = [];

    cableLayer.setAttribute("viewBox", `0 0 ${width} ${height}`);
    cableLayer.style.width = `${width}px`;
    cableLayer.style.height = `${height}px`;
    cableElements.clear();

    cables.forEach((cable) => {
      const fromJack = instances
        .get(cable.from.module)
        ?.panel.jacks.get(cable.from.port);
      const toJack = instances
        .get(cable.to.module)
        ?.panel.jacks.get(cable.to.port);

      if (!fromJack?.isConnected || !toJack?.isConnected) {
        return;
      }

      const group = drawCable(
        jackPoint(fromJack),
        jackPoint(toJack),
        cable.type,
        "",
        cable,
      );

      group.dataset.cableId = cable.id;
      group
        .querySelector(".cable-core")
        .setAttribute("aria-label", "Patch cable · click to remove");
      cableElements.set(cable.id, group);
      groups.push(group);
    });

    if (patching?.point) {
      groups.push(
        drawCable(
          jackPoint(patching.jack),
          patching.point,
          patching.port.type,
          "cable-preview",
        ),
      );
    }

    cableLayer.replaceChildren(...groups);

    rowsHost.querySelectorAll(".jack").forEach((jack) => {
      jack.classList.toggle(
        "jack-patched",
        isPatched(jack.dataset.moduleId, jack.dataset.portId),
      );
    });
  }

  function flashCable(cableId) {
    const group = cableElements.get(cableId);

    if (!group) {
      return;
    }

    group.classList.remove("cable-hit");
    // Force a reflow so back-to-back hits restart the flash animation.
    void group.getBoundingClientRect();
    group.classList.add("cable-hit");
  }

  /* ---------- patching interaction ---------- */

  function describeJack(jack) {
    const port = portOf(jack.dataset.moduleId, jack.dataset.portId);

    return port ? { jack, moduleId: jack.dataset.moduleId, port } : null;
  }

  /** The jack under a pointer target, looking through any cable plug sitting on it. */
  function jackAt(element) {
    const hit = element?.closest?.(".jack, .cable-plug[data-module-id]");

    return hit?.classList.contains("cable-plug")
      ? jackOf(hit.dataset.moduleId, hit.dataset.portId)
      : hit;
  }

  function markTargets(start) {
    rowsHost.querySelectorAll(".jack").forEach((jack) => {
      const candidate = describeJack(jack);
      const fits =
        candidate &&
        jack !== start.jack &&
        (canPatch(start.port, candidate.port) ||
          canPatch(candidate.port, start.port));

      jack.classList.toggle("jack-compatible", Boolean(fits));
      jack.classList.toggle("jack-incompatible", !fits && jack !== start.jack);
    });
  }

  function beginPatch(start) {
    patching = { ...start, point: null };
    start.jack.classList.add("jack-patching");
    markTargets(start);
    onStatus(
      `Patching from ${instances.get(start.moduleId).def.name} ${start.port.label} · drop on a lit jack`,
    );
  }

  function endPatch() {
    patching?.jack.classList.remove("jack-patching");
    patching = null;
    rowsHost
      .querySelectorAll(".jack-compatible, .jack-incompatible")
      .forEach((jack) => {
        jack.classList.remove("jack-compatible", "jack-incompatible");
      });
    renderCables();
  }

  function completePatch(target) {
    if (!patching || !target || target.jack === patching.jack) {
      return;
    }

    if (canPatch(patching.port, target.port)) {
      addCable(
        patching.moduleId,
        patching.port.id,
        target.moduleId,
        target.port.id,
      );
    } else if (canPatch(target.port, patching.port)) {
      addCable(
        target.moduleId,
        target.port.id,
        patching.moduleId,
        patching.port.id,
      );
    } else {
      onStatus(
        "Those jacks don't fit · gates only patch to gates, outputs to inputs",
      );
    }
  }

  function jackOf(instanceId, portId) {
    return instances.get(instanceId)?.panel.jacks.get(portId) ?? null;
  }

  // Patch by dragging jack to jack, or by clicking one jack and then another.
  document.addEventListener("pointerdown", (event) => {
    const jack = jackAt(event.target);

    if (patching && !patching.point) {
      if (jack) {
        event.preventDefault();
        completePatch(describeJack(jack));
      }

      endPatch();
      return;
    }

    if (!jack || !rowsHost.contains(jack) || event.button !== 0) {
      return;
    }

    event.preventDefault();
    let start = describeJack(jack);

    // Grabbing a patched input picks its cable back up, VCV style.
    const plugged =
      start?.port.dir === "in" &&
      cables.find(
        (cable) =>
          cable.to.module === start.moduleId && cable.to.port === start.port.id,
      );

    if (plugged) {
      removeCable(plugged.id, true);
      start = describeJack(jackOf(plugged.from.module, plugged.from.port));
      onChange();
    }

    if (start) {
      beginPatch(start);
      renderCables();
    }
  });

  document.addEventListener("pointermove", (event) => {
    if (!patching) {
      return;
    }

    const host = rowsHost.getBoundingClientRect();

    patching.point = {
      x: event.clientX - host.left,
      y: event.clientY - host.top,
    };
    renderCables();
  });

  document.addEventListener("pointerup", (event) => {
    // No drag happened: stay armed so the next jack click completes the patch.
    if (!patching?.point) {
      return;
    }

    const jack = jackAt(
      document.elementFromPoint(event.clientX, event.clientY),
    );

    completePatch(jack ? describeJack(jack) : null);
    endPatch();
  });

  rowsHost.addEventListener("keydown", (event) => {
    const jack = event.target.closest(".jack");

    if (!jack) {
      return;
    }

    if (event.key === "Escape") {
      endPatch();
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();

    if (!patching) {
      beginPatch(describeJack(jack));
    } else {
      completePatch(describeJack(jack));
      endPatch();
    }
  });

  cableLayer.addEventListener("click", (event) => {
    const group =
      event.target.closest(".cable-core") &&
      event.target.closest("[data-cable-id]");

    if (group) {
      removeCable(group.dataset.cableId);
    }
  });

  /* ---------- module moving ---------- */

  let dragging = null;

  function moveModule(id, targetIndex) {
    const next = order.filter((candidate) => candidate !== id);

    next.splice(Math.max(0, Math.min(next.length, targetIndex)), 0, id);

    if (next.join() === order.join() || !layoutRows(next, hpOf, rack)) {
      return false;
    }

    order = next;
    renderRack();
    return true;
  }

  rowsHost.addEventListener("pointerdown", (event) => {
    const header = event.target.closest(".module-title");

    if (!header || event.target.closest("button") || event.button !== 0) {
      return;
    }

    event.preventDefault();
    dragging = header.closest(".module-panel").dataset.moduleId;
    instances.get(dragging).panel.el.classList.add("module-dragging");
  });

  document.addEventListener("pointermove", (event) => {
    if (!dragging) {
      return;
    }

    const over = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest(".module-panel");

    if (!over || over.dataset.moduleId === dragging) {
      return;
    }

    const rect = over.getBoundingClientRect();
    const overIndex = order.indexOf(over.dataset.moduleId);
    const after = event.clientX > rect.left + rect.width / 2;
    const withoutDragged = order.filter((id) => id !== dragging);
    const target =
      withoutDragged.indexOf(over.dataset.moduleId) + (after ? 1 : 0);

    if (overIndex !== -1) {
      moveModule(dragging, target);
    }
  });

  document.addEventListener("pointerup", () => {
    if (!dragging) {
      return;
    }

    instances.get(dragging)?.panel.el.classList.remove("module-dragging");
    dragging = null;
    onChange();
  });

  rowsHost.addEventListener("keydown", (event) => {
    const header = event.target.closest(".module-title");

    if (!header || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) {
      return;
    }

    event.preventDefault();
    const id = header.closest(".module-panel").dataset.moduleId;

    if (
      moveModule(id, order.indexOf(id) + (event.key === "ArrowLeft" ? -1 : 1))
    ) {
      instances.get(id).panel.el.querySelector(".module-title").focus();
      onChange();
    }
  });

  window.addEventListener("resize", () => requestAnimationFrame(renderCables));

  /* ---------- audio ---------- */

  function createBus(context) {
    const input = context.createGain();
    const limiter = context.createDynamicsCompressor();
    const output = context.createGain();
    const splitter = context.createChannelSplitter(2);
    const analyser = context.createAnalyser();
    const left = context.createAnalyser();
    const right = context.createAnalyser();

    input.channelCount = 2;
    input.channelCountMode = "explicit";
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 14;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.16;
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.72;
    left.fftSize = 2048;
    right.fftSize = 2048;

    input.connect(limiter);
    limiter.connect(output);
    output.connect(context.destination);
    output.connect(analyser);
    output.connect(splitter);
    splitter.connect(left, 0);
    splitter.connect(right, 1);

    return { input, output, analyser, left, right };
  }

  async function powerOn() {
    if (!audio) {
      audio = new AudioContext({ latencyHint: "interactive" });
      bus = createBus(audio);

      const worklets = new Set(
        [...defs.values()].map((def) => def.worklet).filter(Boolean),
      );

      for (const url of worklets) {
        try {
          await audio.audioWorklet.addModule(url);
        } catch (error) {
          onStatus(`Could not load DSP worklet: ${error.message}`);
        }
      }

      instances.forEach(startRuntime);
      cables.filter((cable) => cable.type !== "gate").forEach(connectAudio);
      instances.forEach((instance) => instance.runtime?.patched?.());
    }

    await audio.resume();
  }

  async function powerOff() {
    transport.stop();
    await audio?.suspend();
  }

  /* ---------- patches ---------- */

  function clear() {
    transport.stop();
    [...cables].forEach((cable) => removeCable(cable.id, true));
    instances.forEach((instance) => stopRuntime(instance));
    instances.clear();
    order = [];
  }

  function serialize() {
    return {
      v: PATCH_VERSION,
      bpm: transport.bpm,
      swing: transport.swing,
      modules: order.map((id) => {
        const { type } = instances.get(id).def;
        return {
          id,
          type,
          values: { ...instances.get(id).values },
          data: instances.get(id).data,
        };
      }),
      cables: cables.map((cable) => [
        cable.from.module,
        cable.from.port,
        cable.to.module,
        cable.to.port,
      ]),
    };
  }

  /** Replace the whole rack with a patch. Unknown modules and jacks are skipped. */
  function load(patch) {
    const wasPlaying = transport.playing;
    let skipped = 0;

    clear();
    transport.bpm = patch.bpm ?? 120;
    transport.swing = patch.swing ?? 0;

    patch.modules.forEach((module) => {
      const def = defs.get(module.type);
      const fits =
        def &&
        layoutRows(
          [...order, module.id],
          (id) => (id === module.id ? def.hp : hpOf(id)),
          rack,
        );
      const instance = fits
        ? createInstance(module.type, module.id, module.values, module.data)
        : null;

      if (instance) {
        order.push(instance.id);
      } else {
        skipped += 1;
      }
    });

    patch.cables.forEach(([fromId, fromPort, toId, toPort]) => {
      if (!addCable(fromId, fromPort, toId, toPort, true)) {
        skipped += 1;
      }
    });

    renderRack();

    if (wasPlaying) {
      transport.start();
    }

    return skipped;
  }

  return {
    transport,
    get audio() {
      return audio;
    },
    get bus() {
      return bus;
    },
    get moduleCount() {
      return instances.size;
    },
    get cableCount() {
      return cables.length;
    },
    get usedHp() {
      return order.reduce((sum, id) => sum + hpOf(id), 0);
    },
    capacityHp: rack.rows * rack.rowHp,
    catalog,
    addModule,
    removeModule,
    addCable,
    removeCable,
    setValue,
    controlOf: (id, controlId) =>
      instances
        .get(id)
        ?.def.controls.find((control) => control.id === controlId) ?? null,
    valueOf: (id, controlId) => instances.get(id)?.values[controlId],
    serialize,
    load,
    powerOn,
    powerOff,
    renderCables,
    onGate: (observer) => {
      gateObservers.add(observer);
      return () => gateObservers.delete(observer);
    },
    noteInput: (note, velocity) =>
      noteListeners.forEach((listener) => listener(note, velocity)),
  };
}
