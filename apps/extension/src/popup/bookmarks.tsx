import { createBookmarkIcon, createAvatarRingIcon, createOpenInNewIcon } from '../shared/icons';
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
  getBookmarkAuthorKey,
  getBookmarkTargetUrl,
  normalizeStoredBookmarks,
  serializeBookmarks,
  type BookmarkRecord
} from '../shared/bookmarks';
import { prefersReducedMotion } from '../shared/motion';
import { appendRichMessageText } from '../youtube/rich-text';
import { controls } from './controls';
import { getExtensionMessage } from './i18n';
import { addPopupTabSelectionListener, refreshPopupScrollFades } from './tabs';

const BOOKMARKS_PANEL_ID = 'bookmarksPanel';
const BOOKMARK_SEARCH_HIGHLIGHT_CLASS = 'bookmark-search-highlight';
const SAVED_ITEM_ADDED_CLASS = 'bookmark-row-added';
const SAVED_ITEM_ADDED_ANIMATION = 'ytcq-popup-bookmark-row-added';
const recentlyRemovedBookmarks = new Map<string, BookmarkRecord>();
const recentlyRemovedAvatarRings = new Map<string, AvatarRingRecord>();
const selectedSavedItems = new Map<string, SavedItemReference>();
const lastRemovedSavedItems = new Map<string, SavedItemReference>();
const arrivingSavedItemIds = new Set<string>();
const highlightedSavedItemRows = new Set<HTMLElement>();
let currentBookmarks = new Map<string, BookmarkRecord>();
let currentAvatarRings = new Map<string, AvatarRingRecord>();
let compactTimeFormatter: Intl.DateTimeFormat | null = null;
let fullDateTimeFormatter: Intl.DateTimeFormat | null = null;
let savedItemsFilterFrame = 0;
let savedItemsInitialLoadComplete = false;
let savedItemsRenderPending = true;
let savedItemsSelectionMode = false;
let savedItemsHaveRendered = false;

type SavedItemKind = 'avatar-ring' | 'bookmark';

interface SavedItemReference {
  key: string;
  kind: SavedItemKind;
}

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

interface AvatarRingLookup {
  byAuthor: Map<string, AvatarRingRecord>;
  byChannel: Map<string, AvatarRingRecord>;
  withoutChannelByAuthor: Map<string, AvatarRingRecord>;
}

export function initBookmarksPanel(): void {
  const {
    bookmarksCancelSelection,
    bookmarksCount,
    bookmarksFilter,
    bookmarksList,
    bookmarksRemoveSelected,
    bookmarksSelect,
    bookmarksSelectAll,
    bookmarksUndoButton
  } = controls;
  if (!bookmarksCount || !bookmarksList) return;

  bookmarksFilter?.addEventListener('input', scheduleSavedItemsFilter);
  bookmarksSelect?.addEventListener('click', enterSavedItemsSelectionMode);
  bookmarksCancelSelection?.addEventListener('click', () => exitSavedItemsSelectionMode(true));
  bookmarksSelectAll?.addEventListener('click', selectAllVisibleSavedItems);
  bookmarksRemoveSelected?.addEventListener('click', removeSelectedSavedItems);
  bookmarksUndoButton?.addEventListener('click', undoLastRemovedSavedItems);
  controls.tabPanels
    .find((panel) => panel.id === BOOKMARKS_PANEL_ID)
    ?.addEventListener('keydown', handleSavedItemsKeydown);
  addPopupTabSelectionListener((panelId) => {
    if (panelId === BOOKMARKS_PANEL_ID) {
      renderSavedItemsIfActive();
    } else if (savedItemsSelectionMode) {
      exitSavedItemsSelectionMode(false);
    }
  });
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
      savedItemsChanged();
      savedItemsInitialLoadComplete = true;

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
  if (changed) savedItemsChanged();
}

function savedItemsChanged(): void {
  pruneSavedItemReferences();
  savedItemsRenderPending = true;
  updateSavedItemsCount();
  renderSavedItemsIfActive();
  syncSavedItemsControls();
}

function updateSavedItemsCount(): void {
  if (!controls.bookmarksCount) return;

  const query = controls.bookmarksFilter?.value.toLowerCase() || '';
  const activeCount = query
    ? countMatchingSavedItems(currentBookmarks, currentAvatarRings, query)
    : currentBookmarks.size + currentAvatarRings.size;
  controls.bookmarksCount.textContent = String(activeCount);
  controls.bookmarksCount.setAttribute(
    'aria-label',
    getExtensionMessage('savedItemsCount', String(activeCount))
  );
}

