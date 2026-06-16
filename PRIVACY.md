# Privacy

Last updated: June 17, 2026

Chat Enhancer for YouTube is a browser extension for YouTube live chat. It is designed to add small chat features without replacing YouTube chat or collecting analytics.

The short version:

- Most extension features run locally in your browser.
- Translation is off by default.
- When translation is enabled, the text being translated is sent to Google Translate.
- Playground games are off by default. If you enable and use Playground, game presence, invites, and game actions are sent to the Chat Enhancer Playground backend under a generated player name.
- The extension does not run analytics, sell data, or collect browsing history.

## Where the extension runs

The extension runs only on YouTube live chat and live chat replay pages matched by the extension manifest.

The extension uses the browser `storage` permission, plus host access for YouTube live chat pages, Google's translation endpoint, and the opt-in Playground backend. It does not request general browsing-history, tab-reading, scripting, or web-navigation permissions.

## Data stored in your browser

The extension stores some data so its features can work between page reloads.

- **Settings are stored with `chrome.storage.sync`:**

  Depending on your browser settings, the browser may sync those extension settings across your own signed-in browser installs.

- **Inbox data is stored with `chrome.storage.local`:**

  This includes watched keywords and up to 100 inbox records per stream or replay. Inbox records may include message text, author name, timestamp, YouTube message/source metadata, match metadata, and emoji/image display data needed to show the saved message.

- **Frequent emoji data is stored with `chrome.storage.local`:**

  This includes local usage counts and emoji display metadata used to build the frequent emoji row.

- **Bookmarked user data is stored with `chrome.storage.local`:**

  This includes the bookmarked user's handle, channel ID when available, and the time the bookmark was created. Bookmarked users are global across streams in the current browser profile and are used to show colored avatar rings.

- **Unsent chat drafts are stored with `chrome.storage.local` per stream:**
  
  They are restored after a page refresh. Drafts are removed when the chat input is cleared, the message is sent, or extension data is reset.

- **Live chat tab status is stored with `chrome.storage.local`:**

  This is limited to browser tab IDs and last-seen timestamps for recently active YouTube live chat tabs, and is used to show whether the extension is currently connected or disconnected. These records expire after 12 hours.

- **Playground identity data is stored with `chrome.storage.local` if Playground is used:**

  This is a generated public/private key pair used to sign Playground connection challenges, so the same browser install can keep the same pseudonymous Playground identity. It is not your YouTube identity.

- **Recent profile messages, command state, and translation results are kept only in memory for the current live chat page. They are cleared when the page unloads.**

## Data sent outside your browser

Chat translation and draft translation are off by default.

When translation or Playground features are enabled, data may be sent to these services:

- **Google Translate at `https://translate.googleapis.com/translate_a/single`**

  Chat translation sends eligible visible and incoming chat message text. Draft translation sends the draft text you choose to translate from the chat box.

  Translation requests include the text to translate and the target language. The extension does not send your YouTube cookies or YouTube credentials with translation requests.

  Google Translate access through `translate.googleapis.com` is unofficial and may be rate-limited, changed, or unavailable.

- **Chat Enhancer Playground at `https://playground.chatenhancer.com`**

  Playground is off by default. If you enable Playground and use the games panel, the extension connects to the Playground backend so opted-in users in the same stream can see availability, exchange invites, and play games.

  Playground messages may include the stream/video key, your generated Playground public key and signature, your generated player name, your available game list, invites and invite responses, and game actions such as chess moves.

  HELP-A-FRIEND! Trivia question generation may send selected YouTube replay transcript excerpts and game identifiers to the Playground backend. The backend uses OpenAI to generate trivia questions from those excerpts.

  Replay Trivia generation may require Cloudflare Turnstile verification on `https://playground.chatenhancer.com`. Cloudflare may receive normal verification data such as IP address, user agent, and the challenge result.

  Playground does not send live chat message text, your YouTube display name, your YouTube avatar URL, YouTube cookies, or YouTube credentials to the Playground backend.

  Like any web service, the Playground backend may receive normal connection metadata such as IP address and user agent from the browser or network provider.

## Data controls

You can clear extension data from the extension popup by using the reset button. This clears local extension data and synced extension settings, then restores the default settings.

You can also remove the extension from your browser. Depending on the browser, removing the extension may also remove its local extension storage.

## What is not collected

The extension does not run analytics.

The extension does not collect browsing history.

The extension does not sell user data.

Except for opt-in Playground games described above, the extension does not send data to an extension-owned server.

The extension does not store recent profile messages or translation results after the live chat page unloads.

Chat Enhancer for YouTube is not affiliated with YouTube or Google.

For privacy questions, use the email link on https://www.chatenhancer.com.
