import { describe, expect, it } from 'vitest';
import {
  countBountyHuntingObservedCandidateTypes,
  createBountyHuntingBountiesFromMessages,
  findBountyHuntingMatchingBounty
} from './candidates';
import type { BountyHuntingObservedMessage } from './types';

describe('Bounty Hunting bounty candidates', () => {
  it('chooses six bounties from observed chat signals', () => {
    const messages = [
      message('m1', { hasAllCaps: true }),
      message('m2', { hasQuestion: true }),
      message('m3', { emojiCount: 3, hasMention: true }),
      message('m4', { hasNumber: true }),
      message('m5', { isTopFanAuthor: true }),
      message('m6', { isVerifiedAuthor: true }),
      message('m7', { isVerifiedAuthor: true })
    ];
    const bounties = createBountyHuntingBountiesFromMessages(messages);

    expect(bounties).toHaveLength(6);
    expect(bounties.map((bounty) => bounty.id)).not.toContain('has-link');
    expect(bounties.map((bounty) => bounty.id)).toContain('top-chatters');
    expect(bounties.map((bounty) => bounty.id)).toContain('verified-author');
    expect(bounties.every((bounty) => bounty.description)).toBe(true);
    expect(bounties.every((bounty) => bounty.descriptionKey)).toBe(true);
    expect(countBountyHuntingObservedCandidateTypes(messages)).toBe(7);
  });

  it('adds YouTube-native privacy-safe bounties when those facts are observed', () => {
    const bounties = createBountyHuntingBountiesFromMessages([
      message('m1', { isChannelMemberAuthor: true }),
      message('m2', { isModeratorAuthor: true }),
      message('m3', { isChannelOwnerAuthor: true }),
      message('m4', { isSuperChat: true }),
      message('m5', { hasCustomEmoji: true }),
      message('m6', { hasOnlyEmojis: true })
    ]);

    expect(bounties.map((bounty) => bounty.id)).toEqual([
      'channel-owner',
      'super-chat',
      'channel-member',
      'moderator',
      'only-emojis',
      'custom-emoji'
    ]);
  });

  it('finds the highest value open bounty for a message', () => {
    const bounties = createBountyHuntingBountiesFromMessages([]);
    const match = findBountyHuntingMatchingBounty(bounties, message('m1', {
      hasMention: true,
      hasNumber: true,
      hasQuestion: true
    }));

    expect(match?.id).toBe('mention-user');
    expect(match?.amount).toBe(125);
  });

});

function message(
  messageId: string,
  overrides: Partial<BountyHuntingObservedMessage> = {}
): BountyHuntingObservedMessage {
  return {
    emojiCount: 0,
    hasAllCaps: false,
    hasCustomEmoji: false,
    hasMention: false,
    hasNumber: false,
    hasOnlyEmojis: false,
    hasQuestion: false,
    isChannelMemberAuthor: false,
    isChannelOwnerAuthor: false,
    isModeratorAuthor: false,
    isSuperChat: false,
    isTopFanAuthor: false,
    isVerifiedAuthor: false,
    messageId,
    ...overrides
  };
}
