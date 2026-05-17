# Privacy

Chat Enhancer for YouTube runs only on YouTube live chat and live chat replay pages matched by the extension manifest.

## Data Stored Locally

- Extension settings are stored with `chrome.storage.sync`.
- The most-used emoji row stores local emoji usage counts with `chrome.storage.local`.
- The mentions inbox stores recent messages that mention your handle with `chrome.storage.local`.
- Translation results are cached only in memory in the live chat page and are cleared when the page is unloaded.

## Data Sent To Third Parties

When translation is set to `Off`, chat message text is not sent to a translation provider.

When a target language is selected, eligible visible and incoming chat message text is sent to Google's public `https://translate.googleapis.com/translate_a/single` endpoint from the extension background service worker. The extension sends the message text and target language so Google can return a translated string.

The extension does not send your YouTube cookies or credentials with translation requests.

## Data Not Collected

The extension does not run analytics, does not collect browsing history, and does not send data to an extension-owned server.

## Notes

Google Translate access through `translate.googleapis.com` is unofficial and may be rate-limited or changed by Google.
