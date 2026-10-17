# ROOG Beats architecture

An FL Studio-style beat maker at `beats.html`: channel rack, piano roll, patterns + playlist, mixer, local save. Fast, simple, easy to extend. This doc is the contract for anyone changing it.

## Decisions

| Decision                                                                           | Why                                                                                                           |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| pnpm + Vite 8 multi-page (`index`, `studio`, `beats`)                              | One dev server and build for every page; the legacy JS pages run unchanged.                                   |
| React 19 + React Compiler (Babel preset, `src/beats` only)                         | Automatic memoization without hand-written `useMemo`; Babel path is the stable one.                           |
| TypeScript 6.0 strict (+ `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) | typescript-eslint doesn't support TS 7 yet.                                                                   |
| Tailwind v4, tokens in `src/beats/styles.css`                                      | One source for colors; canvases read the same tokens (`ui/theme.ts`).                                         |
| Zustand: `project-store` + `ui-store`, panel-local stores for view state           | Selector subscriptions keep renders narrow; actions are plain functions, not store members.                   |
| Immer + snapshot undo with gesture ids                                             | Undo is "keep the old project" (structural sharing makes it cheap); a drag is one undo step.                  |
| zod/mini schema is the source of all domain types                                  | ~7 KB vs ~50 KB for ArkType, for a parse we run once per load. Versioned migrations + registry normalization. |
| Custom scheduler, no Tone.js                                                       | We need ~400 lines of Web Audio; one pure `collectEvents` drives realtime and WAV export.                     |
| Patterns hold notes only; a step is a one-step note                                | The rack and the piano roll edit the same data; one scheduler path.                                           |
| Factory kit synthesized into buffers at runtime                                    | No sample files to ship or license; every drum is just a sampler channel, so 808s work on the piano roll.     |
| Master ends in compressor → soft clipper (ceiling -0.2 dBFS)                       | Live output and WAV export never clip, whatever the mix does.                                                 |
| Every instrument/effect param is a number with a `ParamSpec`                       | One `<Knob>`, one normalizer, free migrations when params change, automation-ready later.                     |
| Canvas for grids/timelines, DOM for controls, one shared rAF loop                  | Thousands of cells/notes stay smooth; playhead/meters never touch React.                                      |
| IndexedDB (`idb`) is the primary store; files for export/import                    | Autosave without prompts; File System Access where supported, download fallback elsewhere.                    |
| Vitest for pure logic; ESLint 10 + typescript-eslint (type-checked) + react-hooks  | Tests where bugs hide (timing, schema, commands); lint enforces hooks/compiler rules and layer boundaries.    |

## Folder map (`src/beats/`)

```
main.tsx, styles.css   entry (awaits bootPersistence, then renders) + theme tokens
app/                   shell layout, TransportBar, first-run hint bar, shortcuts sheet, workspace view registry, global shortcuts
core/                  pure domain, no React/audio: schema, migrate, defaults, commands,
                       timing, schedule, params, contracts, ids, samples (sample-id prefixes)
state/                 project-store (project + undo), ui-store (view, selection, transport mode)
ui/                    shared controls: Button + Select, Segmented, Knob, ParamControl, MuteLed,
                       LedButton, Meter, Dialog, RenameField, menu, toast (+ toastWithUndo);
                       canvas, frame, timeline, hotkeys, dnd (sample drag type), theme, specs
engine/                index (BeatsEngine singleton), transport (pure timing), graph (mixer
                       graph for any BaseAudioContext), buffers (sample cache), clock (+worker), wav
instruments/ effects/  registries + implementations (sampler, synth; filter, eq, delay, reverb,
                       drive, compressor)
sounds/                factory kit recipes (factory.ts) + shared DSP helpers (dsp.ts)
persistence/           db (idb schema), autosave (+ `useSaveStatus`: Saved / Saving… / Not saved), samples, projects (menu actions), file-format
panels/channel-rack/   rack rows, one step canvas, channel settings, rack actions
panels/browser/        factory sounds + "My samples", import, drag to rack
panels/piano-roll/     note grid, keyboard, ruler, velocity lane, toolbar, note commands
panels/playlist/       pattern list, track headers, timeline canvas, clip helpers
panels/mixer/          strips, fader, FX rack
panels/projects/       project menu + projects dialog
```

Lint-enforced: `core/` imports nothing from `state/ui/engine/persistence/panels/app` (registries are allowed); panels never import other panels. Use the `@/` alias (`@/core/commands`). The engine imports `@/persistence/samples` directly (not the barrel) because `persistence/projects.ts` imports the engine.

## Data model (`core/schema.ts`)

Ticks at 96 PPQ, 4/4. `STEP_TICKS = 24` (a 16th), `BAR_TICKS = 384`.

- **Project**: `version, id, name, createdAt, updatedAt, bpm, swing, channels[], patterns[], playlist{tracks[], clips[]}, mixer{master, inserts[]}`.
- **Channel**: `instrument` (registry key) + `params` (numbers) + `sampleId` (`factory:kick` / `user:<sha256>` / null), `volume, pan, muted, solo, mixerTrackId` (`"master"` or an insert id). New channels get their own insert.
- **Pattern**: `steps` (grid length) + `notes: Record<channelId, Note[]>`. Note = `{id, tick, length, pitch, velocity}`. Length = step grid, grown to whole bars by note starts (`patternLength`).
- **Clip**: `{patternId, trackId, start, length}`; longer than the pattern = it repeats; notes cut at the clip end.
- **MixerTrack**: `volume, pan, muted, solo, effects: EffectSlot[]` (`{kind, enabled, params}`). Solo is its own flag, apart from mute: while one channel (or insert) is soloed the engine silences the others, and clearing it leaves hand-set mutes alone. The rack and mixer show a "Solo: X" chip while it applies.
- Channel and pattern names stay unique (`uniqueName`). Renaming a channel also renames its own insert (one only it feeds that still has its old name).
- **New project** is the factory kit with no steps or clips; **New from demo beat** adds the starter groove.
- Selection, view and transport mode are **UI state** (`ui-store`), never saved or undone.

## Data flow

```
pointer/keys → panel → edit(p => command(p, …), gesture) → project-store (Immer, undo)
                                     │
             ┌───────────────────────┼─────────────────────────┐
             ▼                       ▼                         ▼
   components re-render        engine.sync(project)      persistence autosave
   (narrow selectors only)     reconciles audio graph    (debounced, idle time)
                               scheduler reads getState() every ~25 ms:
                               collectEvents(window) → instrument.trigger(time)
engine.getPlayhead() / readMeter() ← read inside useFrame → drawn on canvas (no React)
```

- `edit()` returns the recipe's result: `const id = edit((p) => addPattern(p))`.
- The engine writes only `ui-store.playing`. It reads `playMode` + `patternId` via `currentScope()`.

## Contracts

- `core/contracts.ts`: `InstrumentDef` / `Instrument` (stateless: params arrive with every `trigger`), `EffectDef` / `Effect`, `FactorySound`, `BeatsEngine`, `Playhead`.
- `core/schedule.ts`: `collectEvents(project, scope, fromTick, toTick)` + `patternLength`, `songLength`, `scopeLength`. `engine/transport.ts` turns windows of it into audio times (BPM and scope changes re-anchor at the last scheduled tick, so nothing skips or doubles).
- `core/timing.ts`: tick/second math, `swingTick`, `TransportAnchor` helpers (`tickAtTime`, `timeAtTick`, `reanchor`).
- `core/commands.ts`: shared edits (channels, steps/notes, patterns, playlist tracks and clips, mixer). Panel-only edits live in the panel (`piano-roll/commands.ts`, `playlist/clips.ts`, `channel-rack/actions.ts`).
- `@/persistence`: `bootPersistence`, `saveNow`, project actions (`newProject`, `openProject`, `importProjectFile`, `exportProjectFile`, `exportWav`, ...), samples (`importAudioFiles`, `importSample`, `getSampleBlob`, `deleteSample`, `useSampleLibrary`).

## Extension points

- **Instrument**: `instruments/foo.ts` with `defineInstrument({ name, params, usesSample, create })`, add to `instruments/index.ts`. Rack knobs come from `params`; old projects pick up new params automatically. A param with `options` renders as a `Segmented` control; `ParamSpec.format` sets a custom readout. `DEFAULT_INSTRUMENT` is the sampler: anything that loads a sample into a channel uses it.
- **Effect**: `effects/foo.ts` with `defineEffect(...)`, add to `effects/index.ts`. The mixer lists every registry entry. Use `effects/smooth.ts` for click-free param changes.
- **Factory sound**: append to `sounds/factory.ts`. Ids are saved in projects: never rename one.
- **Workspace view**: `panels/foo/index.tsx`, add the id to `WorkspaceView` (`state/ui-store.ts`) and an entry in `app/views.ts`.
- **Project field**: add it to the schema with a default (`z._default(...)`). Renames/reshapes: bump `PROJECT_VERSION`, add a step in `core/migrate.ts`.
- **Drop target for sounds**: accept `carriesSamples(dataTransfer)` (`ui/dnd.ts`), read `SAMPLE_MIME` for browser sounds, pass files to `importAudioFiles`.
- **Shortcut**: `useHotkeys({...})` in the owning component, then update the map below.

## Design system

Warm colors are the instrument talking, cool colors are your music, ink is what you picked. Tokens live in `styles.css`; canvases read the same ones through `themeColors()`.

| Token     | Means only                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `hot`     | Time is moving: playhead, Play while playing, the wordmark                                                                           |
| `acid`    | Sound on / OK: on-LEDs, meter below -6 dB, saved, drops that add a sound                                                             |
| `amber`   | Attention: solo, drops that replace, warnings, meter -6..-1 dB, busy text                                                            |
| `rec`     | Danger / too loud / failed: clip, destructive actions, errors                                                                        |
| `ink`     | You picked this: selection outlines, pressed segment, active tool/tab                                                                |
| `focus`   | Keyboard focus rings and the step-grid keyboard cursor                                                                               |
| `ink-dim` | Secondary text (captions, units). `ink-mute`: disabled and decoration only                                                           |
| Swatches  | Channel and pattern identity (`SWATCHES` in `core/defaults.ts`, cool hues only: Sky, Pink, Teal, Violet, Ice, Magenta, Blue, Purple) |

- **Type:** Anton only for the wordmark, `panel-title`, mixer strip names and dialog titles. Inter for names, JetBrains Mono for numbers. Scale: `text-2xs` 11px (captions, units, kbd; nothing in the DOM is smaller), `text-xs` 12px, `text-sm` 14px, `panel-title` 16px. `caption` (11px mono uppercase, `ink-dim`) labels every control. Canvas text uses `CANVAS_FONT`.
- **Controls:** knob = continuous amount (`Knob` layouts `stack` / `inline` / `bare`) · `Segmented` = pick one of a few (`ParamControl` picks for you) · `Select` = long list · `MuteLed` = sound on/off · `Button` (`neutral` / `ghost` / `danger`, `sm` / `md`) = do something · `LedButton` = a single toggle. Values are visible at rest; every number has a unit (`formatParam`).
- **Rename:** `RenameField` commits on Enter or blur, Escape cancels, empty reverts. Knobs reset on double-click.
- **Feedback:** edits the user didn't watch happen get `toastWithUndo` (replaced sound, deleted channel, deleted pattern with clips, deleted sample, which names the channels that go silent). Imports always report what happened. Save status sits next to the project name. No `window.confirm`/`alert`: use `Dialog` or Undo.
- **Keyboard rules (`ui/hotkeys.ts`):** Ctrl/Cmd+S always saves. Otherwise global keys are off in text fields and while a modal `<dialog>` is open. A focused `<select>` owns arrows/Home/End/PageUp/PageDown/Enter. Buttons, radios, tabs, links and menu items own Space/Enter only when focused from the keyboard (`:focus-visible`), so Space still plays after a mouse click.

## Performance rules (everyone)

1. Per-frame values (playhead, meters, drag pixels, hover) never go into React state or a store. Read `engine.getPlayhead()` / `readMeter()` inside `useFrame` and draw on canvas.
2. Subscribe with the narrowest selector: `useProjectStore((s) => s.project.patterns)`. Never select a fresh object/array (use `useShallow` if you must). Never call a store hook without a selector.
3. Grids, rolls and timelines are canvas (`useCanvas` + `ui/timeline.ts`): a static layer that repaints when its data renders, plus an overlay canvas for the playhead via `useFrame`. Destructure `useCanvas`: `const { ref: gridRef, redraw } = useCanvas(draw)`.
4. Commit to the store when a snapped value changes (cell crossed, grid step moved), not on every pointermove. One `gesture` id per pointerdown (`createId()`) so a drag is one undo step.
5. Drags use `setPointerCapture`; no window listeners that outlive a gesture. Right-click erases in draw tools (`onContextMenu` + `preventDefault`).
6. Registry and module scope are import-safe: no `AudioContext`, DOM or timers at import. Only `engine/` creates the realtime `AudioContext`; throwaway `OfflineAudioContext`s (decode checks, renders) are fine anywhere.
7. Audio param changes ramp (`setTargetAtTime`), never jump. Nothing in the audio path allocates per sample or per frame.
8. No `any`. `as` only at I/O boundaries with a comment. Prefer inferred types; derive from the schema/registries instead of restating shapes.
9. Event handlers stay under ~4 ms. Long work (decode, WAV render, big imports) is async with a toast for progress or errors.
10. Panel view state that should survive tab switches (zoom, scroll, tool, snap) lives in a module-level store inside the panel; only the active view is mounted.

## Shortcut map

| Owner          | Keys                                                                                                                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global (`app`) | Space play/stop · L pattern/song · F5 playlist · F6 channel rack · F7 piano roll · F9 mixer · Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y · Ctrl+S · [ ] · ? shortcuts sheet                                                        |
| RACK           | 1–0 mute channel n · Shift+1–0 solo · Alt+↑/↓ move selected channel · Alt+C clone selected · Alt+Delete delete selected · F2 / double-click rename · arrows + Enter on the step grid                                   |
| PIANO          | Click a note in any tool selects it · P draw · B paint · D delete · E select · Delete · Ctrl+A/C/X/V/D (V pastes after the copied block; repeats stack) · Ctrl+Q quantize · ↑/↓ semitone · Ctrl+↑/↓ octave · ←/→ nudge |
| PLAYLIST       | P draw · B paint · D delete · E select · Delete · Ctrl+A/C/V/D · moves never overlap clips                                                                                                                             |

Mouse everywhere: wheel scroll, Shift+wheel horizontal, Ctrl+wheel zoom, Alt bypasses snap, Alt+wheel = velocity (piano roll), double-click a knob resets it.

## Out of v1 (on purpose)

Automation, tempo/time-signature changes, transport seek and loop regions (play always starts at the top), MIDI input and recording, audio recording, per-step pan/pitch lanes, clip offsets/slicing, audio clips on the playlist, sends/sidechain, URL sharing, collaboration, mobile layout.

## Status and known gaps

v1 is built: the six original work packages are merged and an end-to-end browser pass (play, rack paint, piano roll, song mode, mixer, sample import, reload, export/import, WAV) passes against `dist/`. Known gaps, smallest first:

- Delay isn't tempo-synced (would need BPM in `Effect.update`); meters are mono peaks.
- A sample that fails to load is not retried until reload; a pattern-length change mid-play can jump the playhead inside the loop.
- Playlist: resize affects only the grabbed clip, snap is fixed to bars (Alt for free).
- Piano roll: no edge auto-scroll or vertical zoom.
- No keyboard editing on the piano roll and playlist canvases.
- Per-instrument params aren't remembered when a channel switches instruments.
- Two tabs on the same project: last write wins.
