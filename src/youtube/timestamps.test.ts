import { describe, expect, it } from 'vitest';
import { getChatTimestampValue, isLiveChatReplayUrl } from './timestamps';

describe('YouTube timestamp parsing', () => {
  it('parses live clock timestamps on the reference day', () => {
    const reference = new Date('2026-05-30T12:30:00Z').getTime();
    const expected = new Date(reference);
    expected.setHours(10, 5, 0, 0);

    expect(getChatTimestampValue('10:05 AM', reference)).toBe(expected.getTime());
  });

  it('parses noon, midnight, and dotted meridiem clock timestamps', () => {
    const reference = new Date('2026-05-30T13:30:00Z').getTime();
    const midnight = new Date(reference);
    midnight.setHours(0, 5, 0, 0);
    const noon = new Date(reference);
    noon.setHours(12, 5, 0, 0);
    const evening = new Date(reference);
    evening.setHours(22, 5, 0, 0);
    if (evening.getTime() > reference + 10 * 60 * 1000) {
      evening.setDate(evening.getDate() - 1);
    }

    expect(getChatTimestampValue('12:05 AM', reference)).toBe(midnight.getTime());
    expect(getChatTimestampValue('12:05 PM', reference)).toBe(noon.getTime());
    expect(getChatTimestampValue('10:05 p.m.', reference)).toBe(evening.getTime());
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
    expect(getChatTimestampValue('25:03', reference)).toBe(startOfDay.getTime() + 25 * 60_000 + 3_000);
    expect(getChatTimestampValue('1:02:03', reference, { preferElapsed: true })).toBe(
      startOfDay.getTime() + 1 * 60 * 60_000 + 2 * 60_000 + 3_000
    );
    expect(getChatTimestampValue('-0:39', reference, { preferElapsed: true })).toBe(startOfDay.getTime() - 39_000);
    expect(getChatTimestampValue('-1:02:03', reference)).toBe(
      startOfDay.getTime() - (1 * 60 * 60_000 + 2 * 60_000 + 3_000)
    );
  });

  it('rejects invalid and ambiguous timestamp text', () => {
    const reference = new Date('2026-05-30T12:00:00Z').getTime();

    expect(getChatTimestampValue('', reference)).toBeNull();
    expect(getChatTimestampValue('10:5', reference)).toBeNull();
    expect(getChatTimestampValue('10:60', reference)).toBeNull();
    expect(getChatTimestampValue('10:05:60', reference)).toBeNull();
    expect(getChatTimestampValue('-10:05 PM', reference)).toBeNull();
    expect(getChatTimestampValue('0:30 PM', reference)).toBeNull();
    expect(getChatTimestampValue('13:00 PM', reference)).toBeNull();
  });

  it('detects live chat replay URLs', () => {
    expect(isLiveChatReplayUrl('https://www.youtube.com/live_chat_replay?continuation=abc')).toBe(true);
    expect(isLiveChatReplayUrl('https://www.youtube.com/live_chat?continuation=abc')).toBe(false);
  });
});
