<p>
  <img src="src/assets/icons/icon-128.png" alt="Chat Enhancer for YouTube icon" width="96" height="96">
</p>

# Chat Enhancer for YouTube

<p>
  <a href="https://www.chatenhancer.com/chrome"><img alt="chrome" src="https://img.shields.io/chrome-web-store/v/pkhaaipeppfpakofgpdpcpkflangpghf?label=chrome&logo=googlechrome&color=4285f4"></a>
  <a href="https://www.chatenhancer.com/firefox"><img alt="firefox" src="https://img.shields.io/amo/v/chat-enhancer-for-youtube?label=firefox&logo=firefoxbrowser&color=ff7139"></a>
  <a href="https://www.chatenhancer.com/safari"><img alt="safari" src="https://img.shields.io/itunes/v/6783276323?label=safari&logo=apple&color=0a84ff"></a>
  <img alt="release" src="https://img.shields.io/github/v/release/chat-enhancer-yt/youtube-chat-qol?label=release&logo=github&color=fd0032">
  <a href="https://github.com/chat-enhancer-yt/youtube-chat-qol/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/chat-enhancer-yt/youtube-chat-qol/ci.yml?label=ci"></a>
  <img alt="coverage" src="https://img.shields.io/endpoint?url=https%3A%2F%2Fwww.chatenhancer.com%2Fbadges%2Funit-line-coverage.json">
  <img alt="manifest v3" src="https://img.shields.io/badge/mv3-6b7280">
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/GPL--3.0%2B-2da44e"></a>
</p>

[Website](https://www.chatenhancer.com) · [Chrome Web Store](https://www.chatenhancer.com/chrome) · [Firefox Add-ons](https://www.chatenhancer.com/firefox) · [Safari (Mac App Store)](https://www.chatenhancer.com/safari)

Designed to feel like part of YouTube, Chat Enhancer for YouTube keeps the native live chat experience while adding a lightweight layer of quality-of-life tools for busy streams.

Main features include two-way translation, an inbox for @mentions and keyword matches, and chat profiles that help you quickly see someone’s recent messages or open their YouTube channel.

You also get a row of your most-used emojis, chat commands, user bookmarks, quick mentions and quotes, focus mode, draft recovery, and more.

NEW! Introducing Playground: play minigames with other extension users right in YouTube live chat.

Chat Enhancer for YouTube is free, open-source, requires no account, and does not run analytics.

Not affiliated with YouTube or Google.

## Privacy

- Most extension features run locally in your browser.

- Translation is off by default.

- When translation is enabled, the text being translated is sent to Google Translate.

- Playground games are off by default. If you enable and use Playground, game presence, invites, and game actions are sent to the Chat Enhancer Playground game server under a generated player name.

- The extension does not run analytics, sell data, or collect browsing history.

## Preview

![Chat Enhancer for YouTube promo previews](assets/readme/promo-grid.png)

## Development

Install dependencies and build the unpacked extensions:

```sh
npm install
npm run build
```

Load it in Chrome, Edge, Brave, Vivaldi, Arc, or another Chromium browser:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Select `dist/extension-chrome`.

After source changes, run `npm run build` again and reload the unpacked extension.

For Firefox 140+ development, build the Firefox package and load `dist/extension-firefox` from `about:debugging#/runtime/this-firefox`:

```sh
npm run build:firefox
```

Useful commands:

- `npm run check` runs typecheck and lint.
- `npm run test` runs the Vitest unit tests.
- `npm run verify` runs the CI-style gate.
- `npm run docs:build` rebuilds the GitHub Pages output when docs change.
- `npm run zip` verifies the project and writes release archives.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).

Third-party icon and font notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

See [PRIVACY.md](PRIVACY.md) for the current data-use disclosure.

The `Chat Enhancer for YouTube` name, logo, and store listing assets are not licensed for use in a way that suggests an official release or endorsement.