function countMatchingSavedItems(
  bookmarks: Map<string, BookmarkRecord>,
  avatarRings: Map<string, AvatarRingRecord>,
  query: string
): number {
  let matchingCount = 0;
  bookmarks.forEach((record, key) => {
    const entry: SavedItemEntry = { active: true, key, kind: 'bookmark', record };
    if (getSavedItemSearchText(entry).includes(query)) matchingCount += 1;
  });
  avatarRings.forEach((record, key) => {
    const entry: SavedItemEntry = { active: true, key, kind: 'avatar-ring', record };
    if (getSavedItemSearchText(entry).includes(query)) matchingCount += 1;
  });
  return matchingCount;
}

function enterSavedItemsSelectionMode(): void {
  if (!getVisibleSelectableSavedItemRows().length) return;

  selectedSavedItems.clear();
  savedItemsSelectionMode = true;
  savedItemsRenderPending = true;
  renderSavedItemsIfActive();
  syncSavedItemsControls();
  controls.bookmarksCancelSelection?.focus();
}

function exitSavedItemsSelectionMode(focusSelectButton: boolean): void {
  if (!savedItemsSelectionMode && !selectedSavedItems.size) return;

  selectedSavedItems.clear();
  savedItemsSelectionMode = false;
  savedItemsRenderPending = true;
  renderSavedItemsIfActive();
  syncSavedItemsControls();
  if (focusSelectButton && isBookmarksPanelActive()) controls.bookmarksSelect?.focus();
}

function handleSavedItemsKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !savedItemsSelectionMode) return;

  event.preventDefault();
  exitSavedItemsSelectionMode(true);
}

function selectAllVisibleSavedItems(): void {
  const rows = getVisibleSelectableSavedItemRows();
  rows.forEach((row) => {
    const reference = getSavedItemReferenceFromRow(row);
    if (reference) selectedSavedItems.set(getSavedItemId(reference), reference);
  });
  syncRenderedSavedItemSelection();
  syncSavedItemsControls();
}

function setSavedItemSelected(entry: SavedItemEntry, selected: boolean): void {
  const reference: SavedItemReference = { key: entry.key, kind: entry.kind };
  const id = getSavedItemId(reference);
  if (selected) selectedSavedItems.set(id, reference);
  else selectedSavedItems.delete(id);
  syncRenderedSavedItemSelection();
  syncSavedItemsControls();
}

function syncRenderedSavedItemSelection(): void {
  controls.bookmarksList
    ?.querySelectorAll<HTMLElement>('.bookmark-row[data-saved-item-id]')
    .forEach((row) => {
      const id = row.dataset.savedItemId || '';
      const selected = selectedSavedItems.has(id);
      row.classList.toggle('bookmark-row-selected', selected);
      const checkbox = row.querySelector<HTMLInputElement>('.bookmark-selection-checkbox');
      if (checkbox) checkbox.checked = selected;
    });
}

function syncSavedItemsControls(): void {
  const {
    bookmarksBrowseControls,
    bookmarksRemoveSelected,
    bookmarksSelect,
    bookmarksSelectAll,
    bookmarksSelectionControls,
    bookmarksSelectionCount,
    bookmarksUndo,
    bookmarksUndoCount
  } = controls;
  const visibleRows = getVisibleSelectableSavedItemRows();
  const allVisibleSelected =
    visibleRows.length > 0 &&
    visibleRows.every((row) => selectedSavedItems.has(row.dataset.savedItemId || ''));

  if (bookmarksBrowseControls) bookmarksBrowseControls.hidden = savedItemsSelectionMode;
  if (bookmarksSelectionControls) bookmarksSelectionControls.hidden = !savedItemsSelectionMode;
  if (bookmarksSelect) bookmarksSelect.disabled = visibleRows.length === 0;
  if (bookmarksSelectAll) {
    bookmarksSelectAll.disabled = visibleRows.length === 0 || allVisibleSelected;
  }
  if (bookmarksRemoveSelected) bookmarksRemoveSelected.disabled = selectedSavedItems.size === 0;
  if (bookmarksSelectionCount) {
    bookmarksSelectionCount.textContent = getExtensionMessage(
      'selectedSavedItemsCount',
      String(selectedSavedItems.size),
      `${selectedSavedItems.size} selected`
    );
  }
  if (bookmarksUndo) {
    bookmarksUndo.hidden = savedItemsSelectionMode || lastRemovedSavedItems.size === 0;
  }
  if (bookmarksUndoCount) {
    bookmarksUndoCount.textContent = getExtensionMessage(
      'removedSavedItemsCount',
      String(lastRemovedSavedItems.size),
      `${lastRemovedSavedItems.size} removed`
    );
  }
}

