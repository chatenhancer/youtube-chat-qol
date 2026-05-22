# Privacy

Chat Enhancer for YouTube is designed for YouTube live chat. The extension runs only on YouTube live chat and live chat replay pages matched by the extension manifest.

## What Stays On Your Device

- Extension settings are stored with `chrome.storage.sync`. Depending on your browser settings, your browser may sync those extension settings across your own signed-in browser installs.
- The most-used emoji row stores local emoji usage counts with `chrome.storage.local`.
- The inbox stores recent per-stream messages that mention your handle or match your local keywords with `chrome.storage.local`.
- Inbox keywords are stored locally with `chrome.storage.local`.
- Recent profile messages are kept only in memory for the current live chat page and are cleared when the page is unloaded.
- Translation results are cached only in memory in the live chat page and are cleared when the page is unloaded.

## Translation

When translation is set to `Off`, chat message text is not sent to a translation provider.

When a target language is selected, eligible visible and incoming chat message text is sent to Google's public `https://translate.googleapis.com/translate_a/single` endpoint from the extension background service worker. The extension sends the message text and target language so Google can return a translated string.

The extension does not send your YouTube cookies or credentials with translation requests.

For Firefox's built-in data-collection disclosure, this translation behavior is declared as `personalCommunications` because Mozilla's taxonomy includes chat messages in that category.

Google Translate access through `translate.googleapis.com` is unofficial and may be rate-limited or changed by Google.

## What Is Not Collected

The extension does not run analytics, does not collect browsing history, does not sell user data, and does not send data to an extension-owned server.

Chat Enhancer for YouTube is not affiliated with YouTube or Google.
