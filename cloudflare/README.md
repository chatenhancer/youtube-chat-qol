# Cloudflare

This folder contains the Cloudflare pieces that support `chatenhancer.com` and
opt-in extension features.

The Cloudflare code is split by responsibility so the public-site routing layer
does not grow into a general extension backend.

## Areas

- `language-redirect` handles first-visit language routing for the public docs
  site.
- `playground` is the realtime backend for opt-in Playground games.

## Boundaries

The static docs site is still built from `docs/` and deployed by GitHub Actions.
The browser extension builds stay under `src/`, `src/assets/`, and `scripts/`.

Cloudflare workers should stay narrow, explicit, and feature-scoped. Add a new
worker when a feature needs a different runtime shape instead of expanding an
unrelated worker.

For exact entrypoints, scripts, and Cloudflare configuration, use
`package.json` and the worker-specific `wrangler.toml` files as the source of
truth.