function getVisibleSelectableSavedItemRows(): HTMLElement[] {
  if (!controls.bookmarksList) return [];
  return Array.from(
    controls.bookmarksList.querySelectorAll<HTMLElement>(
      '.bookmark-row[data-saved-item-active="true"]'
    )
  ).filter((row) => !row.hidden);
}

function getSavedItemReferenceFromRow(row: HTMLElement): SavedItemReference | null {
  const key = row.dataset.savedItemKey || '';
  const kind = row.dataset.savedItemKind;
  if (!key || (kind !== 'avatar-ring' && kind !== 'bookmark')) return null;
  return { key, kind };
}

function pruneSavedItemReferences(): void {
  selectedSavedItems.forEach((reference, id) => {
    if (!hasActiveSavedItem(reference)) selectedSavedItems.delete(id);
  });
  lastRemovedSavedItems.forEach((reference, id) => {
    const recentlyRemoved =
      reference.kind === 'bookmark'
        ? recentlyRemovedBookmarks.has(reference.key)
        : recentlyRemovedAvatarRings.has(reference.key);
    if (hasActiveSavedItem(reference) || !recentlyRemoved) lastRemovedSavedItems.delete(id);
  });
}

function hasActiveSavedItem(reference: SavedItemReference): boolean {
  return reference.kind === 'bookmark'
    ? currentBookmarks.has(reference.key)
    : currentAvatarRings.has(reference.key);
}

function getSavedItemId(reference: SavedItemReference): string {
  return `${reference.kind}:${reference.key}`;
}

function renderSavedItemsIfActive(): void {
  if (!savedItemsRenderPending || !isBookmarksPanelActive()) return;
  renderSavedItems();
}

function isBookmarksPanelActive(): boolean {
  const panel = controls.tabPanels.find((candidate) => candidate.id === BOOKMARKS_PANEL_ID);
  return !panel || !panel.hidden;
}

function renderSavedItems(): void {
  if (!controls.bookmarksCount || !controls.bookmarksList) return;

  if (savedItemsFilterFrame) {
    window.cancelAnimationFrame(savedItemsFilterFrame);
    savedItemsFilterFrame = 0;
  }
  savedItemsRenderPending = false;
  highlightedSavedItemRows.clear();
  const previouslyRenderedActiveIds = new Set(
    Array.from(
      controls.bookmarksList.querySelectorAll<HTMLElement>(
        '.bookmark-row[data-saved-item-active="true"][data-saved-item-id]'
      ),
      (row) => row.dataset.savedItemId || ''
    ).filter(Boolean)
  );
  const previousBookmarkRingColors = getRenderedBookmarkRingColors(controls.bookmarksList);
  const avatarRingLookup = createAvatarRingLookup(currentAvatarRings.values());
  const entries = getVisibleSavedItemEntries().sort((firstEntry, secondEntry) => {
    const firstTime = getSavedItemAddedAt(firstEntry);
    const secondTime = getSavedItemAddedAt(secondEntry);
    return (
      secondTime - firstTime ||
      firstEntry.record.authorName.localeCompare(secondEntry.record.authorName) ||
      firstEntry.kind.localeCompare(secondEntry.kind)
    );
  });
  const activeEntryIds = new Set(
    entries.filter((entry) => entry.active).map((entry) => getSavedItemId(entry))
  );
  arrivingSavedItemIds.forEach((id) => {
    if (!activeEntryIds.has(id)) arrivingSavedItemIds.delete(id);
  });
  if (savedItemsInitialLoadComplete && savedItemsHaveRendered && !prefersReducedMotion()) {
    activeEntryIds.forEach((id) => {
      if (!previouslyRenderedActiveIds.has(id)) arrivingSavedItemIds.add(id);
    });
  } else {
    arrivingSavedItemIds.clear();
  }
  savedItemsHaveRendered = true;

  controls.bookmarksList.replaceChildren();
  controls.bookmarksList.classList.toggle('bookmarks-list-empty', entries.length === 0);

  if (!entries.length) {
    controls.bookmarksList.append(
      el<HTMLParagraphElement>(
        <p class="bookmarks-empty">{getExtensionMessage('savedItemsEmpty')}</p>
      )
    );
    syncSavedItemsControls();
    refreshPopupScrollFades();
    return;
  }

  controls.bookmarksList.append(
    ...entries.map((entry) =>
      createSavedItemRow(
        entry,
        previousBookmarkRingColors.get(entry.key) || '',
        avatarRingLookup,
        arrivingSavedItemIds.has(getSavedItemId(entry))
      )
    ),
    el<HTMLParagraphElement>(
      <p class="bookmarks-empty bookmarks-filter-empty" hidden>
        {getExtensionMessage('noMatchingSavedItems')}
      </p>
    )
  );
  applySavedItemsFilter();
}

