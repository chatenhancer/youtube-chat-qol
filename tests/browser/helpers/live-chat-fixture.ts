/**
 * Minimal YouTube live chat fixture.
 *
 * The markup intentionally mirrors only the selectors and renderer shapes the
 * extension consumes, giving the browser smoke test a stable local page while
 * still exercising the real content script.
 */
export const fixtureSignedInLiveChatUrl = 'https://www.youtube.com/live_chat?continuation=ytcq-fixture&ytcq-auth=signed-in';
export const fixtureLoggedOutLiveChatUrl = 'https://www.youtube.com/live_chat?continuation=ytcq-fixture&ytcq-auth=logged-out';

interface LiveChatFixtureOptions {
  signedIn?: boolean;
}

export function createLiveChatFixtureHtml({
  signedIn = true
}: LiveChatFixtureOptions = {}): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Mock YouTube Live Chat</title>
    <style>
      html,
      body {
        background: #0f0f0f;
        color: #f1f1f1;
        font: 14px Roboto, Arial, sans-serif;
        height: 100%;
        margin: 0;
      }

      yt-live-chat-app,
      yt-live-chat-renderer {
        display: flex;
        flex-direction: column;
        height: 100%;
      }

      yt-live-chat-header-renderer {
        align-items: center;
        border-bottom: 1px solid #333;
        display: flex;
        flex: 0 0 auto;
        gap: 8px;
        height: 56px;
        padding: 0 12px;
      }

      #live-chat-header-context-menu {
        margin-left: auto;
      }

      #item-scroller {
        flex: 1 1 auto;
        min-height: 360px;
        overflow: auto;
        padding: 8px 12px;
      }

      yt-live-chat-text-message-renderer {
        align-items: flex-start;
        display: flex;
        gap: 10px;
        min-height: 44px;
        padding: 6px 0;
      }

      #author-photo {
        border: 0;
        border-radius: 50%;
        cursor: pointer;
        height: 32px;
        overflow: hidden;
        padding: 0;
        width: 32px;
      }

      #author-photo img {
        display: block;
        height: 32px;
        width: 32px;
      }

      #author-name {
        color: #aaa;
        font-weight: 600;
        margin-right: 6px;
      }

      #menu {
        margin-left: auto;
      }

      yt-live-chat-message-input-renderer {
        align-items: center;
        border-top: 1px solid #333;
        display: flex;
        gap: 8px;
        min-height: 64px;
        padding: 8px 12px;
      }

      #input {
        background: #272727;
        border-radius: 18px;
        box-sizing: border-box;
        color: #fff;
        min-height: 36px;
        min-width: 260px;
        padding: 9px 12px;
      }

      #emoji-picker-button {
        align-items: center;
        display: flex;
        min-height: 40px;
      }

      ytd-menu-popup-renderer {
        background: #282828;
        border-radius: 8px;
        color: #fff;
        display: block;
        min-width: 240px;
        padding: 8px 0;
        position: fixed;
        right: 16px;
        top: 64px;
        z-index: 1000;
      }
    </style>
  </head>
  <body>
    <yt-live-chat-app>
      <yt-live-chat-renderer>
        <yt-live-chat-header-renderer>
          <strong>Top chat</strong>
          <div id="live-chat-header-context-menu">
            <button type="button" aria-label="More options">More</button>
          </div>
        </yt-live-chat-header-renderer>

        <yt-live-chat-item-list-renderer>
          <div id="item-scroller">
            <div id="items">
              <yt-live-chat-text-message-renderer id="fixture-message-1" data-message-id="fixture-message-1">
                <button id="author-photo" type="button">
                  <img alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' rx='16' fill='%233f8cff'/%3E%3Ctext x='16' y='21' text-anchor='middle' fill='white' font-size='16'%3EE%3C/text%3E%3C/svg%3E">
                </button>
                <div id="content">
                  <span id="timestamp">10:05 PM</span>
                  <span id="author-name">@ExampleCreator</span>
                  <span id="message">Hola mundo</span>
                </div>
                <button id="menu" type="button" aria-label="Message actions">⋮</button>
              </yt-live-chat-text-message-renderer>
            </div>
          </div>
        </yt-live-chat-item-list-renderer>

        ${signedIn ? `
          <yt-live-chat-message-input-renderer>
            <span id="author-name">@CurrentViewer</span>
            <div id="input" contenteditable="true" aria-label="Chat input"></div>
            <div id="emoji-picker-button">
              <button type="button" aria-label="Add emotes">🙂</button>
            </div>
            <button id="send-button" type="button">Send</button>
          </yt-live-chat-message-input-renderer>
        ` : ''}
      </yt-live-chat-renderer>
    </yt-live-chat-app>

    <script>
      const message = document.querySelector('#fixture-message-1');
      message.data = {
        authorExternalChannelId: 'fixture-channel-1',
        authorName: { simpleText: '@ExampleCreator' },
        id: 'fixture-message-1',
        message: { runs: [{ text: 'Hola mundo' }] },
        timestampUsec: '1779396300000000'
      };

      const removeOpenMenus = () => {
        for (const menu of document.querySelectorAll('ytd-menu-popup-renderer')) {
          menu.remove();
        }
      };

      const addSettingsMenu = () => {
        removeOpenMenus();
        const menu = document.createElement('ytd-menu-popup-renderer');
        menu.innerHTML = '<div id="items"><yt-live-chat-toggle-renderer></yt-live-chat-toggle-renderer></div>';
        document.body.append(menu);
      };

      const addMessageMenu = () => {
        removeOpenMenus();
        const menu = document.createElement('ytd-menu-popup-renderer');
        menu.innerHTML = '<div id="items"><ytd-menu-service-item-renderer><tp-yt-paper-item>Native item</tp-yt-paper-item></ytd-menu-service-item-renderer></div>';
        document.body.append(menu);
      };

      document.querySelector('#live-chat-header-context-menu button').addEventListener('click', addSettingsMenu);
      document.querySelector('#fixture-message-1 #menu').addEventListener('click', addMessageMenu);
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') removeOpenMenus();
      });
    </script>
  </body>
</html>`;
}
