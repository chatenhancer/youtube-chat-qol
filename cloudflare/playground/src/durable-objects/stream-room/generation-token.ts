import { TokenBucket, type TokenBucketOptions } from '../../rate-limit';
import { ProtocolError } from '../../protocol/validation';

export interface GenerationTokenRecord {
  expiresAt: number;
  gameId: string;
  userId: string;
}

export interface CreateGenerationTokenInput extends GenerationTokenRecord {
  generationToken: string;
  now: number;
}

export class GenerationTokens {
  private readonly roomRateLimit: TokenBucket;
  private readonly tokens = new Map<string, GenerationTokenRecord>();
  private readonly userRateLimits = new Map<string, TokenBucket>();

  constructor(
    roomRateLimitOptions: TokenBucketOptions,
    private readonly userRateLimitOptions: TokenBucketOptions
  ) {
    this.roomRateLimit = new TokenBucket(roomRateLimitOptions);
  }

  assertWithinRateLimit(userId: string, now: number): void {
    if (!this.roomRateLimit.consume(1, now)) {
      throw new ProtocolError('rate_limited', 'Slow down before requesting more generated content.');
    }

    const existing = this.userRateLimits.get(userId);
    const bucket = existing || new TokenBucket(this.userRateLimitOptions, now);
    if (!existing) this.userRateLimits.set(userId, bucket);
    if (!bucket.consume(1, now)) {
      throw new ProtocolError('rate_limited', 'Slow down before requesting more generated content.');
    }
  }

  create(input: CreateGenerationTokenInput): string {
    this.pruneExpired(input.now);
    this.tokens.set(input.generationToken, {
      expiresAt: input.expiresAt,
      gameId: input.gameId,
      userId: input.userId
    });
    return input.generationToken;
  }

  consume(gameId: string, generationToken: string, now = Date.now()): GenerationTokenRecord | null {
    this.pruneExpired(now);
    const token = this.tokens.get(generationToken);
    this.tokens.delete(generationToken);
    if (!token || token.gameId !== gameId || token.expiresAt <= now) return null;
    return token;
  }

  pruneExpired(now = Date.now()): void {
    this.tokens.forEach((token, value) => {
      if (token.expiresAt <= now) this.tokens.delete(value);
    });
  }
}
