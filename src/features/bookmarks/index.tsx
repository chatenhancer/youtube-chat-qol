/** Browser-local chat message bookmarks. */
import { registerFeature } from '../../content/dispatcher';
import {
  BOOKMARK_FILLED_ICON_PATH,
  BOOKMARK_ICON_PATH,
  createSvgIcon,
  MATERIAL_ICON_VIEW_BOX
} from '../../shared/icons';
import { getUiLocale, t } from '../../shared/i18n';
import { jsx, el } from '../../shared/jsx-dom';
import {
  BOOKMARKS_STORAGE_KEY,
  LEGACY_BOOKMARKS_STORAGE_KEY,
  bookmarkAuthorsMatch,
  getBookmarkKey,
  getBookmarkTargetMessageId,
  getBookmarkVideoOffsetSeconds,
  normalizeBookmarkAuthor,
  normalizeStoredBookmarks,
  serializeBookmarks,
  type BookmarkAuthorIdentity,
  type BookmarkRecord
} from '../../shared/bookmarks';
import { cleanText } from '../../shared/text';
import { showToast } from '../../shared/toast';
import {
  getAuthorChannelId,
  getAuthorName,
  getMessageAvatarSrc,
  getMessageContentSourceNodes,
  getMessageStableId,
  getMessageText,
  getMessageTimestampText
} from '../../youtube/messages';
import { requestRenderedYouTubeChatFeedRecord } from '../../youtube/chat-feed/records';
import { getYouTubeChatFeedRichTextSegments } from '../../youtube/chat-feed/rich-text';
import { serializeRichMessageNodes, type RichTextSegment } from '../../youtube/rich-text';
import {
  getCurrentYouTubeChatStreamKey,
  getCurrentYouTubeChatSourceTitle,
  getCurrentYouTubeChatSourceUrl
} from '../../youtube/source-url';
import { getCurrentYouTubeVideoOffsetSeconds } from '../../youtube/player';
import { getChatTimestampValue, isLiveChatReplayUrl } from '../../youtube/timestamps';
import { canJumpToChatMessage, jumpToChatMessage } from '../message-jump';
import { isLiteModeActive } from '../lite-mode/controller';

const bookmarks = new Map<string, BookmarkRecord>();
let loadPromise: Promise<void> | null = null;
let pendingTargetMessageId = '';

registerFeature({
  page: {
    init: initBookmarks,
    cleanup: cleanupBookmarks
  },
  message: handleBookmarkTargetMessage
});

export function initBookmarks(): void {
  pendingTargetMessageId = getBookmarkTargetMessageId(getWatchPageHash());
  void ensureBookmarksLoaded().then(refreshBookmarkButtons);
  chrome.storage.onChanged.addListener(handleBookmarksStorageChange);
}

export interface BookmarkSourceMessage {
  authorName: string;
  avatarSrc?: string;
  channelId?: string;
  contentParts: RichTextSegment[];
  messageId?: string;
  text: string;
  timestamp: number;
  timestampText: string;
}

export function isChatBookmarked(message: HTMLElement): boolean {
  return bookmarks.has(getCurrentBookmarkKey(getMessageStableId(message)));
}

export function getChatBookmarkTitle(message: HTMLElement): string {
  return isChatBookmarked(message) ? t('removeSavedMessage') : t('saveMessage');
}

export async function toggleBookmark(message: BookmarkSourceMessage): Promise<boolean | null> {
  await ensureBookmarksLoaded();
  const nextRecord = createBookmarkRecord(message);
  if (!nextRecord) return null;

  const key = getBookmarkKey(nextRecord.sourceKey, nextRecord.message?.messageId || '');
  if (!key) return null;

  const previousRecords = new Map(bookmarks);
  const saved = !bookmarks.has(key);
  if (saved) {
    removeLegacyBookmarksForIdentity(nextRecord);
    bookmarks.set(key, nextRecord);
  } else {
    bookmarks.delete(key);
  }

  try {
    await saveBookmarks();
  } catch {
    replaceBookmarks(previousRecords);
    refreshBookmarkButtons();
    showToast(t('couldNotSaveBookmark'));
    return null;
  }

  refreshBookmarkButtons();
  showToast(t(saved ? 'savedToBookmarks' : 'removedFromBookmarks'));
  return saved;
}

export async function toggleChatBookmark(message: HTMLElement): Promise<boolean | null> {
  const bookmarkable = await getBookmarkableMessage(message);
  return bookmarkable ? toggleBookmark(bookmarkable) : null;
}

export function createBookmarkToggleButton(
  message: BookmarkSourceMessage
): HTMLButtonElement | null {
  const bookmarkKey = getCurrentBookmarkKey(message.messageId);
  if (!bookmarkKey) return null;

  const button = el<HTMLButtonElement>(
    <button
      type="button"
      class="ytcq-message-row-action ytcq-bookmark-toggle"
      onClick={(event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        void toggleBookmark(message);
      }}
    >
      {createBookmarkIcon()}
    </button>
  );
  button.dataset.ytcqBookmarkKey = bookmarkKey;
  updateBookmarkToggleButton(button);
  return button;
}

