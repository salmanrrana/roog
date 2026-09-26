// JSDoc-only contract for studio modules. Adding a module means writing one
// ModuleDef and listing it in modules/index.js — nothing else changes.
//
// Signal standard:
//   audio - ±1 audio-rate signal
//   cv    - volts at audio rate. Pitch is 1 V/oct with 0 V = C4. Envelopes run
//           0..5 V, LFOs ±5 V. Audio and cv jacks can be patched into each
//           other, like real modular.
//   gate  - timed events, not audio. A rising edge is emit(port, time, velocity>0),
//           a falling edge is emit(port, time, 0). Emit in time order per port.

/**
 * @typedef {"audio" | "cv" | "gate"} SignalType
 * @typedef {"in" | "out"} PortDir
 * @typedef {{ id: string, label: string, type: SignalType, dir: PortDir }} PortDef
 *
 * @typedef {object} ControlDef
 * @property {string} id
 * @property {string} label
 * @property {number | string} value - default value
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [step]
 * @property {"exp"} [curve] - exponential knob travel for frequencies and times
 * @property {string} [unit]
 * @property {string[]} [options] - renders a select instead of a knob
 *
 * @typedef {object} ModuleContext
 * @property {string} id
 * @property {AudioContext} audio
 * @property {Record<string, number | string>} values - live control values
 * @property {Record<string, any>} data - module-owned state, saved with the patch
 * @property {(port: string, time: number, velocity: number) => void} emit - send a gate event
 * @property {(name: string, payload?: unknown, time?: number) => void} signal - notify the panel view at an audio time
 * @property {(listener: (time: number, stepSeconds: number) => void) => void} onClock - master clock, or the "clock" gate input when patched
 * @property {(port: string) => boolean} isPatched
 * @property {(listener: (note: number, velocity: number) => void) => void} onNote - MIDI / computer keyboard (velocity 0 = note off)
 * @property {AudioNode} master - stereo bus feeding the speakers
 * @property {() => number} stepSeconds - current master 16th-note length
 *
 * @typedef {object} ModuleRuntime
 * @property {Record<string, AudioNode | AudioParam>} [inputs] - audio/cv inputs by port id
 * @property {Record<string, AudioNode>} [outputs] - audio/cv outputs by port id
 * @property {Record<string, (time: number, velocity: number) => void>} [gates] - gate inputs by port id
 * @property {(controlId: string, value: number | string) => void} [set] - a control changed
 * @property {(time: number) => void} [reset] - transport restarted or reset gate fired
 * @property {() => void} [patched] - cables changed somewhere on this module
 * @property {Record<string, AnalyserNode>} [probes] - analysers the panel view can read (scopes, meters)
 * @property {() => void} [dispose]
 *
 * @typedef {object} ViewContext
 * @property {string} id
 * @property {Record<string, any>} data
 * @property {Record<string, number | string>} values
 * @property {(name: string, listener: (payload: any) => void) => void} on - hear runtime signals; "value" fires on every control change
 * @property {() => void} changed - call after editing data so the patch autosaves
 * @property {(name: string) => AnalyserNode | null} probe - one of the runtime's probes (null while powered off)
 *
 * @typedef {object} ModuleDef
 * @property {string} type
 * @property {string} name
 * @property {"sequencer" | "source" | "modulator" | "shaper" | "fx" | "utility"} category
 * @property {number} hp
 * @property {string} blurb
 * @property {PortDef[]} ports
 * @property {ControlDef[]} controls
 * @property {(ctx: ModuleContext) => ModuleRuntime} create
 * @property {(host: HTMLElement, view: ViewContext) => void} [view] - custom panel UI (grids, LEDs, screens)
 * @property {() => Record<string, any>} [initialData]
 * @property {string} [worklet] - AudioWorklet module URL to load at power-up before create() runs
 */

export {};
