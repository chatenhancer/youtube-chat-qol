import { createErrorResponse, createJsonResponse } from '../../http';
import {
  getPlayerMatchOutcome,
  parsePlayerMatchResultInput,
  parsePlayerUserId,
  type PlayerMatchOutcome,
  type PlayerMatchResultInput,
  type PlayerStatsEntry,
  type PlayerStatsSnapshot,
  type RecordPlayerMatchResult
} from './types';

export type {
  PlayerMatchOutcome,
  PlayerMatchResultInput,
  PlayerStatsEntry,
  PlayerStatsSnapshot,
  RecordPlayerMatchResult
} from './types';

const RECORD_MATCH_PATH = '/internal/player-stats/record-match';
const USER_STATS_PATH = '/internal/player-stats/user';

type StoredMatchRow = Record<string, SqlStorageValue> & {
  finished_at: number;
  finish_reason: string;
  game_type: string;
  game_version: number;
  match_id: string;
  started_at: number | null;
  winner_user_id: string | null;
};

type StoredParticipantRow = Record<string, SqlStorageValue> & {
  match_id: string;
  outcome: PlayerMatchOutcome;
  user_id: string;
};

type StatsCountRow = Record<string, SqlStorageValue> & {
  count: number;
  game_type: string;
  outcome: PlayerMatchOutcome;
};

export class PlayerStats {
  private readonly sql: SqlStorage;

  constructor(private readonly state: DurableObjectState) {
    this.sql = state.storage.sql;
    this.initializeSchema();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === RECORD_MATCH_PATH) {
      return this.handleRecordMatch(request);
    }
    if (url.pathname === USER_STATS_PATH) {
      return this.handleUserStats(url);
    }

