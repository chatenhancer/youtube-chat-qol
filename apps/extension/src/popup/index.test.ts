import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AVATAR_RINGS_STORAGE_KEY } from '../shared/avatar-rings';
import { BOOKMARKS_STORAGE_KEY, LEGACY_BOOKMARKS_STORAGE_KEY } from '../shared/bookmarks';
import {
  PLAYGROUND_PROFILE_MESSAGE_TYPE,
  PLAYGROUND_PROFILE_STATS_MESSAGE_TYPE,
  PLAYGROUND_PROFILE_UPDATE_MESSAGE_TYPE
} from '@chatenhancer/playground-core/identity';

describe('popup', () => {
  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = `
      <a id="landingLink"></a>
      <a id="sourceCodeLink"></a>
      <a id="supportLink"></a>
      <button id="resetExtension"></button>
      <nav class="popup-tabs">
        <button id="settingsTab" data-popup-tab-target="settingsPanel" aria-selected="true"></button>
        <button id="bookmarksTab" data-popup-tab-target="bookmarksPanel" aria-selected="false">
          <span data-i18n="bookmarks"></span>
          <span id="bookmarksCount"></span>
        </button>
        <button id="playgroundTab" data-popup-tab-target="playgroundPanel" aria-selected="false"></button>
      </nav>
      <div class="popup-tab-panels">
      <span class="popup-scrollbar" aria-hidden="true" hidden>
        <span class="popup-scrollbar-thumb"></span>
      </span>
      <div id="settingsPanel" data-popup-tab-panel>
      <select id="targetLanguage"></select>
      <select id="translationDisplay">
        <option value="replace">Replace</option>
        <option value="below">Below</option>
      </select>
      <section id="appearanceSettingsSection" class="settings-section">
        <input id="sound" type="checkbox">
        <div id="appearanceMoreSettingsGroup" hidden>
          <div class="appearance-more-settings-content">
            <label id="startupEffectOption" class="option option-toggle">
              <input id="startupEffect" type="checkbox">
            </label>
          </div>
        </div>
        <div id="appearanceMoreSettingsToggleContainer">
          <button id="appearanceMoreSettingsToggle" type="button" aria-expanded="false" aria-controls="appearanceMoreSettingsGroup">
            <span data-i18n="showMore">Show more</span>
          </button>
        </div>
      </section>
      <input id="liteModeEnabled" type="checkbox">
      </div>
      <div id="bookmarksPanel" data-popup-tab-panel hidden>
        <div class="bookmarks-list-shell" data-popup-scroll-fade-region>
          <span class="popup-scrollbar" aria-hidden="true" hidden>
            <span class="popup-scrollbar-thumb"></span>
          </span>
          <div id="bookmarksList" data-popup-scroll-target></div>
        </div>
      </div>
      <div id="playgroundPanel" data-popup-tab-panel hidden>
        <label id="playgroundOption" class="option option-toggle">
          <span class="option-helper">
            <span id="playgroundHelper">Play games with other extension users.</span>
            <a class="option-helper-link" href="https://playground.chatenhancer.com/" target="_blank" rel="noreferrer">Learn more</a>
          </span>
          <input id="playgroundEnabled" type="checkbox">
        </label>
        <div id="playgroundProfile" hidden>
          <button id="playgroundProfileToggle" type="button" aria-expanded="false" aria-controls="playgroundProfileDetails">
            <span id="playgroundProfileAvatar"></span>
            <span>
              <span data-i18n="playgroundProfile"></span>
              <span id="playgroundProfileName"></span>
            </span>
            <span id="playgroundProfileWins">
              <span id="playgroundProfileWinsCount"></span>
            </span>
          </button>
          <div id="playgroundProfileDetails" hidden>
            <p data-i18n="playgroundProfileHelper"></p>
            <label for="playgroundDisplayName">
              <span data-i18n="playgroundDisplayName"></span>
              <input id="playgroundDisplayName" type="text" maxlength="24" title="How you appear in Playground rooms." data-i18n-title="playgroundDisplayNameTitle">
            </label>
            <p data-i18n="playgroundDisplayNameHelper"></p>
          </div>
        </div>
        <section id="playgroundGamesSection" hidden>
          <input id="playgroundGamesAvailable" type="checkbox">
        </section>
        <section>
          <select id="chatSkin"></select>
          <select id="messageDensity"></select>
        </section>
      </div>
      </div>
      <footer>
        <span id="version"></span>
        <div data-extension-status>
          <span data-extension-status-text></span>
        </div>
      </footer>
    `;
    await chrome.storage.local.clear();
    await chrome.storage.session.clear();
    await chrome.storage.sync.clear();
    vi.mocked(chrome.action.getTitle).mockReset();
    vi.mocked(chrome.action.getTitle).mockImplementation(((
      _details: chrome.action.TabDetails,
      callback?: (title: string) => void
    ) => {
      callback?.('');
      return Promise.resolve('');
    }) as never);
    vi.mocked(chrome.tabs.create).mockClear();
    vi.mocked(chrome.tabs.sendMessage).mockClear();
    vi.mocked(chrome.storage.local.clear).mockClear();
    vi.mocked(chrome.storage.local.get).mockClear();
    vi.mocked(chrome.storage.onChanged.addListener).mockClear();
    vi.mocked(chrome.storage.session.clear).mockClear();
    vi.mocked(chrome.storage.sync.clear).mockClear();
    vi.mocked(chrome.storage.sync.get).mockClear();
    vi.mocked(chrome.storage.sync.set).mockClear();
    vi.mocked(chrome.runtime.sendMessage).mockClear();
    installMatchMedia(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('summarizes active chat status for the current tab', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((
      queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      const tabs = queryInfo.active ? [{ id: 10 } as chrome.tabs.Tab] : [];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.tabs.sendMessage).mockImplementation(((
      _tabId: number,
      _message: unknown,
      callback?: (response: unknown) => void
    ) => {
      callback?.({ attached: true });
      return Promise.resolve();
    }) as never);

    await import('./index');

    expect(
      document.querySelector('[data-extension-status]')?.getAttribute('data-extension-status')
    ).toBe('active');
    expect(document.querySelector('[data-extension-status]')?.getAttribute('title')).toBe(
      'extensionStatusConnected'
    );
    expect(document.querySelector('[data-extension-status]')?.getAttribute('aria-label')).toBe(
      'extensionStatusActiveCurrent. extensionStatusConnected'
    );
    expect(document.querySelector('[data-extension-status-text]')?.textContent).toBe(
      'extensionStatusActiveCurrent'
    );
  });

  it('uses disconnected helper copy when no active content scripts respond', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((
      queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      const tabs = queryInfo.active ? [{ id: 10 } as chrome.tabs.Tab] : [];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.tabs.sendMessage).mockImplementation(((
      _tabId: number,
      _message: unknown,
      callback?: (response: unknown) => void
    ) => {
      callback?.(undefined);
      return Promise.resolve();
    }) as never);

    await import('./index');

    expect(
      document.querySelector('[data-extension-status]')?.getAttribute('data-extension-status')
    ).toBe('inactive');
    expect(document.querySelector('[data-extension-status]')?.getAttribute('title')).toBe(
      'extensionStatusDisconnected'
    );
    expect(document.querySelector('[data-extension-status]')?.getAttribute('aria-label')).toBe(
      'extensionStatusInactiveAll. extensionStatusDisconnected'
    );
    expect(document.querySelector('[data-extension-status-text]')?.textContent).toBe(
      'extensionStatusInactiveAll'
    );
  });

  it('uses the tab action title when Safari does not deliver popup messages to the live chat frame', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((
      queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      const tabs = queryInfo.active ? [{ id: 10 } as chrome.tabs.Tab] : [];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.tabs.sendMessage).mockImplementation(((
      _tabId: number,
      _message: unknown,
      callback?: (response: unknown) => void
    ) => {
      callback?.(undefined);
      return Promise.resolve();
    }) as never);
    vi.mocked(chrome.action.getTitle).mockImplementation(((
      _details: chrome.action.TabDetails,
      callback?: (title: string) => void
    ) => {
      callback?.('extensionActiveTitle');
      return Promise.resolve('extensionActiveTitle');
    }) as never);

    await import('./index');

    expect(chrome.action.getTitle).toHaveBeenCalledWith({ tabId: 10 }, expect.any(Function));
    expect(
      document.querySelector('[data-extension-status]')?.getAttribute('data-extension-status')
    ).toBe('active');
    expect(document.querySelector('[data-extension-status-text]')?.textContent).toBe(
      'extensionStatusActiveCurrent'
    );
  });

  it('uses the global action title when Safari does not return a tab action title', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((
      queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      const tabs = queryInfo.active ? [{ id: 10 } as chrome.tabs.Tab] : [];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.tabs.sendMessage).mockImplementation(((
      _tabId: number,
      _message: unknown,
      callback?: (response: unknown) => void
    ) => {
      callback?.(undefined);
      return Promise.resolve();
    }) as never);
    vi.mocked(chrome.action.getTitle).mockImplementation(((
      details: chrome.action.TabDetails,
      callback?: (title: string) => void
    ) => {
      const title = typeof details.tabId === 'number' ? '' : 'extensionActiveTitle';
      callback?.(title);
      return Promise.resolve(title);
    }) as never);

    await import('./index');

    expect(chrome.action.getTitle).toHaveBeenCalledWith({ tabId: 10 }, expect.any(Function));
    expect(chrome.action.getTitle).toHaveBeenCalledWith({}, expect.any(Function));
    expect(
      document.querySelector('[data-extension-status]')?.getAttribute('data-extension-status')
    ).toBe('active');
    expect(document.querySelector('[data-extension-status-text]')?.textContent).toBe(
      'extensionStatusActiveCurrent'
    );
  });

  it('only checks the current tab for liveness', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((
      queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      const tabs = queryInfo.active ? [{ id: 99 } as chrome.tabs.Tab] : [];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.tabs.sendMessage).mockImplementation(((
      tabId: number,
      _message: unknown,
      callback?: (response: unknown) => void
    ) => {
      callback?.(tabId === 99 ? { attached: true } : undefined);
      return Promise.resolve();
    }) as never);

    await import('./index');

    expect(
      document.querySelector('[data-extension-status]')?.getAttribute('data-extension-status')
    ).toBe('active');
    expect(document.querySelector('[data-extension-status-text]')?.textContent).toBe(
      'extensionStatusActiveCurrent'
    );
  });

  it('renders the compact manifest version in the footer', async () => {
    vi.mocked(chrome.runtime.getManifest).mockReturnValue({
      version: '1.2.3'
    } as chrome.runtime.Manifest);
    vi.mocked(chrome.tabs.query).mockImplementation(((
      queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');

    expect(document.querySelector('#version')?.textContent).toBe('v1.2.3');
  });

  it('reveals the startup animation through the Appearance disclosure', async () => {
    vi.useFakeTimers();
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');

    const toggle = document.querySelector<HTMLButtonElement>('#appearanceMoreSettingsToggle')!;
    const toggleContainer = document.querySelector<HTMLElement>(
      '#appearanceMoreSettingsToggleContainer'
    )!;
    const appearanceMoreSettingsGroup = document.querySelector<HTMLElement>(
      '#appearanceMoreSettingsGroup'
    )!;
    const settingsPanel = document.querySelector<HTMLElement>('#settingsPanel')!;
    const finishTransition = (propertyName = 'transform'): void => {
      const event = new Event('transitionend');
      Object.defineProperty(event, 'propertyName', { value: propertyName });
      appearanceMoreSettingsGroup.dispatchEvent(event);
    };
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggleContainer.hidden).toBe(false);
    expect(appearanceMoreSettingsGroup.hidden).toBe(true);

    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggleContainer.hidden).toBe(false);
    expect(
      toggleContainer.classList.contains('appearance-more-settings-toggle-container-dismissed')
    ).toBe(true);
    expect(appearanceMoreSettingsGroup.hidden).toBe(false);
    expect(appearanceMoreSettingsGroup.classList.contains('settings-group-collapsed')).toBe(true);
    expect(
      appearanceMoreSettingsGroup.classList.contains(
        'appearance-more-settings-group-revealed'
      )
    ).toBe(true);
    expect(settingsPanel.scrollTop).toBe(settingsPanel.scrollHeight);
    await vi.advanceTimersByTimeAsync(0);
    expect(appearanceMoreSettingsGroup.classList.contains('settings-group-collapsed')).toBe(false);
    const animationEnd = new Event('animationend', { bubbles: true });
    Object.defineProperty(animationEnd, 'animationName', {
      value: 'ytcq-popup-option-added'
    });
    appearanceMoreSettingsGroup.querySelector('.option')?.dispatchEvent(animationEnd);
    expect(
      appearanceMoreSettingsGroup.classList.contains(
        'appearance-more-settings-group-revealed'
      )
    ).toBe(false);
    finishTransition('opacity');
    expect(toggleContainer.hidden).toBe(false);
    finishTransition();
    expect(toggleContainer.hidden).toBe(true);
  });

  it('ignores malformed active chat responses', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((
      queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      const tabs = queryInfo.active ? [{ id: 10 } as chrome.tabs.Tab] : [];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.tabs.sendMessage).mockImplementation(((
      _tabId: number,
      _message: unknown,
      callback?: (response: unknown) => void
    ) => {
      callback?.({ attached: 'yes' });
      return Promise.resolve();
    }) as never);

    await import('./index');

    expect(
      document.querySelector('[data-extension-status]')?.getAttribute('data-extension-status')
    ).toBe('inactive');
  });

  it('treats missing active tab responses as disconnected', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((
      queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      const tabs = queryInfo.active ? [{ id: 10 } as chrome.tabs.Tab] : [];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.tabs.sendMessage).mockImplementation(((
      _tabId: number,
      _message: unknown,
      callback?: (response: unknown) => void
    ) => {
      callback?.(undefined);
      return Promise.resolve();
    }) as never);

    await import('./index');

    expect(
      document.querySelector('[data-extension-status]')?.getAttribute('data-extension-status')
    ).toBe('inactive');
    expect(document.querySelector('[data-extension-status]')?.getAttribute('title')).toBe(
      'extensionStatusDisconnected'
    );
  });

  it('treats active chat lookup errors as disconnected', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((
      queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      const tabs = queryInfo.active ? [{ id: 10 } as chrome.tabs.Tab] : [];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.tabs.sendMessage).mockImplementation(((
      _tabId: number,
      _message: unknown,
      callback?: (response: unknown) => void
    ) => {
      Object.defineProperty(chrome.runtime, 'lastError', {
        configurable: true,
        value: { message: 'Could not establish connection.' }
      });
      callback?.({ attached: true });
      Object.defineProperty(chrome.runtime, 'lastError', {
        configurable: true,
        value: undefined
      });
      return Promise.resolve();
    }) as never);

    await import('./index');

    expect(
      document.querySelector('[data-extension-status]')?.getAttribute('data-extension-status')
    ).toBe('inactive');
  });

  it('opens the support page from the popup', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((
      _message: unknown,
      callback?: (response: unknown) => void
    ) => {
      callback?.({ activeTabIds: [] });
      return Promise.resolve({ activeTabIds: [] });
    }) as never);
    await import('./index');
    document.querySelector<HTMLAnchorElement>('#supportLink')?.click();

    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://www.chatenhancer.com/support'
    });
  });

  it('does not reset state when opening support from the popup', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((
      _message: unknown,
      callback?: (response: unknown) => void
    ) => {
      callback?.({ activeTabIds: [] });
      return Promise.resolve({ activeTabIds: [] });
    }) as never);
    await import('./index');
    document.querySelector<HTMLAnchorElement>('#supportLink')?.click();
    document.querySelector<HTMLButtonElement>('#resetExtension')?.click();

    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://www.chatenhancer.com/support'
    });
    expect(chrome.storage.local.clear).not.toHaveBeenCalled();
    expect(chrome.storage.sync.clear).not.toHaveBeenCalled();
  });

  it('opens landing and source links from the popup', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');
    document.querySelector<HTMLAnchorElement>('#landingLink')?.click();
    document.querySelector<HTMLAnchorElement>('#sourceCodeLink')?.click();

    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://chatenhancer.com' });
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://www.chatenhancer.com/source' });
  });

  it('switches to bookmarks and manages saved messages', async () => {
    await chrome.storage.local.set({
      [BOOKMARKS_STORAGE_KEY]: {
        'message:stream-a:message-1': {
          authorName: '@ViewerOne',
          avatarUrl: 'https://yt3.ggpht.com/avatar=s88-c-k',
          channelId: 'viewer-channel',
          message: {
            contentParts: [{ text: 'Saved chat message', type: 'text' }],
            messageId: 'message-1',
            text: 'Saved chat message',
            timestamp: 1_699_999_999_000,
            timestampText: '10:00 PM',
            videoOffsetSeconds: 328
          },
          savedAt: 1_700_000_000_000,
          sourceKey: 'stream-a',
          sourceTitle: 'Example stream',
          sourceUrl: 'https://www.youtube.com/watch?v=stream-a'
        }
      }
    });
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');

    expect(document.querySelector<HTMLElement>('#settingsPanel')?.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>('#bookmarksPanel')?.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('#playgroundPanel')?.hidden).toBe(true);
    expect(document.querySelector('#bookmarksCount')?.textContent).toBe('1');
    expect(document.querySelector('.bookmark-row')).toBeNull();
    document.querySelector<HTMLButtonElement>('#bookmarksTab')?.click();

    expect(
      document.querySelector<HTMLButtonElement>('#bookmarksTab')?.getAttribute('aria-selected')
    ).toBe('true');
    expect(document.querySelector<HTMLElement>('#settingsPanel')?.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('#bookmarksPanel')?.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>('#playgroundPanel')?.hidden).toBe(true);
    expect(document.querySelector('#bookmarksCount')?.closest('#bookmarksTab')).not.toBeNull();
    expect(document.querySelector('#bookmarksCount')?.textContent).toBe('1');
    expect(document.querySelector('.bookmark-name')?.textContent).toBe('@ViewerOne');
    expect(document.querySelector('.bookmark-message')?.textContent).toBe('Saved chat message');
    expect(document.querySelector<HTMLImageElement>('.bookmark-avatar img')?.src).toBe(
      'https://yt3.ggpht.com/avatar=s88-c-k'
    );
    expect(
      document.querySelector<HTMLImageElement>('.bookmark-avatar img')?.getAttribute('loading')
    ).toBe('lazy');
    expect(
      document.querySelector<HTMLImageElement>('.bookmark-avatar img')?.getAttribute('decoding')
    ).toBe('async');
    expect(document.querySelector('.bookmark-avatar-open-icon')).not.toBeNull();
    const bookmarkTime = document.querySelector<HTMLTimeElement>('.bookmark-message-time');
    expect(bookmarkTime?.parentElement?.classList.contains('bookmark-message-header')).toBe(true);
    expect(bookmarkTime?.dateTime).toBe(new Date(1_699_999_999_000).toISOString());
    expect(bookmarkTime?.textContent).toBe(
      new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit'
      }).format(1_699_999_999_000)
    );
    const fullPostedTime = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(1_699_999_999_000);
    expect(bookmarkTime?.title).toBe(`bookmarkMessagePostedDate:${fullPostedTime}`);
    expect(bookmarkTime?.getAttribute('aria-label')).toBe(bookmarkTime?.title);
    expect(document.querySelector('.bookmark-metadata .bookmark-message-time')).toBeNull();
    expect(document.querySelector('.bookmark-source')?.textContent).toBe('Example stream');
    expect(document.querySelector('.bookmark-source-button')?.textContent).toBe('Example stream');
    expect(document.querySelector<HTMLButtonElement>('.bookmark-source-button')?.title).toBe(
      'openStreamInNewWindow:Example stream'
    );
    document.querySelector<HTMLButtonElement>('.bookmark-name-button')?.click();
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://www.youtube.com/channel/viewer-channel'
    });
    document.querySelector<HTMLButtonElement>('.bookmark-avatar-button')?.click();
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://www.youtube.com/channel/viewer-channel'
    });
    document.querySelector<HTMLButtonElement>('.bookmark-source-button')?.click();
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://www.youtube.com/watch?v=stream-a&t=328s#ytcq-message=message-1'
    });

    const actionButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.bookmark-action-button')
    );
    expect(actionButtons).toHaveLength(1);
    actionButtons[0]?.click();
    await expect(chrome.storage.local.get(BOOKMARKS_STORAGE_KEY)).resolves.toEqual({
      [BOOKMARKS_STORAGE_KEY]: {}
    });
    expect(
      document.querySelector('.bookmark-row')?.classList.contains('bookmark-row-removed')
    ).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('.bookmark-action-button')?.title).toBe(
      'restoreBookmark'
    );

    document.querySelector<HTMLButtonElement>('.bookmark-action-button')?.click();
    await expect(chrome.storage.local.get(BOOKMARKS_STORAGE_KEY)).resolves.toEqual({
      [BOOKMARKS_STORAGE_KEY]: {
        'message:stream-a:message-1': {
          authorName: '@ViewerOne',
          avatarUrl: 'https://yt3.ggpht.com/avatar=s88-c-k',
          channelId: 'viewer-channel',
          message: {
            contentParts: [{ text: 'Saved chat message', type: 'text' }],
            messageId: 'message-1',
            text: 'Saved chat message',
            timestamp: 1_699_999_999_000,
            timestampText: '10:00 PM',
            videoOffsetSeconds: 328
          },
          savedAt: 1_700_000_000_000,
          sourceKey: 'stream-a',
          sourceTitle: 'Example stream',
          sourceUrl: 'https://www.youtube.com/watch?v=stream-a'
        }
      }
    });
    expect(
      document.querySelector('.bookmark-row')?.classList.contains('bookmark-row-removed')
    ).toBe(false);
  });

  it('orders avatar rings with bookmarks and manages ring rows independently', async () => {
    const ringAddedAt = 1_700_000_001_000;
    const ringRecord = {
      addedAt: ringAddedAt,
      authorName: '@RingViewer',
      avatarUrl: 'https://yt3.ggpht.com/ring-avatar=s88-c-k',
      channelId: 'ring-viewer-channel',
      sourceTitle: 'Ring stream',
      sourceUrl: 'https://www.youtube.com/watch?v=ring-stream'
    };
    await chrome.storage.local.set({
      [AVATAR_RINGS_STORAGE_KEY]: {
        'channel:ring-viewer-channel': ringRecord
      },
      [BOOKMARKS_STORAGE_KEY]: {
        'message:bookmark-stream:message-1': {
          authorName: '@RingViewer',
          channelId: 'ring-viewer-channel',
          message: {
            contentParts: [{ text: 'Older saved message', type: 'text' }],
            messageId: 'message-1',
            text: 'Older saved message',
            timestamp: 1_699_999_999_000,
            timestampText: '10:00 PM'
          },
          savedAt: 1_700_000_000_000,
          sourceKey: 'bookmark-stream',
          sourceTitle: 'Bookmark stream',
          sourceUrl: 'https://www.youtube.com/watch?v=bookmark-stream'
        }
      }
    });

    await import('./index');
    document.querySelector<HTMLButtonElement>('#bookmarksTab')?.click();

    const rows = Array.from(document.querySelectorAll<HTMLElement>('.bookmark-row'));
    expect(rows).toHaveLength(2);
    expect(rows[0].classList.contains('avatar-ring-row')).toBe(true);
    expect(rows.map((row) => row.querySelector('.bookmark-name')?.textContent)).toEqual([
      '@RingViewer',
      '@RingViewer'
    ]);
    expect(document.querySelector('#bookmarksCount')?.textContent).toBe('2');

    const ringRow = rows[0];
    expect(ringRow.querySelector('.avatar-ring-label')?.textContent).toBe('rememberedUser');
    expect(ringRow.querySelector('.avatar-ring-avatar img')).not.toBeNull();
    expect(ringRow.style.getPropertyValue('--ytcq-popup-avatar-ring-color')).not.toBe('');
    const bookmarkRow = rows[1];
    for (const row of rows) {
      const handle = row.querySelector<HTMLButtonElement>('.bookmark-name-button');
      expect(handle?.textContent).toBe('@RingViewer');
      handle?.click();
      expect(chrome.tabs.create).toHaveBeenLastCalledWith({
        url: 'https://www.youtube.com/channel/ring-viewer-channel'
      });
    }
    expect(bookmarkRow.querySelector('.avatar-ring-avatar')).not.toBeNull();
    expect(bookmarkRow.style.getPropertyValue('--ytcq-popup-avatar-ring-color')).toBe(
      ringRow.style.getPropertyValue('--ytcq-popup-avatar-ring-color')
    );
    const ringTime = ringRow.querySelector<HTMLTimeElement>('.avatar-ring-added-time');
    expect(ringTime?.dateTime).toBe(new Date(ringAddedAt).toISOString());
    expect(ringTime?.textContent).toBe(
      new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit'
      }).format(ringAddedAt)
    );
    expect(ringTime?.title).toBe(
      `userRememberedDate:${new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(ringAddedAt)}`
    );
    expect(ringRow.querySelector('.bookmark-source')?.textContent).toBe('Ring stream');

    ringRow.querySelector<HTMLButtonElement>('.bookmark-avatar-button')?.click();
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://www.youtube.com/channel/ring-viewer-channel'
    });
    ringRow.querySelector<HTMLButtonElement>('.bookmark-source-button')?.click();
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://www.youtube.com/watch?v=ring-stream'
    });

    const ringAction = ringRow.querySelector<HTMLButtonElement>('.avatar-ring-action-button')!;
    expect(ringAction.title).toBe('forgetUser');
    ringAction.click();
    await expect(chrome.storage.local.get(AVATAR_RINGS_STORAGE_KEY)).resolves.toEqual({
      [AVATAR_RINGS_STORAGE_KEY]: {}
    });
    expect(document.querySelector('#bookmarksCount')?.textContent).toBe('1');
    expect(
      document.querySelector('.avatar-ring-row')?.classList.contains('bookmark-row-removed')
    ).toBe(true);
    expect(document.querySelector('.avatar-ring-row .avatar-ring-avatar')).toBeNull();
    const departingRememberedUserAvatar = document.querySelector(
      '.avatar-ring-row .avatar-ring-avatar-out'
    );
    expect(departingRememberedUserAvatar).not.toBeNull();
    expect(
      document.querySelector('.bookmark-row:not(.avatar-ring-row) .avatar-ring-avatar')
    ).toBeNull();
    const departingBookmarkAvatar = document.querySelector(
      '.bookmark-row:not(.avatar-ring-row) .avatar-ring-avatar-out'
    );
    expect(departingBookmarkAvatar).not.toBeNull();
    departingRememberedUserAvatar?.dispatchEvent(new Event('animationend'));
    departingBookmarkAvatar?.dispatchEvent(new Event('animationend'));
    expect(document.querySelector('.avatar-ring-row .avatar-ring-avatar-out')).toBeNull();
    expect(
      document.querySelector('.bookmark-row:not(.avatar-ring-row) .avatar-ring-avatar-out')
    ).toBeNull();
    expect(document.querySelector<HTMLButtonElement>('.avatar-ring-action-button')?.title).toBe(
      'rememberUser'
    );

    document.querySelector<HTMLButtonElement>('.avatar-ring-action-button')?.click();
    await expect(chrome.storage.local.get(AVATAR_RINGS_STORAGE_KEY)).resolves.toEqual({
      [AVATAR_RINGS_STORAGE_KEY]: {
        'channel:ring-viewer-channel': ringRecord
      }
    });
    expect(document.querySelector('#bookmarksCount')?.textContent).toBe('2');
    expect(document.querySelector('.avatar-ring-row .avatar-ring-avatar')).not.toBeNull();
    expect(
      document.querySelector('.bookmark-row:not(.avatar-ring-row) .avatar-ring-avatar')
    ).not.toBeNull();
  });

  it('restores and remembers the last selected popup tab', async () => {
    await chrome.storage.session.set({ ytcqPopupLastTab: 'bookmarksPanel' });

    await import('./index');

    expect(
      document.querySelector<HTMLButtonElement>('#bookmarksTab')?.getAttribute('aria-selected')
    ).toBe('true');
    expect(
      document.querySelector('.popup-tabs')?.classList.contains('popup-tab-highlight-animated')
    ).toBe(false);
    expect(document.querySelector<HTMLElement>('#settingsPanel')?.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('#bookmarksPanel')?.hidden).toBe(false);

    document.querySelector<HTMLButtonElement>('#playgroundTab')?.click();

    await expect(chrome.storage.session.get('ytcqPopupLastTab')).resolves.toEqual({
      ytcqPopupLastTab: 'playgroundPanel'
    });
    expect(
      document.querySelector<HTMLButtonElement>('#playgroundTab')?.getAttribute('aria-selected')
    ).toBe('true');
    expect(document.querySelector<HTMLElement>('#bookmarksPanel')?.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('#playgroundPanel')?.hidden).toBe(false);
  });

  it('moves the popup tab highlight across previews and selections', async () => {
    const tabList = document.querySelector<HTMLElement>('.popup-tabs')!;
    const settingsTab = document.querySelector<HTMLButtonElement>('#settingsTab')!;
    const bookmarksTab = document.querySelector<HTMLButtonElement>('#bookmarksTab')!;
    definePopupTabLayout(settingsTab, { left: 3, width: 104 });
    definePopupTabLayout(bookmarksTab, { left: 111, width: 104 });

    await import('./index');

    expect(tabList.classList.contains('popup-tab-highlight-animated')).toBe(false);
    expect(tabList.style.getPropertyValue('--ytcq-popup-tab-highlight-x')).toBe('3px');
    expect(tabList.style.getPropertyValue('--ytcq-popup-tab-highlight-width')).toBe('104px');
    expect(tabList.style.getPropertyValue('--ytcq-popup-tab-highlight-height')).toBe('28px');
    expect(tabList.style.getPropertyValue('--ytcq-popup-tab-highlight-opacity')).toBe('1');

    bookmarksTab.dispatchEvent(new Event('pointerenter'));
    expect(tabList.classList.contains('popup-tab-highlight-animated')).toBe(true);
    expect(tabList.style.getPropertyValue('--ytcq-popup-tab-highlight-x')).toBe('111px');

    tabList.dispatchEvent(new Event('pointerleave'));
    expect(tabList.style.getPropertyValue('--ytcq-popup-tab-highlight-x')).toBe('3px');

    tabList.classList.remove('popup-tab-highlight-animated');
    bookmarksTab.click();
    expect(tabList.classList.contains('popup-tab-highlight-animated')).toBe(true);
    expect(tabList.style.getPropertyValue('--ytcq-popup-tab-highlight-x')).toBe('111px');
  });

  it('ignores a remembered popup tab that is no longer available', async () => {
    await chrome.storage.session.set({ ytcqPopupLastTab: 'missingPanel' });

    await import('./index');

    expect(
      document.querySelector<HTMLButtonElement>('#settingsTab')?.getAttribute('aria-selected')
    ).toBe('true');
    expect(document.querySelector<HTMLElement>('#settingsPanel')?.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>('#bookmarksPanel')?.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('#playgroundPanel')?.hidden).toBe(true);
  });

  it('shows popup scroll fades only when the active panel has hidden content beyond that edge', async () => {
    vi.useFakeTimers();
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);
    const settingsPanel = document.querySelector<HTMLElement>('#settingsPanel')!;
    const bookmarksList = document.querySelector<HTMLElement>('#bookmarksList')!;
    const bookmarksScrollRegion = document.querySelector<HTMLElement>(
      '[data-popup-scroll-fade-region]'
    )!;
    const scrollbar = document.querySelector<HTMLElement>(
      '.popup-tab-panels > .popup-scrollbar'
    )!;
    const scrollbarThumb = scrollbar.querySelector<HTMLElement>('.popup-scrollbar-thumb')!;
    const bookmarksScrollbar = document.querySelector<HTMLElement>(
      '.bookmarks-list-shell > .popup-scrollbar'
    )!;
    const bookmarksScrollbarThumb =
      bookmarksScrollbar.querySelector<HTMLElement>('.popup-scrollbar-thumb')!;
    Object.defineProperties(settingsPanel, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 300 },
      scrollTop: { configurable: true, value: 0, writable: true }
    });
    Object.defineProperties(bookmarksList, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 300 },
      scrollTop: { configurable: true, value: 0, writable: true }
    });

    await import('./index');

    const scrollRegion = document.querySelector<HTMLElement>('.popup-tab-panels')!;
    expect(scrollRegion.classList.contains('popup-scroll-fade-top')).toBe(false);
    expect(scrollRegion.classList.contains('popup-scroll-fade-bottom')).toBe(true);
    expect(scrollbar.hidden).toBe(false);
    expect(scrollbar.classList.contains('popup-scrollbar-active')).toBe(true);
    expect(scrollbarThumb.style.height).toBe('32px');
    expect(scrollbarThumb.style.transform).toBe('translate3d(0, 2px, 0)');
    await vi.advanceTimersByTimeAsync(800);
    expect(scrollbar.classList.contains('popup-scrollbar-active')).toBe(false);
    const wheelEvent = new WheelEvent('wheel', { cancelable: true, deltaY: 40 });
    scrollbar.dispatchEvent(wheelEvent);
    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(settingsPanel.scrollTop).toBe(40);
    expect(scrollbar.classList.contains('popup-scrollbar-active')).toBe(true);

    settingsPanel.scrollTop = 80;
    settingsPanel.dispatchEvent(new Event('scroll'));
    expect(scrollRegion.classList.contains('popup-scroll-fade-top')).toBe(true);
    expect(scrollRegion.classList.contains('popup-scroll-fade-bottom')).toBe(true);
    expect(scrollbar.classList.contains('popup-scrollbar-active')).toBe(true);
    expect(scrollbarThumb.style.transform).toBe('translate3d(0, 28px, 0)');

    settingsPanel.scrollTop = 200;
    settingsPanel.dispatchEvent(new Event('scroll'));
    expect(scrollRegion.classList.contains('popup-scroll-fade-top')).toBe(true);
    expect(scrollRegion.classList.contains('popup-scroll-fade-bottom')).toBe(false);
    expect(scrollbarThumb.style.transform).toBe('translate3d(0, 66px, 0)');

    document.querySelector<HTMLButtonElement>('#bookmarksTab')?.click();
    expect(scrollRegion.classList.contains('popup-scroll-fade-top')).toBe(false);
    expect(scrollRegion.classList.contains('popup-scroll-fade-bottom')).toBe(false);
    expect(bookmarksScrollRegion.classList.contains('popup-scroll-fade-top')).toBe(false);
    expect(bookmarksScrollRegion.classList.contains('popup-scroll-fade-bottom')).toBe(true);
    expect(scrollbar.hidden).toBe(true);
    expect(bookmarksScrollbar.hidden).toBe(false);
    expect(bookmarksScrollbarThumb.style.height).toBe('32px');
    expect(bookmarksScrollbarThumb.style.transform).toBe('translate3d(0, 2px, 0)');

    bookmarksList.scrollTop = 80;
    bookmarksList.dispatchEvent(new Event('scroll'));
    expect(bookmarksScrollRegion.classList.contains('popup-scroll-fade-top')).toBe(true);
    expect(bookmarksScrollRegion.classList.contains('popup-scroll-fade-bottom')).toBe(true);
    expect(bookmarksScrollbarThumb.style.transform).toBe('translate3d(0, 28px, 0)');

    document.querySelector<HTMLButtonElement>('#settingsTab')?.click();
    expect(scrollRegion.classList.contains('popup-scroll-fade-top')).toBe(true);
    expect(scrollRegion.classList.contains('popup-scroll-fade-bottom')).toBe(false);
    expect(bookmarksScrollRegion.classList.contains('popup-scroll-fade-top')).toBe(true);
    expect(bookmarksScrollRegion.classList.contains('popup-scroll-fade-bottom')).toBe(true);

    document.querySelector<HTMLButtonElement>('#bookmarksTab')?.click();
    expect(scrollRegion.classList.contains('popup-scroll-fade-top')).toBe(false);
    expect(scrollRegion.classList.contains('popup-scroll-fade-bottom')).toBe(false);
    expect(bookmarksScrollRegion.classList.contains('popup-scroll-fade-top')).toBe(true);
    expect(bookmarksScrollRegion.classList.contains('popup-scroll-fade-bottom')).toBe(true);

    bookmarksList.scrollTop = 200;
    bookmarksList.dispatchEvent(new Event('scroll'));
    expect(bookmarksScrollRegion.classList.contains('popup-scroll-fade-top')).toBe(true);
    expect(bookmarksScrollRegion.classList.contains('popup-scroll-fade-bottom')).toBe(false);
    expect(bookmarksScrollbarThumb.style.transform).toBe('translate3d(0, 66px, 0)');
  });

  it('renders bookmark fallback rows, profile handles, and storage-change refreshes', async () => {
    await chrome.storage.local.set({
      [LEGACY_BOOKMARKS_STORAGE_KEY]: {
        'author:@alphauser': {
          authorName: '@AlphaUser',
          markedAt: 2_000,
          markedSourceUrl: 'https://www.youtube.com/watch?v=stream-a'
        },
        'author:@bad handle': {
          authorName: '@bad handle',
          markedAt: 1_000,
          markedSourceTitle: 'No channel stream'
        },
        'channel:channel-only': {
          authorName: '',
          channelId: 'channel-only',
          markedAt: 0
        }
      }
    });
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');
    document.querySelector<HTMLButtonElement>('#bookmarksTab')?.click();

    const rows = Array.from(document.querySelectorAll<HTMLElement>('.bookmark-row'));
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.querySelector('.bookmark-name')?.textContent)).toEqual([
      '@AlphaUser',
      '@bad handle',
      'unknownUser'
    ]);
    expect(rows[0].querySelector('.bookmark-source')?.textContent).toBe(
      'https://www.youtube.com/watch?v=stream-a'
    );
    expect(rows[1].querySelector('.bookmark-source')?.textContent).toBe('No channel stream');
    expect(rows[2].querySelector('.bookmark-source')?.textContent).toBe('unknownStream');
    expect(rows[0].querySelector('.bookmark-source-button')).not.toBeNull();
    expect(rows[1].querySelector('.bookmark-source-button')).toBeNull();
    expect(rows[2].querySelector('.bookmark-source-button')).toBeNull();
    expect(rows[2].querySelector('.bookmark-message-time')).toBeNull();

    const handleAvatar = rows[0].querySelector<HTMLButtonElement>('.bookmark-avatar-button');
    const plainAvatar = rows[1].querySelector<HTMLElement>('.bookmark-avatar');
    const unknownAvatar = rows[2].querySelector<HTMLButtonElement>('.bookmark-avatar-button');
    expect(handleAvatar).not.toBeNull();
    expect(plainAvatar).not.toBeNull();
    expect(plainAvatar?.textContent).toBe('B');
    expect(unknownAvatar?.textContent).toBe('?');
    expect(handleAvatar?.querySelector('.bookmark-avatar-open-icon')).not.toBeNull();
    expect(plainAvatar?.querySelector('.bookmark-avatar-open-icon')).toBeNull();
    expect(unknownAvatar?.querySelector('.bookmark-avatar-open-icon')).not.toBeNull();

    expect(rows[0].querySelector('.bookmark-name-button')).not.toBeNull();
    expect(rows[1].querySelector('.bookmark-name-button')).toBeNull();
    expect(rows[2].querySelector('.bookmark-name-button')).not.toBeNull();
    rows[0].querySelector<HTMLButtonElement>('.bookmark-name-button')?.click();
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://www.youtube.com/@AlphaUser'
    });
    rows[2].querySelector<HTMLButtonElement>('.bookmark-name-button')?.click();
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://www.youtube.com/channel/channel-only'
    });
    rows[0].querySelector<HTMLButtonElement>('.bookmark-source-button')?.click();
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://www.youtube.com/watch?v=stream-a'
    });

    const storageListener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls.at(-1)?.[0];
    storageListener?.(
      {
        [BOOKMARKS_STORAGE_KEY]: {
          newValue: {
            'author:@freshuser': {
              authorName: '@FreshUser',
              message: null,
              savedAt: 3_000,
              sourceKey: ''
            }
          }
        } as chrome.storage.StorageChange
      },
      'sync'
    );
    expect(document.querySelector('.bookmark-name')?.textContent).toBe('@AlphaUser');

    storageListener?.(
      {
        [BOOKMARKS_STORAGE_KEY]: {
          newValue: {
            'author:@freshuser': {
              authorName: '@FreshUser',
              message: null,
              savedAt: 3_000,
              sourceKey: ''
            }
          }
        } as chrome.storage.StorageChange
      },
      'local'
    );
    expect(document.querySelector('.bookmark-name')?.textContent).toBe('@FreshUser');
  });

  it('does not make chat-frame bookmark source urls clickable', async () => {
    await chrome.storage.local.set({
      [LEGACY_BOOKMARKS_STORAGE_KEY]: {
        'author:@framesourceuser': {
          authorName: '@FrameSourceUser',
          markedAt: 2_000,
          markedSourceTitle: 'Frame source stream',
          markedSourceUrl: 'https://www.youtube.com/live_chat?continuation=chat-frame-token'
        },
        'author:@videoiduser': {
          authorName: '@VideoIdUser',
          markedAt: 1_000,
          markedSourceTitle: 'Video id stream',
          markedSourceUrl: 'https://www.youtube.com/live_chat?video_id=stream-from-chat-frame'
        }
      }
    });
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');
    document.querySelector<HTMLButtonElement>('#bookmarksTab')?.click();

    const rows = Array.from(document.querySelectorAll<HTMLElement>('.bookmark-row'));
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('.bookmark-name')?.textContent).toBe('@FrameSourceUser');
    expect(rows[0].querySelector('.bookmark-source')?.textContent).toBe('Frame source stream');
    expect(rows[0].querySelector('.bookmark-source-button')).toBeNull();

    expect(rows[1].querySelector('.bookmark-name')?.textContent).toBe('@VideoIdUser');
    const sourceButton = rows[1].querySelector<HTMLButtonElement>('.bookmark-source-button');
    expect(sourceButton?.textContent).toBe('Video id stream');
    sourceButton?.click();
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://www.youtube.com/watch?v=stream-from-chat-frame'
    });
  });

  it('keeps bookmark removal safe when the stored record has already disappeared', async () => {
    await chrome.storage.local.set({
      [LEGACY_BOOKMARKS_STORAGE_KEY]: {
        'author:@vanishinguser': {
          authorName: '@VanishingUser',
          markedAt: 2_000
        }
      }
    });
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');
    document.querySelector<HTMLButtonElement>('#bookmarksTab')?.click();
    vi.mocked(chrome.storage.local.get).mockImplementationOnce(((
      keys: unknown,
      callback?: (items: Record<string, unknown>) => void
    ) => {
      const result =
        typeof keys === 'object' && keys !== null ? (keys as Record<string, unknown>) : {};
      callback?.(result);
      return Promise.resolve(result);
    }) as never);
    document.querySelector<HTMLButtonElement>('.bookmark-action-button')?.click();

    expect(document.querySelector('.bookmark-row')).toBeNull();
    await expect(chrome.storage.local.get(BOOKMARKS_STORAGE_KEY)).resolves.toEqual({
      [BOOKMARKS_STORAGE_KEY]: {}
    });
  });

  it('localizes text, titles, aria labels, and browser UI language', async () => {
    document.body.innerHTML += `
      <span data-i18n="translation"></span>
      <button data-i18n-title="openChannel"></button>
      <button data-i18n-aria-label="close"></button>
      <input data-i18n-placeholder="filterBookmarks">
      <span data-i18n="">unchanged text</span>
      <button data-i18n-title="" title="unchanged title"></button>
      <button data-i18n-aria-label="" aria-label="unchanged label"></button>
    `;
    vi.mocked(chrome.i18n.getUILanguage).mockReturnValue('es-ES');
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');

    expect(document.documentElement.lang).toBe('es-ES');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.querySelector('[data-i18n="translation"]')?.textContent).toBe('translation');
    expect(document.querySelector('[data-i18n="playgroundProfileHelper"]')?.textContent).toBe(
      'playgroundProfileHelper'
    );
    expect(document.querySelector('[data-i18n-title="openChannel"]')?.getAttribute('title')).toBe(
      'openChannel'
    );
    expect(
      document.querySelector('[data-i18n-aria-label="close"]')?.getAttribute('aria-label')
    ).toBe('Close');
    expect(
      document.querySelector<HTMLInputElement>('[data-i18n-placeholder="filterBookmarks"]')
        ?.placeholder
    ).toBe('filterBookmarks');
    expect(document.querySelector('[data-i18n=""]')?.textContent).toBe('unchanged text');
    expect(document.querySelector('[data-i18n-title=""]')?.getAttribute('title')).toBe(
      'unchanged title'
    );
    expect(document.querySelector('[data-i18n-aria-label=""]')?.getAttribute('aria-label')).toBe(
      'unchanged label'
    );
  });

  it('mirrors the popup for right-to-left browser locales', async () => {
    vi.mocked(chrome.i18n.getUILanguage).mockReturnValue('ar');
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');

    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('falls back to browser language and i18n keys when i18n helpers are unavailable', async () => {
    const originalI18n = chrome.i18n;
    const originalLanguage = navigator.language;
    Object.defineProperty(chrome, 'i18n', {
      configurable: true,
      value: {}
    });
    Object.defineProperty(navigator, 'language', {
      configurable: true,
      value: 'pt-BR'
    });
    document.body.innerHTML += '<span data-i18n="translation"></span>';
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    try {
      await import('./index');

      expect(document.documentElement.lang).toBe('pt-BR');
      expect(document.documentElement.dir).toBe('ltr');
      expect(document.querySelector('[data-i18n="translation"]')?.textContent).toBe('translation');
    } finally {
      Object.defineProperty(chrome, 'i18n', {
        configurable: true,
        value: originalI18n
      });
      Object.defineProperty(navigator, 'language', {
        configurable: true,
        value: originalLanguage
      });
    }
  });

  it('loads saved settings into their controls', async () => {
    await chrome.storage.sync.set({
      chatSkin: 'aero',
      liteModeEnabled: true,
      messageDensity: 'compact',
      sound: false,
      startupEffect: true,
      targetLanguage: 'ja',
      translationDisplay: 'below'
    });
    await import('./index');

    for (const [id, value] of [
      ['chatSkin', 'aero'], ['messageDensity', 'compact'],
      ['targetLanguage', 'ja'], ['translationDisplay', 'below']
    ]) {
      expect(document.querySelector<HTMLSelectElement>(`#${id}`)?.value).toBe(value);
    }
    expect(document.querySelector<HTMLInputElement>('#sound')?.checked).toBe(false);
    expect(document.querySelector<HTMLInputElement>('#startupEffect')?.checked).toBe(true);
    expect(document.querySelector<HTMLInputElement>('#liteModeEnabled')?.checked).toBe(true);
  });

  it('persists control changes and remembers the last enabled translation language', async () => {
    await chrome.storage.sync.set({ targetLanguage: 'ja', lastTranslationTarget: 'ko' });
    await import('./index');

    const language = document.querySelector<HTMLSelectElement>('#targetLanguage')!;
    language.value = '';
    language.dispatchEvent(new Event('change', { bubbles: true }));
    expect(chrome.storage.sync.set).toHaveBeenLastCalledWith(
      expect.objectContaining({ targetLanguage: '', lastTranslationTarget: 'ko' })
    );
    language.value = 'fr';
    language.dispatchEvent(new Event('change', { bubbles: true }));
    expect(chrome.storage.sync.set).toHaveBeenLastCalledWith(
      expect.objectContaining({ targetLanguage: 'fr', lastTranslationTarget: 'fr' })
    );

    const changes: Array<[string, string | boolean]> = [
      ['translationDisplay', 'below'], ['translationDisplay', 'replace'],
      ['chatSkin', 'aero'], ['chatSkin', 'system'],
      ['messageDensity', 'compact'], ['messageDensity', 'default'],
      ['sound', false], ['sound', true],
      ['startupEffect', false], ['startupEffect', true],
      ['liteModeEnabled', true], ['liteModeEnabled', false]
    ];
    for (const [id, value] of changes) {
      const control = document.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
      if (typeof value === 'boolean') {
        (control as HTMLInputElement).checked = value;
      } else {
        control.value = value;
      }
      control.dispatchEvent(new Event('change', { bubbles: true }));
      expect(chrome.storage.sync.set).toHaveBeenLastCalledWith({ [id]: value });
    }
  });

  it('loads Playground identity on demand, edits it, and clears it when disabled', async () => {
    vi.useFakeTimers();
    await chrome.storage.sync.set({
      playgroundEnabled: true,
      playgroundGamesAvailable: true
    });
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((
      message: unknown,
      callback?: (response: unknown) => void
    ) => {
      const type =
        typeof message === 'object' && message !== null ? (message as { type?: string }).type : '';
      const response =
        type === PLAYGROUND_PROFILE_MESSAGE_TYPE
          ? {
              ok: true,
              profile: {
                customDisplayName: '',
                displayName: 'Player TEST',
                generatedDisplayName: 'Player TEST',
                userId: 'test-user',
                wins: null
              }
            }
          : type === PLAYGROUND_PROFILE_STATS_MESSAGE_TYPE
            ? {
                ok: true,
                userId: 'test-user',
                wins: 7
              }
            : type === PLAYGROUND_PROFILE_UPDATE_MESSAGE_TYPE
              ? {
                  ok: true,
                  profile: {
                    customDisplayName: 'Luna Chat',
                    displayName: 'Luna Chat',
                    generatedDisplayName: 'Player TEST',
                    userId: 'test-user',
                    wins: null
                  }
                }
              : { activeTabIds: [] };
      callback?.(response);
      return Promise.resolve(response);
    }) as never);

    await import('./index');
    const enabled = document.querySelector<HTMLInputElement>('#playgroundEnabled')!;
    const profile = document.querySelector<HTMLElement>('#playgroundProfile')!;
    const avatar = document.querySelector<HTMLElement>('#playgroundProfileAvatar')!;
    const details = document.querySelector<HTMLElement>('#playgroundProfileDetails')!;
    const displayName = document.querySelector<HTMLInputElement>('#playgroundDisplayName')!;
    const profileName = document.querySelector<HTMLElement>('#playgroundProfileName')!;
    const toggle = document.querySelector<HTMLButtonElement>('#playgroundProfileToggle')!;
    const wins = document.querySelector<HTMLElement>('#playgroundProfileWins')!;
    const winsCount = document.querySelector<HTMLElement>('#playgroundProfileWinsCount')!;
    const games = document.querySelector<HTMLElement>('#playgroundGamesSection')!;
    const available = document.querySelector<HTMLInputElement>('#playgroundGamesAvailable')!;

    expect(enabled.checked).toBe(true);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      { type: PLAYGROUND_PROFILE_MESSAGE_TYPE }, expect.any(Function)
    );
    document.querySelector<HTMLButtonElement>('#playgroundTab')!.click();
    expect(profile.hidden).toBe(false);
    expect(details.hidden).toBe(true);
    expect(avatar.textContent).toBe('T');
    expect(profileName.textContent).toBe('Player TEST');
    expect(displayName.value).toBe('');
    expect(displayName.placeholder).toBe('Player TEST');
    expect(wins.getAttribute('aria-label')).toBe('playgroundWins: 7');
    expect(winsCount.textContent).toBe('7');
    expect(games.hidden).toBe(false);
    expect(available.checked).toBe(true);

    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(details.hidden).toBe(false);
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(details.hidden).toBe(true);
    toggle.click();

    displayName.value = '  Luna Chat  ';
    displayName.dispatchEvent(new Event('change', { bubbles: true }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      { displayName: 'Luna Chat', type: PLAYGROUND_PROFILE_UPDATE_MESSAGE_TYPE },
      expect.any(Function)
    );
    expect(avatar.textContent).toBe('L');
    expect(profileName.textContent).toBe('Luna Chat');
    expect(displayName.value).toBe('Luna Chat');
    expect(displayName.placeholder).toBe('Player TEST');

    enabled.checked = false;
    enabled.dispatchEvent(new Event('change', { bubbles: true }));
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ playgroundEnabled: false });
    expect(profile.hidden).toBe(true);
    expect(details.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(avatar.textContent).toBe('');
    expect(displayName.value).toBe('');
    expect(displayName.placeholder).toBe('');
    expect(profileName.textContent).toBe('');
    expect(wins.getAttribute('aria-label')).toBe('playgroundWins: 0');
    expect(winsCount.textContent).toBe('0');
    expect(available.checked).toBe(true);
    const transitionEnd = new Event('transitionend');
    Object.defineProperty(transitionEnd, 'propertyName', { value: 'transform' });
    games.dispatchEvent(transitionEnd);
    expect(games.hidden).toBe(true);

    enabled.checked = true;
    enabled.dispatchEvent(new Event('change', { bubbles: true }));
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ playgroundEnabled: true });
    expect(games.hidden).toBe(false);
    for (const value of [false, true]) {
      available.checked = value;
      available.dispatchEvent(new Event('change', { bubbles: true }));
      expect(chrome.storage.sync.set).toHaveBeenCalledWith({ playgroundGamesAvailable: value });
    }
  });

  it('shows the Playground identity while remote wins are loading', async () => {
    type RuntimeCallback = (response: unknown) => void;
    const statsCallbacks: RuntimeCallback[] = [];
    await chrome.storage.sync.set({
      playgroundEnabled: true
    });
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((
      message: unknown,
      callback?: RuntimeCallback
    ) => {
      const type =
        typeof message === 'object' && message !== null ? (message as { type?: string }).type : '';
      if (type === PLAYGROUND_PROFILE_MESSAGE_TYPE) {
        callback?.({
          ok: true,
          profile: {
            customDisplayName: '',
            displayName: 'Player SLOW',
            generatedDisplayName: 'Player SLOW',
            userId: 'slow-user',
            wins: null
          }
        });
        return Promise.resolve(undefined);
      }
      if (type === PLAYGROUND_PROFILE_STATS_MESSAGE_TYPE) {
        if (callback) statsCallbacks.push(callback);
        return Promise.resolve(undefined);
      }

      callback?.({ activeTabIds: [] });
      return Promise.resolve({ activeTabIds: [] });
    }) as never);

    await import('./index');
    const playgroundProfile = document.querySelector<HTMLElement>('#playgroundProfile')!;
    const playgroundProfileName = document.querySelector<HTMLElement>('#playgroundProfileName')!;
    const playgroundProfileWins = document.querySelector<HTMLElement>('#playgroundProfileWins')!;
    const playgroundProfileWinsCount = document.querySelector<HTMLElement>(
      '#playgroundProfileWinsCount'
    )!;
    const spinner = playgroundProfileWins.querySelector<HTMLElement>(
      '.playground-profile-wins-spinner'
    )!;

    expect(playgroundProfile.hidden).toBe(true);
    expect(statsCallbacks).toHaveLength(0);
    document.querySelector<HTMLButtonElement>('#playgroundTab')?.click();
    expect(playgroundProfile.hidden).toBe(false);
    expect(playgroundProfileName.textContent).toBe('Player SLOW');
    expect(playgroundProfileWins.getAttribute('aria-busy')).toBe('true');
    expect(playgroundProfileWins.getAttribute('aria-label')).toBe('playgroundWins');
    expect(spinner.hidden).toBe(false);
    expect(playgroundProfileWinsCount.hidden).toBe(true);
    expect(playgroundProfileWinsCount.textContent).toBe('');

    statsCallbacks[0]?.({
      ok: true,
      userId: 'slow-user',
      wins: 12
    });

    expect(playgroundProfileWins.getAttribute('aria-busy')).toBeNull();
    expect(playgroundProfileWins.getAttribute('aria-label')).toBe('playgroundWins: 12');
    expect(spinner.hidden).toBe(true);
    expect(playgroundProfileWinsCount.hidden).toBe(false);
    expect(playgroundProfileWinsCount.textContent).toBe('12');

    document.querySelector<HTMLButtonElement>('#settingsTab')?.click();
    document.querySelector<HTMLButtonElement>('#playgroundTab')?.click();
    expect(
      vi
        .mocked(chrome.runtime.sendMessage)
        .mock.calls.filter(
          ([message]) =>
            typeof message === 'object' &&
            message !== null &&
            (message as { type?: string }).type === PLAYGROUND_PROFILE_MESSAGE_TYPE
        )
    ).toHaveLength(1);
  });

  it('ignores stale, failed, and blank Playground profile responses', async () => {
    type RuntimeCallback = (response: unknown) => void;
    const profileCallbacks: RuntimeCallback[] = [];
    await chrome.storage.sync.set({
      playgroundEnabled: true
    });
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((
      message: unknown,
      callback?: RuntimeCallback
    ) => {
      if (
        typeof message === 'object' &&
        message !== null &&
        (message as { type?: string }).type === PLAYGROUND_PROFILE_MESSAGE_TYPE
      ) {
        if (callback) profileCallbacks.push(callback);
        return Promise.resolve(undefined);
      }
      callback?.({ activeTabIds: [] });
      return Promise.resolve({ activeTabIds: [] });
    }) as never);

    await import('./index');
    const playgroundEnabled = document.querySelector<HTMLInputElement>('#playgroundEnabled')!;
    const playgroundProfile = document.querySelector<HTMLElement>('#playgroundProfile')!;
    const playgroundProfileName = document.querySelector<HTMLElement>('#playgroundProfileName')!;

    expect(profileCallbacks).toHaveLength(0);
    document.querySelector<HTMLButtonElement>('#playgroundTab')?.click();
    expect(profileCallbacks).toHaveLength(1);
    playgroundEnabled.checked = false;
    playgroundEnabled.dispatchEvent(new Event('change', { bubbles: true }));
    profileCallbacks[0]?.({
      ok: true,
      profile: { displayName: 'Stale Player', userId: 'stale-user', wins: 4 }
    });

    expect(playgroundProfile.hidden).toBe(true);
    expect(playgroundProfileName.textContent).toBe('');

    playgroundEnabled.checked = true;
    playgroundEnabled.dispatchEvent(new Event('change', { bubbles: true }));
    profileCallbacks[1]?.({ ok: false });
    expect(playgroundProfile.hidden).toBe(true);

    playgroundEnabled.checked = false;
    playgroundEnabled.dispatchEvent(new Event('change', { bubbles: true }));
    playgroundEnabled.checked = true;
    playgroundEnabled.dispatchEvent(new Event('change', { bubbles: true }));
    profileCallbacks[2]?.({
      ok: true,
      profile: { displayName: '   ', wins: 'many' }
    });
    expect(playgroundProfile.hidden).toBe(true);
  });

  it('validates Playground display names before saving from the popup', async () => {
    await chrome.storage.sync.set({
      playgroundEnabled: true
    });
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((
      message: unknown,
      callback?: (response: unknown) => void
    ) => {
      const response =
        typeof message === 'object' &&
        message !== null &&
        (message as { type?: string }).type === PLAYGROUND_PROFILE_MESSAGE_TYPE
          ? {
              ok: true,
              profile: {
                customDisplayName: '',
                displayName: 'Player TEST',
                generatedDisplayName: 'Player TEST',
                userId: 'test-user',
                wins: null
              }
            }
          : typeof message === 'object' &&
              message !== null &&
              (message as { type?: string }).type === PLAYGROUND_PROFILE_STATS_MESSAGE_TYPE
            ? {
                ok: true,
                userId: 'test-user',
                wins: 0
              }
            : { activeTabIds: [] };
      callback?.(response);
      return Promise.resolve(response);
    }) as never);

    await import('./index');
    const displayName = document.querySelector<HTMLInputElement>('#playgroundDisplayName')!;
    const reportValidity = vi.spyOn(displayName, 'reportValidity').mockReturnValue(false);
    vi.mocked(chrome.runtime.sendMessage).mockClear();

    displayName.value = 'https://example.com';
    displayName.dispatchEvent(new Event('change', { bubbles: true }));

    expect(reportValidity).toHaveBeenCalled();
    expect(displayName.validationMessage).toBe('playgroundDisplayNameInvalid');
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: PLAYGROUND_PROFILE_UPDATE_MESSAGE_TYPE
      }),
      expect.any(Function)
    );
  });

  it('lets the Playground helper text toggle while the helper link stays a link', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');
    const playgroundEnabled = document.querySelector<HTMLInputElement>('#playgroundEnabled')!;
    const helper = document.querySelector<HTMLElement>('#playgroundHelper')!;
    const helperLink = document.querySelector<HTMLAnchorElement>('.option-helper-link')!;

    expect(playgroundEnabled.checked).toBe(false);
    expect(helperLink.href).toBe('https://playground.chatenhancer.com/');
    helper.click();
    expect(playgroundEnabled.checked).toBe(true);

    const linkClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    helperLink.dispatchEvent(linkClick);
    expect(linkClick.defaultPrevented).toBe(false);
    expect(playgroundEnabled.checked).toBe(true);
  });

  it('does not animate icons and disables startup effect when reduced motion is preferred', async () => {
    installMatchMedia(true);
    document.body.innerHTML += `
      <svg class="chat-skin-icon"></svg>
      <svg class="translation-target-icon"></svg>
      <svg class="lite-mode-icon"></svg>
      <svg class="message-density-icon"></svg>
      <svg class="playground-join-icon"></svg>
      <svg class="game-invites-icon"></svg>
    `;
    await chrome.storage.sync.set({
      startupEffect: true
    });
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');
    const targetLanguage = document.querySelector<HTMLSelectElement>('#targetLanguage')!;
    const chatSkin = document.querySelector<HTMLSelectElement>('#chatSkin')!;
    targetLanguage.value = 'ja';
    targetLanguage.dispatchEvent(new Event('change', { bubbles: true }));
    chatSkin.value = 'aero';
    chatSkin.dispatchEvent(new Event('change', { bubbles: true }));
    const messageDensity = document.querySelector<HTMLSelectElement>('#messageDensity')!;
    messageDensity.value = 'compact';
    messageDensity.dispatchEvent(new Event('change', { bubbles: true }));
    const liteModeEnabled = document.querySelector<HTMLInputElement>('#liteModeEnabled')!;
    liteModeEnabled.checked = true;
    liteModeEnabled.dispatchEvent(new Event('change', { bubbles: true }));
    const playgroundEnabled = document.querySelector<HTMLInputElement>('#playgroundEnabled')!;
    playgroundEnabled.checked = false;
    playgroundEnabled.dispatchEvent(new Event('change', { bubbles: true }));
    const playgroundGamesAvailable = document.querySelector<HTMLInputElement>(
      '#playgroundGamesAvailable'
    )!;
    playgroundGamesAvailable.checked = false;
    playgroundGamesAvailable.dispatchEvent(new Event('change', { bubbles: true }));

    expect(document.querySelector<HTMLInputElement>('#startupEffect')?.disabled).toBe(true);
    expect(document.querySelector<HTMLInputElement>('#startupEffect')?.checked).toBe(false);
    expect(
      document
        .querySelector('.translation-target-icon')
        ?.classList.contains('ytcq-translation-pulse')
    ).toBe(false);
    expect(document.querySelector('.chat-skin-icon')?.classList.contains('ytcq-palette-pop')).toBe(
      false
    );
    expect(
      document.querySelector('.message-density-icon')?.classList.contains('ytcq-density-compress')
    ).toBe(false);
    expect(document.querySelector('.lite-mode-icon')?.classList.contains('ytcq-bolt-redraw')).toBe(
      false
    );
    expect(
      document
        .querySelector('.playground-join-icon')
        ?.classList.contains('ytcq-game-controller-hop')
    ).toBe(false);
    expect(
      document.querySelector('.game-invites-icon')?.classList.contains('ytcq-game-controller-hop')
    ).toBe(false);
    document.querySelector<HTMLButtonElement>('#appearanceMoreSettingsToggle')?.click();
    expect(
      document
        .querySelector('#appearanceMoreSettingsGroup')
        ?.classList.contains('appearance-more-settings-group-revealed')
    ).toBe(false);
  });

  it('falls back to static language labels and skips missing animation icons', async () => {
    vi.useFakeTimers();
    const displayNamesSpy = vi.spyOn(Intl, 'DisplayNames').mockImplementation(
      class {
        of(): string {
          throw new Error('display names unavailable');
        }
      } as never
    );
    await chrome.storage.sync.set({
      sound: false,
      startupEffect: false,
      targetLanguage: '',
      translationDisplay: 'below'
    });
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');
    const japanese = Array.from(
      document.querySelectorAll<HTMLOptionElement>('#targetLanguage option')
    ).find((option) => option.value === 'ja');
    expect(japanese?.textContent).toBe('Japanese');
    expect(displayNamesSpy).toHaveBeenCalledTimes(1);

    document.querySelector<HTMLSelectElement>('#translationDisplay')!.value = 'replace';
    document
      .querySelector<HTMLSelectElement>('#translationDisplay')!
      .dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector<HTMLInputElement>('#sound')!.checked = false;
    document
      .querySelector<HTMLInputElement>('#sound')!
      .dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector<HTMLInputElement>('#startupEffect')!.checked = false;
    document
      .querySelector<HTMLInputElement>('#startupEffect')!
      .dispatchEvent(new Event('change', { bubbles: true }));

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ translationDisplay: 'replace' });
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ sound: false });
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ startupEffect: false });
    displayNamesSpy.mockRestore();
  });

  it('resets extension storage, updates controls, broadcasts page reset, and shows completion', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((
      queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      const tabs = queryInfo.active
        ? [{ id: 10 } as chrome.tabs.Tab]
        : [{ id: 10 } as chrome.tabs.Tab, { id: undefined } as chrome.tabs.Tab];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((
      _message: unknown,
      callback?: (response: unknown) => void
    ) => {
      callback?.({ activeTabIds: [] });
      return Promise.resolve({ activeTabIds: [] });
    }) as never);
    await import('./index');
    document.querySelector<HTMLSelectElement>('#chatSkin')!.value = 'aero';
    document.querySelector<HTMLSelectElement>('#messageDensity')!.value = 'compact';
    document.querySelector<HTMLSelectElement>('#targetLanguage')!.value = 'ja';
    document.querySelector<HTMLInputElement>('#sound')!.checked = false;
    document.querySelector<HTMLButtonElement>('#resetExtension')?.click();
    expect(chrome.storage.local.clear).not.toHaveBeenCalled();
    expect(document.querySelector('.popup-reset-dialog-message')?.textContent).toBe(
      'popupResetConfirm'
    );
    expect(document.querySelector('.popup-reset-dialog-list-label')?.textContent).toBe(
      'popupResetConfirmIncludes'
    );
    expect(
      Array.from(document.querySelectorAll('.popup-reset-dialog-list li')).map(
        (item) => item.textContent
      )
    ).toEqual([
      'popupResetItemSettings',
      'popupResetItemInboxMessages',
      'popupResetItemWatchedKeywords',
      'popupResetItemFrequentEmojis',
      'popupResetItemUnsentDrafts',
      'popupResetItemBookmarks',
      'popupResetItemRememberedUsers',
      'popupResetItemPlaygroundIdentity',
      'popupResetItemGamePreferences'
    ]);
    expect(document.querySelector('.popup-reset-dialog-cancel')?.textContent).toBe('Close');
    expect(document.querySelector('.popup-reset-dialog-confirm')?.textContent).toBe(
      'resetExtension'
    );

    document.querySelector<HTMLButtonElement>('.popup-reset-dialog-confirm')?.click();

    expect(chrome.storage.local.clear).toHaveBeenCalled();
    expect(chrome.storage.session.clear).toHaveBeenCalled();
    expect(chrome.storage.sync.clear).toHaveBeenCalled();
    expect(chrome.storage.sync.set).toHaveBeenCalledWith(
      expect.objectContaining({
        sound: true,
        targetLanguage: ''
      }),
      expect.any(Function)
    );
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      10,
      { type: 'ytcq:reset-page' },
      expect.any(Function)
    );
    expect(document.querySelector('.popup-reset-dialog-message')?.textContent).toBe(
      'popupResetComplete'
    );
    expect(document.querySelector('.popup-reset-dialog-list')).toBeNull();
    expect(document.querySelector('.popup-reset-dialog-close')?.textContent).toBe('Close');
    expect(document.querySelector<HTMLInputElement>('#sound')?.checked).toBe(true);
    expect(document.querySelector<HTMLSelectElement>('#chatSkin')?.value).toBe('system');
    expect(document.querySelector<HTMLSelectElement>('#messageDensity')?.value).toBe('default');
    expect(document.querySelector<HTMLSelectElement>('#targetLanguage')?.value).toBe('');
  });

  it('cancels the reset dialog when clicking outside it', async () => {
    await import('./index');
    document.querySelector<HTMLButtonElement>('#resetExtension')?.click();

    const backdrop = document.querySelector<HTMLDivElement>('.popup-reset-dialog-backdrop');
    const dialog = document.querySelector<HTMLElement>('.popup-reset-dialog');
    expect(backdrop).not.toBeNull();
    expect(dialog).not.toBeNull();

    dialog?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(document.querySelector('.popup-reset-dialog-backdrop')).not.toBeNull();

    backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(document.querySelector('.popup-reset-dialog-backdrop')).toBeNull();
    expect(chrome.storage.local.clear).not.toHaveBeenCalled();
    expect(chrome.storage.sync.clear).not.toHaveBeenCalled();
  });

  it('completes reset immediately when there are no tab ids to notify', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((
      queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      const tabs = queryInfo.active ? [] : [{ id: undefined } as chrome.tabs.Tab];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    await import('./index');
    document.querySelector<HTMLButtonElement>('#resetExtension')?.click();
    document.querySelector<HTMLButtonElement>('.popup-reset-dialog-confirm')?.click();

    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    expect(document.querySelector('.popup-reset-dialog-message')?.textContent).toBe(
      'popupResetComplete'
    );
  });

  it('waits for every tab reset response before reporting completion', async () => {
    const resetCallbacks: (() => void)[] = [];
    vi.mocked(chrome.tabs.query).mockImplementation(((
      queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      const tabs = queryInfo.active
        ? [{ id: 10 } as chrome.tabs.Tab]
        : [{ id: 10 } as chrome.tabs.Tab, { id: 20 } as chrome.tabs.Tab];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((
      _message: unknown,
      callback?: (response: unknown) => void
    ) => {
      callback?.({ activeTabIds: [] });
      return Promise.resolve({ activeTabIds: [] });
    }) as never);
    vi.mocked(chrome.tabs.sendMessage).mockImplementation(((
      _tabId: number,
      message: unknown,
      callback?: () => void
    ) => {
      if ((message as { type?: string })?.type === 'ytcq:reset-page') {
        resetCallbacks.push(() => callback?.());
      } else {
        callback?.();
      }
      return Promise.resolve();
    }) as never);
    await import('./index');
    document.querySelector<HTMLButtonElement>('#resetExtension')?.click();
    document.querySelector<HTMLButtonElement>('.popup-reset-dialog-confirm')?.click();

    expect(resetCallbacks).toHaveLength(2);
    expect(document.querySelector('.popup-reset-dialog-message')?.textContent).toBe(
      'popupResetConfirm'
    );

    resetCallbacks[0]();
    expect(document.querySelector('.popup-reset-dialog-message')?.textContent).toBe(
      'popupResetConfirm'
    );

    resetCallbacks[1]();
    expect(document.querySelector('.popup-reset-dialog-message')?.textContent).toBe(
      'popupResetComplete'
    );
  });

  it('skips popup wiring when required controls are missing', async () => {
    document.body.innerHTML = '<section data-extension-status></section>';
    vi.mocked(chrome.tabs.query).mockImplementation(((
      _queryInfo: chrome.tabs.QueryInfo,
      callback?: (tabs: chrome.tabs.Tab[]) => void
    ) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');

    expect(chrome.storage.sync.get).not.toHaveBeenCalled();
  });
});

function installMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn()
    }))
  });
}

function definePopupTabLayout(
  tab: HTMLButtonElement,
  { left, width }: { left: number; width: number }
): void {
  Object.defineProperties(tab, {
    offsetHeight: { configurable: true, value: 28 },
    offsetLeft: { configurable: true, value: left },
    offsetWidth: { configurable: true, value: width }
  });
}