export function cleanupBookmarks(): void {
  pendingTargetMessageId = '';
  chrome.storage.onChanged.removeListener(handleBookmarksStorageChange);
}

function handleBookmarkTargetMessage(message: HTMLElement): void {
  if (!pendingTargetMessageId || getMessageStableId(message) !== pendingTargetMessageId) return;

  const messageId = pendingTargetMessageId;
  if (message.classList.contains('ytcq-lite-message')) {
    finishBookmarkTargetJump(message, messageId);
    return;
  }

  window.requestAnimationFrame(() => {
    if (pendingTargetMessageId !== messageId) return;
    if (isLiteModeActive()) {
      if (!canJumpToChatMessage(null, messageId)) return;
      finishBookmarkTargetJump(null, messageId);
      return;
    }

    finishBookmarkTargetJump(message, messageId);
  });
}

function finishBookmarkTargetJump(target: HTMLElement | null, messageId: string): void {
  if (pendingTargetMessageId !== messageId) return;
  pendingTargetMessageId = '';
  jumpToChatMessage(target, messageId);
}

function updateBookmarkToggleButton(button: HTMLButtonElement): void {
  const record = bookmarks.get(button.dataset.ytcqBookmarkKey || '');
  const saved = Boolean(record);
  const actionLabel = saved ? t('removeSavedMessage') : t('saveMessage');
  const savedAt = Number(record?.savedAt);
  const label =
    saved && Number.isFinite(savedAt) && savedAt > 0
      ? `${actionLabel}\n${t('bookmarkAddedDate', { date: formatBookmarkActionDate(savedAt) })}`
      : actionLabel;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-pressed', String(saved));
  button.classList.toggle('ytcq-bookmark-toggle-active', saved);
  updateBookmarkIcon(button, saved);
}

function formatBookmarkActionDate(timestamp: number): string {
  return new Intl.DateTimeFormat(getUiLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(timestamp);
}

function createBookmarkIcon(iconPath = BOOKMARK_ICON_PATH): SVGSVGElement {
  return createSvgIcon(MATERIAL_ICON_VIEW_BOX, iconPath);
}

function updateBookmarkIcon(button: HTMLButtonElement, saved: boolean): void {
  const path = button.querySelector('svg path');
  if (path) {
    path.setAttribute('d', saved ? BOOKMARK_FILLED_ICON_PATH : BOOKMARK_ICON_PATH);
    return;
  }

  button.prepend(createBookmarkIcon(saved ? BOOKMARK_FILLED_ICON_PATH : BOOKMARK_ICON_PATH));
}

function ensureBookmarksLoaded(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    chrome.storage.local.get([BOOKMARKS_STORAGE_KEY, LEGACY_BOOKMARKS_STORAGE_KEY], (stored) => {
      const values = stored || {};
      const hasBookmarks = Object.hasOwn(values, BOOKMARKS_STORAGE_KEY);
      const hasLegacyBookmarks = Object.hasOwn(values, LEGACY_BOOKMARKS_STORAGE_KEY);
      const storedValue = hasBookmarks
        ? values[BOOKMARKS_STORAGE_KEY]
        : values[LEGACY_BOOKMARKS_STORAGE_KEY];
      replaceBookmarks(normalizeStoredBookmarks(storedValue));

      if (hasBookmarks) {
        if (hasLegacyBookmarks) {
          chrome.storage.local.remove(LEGACY_BOOKMARKS_STORAGE_KEY, resolve);
        } else {
          resolve();
        }
        return;
      }

      chrome.storage.local.set({ [BOOKMARKS_STORAGE_KEY]: serializeBookmarks(bookmarks) }, () => {
        const migrationError = chrome.runtime.lastError;
        if (!migrationError && hasLegacyBookmarks) {
          chrome.storage.local.remove(LEGACY_BOOKMARKS_STORAGE_KEY, resolve);
          return;
        }
        resolve();
      });
    });
  });
  return loadPromise;
}

function saveBookmarks(): Promise<void> {
  const stored = serializeBookmarks(bookmarks);
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [BOOKMARKS_STORAGE_KEY]: stored }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve();
      }
    });
  });
}

function handleBookmarksStorageChange(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string
): void {
  if (areaName !== 'local' || !changes[BOOKMARKS_STORAGE_KEY]) return;

  replaceBookmarks(normalizeStoredBookmarks(changes[BOOKMARKS_STORAGE_KEY].newValue));
  refreshBookmarkButtons();
}

function replaceBookmarks(records: Map<string, BookmarkRecord>): void {
  bookmarks.clear();
  records.forEach((record, key) => bookmarks.set(key, record));
}

