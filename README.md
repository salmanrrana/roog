# ROOG

ROOG is a browser-based eurorack simulation built with plain HTML, CSS, and JavaScript.

## Commands

- `npm run dev` starts the local static dev server at `http://localhost:5173`.
- `npm run build` copies the deployable static site into `dist/`.
- `npm run check:fast` lints and runs the rack/audio assertions without building.
- `npm test` performs its own build before the smoke assertions.

Run `npm install` once to enable the tracked pre-commit hook. It checks staged
source with Prettier before running the fast project check.
The existing smoke harness keeps its hand formatting to avoid mixing its small
build-control change with a whole-file rewrite.
- `npm test` runs the scaffold smoke test.
- `npm run check` runs build and smoke validation.

## Studio (`studio.html`)

A playable modular synth. Hit POWER and the default patch plays itself.

- One master clock (BPM, swing, tap tempo). Sequencers follow it unless you
  patch something into their `clock` jack.
- Voltage standard: pitch is 1 V/oct with 0 V = C4. Audio and cv jacks patch into
  each other; gates are timed events and only patch to gates.
- Modules: CLOCK, STEPS (acid sequencer), GRID (drum sequencer), EUCLID, TURING,
  KEYS (MIDI + computer keyboard), VCO, FOLD, STRING, KIT, VCF, LPG, VCA, ENV, LFO,
  QUANT, MIX, DIRT, TAPE, SPACE, SCOPE, OUT.
- Patches autosave, and SHARE copies a link that rebuilds the exact patch.
  REC records the master output. MIDI LEARN maps controller knobs to rack knobs.
- The visualizer has three modes: orbit (gates burst around a 16-step ring),
  spectrum and waterfall.

To add a module, write a `ModuleDef` (see `src/studio/types.js`) and list it in
`src/studio/modules/index.js`.

## Deploy

Netlify uses `netlify.toml`:

- build command: `npm run build`
- publish directory: `dist`

The current baseline renders a placeholder rack shell backed by a small module registry,
standard module panel renderer, typed port metadata, and a lazy Web Audio graph host that
future module, patching, and layout tickets can plug into.
