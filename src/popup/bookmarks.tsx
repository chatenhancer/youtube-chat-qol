import {
  BOOKMARK_FILLED_ICON_PATH,
  BOOKMARK_ICON_PATH,
  createOpenInNewIcon,
  createSvgIcon,
  MATERIAL_ICON_VIEW_BOX
} from '../shared/icons';
import { jsx, el } from '../shared/jsx-dom';
import {
  BOOKMARKS_STORAGE_KEY,
  LEGACY_BOOKMARKS_STORAGE_KEY,
  getBookmarkAuthorColor,
  normalizeStoredBookmarks,
  serializeBookmarks,
  type BookmarkRecord
} from '../shared/bookmarks';
import { appendRichMessageText } from '../youtube/rich-text';
import { controls } from './controls';
import { getExtensionMessage } from './i18n';

const recentlyRemovedBookmarks = new Map<string, BookmarkRecord>();

export function initBookmarksPanel(): void {
  const { bookmarksCount, bookmarksList } = controls;
  if (!bookmarksCount || !bookmarksList) return;

  refreshBookmarks();
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[BOOKMARKS_STORAGE_KEY]) {
      renderBookmarks(normalizeStoredBookmarks(changes[BOOKMARKS_STORAGE_KEY].newValue));
    }
  });
}

function refreshBookmarks(): void {
  chrome.storage.local.get([BOOKMARKS_STORAGE_KEY, LEGACY_BOOKMARKS_STORAGE_KEY], (stored) => {
    const values = stored || {};
    const hasBookmarks = Object.hasOwn(values, BOOKMARKS_STORAGE_KEY);
    const hasLegacyBookmarks = Object.hasOwn(values, LEGACY_BOOKMARKS_STORAGE_KEY);
    const records = normalizeStoredBookmarks(
      hasBookmarks ? values[BOOKMARKS_STORAGE_KEY] : values[LEGACY_BOOKMARKS_STORAGE_KEY]
    );
    renderBookmarks(records);

    if (hasBookmarks) {
      if (hasLegacyBookmarks) chrome.storage.local.remove(LEGACY_BOOKMARKS_STORAGE_KEY);
      return;
    }

    chrome.storage.local.set({ [BOOKMARKS_STORAGE_KEY]: serializeBookmarks(records) }, () => {
      const migrationError = chrome.runtime.lastError;
      if (!migrationError && hasLegacyBookmarks) {
        chrome.storage.local.remove(LEGACY_BOOKMARKS_STORAGE_KEY);
      }
    });
  });
}

function renderBookmarks(records: Map<string, BookmarkRecord>): void {
  if (!controls.bookmarksCount || !controls.bookmarksList) return;

  const entries = getVisibleBookmarkEntries(records).sort((firstEntry, secondEntry) => {
    const firstTime = Number.isFinite(firstEntry.record.savedAt) ? firstEntry.record.savedAt : 0;
    const secondTime = Number.isFinite(secondEntry.record.savedAt) ? secondEntry.record.savedAt : 0;
    return (
      secondTime - firstTime ||
      firstEntry.record.authorName.localeCompare(secondEntry.record.authorName)
    );
  });

  controls.bookmarksCount.textContent = records.size
    ? getExtensionMessage('bookmarksCount', String(records.size))
    : getExtensionMessage('noBookmarks');
  controls.bookmarksList.replaceChildren();
  controls.bookmarksList.classList.toggle('bookmarks-list-empty', entries.length === 0);

  if (!entries.length) {
    controls.bookmarksList.append(
      el<HTMLParagraphElement>(
        <p class="bookmarks-empty">{getExtensionMessage('bookmarksEmpty')}</p>
      )
    );
    return;
  }

  controls.bookmarksList.append(
    ...entries.map(({ key, record, active }) => createBookmarkRow(key, record, active))
  );
}

function getVisibleBookmarkEntries(records: Map<string, BookmarkRecord>): Array<{
  active: boolean;
  key: string;
  record: BookmarkRecord;
}> {
  const entries = Array.from(records.entries()).map(([key, record]) => {
    recentlyRemovedBookmarks.delete(key);
    return { active: true, key, record };
  });

  recentlyRemovedBookmarks.forEach((record, key) => {
    if (!records.has(key)) entries.push({ active: false, key, record });
  });

  return entries;
}

function createBookmarkRow(key: string, record: BookmarkRecord, active: boolean): HTMLElement {
  const channelUrl = getBookmarkChannelUrl(record);
  const avatar = createBookmarkAvatar(record, channelUrl);
  const copy = el<HTMLSpanElement>(<span class="bookmark-copy" />);
  copy.append(createBookmarkHeader(record));

  if (record.message) {
    const message = el<HTMLDivElement>(<div class="bookmark-message" dir="auto" />);
    appendRichMessageText(message, record.message.text, [], record.message.contentParts);
    copy.append(message);
  }

  copy.append(createBookmarkMetadata(record));
  const actionLabel = getExtensionMessage(active ? 'removeBookmark' : 'restoreBookmark');
  const actionButton = el<HTMLButtonElement>(
    <button
      type="button"
      class="bookmark-action-button"
      title={actionLabel}
      aria-label={actionLabel}
      onClick={() => {
        if (active) {
          removeBookmark(key);
        } else {
          restoreBookmark(key, record);
        }
      }}
    >
      {createSvgIcon(
        MATERIAL_ICON_VIEW_BOX,
        active ? BOOKMARK_FILLED_ICON_PATH : BOOKMARK_ICON_PATH
      )}
    </button>
  );

  return el<HTMLElement>(
    <article class={`bookmark-row${active ? '' : ' bookmark-row-removed'}`}>
      {avatar}
      {copy}
      <span class="bookmark-actions">{actionButton}</span>
    </article>
  );
}

