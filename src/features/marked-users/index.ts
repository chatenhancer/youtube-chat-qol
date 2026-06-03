/**
 * Marked user rings.
 *
 * Stores a browser-local list of globally marked chat users and applies a
 * stable username-derived avatar ring wherever those users appear.
 */
import { registerFeatureLifecycle } from '../../content/lifecycle';
import {
  BOOKMARK_FILLED_ICON_PATH,
  BOOKMARK_ICON_PATH,
  createSvgIcon,
  MATERIAL_ICON_VIEW_BOX
} from '../../shared/icons';
import { t } from '../../shared/i18n';
import { ytcqCreateElement } from '../../shared/managed-dom';
import {
  getMarkedUserColor,
  getMarkedUserKey,
  isBetterMarkedUserAvatarUrl,
  MARKED_USERS_STORAGE_KEY,
  normalizeMarkedIdentity,
  normalizeStoredMarkedUsers,
  serializeMarkedUsers,
  type MarkedUserIdentity,
  type MarkedUserRecord
} from '../../shared/marked-users';
import { cleanText } from '../../shared/text';
import { getAuthorChannelId, getAuthorName, getMessageAvatarSrc } from '../../youtube/messages';
import {
  getParticipantAuthorName,
  getParticipantAvatarElement,
  getParticipantAvatarSrc,
  getParticipantChannelId
} from '../../youtube/participants';
import { CHAT_MESSAGE_SELECTOR, PARTICIPANT_SELECTOR } from '../../youtube/selectors';
import { getCurrentYouTubeChatSourceTitle, getCurrentYouTubeChatSourceUrl } from '../../youtube/source-url';

export { getMarkedUserColor, MARKED_USERS_STORAGE_KEY } from '../../shared/marked-users';

const markedUsers = new Map<string, MarkedUserRecord>();
let loadPromise: Promise<void> | null = null;
let ringAnimationId = 0;
let ringTargetId = 0;

registerFeatureLifecycle({
  page: {
    init: initMarkedUsers,
    cleanupStale: cleanupStaleMarkedUsers
  },
  message: { render: renderMarkedUserMessageRing },
  participant: { enhance: renderMarkedUserParticipantRing }
});

export function initMarkedUsers(): void {
  void ensureMarkedUsersLoaded().then(refreshMarkedUserRings);
  chrome.storage.onChanged.addListener(handleMarkedUsersStorageChange);
}

export function isMarkedUser(identity: MarkedUserIdentity): boolean {
  const key = getMarkedUserKey(identity);
  return Boolean(key && markedUsers.has(key));
}

export async function toggleMarkedUser(identity: MarkedUserIdentity): Promise<boolean> {
  await ensureMarkedUsersLoaded();

  const normalized = normalizeMarkedIdentity(identity);
  if (!normalized) return false;

  const key = getMarkedUserKey(normalized);
  if (!key) return false;

  if (markedUsers.has(key)) {
    markedUsers.delete(key);
    await saveMarkedUsers();
    refreshMarkedUserRings();
    return false;
  }

  markedUsers.set(key, {
    authorName: normalized.authorName || '',
    avatarUrl: normalized.avatarUrl,
    channelId: normalized.channelId,
    markedAt: Date.now(),
    markedSourceTitle: getCurrentYouTubeChatSourceTitle() || undefined,
    markedSourceUrl: getCurrentYouTubeChatSourceUrl() || undefined
  });
  await saveMarkedUsers();
  refreshMarkedUserRings();
  return true;
}

export function getMarkedUserIdentityFromMessage(message: HTMLElement): MarkedUserIdentity | null {
  const authorName = getAuthorName(message);
  if (!authorName) return null;

  return {
    authorName,
    avatarUrl: getMessageAvatarSrc(message) || undefined,
    channelId: getAuthorChannelId(message) || undefined
  };
}

export function getMarkedUserIdentityFromParticipant(participant: HTMLElement): MarkedUserIdentity | null {
  const authorName = getParticipantAuthorName(participant);
  if (!authorName) return null;

  return {
    authorName,
    avatarUrl: getParticipantAvatarSrc(participant) || undefined,
    channelId: getParticipantChannelId(participant) || undefined
  };
}

