import type { RecordPlayerMatchResult } from '../player-stats/types';
import {
  parsePlayerMatchResultInput,
  type PlayerMatchResultInput
} from '../player-stats/types';

const OUTBOX_KEY_PREFIX = 'matchResultOutbox:';
const OUTBOX_KEY_VERSION = ':v1';
const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 30_000, 60_000, 5 * 60_000] as const;

interface PendingMatchResult {
  attempts: number;
  match: PlayerMatchResultInput;
  nextAttemptAt: number;
}

export interface MatchResultOutboxOptions {
  deliver(match: PlayerMatchResultInput): Promise<RecordPlayerMatchResult>;
  onDelivered(match: PlayerMatchResultInput, result: RecordPlayerMatchResult): void;
  onDeliveryFailed(
    match: PlayerMatchResultInput,
    error: unknown,
    retry: { attempt: number; nextAttemptAt: number }
  ): void;
  onInvalidRecord(key: string): void;
}

export class MatchResultOutbox {
  private deliveryQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly state: DurableObjectState,
    private readonly options: MatchResultOutboxOptions
  ) {}

  async enqueue(value: PlayerMatchResultInput): Promise<void> {
    const match = parsePlayerMatchResultInput(value);
    if (!match) throw new Error('Cannot queue an invalid match result.');

    const key = getOutboxKey(match.matchId);
    // Persist the wake-up with the receipt so an eviction cannot strand queued work.
    await this.state.storage.transaction(async (transaction) => {
      const existing = parsePendingMatchResult(await transaction.get(key));
      if (existing && !areQueuedMatchesEqual(existing.match, match)) {
        throw new Error('Cannot replace a queued match with a different result.');
      }
      const pending = existing || {
        attempts: 0,
        match,
        nextAttemptAt: Date.now()
      } satisfies PendingMatchResult;
      if (!existing) await transaction.put(key, pending);

      const currentAlarm = await transaction.getAlarm();
      if (currentAlarm === null || pending.nextAttemptAt < currentAlarm) {
        await transaction.setAlarm(pending.nextAttemptAt);
      }
    });
    await this.flush();
  }

  async resume(): Promise<void> {
    await this.flush();
  }

  async alarm(): Promise<void> {
    await this.flush();
  }

  private flush(): Promise<void> {
    const write = this.deliveryQueue.then(() => this.deliverDueMatchResults(Date.now()));
    this.deliveryQueue = write.catch(() => undefined);
    return write;
  }

  private async deliverDueMatchResults(now: number): Promise<void> {
    const stored = await this.state.storage.list<PendingMatchResult>({
      prefix: OUTBOX_KEY_PREFIX
    });

    for (const [key, value] of stored) {
      const pending = parsePendingMatchResult(value);
      if (!pending) {
        await this.state.storage.delete(key);
        this.options.onInvalidRecord(key);
        continue;
      }
      if (pending.nextAttemptAt > now) continue;

      try {
        const result = await this.options.deliver(pending.match);
        await this.state.storage.delete(key);
        this.options.onDelivered(pending.match, result);
      } catch (error) {
        const attempt = pending.attempts + 1;
        const nextAttemptAt = now + getRetryDelay(attempt);
        await this.state.storage.put(key, {
          attempts: attempt,
          match: pending.match,
          nextAttemptAt
        } satisfies PendingMatchResult);
        this.options.onDeliveryFailed(pending.match, error, {
          attempt,
          nextAttemptAt
        });
      }
    }

    await this.scheduleNextAlarm();
  }

  private async scheduleNextAlarm(): Promise<void> {
    const stored = await this.state.storage.list<PendingMatchResult>({
      prefix: OUTBOX_KEY_PREFIX
    });
    let nextAttemptAt = 0;

    for (const [key, value] of stored) {
      const pending = parsePendingMatchResult(value);
      if (!pending) {
        await this.state.storage.delete(key);
        this.options.onInvalidRecord(key);
        continue;
      }
      nextAttemptAt = nextAttemptAt
        ? Math.min(nextAttemptAt, pending.nextAttemptAt)
        : pending.nextAttemptAt;
    }

    if (!nextAttemptAt) {
      await this.state.storage.deleteAlarm();
      return;
    }

    const currentAlarm = await this.state.storage.getAlarm();
    if (
      currentAlarm !== null &&
      currentAlarm > Date.now() &&
      currentAlarm <= nextAttemptAt
    ) {
      return;
    }
    await this.state.storage.setAlarm(nextAttemptAt);
  }
}

function parsePendingMatchResult(value: unknown): PendingMatchResult | null {
  if (!isRecord(value)) return null;
  const match = parsePlayerMatchResultInput(value.match);
  if (
    !match ||
    typeof value.attempts !== 'number' ||
    !Number.isInteger(value.attempts) ||
    value.attempts < 0 ||
    typeof value.nextAttemptAt !== 'number' ||
    !Number.isInteger(value.nextAttemptAt) ||
    value.nextAttemptAt < 0
  ) {
    return null;
  }

  return {
    attempts: value.attempts,
    match,
    nextAttemptAt: value.nextAttemptAt
  };
}

function getRetryDelay(attempt: number): number {
  return RETRY_DELAYS_MS[Math.min(Math.max(attempt - 1, 0), RETRY_DELAYS_MS.length - 1)];
}

function getOutboxKey(matchId: string): string {
  return `${OUTBOX_KEY_PREFIX}${matchId}${OUTBOX_KEY_VERSION}`;
}

function areQueuedMatchesEqual(left: PlayerMatchResultInput, right: PlayerMatchResultInput): boolean {
  return left.finishedAt === right.finishedAt &&
    left.finishReason === right.finishReason &&
    left.gameType === right.gameType &&
    left.gameVersion === right.gameVersion &&
    left.matchId === right.matchId &&
    left.startedAt === right.startedAt &&
    left.winnerUserId === right.winnerUserId &&
    [...left.participantUserIds].sort().join('\n') ===
      [...right.participantUserIds].sort().join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
