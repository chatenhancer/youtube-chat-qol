import { describe, expect, it } from 'vitest';
import {
  clampNumber,
  cleanText,
  normalizeComparableText
} from './text';

describe('shared text helpers', () => {
  it('removes invisible chat characters and collapses whitespace', () => {
    expect(cleanText('\u200B hello \n\t world \uFEFF')).toBe('hello world');
  });

  it('normalizes comparable text and common x confusables', () => {
    expect(normalizeComparableText('  Hｅllo × Х х  ')).toBe('hello x x x');
  });

  it('clamps rounded numeric values with fallback for invalid input', () => {
    expect(clampNumber(4.6, 0, 10, 2)).toBe(5);
    expect(clampNumber(-4, 0, 10, 2)).toBe(0);
    expect(clampNumber(14, 0, 10, 2)).toBe(10);
    expect(clampNumber('nope', 0, 10, 2)).toBe(2);
  });
});