function scheduleSavedItemsFilter(): void {
  if (savedItemsFilterFrame) return;
  savedItemsFilterFrame = window.requestAnimationFrame(() => {
    savedItemsFilterFrame = 0;
    applySavedItemsFilter();
  });
}

function applySavedItemsFilter(): void {
  const { bookmarksFilter, bookmarksList } = controls;
  if (!bookmarksFilter || !bookmarksList) return;

  clearSavedItemSearchHighlights();
  const query = bookmarksFilter.value.toLowerCase();
  const rows = Array.from(bookmarksList.querySelectorAll<HTMLElement>('.bookmark-row'));
  let hasVisibleRow = false;

  for (const row of rows) {
    const searchText = row.dataset.bookmarkSearch || '';
    const matches = searchText.includes(query);
    row.hidden = !matches;
    if (matches && query) {
      updateSavedItemSearchHighlights(row, query);
      highlightedSavedItemRows.add(row);
    }
    hasVisibleRow ||= matches;
  }

  const noMatches = Boolean(query) && rows.length > 0 && !hasVisibleRow;
  const filterEmpty = bookmarksList.querySelector<HTMLElement>('.bookmarks-filter-empty');
  if (filterEmpty) filterEmpty.hidden = !noMatches;
  bookmarksList.classList.toggle('bookmarks-list-empty', noMatches);
  updateSavedItemsCount();
  syncSavedItemsControls();
  refreshPopupScrollFades();
}

function clearSavedItemSearchHighlights(): void {
  highlightedSavedItemRows.forEach((row) => {
    const copy = row.querySelector<HTMLElement>('.bookmark-copy');
    if (!copy) return;
    const highlights = copy.querySelectorAll<HTMLElement>(`.${BOOKMARK_SEARCH_HIGHLIGHT_CLASS}`);
    if (!highlights.length) return;
    highlights.forEach((highlight) => highlight.replaceWith(...Array.from(highlight.childNodes)));
    copy.normalize();
  });
  highlightedSavedItemRows.clear();
}

function updateSavedItemSearchHighlights(row: HTMLElement, query: string): void {
  const copy = row.querySelector<HTMLElement>('.bookmark-copy');
  if (!copy) return;

  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text && current.nodeValue) textNodes.push(current);
    current = walker.nextNode();
  }

  textNodes.forEach((node) => highlightSavedItemTextNode(node, query));
}

function highlightSavedItemTextNode(node: Text, query: string): void {
  const text = node.nodeValue || '';
  const { normalizedText, sourceRanges } = getSavedItemHighlightText(text);
  const matches: Array<{ index: number; length: number }> = [];
  let cursor = 0;

  while (cursor < normalizedText.length) {
    const nextIndex = normalizedText.indexOf(query, cursor);
    if (nextIndex < 0) break;
    const sourceStart = sourceRanges[nextIndex]?.start;
    const sourceEnd = sourceRanges[nextIndex + query.length - 1]?.end;
    if (sourceStart !== undefined && sourceEnd !== undefined) {
      const previous = matches.at(-1);
      if (previous && sourceStart < previous.index + previous.length) {
        previous.length = Math.max(previous.index + previous.length, sourceEnd) - previous.index;
      } else {
        matches.push({ index: sourceStart, length: sourceEnd - sourceStart });
      }
    }
    cursor = nextIndex + query.length;
  }

  if (!matches.length) return;

  const fragment = document.createDocumentFragment();
  cursor = 0;
  matches.forEach((match) => {
    if (match.index > cursor) {
      fragment.append(document.createTextNode(text.slice(cursor, match.index)));
    }
    const end = match.index + match.length;
    fragment.append(
      el<HTMLSpanElement>(
        <span class={BOOKMARK_SEARCH_HIGHLIGHT_CLASS}>{text.slice(match.index, end)}</span>
      )
    );
    cursor = end;
  });
  if (cursor < text.length) fragment.append(document.createTextNode(text.slice(cursor)));
  node.replaceWith(fragment);
}

