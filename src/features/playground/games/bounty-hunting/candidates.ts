import {
  doesBountyHuntingBountyMatch,
  BOUNTY_HUNTING_BOUNTY_COUNT,
  type BountyHuntingBounty,
  type BountyHuntingBountyDescriptionKey,
  type BountyHuntingBountyMatcher
} from '../../../../shared/playground/bounty-hunting';
import type { BountyHuntingObservedMessage } from './types';

interface BountyCandidate extends BountyHuntingBounty {
  observedCount: number;
  score: number;
}

interface MessageStats {
  allCaps: number;
  channelMemberAuthors: number;
  channelOwnerAuthors: number;
  customEmojis: number;
  emojiHeavy: number;
  mentions: number;
  moderatorAuthors: number;
  numbers: number;
  onlyEmojis: number;
  questions: number;
  superChats: number;
  topFanAuthors: number;
  verifiedAuthors: number;
}

const BOUNTY_HUNTING_ENGLISH_DESCRIPTIONS: Record<BountyHuntingBountyDescriptionKey, string> = {
  gamesBountyHuntingBountyAllCaps: 'a message in all caps',
  gamesBountyHuntingBountyChannelMember: 'a message from a channel member',
  gamesBountyHuntingBountyChannelOwner: 'a message from the channel owner',
  gamesBountyHuntingBountyCustomEmoji: 'a message with a custom emoji',
  gamesBountyHuntingBountyEmoji3: 'a message that has 3+ emojis',
  gamesBountyHuntingBountyMention: 'a message that mentions a user',
  gamesBountyHuntingBountyModerator: 'a message from a moderator',
  gamesBountyHuntingBountyNumber: 'a message with a number',
  gamesBountyHuntingBountyOnlyEmojis: 'a message with only emojis',
  gamesBountyHuntingBountyQuestion: 'a message that asks a question',
  gamesBountyHuntingBountySuperChat: 'a Super Chat',
  gamesBountyHuntingBountyTopChatters: 'a message from a top fan',
  gamesBountyHuntingBountyVerifiedAuthor: 'a message by a verified account'
};

export function createBountyHuntingBountiesFromMessages(
  messages: readonly BountyHuntingObservedMessage[]
): BountyHuntingBounty[] {
  const selected = dedupeBountyHuntingCandidates(createBountyHuntingCandidatePool(messages))
    .sort((a, b) => b.score - a.score || b.amount - a.amount || a.id.localeCompare(b.id))
    .slice(0, BOUNTY_HUNTING_BOUNTY_COUNT);

  for (const fallback of getBountyHuntingFallbackBounties()) {
    if (selected.length >= BOUNTY_HUNTING_BOUNTY_COUNT) break;
    if (!selected.some((bounty) => bounty.id === fallback.id)) selected.push(fallback);
  }

  return selected.map(({ observedCount: _observedCount, score: _score, ...bounty }) => bounty);
}

export function countBountyHuntingObservedCandidateTypes(
  messages: readonly BountyHuntingObservedMessage[]
): number {
  return dedupeBountyHuntingCandidates(createBountyHuntingCandidatePool(messages))
    .filter((candidate) => candidate.observedCount > 0)
    .length;
}

function createBountyHuntingCandidatePool(messages: readonly BountyHuntingObservedMessage[]): BountyCandidate[] {
  const stats = collectBountyHuntingStats(messages);
  return [
    createCandidate('emoji-3', 50, 'gamesBountyHuntingBountyEmoji3', { kind: 'emojiCount', min: 3 }, stats.emojiHeavy),
    createCandidate('all-caps', 50, 'gamesBountyHuntingBountyAllCaps', { kind: 'allCaps' }, stats.allCaps),
    createCandidate('verified-author', 75, 'gamesBountyHuntingBountyVerifiedAuthor', { kind: 'verifiedAuthor' }, stats.verifiedAuthors),
    createCandidate('question', 75, 'gamesBountyHuntingBountyQuestion', { kind: 'question' }, stats.questions),
    createCandidate('mention-user', 125, 'gamesBountyHuntingBountyMention', { kind: 'mention' }, stats.mentions),
    createCandidate('has-number', 75, 'gamesBountyHuntingBountyNumber', { kind: 'number' }, stats.numbers),
    ...createCandidateWhenObserved(
      'channel-member',
      100,
      'gamesBountyHuntingBountyChannelMember',
      { kind: 'channelMemberAuthor' },
      stats.channelMemberAuthors
    ),
    ...createCandidateWhenObserved(
      'moderator',
      100,
      'gamesBountyHuntingBountyModerator',
      { kind: 'moderatorAuthor' },
      stats.moderatorAuthors
    ),
    ...createCandidateWhenObserved(
      'channel-owner',
      125,
      'gamesBountyHuntingBountyChannelOwner',
      { kind: 'channelOwnerAuthor' },
      stats.channelOwnerAuthors
    ),
    ...createCandidateWhenObserved('super-chat', 125, 'gamesBountyHuntingBountySuperChat', { kind: 'superChat' }, stats.superChats),
    ...createCandidateWhenObserved(
      'custom-emoji',
      75,
      'gamesBountyHuntingBountyCustomEmoji',
      { kind: 'customEmoji' },
      stats.customEmojis
    ),
    ...createCandidateWhenObserved(
      'only-emojis',
      100,
      'gamesBountyHuntingBountyOnlyEmojis',
      { kind: 'onlyEmojis' },
      stats.onlyEmojis
    ),
    ...(stats.topFanAuthors > 0
      ? [createCandidate(
        'top-chatters',
        100,
        'gamesBountyHuntingBountyTopChatters',
        { kind: 'topFanAuthor' },
        stats.topFanAuthors
      )]
      : [])
  ];
}

