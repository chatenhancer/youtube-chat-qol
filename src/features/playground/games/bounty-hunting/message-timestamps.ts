/**
 * Bounty Hunting adapter for YouTube message timestamps.
 */
import { getYouTubeMessageData } from '../../../../youtube/message-data';
import type { BountyHuntingObservedMessage } from './types';

interface BountyHuntingMessageTimestampRuntime {
  messageTimestampUsecById: Map<string, string>;
  pendingWitnesses: Map<string, { bountyIds: Set<string>; messageTimestampUsec?: string }>;
}

export function rememberBountyHuntingCachedMessageData(
  runtime: BountyHuntingMessageTimestampRuntime,
  message: HTMLElement
): void {
  const youtubeData = getYouTubeMessageData(message);
  if (youtubeData) rememberBountyHuntingMessageData(runtime, youtubeData);
}

export function rememberBountyHuntingMessageData(
  runtime: BountyHuntingMessageTimestampRuntime,
  youtubeData: { messageId: string; timestampUsec?: string }
): void {
  if (!youtubeData.timestampUsec || !/^\d{1,24}$/.test(youtubeData.timestampUsec)) return;
  runtime.messageTimestampUsecById.set(youtubeData.messageId, youtubeData.timestampUsec);
  const pendingWitness = runtime.pendingWitnesses.get(youtubeData.messageId);
  if (pendingWitness && !pendingWitness.messageTimestampUsec) {
    pendingWitness.messageTimestampUsec = youtubeData.timestampUsec;
  }
}

export function addBountyHuntingMessageTimestamp(
  runtime: BountyHuntingMessageTimestampRuntime,
  message: BountyHuntingObservedMessage
): BountyHuntingObservedMessage {
  const messageTimestampUsec = getBountyHuntingMessageTimestampUsec(runtime, message.messageId);
  return messageTimestampUsec
    ? { ...message, messageTimestampUsec }
    : message;
}

export function getBountyHuntingMessageTimestampUsec(
  runtime: BountyHuntingMessageTimestampRuntime,
  messageId: string
): string {
  return runtime.messageTimestampUsecById.get(messageId) || '';
}

export function compareBountyHuntingTimestampUsec(left: string, right: string): number {
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);
  if (leftValue === rightValue) return 0;
  return leftValue > rightValue ? 1 : -1;
}