function getSavedItemHighlightText(text: string): {
  normalizedText: string;
  sourceRanges: Array<{ start: number; end: number }>;
} {
  let normalizedText = '';
  const sourceRanges: Array<{ start: number; end: number }> = [];

  for (const match of text.matchAll(/(?:\P{M}\p{M}*|\p{M}+)/gu)) {
    const sourceText = match[0];
    const start = match.index;
    const normalizedSegment = sourceText.toLowerCase();
    normalizedText += normalizedSegment;
    for (let index = 0; index < normalizedSegment.length; index += 1) {
      sourceRanges.push({ start, end: start + sourceText.length });
    }
  }

  return { normalizedText, sourceRanges };
}

function getRenderedBookmarkRingColors(list: HTMLElement): Map<string, string> {
  const ringColors = new Map<string, string>();
  list.querySelectorAll<HTMLElement>('.bookmark-row[data-bookmark-key]').forEach((row) => {
    const key = row.dataset.bookmarkKey || '';
    const ring = row.querySelector('.avatar-ring-avatar, .avatar-ring-avatar-out');
    const color = row.style.getPropertyValue('--ytcq-popup-avatar-ring-color');
    if (key && ring && color) ringColors.set(key, color);
  });
  return ringColors;
}

function getVisibleSavedItemEntries(): SavedItemEntry[] {
  const entries: SavedItemEntry[] = Array.from(currentBookmarks.entries()).map(([key, record]) => {
    recentlyRemovedBookmarks.delete(key);
    return { active: true, key, kind: 'bookmark' as const, record };
  });

  recentlyRemovedBookmarks.forEach((record, key) => {
    const reference: SavedItemReference = { key, kind: 'bookmark' };
    if (!currentBookmarks.has(key) && !lastRemovedSavedItems.has(getSavedItemId(reference))) {
      entries.push({ active: false, key, kind: 'bookmark', record });
    }
  });

  currentAvatarRings.forEach((record, key) => {
    recentlyRemovedAvatarRings.delete(key);
    entries.push({ active: true, key, kind: 'avatar-ring', record });
  });

  recentlyRemovedAvatarRings.forEach((record, key) => {
    const reference: SavedItemReference = { key, kind: 'avatar-ring' };
    if (!currentAvatarRings.has(key) && !lastRemovedSavedItems.has(getSavedItemId(reference))) {
      entries.push({ active: false, key, kind: 'avatar-ring', record });
    }
  });

  return entries;
}

function getSavedItemAddedAt(entry: SavedItemEntry): number {
  return entry.kind === 'bookmark' ? entry.record.savedAt : entry.record.addedAt;
}

function createSavedItemRow(
  entry: SavedItemEntry,
  previousAvatarRingColor: string,
  avatarRingLookup: AvatarRingLookup,
  animateAdded: boolean
): HTMLElement {
  const row =
    entry.kind === 'bookmark'
      ? createBookmarkRow(
          entry.key,
          entry.record,
          entry.active,
          previousAvatarRingColor,
          findAvatarRing(entry.record, avatarRingLookup)
        )
      : createAvatarRingRow(entry.key, entry.record, entry.active, previousAvatarRingColor);
  const reference: SavedItemReference = { key: entry.key, kind: entry.kind };
  const savedItemId = getSavedItemId(reference);
  row.dataset.bookmarkKey = entry.key;
  row.dataset.bookmarkSearch = getSavedItemSearchText(entry);
  row.dataset.savedItemActive = String(entry.active);
  row.dataset.savedItemId = savedItemId;
  row.dataset.savedItemKey = entry.key;
  row.dataset.savedItemKind = entry.kind;
  if (animateAdded) {
    row.classList.add(SAVED_ITEM_ADDED_CLASS);
    const handleAnimationEnd = (event: AnimationEvent): void => {
      if (event.target !== row || event.animationName !== SAVED_ITEM_ADDED_ANIMATION) return;
      arrivingSavedItemIds.delete(savedItemId);
      row.classList.remove(SAVED_ITEM_ADDED_CLASS);
      row.removeEventListener('animationend', handleAnimationEnd);
    };
    row.addEventListener('animationend', handleAnimationEnd);
  }
  if (savedItemsSelectionMode && entry.active) {
    row.classList.add('bookmark-row-selectable');
    row
      .querySelector<HTMLElement>('.bookmark-actions')
      ?.replaceChildren(createSavedItemSelectionControl(entry));
    row.classList.toggle('bookmark-row-selected', selectedSavedItems.has(savedItemId));
    row.addEventListener(
      'click',
      (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest('.bookmark-selection-control')) return;

        event.preventDefault();
        event.stopPropagation();
        setSavedItemSelected(entry, !selectedSavedItems.has(savedItemId));
      },
      { capture: true }
    );
  }
  return row;
}

