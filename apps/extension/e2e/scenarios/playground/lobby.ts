/** Browser scenarios for Playground Games. */
import { expect } from '@playwright/test';
import {
  createMockPlaygroundSnapshot,
  installMockPlaygroundBackend
} from '../../support/playground-backend';
import {
  getExtensionStorageValues,
  withExtensionStorageValues
} from '../../support/extension-storage';
import type { BrowserScenario } from '../types';
import {
  expectClientMessageCount,
  waitForClientMessage,
  waitForGameAction
} from './backend-assertions';
import {
  PLAYGROUND_ENABLED_OPTIONS,
  createBrowserBountyHuntingGame,
  createBrowserChessGame,
  createBrowserInvite,
  createBrowserReplayTriviaGame
} from './game-fixtures';
import {
  getGameCard,
  invitePlayer,
  openGamePlayerList,
  openGamePlayerListFromChat,
  openGamesCard
} from './interactions';
import { readButtonTreatment } from './visuals';

export const playgroundLobbyGripDragScenario: BrowserScenario = async ({
  chat,
  context,
  page
}) => {
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot()
  });

  await withExtensionStorageValues(context, 'sync', PLAYGROUND_ENABLED_OPTIONS, async () => {
    const card = await openGamesCard(chat, backend);
    await expect(card.locator('.ytcq-panel-resize-handle')).toHaveCount(0);
    await card.evaluate((panel) => {
      Object.assign((panel as HTMLElement).style, {
        bottom: 'auto',
        left: '20px',
        right: 'auto',
        top: '20px',
        transform: ''
      });
    });

    const grip = card.locator('.ytcq-panel-drag-grip');
    expect(await grip.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
      ) === element;
    })).toBe(true);
    const gripBox = await grip.boundingBox();
    if (!gripBox) throw new Error('Games lobby drag grip is not visible.');
    await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      gripBox.x + gripBox.width / 2 + 30,
      gripBox.y + gripBox.height / 2 + 20
    );
    await page.mouse.up();

    const position = await card.evaluate((panel) => {
      const rect = panel.getBoundingClientRect();
      return { left: rect.left, top: rect.top };
    });
    expect(position.left).toBeCloseTo(50, 0);
    expect(position.top).toBeCloseTo(40, 0);
    await card.locator('.ytcq-profile-card-close').click();
    await expect(card).toHaveCount(0);
  });
};

export const playgroundRestoreStateWithInvitesOffScenario: BrowserScenario = async ({ chat, context }) => {
  const snapshot = createMockPlaygroundSnapshot({
    games: [createBrowserChessGame({ gameId: 'restored-chess-game' })],
    invites: [createBrowserInvite({ inviteId: 'restored-chess-invite' })]
  });
  const backend = await installMockPlaygroundBackend(context, { snapshot });

  await withExtensionStorageValues(context, 'sync', {
    playgroundEnabled: true,
    playgroundGamesAvailable: false
  }, async () => {
    const hello = await backend.waitForClientMessage('hello');
    expect(hello.availableGames).toEqual([]);

    const gamesButton = chat.locator('.ytcq-games-button');
    await expect(gamesButton).toHaveAttribute('aria-label', 'Games: Invites 1');
    await expect(chat.locator('.ytcq-games-card')).toHaveCount(0);

    await backend.sendServerMessage({
      snapshot: {
        ...snapshot,
        invites: []
      },
      type: 'presenceSnapshot'
    });

    await expect(gamesButton).toHaveAttribute('aria-label', 'Games: Active games 1');
    await expect(chat.locator('.ytcq-games-card')).toHaveCount(0);
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

export const playgroundActiveGameControlsScenario: BrowserScenario = async ({
  chat,
  context,
  page
}) => {
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
    await withExtensionStorageValues(context, 'sync', { chatSkin: 'custom:aero' }, async () => {
      await expect(root).toHaveAttribute('data-ytcq-theme-finish', 'glass');
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
    });
    await activeControls.locator('.ytcq-games-cycle-action-previous').click();
    await expect(card.locator('.ytcq-games-active-row')).toContainText('Chess');

    await activeRow.getByRole('button', { name: 'Resume' }).click();
    await expect(chat.locator('.ytcq-chess-game-panel')).toBeVisible();
    await expect(chat.locator('.ytcq-games-card')).toHaveCount(0);

    await chat.locator('.ytcq-games-button').click();
    const resumedCard = chat.locator('.ytcq-games-card');
    await expect(resumedCard).toBeVisible();
    const resumedActiveRow = resumedCard
      .locator('.ytcq-games-active-row')
      .filter({ hasText: 'Chess' });
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

    const leave = await waitForGameAction(
      backend,
      'leave',
      (message) => message.gameId === 'active-chess-game'
    );
    expect(leave).toMatchObject({
      action: 'leave',
      gameId: 'active-chess-game'
    });
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
    await expect.poll(async () => {
      const stored = await getExtensionStorageValues(context, 'sync', ['playgroundGamesAvailable']);
      return stored.playgroundGamesAvailable;
    }).toBe(false);

    await availability.click();
    const enabled = await waitForClientMessage(backend, 'setAvailability', (message) =>
      message.availableGames.length > 0
    );
    expect(enabled.availableGames).toEqual(['chess', 'bounty-hunting', 'stick-around']);
    await expect(availability).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => {
      const stored = await getExtensionStorageValues(context, 'sync', ['playgroundGamesAvailable']);
      return stored.playgroundGamesAvailable;
    }).toBe(true);
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

  await withExtensionStorageValues(
    context,
    'sync',
    { ...PLAYGROUND_ENABLED_OPTIONS, chatSkin: 'custom:aero' },
    async () => {
      const card = await openGamesCard(chat, backend);
      const bountyCard = getGameCard(card, 'The Wild Wild Chat');
      await chat.locator('html').evaluate((element) => {
        element.setAttribute('dark', '');
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
    }
  );
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