export function isMessageAuthorMarked(message: HTMLElement): boolean {
  const identity = getMarkedUserIdentityFromMessage(message);
  return Boolean(identity && isMarkedUser(identity));
}

export function getMessageAuthorMarkTitle(message: HTMLElement): string {
  const identity = getMarkedUserIdentityFromMessage(message);
  return identity ? getMarkedUserActionTitle(identity) : t('markUser');
}

export async function toggleMessageAuthorMark(message: HTMLElement): Promise<boolean> {
  const identity = getMarkedUserIdentityFromMessage(message);
  return identity ? toggleMarkedUser(identity) : false;
}

export function createMarkedUserToggleButton(identity: MarkedUserIdentity): HTMLButtonElement {
  const button = ytcqCreateElement('button');
  button.type = 'button';
  button.className = 'ytcq-profile-card-header-button ytcq-marked-user-toggle';
  button.dataset.ytcqMarkedUserToggleName = cleanText(identity.authorName);
  button.dataset.ytcqMarkedUserToggleAvatarUrl = cleanText(identity.avatarUrl);
  button.dataset.ytcqMarkedUserToggleChannelId = cleanText(identity.channelId);
  button.append(createMarkedUserIcon());
  updateMarkedUserToggleButton(button, identity);
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void toggleMarkedUser(identity).then(() => updateMarkedUserToggleButton(button, identity));
  });
  return button;
}

export function applyMarkedUserRing(target: HTMLElement | null, identity: MarkedUserIdentity): void {
  if (!target) return;

  const normalized = normalizeMarkedIdentity(identity);
  if (!normalized) {
    clearMarkedUserRing(target);
    return;
  }

  const key = getMarkedUserKey(normalized);
  if (!key) {
    clearMarkedUserRing(target);
    return;
  }

  const hadSameKey = target.dataset.ytcqMarkedUserKey === key;
  target.dataset.ytcqMarkedUserKey = key;
  target.dataset.ytcqMarkedUserName = normalized.authorName || key;
  target.style.setProperty('--ytcq-marked-user-color', getMarkedUserColor(normalized));
  target.classList.add('ytcq-markable-user-avatar');
  maybeRefreshMarkedUserAvatar(normalized);
  setMarkedUserRingState(target, markedUsers.has(key), hadSameKey);
}

export function refreshMarkedUserRings(): void {
  document.querySelectorAll<HTMLElement>('[data-ytcq-marked-user-key]').forEach((target) => {
    const key = target.dataset.ytcqMarkedUserKey || '';
    if (!key) {
      clearMarkedUserRing(target);
      return;
    }

    const record = markedUsers.get(key);
    target.style.setProperty(
      '--ytcq-marked-user-color',
      getMarkedUserColor(record || { authorName: target.dataset.ytcqMarkedUserName || key, markedAt: 0 })
    );
    setMarkedUserRingState(target, Boolean(record), true);
  });

  document.querySelectorAll<HTMLButtonElement>('.ytcq-marked-user-toggle').forEach((button) => {
    updateMarkedUserToggleButton(button, {
      authorName: button.dataset.ytcqMarkedUserToggleName || '',
      avatarUrl: button.dataset.ytcqMarkedUserToggleAvatarUrl || undefined,
      channelId: button.dataset.ytcqMarkedUserToggleChannelId || undefined
    });
  });
}

export function cleanupStaleMarkedUsers(): void {
  chrome.storage.onChanged.removeListener(handleMarkedUsersStorageChange);
  document.querySelectorAll<HTMLElement>('.ytcq-marked-user-ring-animation').forEach((element) => element.remove());
  document
    .querySelectorAll<HTMLElement>('[data-ytcq-marked-user-key], .ytcq-markable-user-avatar, .ytcq-marked-user-avatar, .ytcq-marked-user-ring-host')
    .forEach(clearMarkedUserRing);
  document.querySelectorAll<HTMLElement>('.ytcq-marked-user-ring-animation-host').forEach((host) => {
    host.classList.remove('ytcq-marked-user-ring-animation-host');
  });
}

function renderMarkedUserMessageRing(message: HTMLElement): void {
  const identity = getMarkedUserIdentityFromMessage(message);
  const avatar = message.querySelector<HTMLElement>('#author-photo');
  if (!identity || !avatar) return;

  applyMarkedUserRing(avatar, identity);
}

