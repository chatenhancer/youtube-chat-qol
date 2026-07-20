/**
 * Browser scenarios for Playground Games.
 *
 * These checks exercise the real content script, popup card, background
 * Playground bridge, and game panels against a deterministic WebSocket backend.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import type {
  ClientMessage,
  GameActionClientMessage,
  GameId,
  PublicGame,
  PublicInvite
} from '../../../src/shared/playground/protocol';
import {
  STICK_AROUND_ARENA_HEIGHT,
  STICK_AROUND_ARENA_WIDTH,
  type PublicStickAroundGame
} from '../../../src/shared/playground/stick-around';
import {
  createMockPlaygroundSnapshot,
  installMockPlaygroundBackend
} from '../support/playground-backend';
import { withExtensionStorageValues } from '../support/extension-storage';
import {
  appendMockFixtureMessage,
  emitMockFixtureFeedMessage
} from '../support/mock-page';
import type { BrowserScenario, ChatSurface } from './types';

const PLAYGROUND_ENABLED_OPTIONS = {
  playgroundEnabled: true,
  playgroundGamesAvailable: true
};

export const playgroundChessInviteAndMoveScenario: BrowserScenario = async ({ chat, context }) => {
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot()
  });

  await withExtensionStorageValues(context, 'sync', {
    ...PLAYGROUND_ENABLED_OPTIONS,
    chatSkin: 'aero'
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
    await expect(unavailableGames).toHaveCSS('row-gap', '0px');
    await expect(replayTriviaCard).not.toBeVisible();
    await unavailableGames.locator('summary').click();
    await expect(unavailableGames).toHaveAttribute('open', '');
    await expect(unavailableGames).toHaveCSS('row-gap', '6px');
    await expect(replayTriviaCard).toBeVisible();
    await expect(replayTriviaCard).toHaveAttribute('aria-disabled', 'true');
    await expect(replayTriviaCard).toHaveAttribute(
      'title',
      'Can only be played during a live replay (a stream that has already ended).'
    );
    await expect(replayTriviaCard.locator('.ytcq-games-context-badge')).toHaveText('Replay only');
    await expect(getGameCard(card, 'Stick Around!')).toHaveAttribute('aria-disabled', 'false');

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
        element.setAttribute('data-ytcq-chat-skin', 'aero');
        element.setAttribute('data-ytcq-chat-skin-theme', value);
      }, theme);
      await expect(root).toHaveAttribute('data-ytcq-chat-skin', 'aero');
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
    await expect(detailCancel).toHaveCSS('border-top-width', '1px');
    await expect(inviteAction).toHaveCSS('border-top-width', '1px');
    await expect(detailCancel).toHaveCSS('border-top-left-radius', '3px');
    const detailCancelBox = await detailCancel.boundingBox();
    const inviteActionBox = await inviteAction.boundingBox();
    if (!detailCancelBox || !inviteActionBox) {
      throw new Error('Expected the Cancel and Invite actions to be visible.');
    }
    expect(detailCancelBox.x + detailCancelBox.width).toBeCloseTo(
      inviteActionBox.x + inviteActionBox.width,
      5
    );
    await root.evaluate((element) => {
      element.setAttribute('data-ytcq-chat-skin-theme', 'light');
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

export const playgroundIncomingInviteAcceptScenario: BrowserScenario = async ({ chat, context }) => {
  const incomingInvite = createBrowserInvite();
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot({
      invites: [incomingInvite]
    })
  });

  await withExtensionStorageValues(context, 'sync', PLAYGROUND_ENABLED_OPTIONS, async () => {
    const card = await openGamesCard(chat, backend);
    const inviteRow = card.locator('.ytcq-games-invite-row').filter({ hasText: 'Luna Chat invited you to Chess' });
    await expect(inviteRow).toBeVisible();

    await inviteRow.getByRole('button', { name: 'Accept' }).click();
    const response = await waitForClientMessage(backend, 'respondInvite', (message) =>
      message.inviteId === incomingInvite.inviteId
    );
    expect(response).toMatchObject({
      accept: true,
      inviteId: incomingInvite.inviteId
    });

    await backend.sendServerMessage({
      game: createBrowserChessGame({ gameId: 'incoming-chess-game' }),
      type: 'gameStarted'
    });

    await expect(chat.locator('.ytcq-games-card')).toHaveCount(0);
    await expect(chat.locator('.ytcq-chess-game-panel')).toBeVisible();
  });
};

export const playgroundIncomingInviteIgnoreScenario: BrowserScenario = async ({ chat, context }) => {
  const incomingInvite = createBrowserInvite({
    inviteId: 'browser-invite-ignore'
  });
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot({
      invites: [incomingInvite]
    })
  });

  await withExtensionStorageValues(context, 'sync', PLAYGROUND_ENABLED_OPTIONS, async () => {
    const card = await openGamesCard(chat, backend);
    const inviteRow = card.locator('.ytcq-games-invite-row').filter({ hasText: 'Luna Chat invited you to Chess' });
    await expect(inviteRow).toBeVisible();

    await inviteRow.getByRole('button', { name: 'Ignore' }).click();
    const response = await waitForClientMessage(backend, 'respondInvite', (message) =>
      message.inviteId === incomingInvite.inviteId
    );
    expect(response).toMatchObject({
      accept: false,
      inviteId: incomingInvite.inviteId
    });

    await backend.sendServerMessage({
      invite: {
        ...incomingInvite,
        status: 'ignored'
      },
      type: 'inviteUpdated'
    });
    await expect(card.locator('.ytcq-games-invite-row')).toHaveCount(0);
  });
};

export const playgroundActiveGameControlsScenario: BrowserScenario = async ({ chat, context, page }) => {
  const activeGame = createBrowserChessGame({ gameId: 'active-chess-game' });
  const secondaryGame = createBrowserReplayTriviaGame();
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot({
      games: [activeGame, secondaryGame]
    })
  });

  await withExtensionStorageValues(context, 'sync', PLAYGROUND_ENABLED_OPTIONS, async () => {
    const card = await openGamesCard(chat, backend);
    const activeRow = card.locator('.ytcq-games-active-row').filter({ hasText: 'Chess' });
    await expect(activeRow).toContainText('Luna Chat');
    const activeControls = card.locator('.ytcq-games-active-controls');
    await expect(activeControls).toHaveAttribute('role', 'group');
    await expect(activeControls).toHaveAttribute('aria-label', 'Active games');
    const activePosition = activeControls.locator('.ytcq-games-active-position');
    const activeDots = activePosition.locator('.ytcq-games-active-dot');
    await expect(activePosition).toHaveAttribute('aria-hidden', 'true');
    await expect(activeDots).toHaveCount(2);
    await expect(activeDots.nth(0)).toHaveClass(/ytcq-games-active-dot-current/);
    await expect(activeControls.locator('.ytcq-games-cycle-action')).toHaveCount(2);
    await expect(activeControls.locator('.ytcq-games-cycle-action').first()).not.toHaveClass(
      /ytcq-games-small-action/
    );
    await expect(activeControls).toHaveCSS('display', 'grid');
    await expect(activeControls).toHaveCSS('height', '20px');
    await expect(activeControls).toHaveCSS('overflow', 'hidden');
    await expect(activeControls).toHaveCSS('border-top-width', '0px');
    await expect(activeControls).toHaveCSS('box-shadow', 'none');
    const activeControlsBox = await activeControls.boundingBox();
    expect(activeControlsBox?.width).toBeGreaterThanOrEqual(56);
    await expect(activePosition).toHaveCSS('border-left-width', '0px');
    await expect(activePosition).toHaveCSS('border-right-width', '0px');
    await expect(activePosition).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(activeDots.nth(0)).toHaveCSS('opacity', '0.92');
    await expect(activeDots.nth(1)).toHaveCSS('opacity', '0.32');
    const previousControl = activeControls.locator('.ytcq-games-cycle-action-previous');
    const nextControl = activeControls.locator('.ytcq-games-cycle-action-next');
    await expect(previousControl).toHaveCSS('border-top-left-radius', '8px');
    await expect(previousControl).toHaveCSS('border-top-right-radius', '8px');
    await expect(nextControl).toHaveCSS('border-top-left-radius', '8px');
    await expect(nextControl).toHaveCSS('border-top-right-radius', '8px');
    await previousControl.hover();
    await expect(previousControl).toHaveCSS('box-shadow', 'none');

    const root = chat.locator('html');
    const originalSkin = await root.getAttribute('data-ytcq-chat-skin');
    const originalTheme = await root.getAttribute('data-ytcq-chat-skin-theme');
    await root.evaluate((element) => {
      element.setAttribute('data-ytcq-chat-skin', 'aero');
      element.setAttribute('data-ytcq-chat-skin-theme', 'light');
    });
    const headerControl = card.locator('.ytcq-profile-card-header-button').first();
    await headerControl.hover();
    const headerHoverTreatment = await readButtonTreatment(headerControl);
    await nextControl.hover();
    await expect(nextControl).toHaveCSS('color', headerHoverTreatment.color);
    const cycleHoverTreatment = await readButtonTreatment(nextControl);
    expect(cycleHoverTreatment.backgroundImage).toBe(headerHoverTreatment.backgroundImage);
    expect(cycleHoverTreatment.backgroundImage).not.toBe('none');
    const nextControlBox = await nextControl.boundingBox();
    if (!nextControlBox) throw new Error('Expected the active-game next button to be visible.');
    await page.mouse.move(
      nextControlBox.x + nextControlBox.width / 2,
      nextControlBox.y + nextControlBox.height / 2
    );
    await page.mouse.down();
    expect(await readButtonTreatment(nextControl)).toEqual(cycleHoverTreatment);
    await page.mouse.up();
    await expect(card.locator('.ytcq-games-active-row')).toContainText('HELP-A-FRIEND! Trivia');
    await expect(activeDots.nth(1)).toHaveClass(/ytcq-games-active-dot-current/);
    await root.evaluate((element, attributes) => {
      for (const [name, value] of Object.entries(attributes)) {
        if (value === null) element.removeAttribute(name);
        else element.setAttribute(name, value);
      }
    }, {
      'data-ytcq-chat-skin': originalSkin,
      'data-ytcq-chat-skin-theme': originalTheme
    });
    await activeControls.locator('.ytcq-games-cycle-action-previous').click();
    await expect(card.locator('.ytcq-games-active-row')).toContainText('Chess');

    await activeRow.getByRole('button', { name: 'Resume' }).click();
    await expect(chat.locator('.ytcq-chess-game-panel')).toBeVisible();
    await expect(chat.locator('.ytcq-games-card')).toHaveCount(0);

    await chat.locator('.ytcq-games-button').click();
    const resumedCard = chat.locator('.ytcq-games-card');
    await expect(resumedCard).toBeVisible();
    const resumedActiveRow = resumedCard.locator('.ytcq-games-active-row').filter({ hasText: 'Chess' });
    await expect(resumedActiveRow.getByRole('button', { name: 'Hide' })).toBeVisible();

    await resumedActiveRow.getByRole('button', { name: 'Hide' }).click();
    await expect(chat.locator('.ytcq-chess-game-panel')).toHaveCount(0);

    await resumedActiveRow.getByRole('button', { name: 'Resume' }).click();
    await expect(chat.locator('.ytcq-chess-game-panel')).toBeVisible();
    await expect(chat.locator('.ytcq-games-card')).toHaveCount(0);

    await chat.locator('.ytcq-games-button').click();
    const leaveCard = chat.locator('.ytcq-games-card');
    await expect(leaveCard).toBeVisible();
    const leaveActiveRow = leaveCard.locator('.ytcq-games-active-row').filter({ hasText: 'Chess' });
    await leaveActiveRow.getByRole('button', { name: 'Leave' }).click();
    await expect(chat.locator('.ytcq-chess-game-panel')).toHaveCount(0);

    const leave = await waitForGameAction(backend, 'leave', (message) =>
      message.gameId === 'active-chess-game'
    );
    expect(leave).toMatchObject({
      action: 'leave',
      gameId: 'active-chess-game'
    });
  });
};

export const playgroundStickAroundActiveOverlayControlsScenario: BrowserScenario = async ({ chat, context, page }) => {
  const activeGame = createBrowserStickAroundGame({
    gameId: 'active-stick-around-game',
    status: 'active'
  });
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot({
      games: [activeGame]
    })
  });

  await withExtensionStorageValues(context, 'sync', PLAYGROUND_ENABLED_OPTIONS, async () => {
    const card = await openGamesCard(chat, backend);
    const activeRow = card.locator('.ytcq-games-active-row').filter({ hasText: 'Stick Around!' });
    await expect(activeRow).toContainText('Computer (Stick Around!)');

    await activeRow.getByRole('button', { name: 'Resume' }).click();
    await expect(chat.locator('.ytcq-stick-around-overlay')).toBeVisible();
    await expect(chat.locator('.ytcq-games-card')).toHaveCount(0);

    await chat.locator('.ytcq-games-button').click();
    const resumedCard = chat.locator('.ytcq-games-card');
    await expect(resumedCard).toBeVisible();
    const resumedActiveRow = resumedCard.locator('.ytcq-games-active-row').filter({ hasText: 'Stick Around!' });
    const hideButton = resumedActiveRow.getByRole('button', { name: 'Hide' });
    await expect(hideButton).toBeVisible();

    const hideBox = await hideButton.boundingBox();
    if (!hideBox) throw new Error('Expected the active Stick Around Hide button to be visible.');
    await page.mouse.move(hideBox.x + hideBox.width / 2, hideBox.y + hideBox.height / 2);
    await page.mouse.down();
    await backend.sendServerMessage({
      game: createBrowserStickAroundGame({
        gameId: 'active-stick-around-game',
        inputs: {
          'browser-user': {
            jump: true,
            left: false,
            right: false,
            frame: 1,
            seq: 1,
            sentAt: Date.now(),
            userId: 'browser-user'
          }
        },
        status: 'active'
      }),
      type: 'gameUpdated'
    });
    await page.mouse.up();
    await expect(chat.locator('.ytcq-stick-around-overlay')).toHaveCount(0);

    await resumedActiveRow.getByRole('button', { name: 'Resume' }).click();
    await expect(chat.locator('.ytcq-stick-around-overlay')).toBeVisible();
    await expect(chat.locator('.ytcq-games-card')).toHaveCount(0);

    await chat.locator('.ytcq-games-button').click();
    const leaveCard = chat.locator('.ytcq-games-card');
    await expect(leaveCard).toBeVisible();
    const leaveActiveRow = leaveCard.locator('.ytcq-games-active-row').filter({ hasText: 'Stick Around!' });
    await leaveActiveRow.getByRole('button', { name: 'Leave' }).click();
    await expect(chat.locator('.ytcq-stick-around-overlay')).toHaveCount(0);

    const leave = await waitForGameAction(backend, 'leave', (message) =>
      message.gameId === 'active-stick-around-game'
    );
    expect(leave).toMatchObject({
      action: 'leave',
      gameId: 'active-stick-around-game'
    });
  });
};

export const playgroundStickAroundLiteOverlayScenario: BrowserScenario = async ({ chat, context }) => {
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot({
      games: [createBrowserStickAroundGame({
        gameId: 'lite-stick-around-game',
        status: 'active'
      })]
    })
  });

  await withExtensionStorageValues(context, 'sync', {
    ...PLAYGROUND_ENABLED_OPTIONS,
    liteModeEnabled: true
  }, async () => {
    const liteRoot = chat.locator('.ytcq-lite-root');
    await expect(liteRoot).toBeVisible();
    const card = await openGamesCard(chat, backend);
    const activeRow = card.locator('.ytcq-games-active-row').filter({ hasText: 'Stick Around!' });
    await activeRow.getByRole('button', { name: 'Resume' }).click();

    await expect(liteRoot.locator(':scope > .ytcq-stick-around-overlay')).toBeVisible();
    await expect(liteRoot.locator('.ytcq-stick-around-canvas')).toBeVisible();
    await expect(chat.locator('yt-live-chat-item-list-renderer > .ytcq-stick-around-overlay'))
      .toHaveCount(0);
  });
};

export const playgroundAvailabilityToggleScenario: BrowserScenario = async ({ chat, context }) => {
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot()
  });

  await withExtensionStorageValues(context, 'sync', PLAYGROUND_ENABLED_OPTIONS, async () => {
    const card = await openGamesCard(chat, backend);
    const availability = card.locator('.ytcq-games-availability');
    await expect(availability).toHaveAttribute('aria-checked', 'true');

    await availability.click();
    const disabled = await waitForClientMessage(backend, 'setAvailability', (message) =>
      message.availableGames.length === 0
    );
    expect(disabled.availableGames).toEqual([]);
    await expect(availability).toHaveAttribute('aria-checked', 'false');

    await availability.click();
    const enabled = await waitForClientMessage(backend, 'setAvailability', (message) =>
      message.availableGames.length > 0
    );
    expect(enabled.availableGames).toEqual(['chess', 'bounty-hunting', 'stick-around']);
    await expect(availability).toHaveAttribute('aria-checked', 'true');
  });
};

export const playgroundVersionMismatchScenario: BrowserScenario = async ({ chat, context }) => {
  const backend = await installMockPlaygroundBackend(context, {
    gameVersions: {
      'bounty-hunting': 1,
      chess: 1,
      'replay-trivia': 2,
      'stick-around': 1
    },
    snapshot: createMockPlaygroundSnapshot({
      games: [createBrowserBountyHuntingGame({ gameId: 'incompatible-bounty-game' })]
    })
  });

  await withExtensionStorageValues(context, 'sync', PLAYGROUND_ENABLED_OPTIONS, async () => {
    const card = await openGamesCard(chat, backend);
    const bountyCard = getGameCard(card, 'The Wild Wild Chat');
    await chat.locator('html').evaluate((element) => {
      element.setAttribute('data-ytcq-chat-skin', 'aero');
      element.setAttribute('data-ytcq-chat-skin-theme', 'dark');
    });

    await expect(bountyCard).toHaveAttribute('aria-disabled', 'true');
    await expect(bountyCard).toHaveAttribute(
      'title',
      'The Wild Wild Chat is temporarily unavailable because Chat Enhancer and Playground versions do not match. Try again when the versions match.'
    );
    const updateBadge = bountyCard.locator('.ytcq-games-version-badge');
    await expect(updateBadge).toHaveText('Update required');
    await expect(card.locator('.ytcq-games-version-notice')).toHaveCount(0);
    await expect(getGameCard(card, 'Chess')).toHaveAttribute('aria-disabled', 'false');

    const activeRow = card.locator('.ytcq-games-incompatible-active-row');
    await expect(activeRow).toContainText('The Wild Wild Chat');
    await expect(activeRow).toContainText(
      'Update required. Chat Enhancer and Playground versions do not match.'
    );
    await expect(activeRow.getByRole('button')).toHaveCount(1);
    await expect(activeRow.getByRole('button', { name: 'Leave' })).toBeVisible();
    await expect(chat.locator('.ytcq-bounty-hunting-game-panel')).toHaveCount(0);
    await expect(chat.locator('.ytcq-bounty-hunting-canvas')).toHaveCount(0);

    await activeRow.getByRole('button', { name: 'Leave' }).click();
    const leave = await backend.waitForClientMessage('gameAction');
    expect(leave).toMatchObject({
      action: 'leave',
      gameId: 'incompatible-bounty-game'
    });
    await backend.sendServerMessage({
      gameId: 'incompatible-bounty-game',
      reason: 'playerLeft',
      type: 'gameEnded',
      userId: 'browser-user'
    });
    await expect(card.locator('.ytcq-games-incompatible-active-row')).toHaveCount(0);

    await backend.sendServerMessage({
      code: 'game_version',
      message: 'Chat Enhancer and Playground versions do not match for this game.',
      type: 'error'
    });
    await expect(chat.locator('.ytcq-toast')).toHaveCount(0);

    await backend.sendServerMessage({
      code: 'bad_action',
      message: 'That action is no longer available.',
      type: 'error'
    });
    await expect(chat.locator('.ytcq-toast')).toContainText(
      'That action is no longer available.'
    );
    await expect(card.locator('.ytcq-games-action-error')).toHaveCount(0);

    await openGamePlayerList(card, 'Chess');
    await expect(card.locator('.ytcq-games-player-row')).not.toHaveCount(0);
  });
};

export const playgroundStickAroundComputerOverlayScenario: BrowserScenario = async ({ chat, context, page }) => {
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot()
  });

  await withExtensionStorageValues(context, 'sync', {
    ...PLAYGROUND_ENABLED_OPTIONS,
    chatSkin: 'aero'
  }, async () => {
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = `
        html,
        body,
        yt-live-chat-item-list-renderer {
          --yt-live-chat-primary-text-color: #0f0f0f;
          --yt-spec-text-primary: #0f0f0f;
          background: #fff !important;
          color: #0f0f0f !important;
        }
      `;
      document.head.append(style);
    });

    for (let index = 0; index < 12; index += 1) {
      await appendMockFixtureMessage(chat, {
        author: `@StickSetup${index}`,
        text: `setup stick around message ${index}`
      });
    }

    const card = await openGamePlayerListFromChat(chat, backend, 'Stick Around!');
    const root = chat.locator('html');
    const aeroSurfaceTreatments = {} as Record<'dark' | 'light', SurfaceTreatment>;
    for (const theme of ['light', 'dark'] as const) {
      await root.evaluate((element, value) => {
        element.setAttribute('data-ytcq-chat-skin-theme', value);
      }, theme);
      aeroSurfaceTreatments[theme] = await readSurfaceTreatment(card);
    }
    await root.evaluate((element) => {
      element.setAttribute('data-ytcq-chat-skin-theme', 'light');
    });
    await invitePlayer(card, 'Computer (Stick Around!)');
    const invite = await backend.waitForClientMessage('invite');
    expect(invite).toMatchObject({
      gameId: 'stick-around',
      toUserId: 'server:computer:stick-around'
    });

    await chat.locator('#item-scroller').evaluate((scroller) => {
      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await backend.sendServerMessage({
      game: createBrowserStickAroundGame(),
      type: 'gameStarted'
    });

    await expect(chat.locator('.ytcq-games-card')).toHaveCount(0);
    const overlay = chat.locator('yt-live-chat-item-list-renderer > .ytcq-stick-around-overlay');
    await expect(overlay).toBeVisible();
    await expect.poll(() => isChatScrolledToBottom(chat)).toBe(true);
    await expect(overlay).toHaveClass(/ytcq-game-overlay-theme-light/);
    await expect(overlay).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.78)');
    const overlayHeader = overlay.locator('.ytcq-game-overlay-header');
    await expect(overlayHeader).toBeVisible();
    for (const theme of ['light', 'dark'] as const) {
      await root.evaluate((element, value) => {
        element.setAttribute('data-ytcq-chat-skin-theme', value);
      }, theme);
      expect(await readSurfaceTreatment(overlayHeader)).toEqual(aeroSurfaceTreatments[theme]);
    }
    await root.evaluate((element) => {
      element.setAttribute('data-ytcq-chat-skin-theme', 'light');
    });
    await expect(overlay.locator('.ytcq-game-overlay-icon')).toBeVisible();
    await expect(overlay.locator('.ytcq-game-overlay-title')).toHaveText('Stick Around!');
    await expect(overlay.locator('.ytcq-game-overlay-subtitle')).toHaveText('Computer (Stick Around!)');
    const soundButton = overlay.getByRole('button', { name: 'Mute game sounds' });
    await expect(soundButton).toBeVisible();
    const hideButton = overlay.getByRole('button', { name: 'Hide' });
    await expect(hideButton).toBeVisible();
    await expect(hideButton).toHaveCSS('color', 'rgb(0, 90, 147)');
    await expect(hideButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await soundButton.hover();
    const soundButtonStyle = await readButtonTreatment(soundButton);
    await hideButton.hover();
    expect(await readButtonTreatment(hideButton)).toEqual(soundButtonStyle);
    expect(soundButtonStyle.color).toBe('rgb(0, 90, 147)');
    expect(soundButtonStyle.backgroundImage).toContain('linear-gradient');
    const canvas = chat.locator('.ytcq-stick-around-canvas');
    await expect(canvas).toBeVisible();
    await expect(overlay.getByRole('button', { name: 'Ready' })).toHaveCount(0);
    const readyPoint = await findStickAroundReadyHitboxPoint(page, overlay, canvas);
    await page.mouse.click(readyPoint.x, readyPoint.y);
    const ready = await waitForGameAction(backend, 'ready', (message) =>
      message.gameId === 'browser-stick-around-game'
    );
    expect(ready).toMatchObject({
      action: 'ready',
      gameId: 'browser-stick-around-game'
    });
    await expect(chat.locator('#item-scroller > .ytcq-stick-around-overlay')).toHaveCount(0);
    await expect(chat.locator('yt-live-chat-header-renderer .ytcq-stick-around-overlay')).toHaveCount(0);
    await expect(chat.locator('#input-panel .ytcq-stick-around-overlay')).toHaveCount(0);
    await chat.locator('#item-scroller').evaluate((scroller) => {
      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await expect.poll(() => isChatScrolledToBottom(chat)).toBe(true);

    const messageMenuButton = chat.locator('yt-live-chat-text-message-renderer #menu button').first();
    const box = await messageMenuButton.boundingBox();
    if (!box) throw new Error('Expected a visible message menu button under the Stick Around overlay.');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(chat.locator('ytd-menu-popup-renderer')).toHaveCount(0);
  });
};

export const playgroundInviteCancelScenario: BrowserScenario = async ({ chat, context }) => {
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

    await card
      .locator('.ytcq-games-detail-actions')
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();
    await expect(card.locator('.ytcq-profile-card-title')).toHaveText('Games');
    await openGamePlayerList(card, 'Chess');
    const player = card.locator('.ytcq-games-player-row').filter({ hasText: 'Luna Chat' });
    await expect(player).toContainText('Waiting for reply...');
    await player.getByRole('button', { name: 'Cancel' }).click();
    const cancel = await backend.waitForClientMessage('cancelInvite');
    expect(cancel).toMatchObject({
      gameId: 'chess',
      toUserId: 'luna-user'
    });
    await expect(player).toContainText('Available now');
    await expect(player.getByRole('button', { name: 'Invite' })).toBeVisible();
    await expectClientMessageCount(backend, 'invite', 1, 500);
    await expectClientMessageCount(backend, 'cancelInvite', 1);
    await expectClientMessageCount(backend, 'respondInvite', 0);
  });
};

export const playgroundReplayTriviaInviteScenario: BrowserScenario = async ({ chat, context }) => {
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot()
  });

  await withExtensionStorageValues(context, 'sync', PLAYGROUND_ENABLED_OPTIONS, async () => {
    const card = await openGamesCard(chat, backend);
    await expect(card.locator('.ytcq-games-game-label')).toHaveText([
      'Chess',
      'HELP-A-FRIEND! Trivia',
      'The Wild Wild Chat',
      'Stick Around!'
    ]);
    const bountyCard = getGameCard(card, 'The Wild Wild Chat');
    const replayTriviaCard = getGameCard(card, 'HELP-A-FRIEND! Trivia');
    const stickAroundCard = getGameCard(card, 'Stick Around!');
    await expect(bountyCard).toHaveAttribute('aria-disabled', 'true');
    await expect(stickAroundCard).toHaveAttribute('aria-disabled', 'true');
    for (const livestreamOnlyCard of [bountyCard, stickAroundCard]) {
      const contextBadge = livestreamOnlyCard.locator('.ytcq-games-context-badge');
      await expect(contextBadge).toHaveText('Livestream only');
      await expect(livestreamOnlyCard).toHaveAttribute(
        'title',
        'Can only be played during live chat.'
      );
    }
    await expect(replayTriviaCard).toHaveAttribute('aria-disabled', 'false');
    await expect(replayTriviaCard.locator('.ytcq-games-context-badge')).toHaveCount(0);

    await openGamePlayerList(card, 'HELP-A-FRIEND! Trivia');
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

export const playgroundReplayTriviaAnswerScenario: BrowserScenario = async ({ chat, context }) => {
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot()
  });

  await withExtensionStorageValues(context, 'sync', PLAYGROUND_ENABLED_OPTIONS, async () => {
    const card = await openGamePlayerListFromChat(chat, backend, 'HELP-A-FRIEND! Trivia');
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

    const canvas = chat.locator('.ytcq-replay-trivia-canvas');
    await expect(canvas).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 3_100));
    await dispatchReplayTriviaAnswerKey(canvas, '2');

    const answer = await waitForGameAction(backend, 'answer');
    expect(answer).toMatchObject({
      action: 'answer',
      gameId: 'browser-replay-trivia-game',
      payload: {
        choiceIndex: 1,
        expectedQuestionId: 'question-1',
        expectedQuestionIndex: 0,
        expectedStatus: 'question'
      }
    });

    await dispatchReplayTriviaAnswerKey(canvas, '3');
    await expectGameActionCount(backend, 'answer', 1, (message) =>
      message.gameId === 'browser-replay-trivia-game',
      500
    );
  });
};

export const playgroundBountyHuntingRoundStartScenario: BrowserScenario = async ({ chat, context }) => {
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot()
  });

  await withExtensionStorageValues(context, 'sync', PLAYGROUND_ENABLED_OPTIONS, async () => {
    const card = await openBountyHuntingPlayerList(chat, backend);

    for (let index = 0; index < 12; index += 1) {
      await appendMockFixtureMessage(chat, {
        author: `@BountySetup${index}`,
        text: `setup message ${index}`
      });
    }
    await chat.locator('#item-scroller').evaluate((scroller) => {
      scroller.scrollTop = 0;
    });

    await inviteBountyHuntingComputer(card, backend);

    await backend.sendServerMessage({
      game: createBrowserBountyHuntingGame({
        roundStartTimestampUsec: getFixtureMessageTimestampUsec('fixture-message-1')
      }),
      type: 'gameStarted'
    });

    await expect(chat.locator('.ytcq-games-card')).toHaveCount(0);
    await expect(chat.locator('.ytcq-bounty-hunting-game-panel')).toBeVisible();
    await expect(chat.locator('.ytcq-bounty-hunting-canvas')).toBeVisible();

    const divider = chat.locator('.ytcq-bounty-hunting-start-divider');
    await expect(divider).toBeVisible();
    await expect(chat.locator('#items > .ytcq-bounty-hunting-start-divider')).toHaveCount(0);
    await expect(chat.locator('yt-live-chat-text-message-renderer > .ytcq-bounty-hunting-start-divider')).toHaveCount(1);
    await expect.poll(async () => chat.locator('#items').evaluate((items) => ({
      directDividerChildren: Array.from(items.children)
        .filter((child) => child.classList.contains('ytcq-bounty-hunting-start-divider')).length,
      nonMessageChildren: Array.from(items.children)
        .filter((child) => child.tagName.toLowerCase() !== 'yt-live-chat-text-message-renderer')
        .map((child) => child.tagName.toLowerCase())
    }))).toEqual({
      directDividerChildren: 0,
      nonMessageChildren: []
    });
    const dividerBeforeScroll = await divider.evaluate((element) => ({
      parentId: element.parentElement?.id || '',
      parentTag: element.parentElement?.tagName.toLowerCase() || '',
      parentTop: element.parentElement?.getBoundingClientRect().top || 0,
      position: getComputedStyle(element).position,
      rectTop: element.getBoundingClientRect().top,
      top: (element as HTMLElement).style.top
    }));
    expect(dividerBeforeScroll.parentTag).toBe('yt-live-chat-text-message-renderer');
    expect(dividerBeforeScroll.position).toBe('absolute');

    await chat.locator('#item-scroller').evaluate((scroller) => {
      scroller.scrollTop += 48;
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await chat.locator('body').evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    await expect(divider).toHaveCSS('position', 'absolute');
    const dividerAfterScroll = await divider.evaluate((element) => ({
      parentId: element.parentElement?.id || '',
      parentTop: element.parentElement?.getBoundingClientRect().top || 0,
      rectTop: element.getBoundingClientRect().top,
      top: (element as HTMLElement).style.top
    }));
    expect(dividerAfterScroll.parentId).toBe(dividerBeforeScroll.parentId);
    expect(dividerAfterScroll.top).toBe(dividerBeforeScroll.top);
    expect(Math.round(dividerAfterScroll.rectTop - dividerBeforeScroll.rectTop))
      .toBe(Math.round(dividerAfterScroll.parentTop - dividerBeforeScroll.parentTop));

    // The game panel intentionally floats above chat. Compact it before the
    // message-click assertion, just as a player must do to use the feed below.
    await chat.locator('.ytcq-bounty-hunting-game-compact-toggle').click();
    await expect(chat.locator('.ytcq-bounty-hunting-game-panel'))
      .toHaveClass(/ytcq-game-panel-compact/);

    const missedMessageId = await appendMockFixtureMessage(chat, {
      author: '@BountyMiss',
      text: 'nothing to claim here'
    });
    if (!missedMessageId) throw new Error('Could not append Bounty Hunting miss message.');
    const messageId = await appendMockFixtureMessage(chat, {
      author: '@BountyFan',
      text: 'claim this @Marco'
    });
    if (!messageId) throw new Error('Could not append Bounty Hunting claim message.');
    expect(messageId).toMatch(/^fixture-message-/);

    const missedMessage = chat.locator(
      `yt-live-chat-text-message-renderer[id="${missedMessageId}"]`
    );
    const message = chat.locator(`yt-live-chat-text-message-renderer[id="${messageId}"]`);
    await expect(missedMessage).toBeVisible();
    await expect(message).toBeVisible();
    await missedMessage.evaluate((element) => element.scrollIntoView({ block: 'start' }));
    const initialMissState = await missedMessage.evaluate((element, validMessageId) => {
      const validMessage = document.getElementById(validMessageId);
      if (!validMessage) throw new Error('Could not find Bounty Hunting claim message.');
      const openNativeMessageMenu = () => {
        const menu = document.createElement('ytd-menu-popup-renderer');
        menu.className = 'ytcq-fixture-native-body-menu';
        document.body.append(menu);
      };
      element.addEventListener('click', openNativeMessageMenu);
      validMessage.addEventListener('click', openNativeMessageMenu);
      const missedBody = element.querySelector('[id="message"]') || element;
      missedBody.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 40,
        clientY: 50
      }));
      const feedback = document.querySelector<HTMLElement>(
        '.ytcq-bounty-hunting-miss-feedback'
      );
      return {
        hidden: feedback?.hidden,
        nativeMenuCount: document.querySelectorAll('.ytcq-fixture-native-body-menu').length
      };
    }, messageId);
    expect(initialMissState).toEqual({ hidden: true, nativeMenuCount: 0 });

    const miss = await waitForGameAction(backend, 'shootBounty', (clientMessage) =>
      clientMessage.payload?.messageId === missedMessageId
    );
    expect(miss).toMatchObject({
      action: 'shootBounty',
      gameId: 'browser-bounty-game'
    });
    expect(miss.payload).toEqual({
      messageId: missedMessageId,
      observations: [{
        bountyIds: [],
        messageId: missedMessageId,
        messageTimestampUsec: getFixtureMessageTimestampUsec(missedMessageId)
      }]
    });
    await backend.sendServerMessage({
      game: createBrowserBountyHuntingGame({
        missCooldownUntil: Date.now() + 5_000,
        roundStartTimestampUsec: getFixtureMessageTimestampUsec('fixture-message-1')
      }),
      type: 'gameUpdated'
    });

    const missFeedback = chat.locator('.ytcq-bounty-hunting-miss-feedback');
    await expect(missFeedback).toBeVisible();
    await expect(missFeedback).toHaveText('MISS! Reloading...');
    await expect(missedMessage).toHaveCSS('cursor', 'not-allowed');
    expect(
      await missFeedback.evaluate((element) => ({
        left: (element as HTMLElement).style.left,
        top: (element as HTMLElement).style.top
      }))
    ).toEqual({ left: '52px', top: '41px' });
    const missFeedbackHeight = await missFeedback.evaluate(
      (element) => element.getBoundingClientRect().height
    );
    const missIconMetrics = await missFeedback
      .locator('.ytcq-bounty-hunting-miss-icon')
      .evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          fontSize: Number.parseFloat(getComputedStyle(element.parentElement!).fontSize),
          height: bounds.height,
          width: bounds.width
        };
      });
    expect(missIconMetrics).toEqual({ fontSize: 11, height: 11, width: 11 });
    await expect(missFeedback.locator('.ytcq-bounty-hunting-miss-countdown')).toHaveCount(0);
    await expect(chat.locator('.ytcq-fixture-native-body-menu')).toHaveCount(0);
    const missFeedbackState = await missFeedback.evaluate((element) => {
      const feedback = element as HTMLElement;
      const icon = feedback.querySelector<HTMLElement>('.ytcq-bounty-hunting-miss-icon');
      if (!icon) throw new Error('Expected the Bounty Hunting miss icon.');
      const readTheme = () => ({
        backgroundColor: getComputedStyle(feedback).backgroundColor,
        borderStyle: getComputedStyle(feedback).borderStyle,
        color: getComputedStyle(feedback).color,
        iconBackgroundColor: getComputedStyle(icon).backgroundColor,
        iconBorderRadius: getComputedStyle(icon).borderRadius,
        progressBackgroundColor: getComputedStyle(feedback, '::before').backgroundColor
      });
      const root = document.documentElement;
      const wasDark = root.hasAttribute('dark');
      root.removeAttribute('dark');
      const lightTheme = readTheme();
      root.setAttribute('dark', '');
      const darkTheme = readTheme();
      if (!wasDark) root.removeAttribute('dark');
      return {
        darkTheme,
        lightTheme,
        iconAnimationName: getComputedStyle(icon).animationName,
        progressAnimationName: getComputedStyle(feedback, '::before').animationName
      };
    });
    expect(missFeedbackState).toMatchObject({
      darkTheme: {
        backgroundColor: 'rgb(61, 50, 36)',
        color: 'rgb(241, 241, 241)',
        iconBackgroundColor: 'rgba(0, 0, 0, 0)',
        iconBorderRadius: '0px',
        progressBackgroundColor: 'rgb(91, 69, 38)'
      },
      lightTheme: {
        backgroundColor: 'rgb(248, 237, 207)',
        borderStyle: 'none',
        color: 'rgb(71, 48, 0)',
        iconBackgroundColor: 'rgba(0, 0, 0, 0)',
        iconBorderRadius: '0px',
        progressBackgroundColor: 'rgb(241, 216, 157)'
      }
    });
    expect(missFeedbackState.iconAnimationName).toBe('none');
    expect(missFeedbackState.progressAnimationName).toContain(
      'ytcq-bounty-hunting-reload-progress'
    );

    // The backend cooldown is authoritative, so clicks during it are consumed
    // without sending another shot or opening YouTube's native message menu.
    await dispatchMessageClick(message);
    await expectGameActionCount(
      backend,
      'shootBounty',
      1,
      (clientMessage) => clientMessage.gameId === 'browser-bounty-game',
      100
    );
    await expect(chat.locator('.ytcq-fixture-native-body-menu')).toHaveCount(0);
    await backend.sendServerMessage({
      game: createBrowserBountyHuntingGame({
        roundStartTimestampUsec: getFixtureMessageTimestampUsec('fixture-message-1')
      }),
      type: 'gameUpdated'
    });
    await expect(missFeedback).toBeHidden();
    await expect(missedMessage).not.toHaveCSS('cursor', 'not-allowed');
    await dispatchMessageClick(message);

    const claim = await waitForGameAction(backend, 'shootBounty', (clientMessage) =>
      clientMessage.payload?.messageId === messageId
    );
    expect(claim).toMatchObject({
      action: 'shootBounty',
      gameId: 'browser-bounty-game'
    });
    expect(claim.payload).toEqual({
      messageId,
      observations: [{
        bountyIds: ['mention-user'],
        messageId,
        messageTimestampUsec: getFixtureMessageTimestampUsec(messageId)
      }]
    });

    const validShotMessages = await backend.getClientMessages();
    const validShotIndex = validShotMessages.findIndex((clientMessage) =>
      clientMessage.type === 'gameAction' &&
      clientMessage.action === 'shootBounty' &&
      clientMessage.payload?.messageId === messageId
    );
    expect(validShotIndex).toBeGreaterThan(0);
    const validWitnessIndexes = validShotMessages.flatMap((clientMessage, index) =>
      index < validShotIndex &&
      clientMessage.type === 'gameAction' &&
      clientMessage.action === 'observeBountyMessage' &&
      getBountyObservationPayloads(clientMessage).some((observation) =>
        observation.messageId === messageId &&
        Array.isArray(observation.bountyIds) &&
        observation.bountyIds.includes('mention-user')
      )
        ? [index]
        : []
    );
    const validWitnessIndex = validWitnessIndexes.at(-1) ?? -1;
    expect(validWitnessIndex).toBeGreaterThanOrEqual(0);
    expect(validWitnessIndex).toBeLessThan(validShotIndex);
    const validWitness = validShotMessages[validWitnessIndex];
    expect(validWitness).toMatchObject({
      action: 'observeBountyMessage',
      gameId: 'browser-bounty-game',
      type: 'gameAction'
    });
    if (validWitness?.type !== 'gameAction') {
      throw new Error('Expected a Bounty Hunting witness immediately before the shot.');
    }
    expect(getBountyObservationPayloads(validWitness)).toEqual([
      expect.objectContaining({
        bountyIds: ['mention-user'],
        messageId
      })
    ]);

    await backend.sendServerMessage({
      game: createBrowserBountyHuntingGame({
        claimedMessageId: messageId,
        roundStartTimestampUsec: getFixtureMessageTimestampUsec('fixture-message-1')
      }),
      type: 'gameUpdated'
    });
    await expect(chat.locator('.ytcq-bounty-hunting-claimed-feed')).toHaveCount(0);
    const claimIndicator = message.locator('.ytcq-bounty-hunting-claim-indicator');
    await expect(claimIndicator).toHaveText('B$125');
    expect(await claimIndicator.evaluate((element) => element.getBoundingClientRect().height)).toBe(
      missFeedbackHeight
    );
    await expect(claimIndicator).toHaveCSS('box-shadow', 'none');
    await claimIndicator.evaluate((indicator) => indicator.remove());
    await expect(claimIndicator).toHaveText('B$125');
    await expect(claimIndicator).toHaveCSS('box-shadow', 'none');
    await expect(chat.locator('.ytcq-fixture-native-body-menu')).toHaveCount(0);

    const claimedOnlyMessageId = await appendRequiredMockFixtureMessage(chat, {
      author: '@LateBountyFan',
      text: 'another message for @Marco'
    });
    const claimedOnlyMissState = await chat
      .locator(`yt-live-chat-text-message-renderer[id="${claimedOnlyMessageId}"]`)
      .evaluate((element) => {
        const messageBody = element.querySelector('[id="message"]') || element;
        messageBody.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true
        }));
        const feedback = document.querySelector<HTMLElement>(
          '.ytcq-bounty-hunting-miss-feedback'
        );
        return { hidden: feedback?.hidden };
      });
    expect(claimedOnlyMissState).toEqual({ hidden: true });

    const claimedOnlyShot = await waitForGameAction(backend, 'shootBounty', (clientMessage) =>
      clientMessage.payload?.messageId === claimedOnlyMessageId
    );
    expect(claimedOnlyShot.payload).toEqual({
      messageId: claimedOnlyMessageId,
      observations: [{
        bountyIds: [],
        messageId: claimedOnlyMessageId,
        messageTimestampUsec: getFixtureMessageTimestampUsec(claimedOnlyMessageId)
      }]
    });
    await backend.sendServerMessage({
      game: createBrowserBountyHuntingGame({
        claimedMessageId: messageId,
        missCooldownUntil: Date.now() + 5_000,
        roundStartTimestampUsec: getFixtureMessageTimestampUsec('fixture-message-1')
      }),
      type: 'gameUpdated'
    });
    await expect(missFeedback).toBeVisible();
    await expect(missFeedback).toHaveClass(/ytcq-bounty-hunting-reload-progress/);

    await expectGameActionCount(
      backend,
      'shootBounty',
      3,
      (message) => message.gameId === 'browser-bounty-game'
    );
  });
};

export const playgroundBountyHuntingCutoffScenario: BrowserScenario = async ({ chat, context }) => {
    const backend = await installMockPlaygroundBackend(context, {
      snapshot: createMockPlaygroundSnapshot()
    });

  await withExtensionStorageValues(context, 'sync', PLAYGROUND_ENABLED_OPTIONS, async () => {
    const card = await openBountyHuntingPlayerList(chat, backend);
    const oldMessageId = await appendRequiredMockFixtureMessage(chat, {
      author: '@OldBountyFan',
      text: 'this old message mentions @Marco'
    });

    const markerMessageId = await appendRequiredMockFixtureMessage(chat, {
      author: '@BountyMarshal',
      text: 'round start marker'
    });
    await inviteBountyHuntingComputer(card, backend);
    await backend.sendServerMessage({
      game: createBrowserBountyHuntingGame({
        roundStartTimestampUsec: getFixtureMessageTimestampUsec(markerMessageId)
      }),
      type: 'gameStarted'
    });

    await expect(chat.locator('.ytcq-games-card')).toHaveCount(0);
    await expect(chat.locator('.ytcq-bounty-hunting-game-panel')).toBeVisible();

    const oldMessage = chat.locator(`yt-live-chat-text-message-renderer[id="${oldMessageId}"]`);
    await expect(oldMessage).toBeVisible();
    await dispatchMessageClick(oldMessage);
    await expectNoGameAction(
      backend,
      'shootBounty',
      1_200,
      (message) => message.payload?.messageId === oldMessageId
    );

    const newMessageId = await appendRequiredMockFixtureMessage(chat, {
      author: '@NewBountyFan',
      text: 'this new message mentions @Marco'
    });
    const newMessage = chat.locator(`yt-live-chat-text-message-renderer[id="${newMessageId}"]`);
    await expect(newMessage).toBeVisible();
    await dispatchMessageClick(newMessage);

    const claim = await waitForGameAction(backend, 'shootBounty', (message) =>
      message.payload?.messageId === newMessageId
    );
    expect(claim).toMatchObject({
      action: 'shootBounty',
      gameId: 'browser-bounty-game'
    });
    expect(claim.payload).toEqual({
      messageId: newMessageId,
      observations: [{
        bountyIds: ['mention-user'],
        messageId: newMessageId,
        messageTimestampUsec: getFixtureMessageTimestampUsec(newMessageId)
      }]
    });
  });
};

export const playgroundBountyHuntingWitnessScenario: BrowserScenario = async ({ chat, context }) => {
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot()
  });

  await withExtensionStorageValues(context, 'sync', PLAYGROUND_ENABLED_OPTIONS, async () => {
    const card = await openBountyHuntingPlayerList(chat, backend);

    await inviteBountyHuntingComputer(card, backend);
    await backend.sendServerMessage({
      game: createBrowserBountyHuntingGame({
        roundStartTimestampUsec: getFixtureMessageTimestampUsec('fixture-message-1')
      }),
      type: 'gameStarted'
    });
    await expect(chat.locator('.ytcq-bounty-hunting-game-panel')).toBeVisible();

    const messageId = await emitMockFixtureFeedMessage(chat, {
      author: '@WitnessFan',
      text: 'automatic witness for @Marco'
    });
    if (!messageId) throw new Error('Could not emit Bounty Hunting feed message.');
    await expect(chat.locator(`[data-message-id="${messageId}"], #${messageId}`)).toHaveCount(0);

    const witness = await waitForGameAction(backend, 'observeBountyMessage', (message) =>
      getBountyObservationPayloads(message).some((observation) => observation.messageId === messageId)
    );
    const observation = getBountyObservationPayloads(witness)
      .find((entry) => entry.messageId === messageId);
    expect(observation).toMatchObject({
      bountyIds: ['mention-user'],
      messageId,
      messageTimestampUsec: getFixtureMessageTimestampUsec(messageId)
    });
  });
};

export const playgroundBountyHuntingCountdownStartScenario: BrowserScenario = async ({ chat, context }) => {
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot()
  });

  await withExtensionStorageValues(context, 'sync', PLAYGROUND_ENABLED_OPTIONS, async () => {
    const card = await openBountyHuntingPlayerList(chat, backend);

    await appendRequiredMockFixtureMessage(chat, {
      author: '@CountdownMarker',
      text: 'latest visible message before the hunt'
    });
    await inviteBountyHuntingComputer(card, backend);
    await backend.sendServerMessage({
      game: createBrowserBountyHuntingGame({
        gameId: 'browser-bounty-countdown-game',
        phaseStartedAt: Date.now() - 4_000,
        status: 'countdown'
      }),
      type: 'gameStarted'
    });

    await expect(chat.locator('.ytcq-bounty-hunting-game-panel')).toBeVisible();
    const startRound = await waitForGameAction(backend, 'startRound', (message) =>
      message.gameId === 'browser-bounty-countdown-game'
    );
    expect(startRound.payload).toBeUndefined();
  });
};

function getGameCard(card: Locator, label: string): Locator {
  return card.locator('.ytcq-games-game-card').filter({ hasText: label });
}

async function openGamesCard(
  chat: ChatSurface,
  backend: Awaited<ReturnType<typeof installMockPlaygroundBackend>>
): Promise<Locator> {
  const gamesButton = chat.locator('.ytcq-games-button');
  await expect(gamesButton).toBeVisible();

  await gamesButton.click();
  await backend.waitForClientMessage('hello');

  const card = chat.locator('.ytcq-games-card');
  await expect(card).toBeVisible();
  return card;
}

async function openGamePlayerList(card: Locator, gameLabel: string): Promise<void> {
  await getGameCard(card, gameLabel).click();
  await expect(card.locator('.ytcq-profile-card-title')).toHaveText(gameLabel);
  await expect(card.locator('.ytcq-games-section-title')).toHaveText('Players');
  const detailActions = card.locator('.ytcq-games-detail-actions');
  const cancel = detailActions.getByRole('button', { name: 'Cancel' });
  await expect(detailActions).toHaveCSS('display', 'flex');
  await expect(detailActions).toHaveCSS('justify-content', 'flex-end');
  await expect(cancel).toBeVisible();
  await expect(cancel).toHaveClass(/ytcq-profile-card-open/);
}

async function openGamePlayerListFromChat(
  chat: ChatSurface,
  backend: Awaited<ReturnType<typeof installMockPlaygroundBackend>>,
  gameLabel: string
): Promise<Locator> {
  const card = await openGamesCard(chat, backend);
  await openGamePlayerList(card, gameLabel);
  return card;
}

async function openBountyHuntingPlayerList(
  chat: ChatSurface,
  backend: Awaited<ReturnType<typeof installMockPlaygroundBackend>>
): Promise<Locator> {
  return openGamePlayerListFromChat(chat, backend, 'The Wild Wild Chat');
}

async function inviteBountyHuntingComputer(
  card: Locator,
  backend: Awaited<ReturnType<typeof installMockPlaygroundBackend>>
): Promise<void> {
  await invitePlayer(card, 'Computer (Bounty Hunter)');
  const invite = await backend.waitForClientMessage('invite');
  expect(invite).toMatchObject({
    gameId: 'bounty-hunting',
    toUserId: 'server:computer:bounty-hunting'
  });
}

async function appendRequiredMockFixtureMessage(
  chat: ChatSurface,
  message: {
    author: string;
    text: string;
  }
): Promise<string> {
  const messageId = await appendMockFixtureMessage(chat, message);
  if (!messageId) throw new Error('Could not append Bounty Hunting fixture message.');
  return messageId;
}

async function dispatchMessageClick(message: Locator): Promise<void> {
  await message.evaluate((element) => {
    element.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    }));
  });
}

async function dispatchReplayTriviaAnswerKey(canvas: Locator, key: string): Promise<void> {
  await canvas.evaluate((element, pressedKey) => {
    element.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: pressedKey
    }));
  }, key);
}

async function invitePlayer(card: Locator, playerName: string): Promise<void> {
  await test.step(`Invite ${playerName}`, async () => {
    const player = card.locator('.ytcq-games-player-row').filter({ hasText: playerName });
    await player.getByRole('button', { name: 'Invite' }).click();
    await expect(player).toContainText('Waiting for reply...');
  });
}

interface BrowserInviteOptions {
  gameId?: GameId;
  inviteId?: string;
}

function createBrowserInvite({
  gameId = 'chess',
  inviteId = 'browser-invite-chess'
}: BrowserInviteOptions = {}): PublicInvite {
  const now = Date.now();
  return {
    createdAt: now,
    expiresAt: now + 60_000,
    fromUser: {
      displayName: 'Luna Chat',
      userId: 'luna-user'
    },
    gameId,
    inviteId,
    status: 'pending',
    toUser: {
      displayName: 'Browser Viewer',
      userId: 'browser-user'
    }
  };
}

interface BrowserChessGameOptions {
  fen?: string;
  gameId?: string;
  pgn?: string;
  status?: 'active' | 'checkmate' | 'draw' | 'resigned';
  turn?: 'black' | 'white';
}

function createBrowserChessGame({
  fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  gameId = 'browser-chess-game',
  pgn = '',
  status = 'active',
  turn = 'white'
}: BrowserChessGameOptions = {}): PublicGame {
  return {
    fen,
    gameId,
    gameType: 'chess',
    pgn,
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
    status,
    turn
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

interface BrowserBountyHuntingGameOptions {
  claimedMessageId?: string;
  gameId?: string;
  missCooldownUntil?: number;
  phaseStartedAt?: number;
  roundStartTimestampUsec?: string;
  status?: 'active' | 'countdown';
}

function createBrowserBountyHuntingGame({
  claimedMessageId,
  gameId = 'browser-bounty-game',
  missCooldownUntil,
  phaseStartedAt,
  roundStartTimestampUsec,
  status = 'active'
}: BrowserBountyHuntingGameOptions = {}): PublicGame {
  const now = Date.now();
  const startedAt = phaseStartedAt ?? now - 1_000;
  const bounties = [{
    amount: 125,
    description: 'a message that mentions a user',
    id: 'mention-user',
    matcher: { kind: 'mention' },
    ...(claimedMessageId ? {
      claim: {
        bountyId: 'mention-user',
        claimedAt: now,
        messageId: claimedMessageId,
        role: 'host',
        userId: 'browser-user'
      }
    } : {})
  }];

  return {
    bounties,
    bountyProviderUserId: 'browser-user',
    gameId,
    gameType: 'bounty-hunting',
    ...(missCooldownUntil ? { missCooldownUntil } : {}),
    phaseStartedAt: startedAt,
    players: {
      guest: {
        displayName: 'Computer (Bounty Hunter)',
        userId: 'server:computer:bounty-hunting'
      },
      host: {
        displayName: 'Browser Viewer',
        userId: 'browser-user'
      }
    },
    readyPlayers: {
      guest: true,
      host: true
    },
    roundEndsAt: now + 59_000,
    ...(roundStartTimestampUsec ? { roundStartTimestampUsec } : {}),
    scores: {
      guest: 0,
      host: claimedMessageId ? 125 : 0
    },
    status
  } as PublicGame;
}

function createBrowserStickAroundGame(overrides: Partial<PublicStickAroundGame> = {}): PublicStickAroundGame {
  const now = Date.now();
  const status = overrides.status || 'ready';
  return {
    finishReports: {},
    gameId: 'browser-stick-around-game',
    gameType: 'stick-around',
    hazards: [],
    inputs: {},
    phaseStartedAt: now,
    players: {
      guest: {
        displayName: 'Computer (Stick Around!)',
        userId: 'server:computer:stick-around'
      },
      host: {
        displayName: 'Browser Viewer',
        userId: 'browser-user'
      }
    },
    readyPlayers: status === 'ready' ? {} : {
      guest: true,
      host: true
    },
    roundStartedAt: status === 'ready' ? undefined : now,
    roundSeed: 12345,
    status,
    ...overrides
  };
}

async function isChatScrolledToBottom(chat: ChatSurface): Promise<boolean> {
  return chat.locator('#item-scroller').evaluate((scroller) =>
    scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
  );
}

async function readButtonTreatment(button: Locator): Promise<{
  backgroundColor: string;
  backgroundImage: string;
  borderRadius: string;
  boxShadow: string;
  color: string;
}> {
  return button.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
      color: style.color
    };
  });
}

interface SurfaceTreatment {
  backdropFilter: string;
  backgroundColor: string;
  backgroundImage: string;
  borderColor: string;
  borderRadius: string;
  boxShadow: string;
  color: string;
}

async function readSurfaceTreatment(surface: Locator): Promise<SurfaceTreatment> {
  return surface.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backdropFilter: style.backdropFilter,
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      borderColor: style.borderColor,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
      color: style.color
    };
  });
}

async function findStickAroundReadyHitboxPoint(
  page: Page,
  overlay: Locator,
  canvas: Locator
): Promise<{ x: number; y: number }> {
  const point = { x: 0, y: 0 };
  const candidateArenaY = [
    400,
    300
  ];

  await expect.poll(async () => {
    const box = await canvas.boundingBox();
    if (!box) return false;
    const viewportScale = Math.max(0.1, Math.min(
      1,
      box.width / STICK_AROUND_ARENA_WIDTH,
      box.height / STICK_AROUND_ARENA_HEIGHT
    ));
    const offsetX = (box.width - STICK_AROUND_ARENA_WIDTH * viewportScale) / 2;
    const offsetY = (box.height - STICK_AROUND_ARENA_HEIGHT * viewportScale) / 2;

    for (const arenaY of candidateArenaY) {
      point.x = box.x + offsetX + (STICK_AROUND_ARENA_WIDTH / 2) * viewportScale;
      point.y = box.y + offsetY + arenaY * viewportScale;
      await page.mouse.move(point.x, point.y);
      const cursor = await overlay.evaluate((element) => (element as HTMLElement).style.cursor);
      if (cursor === 'pointer') return true;
    }

    return false;
  }, {
    message: 'Expected Stick Around canvas Ready hitbox to respond to hover.',
    timeout: 10_000
  }).toBe(true);

  return point;
}

function getFixtureMessageTimestampUsec(messageId: string): string {
  const match = /^fixture-message-(\d+)$/.exec(messageId);
  if (!match) throw new Error(`Unexpected fixture message id: ${messageId}`);
  return String(1780000000000000 + Number(match[1]));
}

async function waitForGameAction(
  backend: Awaited<ReturnType<typeof installMockPlaygroundBackend>>,
  action: string,
  predicate: (message: GameActionClientMessage) => boolean = () => true
): Promise<GameActionClientMessage> {
  await expect.poll(async () => {
    const messages = await backend.getClientMessages();
    return messages.some((message) =>
      message.type === 'gameAction' && message.action === action && predicate(message)
    );
  }, {
    message: `Expected Playground game action ${action}.`,
    timeout: 10_000
  }).toBe(true);

  const messages = await backend.getClientMessages();
  const match = messages.find((message) =>
    message.type === 'gameAction' && message.action === action && predicate(message)
  );
  if (!match || match.type !== 'gameAction') throw new Error(`Missing Playground game action ${action}.`);
  return match;
}

async function waitForClientMessage<Type extends ClientMessage['type']>(
  backend: Awaited<ReturnType<typeof installMockPlaygroundBackend>>,
  type: Type,
  predicate: (message: Extract<ClientMessage, { type: Type }>) => boolean = () => true
): Promise<Extract<ClientMessage, { type: Type }>> {
  await expect.poll(async () => {
    const messages = await backend.getClientMessages();
    return messages.some((message) => {
      if (message.type !== type) return false;
      return predicate(message as Extract<ClientMessage, { type: Type }>);
    });
  }, {
    message: `Expected Playground client message ${type}.`,
    timeout: 10_000
  }).toBe(true);

  const messages = await backend.getClientMessages();
  const match = messages.find((message) => {
    if (message.type !== type) return false;
    return predicate(message as Extract<ClientMessage, { type: Type }>);
  });
  if (!match || match.type !== type) throw new Error(`Missing Playground client message ${type}.`);
  return match as Extract<ClientMessage, { type: Type }>;
}

async function expectNoGameAction(
  backend: Awaited<ReturnType<typeof installMockPlaygroundBackend>>,
  action: string,
  timeoutMs: number,
  predicate: (message: GameActionClientMessage) => boolean = () => true
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  const messages = await backend.getClientMessages();
  expect(messages.some((message) =>
    message.type === 'gameAction' && message.action === action && predicate(message)
  )).toBe(false);
}

async function expectGameActionCount(
  backend: Awaited<ReturnType<typeof installMockPlaygroundBackend>>,
  action: string,
  expectedCount: number,
  predicate: (message: GameActionClientMessage) => boolean = () => true,
  timeoutMs = 0
): Promise<void> {
  if (timeoutMs > 0) await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  const messages = await backend.getClientMessages();
  const count = messages.filter((message) =>
    message.type === 'gameAction' && message.action === action && predicate(message)
  ).length;
  expect(count).toBe(expectedCount);
}

async function expectClientMessageCount<Type extends ClientMessage['type']>(
  backend: Awaited<ReturnType<typeof installMockPlaygroundBackend>>,
  type: Type,
  expectedCount: number,
  timeoutMs = 0
): Promise<void> {
  if (timeoutMs > 0) await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  const messages = await backend.getClientMessages();
  expect(messages.filter((message) => message.type === type)).toHaveLength(expectedCount);
}

function getBountyObservationPayloads(message: GameActionClientMessage): Array<Record<string, unknown>> {
  const observations = message.payload?.observations;
  return Array.isArray(observations)
    ? observations.filter((entry): entry is Record<string, unknown> =>
      Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)
    )
    : [];
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
