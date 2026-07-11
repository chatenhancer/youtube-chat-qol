/**
 * Minimal YouTube live chat fixture.
 *
 * The markup intentionally mirrors only the selectors and renderer shapes the
 * extension consumes, giving the browser smoke test a stable local page while
 * still exercising the real content script.
 */
export const fixtureLoggedInLiveChatUrl = 'https://www.youtube.com/live_chat?continuation=ytcq-fixture&ytcq-auth=logged-in';
export const fixtureLoggedOutLiveChatUrl = 'https://www.youtube.com/live_chat?continuation=ytcq-fixture&ytcq-auth=logged-out';
export const fixtureLoggedInReplayChatUrl = 'https://www.youtube.com/live_chat_replay?continuation=ytcq-fixture-replay&ytcq-auth=logged-in';

interface LiveChatFixtureOptions {
  loggedIn?: boolean;
  replay?: boolean;
}

export function createLiveChatFixtureHtml({
  loggedIn = true,
  replay = false
}: LiveChatFixtureOptions = {}): string {
  return `<!doctype html>
<html lang="en" data-ytcq-fixture-timestamps="false">
  <head>
    <meta charset="utf-8">
    <title>Mock YouTube Live Chat</title>
    <link rel="icon" href="/favicon.ico">
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
        padding: 8px 0;
      }

      yt-live-chat-text-message-renderer {
        align-items: flex-start;
        box-sizing: border-box;
        display: flex;
        min-height: 32px;
        padding: 4px 24px;
      }

      #author-photo {
        border-radius: 50%;
        cursor: pointer;
        display: block;
        flex: 0 0 24px;
        height: 24px;
        margin-right: 16px;
        overflow: hidden;
        width: 24px;
      }

      #author-photo img {
        display: block;
        height: 24px;
        width: 24px;
      }

      yt-live-chat-text-message-renderer > #content {
        flex: 1 1 auto;
        min-width: 0;
        font-size: 13px;
        line-height: 16px;
      }

      html[data-ytcq-fixture-timestamps="false"] yt-live-chat-text-message-renderer #timestamp {
        display: none;
      }

      #author-name {
        color: #aaa;
        font-weight: 600;
        margin-right: 6px;
      }

      #menu {
        margin-left: auto;
      }

      #menu button {
        background: transparent;
        border: 0;
        color: inherit;
        cursor: pointer;
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

      yt-emoji-picker-renderer {
        background: #212121;
        border-top: 1px solid #333;
        display: block;
        padding: 8px 12px;
      }

      yt-emoji-picker-renderer #categories {
        display: block;
      }

      yt-emoji-picker-renderer [role="option"] {
        background: transparent;
        border: 0;
        border-radius: 50%;
        color: #fff;
        cursor: pointer;
        font-size: 20px;
        height: 36px;
        width: 36px;
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

      yt-live-chat-toggle-renderer {
        display: block;
      }

      yt-live-chat-toggle-renderer tp-yt-paper-item {
        align-items: center;
        box-sizing: border-box;
        cursor: pointer;
        display: flex;
        gap: 12px;
        min-height: 40px;
        padding: 0 12px;
      }

      yt-live-chat-toggle-renderer .native-setting-label {
        flex: 1 1 auto;
      }

      yt-live-chat-toggle-renderer tp-yt-paper-toggle-button {
        display: inline-flex;
        flex: 0 0 auto;
        height: 20px;
        width: 36px;
      }

      yt-live-chat-toggle-renderer .toggle-container {
        align-items: center;
        display: flex;
        height: 20px;
        position: relative;
        width: 36px;
      }

      yt-live-chat-toggle-renderer .toggle-bar {
        background: #717171;
        border-radius: 7px;
        height: 14px;
        width: 32px;
      }

      yt-live-chat-toggle-renderer .toggle-button {
        background: #fff;
        border-radius: 50%;
        height: 20px;
        left: 0;
        position: absolute;
        transition: left 80ms linear;
        width: 20px;
      }

      yt-live-chat-toggle-renderer tp-yt-paper-toggle-button[checked] .toggle-bar {
        background: #3ea6ff;
      }

      yt-live-chat-toggle-renderer tp-yt-paper-toggle-button[checked] .toggle-button {
        left: 16px;
      }
    </style>
  </head>
  <body>
    <yt-live-chat-app>
      <yt-live-chat-renderer hide-timestamps>
        <yt-live-chat-header-renderer>
          <strong>Top chat</strong>
          <div id="live-chat-header-context-menu">
            <button type="button" aria-label="More options">More</button>
          </div>
        </yt-live-chat-header-renderer>

        <yt-live-chat-item-list-renderer>
          <div id="item-scroller">
            <div id="items">
              <yt-live-chat-text-message-renderer id="fixture-message-1">
                <yt-img-shadow id="author-photo" height="24" width="24" loaded="">
                  <img id="img" alt="" height="24" width="24" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' rx='16' fill='%233f8cff'/%3E%3Ctext x='16' y='21' text-anchor='middle' fill='white' font-size='16'%3EE%3C/text%3E%3C/svg%3E">
                </yt-img-shadow>
                <div id="content">
                  <span id="timestamp">${replay ? '0:05' : '10:05 PM'}</span>
                  <yt-live-chat-author-chip>
                    <span id="prepend-chat-badges"></span>
                    <span id="author-name" dir="auto">@ExampleCreator<span id="chip-badges"></span></span>
                    <span id="chat-badges"></span>
                  </yt-live-chat-author-chip>
                  <span id="message-container">
                    <span id="message-prefix-icon-container"></span>
                    <span id="message" dir="auto">Hola mundo</span>
                  </span>
                </div>
                <div id="menu">
                  <yt-icon-button id="menu-button">
                    <button id="button" type="button" aria-label="Chat actions">⋮</button>
                  </yt-icon-button>
                </div>
              </yt-live-chat-text-message-renderer>
            </div>
          </div>
        </yt-live-chat-item-list-renderer>

        ${loggedIn && !replay ? `
          <yt-live-chat-message-input-renderer>
            <span id="author-name">@CurrentViewer</span>
            <div id="input" contenteditable="true" aria-label="Chat input"></div>
            <div id="emoji-picker-button">
              <yt-live-chat-icon-toggle-button-renderer id="emoji" class="style-scope yt-live-chat-message-input-renderer">
                <button type="button" aria-label="Add emotes">🙂</button>
              </yt-live-chat-icon-toggle-button-renderer>
            </div>
            <button id="send-button" type="button">Send</button>
          </yt-live-chat-message-input-renderer>
        ` : ''}
      </yt-live-chat-renderer>
    </yt-live-chat-app>

    <script>
      const scroller = document.querySelector('#item-scroller');
      const items = document.querySelector('#items');
      let nextMessageNumber = 1;
      let timestampsEnabled = false;
      const fixtureMessages = [
        { author: '@ExampleCreator', text: 'Hola mundo' },
        { author: '@ChatFan', text: 'Gracias por el stream' },
        { author: '@NightViewer', text: 'This mock chat is still moving' },
        { author: '@StreamHelper', text: 'Bonjour le chat' },
        { author: '@EmojiFan', text: 'Great moment 😄' },
        { author: '@LateViewer', text: 'Llegué tarde pero aquí estoy' }
      ];

      const getMessageId = (number) => \`fixture-message-\${number}\`;

      const createAvatarSrc = (label, index) => {
        const colors = ['3f8cff', 'ff7043', '7e57c2', '26a69a', 'ef5350', '8d6e63'];
        return \`data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' rx='16' fill='%23\${colors[index % colors.length]}'/%3E%3Ctext x='16' y='21' text-anchor='middle' fill='white' font-size='16'%3E\${encodeURIComponent(label)}%3C/text%3E%3C/svg%3E\`;
      };

      const createMessage = (fixtureMessage, number) => {
        const id = getMessageId(number);
        const message = document.createElement('yt-live-chat-text-message-renderer');
        const avatarSrc = createAvatarSrc(fixtureMessage.author.replace(/^@/, '').slice(0, 1).toUpperCase(), number);
        const channelId = fixtureMessage.channel || \`UCFixtureChannel\${number}\`;
        message.id = id;
        message.innerHTML = \`
          <yt-img-shadow id="author-photo" height="24" width="24" loaded="">
            <img id="img" alt="" height="24" width="24" src="\${avatarSrc}">
          </yt-img-shadow>
          <div id="content">
            <span id="timestamp">${replay ? '${Math.min(number * 5, 59)}:00' : '10:0${Math.min(number + 4, 9)} PM'}</span>
            <yt-live-chat-author-chip>
              <span id="prepend-chat-badges"></span>
              <span id="author-name" dir="auto">\${fixtureMessage.author}<span id="chip-badges"></span></span>
              <span id="chat-badges"></span>
            </yt-live-chat-author-chip>
            <span id="message-container">
              <span id="message-prefix-icon-container"></span>
              <span id="message" dir="auto">\${fixtureMessage.text}</span>
            </span>
          </div>
          <div id="menu">
            <yt-icon-button id="menu-button">
              <button id="button" type="button" aria-label="Chat actions">⋮</button>
            </yt-icon-button>
          </div>
        \`;
        message.data = {
          id,
          authorExternalChannelId: channelId,
          authorName: { simpleText: fixtureMessage.author },
          authorPhoto: { thumbnails: [{ url: avatarSrc }] },
          message: { simpleText: fixtureMessage.text },
          timestampUsec: String(1780000000000000 + number)
        };
        return message;
      };

      const initialMessage = document.querySelector('#fixture-message-1');
      if (initialMessage) {
        initialMessage.data = {
          id: 'fixture-message-1',
          authorExternalChannelId: 'UCFixtureChannel1',
          authorName: { simpleText: fixtureMessages[0].author },
          authorPhoto: {
            thumbnails: [{ url: initialMessage.querySelector('#author-photo img')?.src || '' }]
          },
          message: { simpleText: fixtureMessages[0].text },
          timestampUsec: '1780000000000001'
        };
      }

      nextMessageNumber = 2;

      const appendFixtureMessage = () => {
        if (!items || !scroller || nextMessageNumber > fixtureMessages.length) return;

        const wasAtBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
        const fixtureMessage = fixtureMessages[nextMessageNumber - 1];
        items.append(createMessage(fixtureMessage, nextMessageNumber));
        nextMessageNumber += 1;

        if (wasAtBottom) {
          scroller.scrollTop = scroller.scrollHeight;
          scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
        }
      };

      window.ytcqAppendFixtureMessage = (overrides = {}) => {
        if (!items || !scroller) return null;

        const fixtureMessage = {
          author: String(overrides.author || '@BrowserTestViewer'),
          channel: typeof overrides.channel === 'string' ? overrides.channel : '',
          text: String(overrides.text || 'Browser test message')
        };
        const message = createMessage(fixtureMessage, nextMessageNumber);
        items.append(message);
        nextMessageNumber += 1;
        scroller.scrollTop = scroller.scrollHeight;
        scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
        return message.id;
      };

      const removeEmojiPicker = () => {
        document.querySelector('yt-emoji-picker-renderer')?.remove();
      };

      const addEmojiPicker = () => {
        removeEmojiPicker();
        const picker = document.createElement('yt-emoji-picker-renderer');
        picker.innerHTML = \`
          <div id="categories">
            <yt-emoji-picker-category-renderer>
              <button type="button" role="option" aria-label="check mark button">✅</button>
              <button type="button" role="option" aria-label="grinning face">😀</button>
              <button type="button" role="option" aria-label="party popper">🎉</button>
              <button type="button" role="option" aria-label="blue heart">💙</button>
            </yt-emoji-picker-category-renderer>
          </div>
        \`;
        document.querySelector('yt-live-chat-renderer')?.append(picker);
      };

      const removeOpenMenus = () => {
        for (const menu of document.querySelectorAll('ytd-menu-popup-renderer')) {
          menu.remove();
        }
      };

      const updateTimestampToggle = (root = document) => {
        const renderer = root.querySelector(
          'yt-live-chat-toggle-renderer[data-ytcq-native-setting="timestamps"]'
        );
        const toggle = renderer?.querySelector('tp-yt-paper-toggle-button');
        renderer?.setAttribute('aria-selected', String(timestampsEnabled));
        toggle?.setAttribute('aria-pressed', String(timestampsEnabled));
        toggle?.toggleAttribute('checked', timestampsEnabled);
        toggle?.toggleAttribute('active', timestampsEnabled);
      };

      const setTimestampsEnabled = (enabled) => {
        timestampsEnabled = Boolean(enabled);
        document.querySelector('yt-live-chat-renderer')?.toggleAttribute(
          'hide-timestamps',
          !timestampsEnabled
        );
        document.documentElement.setAttribute(
          'data-ytcq-fixture-timestamps',
          String(timestampsEnabled)
        );
        updateTimestampToggle();
      };

      const addSettingsMenu = () => {
        removeOpenMenus();
        const menu = document.createElement('ytd-menu-popup-renderer');
        menu.innerHTML = '<div id="items"><yt-live-chat-toggle-renderer data-ytcq-native-setting="timestamps" tabindex="-1" aria-selected="false"><tp-yt-paper-item role="option" tabindex="0"><yt-icon aria-hidden="true">◷</yt-icon><span class="native-setting-label">Timestamps</span><tp-yt-paper-toggle-button role="button" aria-pressed="false" tabindex="0" toggles aria-label="Timestamps"><div class="toggle-container"><div id="toggleBar" class="toggle-bar"></div><div id="toggleButton" class="toggle-button"></div></div></tp-yt-paper-toggle-button></tp-yt-paper-item></yt-live-chat-toggle-renderer></div>';
        document.body.append(menu);
        updateTimestampToggle(menu);
        menu
          .querySelector('yt-live-chat-toggle-renderer[data-ytcq-native-setting="timestamps"] tp-yt-paper-item')
          ?.addEventListener('click', () => setTimestampsEnabled(!timestampsEnabled));
      };

      const addMessageMenu = () => {
        removeOpenMenus();
        const menu = document.createElement('ytd-menu-popup-renderer');
        menu.innerHTML = '<div id="items"><ytd-menu-service-item-renderer><tp-yt-paper-item>Native item</tp-yt-paper-item></ytd-menu-service-item-renderer></div>';
        document.body.append(menu);
      };

      document.querySelector('#live-chat-header-context-menu button').addEventListener('click', addSettingsMenu);
      document.querySelector('#emoji-picker-button button')?.addEventListener('click', addEmojiPicker);
      document.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target.closest('#menu') : null;
        if (!target?.closest('yt-live-chat-text-message-renderer')) return;
        addMessageMenu();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') removeOpenMenus();
      });
      window.setTimeout(appendFixtureMessage, 300);
      window.setInterval(appendFixtureMessage, 1200);
    </script>
  </body>
</html>`;
}
