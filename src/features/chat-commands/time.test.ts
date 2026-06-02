import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatTime, formatWhenResult, getTimeZoneOption } from './time';

describe('chat command time helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-29T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats local time when /time has no argument', () => {
    expect(formatTime('')).toMatch(/\d/);
  });

  it('formats known timezone aliases for /time', () => {
    expect(formatTime('tokyo')).toMatch(/\d/);
    expect(formatTime('NYC')).toMatch(/\d/);
    expect(getTimeZoneOption('utc')?.timeZone).toBe('UTC');
    expect(getTimeZoneOption('')).toBeNull();
  });

  it('rejects unknown timezone aliases', () => {
    expect(formatTime('not-a-place')).toBe('');
    expect(getTimeZoneOption('pt')?.label).toBe('Los Angeles');
  });

  it('formats future dated /when targets with an insertable duration and toast detail', () => {
    const result = formatWhenResult('2026-5-29 8pm pt');

    expect(result).not.toBeNull();
    expect(result?.insertion).toMatch(/\d/);
    expect(result?.insertion).not.toMatch(/\b(until|since|ago|in)\b/i);
    expect(result?.detail).toContain(result?.insertion);
    expect(result?.detail).toContain('Los Angeles');
  });

  it('supports timezone-first /when input', () => {
    const result = formatWhenResult('tokyo 7:45pm');

    expect(result).not.toBeNull();
    expect(result?.detail).toContain('Tokyo');
  });

  it('supports date-only, date-last, seconds, and past /when targets', () => {
    expect(formatWhenResult('2026-5-30')).toEqual(expect.objectContaining({
      insertion: expect.stringMatching(/\d/)
    }));
    expect(formatWhenResult('8pm 2026-5-29 pt')?.detail).toContain('Los Angeles');
    expect(formatWhenResult('2026-5-29 12:00:30')?.detail).toContain('12:00');
    expect(formatWhenResult('2026-5-28 8pm')?.detail).toContain('since');
  });

  it('formats zero-duration /when targets as seconds', () => {
    vi.setSystemTime(new Date(2026, 4, 29, 14, 0, 0));

    const result = formatWhenResult('14:00');

    expect(result?.insertion).toMatch(/0/);
    expect(result?.detail).toContain(result?.insertion);
  });

  it('rejects invalid /when dates and times', () => {
    expect(formatWhenResult('2026-2-29')).toBeNull();
    expect(formatWhenResult('2026-13-1 8pm')).toBeNull();
    expect(formatWhenResult('2026-5-29 25:00')).toBeNull();
    expect(formatWhenResult('7:61')).toBeNull();
    expect(formatWhenResult('7:45:61')).toBeNull();
    expect(formatWhenResult('13pm')).toBeNull();
    expect(formatWhenResult('24')).toBeNull();
    expect(formatWhenResult('')).toBeNull();
  });

  it('rejects relative day words for /when', () => {
    expect(formatWhenResult('tomorrow 8pm')).toBeNull();
    expect(formatWhenResult('yesterday 8pm')).toBeNull();
  });
});
