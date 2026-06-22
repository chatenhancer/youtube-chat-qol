import { describe, expect, it } from 'vitest';
import {
  applyStickAroundInput,
  createStickAroundGame,
  finishStickAroundRound,
  observeStickAroundChatTraffic,
  readyStickAroundPlayer,
  startStickAroundRound,
  stickAroundGameModule,
  timeoutStickAroundRound,
  toPublicStickAroundGame
} from './index';
import { ProtocolError } from '../../protocol/validation';

describe('playground Stick Around game rules', () => {
  it('readies both players, starts after countdown, and relays newer inputs', () => {
    let game = createStickAroundGame('game-1', 'host-user', 'guest-user', 1_000);

    expect(game.status).toBe('ready');
    game = readyStickAroundPlayer(game, 'host-user', 1_100);
    expect(game.readyPlayers.host).toBe(true);

    game = readyStickAroundPlayer(game, 'guest-user', 1_200);
    expect(game.status).toBe('countdown');
    expect(() => startStickAroundRound(game, 3_000)).toThrowError(new ProtocolError(
      'countdown_active',
      'This Stick Around countdown is still active.'
    ));

    game = startStickAroundRound(game, 4_200);
    expect(game.status).toBe('active');
    expect(game.roundStartedAt).toBe(4_200);

    game = applyStickAroundInput(game, {
      action: 'input',
      payload: {
        frame: 12,
        jump: true,
        left: false,
        right: true,
        seq: 2
      },
      userId: 'host-user'
    }, 4_250);
    game = applyStickAroundInput(game, {
      action: 'input',
      payload: {
        frame: 13,
        left: true,
        seq: 1
      },
      userId: 'host-user'
    }, 4_260);

    expect(game.inputs['host-user']).toMatchObject({
      frame: 12,
      jump: true,
      right: true,
      seq: 2
    });
  });

  it('turns chat traffic counts into deterministic hazards without chat text', () => {
    let game = startActiveGame();

    game = observeStickAroundChatTraffic(game, {
      action: 'observeChatTraffic',
      payload: {
        count: 3,
        messageIds: ['message-1', 'message-2'],
        windowStartedAt: 5_000
      },
      userId: 'host-user'
    }, 5_100);

    expect(game.hazards).toHaveLength(2);
    expect(game.hazards[0]).toMatchObject({
      id: 'hazard-1',
      messageId: 'message-1',
      spawnAt: 5_750
    });
    expect(game.hazards[0]).not.toHaveProperty('text');

    game = observeStickAroundChatTraffic(game, {
      action: 'observeChatTraffic',
      payload: {
        count: 2,
        messageIds: ['message-1', 'message-2'],
        windowStartedAt: 6_000
      },
      userId: 'guest-user'
    }, 6_100);

    expect(game.hazards).toHaveLength(2);
  });

  it('finishes only after human players agree and marks disagreements as desynced', () => {
    let game = startActiveGame();

    game = finishStickAroundRound(game, {
      action: 'finish',
      payload: {
        frame: 500,
        winnerUserId: 'host-user'
      },
      userId: 'host-user'
    }, 8_000);
    expect(game.status).toBe('active');
    expect(Object.keys(game.finishReports)).toEqual(['host-user']);

    game = finishStickAroundRound(game, {
      action: 'finish',
      payload: {
        frame: 505,
        winnerUserId: 'guest-user'
      },
      userId: 'guest-user'
    }, 8_100);

    expect(game.status).toBe('desynced');
    expect(game.winnerUserId).toBeNull();
  });

  it('accepts one human finish report against the computer', () => {
    let game = createStickAroundGame('game-1', 'host-user', 'server:computer:stick-around', 1_000);
    game = readyStickAroundPlayer(game, 'host-user', 1_100);
    game = readyStickAroundPlayer(game, 'server:computer:stick-around', 1_200);
    game = startStickAroundRound(game, 4_200);

    game = finishStickAroundRound(game, {
      action: 'finish',
      payload: {
        frame: 500,
        winnerUserId: 'host-user'
      },
      userId: 'host-user'
    }, 8_000);

    expect(game.status).toBe('finished');
    expect(stickAroundGameModule.getWinnerUserId?.(game)).toBe('host-user');
  });

  it('serializes public state and handles timeout through the module', () => {
    let game = startActiveGame();
    game = timeoutStickAroundRound(game, 'guest-user', 6_000);

    const publicGame = toPublicStickAroundGame(game, (userId) => ({
      displayName: userId === 'host-user' ? 'Host' : 'Guest',
      userId
    }), 6_100);

    expect(publicGame.status).toBe('finished');
    expect(publicGame.serverNow).toBe(6_100);
    expect(publicGame.winnerUserId).toBe('host-user');
    expect(publicGame.players.host.displayName).toBe('Host');

    const moduleGame = stickAroundGameModule.applyAction(
      stickAroundGameModule.createGame('game-2', ['host-user', 'guest-user']),
      { action: 'ready', userId: 'host-user' }
    );
    expect(moduleGame).toMatchObject({
      gameType: 'stick-around',
      readyPlayers: { host: true }
    });
  });
});

function startActiveGame() {
  let game = createStickAroundGame('game-1', 'host-user', 'guest-user', 1_000);
  game = readyStickAroundPlayer(game, 'host-user', 1_100);
  game = readyStickAroundPlayer(game, 'guest-user', 1_200);
  return startStickAroundRound(game, 4_200);
}