function createSavedItemSelectionControl(entry: SavedItemEntry): HTMLElement {
  const selected = selectedSavedItems.has(getSavedItemId({ key: entry.key, kind: entry.kind }));
  const label = `${getExtensionMessage('selectSavedItems')}: ${
    entry.record.authorName || getExtensionMessage('unknownUser')
  }`;
  const checkbox = el<HTMLInputElement>(
    <input
      type="checkbox"
      class="bookmark-selection-checkbox"
      checked={selected}
      aria-label={label}
      onChange={(event: Event) => {
        const input = event.currentTarget as HTMLInputElement;
        setSavedItemSelected(entry, input.checked);
      }}
    />
  );
  return el<HTMLLabelElement>(
    <label class="bookmark-selection-control" title={label}>
      {checkbox}
    </label>
  );
}

function createAvatarRingLookup(records: Iterable<AvatarRingRecord>): AvatarRingLookup {
  const lookup: AvatarRingLookup = {
    byAuthor: new Map(),
    byChannel: new Map(),
    withoutChannelByAuthor: new Map()
  };

  for (const record of records) {
    const authorKey = getBookmarkAuthorKey({ authorName: record.authorName });
    const channelKey = getBookmarkAuthorKey({ channelId: record.channelId });
    if (authorKey && !lookup.byAuthor.has(authorKey)) lookup.byAuthor.set(authorKey, record);
    if (channelKey && !lookup.byChannel.has(channelKey)) lookup.byChannel.set(channelKey, record);
    if (!channelKey && authorKey && !lookup.withoutChannelByAuthor.has(authorKey)) {
      lookup.withoutChannelByAuthor.set(authorKey, record);
    }
  }

  return lookup;
}

function findAvatarRing(
  bookmark: BookmarkRecord,
  lookup: AvatarRingLookup
): AvatarRingRecord | undefined {
  const authorKey = getBookmarkAuthorKey({ authorName: bookmark.authorName });
  const channelKey = getBookmarkAuthorKey({ channelId: bookmark.channelId });
  if (!channelKey) return authorKey ? lookup.byAuthor.get(authorKey) : undefined;
  return (
    lookup.byChannel.get(channelKey) ||
    (authorKey ? lookup.withoutChannelByAuthor.get(authorKey) : undefined)
  );
}

