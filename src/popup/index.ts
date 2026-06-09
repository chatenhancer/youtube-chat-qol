/**
 * Extension action popup.
 *
 * Mirrors the most important chat settings outside YouTube's iframe. The popup
 * writes to chrome.storage.sync, and the content script reacts to those same
 * option updates as the injected chat settings menu.
 */
import { LANGUAGE_OPTIONS } from '../shared/languages';
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
import { KNOWN_CHAT_TABS_STORAGE_KEY } from '../shared/known-chat-tabs';
import { playSoftChime } from '../shared/sounds/soft-chime';
import {
  DEFAULT_OPTIONS,
  getPlaygroundDisabledUpdate,
  getTargetLanguageUpdate,
  normalizeOptions,
  type Options
} from '../shared/options';
import contact from '../shared/contact.json';

const LANDING_PAGE_URL = 'https://chatenhancer.com';
const SOURCE_CODE_URL = 'https://www.chatenhancer.com/source';
const SUPPORT_URL = 'https://www.chatenhancer.com/support';
const SUPPORT_EMAIL = contact.supportEmail;
const BELL_RING_CLASS = 'ytcq-bell-ringing';
const TRANSLATION_PULSE_CLASS = 'ytcq-translation-pulse';
const DISPLAY_REFLOW_CLASS = 'ytcq-display-reflow';
const SPARKLE_BURST_CLASS = 'ytcq-sparkle-burst';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const PLAYGROUND_GROUP_COLLAPSED_CLASS = 'playground-group-collapsed';
const PLAYGROUND_GROUP_ANIMATION_MS = 180;

type ExtensionStatus = 'checking' | 'active' | 'inactive';

interface ActiveChatTabsResponse {
  activeTabIds?: unknown;
}

const controls = {
  landingLink: document.querySelector<HTMLAnchorElement>('#landingLink'),
  sourceCodeLink: document.querySelector<HTMLAnchorElement>('#sourceCodeLink'),
  supportLink: document.querySelector<HTMLAnchorElement>('#supportLink'),
  resetExtension: document.querySelector<HTMLButtonElement>('#resetExtension'),
  tabs: Array.from(document.querySelectorAll<HTMLButtonElement>('[data-popup-tab-target]')),
  tabPanels: Array.from(document.querySelectorAll<HTMLElement>('[data-popup-tab-panel]')),
  extensionStatus: document.querySelector<HTMLElement>('[data-extension-status]'),
  extensionStatusText: document.querySelector<HTMLElement>('[data-extension-status-text]'),
  bookmarksCount: document.querySelector<HTMLElement>('#bookmarksCount'),
  bookmarksList: document.querySelector<HTMLElement>('#bookmarksList'),
  targetLanguage: document.querySelector<HTMLSelectElement>('#targetLanguage'),
  translationDisplay: document.querySelector<HTMLSelectElement>('#translationDisplay'),
  sound: document.querySelector<HTMLInputElement>('#sound'),
  startupEffect: document.querySelector<HTMLInputElement>('#startupEffect'),
  playgroundEnabled: document.querySelector<HTMLInputElement>('#playgroundEnabled'),
  playgroundGamesSection: document.querySelector<HTMLElement>('#playgroundGamesSection'),
  playgroundGamesAvailable: document.querySelector<HTMLInputElement>('#playgroundGamesAvailable'),
  version: document.querySelector<HTMLElement>('#version')
};

let lastKnownTranslationTarget = DEFAULT_OPTIONS.lastTranslationTarget;
let playgroundGamesVisibilityToken = 0;
const recentlyUnmarkedBookmarks = new Map<string, MarkedUserRecord>();

init();

