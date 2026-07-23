import {
  BOOKMARK_FILLED_ICON_PATH,
  BOOKMARK_ICON_PATH,
  createAvatarRingIcon,
  createOpenInNewIcon,
  createSvgIcon,
  MATERIAL_ICON_VIEW_BOX
} from '../shared/icons';
import { jsx, el } from '../shared/jsx-dom';
import {
  AVATAR_RINGS_STORAGE_KEY,
  getAvatarRingColor,
  normalizeStoredAvatarRings,
  serializeAvatarRings,
  type AvatarRingRecord
} from '../shared/avatar-rings';
import {
  BOOKMARKS_STORAGE_KEY,
  LEGACY_BOOKMARKS_STORAGE_KEY,
  getBookmarkAuthorColor,
  getBookmarkTargetUrl,
  normalizeStoredBookmarks,
  serializeBookmarks,
  type BookmarkRecord
} from '../shared/bookmarks';
import { appendRichMessageText } from '../youtube/rich-text';
import { controls } from './controls';
import { getExtensionMessage } from './i18n';

const recentlyRemovedBookmarks = new Map<string, BookmarkRecord>();
const recentlyRemovedAvatarRings = new Map<string, AvatarRingRecord>();
let currentBookmarks = new Map<string, BookmarkRecord>();
let currentAvatarRings = new Map<string, AvatarRingRecord>();

type SavedItemEntry =
  | {
      active: boolean;
      key: string;
      kind: 'avatar-ring';
      record: AvatarRingRecord;
    }
  | {
      active: boolean;
      key: string;
      kind: 'bookmark';
      record: BookmarkRecord;
    };

type SavedItemAuthor = Pick<BookmarkRecord, 'authorName' | 'avatarUrl' | 'channelId'>;
type SavedItemSource = Pick<BookmarkRecord, 'sourceTitle' | 'sourceUrl'> & {
  message?: BookmarkRecord['message'];
};

export function initBookmarksPanel(): void {
  const { bookmarksCount, bookmarksList } = controls;
  if (!bookmarksCount || !bookmarksList) return;

  refreshSavedItems();
  chrome.storage.onChanged.addListener(handleSavedItemsStorageChange);
}

function refreshSavedItems(): void {
  chrome.storage.local.get(
    [AVATAR_RINGS_STORAGE_KEY, BOOKMARKS_STORAGE_KEY, LEGACY_BOOKMARKS_STORAGE_KEY],
    (stored) => {
      const values = stored || {};
      const hasBookmarks = Object.hasOwn(values, BOOKMARKS_STORAGE_KEY);
      const hasLegacyBookmarks = Object.hasOwn(values, LEGACY_BOOKMARKS_STORAGE_KEY);
      currentBookmarks = normalizeStoredBookmarks(
        hasBookmarks ? values[BOOKMARKS_STORAGE_KEY] : values[LEGACY_BOOKMARKS_STORAGE_KEY]
      );
      currentAvatarRings = normalizeStoredAvatarRings(values[AVATAR_RINGS_STORAGE_KEY]);
      renderSavedItems();

      if (hasBookmarks) {
        if (hasLegacyBookmarks) chrome.storage.local.remove(LEGACY_BOOKMARKS_STORAGE_KEY);
        return;
      }

      chrome.storage.local.set(
        { [BOOKMARKS_STORAGE_KEY]: serializeBookmarks(currentBookmarks) },
        () => {
          const migrationError = chrome.runtime.lastError;
          if (!migrationError && hasLegacyBookmarks) {
            chrome.storage.local.remove(LEGACY_BOOKMARKS_STORAGE_KEY);
          }
        }
      );
    }
  );
}

function handleSavedItemsStorageChange(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string
): void {
  if (areaName !== 'local') return;

  let changed = false;
  if (changes[BOOKMARKS_STORAGE_KEY]) {
    currentBookmarks = normalizeStoredBookmarks(changes[BOOKMARKS_STORAGE_KEY].newValue);
    changed = true;
  }
  if (changes[AVATAR_RINGS_STORAGE_KEY]) {
    currentAvatarRings = normalizeStoredAvatarRings(changes[AVATAR_RINGS_STORAGE_KEY].newValue);
    changed = true;
  }
  if (changed) renderSavedItems();
}

function renderSavedItems(): void {
  if (!controls.bookmarksCount || !controls.bookmarksList) return;

  const entries = getVisibleSavedItemEntries().sort((firstEntry, secondEntry) => {
    const firstTime = getSavedItemAddedAt(firstEntry);
    const secondTime = getSavedItemAddedAt(secondEntry);
    return (
      secondTime - firstTime ||
      firstEntry.record.authorName.localeCompare(secondEntry.record.authorName) ||
      firstEntry.kind.localeCompare(secondEntry.kind)
    );
  });

  const activeCount = currentBookmarks.size + currentAvatarRings.size;
  controls.bookmarksCount.textContent = activeCount
    ? getExtensionMessage('savedItemsCount', String(activeCount))
    : getExtensionMessage('noSavedItems');
  controls.bookmarksList.replaceChildren();
  controls.bookmarksList.classList.toggle('bookmarks-list-empty', entries.length === 0);

  if (!entries.length) {
    controls.bookmarksList.append(
      el<HTMLParagraphElement>(
        <p class="bookmarks-empty">{getExtensionMessage('savedItemsEmpty')}</p>
      )
    );
    return;
  }

  controls.bookmarksList.append(...entries.map(createSavedItemRow));
}