function getSavedItemSearchText(entry: SavedItemEntry): string {
  const message = entry.kind === 'bookmark' ? entry.record.message : null;
  return [
    entry.record.authorName,
    entry.record.channelId,
    entry.record.sourceTitle,
    entry.record.sourceUrl,
    message?.text,
    message?.timestampText,
    entry.kind === 'avatar-ring' ? getExtensionMessage('rememberedUser') : ''
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function createBookmarkRow(
  key: string,
  record: BookmarkRecord,
  active: boolean,
  previousAvatarRingColor: string,
  avatarRing: AvatarRingRecord | undefined
): HTMLElement {
  const channelUrl = getSavedItemChannelUrl(record);
  const hasAvatarRing = Boolean(avatarRing);
  const avatar = createSavedItemAvatar(
    record,
    channelUrl,
    hasAvatarRing,
    hasAvatarRing && !previousAvatarRingColor,
    !hasAvatarRing && Boolean(previousAvatarRingColor)
  );
  const copy = el<HTMLSpanElement>(<span class="bookmark-copy" />);
  copy.append(createBookmarkHeader(record, channelUrl, hasAvatarRing));

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
      {createBookmarkIcon(active)}
    </button>
  );

  const row = el<HTMLElement>(
    <article class={`bookmark-row${active ? '' : ' bookmark-row-removed'}`}>
      {avatar}
      {copy}
      <span class="bookmark-actions">{actionButton}</span>
    </article>
  );
  const avatarRingColor = avatarRing ? getAvatarRingColor(avatarRing) : previousAvatarRingColor;
  if (avatarRingColor) {
    row.style.setProperty('--ytcq-popup-avatar-ring-color', avatarRingColor);
  }
  return row;
}

function createAvatarRingRow(
  key: string,
  record: AvatarRingRecord,
  active: boolean,
  previousAvatarRingColor: string
): HTMLElement {
  const channelUrl = getSavedItemChannelUrl(record);
  const avatar = createSavedItemAvatar(
    record,
    channelUrl,
    active,
    active && !previousAvatarRingColor,
    !active && Boolean(previousAvatarRingColor)
  );
  const copy = el<HTMLSpanElement>(<span class="bookmark-copy avatar-ring-copy" />);
  copy.append(createAvatarRingHeader(record, channelUrl, active));
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

function createBookmarkHeader(
  record: BookmarkRecord,
  channelUrl: string,
  remembered: boolean
): HTMLElement {
  const header = createSavedItemHeader(record.authorName, channelUrl, remembered);
  const postedTime = createBookmarkPostedTime(record.message);
  if (postedTime) header.append(postedTime);
  return header;
}

function createAvatarRingHeader(
  record: AvatarRingRecord,
  channelUrl: string,
  remembered: boolean
): HTMLElement {
  const header = createSavedItemHeader(record.authorName, channelUrl, remembered);
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

function createSavedItemHeader(
  authorName: string,
  channelUrl: string,
  remembered: boolean
): HTMLElement {
  const name = authorName || getExtensionMessage('unknownUser');
  const nameClass = `bookmark-name${remembered ? ' bookmark-name-remembered' : ''}`;
  const nameElement = channelUrl
    ? el<HTMLButtonElement>(
        <button
          type="button"
          class={`${nameClass} bookmark-name-button`}
          dir="auto"
          title={getExtensionMessage('openChannel')}
          aria-label={getExtensionMessage('openChannel')}
          onClick={() => chrome.tabs.create({ url: channelUrl })}
        >
          {name}
        </button>
      )
    : el<HTMLElement>(
        <strong class={nameClass} dir="auto">
          {name}
        </strong>
      );

  return el<HTMLSpanElement>(<span class="bookmark-message-header">{nameElement}</span>);
}

function createSavedItemAvatar(
  record: SavedItemAuthor,
  channelUrl: string,
  avatarRing = false,
  animateAvatarRingIn = false,
  animateAvatarRingOut = false
): HTMLElement {
  const content = record.avatarUrl ? (
    <img
      src={record.avatarUrl}
      alt=""
      decoding="async"
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  ) : (
    getSavedItemAuthorInitial(record.authorName)
  );
  const avatarClass = `bookmark-avatar${avatarRing ? ' avatar-ring-avatar' : ''}${
    animateAvatarRingIn ? ' avatar-ring-avatar-in' : ''
  }${animateAvatarRingOut ? ' avatar-ring-avatar-out' : ''}`;
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
  if (animateAvatarRingOut) {
    element.addEventListener(
      'animationend',
      () => element.classList.remove('avatar-ring-avatar-out'),
      { once: true }
    );
  }
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
  discardLastRemovedSavedItems();
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
    lastRemovedSavedItems.delete(getSavedItemId({ key, kind: 'bookmark' }));
  });
}

function removeAvatarRing(key: string): void {
  discardLastRemovedSavedItems();
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
    lastRemovedSavedItems.delete(getSavedItemId({ key, kind: 'avatar-ring' }));
  });
}

function removeSelectedSavedItems(): void {
  const references = Array.from(selectedSavedItems.values());
  if (!references.length) return;

  updateStoredSavedItems(
    (bookmarks, avatarRings) => {
      discardLastRemovedSavedItems();
      const removed = new Map<string, SavedItemReference>();
      let bookmarksChanged = false;
      let avatarRingsChanged = false;

      references.forEach((reference) => {
        if (reference.kind === 'bookmark') {
          const record = bookmarks.get(reference.key);
          if (!record) return;
          recentlyRemovedBookmarks.set(reference.key, record);
          bookmarks.delete(reference.key);
          bookmarksChanged = true;
        } else {
          const record = avatarRings.get(reference.key);
          if (!record) return;
          recentlyRemovedAvatarRings.set(reference.key, record);
          avatarRings.delete(reference.key);
          avatarRingsChanged = true;
        }
        removed.set(getSavedItemId(reference), reference);
      });

      if (removed.size) {
        removed.forEach((reference, id) => lastRemovedSavedItems.set(id, reference));
      }
      selectedSavedItems.clear();
      savedItemsSelectionMode = false;
      return { avatarRingsChanged, bookmarksChanged };
    },
    () => controls.bookmarksUndoButton?.focus()
  );
}