    return createErrorResponse('not_found', 'Not found.', 404);
  }

  private async handleRecordMatch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return createErrorResponse('method_not_allowed', 'Only POST is supported.', 405);
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return createErrorResponse('invalid_json', 'Request body must be valid JSON.', 400);
    }

    const input = parsePlayerMatchResultInput(payload);
    if (!input) {
      return createErrorResponse(
        'invalid_request',
        'A valid match result with participants is required.',
        400
      );
    }

    const existing = this.getStoredMatch(input.matchId);
    if (existing) {
      if (!isSameMatchResult(existing.match, existing.participants, input)) {
        return createErrorResponse(
          'match_conflict',
          'That match ID is already associated with a different result.',
          409
        );
      }

      return createJsonResponse({
        ok: true,
        result: createRecordResult(input.matchId, false)
      });
    }

    this.state.storage.transactionSync(() => {
      this.insertMatch(input);
    });

    return createJsonResponse({
      ok: true,
      result: createRecordResult(input.matchId, true)
    });
  }

  private async handleUserStats(url: URL): Promise<Response> {
    const userId = parsePlayerUserId(url.searchParams.get('userId'));
    if (!userId) {
      return createErrorResponse('invalid_user', 'userId is required.', 400);
    }

    return createJsonResponse({
      ok: true,
      stats: this.getUserStats(userId)
    });
  }

  private initializeSchema(): void {
    this.sql.exec('PRAGMA foreign_keys = ON');
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS matches_v1 (
        match_id TEXT PRIMARY KEY,
        game_type TEXT NOT NULL,
        game_version INTEGER NOT NULL,
        started_at INTEGER,
        finished_at INTEGER NOT NULL,
        finish_reason TEXT NOT NULL,
        winner_user_id TEXT
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS match_participants_v1 (
        match_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('draw', 'loss', 'win')),
        PRIMARY KEY (match_id, user_id),
        FOREIGN KEY (match_id) REFERENCES matches_v1(match_id) ON DELETE CASCADE
      )
    `);
    this.sql.exec(`
      CREATE INDEX IF NOT EXISTS match_participants_by_user_v1
      ON match_participants_v1(user_id, outcome, match_id)
    `);
  }

  private getStoredMatch(matchId: string): {
    match: StoredMatchRow;
    participants: StoredParticipantRow[];
  } | null {
    const match = this.sql.exec<StoredMatchRow>(`
      SELECT
        match_id,
        game_type,
        game_version,
        started_at,
        finished_at,
        finish_reason,
        winner_user_id
      FROM matches_v1
      WHERE match_id = ?
    `, matchId).toArray()[0];
    if (!match) return null;

    const participants = this.sql.exec<StoredParticipantRow>(`
      SELECT
        match_id,
        user_id,
        outcome
      FROM match_participants_v1
      WHERE match_id = ?
      ORDER BY user_id
    `, matchId).toArray();
    return {
      match,
      participants
    };
  }

  private insertMatch(input: PlayerMatchResultInput): void {
    this.sql.exec(
      `
        INSERT INTO matches_v1(
          match_id,
          game_type,
          game_version,
          started_at,
          finished_at,
          finish_reason,
          winner_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      input.matchId,
      input.gameType,
      input.gameVersion,
      input.startedAt ?? null,
      input.finishedAt,
      input.finishReason,
      input.winnerUserId
    );

    input.participantUserIds.forEach((userId) => {
      this.sql.exec(
        `
          INSERT INTO match_participants_v1(
            match_id,
            user_id,
            outcome
          ) VALUES (?, ?, ?)
        `,
        input.matchId,
        userId,
        getPlayerMatchOutcome(userId, input.winnerUserId)
      );
    });
  }

  private getUserStats(userId: string): PlayerStatsSnapshot {
    const rows = this.sql.exec<StatsCountRow>(`
      SELECT
        matches_v1.game_type AS game_type,
        match_participants_v1.outcome AS outcome,
        COUNT(*) AS count
      FROM match_participants_v1
      INNER JOIN matches_v1
        ON matches_v1.match_id = match_participants_v1.match_id
      WHERE match_participants_v1.user_id = ?
      GROUP BY matches_v1.game_type, match_participants_v1.outcome
    `, userId).toArray();

    const games: Record<string, PlayerStatsEntry> = {};
    rows.forEach((row) => {
      const entry = games[row.game_type] || createEmptyStatsEntry();
      const count = normalizeCount(row.count);
      entry[row.outcome === 'draw' ? 'draws' : row.outcome === 'loss' ? 'losses' : 'wins'] += count;
      entry.played += count;
      games[row.game_type] = entry;
    });

    const totals = Object.values(games).reduce((summary, entry) => ({
      draws: summary.draws + entry.draws,
      losses: summary.losses + entry.losses,
      played: summary.played + entry.played,
      wins: summary.wins + entry.wins
    }), createEmptyStatsEntry());

    return {
      ...totals,
      games,
      userId
    };
  }
}

function createRecordResult(matchId: string, recorded: boolean): RecordPlayerMatchResult {
  return {
    matchId,
    recorded
  };
}

function createEmptyStatsEntry(): PlayerStatsEntry {
  return {
    draws: 0,
    losses: 0,
    played: 0,
    wins: 0
  };
}

function normalizeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function isSameMatchResult(
  match: StoredMatchRow,
  participants: StoredParticipantRow[],
  input: PlayerMatchResultInput
): boolean {
  if (
    match.finished_at !== input.finishedAt ||
    match.game_type !== input.gameType ||
    match.game_version !== input.gameVersion ||
    match.finish_reason !== input.finishReason ||
    match.started_at !== (input.startedAt ?? null) ||
    match.winner_user_id !== input.winnerUserId
  ) {
    return false;
  }

  const expectedParticipants = input.participantUserIds
    .map((userId): StoredParticipantRow => {
      return {
        match_id: input.matchId,
        outcome: getPlayerMatchOutcome(userId, input.winnerUserId),
        user_id: userId
      };
    })
    .sort((left, right) => left.user_id.localeCompare(right.user_id));

  return participants.length === expectedParticipants.length &&
    participants.every((participant, index) => {
      const expected = expectedParticipants[index];
      return Boolean(expected) &&
        participant.match_id === expected.match_id &&
        participant.outcome === expected.outcome &&
        participant.user_id === expected.user_id;
    });
}
