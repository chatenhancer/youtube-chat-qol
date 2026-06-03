import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatTime, formatWhen, formatWhenResult, getTimeZoneOption } from './time';

describe('chat command time helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 29, 14, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats local time when /time has no argument', () => {
    expect(formatTime('')).toMatch(/\d/);
  });

  it('returns only the insertable duration from the /when wrapper', () => {
    expect(formatWhen('2026-5-29 13:30')).toMatch(/\d/);
    expect(formatWhen('not a time')).toBe('');
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
    expect(formatWhenResult('2026-5-29T8pm pt')?.detail).toContain('Los Angeles');
    expect(formatWhenResult('2026-5-29 12:00:30')?.detail).toContain('12:00');
    expect(formatWhenResult('2026-5-28 8pm')?.detail).toContain('since');
  });

  it('handles 12-hour clock edge cases for /when targets', () => {
    expect(formatWhenResult('12am')?.detail).toContain('since');
    expect(formatWhenResult('12pm')?.detail).toContain('since');
    expect(formatWhenResult('12pm')?.insertion).toMatch(/\d/);
  });

  it('rejects timezone-only /when targets', () => {
    expect(formatWhenResult('tokyo')).toBeNull();
    expect(formatWhenResult('pt')).toBeNull();
  });

  it('falls back to plain duration text when localized unit formatting is unavailable', () => {
    vi.spyOn(Intl, 'NumberFormat').mockImplementation(function NumberFormat() {
      throw new Error('unsupported');
    } as unknown as typeof Intl.NumberFormat);
    vi.spyOn(Intl, 'ListFormat').mockImplementation(function ListFormat() {
      throw new Error('unsupported');
    } as unknown as typeof Intl.ListFormat);

    const result = formatWhenResult('2026-5-29 15:01');

    expect(result?.insertion).toBe('1 hour 1 minute');
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
