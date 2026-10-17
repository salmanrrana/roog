# ROOG

Three browser instruments in one site:

- **Rack** (`index.html`): a eurorack patch bay. Plain JS.
- **Studio** (`studio.html`): a playable modular synth. Plain JS.
- **Beats** (`beats.html`): an FL Studio-style beat maker (channel rack, piano roll,
  playlist, mixer) that saves everything on your machine. React + TypeScript.

## Commands

Requires Node 22.12+ and pnpm (`corepack enable` picks the pinned version).

- `pnpm install` installs dependencies and enables the pre-commit hook.
- `pnpm dev` starts Vite at `http://localhost:5173` (all three pages).
- `pnpm build` builds every page into `dist/`; `pnpm preview` serves it.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` (Vitest), `pnpm format:check`.
- `pnpm check:fast` runs lint + typecheck + tests (the pre-commit hook runs this on
  the staged snapshot, plus Prettier on staged files). `pnpm check` adds format and build.

## Beats (`beats.html`)

- **Channel rack**: click or drag across steps to paint, right-click to erase. 1–0 mutes
  a channel, Shift+1–0 solos it. Double-click a channel name to open its piano roll.
- **Piano roll** (F7): P draw, B paint, D delete, E select. Alt bypasses snap, Ctrl+Q
  quantizes, arrows transpose and nudge.
- **Playlist** (F5): pick a pattern on the left, click the timeline to place it, drag to
  move, drag the right edge to repeat it. L switches between pattern and song mode.
- **Mixer** (F9): every channel gets its own insert with fader, pan, mute/solo and effects
  (filter, EQ, delay, reverb, drive, compressor).
- **Sounds**: a synthesized kit ships built in; drop your own audio files on the browser
  or the rack.
- **Saving**: autosaves to this browser (IndexedDB). The project menu opens and creates
  projects, exports/imports `.roogbeats` files (your samples included) and renders WAV.

How it is built, the rules for keeping it fast, and how to add an instrument, effect,
sound or view: [`docs/beats-architecture.md`](docs/beats-architecture.md).

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

## Tests

- `src/beats/**/*.test.ts`: Beats pure logic: timing, scheduler, transport, schema and
  migrations, commands, undo, WAV and project-file encoding, editor geometry.
- `tests/legacy/`: behaviour checks for the Rack and Studio pages.

## Deploy

Netlify (`netlify.toml`) runs `pnpm run build` on Node 22 and publishes `dist/`.
