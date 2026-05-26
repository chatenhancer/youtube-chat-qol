<p>
  <img src="assets/icons/icon-128.png" alt="Chat Enhancer for YouTube icon" width="96" height="96">
</p>

# Chat Enhancer for YouTube

<p>
  <a href="https://chromewebstore.google.com/detail/pkhaaipeppfpakofgpdpcpkflangpghf"><img alt="chrome web store" src="https://img.shields.io/chrome-web-store/v/pkhaaipeppfpakofgpdpcpkflangpghf?label=chrome%20web%20store"></a>
  <a href="https://addons.mozilla.org/firefox/addon/chat-enhancer-for-youtube/"><img alt="firefox add-ons" src="https://img.shields.io/amo/v/chat-enhancer-for-youtube?label=firefox%20add-ons"></a>
  <img alt="package version" src="https://img.shields.io/github/package-json/v/chat-enhancer-yt/youtube-chat-qol?label=package">
  <a href="https://github.com/chat-enhancer-yt/youtube-chat-qol/actions/workflows/ci.yml"><img alt="ci" src="https://img.shields.io/github/actions/workflow/status/chat-enhancer-yt/youtube-chat-qol/ci.yml?label=ci"></a>
  <img alt="typescript" src="https://img.shields.io/badge/typescript-5.x-3178c6">
  <img alt="manifest v3" src="https://img.shields.io/badge/manifest-v3-4285f4">
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-mit-97ca00"></a>
</p>

A lightweight Manifest V3 browser extension that adds native-feeling quality-of-life tools to YouTube livestream chat.

Not affiliated with YouTube or Google.

## Features

### Translation

- Translate live chat messages, with translation off by default
- Choose whether translations replace the original message or appear below it

### Reply and context

- Mention or quote messages from YouTube's existing message menu
- Click an author name to mention them
- Alt/Option-click an author name to quote their message
- Click an avatar to see that user's recent messages and open their channel

### Inbox

- Keep a local inbox for messages that mention your handle
- Add watched keywords or phrases and save matching messages in the inbox
- Highlight mentions and watched keywords in chat
- Optionally play a subtle sound for new inbox messages

### Emoji and commands

- Reuse your most-used emojis from a local row in the emoji picker
- Use Tab-expanded chat commands for mentions, quotes, repeated messages, time helpers, and settings

### Privacy

- The extension does not replace YouTube chat
- The extension does not run analytics
- The extension does not send data to an extension-owned server
- When translation is enabled, message text is sent to Google Translate so it can be translated

## Screenshots

![Chat Enhancer for YouTube screenshots](docs/assets/screenshots/readme-showcase.png)

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
- `npm run docs:build` regenerates localized docs and the sitemap when docs change.
- `npm run docs:screenshots` regenerates README/site showcase images and localized store screenshots when needed.
- `npm run build` runs `check`, then writes Chrome, Edge, and Firefox unpacked extension folders.
- `npm run build:chrome`, `npm run build:edge`, and `npm run build:firefox` run `check`, then write one browser's unpacked extension folder.
- `npm run zip` runs `build`, then writes Chrome, Edge, Firefox, and tracked source release archives to `dist/release/`.

## Release

1. Update `version` in `package.json`.
2. Run `npm run build`.
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

## Project layout

- `src/content/` wires features into YouTube live chat.
- `src/features/` contains chat actions, translation, emoji, profile, inbox, and sound features.
- `src/youtube/` contains YouTube DOM adapters and selectors.
- `src/shared/` contains shared options, language data, state, and helpers.
- `src/background/` contains the translation service worker.
- `src/popup/` contains the extension action popup.
- `scripts/` contains build, icon, and release packaging scripts.

See [PRIVACY.md](PRIVACY.md) for the current data-use disclosure.
