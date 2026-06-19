import { describe, expect, it } from 'vitest';
import {
  countBountyHuntingTextEmojis,
  doesBountyHuntingBountyMatch,
  isBountyHuntingAllCapsMessage,
  type BountyHuntingBounty
} from './playground-bounty-hunting';

describe('Bounty Hunting bounty matching', () => {
  it('matches fact-based bounty rules without raw chat text', () => {
    const message = {
      emojiCount: 3,
      hasAllCaps: true,
      hasMention: true,
      hasNumber: true,
      hasQuestion: true,
      isTopFanAuthor: true,
      isVerifiedAuthor: true
    };

    expect(matches({ kind: 'emojiCount', min: 3 }, message)).toBe(true);
    expect(matches({ kind: 'allCaps' }, message)).toBe(true);
    expect(matches({ kind: 'question' }, message)).toBe(true);
    expect(matches({ kind: 'mention' }, message)).toBe(true);
    expect(matches({ kind: 'number' }, message)).toBe(true);
    expect(matches({ kind: 'topFanAuthor' }, message)).toBe(true);
    expect(matches({ kind: 'verifiedAuthor' }, message)).toBe(true);
  });

  it('detects all-caps text and unicode emoji locally', () => {
    expect(isBountyHuntingAllCapsMessage('GG CHAT!!!', 4)).toBe(true);
    expect(isBountyHuntingAllCapsMessage('GG chat!!!', 4)).toBe(false);
    expect(countBountyHuntingTextEmojis('go 🤠🔥')).toBe(2);
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