function init(): void {
  const popupLocale = localizePopup();
  initPopupTabs();
  initOptionHelperLinks();
  initExtensionStatus();
  initBookmarksPanel();

  if (
    !controls.targetLanguage ||
    !controls.translationDisplay ||
    !controls.sound ||
    !controls.startupEffect ||
    !controls.playgroundEnabled ||
    !controls.playgroundGamesSection ||
    !controls.playgroundGamesAvailable
  ) {
    return;
  }

  if (controls.version) {
    controls.version.textContent = `v${chrome.runtime.getManifest().version}`;
  }

  controls.landingLink?.addEventListener('click', (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: LANDING_PAGE_URL });
  });
  controls.sourceCodeLink?.addEventListener('click', (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: SOURCE_CODE_URL });
  });
  controls.supportLink?.addEventListener('click', (event) => {
    event.preventDefault();
    const confirmed = window.confirm(getExtensionMessage('supportIssueTrackerPrompt', SUPPORT_EMAIL));
    if (!confirmed) return;
    chrome.tabs.create({ url: SUPPORT_URL });
  });

  controls.resetExtension?.addEventListener('click', resetExtensionState);

  controls.targetLanguage.appendChild(createLanguageOption('', getExtensionMessage('off')));
  for (const [value, label] of LANGUAGE_OPTIONS) {
    controls.targetLanguage.appendChild(createLanguageOption(value, getLocalizedLanguageLabel(value, popupLocale) || label));
  }

  chrome.storage.sync.get(DEFAULT_OPTIONS, (storedOptions: Partial<Options>) => {
    if (
      !controls.targetLanguage ||
      !controls.translationDisplay ||
      !controls.sound ||
      !controls.startupEffect ||
      !controls.playgroundEnabled ||
      !controls.playgroundGamesSection ||
      !controls.playgroundGamesAvailable
    ) {
      return;
    }
    applyOptionsToControls(storedOptions);
  });

  controls.targetLanguage.addEventListener('change', () => {
    const targetLanguage = controls.targetLanguage?.value || '';
    if (targetLanguage) {
      lastKnownTranslationTarget = targetLanguage;
      animatePopupTranslationIcon();
    }
    save(getTargetLanguageUpdate(targetLanguage, lastKnownTranslationTarget));
  });

  controls.translationDisplay.addEventListener('change', () => {
    animatePopupDisplayIcon();
    save({ translationDisplay: controls.translationDisplay?.value as Options['translationDisplay'] });
  });

  controls.sound.addEventListener('change', () => {
    const enabled = Boolean(controls.sound?.checked);
    if (enabled) {
      animatePopupSoundIcon();
      playSoftChime();
    }
    save({ sound: enabled });
  });

  controls.startupEffect.addEventListener('change', () => {
    const enabled = Boolean(controls.startupEffect?.checked);
    if (enabled) animatePopupStartupEffectIcon();
    save({ startupEffect: enabled });
  });

  controls.playgroundEnabled.addEventListener('change', () => {
    const enabled = Boolean(controls.playgroundEnabled?.checked);
    if (!enabled) clearPlaygroundOptionControls();
    updatePlaygroundGamesVisibility(enabled, true);
    save(enabled ? { playgroundEnabled: true } : getPlaygroundDisabledUpdate());
  });

  controls.playgroundGamesAvailable.addEventListener('change', () => {
    save({ playgroundGamesAvailable: Boolean(controls.playgroundGamesAvailable?.checked) });
  });
}

function initPopupTabs(): void {
  controls.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.popupTabTarget;
      if (targetId) selectPopupTab(targetId);
    });
  });
}

function initOptionHelperLinks(): void {
  document.querySelectorAll<HTMLAnchorElement>('.option-helper-link').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  });
}

function selectPopupTab(targetId: string): void {
  controls.tabs.forEach((tab) => {
    const active = tab.dataset.popupTabTarget === targetId;
    tab.classList.toggle('popup-tab-active', active);
    tab.setAttribute('aria-selected', String(active));
  });

  controls.tabPanels.forEach((panel) => {
    panel.hidden = panel.id !== targetId;
  });
}

function initBookmarksPanel(): void {
  if (!controls.bookmarksCount || !controls.bookmarksList) return;

  refreshBookmarkedUsers();
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[MARKED_USERS_STORAGE_KEY]) {
      renderBookmarkedUsers(normalizeStoredMarkedUsers(changes[MARKED_USERS_STORAGE_KEY].newValue));
    }
  });
}

function initExtensionStatus(): void {
  refreshExtensionStatus();
  chrome.storage.onChanged.addListener(handleExtensionStatusStorageChange);
}

