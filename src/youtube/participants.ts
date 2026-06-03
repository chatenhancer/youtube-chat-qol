/**
 * YouTube participant-list adapter.
 *
 * Centralizes extraction of author, channel, and avatar data from
 * `yt-live-chat-participant-renderer` rows so features do not duplicate
 * participant-list DOM assumptions.
 */
import { cleanText } from '../shared/text';
import {
  cleanAuthorNameText,
  getAuthorNameFromElement,
  getAuthorNameFromRendererText
} from './authors';

interface ParticipantRendererData {
  authorExternalChannelId?: string;
  authorChannelId?: string;
  authorName?: {
    simpleText?: string;
    runs?: { text?: string }[];
  };
}

export function getParticipantAuthorName(participant: HTMLElement): string {
  const data = getParticipantRendererData(participant);
  return getAuthorNameFromRendererText(data?.authorName) ||
    getAuthorNameFromElement(participant.querySelector('#author-name')) ||
    cleanAuthorNameText(participant.textContent);
}

export function getParticipantChannelId(participant: HTMLElement): string {
  const data = getParticipantRendererData(participant);
  return cleanText(data?.authorExternalChannelId || data?.authorChannelId);
}

export function getParticipantAvatarElement(participant: HTMLElement): HTMLElement | null {
  return participant.querySelector<HTMLElement>('yt-img-shadow, img#img, img');
}

export function getParticipantAvatarSrc(participant: HTMLElement): string {
  return participant.querySelector<HTMLImageElement>('yt-img-shadow img, img#img, img')?.src || '';
}

function getParticipantRendererData(participant: HTMLElement): ParticipantRendererData | null {
  const candidate = participant as HTMLElement & {
    data?: ParticipantRendererData;
    __data?: { data?: ParticipantRendererData };
  };
  return candidate.data || candidate.__data?.data || null;
}
