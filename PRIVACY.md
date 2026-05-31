# Privacy

Last updated: May 31, 2026

Chat Enhancer for YouTube is a browser extension for YouTube live chat. It is designed to add small chat features without replacing YouTube chat or collecting analytics.

The short version:

- Most extension features run locally in your browser.
- Translation is off by default.
- When translation is enabled, the text being translated is sent to Google Translate.
- The extension does not run analytics, sell data, collect browsing history, or send data to an extension-owned server.

## Where the extension runs

The extension runs only on YouTube live chat and live chat replay pages matched by the extension manifest.

The extension uses the browser `storage` permission, plus host access for YouTube live chat pages and Google's translation endpoint. It does not request general browsing-history, tab-reading, scripting, or web-navigation permissions.

## Data stored in your browser

The extension stores some data so its features can work between page reloads.

Settings are stored with `chrome.storage.sync`. Depending on your browser settings, the browser may sync those extension settings across your own signed-in browser installs.

Inbox data is stored with `chrome.storage.local`. This includes watched keywords and up to 100 inbox records per stream or replay. Inbox records may include message text, author name, timestamp, YouTube message/source metadata, match metadata, and emoji/image display data needed to show the saved message.

Frequent emoji data is stored with `chrome.storage.local`. This includes local usage counts and emoji display metadata used to build the frequent emoji row.

Live chat tab status is stored with `chrome.storage.local`. This is limited to browser tab IDs and last-seen timestamps for recently active YouTube live chat tabs, and is used to show whether the extension is currently connected or disconnected. These records expire after 12 hours.

Recent profile messages, command state, and translation results are kept only in memory for the current live chat page. They are cleared when the page unloads.

## Data sent outside your browser

Chat translation and draft translation are off by default.

When chat translation is enabled, eligible visible and incoming chat message text is sent to Google Translate at `https://translate.googleapis.com/translate_a/single` so it can be translated.

When draft translation is enabled from the chat box, the draft text you choose to translate is sent to the same Google Translate endpoint.

Translation requests include the text to translate and the target language. The extension does not send your YouTube cookies or YouTube credentials with translation requests.

Google Translate access through `translate.googleapis.com` is unofficial and may be rate-limited, changed, or unavailable.

## Data controls

You can clear extension data from the extension popup by using the reset button. This clears local extension data and synced extension settings, then restores the default settings.

You can also remove the extension from your browser. Depending on the browser, removing the extension may also remove its local extension storage.

## What is not collected

The extension does not run analytics.

The extension does not collect browsing history.

The extension does not sell user data.

The extension does not send data to an extension-owned server.

The extension does not store recent profile messages or translation results after the live chat page unloads.

Chat Enhancer for YouTube is not affiliated with YouTube or Google.

For privacy questions, email chatenhanceryt@gmail.com.