function handleExtensionStatusStorageChange(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string
): void {
  if (areaName !== 'local' || !changes[KNOWN_CHAT_TABS_STORAGE_KEY]) return;
  refreshExtensionStatus();
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

function save(values: Partial<Options>): void {
  chrome.storage.sync.set(values);
}

function animatePopupSoundIcon(): void {
  animatePopupIcon('.sound-icon', BELL_RING_CLASS, 700);
}

function animatePopupTranslationIcon(): void {
  animatePopupIcon('.translation-target-icon', TRANSLATION_PULSE_CLASS, 900);
}

function animatePopupDisplayIcon(): void {
  animatePopupIcon('.translation-display-icon', DISPLAY_REFLOW_CLASS, 900);
}

function animatePopupStartupEffectIcon(): void {
  animatePopupIcon('.startup-effect-icon', SPARKLE_BURST_CLASS, 1000);
}

function animatePopupIcon(selector: string, className: string, durationMs: number): void {
  const icon = document.querySelector<SVGSVGElement>(selector);
  if (!icon || prefersReducedMotion()) return;

  icon.classList.remove(className);
  void icon.getBoundingClientRect();
  icon.classList.add(className);
  window.setTimeout(() => {
    icon.classList.remove(className);
  }, durationMs);
}

function refreshExtensionStatus(): void {
  setExtensionStatus('checking', getExtensionMessage('extensionStatusChecking'), getExtensionMessage('extensionStatusCheckingHelper'));

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTabId = tabs[0]?.id;
    refreshGlobalExtensionStatus(typeof currentTabId === 'number' ? currentTabId : null);
  });
}

function refreshGlobalExtensionStatus(currentTabId: number | null): void {
  chrome.tabs.query({}, (tabs) => {
    const tabIds = tabs
      .map((tab) => tab.id)
      .filter((tabId): tabId is number => typeof tabId === 'number');

    if (!tabIds.length) {
      updateExtensionStatusSummary(new Set(), currentTabId);
      return;
    }

    const openTabIds = new Set(tabIds);
    chrome.runtime.sendMessage({ type: 'ytcq:get-active-chat-tabs' }, (response?: ActiveChatTabsResponse) => {
      const activeTabIds = chrome.runtime.lastError
        ? new Set<number>()
        : getOpenActiveChatTabIds(response, openTabIds);
      updateExtensionStatusSummary(activeTabIds, currentTabId);
    });
  });
}

function getOpenActiveChatTabIds(response: ActiveChatTabsResponse | undefined, openTabIds: Set<number>): Set<number> {
  if (!Array.isArray(response?.activeTabIds)) return new Set();
  return new Set(response.activeTabIds.filter((tabId): tabId is number => {
    return typeof tabId === 'number' && openTabIds.has(tabId);
  }));
}

function updateExtensionStatusSummary(activeTabIds: Set<number>, currentTabId: number | null): void {
  const currentActive = typeof currentTabId === 'number' && activeTabIds.has(currentTabId);
  const otherCount = activeTabIds.size - (currentActive ? 1 : 0);
  const connectedHelper = getExtensionMessage('extensionStatusConnected');

  if (currentActive && otherCount === 0) {
    setExtensionStatus('active', getExtensionMessage('extensionStatusActiveCurrent'), connectedHelper);
    return;
  }

  if (currentActive && otherCount === 1) {
    setExtensionStatus('active', getExtensionMessage('extensionStatusActiveCurrentAndOne'), connectedHelper);
    return;
  }

  if (currentActive && otherCount > 1) {
    setExtensionStatus('active', getExtensionMessage('extensionStatusActiveCurrentAndMany', String(otherCount)), connectedHelper);
    return;
  }

  if (otherCount === 1) {
    setExtensionStatus('active', getExtensionMessage('extensionStatusActiveOneOther'), connectedHelper);
    return;
  }

  if (otherCount > 1) {
    setExtensionStatus('active', getExtensionMessage('extensionStatusActiveManyOther', String(otherCount)), connectedHelper);
    return;
  }

  setExtensionStatus('inactive', getExtensionMessage('extensionStatusInactiveAll'), getExtensionMessage('extensionStatusDisconnected'));
}

function setExtensionStatus(status: ExtensionStatus, text: string, helper: string): void {
  const ariaStatusText = helper ? `${text}. ${helper}` : text;
  if (controls.extensionStatus) {
    controls.extensionStatus.dataset.extensionStatus = status;
    controls.extensionStatus.title = helper || text;
    controls.extensionStatus.setAttribute('aria-label', ariaStatusText);
  }
  if (controls.extensionStatusText) {
    controls.extensionStatusText.textContent = text;
  }
}

