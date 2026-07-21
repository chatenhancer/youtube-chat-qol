<p>
  <img src="src/assets/icons/icon-128.png" alt="Chat Enhancer for YouTube icon" width="96" height="96">
</p>

# Chat Enhancer for YouTube

<p>
  <a href="https://www.chatenhancer.com/chrome"><img alt="chrome" src="https://img.shields.io/chrome-web-store/v/pkhaaipeppfpakofgpdpcpkflangpghf?label=chrome&logo=googlechrome&color=4285f4"></a>
  <a href="https://www.chatenhancer.com/firefox"><img alt="firefox" src="https://img.shields.io/amo/v/chat-enhancer-for-youtube?label=firefox&logo=firefoxbrowser&color=ff7139"></a>
  <a href="https://www.chatenhancer.com/safari"><img alt="safari" src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fitunes.apple.com%2Flookup%3Fid%3D6783276323%26country%3Dus&query=%24.results%5B0%5D.version&label=safari&logo=apple&color=6e6e73&cacheSeconds=300"></a>
  <a href="https://github.com/chat-enhancer-yt/youtube-chat-qol/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/chat-enhancer-yt/youtube-chat-qol/ci.yml?label=ci"></a>
</p>

[Website](https://www.chatenhancer.com) · [Privacy policy](https://www.chatenhancer.com/privacy)

Suite of enhancements that make YouTube live chat easier to follow and participate in.

The extension is free, open-source, requires no account, and does not run analytics.

Not affiliated with YouTube or Google.

## Preview

![Chat Enhancer for YouTube promo previews](assets/readme/promo-grid.png)

## Development

Install dependencies and build the unpacked extensions:

```sh
npm install
npm run build
```

Load it in a Chromium browser:

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

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).

Third-party icon and font notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The `Chat Enhancer for YouTube` name, logo, and store listing assets are not licensed for use in a way that suggests an official release or endorsement.
