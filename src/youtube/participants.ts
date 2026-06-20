/**
 * YouTube participant-list adapter.
 *
 * Centralizes extraction of author, channel, and avatar details from
 * `yt-live-chat-participant-renderer` rows so features do not duplicate
 * participant-list DOM assumptions.
 */
import { cleanText } from '../shared/text';
import {
  cleanAuthorNameText,
  getAuthorNameFromElement
} from './authors';

export function getParticipantAuthorName(participant: HTMLElement): string {
  return getAuthorNameFromElement(participant.querySelector('[id="author-name"], a[href*="/channel/"], a[href^="/@"]')) ||
    cleanAuthorNameText(participant.textContent);
}

export function getParticipantChannelId(participant: HTMLElement): string {
  const authorName = participant.querySelector<HTMLElement>('[id="author-name"], a[href*="/channel/"], a[href^="/@"]');
  const authorLink = authorName?.closest<HTMLAnchorElement>('a[href]');
  const candidateLinks = [
    authorName instanceof HTMLAnchorElement ? authorName : null,
    authorLink,
    participant.querySelector<HTMLAnchorElement>('a[href*="/channel/"]')
  ];

  for (const link of candidateLinks) {
    const channelId = getChannelIdFromHref(link?.getAttribute('href') || '');
    if (channelId) return channelId;
  }

  return '';
}

export function getParticipantAvatarElement(participant: HTMLElement): HTMLElement | null {
  return participant.querySelector<HTMLElement>('yt-img-shadow, img#img, img');
}

export function getParticipantAvatarSrc(participant: HTMLElement): string {
  return participant.querySelector<HTMLImageElement>('yt-img-shadow img, img#img, img')?.src || '';
}

function getChannelIdFromHref(href: string): string {
  const cleanHref = cleanText(href);
  if (!cleanHref) return '';

  try {
    const url = new URL(cleanHref, 'https://www.youtube.com');
    const [kind, channelId] = url.pathname.split('/').filter(Boolean);
    return kind === 'channel' ? cleanText(channelId) : '';
  } catch {
    return '';
  }
}
