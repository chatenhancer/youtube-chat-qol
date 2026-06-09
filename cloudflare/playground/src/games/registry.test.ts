import { describe, expect, it } from 'vitest';
import { getGameModule, getGameModuleForRecord } from './registry';
import { createChessGame } from './chess';
import { ProtocolError } from '../protocol/validation';
import type { GameRecord } from './types';

describe('playground game registry', () => {
  it('resolves the chess module by game id and game record', () => {
    const module = getGameModule('chess');
    const game = createChessGame('game-1', 'white-user', 'black-user');

    expect(module).toBe(getGameModuleForRecord(game));
    expect(module.getRecipientUserIds(game)).toEqual(['white-user', 'black-user']);
  });

  it('rejects unknown game records', () => {
    expect(() => getGameModuleForRecord({
      gameId: 'game-1',
      gameType: 'unknown',
      status: 'active'
    } as unknown as GameRecord)).toThrowError(new ProtocolError('unsupported_game', 'Unsupported game.'));
  });
});
