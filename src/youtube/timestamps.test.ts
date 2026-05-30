import { describe, expect, it } from 'vitest';
import { getChatTimestampValue, isLiveChatReplayUrl } from './timestamps';

describe('YouTube timestamp parsing', () => {
  it('parses live clock timestamps on the reference day', () => {
    const reference = new Date('2026-05-30T12:30:00Z').getTime();
    const expected = new Date(reference);
    expected.setHours(10, 5, 0, 0);

    expect(getChatTimestampValue('10:05 AM', reference)).toBe(expected.getTime());
  });

  it('rolls clock timestamps back a day when they are too far in the future', () => {
    const reference = new Date('2026-05-30T00:05:00Z').getTime();
    const expected = new Date(reference);
    expected.setHours(23, 58, 0, 0);
    expected.setDate(expected.getDate() - 1);

    expect(getChatTimestampValue('23:58', reference)).toBe(expected.getTime());
  });

  it('parses replay elapsed and negative replay timestamps', () => {
    const reference = new Date('2026-05-30T12:00:00Z').getTime();
    const startOfDay = new Date(reference);
    startOfDay.setHours(0, 0, 0, 0);

    expect(getChatTimestampValue('0:09', reference, { preferElapsed: true })).toBe(startOfDay.getTime() + 9_000);
    expect(getChatTimestampValue('-0:39', reference, { preferElapsed: true })).toBe(startOfDay.getTime() - 39_000);
  });

  it('detects live chat replay URLs', () => {
    expect(isLiveChatReplayUrl('https://www.youtube.com/live_chat_replay?continuation=abc')).toBe(true);
    expect(isLiveChatReplayUrl('https://www.youtube.com/live_chat?continuation=abc')).toBe(false);
  });
});
