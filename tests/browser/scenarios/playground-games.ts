/**
 * Browser scenarios for Playground Games.
 *
 * These checks exercise the real content script, popup card, background
 * Playground bridge, and game panels against a deterministic WebSocket backend.
 */
import { expect, test, type Locator } from '@playwright/test';
import type {
  ClientMessage,
  GameActionClientMessage,
  GameId,
  PublicGame,
  PublicInvite
} from '../../../src/shared/playground/protocol';
import {
  createMockPlaygroundSnapshot,
  installMockPlaygroundBackend
} from '../support/playground-backend';
import { withExtensionStorageValues } from '../support/extension-storage';
import { appendMockFixtureMessage } from '../support/mock-page';
import type { BrowserScenario, ChatSurface } from './types';

const PLAYGROUND_ENABLED_OPTIONS = {
  playgroundEnabled: true,
  playgroundGamesAvailable: true
};

export const playgroundChessInviteAndMoveScenario: BrowserScenario = async ({ chat, context }) => {
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot()
  });

  await withExtensionStorageValues(context, 'sync', PLAYGROUND_ENABLED_OPTIONS, async () => {
    const card = await openGamesCard(chat, backend);
    await expect(card.locator('.ytcq-profile-card-title')).toHaveText('Games');
    await expect(card.locator('.ytcq-profile-card-subtitle')).toHaveText('2 players online');
    await expect(card.locator('.ytcq-games-availability-toggle')).toHaveAttribute('aria-checked', 'true');
    await expect(card.locator('.ytcq-games-game-label')).toHaveText(['Chess', 'The Wild Wild Chat', 'HELP-A-FRIEND! Trivia', 'Stick Around!']);
    await expect(getGameCard(card, 'The Wild Wild Chat')).toHaveAttribute('aria-disabled', 'false');
    await expect(getGameCard(card, 'HELP-A-FRIEND! Trivia')).toHaveAttribute('aria-disabled', 'true');
    await expect(getGameCard(card, 'Stick Around!')).toHaveAttribute('aria-disabled', 'false');

    await openGamePlayerList(card, 'Chess');
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

export const playgroundActiveGameControlsScenario: BrowserScenario = async ({ chat, context }) => {
  const activeGame = createBrowserChessGame({ gameId: 'active-chess-game' });
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot({
      games: [activeGame]
    })
  });

  await withExtensionStorageValues(context, 'sync', PLAYGROUND_ENABLED_OPTIONS, async () => {
    const card = await openGamesCard(chat, backend);
    const activeRow = card.locator('.ytcq-games-active-row').filter({ hasText: 'Chess' });
    await expect(activeRow).toContainText('Luna Chat');

    await activeRow.getByRole('button', { name: 'Resume' }).click();
    await expect(chat.locator('.ytcq-chess-game-panel')).toBeVisible();
    await expect(activeRow.getByRole('button', { name: 'Hide' })).toBeVisible();

    await activeRow.getByRole('button', { name: 'Hide' }).click();
    await expect(chat.locator('.ytcq-chess-game-panel')).toHaveCount(0);

    await activeRow.getByRole('button', { name: 'Resume' }).click();
    await expect(chat.locator('.ytcq-chess-game-panel')).toBeVisible();

    await activeRow.getByRole('button', { name: 'Leave' }).click();
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

export const playgroundAvailabilityToggleScenario: BrowserScenario = async ({ chat, context }) => {
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot()
  });

  await withExtensionStorageValues(context, 'sync', PLAYGROUND_ENABLED_OPTIONS, async () => {
    const card = await openGamesCard(chat, backend);
    const toggle = card.locator('.ytcq-games-availability-toggle');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    await toggle.click();
    const disabled = await waitForClientMessage(backend, 'setAvailability', (message) =>
      message.availableGames.length === 0
    );
    expect(disabled.availableGames).toEqual([]);
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    await toggle.click();
    const enabled = await waitForClientMessage(backend, 'setAvailability', (message) =>
      message.availableGames.length > 0
    );
    expect(enabled.availableGames).toEqual(['chess', 'bounty-hunting', 'stick-around']);
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  });
};

export const playgroundStickAroundComputerOverlayScenario: BrowserScenario = async ({ chat, context, page }) => {
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot()
  });

  await withExtensionStorageValues(context, 'sync', PLAYGROUND_ENABLED_OPTIONS, async () => {
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

    const card = await openGamePlayerListFromChat(chat, backend, 'Stick Around!');
    await invitePlayer(card, 'Computer (Stick Around!)');
    const invite = await backend.waitForClientMessage('invite');
    expect(invite).toMatchObject({
      gameId: 'stick-around',
      toUserId: 'server:computer:stick-around'
    });

    await chat.locator('#item-scroller').evaluate((scroller) => {
      scroller.scrollTop = scroller.scrollHeight;
    });
    await backend.sendServerMessage({
      game: createBrowserStickAroundGame(),
      type: 'gameStarted'
    });

    await expect(chat.locator('.ytcq-games-card')).toHaveCount(0);
    const overlay = chat.locator('yt-live-chat-item-list-renderer > .ytcq-stick-around-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveClass(/ytcq-game-overlay-theme-light/);
    await expect(overlay).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.78)');
    await expect(overlay.locator('.ytcq-game-overlay-header')).toBeVisible();
    await expect(overlay.locator('.ytcq-game-overlay-icon')).toBeVisible();
    await expect(overlay.locator('.ytcq-game-overlay-title')).toHaveText('Stick Around!');
    await expect(overlay.locator('.ytcq-game-overlay-subtitle')).toHaveText('Computer (Stick Around!)');
    await expect(overlay.getByRole('button', { name: 'Ready' })).toBeVisible();
    await expect(overlay.locator('.ytcq-game-overlay-header').getByRole('button', { name: 'Ready' })).toHaveCount(0);
    await expect(overlay.getByRole('button', { name: 'Mute game sounds' })).toBeVisible();
    const hideButton = overlay.getByRole('button', { name: 'Hide' });
    await expect(hideButton).toBeVisible();
    await expect(hideButton).toHaveCSS('color', 'rgb(17, 17, 17)');
    await expect(hideButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(chat.locator('.ytcq-stick-around-canvas')).toBeVisible();
    await expect(chat.locator('#item-scroller > .ytcq-stick-around-overlay')).toHaveCount(0);
    await expect(chat.locator('yt-live-chat-header-renderer .ytcq-stick-around-overlay')).toHaveCount(0);
    await expect(chat.locator('#input-panel .ytcq-stick-around-overlay')).toHaveCount(0);

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

    const player = card.locator('.ytcq-games-player-row').filter({ hasText: 'Luna Chat' });
    await player.getByRole('button', { name: 'Cancel' }).click();
    await expect(player).toContainText('Available now');
    await expect(player.getByRole('button', { name: 'Invite' })).toBeVisible();
    await expectClientMessageCount(backend, 'invite', 1, 500);
    await expectClientMessageCount(backend, 'respondInvite', 0);
  });
};

