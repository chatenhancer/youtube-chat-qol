/** Browser scenarios for Playground Games. */
import { expect } from '@playwright/test';
import {
  createMockPlaygroundSnapshot,
  installMockPlaygroundBackend
} from '../../support/playground-backend';
import { withExtensionStorageValues } from '../../support/extension-storage';
import {
  appendMockFixtureMessage,
  emitMockFixtureFeedMessage
} from '../../support/mock-page';
import type { BrowserScenario } from '../types';
import {
  expectGameActionCount,
  expectNoGameAction,
  getBountyObservationPayloads,
  waitForGameAction
} from './backend-assertions';
import {
  PLAYGROUND_ENABLED_OPTIONS,
  createBrowserBountyHuntingGame,
  getFixtureMessageTimestampUsec,
} from './game-fixtures';
import {
  appendRequiredMockFixtureMessage,
  dispatchMessageClick,
  inviteBountyHuntingComputer,
  openBountyHuntingPlayerList
} from './interactions';

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
        backgroundColor: 'rgb(91, 53, 40)',
        color: 'rgb(255, 231, 196)',
        iconBackgroundColor: 'rgba(0, 0, 0, 0)',
        iconBorderRadius: '0px',
        progressBackgroundColor: 'rgb(152, 81, 58)'
      },
      lightTheme: {
        backgroundColor: 'rgb(241, 219, 197)',
        borderStyle: 'none',
        color: 'rgb(99, 46, 30)',
        iconBackgroundColor: 'rgba(0, 0, 0, 0)',
        iconBorderRadius: '0px',
        progressBackgroundColor: 'rgb(221, 165, 129)'
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
