/** Browser-local avatar rings selected explicitly from recent-message profiles. */
import { registerFeature } from '../../content/feature-runtime';
import {
  AVATAR_RINGS_STORAGE_KEY,
  getAvatarRingColor,
  getAvatarRingKey,
  normalizeAvatarRingIdentity,
  normalizeStoredAvatarRings,
  serializeAvatarRings,
  type AvatarRingIdentity,
  type AvatarRingRecord
} from '../../shared/avatar-rings';
import { createAvatarRingIcon } from '../../shared/icons';
import { getUiLocale, t } from '../../shared/i18n';
import { jsx, el } from '../../shared/jsx-dom';
import { cleanText } from '../../shared/text';
import { getAuthorChannelId, getAuthorName, getMessageStableId } from '../../youtube/messages';
import { requestRenderedYouTubeChatFeedRecord } from '../../youtube/chat-feed/records';
import {
  getParticipantAuthorName,
  getParticipantAvatarElement,
  getParticipantChannelId
} from '../../youtube/participants';

export { AVATAR_RINGS_STORAGE_KEY, getAvatarRingColor } from '../../shared/avatar-rings';

const avatarRings = new Map<string, AvatarRingRecord>();
let avatarRingsActive = false;
let loadPromise: Promise<void> | null = null;
let storageListenerWired = false;

registerFeature({
  page: {
    init: initAvatarRings,
    cleanup: cleanupAvatarRings
  },
  message: renderMessageAvatarRing,
  participant: renderParticipantAvatarRing
});

export function initAvatarRings(): void {
  avatarRingsActive = true;
  if (!storageListenerWired) {
    chrome.storage.onChanged.addListener(handleAvatarRingsStorageChange);
    storageListenerWired = true;
  }
  void ensureAvatarRingsLoaded().then(() => {
    if (avatarRingsActive) refreshAvatarRings();
  });
}

export function isAvatarRingEnabled(identity: AvatarRingIdentity): boolean {
  return Boolean(findAvatarRing(identity));
}

export async function toggleAvatarRing(identity: AvatarRingIdentity): Promise<boolean> {
  await ensureAvatarRingsLoaded();
  const normalized = normalizeAvatarRingIdentity(identity);
  if (!normalized) return false;

  const key = getAvatarRingKey(normalized);
  if (!key) return false;

  const matches = findAvatarRings(normalized);
  if (matches.length) {
    matches.forEach(([matchedKey]) => avatarRings.delete(matchedKey));
  } else {
    avatarRings.set(key, { ...normalized, addedAt: Date.now() });
  }

  await saveAvatarRings();
  refreshAvatarRings();
  return !matches.length;
}

export function createAvatarRingToggleButton(identity: AvatarRingIdentity): HTMLButtonElement {
  const button = el<HTMLButtonElement>(
    <button
      type="button"
      class="ytcq-profile-card-header-button ytcq-avatar-ring-toggle"
      onClick={(event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        const target = event.currentTarget as HTMLButtonElement;
        void toggleAvatarRing(identity).then(() => updateAvatarRingToggleButton(target, identity));
      }}
    >
      {createAvatarRingIcon()}
    </button>
  );
  button.dataset.ytcqAvatarRingToggleName = cleanText(identity.authorName);
  button.dataset.ytcqAvatarRingToggleChannelId = cleanText(identity.channelId);
  updateAvatarRingToggleButton(button, identity);
  void ensureAvatarRingsLoaded().then(() => updateAvatarRingToggleButton(button, identity));
  return button;
}

