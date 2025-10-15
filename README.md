# Intranet Tools Suite

Static offline-friendly utilities for media preparation, PDF compression, and diagnostics. Each tool runs entirely in the browser—no network access required.

## Quick start

```bash
# install Playwright dependencies (optional, only required for tests)
npm install

# launch a local static server on http://127.0.0.1:4173
npm run serve
```

Open <http://127.0.0.1:4173> in a modern Chromium, Firefox, or Edge browser. All tools support offline use once cached.

## Automated smoke tests

A lightweight Playwright suite verifies that the dashboard and key tool entry points load:

```bash
npm run test
```

The Playwright configuration automatically starts the static server defined in `scripts/dev-server.mjs` before running tests.

## Repository layout

- `index.html` – dashboard landing page with cards linking to each tool.
- `css/styles.css` – shared design system and component styles.
- `js/app.js` – theme toggling, ripple effects, and interactive dashboard cards.
- `tools/` – individual tool implementations (HTML + JS).
- `scripts/dev-server.mjs` – zero-dependency static file server used for local development and tests.
- `tests/` – Playwright smoke tests.

## Tooling

All scripts rely on native browser APIs—no bundler or build step is required. Run `npm run serve` whenever you need an offline-ready preview.
