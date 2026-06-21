import { describe, expect, it } from 'vitest';
import {
  countBountyHuntingTextEmojis,
  doesBountyHuntingBountyMatch,
  getBountyHuntingRoundStartTimestampUsec,
  isBountyHuntingAllCapsMessage,
  type BountyHuntingBounty
} from './bounty-hunting';

describe('Bounty Hunting bounty matching', () => {
  it('matches fact-based bounty rules without raw chat text', () => {
    const message = {
      emojiCount: 3,
      hasAllCaps: true,
      hasCustomEmoji: true,
      hasMention: true,
      hasNumber: true,
      hasOnlyEmojis: true,
      hasQuestion: true,
      isChannelMemberAuthor: true,
      isChannelOwnerAuthor: true,
      isModeratorAuthor: true,
      isSuperChat: true,
      isTopFanAuthor: true,
      isVerifiedAuthor: true
    };

    expect(matches({ kind: 'emojiCount', min: 3 }, message)).toBe(true);
    expect(matches({ kind: 'allCaps' }, message)).toBe(true);
    expect(matches({ kind: 'channelMemberAuthor' }, message)).toBe(true);
    expect(matches({ kind: 'channelOwnerAuthor' }, message)).toBe(true);
    expect(matches({ kind: 'customEmoji' }, message)).toBe(true);
    expect(matches({ kind: 'question' }, message)).toBe(true);
    expect(matches({ kind: 'mention' }, message)).toBe(true);
    expect(matches({ kind: 'moderatorAuthor' }, message)).toBe(true);
    expect(matches({ kind: 'number' }, message)).toBe(true);
    expect(matches({ kind: 'onlyEmojis' }, message)).toBe(true);
    expect(matches({ kind: 'superChat' }, message)).toBe(true);
    expect(matches({ kind: 'topFanAuthor' }, message)).toBe(true);
    expect(matches({ kind: 'verifiedAuthor' }, message)).toBe(true);
  });

  it('detects all-caps text and unicode emoji locally', () => {
    expect(isBountyHuntingAllCapsMessage('GG CHAT!!!', 4)).toBe(true);
    expect(isBountyHuntingAllCapsMessage('GG chat!!!', 4)).toBe(false);
    expect(countBountyHuntingTextEmojis('go 🤠🔥')).toBe(2);
  });

  it('computes the shared round start cutoff timestamp', () => {
    expect(getBountyHuntingRoundStartTimestampUsec(1_234)).toBe('4234000');
  });
});

function matches(
  matcher: BountyHuntingBounty['matcher'],
  message: Parameters<typeof doesBountyHuntingBountyMatch>[1]
): boolean {
  return doesBountyHuntingBountyMatch({
    matcher
  }, message);
}
