import { describe, expect, it } from 'vitest';
import { TokenBucket } from './rate-limit';

describe('playground token bucket rate limit', () => {
  it('allows a burst up to capacity', () => {
    const bucket = new TokenBucket({ capacity: 3, refillPerSecond: 1 }, 1_000);

    expect(bucket.consume(1, 1_000)).toBe(true);
    expect(bucket.consume(2, 1_000)).toBe(true);
    expect(bucket.consume(1, 1_000)).toBe(false);
  });

  it('refills over elapsed time without exceeding capacity', () => {
    const bucket = new TokenBucket({ capacity: 4, refillPerSecond: 2 }, 1_000);

    expect(bucket.consume(4, 1_000)).toBe(true);
    expect(bucket.consume(1, 1_250)).toBe(false);
    expect(bucket.consume(1, 1_500)).toBe(true);
    expect(bucket.consume(4, 4_000)).toBe(true);
  });
});