export function findBountyHuntingMatchingBounty(
  bounties: readonly BountyHuntingBounty[],
  message: BountyHuntingObservedMessage
): BountyHuntingBounty | null {
  return [...bounties]
    .sort((a, b) => b.amount - a.amount)
    .find((bounty) => doesBountyHuntingBountyMatch(bounty, message)) || null;
}

function collectBountyHuntingStats(messages: readonly BountyHuntingObservedMessage[]): MessageStats {
  const stats: MessageStats = {
    allCaps: 0,
    channelMemberAuthors: 0,
    channelOwnerAuthors: 0,
    customEmojis: 0,
    emojiHeavy: 0,
    mentions: 0,
    moderatorAuthors: 0,
    numbers: 0,
    onlyEmojis: 0,
    questions: 0,
    superChats: 0,
    topFanAuthors: 0,
    verifiedAuthors: 0
  };

  messages.forEach((message) => {
    if (message.emojiCount >= 3) stats.emojiHeavy += 1;
    if (message.hasAllCaps) stats.allCaps += 1;
    if (message.hasCustomEmoji) stats.customEmojis += 1;
    if (message.hasQuestion) stats.questions += 1;
    if (message.hasMention) stats.mentions += 1;
    if (message.hasNumber) stats.numbers += 1;
    if (message.hasOnlyEmojis) stats.onlyEmojis += 1;
    if (message.isChannelMemberAuthor) stats.channelMemberAuthors += 1;
    if (message.isChannelOwnerAuthor) stats.channelOwnerAuthors += 1;
    if (message.isModeratorAuthor) stats.moderatorAuthors += 1;
    if (message.isSuperChat) stats.superChats += 1;
    if (message.isTopFanAuthor) stats.topFanAuthors += 1;
    if (message.isVerifiedAuthor) stats.verifiedAuthors += 1;
  });

  return stats;
}

function createCandidate(
  id: string,
  amount: number,
  descriptionKey: BountyHuntingBountyDescriptionKey,
  matcher: BountyHuntingBountyMatcher,
  observedCount: number
): BountyCandidate {
  return {
    amount,
    description: BOUNTY_HUNTING_ENGLISH_DESCRIPTIONS[descriptionKey],
    descriptionKey,
    id,
    matcher,
    observedCount,
    score: observedCount > 0 ? observedCount * 10 + amount / 25 : amount / 100
  };
}

function createCandidateWhenObserved(
  id: string,
  amount: number,
  descriptionKey: BountyHuntingBountyDescriptionKey,
  matcher: BountyHuntingBountyMatcher,
  observedCount: number
): BountyCandidate[] {
  return observedCount > 0
    ? [createCandidate(id, amount, descriptionKey, matcher, observedCount)]
    : [];
}

function dedupeBountyHuntingCandidates(candidates: BountyCandidate[]): BountyCandidate[] {
  const result = new Map<string, BountyCandidate>();
  candidates.forEach((candidate) => {
    if (!result.has(candidate.id)) result.set(candidate.id, candidate);
  });
  return [...result.values()];
}

function getBountyHuntingFallbackBounties(): BountyCandidate[] {
  return [
    createCandidate('emoji-3', 50, 'gamesBountyHuntingBountyEmoji3', { kind: 'emojiCount', min: 3 }, 0),
    createCandidate('all-caps', 50, 'gamesBountyHuntingBountyAllCaps', { kind: 'allCaps' }, 0),
    createCandidate('verified-author', 75, 'gamesBountyHuntingBountyVerifiedAuthor', { kind: 'verifiedAuthor' }, 0),
    createCandidate('question', 75, 'gamesBountyHuntingBountyQuestion', { kind: 'question' }, 0),
    createCandidate('mention-user', 125, 'gamesBountyHuntingBountyMention', { kind: 'mention' }, 0),
    createCandidate('has-number', 75, 'gamesBountyHuntingBountyNumber', { kind: 'number' }, 0)
  ];
}