export const playgroundReplayTriviaInviteScenario: BrowserScenario = async ({ chat, context }) => {
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot()
  });

  await withExtensionStorageValues(context, 'sync', PLAYGROUND_ENABLED_OPTIONS, async () => {
    const card = await openGamesCard(chat, backend);
    await expect(card.locator('.ytcq-games-game-label')).toHaveText(['Chess', 'The Wild Wild Chat', 'HELP-A-FRIEND! Trivia', 'Stick Around!']);
    await expect(getGameCard(card, 'The Wild Wild Chat')).toHaveAttribute('aria-disabled', 'true');
    await expect(getGameCard(card, 'HELP-A-FRIEND! Trivia')).toHaveAttribute('aria-disabled', 'false');
    await expect(getGameCard(card, 'Stick Around!')).toHaveAttribute('aria-disabled', 'true');

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
        choiceIndex: 1
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

    const messageId = await appendMockFixtureMessage(chat, {
      author: '@BountyFan',
      text: 'claim this @Marco'
    });
    if (!messageId) throw new Error('Could not append Bounty Hunting claim message.');
    expect(messageId).toMatch(/^fixture-message-/);

    const message = chat.locator(`yt-live-chat-text-message-renderer[id="${messageId}"]`);
    await expect(message).toBeVisible();
    await message.click();

    const claim = await waitForGameAction(backend, 'claimBounty');
    expect(claim).toMatchObject({
      action: 'claimBounty',
      gameId: 'browser-bounty-game',
      payload: {
        bountyId: 'mention-user',
        messageId,
        messageTimestampUsec: getFixtureMessageTimestampUsec(messageId)
      }
    });

    await backend.sendServerMessage({
      game: createBrowserBountyHuntingGame({
        claimedMessageId: messageId,
        roundStartTimestampUsec: getFixtureMessageTimestampUsec('fixture-message-1')
      }),
      type: 'gameUpdated'
    });
    await expect(chat.locator('.ytcq-bounty-hunting-claimed-feed')).toHaveCount(0);
    await expect(message.locator('.ytcq-bounty-hunting-claim-indicator')).toHaveText('B$125');
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
    await expectNoGameAction(backend, 'claimBounty', 1_200);

    const newMessageId = await appendRequiredMockFixtureMessage(chat, {
      author: '@NewBountyFan',
      text: 'this new message mentions @Marco'
    });
    const newMessage = chat.locator(`yt-live-chat-text-message-renderer[id="${newMessageId}"]`);
    await expect(newMessage).toBeVisible();
    await dispatchMessageClick(newMessage);

    const claim = await waitForGameAction(backend, 'claimBounty', (message) =>
      message.payload?.messageId === newMessageId
    );
    expect(claim).toMatchObject({
      action: 'claimBounty',
      gameId: 'browser-bounty-game',
      payload: {
        bountyId: 'mention-user',
        messageId: newMessageId,
        messageTimestampUsec: getFixtureMessageTimestampUsec(newMessageId)
      }
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

    const messageId = await appendRequiredMockFixtureMessage(chat, {
      author: '@WitnessFan',
      text: 'automatic witness for @Marco'
    });

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
  phaseStartedAt?: number;
  roundStartTimestampUsec?: string;
  status?: 'active' | 'countdown';
}

function createBrowserBountyHuntingGame({
  claimedMessageId,
  gameId = 'browser-bounty-game',
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

function createBrowserStickAroundGame(): PublicGame {
  return {
    finishReports: {},
    gameId: 'browser-stick-around-game',
    gameType: 'stick-around',
    hazards: [],
    inputs: {},
    phaseStartedAt: Date.now(),
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
    readyPlayers: {},
    roundSeed: 12345,
    status: 'ready'
  } as PublicGame;
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
