# Privacy

Last updated: June 21, 2026

Chat Enhancer for YouTube is a browser extension for YouTube live chat. It is designed to add small chat features without replacing YouTube chat or collecting analytics.

The short version:

- Most extension features run locally in your browser.
- Translation is off by default.
- When translation is enabled, the text being translated is sent to Google Translate.
- Playground games are off by default. If you enable and use Playground, game presence, invites, and game actions are sent to the Chat Enhancer Playground game server under a generated player name.
- The extension does not run analytics, sell data, or collect browsing history.

## Where the extension runs

The extension runs only on YouTube live chat and live chat replay pages that the extension is allowed to access.

The extension uses permission to save its own settings and data in your browser. It also uses access to the specific websites needed for its features to work: YouTube live chat pages, Google Translate's translation service, and the opt-in Chat Enhancer Playground game server.

The extension does not request general browsing-history, tab-reading, scripting, or web-navigation permissions.

## Data stored in your browser

The extension stores some data so its features can work between page reloads.

Data listed in this section is stored by the extension in your own browser profile. It is not sent to Chat Enhancer unless it is also listed in the "Data sent outside your browser" section below.

- **Settings:** saved using the browser's synced extension storage (`chrome.storage.sync`). Depending on your browser settings, your browser may sync these extension settings across your own signed-in browser installs.

- **Inbox data:** saved using local extension storage (`chrome.storage.local`). This includes watched keywords and up to 100 inbox records per stream or replay. Inbox records may include message text, author name, timestamp, basic YouTube message details needed to show where the saved message came from, match details, and emoji or image information needed to display the saved message correctly.

- **Frequent emoji data:** saved using local extension storage (`chrome.storage.local`). This includes local usage counts and emoji display information used to build the frequent emoji row.

- **Bookmarked user data:** saved using local extension storage (`chrome.storage.local`). This includes the bookmarked user's handle, channel ID when available, and the time the bookmark was created. Bookmarked users are global across streams in the current browser profile and are used to show colored avatar rings.

- **Unsent chat drafts:** saved using local extension storage (`chrome.storage.local`) per stream. They are restored after a page refresh. Drafts are removed when the chat input is cleared, the message is sent, or extension data is reset.

- **Playground identity data:** saved using local extension storage (`chrome.storage.local`) if Playground is used. This is a randomly generated local Playground identity used to recognize the same browser install when it reconnects to Playground. It is not your YouTube identity.

- **Recent profile messages, command state, and translation results:** kept only in memory for the current live chat page. They are cleared when you leave or refresh the chat page.

## Data sent outside your browser

Chat translation, draft translation, and Playground games are off by default.

When translation or Playground features are enabled and used, data may be sent to these services:

- **Google Translate at `https://translate.googleapis.com/translate_a/single`**

  Chat translation sends chat message text that is visible in the live chat and eligible for translation while translation is enabled. Draft translation sends the draft text you choose to translate from the chat box.

  Translation requests include the text to translate and the target language. The extension does not send your YouTube cookies or YouTube credentials with translation requests.

  Google Translate access through `translate.googleapis.com` is unofficial and may be rate-limited, changed, or unavailable.

- **Chat Enhancer Playground at `https://playground.chatenhancer.com`**

  Playground is off by default. If you enable Playground and use the games panel, the extension connects to the Chat Enhancer Playground game server so opted-in users in the same stream can see availability, exchange invites, and play games.

  Playground messages may include the YouTube stream or video identifier, your generated Playground player identity, your generated player name, your available game list, invites and invite responses, and game actions such as chess moves.

  Playground does not send live chat message text, your YouTube display name, your YouTube avatar URL, YouTube cookies, or YouTube credentials to the Playground game server.

  Separately, HELP-A-FRIEND! Trivia question generation may send selected public YouTube video transcript excerpts and game identifiers to the Playground game server. These excerpts come from the video's transcript, not from live chat. The server uses OpenAI to generate trivia questions from those excerpts.

  Replay Trivia generation may require Cloudflare Turnstile verification on `https://playground.chatenhancer.com`. Cloudflare may receive normal verification data such as IP address, browser and device information, and the challenge result.

  Like any web service, the Playground game server may receive normal connection information such as IP address and browser/device information from the browser or network provider.

## Data controls

You can clear extension data from the extension popup by using the reset button. This clears local extension data and synced extension settings, then restores the default settings.

You can also remove the extension from your browser. Depending on the browser, removing the extension may also remove its local extension storage.

## What Chat Enhancer does not do

The extension does not run analytics.

The extension does not collect browsing history.

The extension does not sell user data.

Except for the opt-in Playground features described above, the extension does not send data to a Chat Enhancer server.

The extension does not store recent profile messages or translation results after you leave or refresh the live chat page.

Chat Enhancer for YouTube is not affiliated with YouTube or Google.

For privacy questions, use the email link on https://www.chatenhancer.com.