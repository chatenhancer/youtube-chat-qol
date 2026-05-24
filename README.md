<p>
  <img src="assets/icons/icon-128.png" alt="Chat Enhancer for YouTube icon" width="96" height="96">
</p>

# Chat Enhancer for YouTube

<p>
  <a href="https://chromewebstore.google.com/detail/pkhaaipeppfpakofgpdpcpkflangpghf"><img alt="Chrome Web Store" src="https://img.shields.io/chrome-web-store/v/pkhaaipeppfpakofgpdpcpkflangpghf?label=Chrome%20Web%20Store"></a>
  <a href="https://addons.mozilla.org/firefox/addon/chat-enhancer-for-youtube/"><img alt="Firefox Add-ons" src="https://img.shields.io/amo/v/chat-enhancer-for-youtube?label=Firefox%20Add-ons"></a>
  <img alt="Package version" src="https://img.shields.io/github/package-json/v/chat-enhancer-yt/youtube-chat-qol?label=package">
  <a href="https://github.com/chat-enhancer-yt/youtube-chat-qol/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/chat-enhancer-yt/youtube-chat-qol/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178c6">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-4285f4">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/chat-enhancer-yt/youtube-chat-qol"></a>
</p>

A lightweight Manifest V3 browser extension that adds native-feeling quality-of-life tools to YouTube livestream chat.

Not affiliated with YouTube or Google.

## Features

### Translation

- Translate live chat messages, with `Off` as the default.
- Choose whether translations replace the original message or appear below it.
- See translated messages in chat and in recent-message cards.

### Mention and quote

- Add `Mention` and `Quote` actions to YouTube's existing message menu.
- Click an author name to mention them, or Alt/Option-click it to quote that message.

### Chat context

- Click an avatar or participant avatar to see that user's recent messages, jump back to visible messages, and open their channel.
- Keep a local inbox for messages that mention your handle or match watched keywords.
- Add watched keywords from the inbox and highlight matches in chat.
- Show a browser-tab alert for unread inbox messages, with an optional subtle sound.

### Chat comfort

- Add a local most-used row to YouTube's emoji picker.
- Complete chat slash commands for mentions, quotes, repeated messages, time helpers, and extension settings.
- Keep chat at the live edge after tab switches so inbox alerts and translations can keep up.
- Toggle translation and inbox sound from YouTube's live chat settings menu, with deeper options in the extension popup.

## Screenshots

![Chat Enhancer for YouTube screenshots](assets/screenshots/readme-showcase.png)

## Development

Install dependencies:

```sh
npm install
```

Build the extension:

```sh
npm run build
```

Load it in Chrome, Edge, Brave, Vivaldi, Arc, or another Chromium browser:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Select this repository folder or `dist/extension-chrome`.

After source changes, run `npm run build` again and reload the unpacked extension.

For Firefox 140+ development, build the Firefox package and load `dist/extension-firefox` from `about:debugging#/runtime/this-firefox`:

```sh
npm run build:firefox
```

## Scripts

- `npm run typecheck` checks TypeScript.
- `npm run lint` runs ESLint.
- `npm run check` runs typecheck and lint.
- `npm run generate` refreshes generated repo assets: icons, screenshots, localized docs, and the sitemap.
- `npm run build` runs `generate`, then writes Chrome, Edge, and Firefox unpacked extension folders.
- `npm run build:chrome`, `npm run build:edge`, and `npm run build:firefox` run `generate`, then write one browser's unpacked extension folder.
- `npm run verify` runs `check` and the full repo build.
- `npm run zip` verifies the repo, then writes the default Chrome Web Store archive and tracked source archive to `dist/release/`.
- `npm run zip:all` verifies the repo, then writes Chrome, Edge, Firefox, and tracked source release archives.

## Release

1. Update `version` in `package.json`.
2. Run `npm run verify`.
3. Commit the version bump and create a tag such as `v0.7.6`.
4. Push the commit and tag.

The release workflow builds Chrome, Edge, Firefox, and source archives, then attaches them to a GitHub Release.
Store submission only runs for exact `vX.Y.Z` tags that match the `package.json` version.

Store submission is automatic on tags when these repository settings are present:

- Repository variables:
  - `CHROME_WEBSTORE_EXTENSION_ID`
  - `CHROME_WEBSTORE_PUBLISHER_ID`
  - `FIREFOX_AMO_ADDON_ID`
  - optional `FIREFOX_AMO_APPROVAL_NOTES`
  - optional `FIREFOX_AMO_RELEASE_NOTES`
- Repository secrets:
  - `CHROME_WEBSTORE_SERVICE_ACCOUNT_JSON`
  - `FIREFOX_AMO_API_KEY`
  - `FIREFOX_AMO_API_SECRET`

If those settings are missing, the workflow still produces release zips and skips store submission.

## License

MIT. See [LICENSE](LICENSE).

## Project Layout

- `src/content/` wires features into YouTube live chat.
- `src/features/` contains chat actions, translation, emoji, profile, inbox, and sound features.
- `src/youtube/` contains YouTube DOM adapters and selectors.
- `src/shared/` contains shared options, language data, state, and helpers.
- `src/background/` contains the translation service worker.
- `src/popup/` contains the extension action popup.
- `scripts/` contains build, icon, and release packaging scripts.

See [PRIVACY.md](PRIVACY.md) for the current data-use disclosure.