function getVisibleSavedItemEntries(): SavedItemEntry[] {
  const entries: SavedItemEntry[] = Array.from(currentBookmarks.entries()).map(([key, record]) => {
    recentlyRemovedBookmarks.delete(key);
    return { active: true, key, kind: 'bookmark' as const, record };
  });

  recentlyRemovedBookmarks.forEach((record, key) => {
    if (!currentBookmarks.has(key)) entries.push({ active: false, key, kind: 'bookmark', record });
  });

  currentAvatarRings.forEach((record, key) => {
    recentlyRemovedAvatarRings.delete(key);
    entries.push({ active: true, key, kind: 'avatar-ring', record });
  });

  recentlyRemovedAvatarRings.forEach((record, key) => {
    if (!currentAvatarRings.has(key)) {
      entries.push({ active: false, key, kind: 'avatar-ring', record });
    }
  });

  return entries;
}

function getSavedItemAddedAt(entry: SavedItemEntry): number {
  return entry.kind === 'bookmark' ? entry.record.savedAt : entry.record.addedAt;
}

function createSavedItemRow(entry: SavedItemEntry): HTMLElement {
  return entry.kind === 'bookmark'
    ? createBookmarkRow(entry.key, entry.record, entry.active)
    : createAvatarRingRow(entry.key, entry.record, entry.active);
}

