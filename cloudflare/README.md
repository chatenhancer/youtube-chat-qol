# Cloudflare worker

This folder contains the Cloudflare Worker used by `chatenhancer.com`.

The main GitHub Pages site is still served from the repository's `docs/`
folder. This Worker sits in front of that site on Cloudflare and only handles
language routing for first visits to the homepage.

## What it does

`language-redirect-worker.js` redirects homepage requests to a localized docs
page when the user clearly prefers a supported language.

It only handles:

- `/`
- `/index.html`

It ignores:

- non-GET/HEAD requests
- bots and crawlers
- any already-localized path such as `/es/`
- assets such as `/styles.css`, images, screenshots, or icons
- support/store/GitHub redirects handled elsewhere

For requests it does not handle, it calls `fetch(request)` so Cloudflare
continues to serve the normal GitHub Pages response.

## Locale priority

The Worker picks a locale in this order:

1. Explicit query parameter: `?lang=` or `?hl=`
2. `ce_lang` cookie, set by the docs language selector
3. Browser `Accept-Language` header

English is the default locale and stays at `/`.

Non-English locales redirect to their generated docs paths, for example:

```txt
https://chatenhancer.com/es/
https://chatenhancer.com/ja/
https://chatenhancer.com/zh-CN/
```

Before redirecting, the Worker probes the localized page with a `HEAD` request.
If the page does not exist, it falls back to the normal English homepage instead
of redirecting users to a 404.

## Configuration

`wrangler.toml` defines the Worker name, entrypoint, compatibility date, and
production routes.

Configured routes:

```txt
chatenhancer.com/*
www.chatenhancer.com/*
```

Both hostnames must have proxied/orange-cloud DNS records in Cloudflare before
the routes receive traffic.

The Worker name must match the Cloudflare Worker project:

```txt
chat-enhancer-language-redirect
```

## Deploy from Git

Uses Cloudflare Workers Git integration so the deployed Worker matches the code
committed in this repository.

Setup:

- Repository: `chat-enhancer-yt/youtube-chat-qol`
- Root directory: repository root
- Build command: `npm ci`
- Deploy command: `npm run cloudflare:deploy`

The deploy script runs:

```sh
npx wrangler@4 deploy --config cloudflare/wrangler.toml
```

`wrangler` is intentionally called through `npx` instead of being added as a
project dependency to keep the browser extension's development dependency
set focused on extension build tooling.

## Local commands

Run a local Worker dev server:

```sh
npm run cloudflare:dev
```

Deploy manually from a logged-in Wrangler session:

```sh
npm run cloudflare:deploy
```

## Testing

After deployment, test redirects with `curl`:

```sh
curl -I -H "Accept-Language: es" https://chatenhancer.com/
```

Expected result: `302` to `/es/`.

```sh
curl -I -H "Accept-Language: en" https://chatenhancer.com/
```

Expected result: no locale redirect.

Explicit locale selection:

```sh
curl -I "https://chatenhancer.com/?lang=ja"
```

Expected result: `302` to `/ja/` and a `ce_lang=ja` cookie.

Also verify normal paths still pass through:

```sh
curl -I https://chatenhancer.com/styles.css
curl -I https://chatenhancer.com/support
```

Those should not be language redirected by this Worker.

## Updating locales

When adding a docs locale:

1. Add the docs strings in `docs/i18n/<locale>.json`.
2. Add the locale to `SUPPORTED_LOCALES` in `language-redirect-worker.js`.
3. Run `npm run docs:build`.
4. Deploy the Worker.

The generated localized page must exist before the Worker should redirect to it.

## Scope decisions

This Worker is a small edge routing layer for the landing page. It is not a
backend for the browser extension.

Functionality that fits this Worker:

- simple path redirects such as `/support`
- canonical host redirects between `www` and apex
- small SEO/header adjustments for the landing page