function discardLastRemovedSavedItems(): void {
  lastRemovedSavedItems.forEach((reference) => {
    if (reference.kind === 'bookmark') recentlyRemovedBookmarks.delete(reference.key);
    else recentlyRemovedAvatarRings.delete(reference.key);
  });
  lastRemovedSavedItems.clear();
}

function undoLastRemovedSavedItems(): void {
  const references = Array.from(lastRemovedSavedItems.values());
  if (!references.length) return;

  updateStoredSavedItems(
    (bookmarks, avatarRings) => {
      let bookmarksChanged = false;
      let avatarRingsChanged = false;

      references.forEach((reference) => {
        if (reference.kind === 'bookmark') {
          const record = recentlyRemovedBookmarks.get(reference.key);
          if (record && !bookmarks.has(reference.key)) {
            bookmarks.set(reference.key, record);
            bookmarksChanged = true;
          }
          recentlyRemovedBookmarks.delete(reference.key);
        } else {
          const record = recentlyRemovedAvatarRings.get(reference.key);
          if (record && !avatarRings.has(reference.key)) {
            avatarRings.set(reference.key, record);
            avatarRingsChanged = true;
          }
          recentlyRemovedAvatarRings.delete(reference.key);
        }
      });
      lastRemovedSavedItems.clear();
      return { avatarRingsChanged, bookmarksChanged };
    },
    () => controls.bookmarksSelect?.focus()
  );
}

function updateStoredSavedItems(
  update: (
    bookmarks: Map<string, BookmarkRecord>,
    avatarRings: Map<string, AvatarRingRecord>
  ) => { avatarRingsChanged: boolean; bookmarksChanged: boolean },
  afterUpdate?: () => void
): void {
  chrome.storage.local.get([BOOKMARKS_STORAGE_KEY, AVATAR_RINGS_STORAGE_KEY], (stored) => {
    const values = stored || {};
    const bookmarks = normalizeStoredBookmarks(values[BOOKMARKS_STORAGE_KEY]);
    const avatarRings = normalizeStoredAvatarRings(values[AVATAR_RINGS_STORAGE_KEY]);
    const { avatarRingsChanged, bookmarksChanged } = update(bookmarks, avatarRings);
    currentBookmarks = bookmarks;
    currentAvatarRings = avatarRings;
    savedItemsChanged();

    const changes: Record<string, unknown> = {};
    if (bookmarksChanged) changes[BOOKMARKS_STORAGE_KEY] = serializeBookmarks(bookmarks);
    if (avatarRingsChanged) changes[AVATAR_RINGS_STORAGE_KEY] = serializeAvatarRings(avatarRings);
    if (Object.keys(changes).length) chrome.storage.local.set(changes);
    afterUpdate?.();
  });
}

function updateStoredBookmarks(update: (records: Map<string, BookmarkRecord>) => void): void {
  chrome.storage.local.get({ [BOOKMARKS_STORAGE_KEY]: {} }, (stored) => {
    const records = normalizeStoredBookmarks((stored || {})[BOOKMARKS_STORAGE_KEY]);
    update(records);
    currentBookmarks = records;
    savedItemsChanged();
    chrome.storage.local.set({ [BOOKMARKS_STORAGE_KEY]: serializeBookmarks(records) });
  });
}

function updateStoredAvatarRings(update: (records: Map<string, AvatarRingRecord>) => void): void {
  chrome.storage.local.get({ [AVATAR_RINGS_STORAGE_KEY]: {} }, (stored) => {
    const records = normalizeStoredAvatarRings((stored || {})[AVATAR_RINGS_STORAGE_KEY]);
    update(records);
    currentAvatarRings = records;
    savedItemsChanged();
    chrome.storage.local.set({ [AVATAR_RINGS_STORAGE_KEY]: serializeAvatarRings(records) });
  });
}

function getSavedItemAuthorInitial(authorName: string): string {
  const normalized = authorName.trim().replace(/^@/, '');
  return (normalized[0] || '?').toUpperCase();
}

function formatFullDateTime(timestamp: number): string {
  fullDateTimeFormatter ??= new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
  return fullDateTimeFormatter.format(timestamp);
}

function formatCompactTime(timestamp: number): string {
  compactTimeFormatter ??= new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  });
  return compactTimeFormatter.format(timestamp);
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
