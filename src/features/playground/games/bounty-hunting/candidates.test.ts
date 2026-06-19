import { describe, expect, it } from 'vitest';
import {
  createBountyHuntingBountiesFromMessages,
  findBountyHuntingMatchingBounty
} from './candidates';
import type { BountyHuntingObservedMessage } from './types';

describe('Bounty Hunting bounty candidates', () => {
  it('chooses six bounties from observed chat signals', () => {
    const bounties = createBountyHuntingBountiesFromMessages([
      message('m1', '@Luna', 'WOW CHAT!!!', { emojiCount: 0 }),
      message('m2', '@Luna', 'anyone see this?'),
      message('m3', '@Luna', 'look @Marco 🤠🔥⭐', { emojiCount: 3 }),
      message('m4', '@Marco', 'score is 42'),
      message('m5', '@Nova', 'clip https://example.com'),
      message('m6', '@Nova', 'verified drop', { isVerifiedAuthor: true }),
      message('m7', '@Nova', 'verified again', { isVerifiedAuthor: true })
    ]);

    expect(bounties).toHaveLength(6);
    expect(bounties.map((bounty) => bounty.id)).toContain('top-chatters');
    expect(bounties.map((bounty) => bounty.id)).toContain('verified-author');
    expect(bounties.every((bounty) => bounty.description)).toBe(true);
  });

  it('finds the highest value open bounty for a message', () => {
    const bounties = createBountyHuntingBountiesFromMessages([]);
    const match = findBountyHuntingMatchingBounty(bounties, message('m1', '@Luna', 'hey @Marco 42?'));

    expect(match?.id).toBe('mention-user');
    expect(match?.amount).toBe(125);
  });
});

function message(
  messageId: string,
  authorName: string,
  text: string,
  overrides: Partial<BountyHuntingObservedMessage> = {}
): BountyHuntingObservedMessage {
  return {
    authorName,
    emojiCount: 0,
    isVerifiedAuthor: false,
    messageId,
    text,
    ...overrides
  };
}
