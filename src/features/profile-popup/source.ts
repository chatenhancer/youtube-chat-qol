import { cleanText } from '../../shared/text';
import { getAuthorName, getMessageAvatarSrc, getRendererData } from '../../youtube/messages';
import { getChannelUrl } from '../channel-popup';
import type { ProfileSource } from './types';

interface ParticipantRendererData {
  authorExternalChannelId?: string;
  authorChannelId?: string;
  authorName?: {
    simpleText?: string;
    runs?: { text?: string }[];
  };
}

export function getMessageProfileSource(message: HTMLElement): ProfileSource | null {
  const data = getRendererData(message);
  const channelId = data?.authorExternalChannelId || data?.authorChannelId;
  const authorName = getAuthorName(message);
  const avatarSrc = getMessageAvatarSrc(message);
  if (!authorName || !avatarSrc) return null;

  return {
    authorName,
    avatarSrc,
    identity: {
      authorName,
      channelId
    },
    profileUrl: getChannelUrl(channelId, authorName)
  };
}

export function getParticipantProfileSource(participant: HTMLElement): ProfileSource | null {
  const data = getParticipantRendererData(participant);
  const channelId = data?.authorExternalChannelId || data?.authorChannelId;
  const authorName = cleanText(
    data?.authorName?.simpleText ||
    data?.authorName?.runs?.map((run) => run.text || '').join('') ||
    participant.querySelector('#author-name')?.textContent ||
    participant.textContent ||
    ''
  );
  const avatarSrc = participant.querySelector<HTMLImageElement>('yt-img-shadow img, img#img, img')?.src || '';

  if (!authorName || !avatarSrc) return null;

  return {
    authorName,
    avatarSrc,
    identity: {
      authorName,
      channelId
    },
    profileUrl: getChannelUrl(channelId, authorName)
  };
}

function getParticipantRendererData(participant: HTMLElement): ParticipantRendererData | null {
  const candidate = participant as HTMLElement & {
    data?: ParticipantRendererData;
    __data?: { data?: ParticipantRendererData };
  };
  return candidate.data || candidate.__data?.data || null;
}
