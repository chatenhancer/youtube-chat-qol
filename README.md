<p align="center">
  <img src="assets/icons/icon-128.png" alt="Chat Enhancer for YouTube icon" width="96" height="96">
</p>

# Chat Enhancer for YouTube

A lightweight Manifest V3 Chrome extension that adds native-feeling quality-of-life tools to YouTube livestream chat.

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

Load it in Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Select this repository folder or `dist/extension`.

After source changes, run `npm run build` again and reload the unpacked extension.

## Scripts

- `npm run typecheck` checks TypeScript.
- `npm run lint` runs ESLint.
- `npm run build` writes the unpacked extension to `dist/extension`.
- `npm run verify` runs typecheck, lint, and build.
- `npm run icons` regenerates PNG icons from `assets/icons/icon.svg`.
- `npm run zip` builds and writes a Chrome Web Store-ready archive to `dist/release/`.

## Release

1. Update `version` in `manifest.json` and `package.json`.
2. Run `npm run verify`.
3. Run `npm run zip`.
4. Upload the generated zip from `dist/release/` to the Chrome Web Store Developer Dashboard.

## License

MIT. See [LICENSE](LICENSE).

## Project Layout

- `src/content/` wires features into YouTube live chat.
- `src/features/` contains chat actions, translation, emoji, profile, and mention-sound features.
- `src/youtube/` contains YouTube DOM adapters and selectors.
- `src/shared/` contains shared options, language data, state, and helpers.
- `src/background/` contains the translation service worker.
- `src/popup/` contains the extension action popup.
- `scripts/` contains build, icon, and release packaging scripts.

See [PRIVACY.md](PRIVACY.md) for the current data-use disclosure.
