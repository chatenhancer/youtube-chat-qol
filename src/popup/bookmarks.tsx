import {
  BOOKMARK_FILLED_ICON_PATH,
  BOOKMARK_ICON_PATH,
  createOpenInNewIcon,
  createSvgIcon,
  MATERIAL_ICON_VIEW_BOX
} from '../shared/icons';
import { jsx, el } from '../shared/jsx-dom';
import {
  getMarkedUserColor,
  MARKED_USERS_STORAGE_KEY,
  normalizeStoredMarkedUsers,
  serializeMarkedUsers,
  type MarkedUserRecord
} from '../shared/marked-users';
import { controls } from './controls';
import { getExtensionMessage } from './i18n';

const recentlyUnmarkedBookmarks = new Map<string, MarkedUserRecord>();

export function initBookmarksPanel(): void {
  if (!controls.bookmarksCount || !controls.bookmarksList) return;

  refreshBookmarkedUsers();
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[MARKED_USERS_STORAGE_KEY]) {
      renderBookmarkedUsers(normalizeStoredMarkedUsers(changes[MARKED_USERS_STORAGE_KEY].newValue));
    }
  });
}

function refreshBookmarkedUsers(): void {
  chrome.storage.local.get({ [MARKED_USERS_STORAGE_KEY]: {} }, (stored) => {
    renderBookmarkedUsers(normalizeStoredMarkedUsers((stored || {})[MARKED_USERS_STORAGE_KEY]));
  });
}

function renderBookmarkedUsers(records: Map<string, MarkedUserRecord>): void {
  if (!controls.bookmarksCount || !controls.bookmarksList) return;

  const entries = getVisibleBookmarkedUserEntries(records).sort((firstEntry, secondEntry) => {
    const first = firstEntry.record;
    const second = secondEntry.record;
    const firstTime = Number.isFinite(first.markedAt) ? first.markedAt : 0;
    const secondTime = Number.isFinite(second.markedAt) ? second.markedAt : 0;
    return secondTime - firstTime || first.authorName.localeCompare(second.authorName);
  });

  controls.bookmarksCount.textContent = entries.length
    ? getExtensionMessage('bookmarkedUsersCount', String(entries.length))
    : getExtensionMessage('noBookmarkedUsers');
  controls.bookmarksList.replaceChildren();
  controls.bookmarksList.classList.toggle('bookmarks-list-empty', entries.length === 0);

  if (!entries.length) {
    controls.bookmarksList.append(
      el<HTMLParagraphElement>(
        <p class="bookmarks-empty">{getExtensionMessage('bookmarkedUsersEmpty')}</p>
      )
    );
    return;
  }

  controls.bookmarksList.append(
    ...entries.map(({ key, record, active }) => createBookmarkedUserRow(key, record, active))
  );
}

function getVisibleBookmarkedUserEntries(records: Map<string, MarkedUserRecord>): Array<{
  active: boolean;
  key: string;
  record: MarkedUserRecord;
}> {
  const entries = Array.from(records.entries()).map(([key, record]) => {
    recentlyUnmarkedBookmarks.delete(key);
    return { active: true, key, record };
  });

  recentlyUnmarkedBookmarks.forEach((record, key) => {
    if (!records.has(key)) entries.push({ active: false, key, record });
  });

  return entries;
}

function createBookmarkedUserRow(
  key: string,
  record: MarkedUserRecord,
  active: boolean
): HTMLElement {
  const channelUrl = getBookmarkedUserChannelUrl(record);
  const avatar = createBookmarkedUserAvatar(record, channelUrl);
  const name = createBookmarkedUserName(record);
  const source = createBookmarkedUserSource(record);
  const actionLabel = getExtensionMessage(active ? 'removeBookmark' : 'bookmarkUser');
  const unmarkButton = el<HTMLButtonElement>(
    <button
      type="button"
      class="bookmark-action-button"
      title={actionLabel}
      aria-label={actionLabel}
    >
      {createSvgIcon(
        MATERIAL_ICON_VIEW_BOX,
        active ? BOOKMARK_FILLED_ICON_PATH : BOOKMARK_ICON_PATH
      )}
    </button>
  );
  unmarkButton.addEventListener('click', () => {
    if (active) {
      unmarkBookmarkedUser(key);
    } else {
      markBookmarkedUser(key, record);
    }
  });

  return el<HTMLElement>(
    <article class={`bookmark-row${active ? '' : ' bookmark-row-unmarked'}`}>
      {avatar}
      <span class="bookmark-copy">
        {name}
        <span class="bookmark-date">{formatBookmarkedUserDate(record.markedAt)}</span>
        {source}
      </span>
      <span class="bookmark-actions">{unmarkButton}</span>
    </article>
  );
}