export function applyAvatarRing(target: HTMLElement | null, identity: AvatarRingIdentity): void {
  if (!target) return;

  const normalized = normalizeAvatarRingIdentity(identity);
  if (!normalized) {
    clearAvatarRing(target);
    return;
  }

  const match = findAvatarRing(normalized);
  const key = match?.[0] || getAvatarRingKey(normalized);
  if (!key) {
    clearAvatarRing(target);
    return;
  }

  target.dataset.ytcqAvatarRingKey = key;
  target.dataset.ytcqAvatarRingName = normalized.authorName || key;
  target.dataset.ytcqAvatarRingChannelId = normalized.channelId || '';
  target.style.setProperty('--ytcq-avatar-ring-color', getAvatarRingColor(normalized));
  target.classList.add('ytcq-avatar-ring-target');
  target.classList.toggle('ytcq-avatar-ring-active', Boolean(match));
}

export function refreshAvatarRings(): void {
  document.querySelectorAll<HTMLElement>('[data-ytcq-avatar-ring-key]').forEach((target) => {
    const identity = getAvatarRingTargetIdentity(target);
    const normalized = normalizeAvatarRingIdentity(identity);
    if (!normalized) {
      clearAvatarRing(target);
      return;
    }

    const match = findAvatarRing(normalized);
    target.dataset.ytcqAvatarRingKey = match?.[0] || getAvatarRingKey(normalized);
    target.style.setProperty(
      '--ytcq-avatar-ring-color',
      getAvatarRingColor(match?.[1] || normalized)
    );
    target.classList.toggle('ytcq-avatar-ring-active', Boolean(match));
  });

  document.querySelectorAll<HTMLButtonElement>('.ytcq-avatar-ring-toggle').forEach((button) => {
    updateAvatarRingToggleButton(button, {
      authorName: button.dataset.ytcqAvatarRingToggleName,
      channelId: button.dataset.ytcqAvatarRingToggleChannelId
    });
  });
}

export function cleanupAvatarRings(): void {
  avatarRingsActive = false;
  if (storageListenerWired) {
    chrome.storage.onChanged.removeListener(handleAvatarRingsStorageChange);
    storageListenerWired = false;
  }
  document
    .querySelectorAll<HTMLElement>(
      '[data-ytcq-avatar-ring-key], .ytcq-avatar-ring-target, .ytcq-avatar-ring-active'
    )
    .forEach(clearAvatarRing);
}

export function getAvatarRingIdentityFromMessage(message: HTMLElement): AvatarRingIdentity | null {
  const authorName = getAuthorName(message);
  if (!authorName) return null;
  return {
    authorName,
    channelId: getAuthorChannelId(message) || undefined
  };
}

function getAvatarRingIdentityFromParticipant(participant: HTMLElement): AvatarRingIdentity | null {
  const authorName = getParticipantAuthorName(participant);
  if (!authorName) return null;
  return {
    authorName,
    channelId: getParticipantChannelId(participant) || undefined
  };
}

function renderMessageAvatarRing(message: HTMLElement): void {
  const identity = getAvatarRingIdentityFromMessage(message);
  const avatar = message.querySelector<HTMLElement>('#author-photo');
  if (!identity || !avatar) return;

  applyAvatarRing(avatar, identity);
  const messageId = getMessageStableId(message);
  if (!messageId) return;
  void requestRenderedYouTubeChatFeedRecord(message).then((record) => {
    if (!avatarRingsActive || !message.isConnected || !avatar.isConnected || !record) return;
    if (record.id !== messageId || getMessageStableId(message) !== messageId) return;
    applyAvatarRing(avatar, {
      authorName: record.author?.name || identity.authorName,
      channelId: record.author?.channelId || identity.channelId
    });
  });
}

function renderParticipantAvatarRing(participant: HTMLElement): void {
  const identity = getAvatarRingIdentityFromParticipant(participant);
  const avatar = getParticipantAvatarElement(participant);
  if (identity && avatar) applyAvatarRing(avatar, identity);
}

