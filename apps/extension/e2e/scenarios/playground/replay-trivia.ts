/** Browser scenarios for Playground Games. */
import { expect } from '@playwright/test';
import { getExtensionContentScriptContextId } from '../../support/extension';
import {
  createMockPlaygroundSnapshot,
  installMockPlaygroundBackend
} from '../../support/playground-backend';
import { withExtensionStorageValues } from '../../support/extension-storage';
import type { BrowserScenario } from '../types';
import { expectGameActionCount, waitForGameAction } from './backend-assertions';
import {
  PLAYGROUND_ENABLED_OPTIONS,
  createBrowserReplayTriviaGame
} from './game-fixtures';
import {
  dispatchReplayTriviaAnswerKey,
  getGameCard,
  invitePlayer,
  openGamePlayerList,
  openGamePlayerListFromChat,
  openGamesCard
} from './interactions';

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
      await expect(contextBadge).toHaveText('Live only');
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

export const playgroundReplayTriviaAnswerScenario: BrowserScenario = async ({ chat, context, page }) => {
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

    const phaseStartedAt = Date.now();
    await backend.sendServerMessage({
      game: createBrowserReplayTriviaGame(phaseStartedAt),
      type: 'gameStarted'
    });

    const canvas = chat.locator('.ytcq-replay-trivia-canvas');
    await expect(canvas).toBeVisible();
    // Scope the clock to this content script; browser-wide virtual time survives navigation.
    const cdp = await context.newCDPSession(page);
    try {
      const executionContextId = await getExtensionContentScriptContextId(page, cdp);
      const { result } = await cdp.send('Runtime.evaluate', {
        contextId: executionContextId,
        expression: `(() => {
          const original = performance.now;
          performance.now = () => original.call(performance) + 3100;
          return () => { performance.now = original; };
        })()`
      });
      expect(result.objectId, 'The scoped clock must provide its cleanup function.').toBeDefined();
      try {
        await dispatchReplayTriviaAnswerKey(canvas, '2');

        const answer = await waitForGameAction(backend, 'answer');
        expect(answer).toMatchObject({
          action: 'answer',
          gameId: 'browser-replay-trivia-game',
          payload: {
            choiceIndex: 1,
            expectedPhaseStartedAt: phaseStartedAt
          }
        });

        await dispatchReplayTriviaAnswerKey(canvas, '3');
        await expectGameActionCount(backend, 'answer', 1, (message) =>
          message.gameId === 'browser-replay-trivia-game',
          500
        );
      } finally {
        await cdp.send('Runtime.callFunctionOn', {
          objectId: result.objectId,
          functionDeclaration: 'function () { this(); }'
        });
      }
    } finally {
      await cdp.detach();
    }
  });
};
