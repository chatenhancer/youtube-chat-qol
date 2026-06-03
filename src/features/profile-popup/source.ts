/**
 * Profile source extraction.
 *
 * Reads author, avatar, channel, and profile URL data from chat messages and
 * participant-list renderers for the shared profile card.
 */
import { getAuthorName, getMessageAvatarSrc, getRendererData } from '../../youtube/messages';
import { getParticipantAuthorName, getParticipantAvatarSrc, getParticipantChannelId } from '../../youtube/participants';
import { getChannelUrl } from '../channel-popup';
import type { ProfileSource } from './types';

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
  const channelId = getParticipantChannelId(participant);
  const authorName = getParticipantAuthorName(participant);
  const avatarSrc = getParticipantAvatarSrc(participant);

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
