<p align="center">
  <img src="assets/icons/icon-128.png" alt="Chat Enhancer for YouTube icon" width="96" height="96">
</p>

# Chat Enhancer for YouTube

A lightweight Manifest V3 browser extension that adds native-feeling quality-of-life tools to YouTube livestream chat.

Not affiliated with YouTube or Google.

## Features

### Translation

- Translate live chat messages, with `Off` as the default.
- Choose whether translations replace the original message or appear below it.

### Replying

- Add `Mention` and `Quote` actions to YouTube's existing message menu.
- Shift-click a chat message to mention its author.

### Social Context

- Click an avatar to see that user's recent messages and open their channel.
- Keep a local mentions inbox for messages that mention your handle.
- Optionally play a subtle sound when chat mentions your handle.

### Chat Comfort

- Add a local most-used row to YouTube's emoji picker.
- Configure extension options from YouTube's live chat settings menu or the extension popup.

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
4. Select this repository folder or `dist/extension`.

After source changes, run `npm run build` again and reload the unpacked extension.

For Firefox development, build the Firefox package and load `dist/extension-firefox` from `about:debugging#/runtime/this-firefox`:

```sh
npm run build:firefox
```

## Scripts

- `npm run typecheck` checks TypeScript.
- `npm run lint` runs ESLint.
- `npm run build` writes the Chromium unpacked extension to `dist/extension`.
- `npm run build:all` writes Chrome, Edge, and Firefox unpacked extension folders.
- `npm run verify` runs typecheck, lint, and all browser builds.
- `npm run icons` regenerates PNG icons from `assets/icons/icon.svg`.
- `npm run zip` builds and writes the default Chrome Web Store archive to `dist/release/`.
- `npm run zip:all` builds Chrome, Edge, and Firefox release archives.

## Release

1. Update `version` in `manifest.json` and `package.json`.
2. Run `npm run verify`.
3. Run `npm run zip:all`.
4. Upload the generated browser-specific zip from `dist/release/` to the relevant store.

## License

MIT. See [LICENSE](LICENSE).

## Project Layout

- `src/content/` wires features into YouTube live chat.
- `src/features/` contains chat actions, translation, emoji, profile, mentions inbox, and mention-sound features.
- `src/youtube/` contains YouTube DOM adapters and selectors.
- `src/shared/` contains shared options, language data, state, and helpers.
- `src/background/` contains the translation service worker.
- `src/popup/` contains the extension action popup.
- `scripts/` contains build, icon, and release packaging scripts.

See [PRIVACY.md](PRIVACY.md) for the current data-use disclosure.