function createBookmarkRow(key: string, record: BookmarkRecord, active: boolean): HTMLElement {
  const channelUrl = getSavedItemChannelUrl(record);
  const avatar = createSavedItemAvatar(record, channelUrl);
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

function createAvatarRingRow(key: string, record: AvatarRingRecord, active: boolean): HTMLElement {
  const channelUrl = getSavedItemChannelUrl(record);
  const avatar = createSavedItemAvatar(record, channelUrl, true);
  const copy = el<HTMLSpanElement>(<span class="bookmark-copy avatar-ring-copy" />);
  copy.append(createAvatarRingHeader(record));
  copy.append(
    el<HTMLSpanElement>(
      <span class="avatar-ring-label">{getExtensionMessage('rememberedUser')}</span>
    )
  );
  copy.append(createSavedItemMetadata(record));

  const actionLabel = getExtensionMessage(active ? 'forgetUser' : 'rememberUser');
  const actionButton = el<HTMLButtonElement>(
    <button
      type="button"
      class="bookmark-action-button avatar-ring-action-button"
      title={actionLabel}
      aria-label={actionLabel}
      onClick={() => {
        if (active) removeAvatarRing(key);
        else restoreAvatarRing(key, record);
      }}
    >
      {createAvatarRingIcon(active)}
    </button>
  );
  const row = el<HTMLElement>(
    <article
      class={`bookmark-row avatar-ring-row${active ? '' : ' bookmark-row-removed avatar-ring-row-removed'}`}
    >
      {avatar}
      {copy}
      <span class="bookmark-actions">{actionButton}</span>
    </article>
  );
  row.style.setProperty('--ytcq-popup-avatar-ring-color', getAvatarRingColor(record));
  return row;
}

function createBookmarkHeader(record: BookmarkRecord): HTMLElement {
  const header = createSavedItemHeader(record.authorName);
  const postedTime = createBookmarkPostedTime(record.message);
  if (postedTime) header.append(postedTime);
  return header;
}

function createAvatarRingHeader(record: AvatarRingRecord): HTMLElement {
  const header = createSavedItemHeader(record.authorName);
  const fullAddedTime = formatFullDateTime(record.addedAt);
  const tooltip = getExtensionMessage('userRememberedDate', fullAddedTime);
  const time = el<HTMLTimeElement>(
    <time
      class="bookmark-message-time avatar-ring-added-time"
      dateTime={new Date(record.addedAt).toISOString()}
      title={tooltip}
      aria-label={tooltip}
    >
      {formatCompactTime(record.addedAt)}
    </time>
  );
  header.append(time);
  return header;
}

function createSavedItemHeader(authorName: string): HTMLElement {
  return el<HTMLSpanElement>(
    <span class="bookmark-message-header">
      <strong class="bookmark-name" dir="auto">
        {authorName || getExtensionMessage('unknownUser')}
      </strong>
    </span>
  );
}

function createSavedItemAvatar(
  record: SavedItemAuthor,
  channelUrl: string,
  avatarRing = false
): HTMLElement {
  const content = record.avatarUrl ? (
    <img src={record.avatarUrl} alt="" referrerPolicy="no-referrer" />
  ) : (
    getSavedItemAuthorInitial(record.authorName)
  );
  const avatarClass = `bookmark-avatar${avatarRing ? ' avatar-ring-avatar' : ''}`;
  const element = channelUrl
    ? el<HTMLButtonElement>(
        <button
          type="button"
          class={`${avatarClass} bookmark-avatar-button`}
          title={getExtensionMessage('openChannel')}
          aria-label={getExtensionMessage('openChannel')}
          onClick={() => chrome.tabs.create({ url: channelUrl })}
        >
          {content}
          {createBookmarkAvatarOpenIcon()}
        </button>
      )
    : el<HTMLSpanElement>(<span class={avatarClass}>{content}</span>);
  element.style.setProperty('--bookmark-author-color', getBookmarkAuthorColor(record));
  return element;
}

function createBookmarkAvatarOpenIcon(): SVGSVGElement {
  const icon = createOpenInNewIcon();
  icon.classList.add('bookmark-avatar-open-icon');
  return icon;
}

function createBookmarkMetadata(record: BookmarkRecord): HTMLElement {
  return createSavedItemMetadata(record);
}

function createSavedItemMetadata(record: SavedItemSource): HTMLElement {
  const metadata = el<HTMLSpanElement>(<span class="bookmark-metadata" />);
  metadata.append(createSavedItemSource(record));
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

function createSavedItemSource(record: SavedItemSource): HTMLElement {
  const sourceName = record.sourceTitle || record.sourceUrl || getExtensionMessage('unknownStream');
  const sourceUrl = getSavedItemSourceUrl(record);

  if (sourceUrl) {
    const tooltip = getExtensionMessage('openStreamInNewWindow', sourceName);
    return el<HTMLButtonElement>(
      <button
        type="button"
        class="bookmark-source bookmark-source-button"
        title={tooltip}
        aria-label={tooltip}
        onClick={() => chrome.tabs.create({ url: sourceUrl })}
      >
        <span class="bookmark-source-label">{sourceName}</span>
        {createOpenInNewIcon()}
      </button>
    );
  }

  return el<HTMLSpanElement>(
    <span class="bookmark-source" title={sourceName}>
      {sourceName}
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

function removeAvatarRing(key: string): void {
  updateStoredAvatarRings((records) => {
    const record = records.get(key);
    if (record) recentlyRemovedAvatarRings.set(key, record);
    records.delete(key);
  });
}

function restoreAvatarRing(key: string, record: AvatarRingRecord): void {
  updateStoredAvatarRings((records) => {
    records.set(key, record);
    recentlyRemovedAvatarRings.delete(key);
  });
}

function updateStoredBookmarks(update: (records: Map<string, BookmarkRecord>) => void): void {
  chrome.storage.local.get({ [BOOKMARKS_STORAGE_KEY]: {} }, (stored) => {
    const records = normalizeStoredBookmarks((stored || {})[BOOKMARKS_STORAGE_KEY]);
    update(records);
    currentBookmarks = records;
    chrome.storage.local.set({ [BOOKMARKS_STORAGE_KEY]: serializeBookmarks(records) }, () =>
      renderSavedItems()
    );
  });
}

function updateStoredAvatarRings(update: (records: Map<string, AvatarRingRecord>) => void): void {
  chrome.storage.local.get({ [AVATAR_RINGS_STORAGE_KEY]: {} }, (stored) => {
    const records = normalizeStoredAvatarRings((stored || {})[AVATAR_RINGS_STORAGE_KEY]);
    update(records);
    currentAvatarRings = records;
    chrome.storage.local.set({ [AVATAR_RINGS_STORAGE_KEY]: serializeAvatarRings(records) }, () =>
      renderSavedItems()
    );
  });
}

function getSavedItemAuthorInitial(authorName: string): string {
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

function getSavedItemChannelUrl(record: Pick<SavedItemAuthor, 'authorName' | 'channelId'>): string {
  if (record.channelId) {
    return `https://www.youtube.com/channel/${encodeURIComponent(record.channelId)}`;
  }

  const handle = record.authorName.trim().replace(/^@/, '');
  return /^[A-Za-z0-9._-]+$/.test(handle) ? `https://www.youtube.com/@${handle}` : '';
}

function getSavedItemSourceUrl(record: SavedItemSource): string {
  const sourceUrl = (record.sourceUrl || '').trim();
  if (!sourceUrl) return '';

  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== 'https:' || !isYouTubeSourceHost(url.hostname)) return '';

    const videoId = getSourceVideoId(url);
    const canonicalUrl = videoId
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
      : '';
    return record.message ? getBookmarkTargetUrl(canonicalUrl, record.message) : canonicalUrl;
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
