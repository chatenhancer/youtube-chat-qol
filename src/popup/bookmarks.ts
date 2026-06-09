import {
  BOOKMARK_FILLED_ICON_PATH,
  BOOKMARK_ICON_PATH,
  createOpenInNewIcon,
  createSvgIcon,
  MATERIAL_ICON_VIEW_BOX
} from '../shared/icons';
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
    const empty = document.createElement('p');
    empty.className = 'bookmarks-empty';
    empty.textContent = getExtensionMessage('bookmarkedUsersEmpty');
    controls.bookmarksList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  entries.forEach(({ key, record, active }) => {
    fragment.append(createBookmarkedUserRow(key, record, active));
  });
  controls.bookmarksList.append(fragment);
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

function createBookmarkedUserRow(key: string, record: MarkedUserRecord, active: boolean): HTMLElement {
  const row = document.createElement('article');
  row.className = 'bookmark-row';
  row.classList.toggle('bookmark-row-unmarked', !active);

  const channelUrl = getBookmarkedUserChannelUrl(record);
  const avatar = createBookmarkedUserAvatar(record, channelUrl);

  const copy = document.createElement('span');
  copy.className = 'bookmark-copy';

  const name = createBookmarkedUserName(record);

  const date = document.createElement('span');
  date.className = 'bookmark-date';
  date.textContent = formatBookmarkedUserDate(record.markedAt);

  const source = createBookmarkedUserSource(record);

  copy.append(name, date, source);

  const actions = document.createElement('span');
  actions.className = 'bookmark-actions';

  const unmarkButton = document.createElement('button');
  unmarkButton.type = 'button';
  unmarkButton.className = 'bookmark-action-button';
  unmarkButton.title = getExtensionMessage(active ? 'removeBookmark' : 'bookmarkUser');
  unmarkButton.setAttribute('aria-label', getExtensionMessage(active ? 'removeBookmark' : 'bookmarkUser'));
  unmarkButton.append(createSvgIcon(MATERIAL_ICON_VIEW_BOX, active ? BOOKMARK_FILLED_ICON_PATH : BOOKMARK_ICON_PATH));
  unmarkButton.addEventListener('click', () => {
    if (active) {
      unmarkBookmarkedUser(key);
    } else {
      markBookmarkedUser(key, record);
    }
  });
  actions.append(unmarkButton);

  row.append(avatar, copy, actions);
  return row;
}

function createBookmarkedUserAvatar(record: MarkedUserRecord, channelUrl: string): HTMLElement {
  const element = channelUrl ? document.createElement('button') : document.createElement('span');
  element.className = channelUrl ? 'bookmark-avatar bookmark-avatar-button' : 'bookmark-avatar';
  element.style.setProperty('--bookmark-user-color', getMarkedUserColor(record));
  if (record.avatarUrl) {
    const image = document.createElement('img');
    image.src = record.avatarUrl;
    image.alt = '';
    image.referrerPolicy = 'no-referrer';
    element.append(image);
  } else {
    element.textContent = getBookmarkedUserInitial(record.authorName);
  }

  if (channelUrl && element instanceof HTMLButtonElement) {
    element.type = 'button';
    element.title = getExtensionMessage('openChannel');
    element.setAttribute('aria-label', getExtensionMessage('openChannel'));
    element.append(createBookmarkedUserAvatarOpenIcon());
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
  const element = document.createElement('strong');
  element.className = 'bookmark-name';
  element.textContent = record.authorName || getExtensionMessage('unknownUser');
  return element;
}

function createBookmarkedUserSource(record: MarkedUserRecord): HTMLElement {
  const sourceText = record.markedSourceTitle || record.markedSourceUrl || getExtensionMessage('unknownStream');
  const sourceUrl = getBookmarkedUserSourceUrl(record);
  const element = sourceUrl ? document.createElement('button') : document.createElement('span');
  element.className = sourceUrl ? 'bookmark-source bookmark-source-button' : 'bookmark-source';

  if (sourceUrl && element instanceof HTMLButtonElement) {
    const label = document.createElement('span');
    label.className = 'bookmark-source-label';
    label.textContent = sourceText;

    const tooltip = getExtensionMessage('openStreamInNewWindow', sourceText);
    element.type = 'button';
    element.title = tooltip;
    element.setAttribute('aria-label', tooltip);
    element.append(label, createOpenInNewIcon());
    element.addEventListener('click', () => {
      chrome.tabs.create({ url: sourceUrl });
    });
  } else {
    element.textContent = sourceText;
  }

  return element;
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
  if (!Number.isFinite(timestamp) || timestamp <= 0) return getExtensionMessage('markedDateUnknown');

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
