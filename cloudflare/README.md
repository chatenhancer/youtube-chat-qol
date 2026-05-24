# Cloudflare language redirect

`language-redirect-worker.js` is an optional Cloudflare Worker for the public
landing page.

It redirects only first-page visits to `/` or `/index.html`. It checks:

1. `?lang=` or `?hl=` query parameters.
2. The `ce_lang` cookie, which the language selector uses.
3. The browser `Accept-Language` header.

The Worker probes the target localized path before redirecting. If `/es/` or
another localized page does not exist yet, it falls back to the English page
instead of sending users to a 404.