function createBookmarkHeader(record: BookmarkRecord): HTMLElement {
  const header = el<HTMLSpanElement>(<span class="bookmark-message-header" />);
  header.append(
    el<HTMLElement>(
      <strong class="bookmark-name" dir="auto">
        {record.authorName || getExtensionMessage('unknownUser')}
      </strong>
    )
  );
  const postedTime = createBookmarkPostedTime(record.message);
  if (postedTime) header.append(postedTime);
  return header;
}

function createBookmarkAvatar(record: BookmarkRecord, channelUrl: string): HTMLElement {
  const content = record.avatarUrl ? (
    <img src={record.avatarUrl} alt="" referrerPolicy="no-referrer" />
  ) : (
    getBookmarkAuthorInitial(record.authorName)
  );
  const element = channelUrl
    ? el<HTMLButtonElement>(
        <button
          type="button"
          class="bookmark-avatar bookmark-avatar-button"
          title={getExtensionMessage('openChannel')}
          aria-label={getExtensionMessage('openChannel')}
          onClick={() => chrome.tabs.create({ url: channelUrl })}
        >
          {content}
          {createBookmarkAvatarOpenIcon()}
        </button>
      )
    : el<HTMLSpanElement>(<span class="bookmark-avatar">{content}</span>);
  element.style.setProperty('--bookmark-author-color', getBookmarkAuthorColor(record));
  return element;
}

function createBookmarkAvatarOpenIcon(): SVGSVGElement {
  const icon = createOpenInNewIcon();
  icon.classList.add('bookmark-avatar-open-icon');
  return icon;
}

function createBookmarkMetadata(record: BookmarkRecord): HTMLElement {
  const metadata = el<HTMLSpanElement>(<span class="bookmark-metadata" />);
  metadata.append(createBookmarkSource(record));
  return metadata;
}

function createBookmarkPostedTime(message: BookmarkRecord['message']): HTMLElement | null {
  if (!message) return null;

  const timestamp = Number(message.timestamp);
  const hasTimestamp = Number.isFinite(timestamp) && timestamp > 0;
  const compactTime = hasTimestamp ? formatCompactTime(timestamp) : message.timestampText.trim();
  if (!compactTime) return null;

  const fullPostedTime = hasTimestamp ? formatFullDateTime(timestamp) : compactTime;
  const tooltip = getExtensionMessage('bookmarkMessagePostedDate', fullPostedTime);
  const time = el<HTMLTimeElement>(
    <time class="bookmark-message-time" title={tooltip} aria-label={tooltip}>
      {compactTime}
    </time>
  );
  if (hasTimestamp) time.dateTime = new Date(timestamp).toISOString();
  return time;
}

function createBookmarkSource(record: BookmarkRecord): HTMLElement {
  const sourceText = record.sourceTitle || record.sourceUrl || getExtensionMessage('unknownStream');
  const sourceUrl = getBookmarkSourceUrl(record);

  if (sourceUrl) {
    const tooltip = getExtensionMessage('openStreamInNewWindow', sourceText);
    return el<HTMLButtonElement>(
      <button
        type="button"
        class="bookmark-source bookmark-source-button"
        title={tooltip}
        aria-label={tooltip}
        onClick={() => chrome.tabs.create({ url: sourceUrl })}
      >
        <span class="bookmark-source-label">{sourceText}</span>
        {createOpenInNewIcon()}
      </button>
    );
  }

  return el<HTMLSpanElement>(
    <span class="bookmark-source" title={sourceText}>
      {sourceText}
    </span>
  );
}

function removeBookmark(key: string): void {
  updateStoredBookmarks((records) => {
    const record = records.get(key);
    if (record) recentlyRemovedBookmarks.set(key, record);
    records.delete(key);
  });
}

function restoreBookmark(key: string, record: BookmarkRecord): void {
  updateStoredBookmarks((records) => {
    records.set(key, record);
    recentlyRemovedBookmarks.delete(key);
  });
}

function updateStoredBookmarks(update: (records: Map<string, BookmarkRecord>) => void): void {
  chrome.storage.local.get({ [BOOKMARKS_STORAGE_KEY]: {} }, (stored) => {
    const records = normalizeStoredBookmarks((stored || {})[BOOKMARKS_STORAGE_KEY]);
    update(records);
    chrome.storage.local.set({ [BOOKMARKS_STORAGE_KEY]: serializeBookmarks(records) }, () =>
      renderBookmarks(records)
    );
  });
}

function getBookmarkAuthorInitial(authorName: string): string {
  const normalized = authorName.trim().replace(/^@/, '');
  return (normalized[0] || '?').toUpperCase();
}

function formatFullDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(timestamp);
}

function formatCompactTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  }).format(timestamp);
}

function getBookmarkChannelUrl(record: BookmarkRecord): string {
  if (record.channelId) {
    return `https://www.youtube.com/channel/${encodeURIComponent(record.channelId)}`;
  }

  const handle = record.authorName.trim().replace(/^@/, '');
  return /^[A-Za-z0-9._-]+$/.test(handle) ? `https://www.youtube.com/@${handle}` : '';
}

function getBookmarkSourceUrl(record: BookmarkRecord): string {
  const sourceUrl = (record.sourceUrl || '').trim();
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
