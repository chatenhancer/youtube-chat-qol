# Privacy

Chat Enhancer for YouTube is designed for YouTube live chat. The extension runs only on YouTube live chat and live chat replay pages matched by the extension manifest.

## What stays on your device

- Extension settings are stored with `chrome.storage.sync`. Depending on your browser settings, your browser may sync those extension settings across your own signed-in browser installs.
- The most-used emoji row stores local emoji usage counts and emoji display metadata with `chrome.storage.local`.
- The inbox stores up to 100 recent per-stream messages that mention your handle or match your local keywords with `chrome.storage.local`. Stored inbox items can include message text, author name, timestamp, YouTube message/source metadata, match metadata, and preserved emoji/image parts needed to display the message.
- Inbox keywords are stored locally with `chrome.storage.local`.
- Recent profile messages are kept only in memory for the current live chat page and are cleared when the page is unloaded.
- Chat command state, such as the last sent message used by `/again` and `/repeat`, is kept only in memory for the current live chat page.
- Translation results are cached only in memory in the live chat page and are cleared when the page is unloaded.

## Translation

Translation features are `Off` by default. When chat translation and draft translation are off, chat message text and typed draft text are not sent to a translation provider.

When a target language is selected for chat translation, eligible visible and incoming chat message text is sent to Google's public `https://translate.googleapis.com/translate_a/single` endpoint from the extension background service worker. When draft translation is enabled from the chat box, the draft text you choose to translate is sent to the same endpoint. The extension sends the text and target language so Google can return a translated string.

The extension does not send your YouTube cookies or credentials with translation requests.

For Firefox's built-in data-collection disclosure, this translation behavior is declared as `personalCommunications` because Mozilla's taxonomy includes chat messages in that category.

Google Translate access through `translate.googleapis.com` is unofficial and may be rate-limited or changed by Google.

## What is not collected

The extension does not run analytics, does not collect browsing history, does not sell user data, and does not send data to an extension-owned server.

Chat Enhancer for YouTube is not affiliated with YouTube or Google.
