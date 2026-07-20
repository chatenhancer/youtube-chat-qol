import { cleanText } from '../text';

export const BOUNTY_HUNTING_BOUNTY_COUNT = 6;
export const BOUNTY_HUNTING_COUNTDOWN_MS = 3_000;
export const BOUNTY_HUNTING_MISS_COOLDOWN_MS = 5_000;
export const BOUNTY_HUNTING_MAX_WITNESS_OBSERVATIONS = 20;
export const BOUNTY_HUNTING_ROUND_MS = 60_000;
export const BOUNTY_HUNTING_ROUND_OVER_MS = 2_000;
export const BOUNTY_HUNTING_BOUNTY_DESCRIPTION_KEYS = [
  'gamesBountyHuntingBountyAllCaps',
  'gamesBountyHuntingBountyChannelMember',
  'gamesBountyHuntingBountyChannelOwner',
  'gamesBountyHuntingBountyCustomEmoji',
  'gamesBountyHuntingBountyEmoji3',
  'gamesBountyHuntingBountyMention',
  'gamesBountyHuntingBountyModerator',
  'gamesBountyHuntingBountyNumber',
  'gamesBountyHuntingBountyOnlyEmojis',
  'gamesBountyHuntingBountyQuestion',
  'gamesBountyHuntingBountySuperChat',
  'gamesBountyHuntingBountyTopChatters',
  'gamesBountyHuntingBountyVerifiedAuthor'
] as const;

export type BountyHuntingGameStatus = 'active' | 'countdown' | 'finished' | 'preparing' | 'ready' | 'roundOver';
export type BountyHuntingPlayerRole = 'guest' | 'host';
export type BountyHuntingBountyDescriptionKey = typeof BOUNTY_HUNTING_BOUNTY_DESCRIPTION_KEYS[number];

export function getBountyHuntingRoundStartTimestampUsec(phaseStartedAt: number): string {
  return String(BigInt(Math.trunc(phaseStartedAt + BOUNTY_HUNTING_COUNTDOWN_MS)) * 1000n);
}

export type BountyHuntingBountyMatcher =
  | { kind: 'allCaps' }
  | { kind: 'channelMemberAuthor' }
  | { kind: 'channelOwnerAuthor' }
  | { kind: 'customEmoji' }
  | { kind: 'emojiCount'; min: number }
  | { kind: 'mention' }
  | { kind: 'moderatorAuthor' }
  | { kind: 'number' }
  | { kind: 'onlyEmojis' }
  | { kind: 'question' }
  | { kind: 'superChat' }
  | { kind: 'topFanAuthor' }
  | { kind: 'verifiedAuthor' };

export interface BountyHuntingBounty {
  amount: number;
  description: string;
  descriptionKey?: BountyHuntingBountyDescriptionKey;
  id: string;
  matcher: BountyHuntingBountyMatcher;
}

export interface BountyHuntingClaim {
  bountyId: string;
  claimedAt: number;
  messageId: string;
  role: BountyHuntingPlayerRole;
  userId: string;
}

export interface PublicBountyHuntingBounty extends BountyHuntingBounty {
  claim?: BountyHuntingClaim;
}

export interface BountyHuntingMessageFacts {
  emojiCount: number;
  hasAllCaps: boolean;
  hasCustomEmoji: boolean;
  hasMention: boolean;
  hasNumber: boolean;
  hasOnlyEmojis: boolean;
  hasQuestion: boolean;
  isChannelMemberAuthor: boolean;
  isChannelOwnerAuthor: boolean;
  isModeratorAuthor: boolean;
  isSuperChat: boolean;
  isTopFanAuthor: boolean;
  isVerifiedAuthor: boolean;
}

export interface BountyHuntingMessageObservation {
  bountyIds: string[];
  messageId: string;
  messageTimestampUsec?: string;
}

export function doesBountyHuntingBountyMatch(
  bounty: Pick<BountyHuntingBounty, 'matcher'>,
  message: BountyHuntingMessageFacts
): boolean {
  const { matcher } = bounty;

  switch (matcher.kind) {
    case 'allCaps':
      return message.hasAllCaps;
    case 'channelMemberAuthor':
      return message.isChannelMemberAuthor;
    case 'channelOwnerAuthor':
      return message.isChannelOwnerAuthor;
    case 'customEmoji':
      return message.hasCustomEmoji;
    case 'emojiCount':
      return message.emojiCount >= matcher.min;
    case 'mention':
      return message.hasMention;
    case 'moderatorAuthor':
      return message.isModeratorAuthor;
    case 'number':
      return message.hasNumber;
    case 'onlyEmojis':
      return message.hasOnlyEmojis;
    case 'question':
      return message.hasQuestion;
    case 'superChat':
      return message.isSuperChat;
    case 'topFanAuthor':
      return message.isTopFanAuthor;
    case 'verifiedAuthor':
      return message.isVerifiedAuthor;
  }
}

export function countBountyHuntingTextEmojis(value: unknown): number {
  return Array.from(cleanText(value).matchAll(/\p{Extended_Pictographic}/gu)).length;
}

export function isBountyHuntingAllCapsMessage(value: unknown, minLetters = 4): boolean {
  const letters = Array.from(cleanText(value).matchAll(/\p{L}/gu)).map((match) => match[0]);
  const casedLetters = letters.filter((letter) => letter.toLocaleLowerCase() !== letter.toLocaleUpperCase());
  if (casedLetters.length < minLetters) return false;

  const uppercaseLetters = casedLetters.filter((letter) => letter === letter.toLocaleUpperCase()).length;
  const lowercaseLetters = casedLetters.filter((letter) => letter === letter.toLocaleLowerCase()).length;
  return uppercaseLetters >= minLetters && lowercaseLetters === 0;
}
