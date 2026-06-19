import { describe, expect, it } from 'vitest';
import {
  countBountyHuntingTextEmojis,
  doesBountyHuntingBountyMatch,
  isBountyHuntingAllCapsMessage,
  normalizeBountyHuntingAuthorKey,
  type BountyHuntingBounty
} from './playground-bounty-hunting';

describe('Bounty Hunting bounty matching', () => {
  it('matches text and evidence based bounty rules', () => {
    const message = {
      authorName: '@Luna',
      emojiCount: 3,
      isVerifiedAuthor: true,
      text: 'WOW @MARCO 42? HTTPS://EXAMPLE.COM 🤠'
    };

    expect(matches({ kind: 'emojiCount', min: 3 }, message)).toBe(true);
    expect(matches({ kind: 'allCaps', minLetters: 3 }, message)).toBe(true);
    expect(matches({ kind: 'question' }, message)).toBe(true);
    expect(matches({ kind: 'mention' }, message)).toBe(true);
    expect(matches({ kind: 'number' }, message)).toBe(true);
    expect(matches({ kind: 'url' }, message)).toBe(true);
    expect(matches({ kind: 'verifiedAuthor' }, message)).toBe(true);
    expect(matches({ authorNames: ['luna'], kind: 'authorIn' }, message)).toBe(true);
    expect(matches({ keyword: 'wow', kind: 'keyword' }, message)).toBe(true);
  });

  it('normalizes authors, all-caps text, and unicode emoji fallbacks', () => {
    expect(normalizeBountyHuntingAuthorKey('@Luna Chat')).toBe('luna chat');
    expect(isBountyHuntingAllCapsMessage('GG CHAT!!!', 4)).toBe(true);
    expect(isBountyHuntingAllCapsMessage('GG chat!!!', 4)).toBe(false);
    expect(countBountyHuntingTextEmojis('go 🤠🔥')).toBe(2);
    expect(matches({ authorNames: ['Marco'], kind: 'authorIn' }, {
      authorName: '@Luna',
      text: 'hello'
    })).toBe(false);
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
