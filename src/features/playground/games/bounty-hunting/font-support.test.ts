import { describe, expect, it } from 'vitest';

import {
  canRenderBountyHuntingBarnumText,
  canRenderBountyHuntingBartleText,
  canRenderBountyHuntingTexMexText
} from './font-support';

describe('Bounty Hunting font support', () => {
  it('matches the packaged custom font character map limits', () => {
    for (const canRenderText of [
      canRenderBountyHuntingBarnumText,
      canRenderBountyHuntingBartleText,
      canRenderBountyHuntingTexMexText
    ]) {
      expect(canRenderText('READY? 10: $5.00, OK!')).toBe(true);
      expect(canRenderText('3+ emojis')).toBe(false);
      expect(canRenderText('WINNER: {winner}')).toBe(false);
      expect(canRenderText('MAYÚS.')).toBe(false);
    }
  });
});