function createBookmarkedUserAvatar(record: MarkedUserRecord, channelUrl: string): HTMLElement {
  const content = record.avatarUrl ? (
    <img src={record.avatarUrl} alt="" referrerPolicy="no-referrer" />
  ) : (
    getBookmarkedUserInitial(record.authorName)
  );

  const element = channelUrl
    ? el<HTMLButtonElement>(
        <button
          type="button"
          class="bookmark-avatar bookmark-avatar-button"
          title={getExtensionMessage('openChannel')}
          aria-label={getExtensionMessage('openChannel')}
        >
          {content}
          {createBookmarkedUserAvatarOpenIcon()}
        </button>
      )
    : el<HTMLSpanElement>(<span class="bookmark-avatar">{content}</span>);
  element.style.setProperty('--bookmark-user-color', getMarkedUserColor(record));

  if (channelUrl && element instanceof HTMLButtonElement) {
    element.addEventListener('click', () => {
      chrome.tabs.create({ url: channelUrl });
    });
  }

  return element;
}

function createBookmarkedUserAvatarOpenIcon(): SVGSVGElement {
  const icon = createOpenInNewIcon();
  icon.classList.add('bookmark-avatar-open-icon');
  return icon;
}

function createBookmarkedUserName(record: MarkedUserRecord): HTMLElement {
  return el<HTMLElement>(
    <strong class="bookmark-name">{record.authorName || getExtensionMessage('unknownUser')}</strong>
  );
}

function createBookmarkedUserSource(record: MarkedUserRecord): HTMLElement {
  const sourceText =
    record.markedSourceTitle || record.markedSourceUrl || getExtensionMessage('unknownStream');
  const sourceUrl = getBookmarkedUserSourceUrl(record);

  if (sourceUrl) {
    const tooltip = getExtensionMessage('openStreamInNewWindow', sourceText);
    const element = el<HTMLButtonElement>(
      <button
        type="button"
        class="bookmark-source bookmark-source-button"
        title={tooltip}
        aria-label={tooltip}
      >
        <span class="bookmark-source-label">{sourceText}</span>
        {createOpenInNewIcon()}
      </button>
    );
    element.addEventListener('click', () => {
      chrome.tabs.create({ url: sourceUrl });
    });
    return element;
  }

  return el<HTMLSpanElement>(<span class="bookmark-source">{sourceText}</span>);
}

function unmarkBookmarkedUser(key: string): void {
  chrome.storage.local.get({ [MARKED_USERS_STORAGE_KEY]: {} }, (stored) => {
    const records = normalizeStoredMarkedUsers((stored || {})[MARKED_USERS_STORAGE_KEY]);
    const record = records.get(key);
    if (record) {
      recentlyUnmarkedBookmarks.set(key, record);
    }
    records.delete(key);
    chrome.storage.local.set({ [MARKED_USERS_STORAGE_KEY]: serializeMarkedUsers(records) }, () => {
      renderBookmarkedUsers(records);
    });
  });
}

function markBookmarkedUser(key: string, record: MarkedUserRecord): void {
  chrome.storage.local.get({ [MARKED_USERS_STORAGE_KEY]: {} }, (stored) => {
    const records = normalizeStoredMarkedUsers((stored || {})[MARKED_USERS_STORAGE_KEY]);
    records.set(key, record);
    recentlyUnmarkedBookmarks.delete(key);
    chrome.storage.local.set({ [MARKED_USERS_STORAGE_KEY]: serializeMarkedUsers(records) }, () => {
      renderBookmarkedUsers(records);
    });
  });
}

function getBookmarkedUserInitial(authorName: string): string {
  const normalized = authorName.trim().replace(/^@/, '');
  return (normalized[0] || '?').toUpperCase();
}

function formatBookmarkedUserDate(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0)
    return getExtensionMessage('markedDateUnknown');

  const formatted = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(timestamp);
  return getExtensionMessage('markedUserDate', formatted);
}

function getBookmarkedUserChannelUrl(record: MarkedUserRecord): string {
  if (record.channelId) {
    return `https://www.youtube.com/channel/${encodeURIComponent(record.channelId)}`;
  }

  const handle = record.authorName.trim().replace(/^@/, '');
  return /^[A-Za-z0-9._-]+$/.test(handle) ? `https://www.youtube.com/@${handle}` : '';
}

function getBookmarkedUserSourceUrl(record: MarkedUserRecord): string {
  const sourceUrl = (record.markedSourceUrl || '').trim();
  if (!sourceUrl) return '';

  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== 'https:' || !isYouTubeSourceHost(url.hostname)) return '';

    const videoId = getSourceVideoId(url);
    return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : '';
  } catch {
    return '';
  }
}

function isYouTubeSourceHost(hostname: string): boolean {
  return /(^|\.)youtube\.com$/i.test(hostname) || /^youtu\.be$/i.test(hostname);
}

function getSourceVideoId(url: URL): string {
  if (/^youtu\.be$/i.test(url.hostname)) {
    return decodeURIComponent(url.pathname.split('/').filter(Boolean)[0] || '').trim();
  }

  return (url.searchParams.get('v') || url.searchParams.get('video_id') || '').trim();
}
