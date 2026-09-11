# Privacy

Last updated: September 11, 2026

Chat Enhancer for YouTube is a browser extension for YouTube live chat. It is designed to add small chat features without replacing YouTube chat or collecting analytics.

The short version:

- Most extension features run locally in your browser.
- Translation is off by default.
- When translation is enabled, the text being translated is sent to Google Translate.
- Playground games are off by default. If you enable and use Playground, game presence, invites, and game actions are sent to the Chat Enhancer Playground game server under a generated player name.
- The extension does not run analytics, sell data, or collect browsing history.

## Where the extension runs

The extension runs on YouTube live chat and live chat replay pages. It also runs on YouTube pages to support video + chat picture-in-picture.

The extension uses permission to save its own settings and data in your browser. It also uses access to the specific websites needed for its features to work: YouTube live chat pages, Google Translate's translation service, and the opt-in Chat Enhancer Playground game server.

In Chrome and Edge, the `scripting` permission reconnects video + chat picture-in-picture after an extension reload or update without refreshing the YouTube tab. The extension does not request general browsing-history, tab-reading, or web-navigation permissions.

This permission also lets the extension attach to YouTube chats that are already open when you install or enable it.

## Data stored in your browser

The extension stores some data so its features can work between page reloads.

Unless stated below, data in this section stays in your browser profile and is not sent to Chat Enhancer. Your browser may sync extension settings across your own signed-in browser installs.

- **Settings:** your feature choices and preferences.

- **Inbox data:** watched keywords and up to 100 inbox records per stream or replay. Inbox records may include message text, author name, timestamp, basic YouTube message details needed to show where the saved message came from, match details, and emoji or image information needed to display the saved message correctly.

- **Frequent emoji data:** local usage counts and emoji display information used to build the frequent emoji row.

- **Bookmark data:** saved message text and emoji display information, author name, avatar URL and channel ID when available, message and save times, and stream title and URL. Bookmarks remain available across streams in the current browser profile.

- **Avatar ring data:** the author name, the time the ring was added, the stream URL, and, when available, the avatar URL, channel ID, and stream title for users you explicitly add an avatar ring to from their recent-message profile. The selection remains available across streams in the current browser profile and is used only to decorate matching avatars.

- **Unsent chat drafts:** saved separately for each stream and restored after a page refresh. Drafts are removed when the chat input is cleared, the message is sent, or extension data is reset.

- **Playground identity data:** a randomly generated local identity created if Playground is used. It recognizes the same browser install when it reconnects to Playground. It is not your YouTube identity.

- **Temporary page data:** recent profile messages, command state, and translation results are kept only in memory for the current live chat page. They are cleared when you leave or refresh the chat page.

## Data sent outside your browser

Data is sent to these services only when the related feature is enabled and used:

### Google Translate (`translate-pa.googleapis.com`)

Chat translation sends chat message text that is visible in the live chat and eligible for translation while translation is enabled. Draft translation sends the draft text you choose to translate from the chat box.

Translation requests include the text to translate and the target language. The extension does not send your YouTube cookies or YouTube credentials with translation requests.

Google Translate access through `translate-pa.googleapis.com` is unofficial and may be rate-limited, changed, or unavailable.

### <span id="playground"></span>Chat Enhancer Playground ([playground.chatenhancer.com](https://playground.chatenhancer.com))

If you enable Playground and use the games panel, the extension connects to the Chat Enhancer Playground game server so opted-in users in the same stream can see availability, exchange invites, and play games.

Playground messages may include the YouTube stream or video identifier, your generated Playground player identity, your generated player name, your available game list, invites and invite responses, and game actions such as chess moves.

Playground stores compact match results linked to generated Playground player identities so it can provide player statistics. Stored results may include the game version, start and finish times, the outcome and finish reason, participant roles, and small game-specific statistics such as moves or scores. They do not include trivia question content or complete game state.

The extension does not send live chat message text, your YouTube display name, your YouTube avatar URL, YouTube cookies, or YouTube credentials to the Playground game server.

Separately, HELP-A-FRIEND! Trivia question generation may send selected public YouTube video transcript excerpts and game identifiers to the Playground game server. These excerpts come from the video's transcript, not from live chat. The server uses OpenAI to generate trivia questions from those excerpts.

Replay Trivia generation may require Cloudflare Turnstile verification on [playground.chatenhancer.com](https://playground.chatenhancer.com). Cloudflare may receive normal verification data such as IP address, browser and device information, and the challenge result.

Like any web service, the Playground game server may receive normal connection information such as IP address and browser/device information from the browser or network provider.

## Data controls

You can clear extension data from the extension popup by using the reset button. This clears local extension data and synced extension settings, then restores the default settings.

You can also remove the extension from your browser. Depending on the browser, removing the extension may also remove its local extension storage.

Resetting or removing the extension does not by itself delete match results already stored by Playground.

## What the extension does not do

- Run analytics.
- Collect browsing history.
- Sell user data.
- Send data to a Chat Enhancer server unless you use the opt-in Playground features described above.

## Questions

For privacy questions, [contact support](https://www.chatenhancer.com/support).

Chat Enhancer for YouTube is not affiliated with YouTube or Google.
