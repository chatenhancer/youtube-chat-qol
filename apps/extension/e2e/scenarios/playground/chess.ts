/** Browser scenarios for Playground Games. */
import { expect } from '@playwright/test';
import {
  createMockPlaygroundSnapshot,
  installMockPlaygroundBackend
} from '../../support/playground-backend';
import { withExtensionStorageValues } from '../../support/extension-storage';
import type { BrowserScenario } from '../types';
import { expectNoGameAction, waitForGameAction } from './backend-assertions';
import {
  PLAYGROUND_ENABLED_OPTIONS,
  createBrowserChessGame
} from './game-fixtures';
import {
  getGameCard,
  invitePlayer,
  openGamePlayerList,
  openGamePlayerListFromChat,
  openGamesCard
} from './interactions';
import { getChessSquarePosition, readButtonTreatment } from './visuals';

export const playgroundChessInviteAndMoveScenario: BrowserScenario = async ({ chat, context }) => {
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot()
  });

  await withExtensionStorageValues(context, 'sync', {
    ...PLAYGROUND_ENABLED_OPTIONS,
    chatSkin: 'custom:aero'
  }, async () => {
    const card = await openGamesCard(chat, backend);
    await expect(card.locator('.ytcq-profile-card-title')).toHaveText('Games');
    await expect(card.locator('.ytcq-profile-card-subtitle')).toHaveText('2 players online');
    await expect(card.locator('.ytcq-games-availability')).toHaveAttribute('aria-checked', 'true');
    await expect(card.locator('.ytcq-games-availability-toggle')).toBeVisible();
    await expect(card.locator('.ytcq-games-game-label')).toHaveText([
      'Chess',
      'The Wild Wild Chat',
      'Stick Around!',
      'HELP-A-FRIEND! Trivia'
    ]);
    await expect(getGameCard(card, 'The Wild Wild Chat')).toHaveAttribute('aria-disabled', 'false');
    const replayTriviaCard = getGameCard(card, 'HELP-A-FRIEND! Trivia');
    const unavailableGames = card.locator('.ytcq-games-unavailable-section');
    await expect(unavailableGames).not.toHaveAttribute('open', '');
    await expect(replayTriviaCard).not.toBeVisible();
    await unavailableGames.locator('summary').click();
    await expect(unavailableGames).toHaveAttribute('open', '');
    await expect.poll(() => card.locator('.ytcq-games-card-body').evaluate((body) =>
      Math.max(0, body.scrollHeight - body.clientHeight - body.scrollTop)
    )).toBeLessThanOrEqual(1);
    await expect(replayTriviaCard).toBeVisible();
    await expect(replayTriviaCard).toHaveAttribute('aria-disabled', 'true');
    await expect(replayTriviaCard).toHaveAttribute(
      'title',
      'Can only be played during a live replay (a stream that has already ended).'
    );
    await expect(replayTriviaCard.locator('.ytcq-games-context-badge')).toHaveText('Replay only');
    const stickAroundCard = getGameCard(card, 'Stick Around!');
    await expect(stickAroundCard).toHaveAttribute('aria-disabled', 'false');
    await expect.poll(() => stickAroundCard.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const preview = element.querySelector('canvas')?.getBoundingClientRect();
      return Boolean(preview && preview.width > 0 && preview.height > 0 &&
        preview.left >= bounds.left && preview.right <= bounds.right &&
        preview.top >= bounds.top && preview.bottom <= bounds.bottom);
    })).toBe(true);

    await openGamePlayerList(card, 'Chess');
    await expect(card.locator('.ytcq-games-player-row')).toHaveCount(3);
    const detailCancel = card.locator('.ytcq-games-detail-cancel');
    const inviteAction = card
      .locator('.ytcq-games-player-row')
      .first()
      .getByRole('button', { name: 'Invite' });
    const root = chat.locator('html');
    for (const theme of ['light', 'dark'] as const) {
      await root.evaluate((element, value) => {
        element.toggleAttribute('dark', value === 'dark');
      }, theme);
      await expect(root).toHaveAttribute('data-ytcq-chat-skin', 'custom');
      await expect(root).toHaveAttribute('data-ytcq-chat-skin-theme', theme);
      await card.locator('.ytcq-games-section-title').hover();
      expect(await readButtonTreatment(detailCancel)).toEqual(
        await readButtonTreatment(inviteAction)
      );
      await inviteAction.hover();
      const inviteHoverTreatment = await readButtonTreatment(inviteAction);
      await detailCancel.hover();
      expect(await readButtonTreatment(detailCancel)).toEqual(inviteHoverTreatment);
    }
    await root.evaluate((element) => {
      element.removeAttribute('dark');
    });

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

export const playgroundChessTurnGatingScenario: BrowserScenario = async ({ chat, context }) => {
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot()
  });

  await withExtensionStorageValues(context, 'sync', PLAYGROUND_ENABLED_OPTIONS, async () => {
    const card = await openGamePlayerListFromChat(chat, backend, 'Chess');
    await invitePlayer(card, 'Luna Chat');
    const invite = await backend.waitForClientMessage('invite');
    expect(invite).toMatchObject({
      gameId: 'chess',
      toUserId: 'luna-user'
    });

    await backend.sendServerMessage({
      game: createBrowserChessGame({ turn: 'black' }),
      type: 'gameStarted'
    });

    const canvas = chat.locator('.ytcq-chess-board-canvas');
    await expect(canvas).toBeVisible();
    await canvas.click({ position: getChessSquarePosition('e2') });
    await canvas.click({ position: getChessSquarePosition('e4') });
    await expectNoGameAction(backend, 'move', 500);

    await backend.sendServerMessage({
      game: createBrowserChessGame({ turn: 'white' }),
      type: 'gameUpdated'
    });

    await canvas.click({ position: getChessSquarePosition('g1') });
    await canvas.click({ position: getChessSquarePosition('f3') });
    const move = await waitForGameAction(backend, 'move', (message) =>
      message.payload?.from === 'g1' && message.payload?.to === 'f3'
    );
    expect(move).toMatchObject({
      action: 'move',
      gameId: 'browser-chess-game',
      payload: {
        from: 'g1',
        to: 'f3'
      }
    });
  });
};
