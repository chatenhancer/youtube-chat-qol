import { cleanText, normalizeComparableText } from './text';

export const BOUNTY_HUNTING_BOUNTY_COUNT = 6;
export const BOUNTY_HUNTING_COUNTDOWN_MS = 3_000;
export const BOUNTY_HUNTING_ROUND_MS = 60_000;
export const BOUNTY_HUNTING_ROUND_OVER_MS = 2_000;

export type BountyHuntingGameStatus = 'active' | 'countdown' | 'finished' | 'preparing' | 'ready' | 'roundOver';
export type BountyHuntingPlayerRole = 'guest' | 'host';

export type BountyHuntingBountyMatcher =
  | { kind: 'allCaps'; minLetters: number }
  | { kind: 'authorIn'; authorNames: string[] }
  | { kind: 'emojiCount'; min: number }
  | { kind: 'keyword'; keyword: string }
  | { kind: 'mention' }
  | { kind: 'number' }
  | { kind: 'question' }
  | { kind: 'url' }
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
  messageAuthorName: string;
  messageId: string;
  role: BountyHuntingPlayerRole;
  userId: string;
}

export interface PublicBountyHuntingBounty extends BountyHuntingBounty {
  claim?: BountyHuntingClaim;
}

export interface BountyHuntingMessageSignal {
  authorName?: string;
  emojiCount?: number;
  isVerifiedAuthor?: boolean;
  text: string;
}

interface BountyHuntingMessageFacts {
  authorKey: string;
  emojiCount: number;
  hasMention: boolean;
  hasNumber: boolean;
  hasQuestion: boolean;
  hasUrl: boolean;
  isVerifiedAuthor: boolean;
  text: string;
  textKey: string;
}

export function doesBountyHuntingBountyMatch(
  bounty: Pick<BountyHuntingBounty, 'matcher'>,
  message: BountyHuntingMessageSignal
): boolean {
  const facts = getBountyHuntingMessageFacts(message);
  const { matcher } = bounty;

  switch (matcher.kind) {
    case 'allCaps':
      return isBountyHuntingAllCapsMessage(facts.text, matcher.minLetters);
    case 'authorIn':
      return matcher.authorNames
        .map(normalizeBountyHuntingAuthorKey)
        .filter(Boolean)
        .includes(facts.authorKey);
    case 'emojiCount':
      return facts.emojiCount >= matcher.min;
    case 'keyword':
      return Boolean(normalizeComparableText(matcher.keyword)) &&
        facts.textKey.includes(normalizeComparableText(matcher.keyword));
    case 'mention':
      return facts.hasMention;
    case 'number':
      return facts.hasNumber;
    case 'question':
      return facts.hasQuestion;
    case 'url':
      return facts.hasUrl;
    case 'verifiedAuthor':
      return facts.isVerifiedAuthor;
  }
}

export function normalizeBountyHuntingAuthorKey(value: unknown): string {
  return normalizeComparableText(cleanText(value).replace(/^@+/, ''));
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

function getBountyHuntingMessageFacts(message: BountyHuntingMessageSignal): BountyHuntingMessageFacts {
  const text = cleanText(message.text);
  return {
    authorKey: normalizeBountyHuntingAuthorKey(message.authorName || ''),
    emojiCount: Math.max(0, Math.round(Number(message.emojiCount) || 0), countBountyHuntingTextEmojis(text)),
    hasMention: /(^|\s)@[\p{L}\p{N}._-]{2,}/u.test(text),
    hasNumber: /\p{N}/u.test(text),
    hasQuestion: /[?？]/u.test(text),
    hasUrl: /\b(?:https?:\/\/|www\.)\S+/i.test(text),
    isVerifiedAuthor: message.isVerifiedAuthor === true,
    text,
    textKey: normalizeComparableText(text)
  };
}