function findBookmarksByAuthor(identity: BookmarkAuthorIdentity): [string, BookmarkRecord][] {
  const normalized = normalizeBookmarkAuthor(identity);
  if (!normalized) return [];

  const matches: [string, BookmarkRecord][] = [];
  bookmarks.forEach((record, key) => {
    if (bookmarkAuthorsMatch(normalized, record)) matches.push([key, record]);
  });
  return matches;
}

function getCurrentBookmarkKey(messageId: string | undefined): string {
  return getBookmarkKey(getCurrentYouTubeChatStreamKey(), cleanText(messageId));
}

function createBookmarkRecord(message: BookmarkSourceMessage): BookmarkRecord | null {
  const identity = normalizeBookmarkAuthor({
    authorName: message.authorName,
    avatarUrl: message.avatarSrc,
    channelId: message.channelId
  });
  const messageId = cleanText(message.messageId);
  const text = cleanText(message.text);
  const sourceKey = getCurrentYouTubeChatStreamKey();
  if (!identity || !messageId || !sourceKey || (!text && !message.contentParts.length)) return null;
  const replayOffsetSeconds = isLiveChatReplayUrl()
    ? getBookmarkVideoOffsetSeconds({ timestampText: message.timestampText })
    : null;
  const videoOffsetSeconds = replayOffsetSeconds ?? getCurrentYouTubeVideoOffsetSeconds();

  return {
    authorName: identity.authorName || '',
    avatarUrl: identity.avatarUrl,
    channelId: identity.channelId,
    message: {
      contentParts: message.contentParts,
      messageId,
      text,
      timestamp: Number.isFinite(message.timestamp) ? message.timestamp : 0,
      timestampText: cleanText(message.timestampText),
      ...(videoOffsetSeconds !== null ? { videoOffsetSeconds } : {})
    },
    savedAt: Date.now(),
    sourceKey,
    sourceTitle: getCurrentYouTubeChatSourceTitle() || undefined,
    sourceUrl: getCurrentYouTubeChatSourceUrl() || undefined
  };
}

async function getBookmarkableMessage(message: HTMLElement): Promise<BookmarkSourceMessage | null> {
  const messageId = getMessageStableId(message);
  const authorName = getAuthorName(message);
  const text = getMessageText(message);
  if (!messageId || !authorName || !text) return null;

  const receivedAt = Date.now();
  const timestampText = getMessageTimestampText(message, receivedAt);
  const fallback: BookmarkSourceMessage = {
    authorName,
    avatarSrc: getMessageAvatarSrc(message) || undefined,
    channelId: getAuthorChannelId(message) || undefined,
    contentParts: serializeRichMessageNodes(getMessageContentSourceNodes(message)),
    messageId,
    text,
    timestamp:
      getChatTimestampValue(timestampText, receivedAt, {
        preferElapsed: isLiveChatReplayUrl()
      }) ?? receivedAt,
    timestampText
  };

  const feedRecord = await requestRenderedYouTubeChatFeedRecord(message);
  if (!feedRecord || feedRecord.id !== messageId) return fallback;

  const feedTimestampText = cleanText(feedRecord.timestampText) || timestampText;
  return {
    authorName: cleanText(feedRecord.author?.name) || fallback.authorName,
    avatarSrc: cleanText(feedRecord.author?.avatarUrl) || fallback.avatarSrc,
    channelId: cleanText(feedRecord.author?.channelId) || fallback.channelId,
    contentParts: getYouTubeChatFeedRichTextSegments(feedRecord),
    messageId,
    text: cleanText(feedRecord.plainText) || fallback.text,
    timestamp: getFeedMessageTimestamp(feedRecord.timestampUsec, feedTimestampText, receivedAt),
    timestampText: feedTimestampText
  };
}

function getFeedMessageTimestamp(
  timestampUsec: string | undefined,
  timestampText: string,
  receivedAt: number
): number {
  if (!isLiveChatReplayUrl() && /^\d+$/.test(timestampUsec || '')) {
    const timestamp = Number(timestampUsec) / 1_000;
    if (Number.isFinite(timestamp) && timestamp > 0) return timestamp;
  }

  return (
    getChatTimestampValue(timestampText, receivedAt, {
      preferElapsed: isLiveChatReplayUrl()
    }) ?? receivedAt
  );
}

function removeLegacyBookmarksForIdentity(identity: BookmarkAuthorIdentity): void {
  findBookmarksByAuthor(identity).forEach(([key, record]) => {
    if (record.message === null) bookmarks.delete(key);
  });
}

function refreshBookmarkButtons(): void {
  document
    .querySelectorAll<HTMLButtonElement>('.ytcq-bookmark-toggle')
    .forEach(updateBookmarkToggleButton);
}

function getWatchPageHash(): string {
  try {
    return window.top?.location.hash || window.location.hash;
  } catch {
    return window.location.hash;
  }
}
