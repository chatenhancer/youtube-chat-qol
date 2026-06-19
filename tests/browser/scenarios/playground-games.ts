/**
 * Browser scenarios for Playground Games.
 *
 * These checks exercise the real content script, popup card, background
 * Playground bridge, and game panels against a deterministic WebSocket backend.
 */
import { expect, test, type Locator } from '@playwright/test';
import type { PublicGame } from '../../../src/shared/playground-protocol';
import {
  createMockPlaygroundSnapshot,
  installMockPlaygroundBackend
} from '../support/playground-backend';
import { withExtensionStorageValues } from '../support/extension-storage';
import type { BrowserScenario } from './types';

const PLAYGROUND_ENABLED_OPTIONS = {
  playgroundEnabled: true,
  playgroundGamesAvailable: true
};

export const playgroundChessInviteAndMoveScenario: BrowserScenario = async ({ chat, context }) => {
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot()
  });

  await withExtensionStorageValues(context, 'sync', PLAYGROUND_ENABLED_OPTIONS, async () => {
    const gamesButton = chat.locator('.ytcq-games-button');
    await expect(gamesButton).toBeVisible();

    await gamesButton.click();
    await backend.waitForClientMessage('hello');

    const card = chat.locator('.ytcq-games-card');
    await expect(card).toBeVisible();
    await expect(card.locator('.ytcq-profile-card-title')).toHaveText('Games');
    await expect(card.locator('.ytcq-profile-card-subtitle')).toHaveText('2 players online');
    await expect(card.locator('.ytcq-games-availability-toggle')).toHaveAttribute('aria-checked', 'true');
    await expect(card.locator('.ytcq-games-game-label')).toHaveText(['Chess', 'The Wild Wild Chat', 'HELP-A-FRIEND! Trivia']);
    await expect(getGameCard(card, 'The Wild Wild Chat')).toHaveAttribute('aria-disabled', 'false');
    await expect(getGameCard(card, 'HELP-A-FRIEND! Trivia')).toHaveAttribute('aria-disabled', 'true');

    await getGameCard(card, 'Chess').click();
    await expect(card.locator('.ytcq-profile-card-title')).toHaveText('Chess');
    await expect(card.locator('.ytcq-games-player-row')).toHaveCount(3);

    await invitePlayer(card, 'Luna Chat');
    const invite = await backend.waitForClientMessage('invite');
    expect(invite).toMatchObject({
      gameId: 'chess',
      toUserId: 'luna-user'
    });

    await backend.sendServerMessage({
      game: createBrowserChessGame(),
      type: 'gameStarted'
    });

    await expect(chat.locator('.ytcq-games-card')).toHaveCount(0);
    await expect(chat.locator('.ytcq-chess-game-panel')).toBeVisible();

    const canvas = chat.locator('.ytcq-chess-board-canvas');
    await expect(canvas).toBeVisible();
    await canvas.click({ position: getChessSquarePosition('e2') });
    await canvas.click({ position: getChessSquarePosition('e4') });

    const move = await backend.waitForClientMessage('gameAction');
    expect(move).toMatchObject({
      action: 'move',
      gameId: 'browser-chess-game',
      payload: {
        from: 'e2',
        to: 'e4'
      }
    });
  });
};

export const playgroundReplayTriviaInviteScenario: BrowserScenario = async ({ chat, context }) => {
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot()
  });

  await withExtensionStorageValues(context, 'sync', PLAYGROUND_ENABLED_OPTIONS, async () => {
    const gamesButton = chat.locator('.ytcq-games-button');
    await expect(gamesButton).toBeVisible();

    await gamesButton.click();
    await backend.waitForClientMessage('hello');

    const card = chat.locator('.ytcq-games-card');
    await expect(card).toBeVisible();
    await expect(card.locator('.ytcq-games-game-label')).toHaveText(['Chess', 'The Wild Wild Chat', 'HELP-A-FRIEND! Trivia']);
    await expect(getGameCard(card, 'The Wild Wild Chat')).toHaveAttribute('aria-disabled', 'true');
    await expect(getGameCard(card, 'HELP-A-FRIEND! Trivia')).toHaveAttribute('aria-disabled', 'false');

    await getGameCard(card, 'HELP-A-FRIEND! Trivia').click();
    await expect(card.locator('.ytcq-profile-card-title')).toHaveText('HELP-A-FRIEND! Trivia');
    await expect(card.locator('.ytcq-games-player-row')).toHaveCount(2);

    await invitePlayer(card, 'Luna Chat');
    const invite = await backend.waitForClientMessage('invite');
    expect(invite).toMatchObject({
      gameId: 'replay-trivia',
      toUserId: 'luna-user'
    });

    await backend.sendServerMessage({
      game: createBrowserReplayTriviaGame(),
      type: 'gameStarted'
    });

    await expect(chat.locator('.ytcq-games-card')).toHaveCount(0);
    await expect(chat.locator('.ytcq-replay-trivia-game-panel')).toBeVisible();
    await expect(chat.locator('.ytcq-replay-trivia-canvas')).toBeVisible();
  });
};

function getGameCard(card: Locator, label: string): Locator {
  return card.locator('.ytcq-games-game-card').filter({ hasText: label });
}

async function invitePlayer(card: Locator, playerName: string): Promise<void> {
  await test.step(`Invite ${playerName}`, async () => {
    const player = card.locator('.ytcq-games-player-row').filter({ hasText: playerName });
    await player.getByRole('button', { name: 'Invite' }).click();
    await expect(player).toContainText('Waiting for reply...');
  });
}

function createBrowserChessGame(): PublicGame {
  return {
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    gameId: 'browser-chess-game',
    gameType: 'chess',
    pgn: '',
    players: {
      black: {
        displayName: 'Luna Chat',
        userId: 'luna-user'
      },
      white: {
        displayName: 'Browser Viewer',
        userId: 'browser-user'
      }
    },
    status: 'active',
    turn: 'white'
  } as PublicGame;
}

function createBrowserReplayTriviaGame(): PublicGame {
  return {
    answers: {},
    currentQuestion: {
      choices: ['Choice A', 'Choice B', 'Choice C', 'Choice D'],
      friendIntro: 'help me answer this',
      id: 'question-1',
      prompt: 'Which answer should I choose?',
      rightReply: 'that helped',
      wrongReply: 'not quite'
    },
    currentQuestionIndex: 0,
    gameId: 'browser-replay-trivia-game',
    gameType: 'replay-trivia',
    phaseStartedAt: Date.now(),
    players: {
      guest: {
        displayName: 'Luna Chat',
        userId: 'luna-user'
      },
      host: {
        displayName: 'Browser Viewer',
        userId: 'browser-user'
      }
    },
    questionProviderUserId: 'browser-user',
    scores: {
      guest: 0,
      host: 0
    },
    status: 'question',
    totalQuestions: 1
  } as PublicGame;
}

function getChessSquarePosition(square: string): { x: number; y: number } {
  const file = 'abcdefgh'.indexOf(square[0]);
  const rank = Number(square[1]);
  const tileSize = 224 / 8;
  return {
    x: file * tileSize + tileSize / 2,
    y: (8 - rank) * tileSize + tileSize / 2
  };
}
