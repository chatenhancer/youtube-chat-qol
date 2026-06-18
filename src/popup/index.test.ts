import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_STATUS_UPDATED_STORAGE_KEY } from '../shared/chat-status';
import { MARKED_USERS_STORAGE_KEY } from '../shared/marked-users';

describe('popup', () => {
  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = `
      <a id="landingLink"></a>
      <a id="sourceCodeLink"></a>
      <a id="supportLink"></a>
      <button id="resetExtension"></button>
      <button id="settingsTab" data-popup-tab-target="settingsPanel" aria-selected="true"></button>
      <button id="bookmarksTab" data-popup-tab-target="bookmarksPanel" aria-selected="false"></button>
      <button id="playgroundTab" data-popup-tab-target="playgroundPanel" aria-selected="false"></button>
      <div id="settingsPanel" data-popup-tab-panel>
      <select id="targetLanguage"></select>
      <select id="translationDisplay">
        <option value="replace">Replace</option>
        <option value="below">Below</option>
      </select>
      <input id="sound" type="checkbox">
      <input id="startupEffect" type="checkbox">
      </div>
      <div id="bookmarksPanel" data-popup-tab-panel hidden>
        <span id="bookmarksCount"></span>
        <div id="bookmarksList"></div>
      </div>
      <div id="playgroundPanel" data-popup-tab-panel hidden>
        <label id="playgroundOption" class="option option-toggle">
          <span class="option-helper">
            <span id="playgroundHelper">Try early experiments.</span>
            <a class="option-helper-link" href="https://www.chatenhancer.com/privacy" target="_blank" rel="noreferrer">Learn more</a>
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
          <p id="playgroundProfileDetails" data-i18n="playgroundProfileHelper" hidden></p>
        </div>
        <section id="playgroundGamesSection" hidden>
          <input id="playgroundGamesAvailable" type="checkbox">
        </section>
      </div>
      <footer>
        <span id="version"></span>
        <div data-extension-status>
          <span data-extension-status-text></span>
        </div>
      </footer>
    `;
    await chrome.storage.local.clear();
    await chrome.storage.sync.clear();
    vi.mocked(chrome.tabs.create).mockClear();
    vi.mocked(chrome.tabs.sendMessage).mockClear();
    vi.mocked(chrome.storage.local.clear).mockClear();
    vi.mocked(chrome.storage.local.get).mockClear();
    vi.mocked(chrome.storage.onChanged.addListener).mockClear();
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
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      const tabs = queryInfo.active ? [{ id: 10 } as chrome.tabs.Tab] : [];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ status: { currentActive: true, otherActiveCount: 1 } });
      return Promise.resolve({ status: { currentActive: true, otherActiveCount: 1 } });
    }) as never);

    await import('./index');

    expect(document.querySelector('[data-extension-status]')?.getAttribute('data-extension-status')).toBe('active');
    expect(document.querySelector('[data-extension-status]')?.getAttribute('title')).toBe(
      'extensionStatusConnected'
    );
    expect(document.querySelector('[data-extension-status]')?.getAttribute('aria-label')).toBe(
      'extensionStatusActiveCurrent. extensionStatusConnected'
    );
    expect(document.querySelector('[data-extension-status-text]')?.textContent).toBe('extensionStatusActiveCurrent');
  });

  it('uses disconnected helper copy when no active content scripts respond', async () => {
    await chrome.storage.local.set({
      ytcqKnownChatTabs: {
        10: Date.now()
      }
    });
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      const tabs = queryInfo.active ? [{ id: 10 } as chrome.tabs.Tab] : [];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ status: { currentActive: false, otherActiveCount: 0 } });
      return Promise.resolve({ status: { currentActive: false, otherActiveCount: 0 } });
    }) as never);

    await import('./index');

    expect(document.querySelector('[data-extension-status]')?.getAttribute('data-extension-status')).toBe('inactive');
    expect(document.querySelector('[data-extension-status]')?.getAttribute('title')).toBe(
      'extensionStatusDisconnected'
    );
    expect(document.querySelector('[data-extension-status]')?.getAttribute('aria-label')).toBe(
      'extensionStatusInactiveAll. extensionStatusDisconnected'
    );
    expect(document.querySelector('[data-extension-status-text]')?.textContent).toBe('extensionStatusInactiveAll');
  });

  it('renders the compact manifest version in the footer', async () => {
    vi.mocked(chrome.runtime.getManifest).mockReturnValue({ version: '1.2.3' } as chrome.runtime.Manifest);
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');

    expect(document.querySelector('#version')?.textContent).toBe('v1.2.3');
  });

  it('refreshes active chat status while the popup remains open', async () => {
    let activeStatus = { currentActive: false, otherActiveCount: 0 };
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      const tabs = queryInfo.active ? [{ id: 10 } as chrome.tabs.Tab] : [];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ status: activeStatus });
      return Promise.resolve({ status: activeStatus });
    }) as never);

    await import('./index');

    expect(document.querySelector('[data-extension-status]')?.getAttribute('data-extension-status')).toBe('inactive');
    expect(document.querySelector('[data-extension-status-text]')?.textContent).toBe('extensionStatusInactiveAll');

    const statusStorageListener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0]?.[0] as (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => void;

    activeStatus = { currentActive: true, otherActiveCount: 0 };
    statusStorageListener({
      [CHAT_STATUS_UPDATED_STORAGE_KEY]: {
        newValue: Date.now()
      } as chrome.storage.StorageChange
    }, 'local');

    expect(document.querySelector('[data-extension-status]')?.getAttribute('data-extension-status')).toBe('active');
    expect(document.querySelector('[data-extension-status-text]')?.textContent).toBe('extensionStatusActiveCurrent');
    expect(document.querySelector('[data-extension-status]')?.getAttribute('title')).toBe(
      'extensionStatusConnected'
    );
  });

  it('summarizes active chats in other tabs and handles no open tabs', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      const tabs = queryInfo.active ? [{ id: 10 } as chrome.tabs.Tab] : [];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ status: { currentActive: false, otherActiveCount: 2 } });
      return Promise.resolve({ status: { currentActive: false, otherActiveCount: 2 } });
    }) as never);

    await import('./index');

    expect(document.querySelector('[data-extension-status-text]')?.textContent).toBe('extensionStatusActiveManyOther:2');
    expect(document.querySelector('[data-extension-status]')?.getAttribute('title')).toBe('extensionStatusConnected');

    vi.resetModules();
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      const tabs: chrome.tabs.Tab[] = [];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ status: { currentActive: false, otherActiveCount: 0 } });
      return Promise.resolve({ status: { currentActive: false, otherActiveCount: 0 } });
    }) as never);
    await import('./index');

    expect(document.querySelector('[data-extension-status-text]')?.textContent).toBe('extensionStatusInactiveAll');
    expect(document.querySelector('[data-extension-status]')?.getAttribute('title')).toBe('extensionStatusDisconnected');
  });

  it('keeps current-tab active status focused even when other tabs are active', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      const tabs = queryInfo.active ? [{ id: 10 } as chrome.tabs.Tab] : [];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ status: { currentActive: true, otherActiveCount: 0 } });
      return Promise.resolve({ status: { currentActive: true, otherActiveCount: 0 } });
    }) as never);

    await import('./index');
    expect(document.querySelector('[data-extension-status-text]')?.textContent).toBe('extensionStatusActiveCurrent');
    expect(document.querySelector('[data-extension-status]')?.getAttribute('title')).toBe('extensionStatusConnected');

    vi.resetModules();
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ status: { currentActive: true, otherActiveCount: 2 } });
      return Promise.resolve({ status: { currentActive: true, otherActiveCount: 2 } });
    }) as never);
    await import('./index');

    expect(document.querySelector('[data-extension-status-text]')?.textContent).toBe('extensionStatusActiveCurrent');
    expect(document.querySelector('[data-extension-status]')?.getAttribute('title')).toBe('extensionStatusConnected');
  });

  it('summarizes a single active chat in another tab', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      const tabs = queryInfo.active ? [{ id: 10 } as chrome.tabs.Tab] : [];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ status: { currentActive: false, otherActiveCount: 1 } });
      return Promise.resolve({ status: { currentActive: false, otherActiveCount: 1 } });
    }) as never);

    await import('./index');

    expect(document.querySelector('[data-extension-status-text]')?.textContent).toBe('extensionStatusActiveOneOther');
    expect(document.querySelector('[data-extension-status]')?.getAttribute('title')).toBe('extensionStatusConnected');
  });

  it('ignores malformed active chat responses', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      const tabs = queryInfo.active ? [{ id: 10 } as chrome.tabs.Tab] : [];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ status: { currentActive: 'yes', otherActiveCount: -1 } });
      return Promise.resolve({ status: { currentActive: 'yes', otherActiveCount: -1 } });
    }) as never);

    await import('./index');

    expect(document.querySelector('[data-extension-status]')?.getAttribute('data-extension-status')).toBe('inactive');
  });

  it('summarizes active tabs when the current active tab has no usable id', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      const tabs = queryInfo.active ? [{ id: undefined } as chrome.tabs.Tab] : [];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ status: { currentActive: false, otherActiveCount: 1 } });
      return Promise.resolve({ status: { currentActive: false, otherActiveCount: 1 } });
    }) as never);

    await import('./index');

    expect(document.querySelector('[data-extension-status-text]')?.textContent).toBe('extensionStatusActiveOneOther');
    expect(document.querySelector('[data-extension-status]')?.getAttribute('title')).toBe('extensionStatusConnected');
  });

  it('treats missing active tab responses as disconnected', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      const tabs = queryInfo.active ? [{ id: 10 } as chrome.tabs.Tab] : [];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.(undefined);
      return Promise.resolve(undefined);
    }) as never);

    await import('./index');

    expect(document.querySelector('[data-extension-status]')?.getAttribute('data-extension-status')).toBe('inactive');
    expect(document.querySelector('[data-extension-status]')?.getAttribute('title')).toBe('extensionStatusDisconnected');
  });

  it('treats active chat lookup errors as disconnected', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      const tabs = queryInfo.active ? [{ id: 10 } as chrome.tabs.Tab] : [];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      Object.defineProperty(chrome.runtime, 'lastError', {
        configurable: true,
        value: { message: 'background unavailable' }
      });
      callback?.({ status: { currentActive: true, otherActiveCount: 0 } });
      Object.defineProperty(chrome.runtime, 'lastError', {
        configurable: true,
        value: undefined
      });
      return Promise.resolve();
    }) as never);

    await import('./index');

    expect(document.querySelector('[data-extension-status]')?.getAttribute('data-extension-status')).toBe('inactive');
  });

  it('opens the support page from the popup', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((_queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ activeTabIds: [] });
      return Promise.resolve({ activeTabIds: [] });
    }) as never);
    await import('./index');
    document.querySelector<HTMLAnchorElement>('#supportLink')?.click();

    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://www.chatenhancer.com/support' });
  });

  it('does not reset state when opening support from the popup', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((_queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ activeTabIds: [] });
      return Promise.resolve({ activeTabIds: [] });
    }) as never);
    await import('./index');
    document.querySelector<HTMLAnchorElement>('#supportLink')?.click();
    document.querySelector<HTMLButtonElement>('#resetExtension')?.click();

    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://www.chatenhancer.com/support' });
    expect(chrome.storage.local.clear).not.toHaveBeenCalled();
    expect(chrome.storage.sync.clear).not.toHaveBeenCalled();
  });

  it('opens landing and source links from the popup', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((_queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');
    document.querySelector<HTMLAnchorElement>('#landingLink')?.click();
    document.querySelector<HTMLAnchorElement>('#sourceCodeLink')?.click();

    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://chatenhancer.com' });
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://www.chatenhancer.com/source' });
  });

  it('switches to bookmarks and manages marked users', async () => {
    await chrome.storage.local.set({
      [MARKED_USERS_STORAGE_KEY]: {
        'channel:viewer-channel': {
          authorName: '@ViewerOne',
          avatarUrl: 'https://yt3.ggpht.com/avatar=s88-c-k',
          channelId: 'viewer-channel',
          markedAt: 1_700_000_000_000,
          markedSourceTitle: 'Example stream',
          markedSourceUrl: 'https://www.youtube.com/watch?v=stream-a'
        }
      }
    });
    vi.mocked(chrome.tabs.query).mockImplementation(((_queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');

    expect(document.querySelector<HTMLElement>('#settingsPanel')?.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>('#bookmarksPanel')?.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('#playgroundPanel')?.hidden).toBe(true);
    document.querySelector<HTMLButtonElement>('#bookmarksTab')?.click();

    expect(document.querySelector<HTMLButtonElement>('#bookmarksTab')?.getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector<HTMLElement>('#settingsPanel')?.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('#bookmarksPanel')?.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>('#playgroundPanel')?.hidden).toBe(true);
    expect(document.querySelector('#bookmarksCount')?.textContent).toBe('bookmarkedUsersCount:1');
    expect(document.querySelector('.bookmark-name')?.textContent).toBe('@ViewerOne');
    expect(document.querySelector<HTMLImageElement>('.bookmark-avatar img')?.src).toBe('https://yt3.ggpht.com/avatar=s88-c-k');
    expect(document.querySelector('.bookmark-avatar-open-icon')).not.toBeNull();
    expect(document.querySelector('.bookmark-date')?.textContent).toContain('markedUserDate:');
    expect(document.querySelector('.bookmark-source')?.textContent).toBe('Example stream');
    expect(document.querySelector('.bookmark-source-button')?.textContent).toBe('Example stream');
    expect(document.querySelector<HTMLButtonElement>('.bookmark-source-button')?.title).toBe('openStreamInNewWindow:Example stream');
    expect(document.querySelector('.bookmark-name-button')).toBeNull();

    document.querySelector<HTMLButtonElement>('.bookmark-avatar-button')?.click();
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://www.youtube.com/channel/viewer-channel' });
    document.querySelector<HTMLButtonElement>('.bookmark-source-button')?.click();
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://www.youtube.com/watch?v=stream-a' });

    const actionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.bookmark-action-button'));
    expect(actionButtons).toHaveLength(1);
    actionButtons[0]?.click();
    await expect(chrome.storage.local.get(MARKED_USERS_STORAGE_KEY)).resolves.toEqual({
      [MARKED_USERS_STORAGE_KEY]: {}
    });
    expect(document.querySelector('.bookmark-row')?.classList.contains('bookmark-row-unmarked')).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('.bookmark-action-button')?.title).toBe('bookmarkUser');

    document.querySelector<HTMLButtonElement>('.bookmark-action-button')?.click();
    await expect(chrome.storage.local.get(MARKED_USERS_STORAGE_KEY)).resolves.toEqual({
      [MARKED_USERS_STORAGE_KEY]: {
        'channel:viewer-channel': {
          authorName: '@ViewerOne',
          avatarUrl: 'https://yt3.ggpht.com/avatar=s88-c-k',
          channelId: 'viewer-channel',
          markedAt: 1_700_000_000_000,
          markedSourceTitle: 'Example stream',
          markedSourceUrl: 'https://www.youtube.com/watch?v=stream-a'
        }
      }
    });
    expect(document.querySelector('.bookmark-row')?.classList.contains('bookmark-row-unmarked')).toBe(false);
  });

  it('renders bookmark fallback rows, profile handles, and storage-change refreshes', async () => {
    await chrome.storage.local.set({
      [MARKED_USERS_STORAGE_KEY]: {
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
    vi.mocked(chrome.tabs.query).mockImplementation(((_queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
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
    expect(rows[0].querySelector('.bookmark-source')?.textContent).toBe('https://www.youtube.com/watch?v=stream-a');
    expect(rows[1].querySelector('.bookmark-source')?.textContent).toBe('No channel stream');
    expect(rows[2].querySelector('.bookmark-source')?.textContent).toBe('unknownStream');
    expect(rows[0].querySelector('.bookmark-source-button')).not.toBeNull();
    expect(rows[1].querySelector('.bookmark-source-button')).toBeNull();
    expect(rows[2].querySelector('.bookmark-source-button')).toBeNull();
    expect(rows[2].querySelector('.bookmark-date')?.textContent).toBe('markedDateUnknown');

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

    expect(rows[0].querySelector('.bookmark-name-button')).toBeNull();
    rows[0].querySelector<HTMLButtonElement>('.bookmark-source-button')?.click();
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://www.youtube.com/watch?v=stream-a' });

    const storageListener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls.at(-1)?.[0];
    storageListener?.({
      [MARKED_USERS_STORAGE_KEY]: {
        newValue: {
          'author:@freshuser': {
            authorName: '@FreshUser',
            markedAt: 3_000
          }
        }
      } as chrome.storage.StorageChange
    }, 'sync');
    expect(document.querySelector('.bookmark-name')?.textContent).toBe('@AlphaUser');

    storageListener?.({
      [MARKED_USERS_STORAGE_KEY]: {
        newValue: {
          'author:@freshuser': {
            authorName: '@FreshUser',
            markedAt: 3_000
          }
        }
      } as chrome.storage.StorageChange
    }, 'local');
    expect(document.querySelector('.bookmark-name')?.textContent).toBe('@FreshUser');
  });

  it('does not make chat-frame bookmark source urls clickable', async () => {
    await chrome.storage.local.set({
      [MARKED_USERS_STORAGE_KEY]: {
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
    vi.mocked(chrome.tabs.query).mockImplementation(((_queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
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
      [MARKED_USERS_STORAGE_KEY]: {
        'author:@vanishinguser': {
          authorName: '@VanishingUser',
          markedAt: 2_000
        }
      }
    });
    vi.mocked(chrome.tabs.query).mockImplementation(((_queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');
    vi.mocked(chrome.storage.local.get).mockImplementationOnce(((keys: unknown, callback?: (items: Record<string, unknown>) => void) => {
      const result = typeof keys === 'object' && keys !== null ? keys as Record<string, unknown> : {};
      callback?.(result);
      return Promise.resolve(result);
    }) as never);
    document.querySelector<HTMLButtonElement>('.bookmark-action-button')?.click();

    expect(document.querySelector('.bookmark-row')).toBeNull();
    await expect(chrome.storage.local.get(MARKED_USERS_STORAGE_KEY)).resolves.toEqual({
      [MARKED_USERS_STORAGE_KEY]: {}
    });
  });

  it('localizes text, titles, aria labels, and browser UI language', async () => {
    document.body.innerHTML += `
      <span data-i18n="translation"></span>
      <button data-i18n-title="openChannel"></button>
      <button data-i18n-aria-label="close"></button>
      <span data-i18n="">unchanged text</span>
      <button data-i18n-title="" title="unchanged title"></button>
      <button data-i18n-aria-label="" aria-label="unchanged label"></button>
    `;
    vi.mocked(chrome.i18n.getUILanguage).mockReturnValue('es-ES');
    vi.mocked(chrome.tabs.query).mockImplementation(((_queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');

    expect(document.documentElement.lang).toBe('es-ES');
    expect(document.querySelector('[data-i18n="translation"]')?.textContent).toBe('translation');
    expect(document.querySelector('[data-i18n="playgroundProfileHelper"]')?.textContent).toBe('playgroundProfileHelper');
    expect(document.querySelector('[data-i18n-title="openChannel"]')?.getAttribute('title')).toBe('openChannel');
    expect(document.querySelector('[data-i18n-aria-label="close"]')?.getAttribute('aria-label')).toBe('close');
    expect(document.querySelector('[data-i18n=""]')?.textContent).toBe('unchanged text');
    expect(document.querySelector('[data-i18n-title=""]')?.getAttribute('title')).toBe('unchanged title');
    expect(document.querySelector('[data-i18n-aria-label=""]')?.getAttribute('aria-label')).toBe('unchanged label');
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
    vi.mocked(chrome.tabs.query).mockImplementation(((_queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    try {
      await import('./index');

      expect(document.documentElement.lang).toBe('pt-BR');
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

  it('updates option controls and animates enabled option icons', async () => {
    vi.useFakeTimers();
    document.body.innerHTML += `
      <svg class="translation-target-icon"></svg>
      <svg class="translation-display-icon"></svg>
      <svg class="sound-icon"></svg>
      <svg class="startup-effect-icon"></svg>
    `;
    await chrome.storage.sync.set({
      lastTranslationTarget: 'ko',
      playgroundEnabled: true,
      playgroundGamesAvailable: true,
      sound: false,
      startupEffect: true,
      targetLanguage: 'ja',
      translationDisplay: 'below'
    });
    vi.mocked(chrome.tabs.query).mockImplementation(((_queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((message: unknown, callback?: (response: unknown) => void) => {
      const response = typeof message === 'object' &&
        message !== null &&
        (message as { type?: string }).type === 'ytcq:playground:get-profile'
        ? { ok: true, profile: { displayName: 'Player TEST', userId: 'test-user', wins: 7 } }
        : { activeTabIds: [] };
      callback?.(response);
      return Promise.resolve(response);
    }) as never);

    await import('./index');
    const targetLanguage = document.querySelector<HTMLSelectElement>('#targetLanguage')!;
    const translationDisplay = document.querySelector<HTMLSelectElement>('#translationDisplay')!;
    const sound = document.querySelector<HTMLInputElement>('#sound')!;
    const startupEffect = document.querySelector<HTMLInputElement>('#startupEffect')!;
    const playgroundEnabled = document.querySelector<HTMLInputElement>('#playgroundEnabled')!;
    const playgroundProfile = document.querySelector<HTMLElement>('#playgroundProfile')!;
    const playgroundProfileAvatar = document.querySelector<HTMLElement>('#playgroundProfileAvatar')!;
    const playgroundProfileDetails = document.querySelector<HTMLElement>('#playgroundProfileDetails')!;
    const playgroundProfileName = document.querySelector<HTMLElement>('#playgroundProfileName')!;
    const playgroundProfileToggle = document.querySelector<HTMLButtonElement>('#playgroundProfileToggle')!;
    const playgroundProfileWins = document.querySelector<HTMLElement>('#playgroundProfileWins')!;
    const playgroundProfileWinsCount = document.querySelector<HTMLElement>('#playgroundProfileWinsCount')!;
    const playgroundGamesSection = document.querySelector<HTMLElement>('#playgroundGamesSection')!;
    const playgroundGamesAvailable = document.querySelector<HTMLInputElement>('#playgroundGamesAvailable')!;

    expect(targetLanguage.value).toBe('ja');
    expect(translationDisplay.value).toBe('below');
    expect(sound.checked).toBe(false);
    expect(startupEffect.checked).toBe(true);
    expect(playgroundEnabled.checked).toBe(true);
    expect(playgroundProfile.hidden).toBe(false);
    expect(playgroundProfileDetails.hidden).toBe(true);
    expect(playgroundProfileAvatar.textContent).toBe('T');
    expect(playgroundProfileAvatar.style.getPropertyValue('--playground-profile-avatar-bg')).toBe('hsl(11 62% 28%)');
    expect(playgroundProfileName.textContent).toBe('Player TEST');
    expect(playgroundProfileWins.title).toBe('playgroundWins: 7');
    expect(playgroundProfileWins.getAttribute('aria-label')).toBe('playgroundWins: 7');
    expect(playgroundProfileWinsCount.textContent).toBe('7');
    expect(playgroundGamesSection.hidden).toBe(false);
    expect(playgroundGamesAvailable.checked).toBe(true);

    playgroundProfileToggle.click();
    expect(playgroundProfileToggle.getAttribute('aria-expanded')).toBe('true');
    expect(playgroundProfileDetails.hidden).toBe(false);
    playgroundProfileToggle.click();
    expect(playgroundProfileToggle.getAttribute('aria-expanded')).toBe('false');
    expect(playgroundProfileDetails.hidden).toBe(true);
    playgroundProfileToggle.click();

    targetLanguage.value = '';
    targetLanguage.dispatchEvent(new Event('change', { bubbles: true }));
    expect(chrome.storage.sync.set).toHaveBeenLastCalledWith(expect.objectContaining({
      lastTranslationTarget: 'ko',
      targetLanguage: ''
    }));

    targetLanguage.value = 'fr';
    targetLanguage.dispatchEvent(new Event('change', { bubbles: true }));
    translationDisplay.value = 'replace';
    translationDisplay.dispatchEvent(new Event('change', { bubbles: true }));
    sound.checked = true;
    sound.dispatchEvent(new Event('change', { bubbles: true }));
    startupEffect.checked = true;
    startupEffect.dispatchEvent(new Event('change', { bubbles: true }));
    playgroundEnabled.checked = false;
    playgroundEnabled.dispatchEvent(new Event('change', { bubbles: true }));

    expect(document.querySelector('.translation-target-icon')?.classList.contains('ytcq-translation-pulse')).toBe(true);
    expect(document.querySelector('.translation-display-icon')?.classList.contains('ytcq-display-reflow')).toBe(true);
    expect(document.querySelector('.sound-icon')?.classList.contains('ytcq-bell-ringing')).toBe(true);
    expect(document.querySelector('.startup-effect-icon')?.classList.contains('ytcq-sparkle-burst')).toBe(true);
    expect(playgroundGamesSection.hidden).toBe(false);
    expect(playgroundGamesSection.classList.contains('playground-group-collapsed')).toBe(true);
    expect(playgroundProfile.hidden).toBe(true);
    expect(playgroundProfileDetails.hidden).toBe(true);
    expect(playgroundProfileToggle.getAttribute('aria-expanded')).toBe('false');
    expect(playgroundProfileAvatar.textContent).toBe('');
    expect(playgroundProfileAvatar.style.getPropertyValue('--playground-profile-avatar-bg')).toBe('');
    expect(playgroundProfileName.textContent).toBe('');
    expect(playgroundProfileWins.title).toBe('playgroundWins: 0');
    expect(playgroundProfileWins.getAttribute('aria-label')).toBe('playgroundWins: 0');
    expect(playgroundProfileWinsCount.textContent).toBe('0');
    expect(playgroundGamesAvailable.checked).toBe(false);
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      playgroundEnabled: false,
      playgroundGamesAvailable: false
    });
    playgroundGamesAvailable.checked = true;
    playgroundGamesAvailable.dispatchEvent(new Event('change', { bubbles: true }));
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      playgroundGamesAvailable: true
    });
    await vi.advanceTimersByTimeAsync(180);
    expect(playgroundGamesSection.hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(document.querySelector('.startup-effect-icon')?.classList.contains('ytcq-sparkle-burst')).toBe(false);
  });

  it('ignores stale, failed, and blank Playground profile responses', async () => {
    type RuntimeCallback = (response: unknown) => void;
    const profileCallbacks: RuntimeCallback[] = [];
    await chrome.storage.sync.set({
      playgroundEnabled: true
    });
    vi.mocked(chrome.tabs.query).mockImplementation(((_queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((message: unknown, callback?: RuntimeCallback) => {
      if (typeof message === 'object' &&
        message !== null &&
        (message as { type?: string }).type === 'ytcq:playground:get-profile') {
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

  it('lets the Playground helper text toggle while the helper link stays a link', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((_queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');
    const playgroundEnabled = document.querySelector<HTMLInputElement>('#playgroundEnabled')!;
    const helper = document.querySelector<HTMLElement>('#playgroundHelper')!;
    const helperLink = document.querySelector<HTMLAnchorElement>('.option-helper-link')!;

    expect(playgroundEnabled.checked).toBe(false);
    helper.click();
    expect(playgroundEnabled.checked).toBe(true);

    const linkClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    helperLink.dispatchEvent(linkClick);
    expect(linkClick.defaultPrevented).toBe(false);
    expect(playgroundEnabled.checked).toBe(true);
  });

  it('does not animate icons and disables startup effect when reduced motion is preferred', async () => {
    installMatchMedia(true);
    document.body.innerHTML += '<svg class="translation-target-icon"></svg>';
    await chrome.storage.sync.set({
      startupEffect: true
    });
    vi.mocked(chrome.tabs.query).mockImplementation(((_queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');
    const targetLanguage = document.querySelector<HTMLSelectElement>('#targetLanguage')!;
    targetLanguage.value = 'ja';
    targetLanguage.dispatchEvent(new Event('change', { bubbles: true }));

    expect(document.querySelector<HTMLInputElement>('#startupEffect')?.disabled).toBe(true);
    expect(document.querySelector<HTMLInputElement>('#startupEffect')?.checked).toBe(false);
    expect(document.querySelector('.translation-target-icon')?.classList.contains('ytcq-translation-pulse')).toBe(false);
  });

  it('falls back to static language labels and skips missing animation icons', async () => {
    vi.useFakeTimers();
    const displayNamesSpy = vi.spyOn(Intl, 'DisplayNames').mockImplementation((class {
        of(): string {
          throw new Error('display names unavailable');
        }
      }) as never);
    await chrome.storage.sync.set({
      sound: false,
      startupEffect: false,
      targetLanguage: '',
      translationDisplay: 'below'
    });
    vi.mocked(chrome.tabs.query).mockImplementation(((_queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');
    const japanese = Array.from(document.querySelectorAll<HTMLOptionElement>('#targetLanguage option'))
      .find((option) => option.value === 'ja');
    expect(japanese?.textContent).toBe('Japanese');

    document.querySelector<HTMLSelectElement>('#translationDisplay')!.value = 'replace';
    document.querySelector<HTMLSelectElement>('#translationDisplay')!.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector<HTMLInputElement>('#sound')!.checked = false;
    document.querySelector<HTMLInputElement>('#sound')!.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector<HTMLInputElement>('#startupEffect')!.checked = false;
    document.querySelector<HTMLInputElement>('#startupEffect')!.dispatchEvent(new Event('change', { bubbles: true }));

    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ translationDisplay: 'replace' });
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ sound: false });
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ startupEffect: false });
    displayNamesSpy.mockRestore();
  });

  it('resets extension storage, updates controls, broadcasts page reset, and alerts completion', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      const tabs = queryInfo.active
        ? [{ id: 10 } as chrome.tabs.Tab]
        : [{ id: 10 } as chrome.tabs.Tab, { id: undefined } as chrome.tabs.Tab];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ activeTabIds: [] });
      return Promise.resolve({ activeTabIds: [] });
    }) as never);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);

    await import('./index');
    document.querySelector<HTMLSelectElement>('#targetLanguage')!.value = 'ja';
    document.querySelector<HTMLInputElement>('#sound')!.checked = false;
    document.querySelector<HTMLButtonElement>('#resetExtension')?.click();

    expect(chrome.storage.local.clear).toHaveBeenCalled();
    expect(chrome.storage.sync.clear).toHaveBeenCalled();
    expect(chrome.storage.sync.set).toHaveBeenCalledWith(expect.objectContaining({
      sound: true,
      targetLanguage: ''
    }), expect.any(Function));
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(10, { type: 'ytcq:reset-page' }, expect.any(Function));
    expect(window.alert).toHaveBeenCalledWith('popupResetComplete');
    expect(document.querySelector<HTMLInputElement>('#sound')?.checked).toBe(true);
    expect(document.querySelector<HTMLSelectElement>('#targetLanguage')?.value).toBe('');
  });

  it('completes reset immediately when there are no tab ids to notify', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      const tabs = queryInfo.active ? [] : [{ id: undefined } as chrome.tabs.Tab];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);

    await import('./index');
    document.querySelector<HTMLButtonElement>('#resetExtension')?.click();

    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith('popupResetComplete');
  });

  it('waits for every tab reset response before reporting completion', async () => {
    const resetCallbacks: (() => void)[] = [];
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      const tabs = queryInfo.active
        ? [{ id: 10 } as chrome.tabs.Tab]
        : [{ id: 10 } as chrome.tabs.Tab, { id: 20 } as chrome.tabs.Tab];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ activeTabIds: [] });
      return Promise.resolve({ activeTabIds: [] });
    }) as never);
    vi.mocked(chrome.tabs.sendMessage).mockImplementation(((_tabId: number, _message: unknown, callback?: () => void) => {
      resetCallbacks.push(() => callback?.());
      return Promise.resolve();
    }) as never);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);

    await import('./index');
    document.querySelector<HTMLButtonElement>('#resetExtension')?.click();

    expect(resetCallbacks).toHaveLength(2);
    expect(window.alert).not.toHaveBeenCalled();

    resetCallbacks[0]();
    expect(window.alert).not.toHaveBeenCalled();

    resetCallbacks[1]();
    expect(window.alert).toHaveBeenCalledWith('popupResetComplete');
  });

  it('skips popup wiring when required controls are missing', async () => {
    document.body.innerHTML = '<section data-extension-status></section>';
    vi.mocked(chrome.tabs.query).mockImplementation(((_queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
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