function updateAvatarRingToggleButton(
  button: HTMLButtonElement,
  identity: AvatarRingIdentity
): void {
  const match = findAvatarRing(identity);
  const enabled = Boolean(match);
  const actionLabel = t(enabled ? 'removeAvatarRing' : 'addAvatarRing');
  const addedAt = Number(match?.[1].addedAt);
  const label =
    enabled && Number.isFinite(addedAt) && addedAt > 0
      ? `${actionLabel}\n${t('avatarRingAddedDate', { date: formatAvatarRingActionDate(addedAt) })}`
      : actionLabel;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-pressed', String(enabled));
  button.style.setProperty('--ytcq-avatar-ring-color', getAvatarRingColor(match?.[1] || identity));
  button.classList.toggle('ytcq-avatar-ring-toggle-active', enabled);

  const icon = createAvatarRingIcon(enabled);
  const currentIcon = button.querySelector('svg');
  if (currentIcon) currentIcon.replaceWith(icon);
  else button.prepend(icon);
}

function formatAvatarRingActionDate(timestamp: number): string {
  return new Intl.DateTimeFormat(getUiLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(timestamp);
}

function ensureAvatarRingsLoaded(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    chrome.storage.local.get({ [AVATAR_RINGS_STORAGE_KEY]: {} }, (stored) => {
      replaceAvatarRings(normalizeStoredAvatarRings((stored || {})[AVATAR_RINGS_STORAGE_KEY]));
      resolve();
    });
  });
  return loadPromise;
}

function saveAvatarRings(): Promise<void> {
  const stored = serializeAvatarRings(avatarRings);
  return new Promise((resolve) => {
    chrome.storage.local.set({ [AVATAR_RINGS_STORAGE_KEY]: stored }, resolve);
  });
}

function handleAvatarRingsStorageChange(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string
): void {
  if (areaName !== 'local' || !changes[AVATAR_RINGS_STORAGE_KEY]) return;
  replaceAvatarRings(normalizeStoredAvatarRings(changes[AVATAR_RINGS_STORAGE_KEY].newValue));
  refreshAvatarRings();
}

function replaceAvatarRings(records: Map<string, AvatarRingRecord>): void {
  avatarRings.clear();
  records.forEach((record, key) => avatarRings.set(key, record));
}

function findAvatarRing(identity: AvatarRingIdentity): [string, AvatarRingRecord] | null {
  return findAvatarRings(identity)[0] || null;
}

function findAvatarRings(identity: AvatarRingIdentity): [string, AvatarRingRecord][] {
  const normalized = normalizeAvatarRingIdentity(identity);
  if (!normalized) return [];

  const matches: [string, AvatarRingRecord][] = [];
  const matchedKeys = new Set<string>();
  const remember = (key: string): void => {
    if (!key || matchedKeys.has(key)) return;
    const record = avatarRings.get(key);
    if (!record) return;
    matchedKeys.add(key);
    matches.push([key, record]);
  };

  remember(getAvatarRingKey(normalized));
  const authorKey = getAvatarRingKey({ authorName: normalized.authorName });
  remember(authorKey);
  if (!normalized.channelId && authorKey) {
    avatarRings.forEach((record, key) => {
      if (getAvatarRingKey({ authorName: record.authorName }) === authorKey) remember(key);
    });
  }
  return matches;
}

function getAvatarRingTargetIdentity(target: HTMLElement): AvatarRingIdentity {
  const key = target.dataset.ytcqAvatarRingKey || '';
  const channelId =
    target.dataset.ytcqAvatarRingChannelId ||
    (key.startsWith('channel:') ? key.slice('channel:'.length) : '');
  return {
    authorName: target.dataset.ytcqAvatarRingName || '',
    channelId
  };
}

function clearAvatarRing(target: HTMLElement): void {
  target.classList.remove('ytcq-avatar-ring-target', 'ytcq-avatar-ring-active');
  target.style.removeProperty('--ytcq-avatar-ring-color');
  delete target.dataset.ytcqAvatarRingChannelId;
  delete target.dataset.ytcqAvatarRingKey;
  delete target.dataset.ytcqAvatarRingName;
}