function renderMarkedUserParticipantRing(participant: HTMLElement): void {
  const identity = getMarkedUserIdentityFromParticipant(participant);
  const avatar = getParticipantAvatarElement(participant);
  if (!identity || !avatar) return;

  applyMarkedUserRing(avatar, identity);
}

function updateMarkedUserToggleButton(button: HTMLButtonElement, identity: MarkedUserIdentity): void {
  const marked = isMarkedUser(identity);
  const label = marked ? t('unmarkUser') : t('markUser');
  button.title = getMarkedUserActionTitle(identity, label);
  button.setAttribute('aria-label', label);
  button.classList.toggle('ytcq-marked-user-toggle-active', marked);
  updateMarkedUserToggleIcon(button, marked);
}

function createMarkedUserIcon(iconPath = BOOKMARK_ICON_PATH): SVGSVGElement {
  return createSvgIcon(MATERIAL_ICON_VIEW_BOX, iconPath);
}

function updateMarkedUserToggleIcon(button: HTMLButtonElement, marked: boolean): void {
  const path = button.querySelector('svg path');
  if (path) {
    path.setAttribute('d', marked ? BOOKMARK_FILLED_ICON_PATH : BOOKMARK_ICON_PATH);
    return;
  }

  button.prepend(createMarkedUserIcon(marked ? BOOKMARK_FILLED_ICON_PATH : BOOKMARK_ICON_PATH));
}

function ensureMarkedUsersLoaded(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    chrome.storage.local.get({ [MARKED_USERS_STORAGE_KEY]: {} }, (stored) => {
      replaceMarkedUsers(normalizeStoredMarkedUsers((stored || {})[MARKED_USERS_STORAGE_KEY]));
      resolve();
    });
  });
  return loadPromise;
}

function saveMarkedUsers(): Promise<void> {
  const stored = serializeMarkedUsers(markedUsers);
  return new Promise((resolve) => {
    chrome.storage.local.set({ [MARKED_USERS_STORAGE_KEY]: stored }, resolve);
  });
}

function maybeRefreshMarkedUserAvatar(identity: MarkedUserRecord): void {
  const key = getMarkedUserKey(identity);
  if (!key) return;

  const record = markedUsers.get(key);
  if (!record || !isBetterMarkedUserAvatarUrl(identity.avatarUrl || '', record.avatarUrl)) return;

  record.avatarUrl = identity.avatarUrl;
  void saveMarkedUsers();
}

function handleMarkedUsersStorageChange(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string
): void {
  if (areaName !== 'local' || !changes[MARKED_USERS_STORAGE_KEY]) return;

  replaceMarkedUsers(normalizeStoredMarkedUsers(changes[MARKED_USERS_STORAGE_KEY].newValue));
  refreshMarkedUserRings();
}

function replaceMarkedUsers(records: Map<string, MarkedUserRecord>): void {
  markedUsers.clear();
  records.forEach((record, key) => markedUsers.set(key, record));
}

function getMarkedUserActionTitle(identity: MarkedUserIdentity, label = isMarkedUser(identity) ? t('unmarkUser') : t('markUser')): string {
  const record = getMarkedUserRecord(identity);
  if (!record) return label;

  return [
    label,
    formatMarkedAt(record.markedAt),
    cleanText(record.markedSourceTitle) || cleanText(record.markedSourceUrl)
  ].filter(Boolean).join('\n');
}

function getMarkedUserRecord(identity: MarkedUserIdentity): MarkedUserRecord | null {
  const key = getMarkedUserKey(identity);
  return key ? markedUsers.get(key) || null : null;
}

function formatMarkedAt(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(timestamp);
}

function clearMarkedUserRing(target: HTMLElement): void {
  removeExistingRingAnimations(target);
  target.classList.remove(
    'ytcq-markable-user-avatar',
    'ytcq-marked-user-avatar',
    'ytcq-marked-user-avatar-entering',
    'ytcq-marked-user-ring-host'
  );
  target.style.removeProperty('--ytcq-marked-user-color');
  delete target.dataset.ytcqMarkedUserRingTargetId;
  delete target.dataset.ytcqMarkedUserKey;
  delete target.dataset.ytcqMarkedUserName;
}

