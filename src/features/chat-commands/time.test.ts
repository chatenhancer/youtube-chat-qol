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

  it('rejects relative day words for /when', () => {
    expect(formatWhenResult('tomorrow 8pm')).toBeNull();
    expect(formatWhenResult('yesterday 8pm')).toBeNull();
  });
});
