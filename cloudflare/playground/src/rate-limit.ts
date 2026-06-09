export interface TokenBucketOptions {
  capacity: number;
  refillPerSecond: number;
}

export class TokenBucket {
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private lastRefillAt: number;
  private tokens: number;

  constructor(options: TokenBucketOptions, now = Date.now()) {
    this.capacity = options.capacity;
    this.refillPerMs = options.refillPerSecond / 1000;
    this.lastRefillAt = now;
    this.tokens = options.capacity;
  }

  consume(cost: number, now = Date.now()): boolean {
    this.refill(now);
    if (cost > this.tokens) return false;
    this.tokens -= cost;
    return true;
  }

  private refill(now: number): void {
    const elapsedMs = Math.max(0, now - this.lastRefillAt);
    this.lastRefillAt = now;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedMs * this.refillPerMs);
  }
}
