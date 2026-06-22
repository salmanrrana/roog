# ROOG

ROOG is a browser-based eurorack simulation built with plain HTML, CSS, and JavaScript.

## Commands

- `npm run dev` starts the local static dev server at `http://localhost:5173`.
- `npm run build` copies the deployable static site into `dist/`.
- `npm test` runs the scaffold smoke test.
- `npm run check` runs build and smoke validation.

## Deploy

Netlify uses `netlify.toml`:

- build command: `npm run build`
- publish directory: `dist`

The current baseline renders a placeholder rack shell backed by a small module registry,
standard module panel renderer, typed port metadata, and a lazy Web Audio graph host that
future module, patching, and layout tickets can plug into.
