# Language redirect worker

This worker is a small edge routing layer for the public docs homepage.

It chooses a localized docs path when the request has a clear language signal.
The GitHub Pages site still owns the actual HTML, assets, generated locale
pages, and normal static-file serving.

## Behavior

The worker is intentionally narrow:

- It only considers homepage requests.
- It ignores already-localized paths, assets, bots, and non-page traffic.
- It prefers explicit language choices over cookies and browser language
  headers.
- It verifies that a localized page exists before redirecting.
- It passes through anything outside its scope.

English remains the default root page. Non-English locales use the generated
localized docs paths.

## Boundaries

This worker is not an extension backend. It should stay limited to public-site
routing, canonicalization, and small docs-site edge behavior.

Realtime or extension-facing services belong in their own worker.

For current configuration and deployment details, use `wrangler.toml` and the
root package scripts as the source of truth.
