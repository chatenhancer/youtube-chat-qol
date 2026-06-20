/**
 * Focus mode source helpers.
 *
 * Normalizes focused-user identity, avatar data, and mention matching rules for
 * deciding which messages belong in a focused conversation.
 */
import { cleanText, normalizeComparableText } from '../../shared/text';
import { cleanAuthorNameText } from '../../youtube/authors';
import {
  getAuthorChannelId,
  getAuthorName,
  getMessageAvatarSrc
} from '../../youtube/messages';
import { CHAT_MESSAGE_SELECTOR } from '../../youtube/selectors';
import { getAvatarSrcForIdentity } from '../user-message-history';
import type { FocusSource } from './types';

export function getFocusSourceFromMessage(message: HTMLElement): FocusSource | null {
  const authorName = getAuthorName(message);
  if (!authorName) return null;

  return normalizeFocusSource({
    authorName,
    avatarSrc: getMessageAvatarSrc(message),
    channelId: getAuthorChannelId(message)
  });
}

export function normalizeFocusSource(source: FocusSource): FocusSource | null {
  const authorName = cleanAuthorNameText(source.authorName);
  if (!authorName) return null;
  const channelId = cleanText(source.channelId);
  const cleanSource: FocusSource = { authorName, channelId };
  const avatarSrc = cleanText(source.avatarSrc) ||
    getAvatarSrcForIdentity(cleanSource) ||
    getVisibleAvatarSrcForFocusSource(cleanSource);

  return {
    authorName,
    avatarSrc,
    channelId
  };
}

export function isSameFocusSource(a: FocusSource, b: FocusSource): boolean {
  if (a.channelId && b.channelId) return a.channelId === b.channelId;
  return normalizeComparableText(a.authorName) === normalizeComparableText(b.authorName);
}

export function isSelectedFocusAuthor(message: HTMLElement, source: FocusSource): boolean {
  const channelId = getAuthorChannelId(message);
  if (source.channelId && channelId) return source.channelId === channelId;

  return normalizeComparableText(getAuthorName(message)) === normalizeComparableText(source.authorName);
}

export function startsWithFocusMention(text: string, source: FocusSource): boolean {
  const normalizedText = normalizeSearchText(text);
  return getMentionNeedlesForAuthor(source.authorName).some((needle) => (
    normalizedText.startsWith(needle) &&
    !isHandleCharacter(normalizedText[needle.length] || '')
  ));
}

export function getFocusMentionPrefix(source: FocusSource): string {
  const authorName = cleanAuthorNameText(source.authorName);
  return authorName ? `${authorName} ` : '';
}

export function textMentionsFocusSource(text: string, source: FocusSource): boolean {
  return getMentionNeedlesForAuthor(source.authorName)
    .some((needle) => textContainsMentionNeedle(text, needle));
}

export function getAuthorInitial(authorName: string): string {
  return cleanText(authorName).replace(/^@/, '').slice(0, 1).toUpperCase() || '?';
}

function getVisibleAvatarSrcForFocusSource(source: FocusSource): string {
  for (const message of document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR)) {
    if (!isSelectedFocusAuthor(message, source)) continue;

    const avatarSrc = getMessageAvatarSrc(message);
    if (avatarSrc) return avatarSrc;
  }

  return '';
}

function textContainsMentionNeedle(text: string, needle: string): boolean {
  const haystack = normalizeSearchText(text);
  if (!haystack || !needle) return false;

  let index = haystack.indexOf(needle);
  while (index >= 0) {
    const before = index > 0 ? haystack[index - 1] : '';
    const after = haystack[index + needle.length] || '';
    if (!isHandleCharacter(before) && !isHandleCharacter(after)) return true;
    index = haystack.indexOf(needle, index + 1);
  }
  return false;
}

function getMentionNeedlesForAuthor(authorName: string): string[] {
  const normalized = normalizeSearchText(authorName).replace(/^@+/, '');
  if (!normalized || /\s/.test(normalized)) return [];

  return Array.from(new Set([
    `@${normalized}`,
    normalized
  ]));
}

function normalizeSearchText(value: string): string {
  return normalizeComparableText(value);
}

function isHandleCharacter(value: string): boolean {
  return Boolean(value && /[\p{L}\p{N}._-]/u.test(value));
}
