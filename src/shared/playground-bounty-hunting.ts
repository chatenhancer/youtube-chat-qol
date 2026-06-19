import { cleanText } from './text';

export const BOUNTY_HUNTING_BOUNTY_COUNT = 6;
export const BOUNTY_HUNTING_COUNTDOWN_MS = 3_000;
export const BOUNTY_HUNTING_ROUND_MS = 60_000;
export const BOUNTY_HUNTING_ROUND_OVER_MS = 2_000;

export type BountyHuntingGameStatus = 'active' | 'countdown' | 'finished' | 'preparing' | 'ready' | 'roundOver';
export type BountyHuntingPlayerRole = 'guest' | 'host';

export type BountyHuntingBountyMatcher =
  | { kind: 'allCaps' }
  | { kind: 'emojiCount'; min: number }
  | { kind: 'mention' }
  | { kind: 'number' }
  | { kind: 'question' }
  | { kind: 'topFanAuthor' }
  | { kind: 'verifiedAuthor' };

export interface BountyHuntingBounty {
  amount: number;
  description: string;
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
  hasMention: boolean;
  hasNumber: boolean;
  hasQuestion: boolean;
  isTopFanAuthor: boolean;
  isVerifiedAuthor: boolean;
}

export function doesBountyHuntingBountyMatch(
  bounty: Pick<BountyHuntingBounty, 'matcher'>,
  message: BountyHuntingMessageFacts
): boolean {
  const { matcher } = bounty;

  switch (matcher.kind) {
    case 'allCaps':
      return message.hasAllCaps;
    case 'emojiCount':
      return message.emojiCount >= matcher.min;
    case 'mention':
      return message.hasMention;
    case 'number':
      return message.hasNumber;
    case 'question':
      return message.hasQuestion;
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