function setMarkedUserRingState(target: HTMLElement, marked: boolean, animate: boolean): void {
  const wasMarked = target.classList.contains('ytcq-marked-user-avatar');
  target.classList.toggle('ytcq-marked-user-avatar', marked);

  if (animate && wasMarked !== marked) {
    if (marked) {
      target.classList.add('ytcq-marked-user-avatar-entering');
    } else {
      target.classList.remove('ytcq-marked-user-avatar-entering');
    }
    animateMarkedUserRing(target, marked, () => {
      target.classList.remove('ytcq-marked-user-avatar-entering');
    });
  }
}

function animateMarkedUserRing(target: HTMLElement, marked: boolean, onDone?: () => void): void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    onDone?.();
    return;
  }
  if (!canHostRingAnimation(target)) {
    onDone?.();
    return;
  }

  const overlay = ytcqCreateElement('div');
  overlay.className = `ytcq-marked-user-ring-animation ${marked ? 'ytcq-marked-user-ring-animation-enter' : 'ytcq-marked-user-ring-animation-exit'}`;
  overlay.style.setProperty('--ytcq-marked-user-color', target.style.getPropertyValue('--ytcq-marked-user-color') || '#3ea6ff');
  overlay.dataset.ytcqRingAnimationId = String(++ringAnimationId);
  overlay.dataset.ytcqMarkedUserRingTargetId = getMarkedUserRingTargetId(target);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('aria-hidden', 'true');

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '50');
  circle.setAttribute('cy', '50');
  circle.setAttribute('r', '44');
  circle.setAttribute('pathLength', '100');

  svg.append(circle);
  overlay.append(svg);
  target.classList.add('ytcq-marked-user-ring-host');

  const positionedHost = getNativeRingAnimationHost(target);
  removeExistingRingAnimations(target, positionedHost);
  if (positionedHost) {
    appendPositionedRingAnimation(positionedHost, target, overlay);
  } else {
    target.append(overlay);
  }

  let removed = false;
  const removeOverlay = (): void => {
    if (removed) return;
    removed = true;
    onDone?.();
    overlay.remove();
  };
  overlay.addEventListener('animationend', removeOverlay, { once: true });
  window.setTimeout(removeOverlay, 700);
}

function appendPositionedRingAnimation(host: HTMLElement, target: HTMLElement, overlay: HTMLElement): void {
  const hostRect = host.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  if ((!hostRect.width && !hostRect.height) || !targetRect.width || !targetRect.height) {
    target.append(overlay);
    return;
  }

  const outset = 4;
  overlay.classList.add('ytcq-marked-user-ring-animation-positioned');
  overlay.style.left = `${targetRect.left - hostRect.left - outset}px`;
  overlay.style.top = `${targetRect.top - hostRect.top - outset}px`;
  overlay.style.width = `${targetRect.width + outset * 2}px`;
  overlay.style.height = `${targetRect.height + outset * 2}px`;
  host.classList.add('ytcq-marked-user-ring-animation-host');
  host.append(overlay);
}

function canHostRingAnimation(target: HTMLElement): boolean {
  return !['AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR', 'IMG', 'INPUT', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR'].includes(target.tagName);
}

function getNativeRingAnimationHost(target: HTMLElement): HTMLElement | null {
  const host = target.closest<HTMLElement>(`${CHAT_MESSAGE_SELECTOR}, ${PARTICIPANT_SELECTOR}`);
  return host && host !== target ? host : null;
}

function getMarkedUserRingTargetId(target: HTMLElement): string {
  if (!target.dataset.ytcqMarkedUserRingTargetId) {
    target.dataset.ytcqMarkedUserRingTargetId = String(++ringTargetId);
  }
  return target.dataset.ytcqMarkedUserRingTargetId;
}

function removeExistingRingAnimations(target: HTMLElement, host = getNativeRingAnimationHost(target)): void {
  const targetId = target.dataset.ytcqMarkedUserRingTargetId;
  target.querySelectorAll(':scope > .ytcq-marked-user-ring-animation').forEach((element) => element.remove());
  if (!targetId || !host) return;

  Array.from(host.children).forEach((element) => {
    if (
      element instanceof HTMLElement &&
      element.classList.contains('ytcq-marked-user-ring-animation') &&
      element.dataset.ytcqMarkedUserRingTargetId === targetId
    ) {
      element.remove();
    }
  });
}