function resetExtensionState(): void {
  const confirmed = window.confirm(getExtensionMessage('popupResetConfirm'));
  if (!confirmed) return;

  chrome.storage.local.clear(() => {
    chrome.storage.sync.clear(() => {
      chrome.storage.sync.set(DEFAULT_OPTIONS, () => {
        applyOptionsToControls(DEFAULT_OPTIONS);
        broadcastPageReset(() => {
          window.alert(getExtensionMessage('popupResetComplete'));
        });
      });
    });
  });
}

function broadcastPageReset(callback: () => void): void {
  chrome.tabs.query({}, (tabs) => {
    let pending = tabs.filter((tab) => typeof tab.id === 'number').length;
    if (!pending) {
      callback();
      return;
    }

    tabs.forEach((tab) => {
      if (typeof tab.id !== 'number') return;
      chrome.tabs.sendMessage(tab.id, { type: 'ytcq:reset-page' }, () => {
        void chrome.runtime.lastError;
        pending -= 1;
        if (!pending) callback();
      });
    });
  });
}

function applyOptionsToControls(options: Partial<Options>): void {
  if (
    !controls.targetLanguage ||
    !controls.translationDisplay ||
    !controls.sound ||
    !controls.startupEffect ||
    !controls.playgroundEnabled ||
    !controls.playgroundGamesSection ||
    !controls.playgroundGamesAvailable
  ) {
    return;
  }

  const normalized = normalizeOptions(options);
  lastKnownTranslationTarget = normalized.lastTranslationTarget;
  controls.targetLanguage.value = normalized.targetLanguage;
  controls.translationDisplay.value = normalized.translationDisplay;
  controls.sound.checked = normalized.sound;
  controls.startupEffect.disabled = prefersReducedMotion();
  controls.startupEffect.checked = normalized.startupEffect && !controls.startupEffect.disabled;
  controls.playgroundEnabled.checked = normalized.playgroundEnabled;
  controls.playgroundGamesAvailable.checked = normalized.playgroundEnabled && normalized.playgroundGamesAvailable;
  updatePlaygroundGamesVisibility(normalized.playgroundEnabled);
}

function updatePlaygroundGamesVisibility(playgroundEnabled: boolean, animated = false): void {
  const section = controls.playgroundGamesSection;
  if (!section) return;

  const token = ++playgroundGamesVisibilityToken;
  const shouldAnimate = animated && !prefersReducedMotion();

  if (playgroundEnabled) {
    section.hidden = false;
    if (!shouldAnimate) {
      section.classList.remove(PLAYGROUND_GROUP_COLLAPSED_CLASS);
      return;
    }

    section.classList.add(PLAYGROUND_GROUP_COLLAPSED_CLASS);
    window.setTimeout(() => {
      if (token === playgroundGamesVisibilityToken) {
        section.classList.remove(PLAYGROUND_GROUP_COLLAPSED_CLASS);
      }
    }, 0);
    return;
  }

  section.classList.add(PLAYGROUND_GROUP_COLLAPSED_CLASS);
  if (!shouldAnimate) {
    section.hidden = true;
    return;
  }

  window.setTimeout(() => {
    if (token === playgroundGamesVisibilityToken) section.hidden = true;
  }, PLAYGROUND_GROUP_ANIMATION_MS);
}

function clearPlaygroundOptionControls(): void {
  if (controls.playgroundGamesAvailable) {
    controls.playgroundGamesAvailable.checked = false;
  }
}

function createLanguageOption(value: string, label: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function localizePopup(): string {
  const popupLocale = getBrowserUiLocale();
  document.documentElement.lang = popupLocale;

  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    if (key) element.textContent = getExtensionMessage(key);
  });

  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((element) => {
    const key = element.dataset.i18nTitle;
    if (key) element.title = getExtensionMessage(key);
  });

  document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach((element) => {
    const key = element.dataset.i18nAriaLabel;
    if (key) element.setAttribute('aria-label', getExtensionMessage(key));
  });

  return popupLocale;
}

function getBrowserUiLocale(): string {
  return chrome.i18n?.getUILanguage?.() || navigator.language || 'en';
}

function getExtensionMessage(key: string, substitutions?: string | string[]): string {
  return chrome.i18n?.getMessage?.(key, substitutions) || key;
}

function getLocalizedLanguageLabel(languageCode: string, locale: string): string {
  try {
    const displayName = new Intl.DisplayNames([locale], { type: 'language' }).of(languageCode);
    if (displayName) return displayName;
  } catch {
    // Fall back to the static English catalog from LANGUAGE_OPTIONS.
  }

  return '';
}

function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}
