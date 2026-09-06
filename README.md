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

## Deploy

Netlify uses `netlify.toml`:

- build command: `npm run build`
- publish directory: `dist`

The current baseline renders a placeholder rack shell backed by a small module registry,
standard module panel renderer, typed port metadata, and a lazy Web Audio graph host that
future module, patching, and layout tickets can plug into.
