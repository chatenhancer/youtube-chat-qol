import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { YouTubeChatFeedBatch } from '../../../../youtube/chat-feed/source';
import type {
  YouTubeChatAuthor,
  YouTubeChatFeedAction,
  YouTubeChatMessageRecord
} from '../../../../youtube/chat-feed/protocol';

const assetMock = vi.hoisted(() => ({
  emptyAssets: createEmptyBountyHuntingAssetsForMock(),
  getAssets: vi.fn()
}));

const chatFeedMock = vi.hoisted(() => ({
  onBatch: null as ((batch: YouTubeChatFeedBatch) => void) | null,
  recordsById: new Map<string, YouTubeChatMessageRecord>(),
  subscribe: vi.fn((subscription: { onBatch: (batch: YouTubeChatFeedBatch) => void }) => {
    chatFeedMock.onBatch = subscription.onBatch;
    return chatFeedMock.unsubscribe;
  }),
  unsubscribe: vi.fn()
}));

vi.mock('./assets', () => ({
  BOUNTY_HUNTING_FONT_BARNUM: 'YtcqBountyHuntingBarnum',
  BOUNTY_HUNTING_FONT_BARTLE: 'YtcqBountyHuntingBartle',
  BOUNTY_HUNTING_FONT_TEX_MEX: 'YtcqBountyHuntingTexMex',
  EMPTY_BOUNTY_HUNTING_ASSETS: assetMock.emptyAssets,
  getBountyHuntingAssets: assetMock.getAssets
}));

vi.mock('../../../../youtube/chat-feed/records', () => ({
  getYouTubeChatFeedRecordState: vi.fn(() => ({
    ready: true,
    records: [...chatFeedMock.recordsById.values()]
  }))
}));
vi.mock('../../../../youtube/chat-feed/source', () => ({
  isYouTubeChatFeedPage: vi.fn(() => true),
  subscribeYouTubeChatFeed: chatFeedMock.subscribe
}));

import { handleFeatureMessage } from '../../../../content/dispatcher';
import { initMentionDetection } from '../../../mention-detection';
import { createGamePanelShell } from '../panel-shell';
import {
  closeBountyHuntingGamePanel,
  handleBountyHuntingActionError,
  openBountyHuntingGamePanel as mountBountyHuntingGamePanel,
  resetBountyHuntingGameClientState,
  setBountyHuntingCompactMode,
  updateBountyHuntingGamePanel
} from './panel';
import type { GamePanelControls, SendGameAction } from '../adapter';
import type { BountyHuntingAssets, PublicBountyHuntingGame } from './types';

let shellControllers: AbortController[] = [];
let shellCleanups: Array<() => void> = [];
let frameCallbacks: FrameRequestCallback[] = [];

describe('Bounty Hunting panel', () => {
  let audioElements: FakeAudioElement[];
  let context: ReturnType<typeof createMockCanvasContext>;

  beforeEach(() => {
    document.body.replaceChildren();
    chatFeedMock.onBatch = null;
    chatFeedMock.recordsById.clear();
    chatFeedMock.subscribe.mockClear();
    chatFeedMock.unsubscribe.mockClear();
    initMentionDetection();
    assetMock.getAssets.mockReset();
    assetMock.getAssets.mockResolvedValue(assetMock.emptyAssets);
    frameCallbacks = [];
    shellControllers = [];
    shellCleanups = [];
    audioElements = [];
    context = createMockCanvasContext();
    vi.stubGlobal('Audio', createFakeAudioConstructor(audioElements));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 448,
      height: 448,
      left: 0,
      right: 448,
      top: 0,
      width: 448,
      x: 0,
      y: 0,
      toJSON: () => ({})
    } as DOMRect);
    vi.spyOn(Date, 'now').mockImplementation(() => 100_500);
    vi.spyOn(window.performance, 'now').mockImplementation(() => 100_500);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    closeBountyHuntingGamePanel({ notify: false });
    shellControllers.forEach((controller) => controller.abort());
    shellCleanups.forEach((cleanup) => cleanup());
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shoots a matching message only when the player clicks it', () => {
    const onAction = vi.fn();
    const baseGame = createBountyHuntingGame();
    const game = {
      ...baseGame,
      bounties: [
        ...baseGame.bounties,
        {
          amount: 75,
          description: 'a question',
          id: 'question',
          matcher: { kind: 'question' as const }
        }
      ]
    };
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    const message = appendChatMessage('msg-1', '@Luna', 'look @Marco?');

    handleFeatureMessage(message, { source: 'added' });
    updateBountyHuntingGamePanel(game, 'host-user');

    expect(onAction).toHaveBeenCalledWith('game-bounty-hunting', 'observeBountyMessage', {
      observations: [
        {
          bountyIds: ['mention-user', 'question'],
          messageId: 'msg-1'
        }
      ]
    });
    expect(onAction).not.toHaveBeenCalledWith(
      'game-bounty-hunting',
      'shootBounty',
      expect.anything()
    );

    message.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onAction).toHaveBeenCalledWith(
      'game-bounty-hunting',
      'shootBounty',
      createShotPayload('msg-1', ['mention-user', 'question'])
    );
    const witnessCallIndex = onAction.mock.calls.findIndex(
      ([, action]) => action === 'observeBountyMessage'
    );
    const shotCallIndex = onAction.mock.calls.findIndex(([, action]) => action === 'shootBounty');
    expect(witnessCallIndex).toBeGreaterThanOrEqual(0);
    expect(shotCallIndex).toBeGreaterThan(witnessCallIndex);
    expect(onAction.mock.calls[shotCallIndex]?.[2]).not.toHaveProperty('bountyId');
    expect(
      (onAction.mock.calls[shotCallIndex]?.[2] as { observations?: unknown[] })?.observations?.[0]
    ).not.toHaveProperty('messageTimestampUsec');
  });

  it('keeps an acknowledged shot pending until the authoritative result arrives', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_500);
    const onAction = vi.fn();
    const game = createBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    const firstMessage = appendChatMessage('msg-first-shot', '@Luna', 'look @Marco');
    const secondMessage = appendChatMessage('msg-second-shot', '@Luna', 'hello chat');
    const nativeMessageClick = vi.fn();
    secondMessage.addEventListener('click', nativeMessageClick);

    firstMessage.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 40,
        clientY: 50
      })
    );
    const pendingClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 90,
      clientY: 100
    });
    secondMessage.dispatchEvent(pendingClick);

    expect(pendingClick.defaultPrevented).toBe(true);
    expect(nativeMessageClick).not.toHaveBeenCalled();
    expect(onAction.mock.calls.filter(([, action]) => action === 'shootBounty')).toEqual([
      ['game-bounty-hunting', 'shootBounty', createShotPayload('msg-first-shot', ['mention-user'])]
    ]);

    const pendingGame = {
      ...game,
      pendingClaimMessageId: 'msg-first-shot'
    };
    updateBountyHuntingGamePanel(pendingGame, 'host-user');

    const pendingIndicator = firstMessage.querySelector<HTMLElement>(
      '.ytcq-bounty-hunting-claim-indicator'
    );
    expect(
      pendingIndicator?.querySelector('.ytcq-bounty-hunting-claim-indicator-amount')?.textContent
    ).toBe('…');
    expect(pendingIndicator?.title).toBe('Waiting for reply...');

    await vi.advanceTimersByTimeAsync(10_000);
    updateBountyHuntingGamePanel(
      {
        ...pendingGame,
        scores: { ...pendingGame.scores }
      },
      'host-user'
    );

    const stillPendingClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 90,
      clientY: 100
    });
    secondMessage.dispatchEvent(stillPendingClick);
    expect(stillPendingClick.defaultPrevented).toBe(true);
    expect(nativeMessageClick).not.toHaveBeenCalled();
    expect(onAction.mock.calls.filter(([, action]) => action === 'shootBounty')).toEqual([
      ['game-bounty-hunting', 'shootBounty', createShotPayload('msg-first-shot', ['mention-user'])]
    ]);

    updateBountyHuntingGamePanel(
      {
        ...game,
        bounties: game.bounties.map((bounty) => ({
          ...bounty,
          claim: {
            bountyId: bounty.id,
            claimedAt: Date.now(),
            messageId: 'msg-first-shot',
            role: 'host' as const,
            userId: 'host-user'
          }
        })),
        scores: { guest: 0, host: 125 }
      },
      'host-user'
    );

    secondMessage.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onAction).toHaveBeenCalledWith(
      'game-bounty-hunting',
      'shootBounty',
      createShotPayload('msg-second-shot')
    );
  });

  it('keeps a queued shot pending while waiting for the server', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_500);
    const onAction = vi.fn();
    const game = createBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    const firstMessage = appendChatMessage('msg-unacknowledged-shot', '@Luna', 'look @Marco');
    const retryMessage = appendChatMessage('msg-retry-shot', '@Luna', 'hello chat');
    const nativeMessageClick = vi.fn();
    retryMessage.addEventListener('click', nativeMessageClick);

    firstMessage.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(10_000);
    const retryClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    retryMessage.dispatchEvent(retryClick);

    expect(retryClick.defaultPrevented).toBe(true);
    expect(nativeMessageClick).not.toHaveBeenCalled();
    expect(onAction.mock.calls.filter(([, action]) => action === 'shootBounty')).toEqual([
      [
        'game-bounty-hunting',
        'shootBounty',
        createShotPayload('msg-unacknowledged-shot', ['mention-user'])
      ]
    ]);
    expect(
      firstMessage.querySelector('.ytcq-bounty-hunting-claim-indicator-amount')?.textContent
    ).toBe('…');

    updateBountyHuntingGamePanel({ ...game, status: 'roundOver' }, 'host-user');
    expect(firstMessage.querySelector('.ytcq-bounty-hunting-claim-indicator')).toBeNull();
  });

  it('releases a rejected shot, preserves its witness, and lets the player try again', async () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    const game = createBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    const firstMessage = appendChatMessage('msg-rejected-shot', '@Luna', 'look @Marco');
    const secondMessage = appendChatMessage('msg-after-rejection', '@Luna', 'hello chat');

    firstMessage.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(handleBountyHuntingActionError({
      code: 'rate_limited',
      message: 'Slow down.',
      request: {
        action: 'shootBounty',
        gameId: game.gameId,
        payload: { messageId: 'msg-rejected-shot' },
        type: 'gameAction'
      }
    })).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    secondMessage.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onAction).toHaveBeenCalledWith(
      game.gameId,
      'observeBountyMessage',
      {
        observations: [{
          bountyIds: ['mention-user'],
          messageId: 'msg-rejected-shot'
        }]
      }
    );
    expect(onAction.mock.calls.filter(([, action]) => action === 'shootBounty')).toEqual([
      [game.gameId, 'shootBounty', createShotPayload('msg-rejected-shot', ['mention-user'])],
      [game.gameId, 'shootBounty', createShotPayload('msg-after-rejection')]
    ]);
  });

  it('does not release a newer shot when an older shot error arrives late', () => {
    const onAction = vi.fn();
    const game = createBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    const firstMessage = appendChatMessage('msg-older-shot', '@Luna', 'look @Marco');
    const currentMessage = appendChatMessage('msg-current-shot', '@Luna', 'hello chat');
    const blockedMessage = appendChatMessage('msg-blocked-shot', '@Nova', 'still here');

    firstMessage.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    updateBountyHuntingGamePanel(
      {
        ...game,
        bounties: game.bounties.map((bounty) => ({
          ...bounty,
          claim: {
            bountyId: bounty.id,
            claimedAt: Date.now(),
            messageId: 'msg-older-shot',
            role: 'guest' as const,
            userId: 'guest-user'
          }
        }))
      },
      'host-user'
    );
    currentMessage.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(handleBountyHuntingActionError({
      code: 'rate_limited',
      message: 'Slow down.',
      request: {
        action: 'shootBounty',
        gameId: game.gameId,
        payload: { messageId: 'msg-older-shot' },
        type: 'gameAction'
      }
    })).toBe(false);

    blockedMessage.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onAction.mock.calls.filter(([, action]) => action === 'shootBounty')).toEqual([
      [game.gameId, 'shootBounty', createShotPayload('msg-older-shot', ['mention-user'])],
      [game.gameId, 'shootBounty', createShotPayload('msg-current-shot')]
    ]);
    expect(
      currentMessage.querySelector('.ytcq-bounty-hunting-claim-indicator-amount')?.textContent
    ).toBe('…');
  });

  it('does not retry a rejected shot witness after a permanent validation error', async () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    const game = createBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    const message = appendChatMessage('msg-invalid-shot', '@Luna', 'look @Marco');

    message.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(handleBountyHuntingActionError({
      code: 'invalid_bounty',
      message: 'Invalid observation.',
      request: {
        action: 'shootBounty',
        gameId: game.gameId,
        payload: { messageId: 'msg-invalid-shot' },
        type: 'gameAction'
      }
    })).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(onAction.mock.calls.filter(([, action]) => action === 'observeBountyMessage')).toEqual([]);
  });

  it('resends visible witnesses after the Playground client reconnects', () => {
    const onAction = vi.fn();
    const game = createBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    const message = appendChatMessage('msg-reconnect-witness', '@Luna', 'look @Marco');
    handleFeatureMessage(message, { source: 'added' });
    updateBountyHuntingGamePanel(game, 'host-user');
    onAction.mockClear();

    resetBountyHuntingGameClientState();
    updateBountyHuntingGamePanel(game, 'host-user');

    expect(onAction).toHaveBeenCalledWith(
      game.gameId,
      'observeBountyMessage',
      {
        observations: [{
          bountyIds: ['mention-user'],
          messageId: 'msg-reconnect-witness'
        }]
      }
    );
  });

  it('retries the exact witness batch after a transient observation error', async () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    const game = createBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    appendChatMessage('msg-retry-witness', '@Luna', 'look @Marco');
    await vi.advanceTimersByTimeAsync(500);
    const observationCalls = onAction.mock.calls.filter(([, action]) =>
      action === 'observeBountyMessage'
    );
    expect(observationCalls).toHaveLength(1);
    const failedPayload = observationCalls[0]?.[2] as Record<string, unknown>;

    expect(handleBountyHuntingActionError({
      code: 'rate_limited',
      message: 'Slow down.',
      request: {
        action: 'observeBountyMessage',
        gameId: game.gameId,
        payload: failedPayload,
        type: 'gameAction'
      }
    })).toBe(true);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(onAction.mock.calls.filter(([, action]) => action === 'observeBountyMessage')).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    const retriedCalls = onAction.mock.calls.filter(([, action]) =>
      action === 'observeBountyMessage'
    );
    expect(retriedCalls).toHaveLength(2);
    expect(retriedCalls[1]?.[2]).toEqual(failedPayload);
  });

  it('sends newly queued witnesses while a failed batch waits for retry', async () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    const game = createBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    appendChatMessage('msg-failed-witness', '@Luna', 'look @Marco');
    await vi.advanceTimersByTimeAsync(500);
    const firstObservationCall = onAction.mock.calls.find(([, action]) =>
      action === 'observeBountyMessage'
    );
    const failedPayload = firstObservationCall?.[2] as Record<string, unknown>;

    expect(handleBountyHuntingActionError({
      code: 'rate_limited',
      message: 'Slow down.',
      request: {
        action: 'observeBountyMessage',
        gameId: game.gameId,
        payload: failedPayload,
        type: 'gameAction'
      }
    })).toBe(true);
    const queuedMessage = appendChatMessage('msg-queued-witness', '@Nova', 'hello @Marco');
    queuedMessage.remove();

    await vi.advanceTimersByTimeAsync(500);
    let observationCalls = onAction.mock.calls.filter(([, action]) =>
      action === 'observeBountyMessage'
    );
    expect(observationCalls).toHaveLength(2);
    expect(observationCalls[1]?.[2]).toEqual({
      observations: [expect.objectContaining({ messageId: 'msg-queued-witness' })]
    });

    await vi.advanceTimersByTimeAsync(4_500);
    observationCalls = onAction.mock.calls.filter(([, action]) =>
      action === 'observeBountyMessage'
    );
    expect(observationCalls).toHaveLength(3);
    expect(observationCalls[2]?.[2]).toEqual(failedPayload);
  });

  it('consumes a permanent observation error without retrying it', async () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    const game = createBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    appendChatMessage('msg-permanent-witness', '@Luna', 'look @Marco');
    await vi.advanceTimersByTimeAsync(500);

    expect(handleBountyHuntingActionError({
      code: 'game_not_found',
      message: 'Game not found.',
      request: {
        action: 'observeBountyMessage',
        gameId: game.gameId,
        type: 'gameAction'
      }
    })).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(onAction.mock.calls.filter(([, action]) => action === 'observeBountyMessage')).toHaveLength(1);
  });

  it('releases the pending-shot gate when the opponent wins the clicked message', () => {
    const onAction = vi.fn();
    const baseGame = createBountyHuntingGame();
    const game = {
      ...baseGame,
      bounties: [
        ...baseGame.bounties,
        {
          amount: 75,
          description: 'a question',
          id: 'question',
          matcher: { kind: 'question' as const }
        }
      ]
    };
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    const racedMessage = appendChatMessage('msg-race-lost', '@Luna', 'look @Marco');
    const nextMessage = appendChatMessage('msg-after-race', '@Luna', 'hello chat');

    racedMessage.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    updateBountyHuntingGamePanel(
      {
        ...game,
        bounties: game.bounties.map((bounty) =>
          bounty.id === 'mention-user'
            ? {
                ...bounty,
                claim: {
                  bountyId: bounty.id,
                  claimedAt: Date.now(),
                  messageId: 'msg-race-lost',
                  role: 'guest' as const,
                  userId: 'guest-user'
                }
              }
            : bounty
        ),
        scores: { guest: 125, host: 0 }
      },
      'host-user'
    );
    nextMessage.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onAction).toHaveBeenCalledWith(
      'game-bounty-hunting',
      'shootBounty',
      createShotPayload('msg-after-race')
    );
  });

  it('restores an authoritative pending shot and clears its indicator at round over', () => {
    const onAction = vi.fn();
    const game = {
      ...createBountyHuntingGame(),
      pendingClaimMessageId: 'msg-restored-pending'
    };
    const pendingMessage = appendChatMessage('msg-restored-pending', '@Luna', 'look @Marco');
    const nextMessage = appendChatMessage('msg-after-restored-pending', '@Luna', 'hello chat');
    const nativeMessageClick = vi.fn();
    nextMessage.addEventListener('click', nativeMessageClick);

    openBountyHuntingGamePanel(game, 'host-user', onAction);

    const pendingIndicator = pendingMessage.querySelector<HTMLElement>(
      '.ytcq-bounty-hunting-claim-indicator'
    );
    expect(
      pendingIndicator?.querySelector('.ytcq-bounty-hunting-claim-indicator-amount')?.textContent
    ).toBe('…');
    expect(pendingIndicator?.getAttribute('aria-label')).toBe('Waiting for reply...');
    expect(pendingIndicator?.title).toBe('Waiting for reply...');
    expect(pendingIndicator?.getAttribute('role')).toBe('status');

    const blockedClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 90,
      clientY: 100
    });
    nextMessage.dispatchEvent(blockedClick);

    expect(blockedClick.defaultPrevented).toBe(true);
    expect(nativeMessageClick).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalledWith(
      'game-bounty-hunting',
      'shootBounty',
      expect.anything()
    );

    updateBountyHuntingGamePanel(
      {
        ...game,
        pendingClaimMessageId: undefined,
        roundEndsAt: undefined,
        status: 'roundOver'
      },
      'host-user'
    );

    expect(pendingMessage.querySelector('.ytcq-bounty-hunting-claim-indicator')).toBeNull();
  });

  it('shows server-confirmed miss feedback and blocks shots for its cooldown', async () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    const game = createBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    const missedMessage = appendChatMessage('msg-miss', '@Luna', 'hello chat');
    const validMessage = appendChatMessage('msg-valid', '@Luna', 'look @Marco');
    const missedBody = missedMessage.querySelector('[id="message"]')!;
    const validBody = validMessage.querySelector('[id="message"]')!;
    const nativeMessageClick = vi.fn();
    missedMessage.addEventListener('click', nativeMessageClick);

    const authorClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 30
    });
    missedMessage.querySelector('#author-name')?.dispatchEvent(authorClick);
    const feedback = document.querySelector<HTMLElement>('.ytcq-bounty-hunting-miss-feedback')!;
    expect(feedback.hidden).toBe(true);
    expect(authorClick.defaultPrevented).toBe(false);
    expect(nativeMessageClick).toHaveBeenCalledOnce();
    nativeMessageClick.mockClear();
    validMessage.addEventListener('click', nativeMessageClick);

    const missedShot = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 40,
      clientY: 50
    });
    missedBody.dispatchEvent(missedShot);

    expect(feedback.hidden).toBe(true);
    expect(missedShot.defaultPrevented).toBe(true);
    expect(onAction).toHaveBeenCalledWith(
      'game-bounty-hunting',
      'shootBounty',
      createShotPayload('msg-miss')
    );
    expect(
      audioElements
        .filter((audio) => audio.src.includes('games/bounty-hunting/miss.mp3'))
        .reduce((plays, audio) => plays + audio.play.mock.calls.length, 0)
    ).toBe(0);

    updateBountyHuntingGamePanel(
      {
        ...game,
        missCooldownUntil: 105_500
      },
      'host-user'
    );

    expect(feedback.hidden).toBe(false);
    expect(feedback.textContent).toBe('MISS! Reloading...');
    expect(feedback.querySelector('.ytcq-bounty-hunting-miss-countdown')).toBeNull();
    expect(feedback.style.left).toBe('52px');
    expect(feedback.style.top).toBe('50px');
    expect(feedback.querySelector('.ytcq-bounty-hunting-miss-icon')).not.toBeNull();
    expect(getPlayedAudio(audioElements)?.src).toContain('games/bounty-hunting/miss.mp3');

    const blockedShot = new MouseEvent('click', { bubbles: true, cancelable: true });
    validBody.dispatchEvent(blockedShot);
    expect(onAction).not.toHaveBeenCalledWith(
      'game-bounty-hunting',
      'shootBounty',
      expect.objectContaining({ messageId: 'msg-valid' })
    );
    expect(audioElements.reduce((plays, audio) => plays + audio.play.mock.calls.length, 0)).toBe(1);
    expect(nativeMessageClick).not.toHaveBeenCalled();
    expect(blockedShot.defaultPrevented).toBe(true);

    document.documentElement.dispatchEvent(new MouseEvent('mouseleave'));
    expect(feedback.hidden).toBe(true);
    document.documentElement.dispatchEvent(
      new MouseEvent('mouseenter', { clientX: 70, clientY: 80 })
    );
    expect(feedback.hidden).toBe(false);
    expect(feedback.style.left).toBe('82px');
    expect(feedback.style.top).toBe('80px');

    await vi.advanceTimersByTimeAsync(5_000);
    expect(feedback.hidden).toBe(true);

    const validShot = new MouseEvent('click', { bubbles: true, cancelable: true });
    validBody.dispatchEvent(validShot);
    expect(validShot.defaultPrevented).toBe(true);
    expect(onAction).toHaveBeenCalledWith(
      'game-bounty-hunting',
      'shootBounty',
      createShotPayload('msg-valid', ['mention-user'])
    );
    expect(nativeMessageClick).not.toHaveBeenCalled();
  });

  it('keeps an asynchronously confirmed miss hidden after the pointer leaves', () => {
    const onAction = vi.fn();
    const game = createBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    const missedMessage = appendChatMessage('msg-left-before-miss', '@Luna', 'hello chat');
    const feedback = document.querySelector<HTMLElement>('.ytcq-bounty-hunting-miss-feedback')!;

    missedMessage.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 40,
        clientY: 50
      })
    );
    document.documentElement.dispatchEvent(new MouseEvent('mouseleave'));
    updateBountyHuntingGamePanel({ ...game, missCooldownUntil: 105_500 }, 'host-user');

    expect(feedback.hidden).toBe(true);
    expect(feedback.querySelector('.ytcq-bounty-hunting-miss-countdown')).toBeNull();

    document.documentElement.dispatchEvent(
      new MouseEvent('mouseenter', { clientX: 70, clientY: 80 })
    );
    expect(feedback.hidden).toBe(false);
    expect(feedback.style.left).toBe('82px');
    expect(feedback.style.top).toBe('80px');
  });

  it('keeps miss feedback silent while game sounds are muted', () => {
    const game = createBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', vi.fn());
    document.querySelector<HTMLButtonElement>('.ytcq-bounty-hunting-game-sound-toggle')!.click();
    const missedMessage = appendChatMessage('msg-muted-miss', '@Luna', 'hello chat');

    missedMessage.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    updateBountyHuntingGamePanel({ ...game, missCooldownUntil: 105_500 }, 'host-user');

    expect(document.querySelector<HTMLElement>('.ytcq-bounty-hunting-miss-feedback')?.hidden).toBe(
      false
    );
    expect(
      audioElements
        .filter((audio) => audio.src.includes('games/bounty-hunting/miss.mp3'))
        .reduce((plays, audio) => plays + audio.play.mock.calls.length, 0)
    ).toBe(0);
  });

  it('restores an active backend cooldown and blocks claims until its exact deadline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_500);
    const onAction = vi.fn();
    const game = {
      ...createBountyHuntingGame(),
      missCooldownUntil: 105_500
    };
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    const message = appendChatMessage('msg-server-cooldown', '@Luna', 'look @Marco');
    const feedback = document.querySelector<HTMLElement>('.ytcq-bounty-hunting-miss-feedback')!;

    expect(feedback.hidden).toBe(true);
    const restoredCooldownClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 24,
      clientY: 30
    });
    message.dispatchEvent(restoredCooldownClick);
    expect(onAction).not.toHaveBeenCalledWith(
      'game-bounty-hunting',
      'shootBounty',
      expect.anything()
    );
    expect(restoredCooldownClick.defaultPrevented).toBe(true);
    expect(feedback.hidden).toBe(false);
    expect(feedback.style.left).toBe('36px');
    expect(feedback.style.top).toBe('30px');
    expect(feedback.querySelector('.ytcq-bounty-hunting-miss-countdown')).toBeNull();
    expect(
      audioElements
        .filter((audio) => audio.src.includes('games/bounty-hunting/miss.mp3'))
        .reduce((plays, audio) => plays + audio.play.mock.calls.length, 0)
    ).toBe(0);

    await vi.advanceTimersByTimeAsync(4_999);
    message.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onAction).not.toHaveBeenCalledWith(
      'game-bounty-hunting',
      'shootBounty',
      expect.anything()
    );

    await vi.advanceTimersByTimeAsync(1);
    message.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onAction).toHaveBeenCalledWith(
      'game-bounty-hunting',
      'shootBounty',
      createShotPayload('msg-server-cooldown', ['mention-user'])
    );
  });

  it('shows one miss when the backend converts a stale claim race into a cooldown', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_500);
    const onAction = vi.fn();
    const game = createBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    const message = appendChatMessage('msg-stale-claim', '@Luna', 'look @Marco');
    const feedback = document.querySelector<HTMLElement>('.ytcq-bounty-hunting-miss-feedback')!;

    message.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 40,
        clientY: 50
      })
    );
    expect(feedback.hidden).toBe(true);
    expect(onAction).toHaveBeenCalledWith(
      'game-bounty-hunting',
      'shootBounty',
      createShotPayload('msg-stale-claim', ['mention-user'])
    );

    const serverGame = {
      ...game,
      missCooldownUntil: 105_500
    };
    updateBountyHuntingGamePanel(serverGame, 'host-user');

    expect(feedback.hidden).toBe(false);
    expect(feedback.style.left).toBe('52px');
    expect(feedback.style.top).toBe('50px');
    expect(feedback.querySelector('.ytcq-bounty-hunting-miss-countdown')).toBeNull();
    expect(
      audioElements
        .filter((audio) => audio.src.includes('games/bounty-hunting/miss.mp3'))
        .reduce((plays, audio) => plays + audio.play.mock.calls.length, 0)
    ).toBe(1);

    updateBountyHuntingGamePanel(serverGame, 'host-user');
    expect(
      audioElements
        .filter((audio) => audio.src.includes('games/bounty-hunting/miss.mp3'))
        .reduce((plays, audio) => plays + audio.play.mock.calls.length, 0)
    ).toBe(1);
  });

  it('waits for the backend to mark a new message matching only a claimed bounty as a miss', () => {
    const onAction = vi.fn();
    const game = {
      ...createBountyHuntingGame(),
      bounties: [
        createClaimedBounty('mention-user', 'guest'),
        {
          amount: 75,
          description: 'a question',
          id: 'question',
          matcher: { kind: 'question' as const }
        }
      ]
    };
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    const message = appendChatMessage('msg-race', '@Luna', 'look @Marco');

    message.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(document.querySelector<HTMLElement>('.ytcq-bounty-hunting-miss-feedback')?.hidden).toBe(
      true
    );
    expect(onAction).toHaveBeenCalledWith(
      'game-bounty-hunting',
      'shootBounty',
      createShotPayload('msg-race')
    );
    expect(onAction).not.toHaveBeenCalledWith(
      'game-bounty-hunting',
      'observeBountyMessage',
      expect.anything()
    );

    updateBountyHuntingGamePanel({ ...game, missCooldownUntil: 105_500 }, 'host-user');

    expect(document.querySelector<HTMLElement>('.ytcq-bounty-hunting-miss-feedback')?.hidden).toBe(
      false
    );
    expect(document.querySelector('.ytcq-bounty-hunting-miss-countdown')).toBeNull();
  });

  it('does not reload or claim again when the winning message matches another open bounty', () => {
    const onAction = vi.fn();
    const game = {
      ...createBountyHuntingGame(),
      bounties: [
        createClaimedBounty('mention-user', 'guest'),
        {
          amount: 75,
          description: 'a question',
          id: 'question',
          matcher: { kind: 'question' as const }
        }
      ]
    };
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    const message = appendChatMessage('message-mention-user', '@Luna', 'look @Marco?');

    message.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(document.querySelector<HTMLElement>('.ytcq-bounty-hunting-miss-feedback')?.hidden).toBe(
      true
    );
    expect(onAction.mock.calls.filter(([, action]) => action === 'shootBounty')).toEqual([]);
  });

  it('witnesses feed messages that have no rendered DOM row', () => {
    const onAction = vi.fn();
    const game = createBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', onAction);

    rememberTestChatFeedRecord({
      author: {
        badges: [],
        channelId: 'background-channel',
        name: '@BackgroundViewer'
      },
      id: 'background-message',
      kind: 'text',
      plainText: 'background @Marco',
      runs: [{ text: 'background @Marco', type: 'text' }]
    });
    updateBountyHuntingGamePanel(game, 'host-user');

    expect(document.querySelector('[data-message-id="background-message"]')).toBeNull();
    expect(onAction).toHaveBeenCalledWith('game-bounty-hunting', 'observeBountyMessage', {
      observations: [
        {
          bountyIds: ['mention-user'],
          messageId: 'background-message'
        }
      ]
    });
  });

  it('witnesses and shoots existing DOM messages', () => {
    const onAction = vi.fn();
    const message = appendChatMessage('msg-old', '@Luna', 'look @Marco');
    const game = createBountyHuntingGame();

    openBountyHuntingGamePanel(game, 'host-user', onAction);
    const chatItems = [...getChatItemsContainer().children];
    expect(chatItems).toContain(message);
    handleFeatureMessage(message, { source: 'added' });
    updateBountyHuntingGamePanel(game, 'host-user');
    message.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onAction).toHaveBeenCalledWith('game-bounty-hunting', 'observeBountyMessage', {
      observations: [
        {
          bountyIds: ['mention-user'],
          messageId: 'msg-old'
        }
      ]
    });
    expect(onAction).toHaveBeenCalledWith(
      'game-bounty-hunting',
      'shootBounty',
      createShotPayload('msg-old', ['mention-user'])
    );

    closeBountyHuntingGamePanel({ notify: false });
  });

  it('witnesses and shoots older and newer chat messages', () => {
    const onAction = vi.fn();
    const oldMessage = appendChatMessage('msg-old', '@Luna', 'old @Marco');
    const newMessage = appendChatMessage('msg-new', '@Luna', 'new @Marco');
    const game = createBountyHuntingGame();

    openBountyHuntingGamePanel(game, 'host-user', onAction);

    handleFeatureMessage(oldMessage, { source: 'added' });
    handleFeatureMessage(newMessage, { source: 'added' });
    updateBountyHuntingGamePanel(game, 'host-user');
    oldMessage.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    newMessage.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onAction).toHaveBeenCalledWith('game-bounty-hunting', 'observeBountyMessage', {
      observations: [
        {
          bountyIds: ['mention-user'],
          messageId: 'msg-old'
        },
        {
          bountyIds: ['mention-user'],
          messageId: 'msg-new'
        }
      ]
    });
    expect(onAction).toHaveBeenCalledWith(
      'game-bounty-hunting',
      'shootBounty',
      createShotPayload('msg-old', ['mention-user'])
    );
  });

  it('does not shoot active-round messages before timestamp data arrives', () => {
    const onAction = vi.fn();
    openBountyHuntingGamePanel(
      {
        ...createBountyHuntingGame(),
        phaseStartedAt: 103_000,
        roundStartTimestampUsec: '103000000'
      },
      'host-user',
      onAction
    );
    const message = appendChatMessage('msg-new', '@Luna', 'look @Marco');

    message.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onAction).not.toHaveBeenCalledWith(
      'game-bounty-hunting',
      'shootBounty',
      expect.objectContaining({ messageId: 'msg-new' })
    );
  });

  it('sends witnesses for messages after the timestamp start divider', async () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    const oldMessage = appendChatMessage('msg-old', '@Luna', 'old @Marco');

    openBountyHuntingGamePanel(
      {
        ...createBountyHuntingGame(),
        phaseStartedAt: 102_000,
        roundStartTimestampUsec: '103000000'
      },
      'host-user',
      onAction
    );
    await sendYouTubeMessageTimestamp(oldMessage, '102999999');
    runLatestBountyHuntingFrame(103_000);
    const divider = getBountyHuntingStartDivider();
    expect(getChatItemsContainer().contains(oldMessage)).toBe(true);
    expect([...getChatItemsContainer().children]).not.toContain(divider);
    expect(divider.parentElement).toBe(oldMessage);

    const newMessage = appendChatMessage('msg-new', '@Luna', 'new @Marco');
    await sendYouTubeMessageTimestamp(newMessage, '103000001');
    handleFeatureMessage(newMessage, { source: 'added' });
    runLatestBountyHuntingFrame(103_100);
    await vi.advanceTimersByTimeAsync(500);

    expect(onAction).toHaveBeenCalledWith('game-bounty-hunting', 'observeBountyMessage', {
      observations: [
        {
          bountyIds: ['mention-user'],
          messageId: 'msg-new',
          messageTimestampUsec: '103000001'
        }
      ]
    });
    expect(getChatItemsContainer().contains(newMessage)).toBe(true);
    expect([...getChatItemsContainer().children]).not.toContain(divider);
    expect(divider.parentElement).toBe(newMessage);
  });

  it('uses YouTube timestamp data to reject pre-start messages and send post-start timestamps', async () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    const oldMessage = appendChatMessage('msg-old', '@Luna', 'old @Marco');
    const newMessage = appendChatMessage('msg-new', '@Luna', 'new @Marco');

    openBountyHuntingGamePanel(
      {
        ...createBountyHuntingGame(),
        phaseStartedAt: 103_000,
        roundStartTimestampUsec: '103000000',
        status: 'active'
      },
      'host-user',
      onAction
    );

    await sendYouTubeMessageTimestamp(oldMessage, '102999999');
    await sendYouTubeMessageTimestamp(newMessage, '103000001');
    handleFeatureMessage(oldMessage, { source: 'added' });
    handleFeatureMessage(newMessage, { source: 'added' });
    oldMessage.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    newMessage.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(500);

    expect(onAction).not.toHaveBeenCalledWith(
      'game-bounty-hunting',
      'shootBounty',
      expect.objectContaining({ messageId: 'msg-old' })
    );
    expect(onAction).toHaveBeenCalledWith(
      'game-bounty-hunting',
      'shootBounty',
      createShotPayload('msg-new', ['mention-user'], '103000001')
    );
    expect(onAction.mock.calls.filter(([, action]) => action === 'observeBountyMessage')).toEqual([]);
  });

  it('adds late YouTube timestamp data to a pending witness before flushing', async () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    const message = appendChatMessage('msg-new', '@Luna', 'new @Marco');

    openBountyHuntingGamePanel(
      {
        ...createBountyHuntingGame(),
        phaseStartedAt: 103_000,
        roundStartTimestampUsec: '103000000',
        status: 'active'
      },
      'host-user',
      onAction
    );

    handleFeatureMessage(message, { source: 'added' });
    await sendYouTubeMessageTimestamp(message, '103000001');
    await vi.advanceTimersByTimeAsync(500);

    expect(onAction).toHaveBeenCalledWith('game-bounty-hunting', 'observeBountyMessage', {
      observations: [
        {
          bountyIds: ['mention-user'],
          messageId: 'msg-new',
          messageTimestampUsec: '103000001'
        }
      ]
    });
  });

  it('does not attach feed timestamps to a DOM row YouTube has recycled', () => {
    const message = appendChatMessage('original-row', '@Luna', 'old @Marco');
    openBountyHuntingGamePanel(
      {
        ...createBountyHuntingGame(),
        phaseStartedAt: 103_000,
        roundStartTimestampUsec: '103000000',
        status: 'active'
      },
      'host-user',
      vi.fn()
    );

    handleFeatureMessage(message, { source: 'added' });
    message.setAttribute('data-message-id', 'reused-row');
    const originalRecord = chatFeedMock.recordsById.get('original-row');
    if (!originalRecord) throw new Error('Missing original test feed record.');
    rememberTestChatFeedRecord({ ...originalRecord, timestampUsec: '103000001' });
    [...frameCallbacks].forEach((callback) => callback(103_100));

    expect(document.querySelector('.ytcq-bounty-hunting-start-divider')).toBeNull();
  });

  it('marks claimed chat messages inline without a bottom feed', () => {
    const onAction = vi.fn();
    const baseGame = createBountyHuntingGame();
    const game: PublicBountyHuntingGame = {
      ...baseGame,
      bounties: [
        ...baseGame.bounties,
        {
          amount: 75,
          description: 'a message that asks a question',
          id: 'question',
          matcher: { kind: 'question' }
        }
      ],
      players: {
        ...baseGame.players,
        guest: {
          displayName: 'Computer (Bounty Hunter)',
          userId: 'server:computer:bounty-hunting'
        }
      }
    };
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    const message = appendChatMessage('msg-1', '@Luna', 'look @Marco');
    const secondMessage = appendChatMessage('msg-2', '@Marco', 'anyone there?');
    const claimedGame: PublicBountyHuntingGame = {
      ...game,
      bounties: [
        {
          ...game.bounties[0],
          claim: {
            bountyId: 'mention-user',
            claimedAt: 100_600,
            messageId: 'msg-1',
            role: 'guest',
            userId: 'server:computer:bounty-hunting'
          }
        },
        {
          ...game.bounties[1],
          claim: {
            bountyId: 'question',
            claimedAt: 100_650,
            messageId: 'msg-2',
            role: 'guest',
            userId: 'server:computer:bounty-hunting'
          }
        }
      ],
      scores: {
        ...game.scores,
        guest: 200
      }
    };

    updateBountyHuntingGamePanel(claimedGame, 'host-user');

    expect(document.querySelector('.ytcq-bounty-hunting-claimed-feed')).toBeNull();
    const indicators = [
      ...document.querySelectorAll<HTMLElement>('.ytcq-bounty-hunting-claim-indicator')
    ];
    expect(indicators).toHaveLength(2);
    expect(message.querySelector('.ytcq-bounty-hunting-claim-indicator')?.textContent).toBe(
      'B$125'
    );
    expect(secondMessage.querySelector('.ytcq-bounty-hunting-claim-indicator')?.textContent).toBe(
      'B$75'
    );
    expect(indicators[0].getAttribute('aria-label')).toBe(
      'CLAIMED · Computer (Bounty Hunter) · Bounty: mention · Amount: $125'
    );
    expect(indicators[0].getAttribute('role')).toBe('status');

    indicators[0].remove();
    handleFeatureMessage(message, { source: 'changed' });

    expect(message.querySelector('.ytcq-bounty-hunting-claim-indicator')?.textContent).toBe(
      'B$125'
    );

    message.setAttribute('data-message-id', 'reused-row');
    handleFeatureMessage(message, { source: 'changed' });

    expect(message.querySelector('.ytcq-bounty-hunting-claim-indicator')).toBeNull();

    closeBountyHuntingGamePanel({ notify: false });

    expect(document.querySelector('.ytcq-bounty-hunting-claim-indicator')).toBeNull();
  });

  it('does not claim bounties from the current user authored chat messages', () => {
    appendCurrentUserIdentity('@CurrentViewer');
    initMentionDetection();
    const onAction = vi.fn();
    const game = createBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    const message = appendChatMessage('msg-own', '@CurrentViewer', 'look @Marco');

    handleFeatureMessage(message, { source: 'added' });
    updateBountyHuntingGamePanel(game, 'host-user');

    expect(onAction).toHaveBeenCalledWith('game-bounty-hunting', 'observeBountyMessage', {
      observations: [
        {
          bountyIds: ['mention-user'],
          messageId: 'msg-own'
        }
      ]
    });

    message.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onAction).not.toHaveBeenCalledWith(
      'game-bounty-hunting',
      'shootBounty',
      expect.anything()
    );
  });

  it('sends all matching witness bounty IDs in one playground action', () => {
    const onAction = vi.fn();
    const baseGame = createBountyHuntingGame();
    const game = {
      ...baseGame,
      bounties: [
        ...baseGame.bounties,
        {
          amount: 75,
          description: 'a message that asks a question',
          id: 'question',
          matcher: { kind: 'question' as const }
        }
      ]
    };
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    const message = appendChatMessage('msg-1', '@Luna', 'look @Marco?');

    handleFeatureMessage(message, { source: 'added' });
    updateBountyHuntingGamePanel(game, 'host-user');

    const observeCalls = onAction.mock.calls.filter((call) => call[1] === 'observeBountyMessage');
    expect(observeCalls).toHaveLength(1);
    expect(observeCalls[0]).toEqual([
      'game-bounty-hunting',
      'observeBountyMessage',
      {
        observations: [
          {
            bountyIds: ['mention-user', 'question'],
            messageId: 'msg-1'
          }
        ]
      }
    ]);
  });

  it('submits prepared bounties after the minimum wait when chat has enough diversity', async () => {
    vi.useFakeTimers();
    let now = 100_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    appendChatMessage('msg-all-caps', '@Luna', 'LOUD');
    appendChatMessage('msg-question', '@Luna', 'howdy?');
    appendChatMessage('msg-mention', '@Luna', 'hello @Marco');
    appendChatMessage('msg-number', '@Luna', 'number 123');
    appendChatMessage('msg-emoji', '@Luna', '🤠🤠🤠');
    appendChatMessage('msg-verified', '@Luna', 'verified message', {
      author: { badges: [{ kind: 'verified', label: 'Verified' }] }
    });
    appendChatMessage('msg-member', '@Luna', 'member message', {
      author: { badges: [{ kind: 'member', label: 'Member' }] }
    });
    appendChatMessage('msg-moderator', '@Luna', 'moderator message', {
      author: { badges: [{ kind: 'moderator', label: 'Moderator' }] }
    });
    const onAction = vi.fn();

    openBountyHuntingGamePanel(createPreparingBountyHuntingGame(), 'host-user', onAction);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(onAction).not.toHaveBeenCalledWith(
      'game-bounty-hunting',
      'submitBounties',
      expect.anything()
    );

    now = 102_000;
    await vi.advanceTimersByTimeAsync(1);

    const submitCalls = onAction.mock.calls.filter((call) => call[1] === 'submitBounties');
    expect(submitCalls).toHaveLength(1);
    expect(submitCalls[0][2]).toMatchObject({
      bounties: expect.arrayContaining([
        expect.objectContaining({ id: 'mention-user' }),
        expect.objectContaining({ id: 'channel-member' }),
        expect.objectContaining({ id: 'moderator' }),
        expect.objectContaining({ id: 'only-emojis' }),
        expect.objectContaining({ id: 'has-number' }),
        expect.objectContaining({ id: 'question' })
      ])
    });
  });

  it('keeps preparing until the maximum wait when chat diversity stays low', async () => {
    vi.useFakeTimers();
    let now = 100_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const onAction = vi.fn();

    openBountyHuntingGamePanel(createPreparingBountyHuntingGame(), 'host-user', onAction);

    for (const elapsed of [2_000, 3_000, 4_000, 5_000]) {
      now = 100_000 + elapsed;
      await vi.advanceTimersByTimeAsync(elapsed === 2_000 ? 2_000 : 1_000);
      expect(onAction.mock.calls.some((call) => call[1] === 'submitBounties')).toBe(false);
    }

    now = 106_000;
    await vi.advanceTimersByTimeAsync(1_000);

    const submitCalls = onAction.mock.calls.filter((call) => call[1] === 'submitBounties');
    expect(submitCalls).toHaveLength(1);
    expect(submitCalls[0][2]).toMatchObject({
      bounties: expect.arrayContaining([
        expect.objectContaining({ id: 'emoji-3' }),
        expect.objectContaining({ id: 'all-caps' }),
        expect.objectContaining({ id: 'question' })
      ])
    });
  });

  it.each(['rate_limited', 'internal_error'])(
    'retries the exact prepared bounties after a transient %s error',
    async (code) => {
      vi.useFakeTimers();
      let now = 100_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      const onAction = vi.fn();
      const game = createPreparingBountyHuntingGame();
      openBountyHuntingGamePanel(game, 'host-user', onAction);

      for (const elapsed of [2_000, 3_000, 4_000, 5_000, 6_000]) {
        now = 100_000 + elapsed;
        await vi.advanceTimersByTimeAsync(elapsed === 2_000 ? 2_000 : 1_000);
      }
      const firstSubmit = onAction.mock.calls.find(([, action]) => action === 'submitBounties');
      expect(firstSubmit).toBeDefined();

      expect(handleBountyHuntingActionError({
        code,
        message: 'Try again.',
        request: {
          action: 'submitBounties',
          gameId: game.gameId,
          payload: firstSubmit?.[2] as Record<string, unknown>,
          type: 'gameAction'
        }
      })).toBe(true);
      await vi.advanceTimersByTimeAsync(4_999);
      expect(onAction.mock.calls.filter(([, action]) => action === 'submitBounties')).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1);
      const submitCalls = onAction.mock.calls.filter(([, action]) => action === 'submitBounties');
      expect(submitCalls).toHaveLength(2);
      expect(submitCalls[1]?.[2]).toEqual(firstSubmit?.[2]);
    }
  );

  it('does not retry prepared bounties after a permanent validation error', async () => {
    vi.useFakeTimers();
    let now = 100_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const onAction = vi.fn();
    const game = createPreparingBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', onAction);

    now = 106_000;
    await vi.advanceTimersByTimeAsync(6_000);
    const firstSubmit = onAction.mock.calls.find(([, action]) => action === 'submitBounties');
    expect(firstSubmit).toBeDefined();

    expect(handleBountyHuntingActionError({
      code: 'invalid_bounties',
      message: 'Invalid bounties.',
      request: {
        action: 'submitBounties',
        gameId: game.gameId,
        payload: firstSubmit?.[2] as Record<string, unknown>,
        type: 'gameAction'
      }
    })).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(onAction.mock.calls.filter(([, action]) => action === 'submitBounties')).toHaveLength(1);
  });

  it('resends an unconfirmed bounty submission after reconnecting to the same phase', async () => {
    vi.useFakeTimers();
    let now = 100_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const onAction = vi.fn();
    const game = createPreparingBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', onAction);

    now = 106_000;
    await vi.advanceTimersByTimeAsync(6_000);
    const firstSubmit = onAction.mock.calls.find(([, action]) => action === 'submitBounties');
    expect(firstSubmit).toBeDefined();

    resetBountyHuntingGameClientState();
    updateBountyHuntingGamePanel(game, 'host-user');
    const submitCalls = onAction.mock.calls.filter(([, action]) => action === 'submitBounties');
    expect(submitCalls).toHaveLength(2);
    expect(submitCalls[1]?.[2]).toEqual(firstSubmit?.[2]);
  });

  it('does not include off-DOM feed history in the preparation sample', async () => {
    vi.useFakeTimers();
    let now = 100_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    rememberTestChatFeedRecord({
      author: {
        badges: [{ kind: 'member', label: 'Member' }],
        channelId: 'background-member-channel',
        name: '@BackgroundMember'
      },
      id: 'background-member-message',
      kind: 'text',
      plainText: 'background member message',
      runs: [{ text: 'background member message', type: 'text' }]
    });
    const onAction = vi.fn();

    openBountyHuntingGamePanel(createPreparingBountyHuntingGame(), 'host-user', onAction);
    now = 107_000;
    await vi.advanceTimersByTimeAsync(7_000);

    const submitCall = onAction.mock.calls.find((call) => call[1] === 'submitBounties');
    expect(submitCall).toBeDefined();
    expect(submitCall?.[2]).toMatchObject({
      bounties: expect.not.arrayContaining([expect.objectContaining({ id: 'channel-member' })])
    });
  });

  it('retains rendered messages sampled earlier in preparation', async () => {
    vi.useFakeTimers();
    let now = 100_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    appendChatMessage('sampled-member-message', '@SampledMember', 'member message', {
      author: { badges: [{ kind: 'member', label: 'Member' }] }
    });
    const onAction = vi.fn();

    openBountyHuntingGamePanel(createPreparingBountyHuntingGame(), 'host-user', onAction);
    dispatchChatFeedActions([{ id: 'sampled-member-message', type: 'remove' }]);
    now = 107_000;
    await vi.advanceTimersByTimeAsync(7_000);

    const submitCall = onAction.mock.calls.find((call) => call[1] === 'submitBounties');
    expect(submitCall?.[2]).toMatchObject({
      bounties: expect.arrayContaining([expect.objectContaining({ id: 'channel-member' })])
    });
  });

  it('sends nonmatching clicked messages to the backend for evaluation', () => {
    const onAction = vi.fn();
    openBountyHuntingGamePanel(createBountyHuntingGame(), 'host-user', onAction);
    const message = appendChatMessage('msg-2', '@Luna', 'hello chat');

    message.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onAction).toHaveBeenCalledWith(
      'game-bounty-hunting',
      'shootBounty',
      createShotPayload('msg-2')
    );
    expect(onAction).not.toHaveBeenCalledWith(
      'game-bounty-hunting',
      'observeBountyMessage',
      expect.anything()
    );
    expect(document.querySelector<HTMLElement>('.ytcq-bounty-hunting-miss-feedback')?.hidden).toBe(
      true
    );
  });

  it('renders into a replay-sized backing canvas and display width', () => {
    openBountyHuntingGamePanel(createBountyHuntingGame(), 'host-user', vi.fn());

    const canvas = getBountyHuntingCanvas();

    expect(canvas.width).toBe(448);
    expect(canvas.height).toBe(448);
    expect(canvas.style.maxWidth).toBe('336px');
  });

  it('renders a compact hunt belt with score, timer, and bounty chips', () => {
    openBountyHuntingGamePanel(
      {
        ...createBountyHuntingGame(),
        bounties: createCompactBounties()
      },
      'host-user',
      vi.fn()
    );

    const canvas = getBountyHuntingCanvas();
    setBountyHuntingCompactMode(true);

    expect(canvas.width).toBe(448);
    expect(canvas.height).toBe(128);
    expect(canvas.style.aspectRatio).toBe('448 / 128');
    expect(canvas.classList.contains('ytcq-bounty-hunting-canvas-compact')).toBe(true);
    expect(context.fillText).toHaveBeenCalledWith('00:60', 224, 26);
    expect(context.fillText).toHaveBeenCalledWith('TIME REMAINING', 224, 46);
    expect(context.fillText).toHaveBeenCalledWith('mod', 55, 81);
    expect(context.fillText).toHaveBeenCalledWith('member', 347, 113);

    setBountyHuntingCompactMode(false);

    expect(canvas.width).toBe(448);
    expect(canvas.height).toBe(448);
    expect(canvas.style.aspectRatio).toBe('448 / 448');
    expect(canvas.classList.contains('ytcq-bounty-hunting-canvas-compact')).toBe(false);
  });

  it('stretches the compact background asset to the full canvas width', async () => {
    const liveScoreBg = document.createElement('img');
    assetMock.getAssets.mockResolvedValue({
      ...assetMock.emptyAssets,
      liveScoreBg
    });
    openBountyHuntingGamePanel(createBountyHuntingGame(), 'host-user', vi.fn());
    await Promise.resolve();
    context.drawImage.mockClear();

    setBountyHuntingCompactMode(true);

    expect(context.drawImage).toHaveBeenCalledWith(liveScoreBg, 0, -1, 448, 130);
  });

  it('overlays compact bounty stamps when assets are loaded', async () => {
    const bountyClaimedStamp = document.createElement('img');
    const bountyOpenStamp = document.createElement('img');
    assetMock.getAssets.mockResolvedValue({
      ...assetMock.emptyAssets,
      bountyClaimedStamp,
      bountyOpenStamp
    });
    openBountyHuntingGamePanel(
      {
        ...createBountyHuntingGame(),
        bounties: [
          createClaimedBounty('claimed-compact', 'guest'),
          {
            amount: 75,
            description: 'a message with a number',
            id: 'open-compact',
            matcher: { kind: 'number' }
          }
        ]
      },
      'host-user',
      vi.fn()
    );
    await Promise.resolve();
    context.drawImage.mockClear();

    setBountyHuntingCompactMode(true);

    expect(context.drawImage).toHaveBeenCalledWith(bountyClaimedStamp, -24, -17, 48, 34);
    expect(context.drawImage).toHaveBeenCalledWith(bountyOpenStamp, 248, 60, 44, 38);
  });

  it('draws dollar signs above the paired money amount', () => {
    openBountyHuntingGamePanel(createBountyHuntingGame(), 'host-user', vi.fn());

    const fillTextCalls = context.fillText.mock.calls;
    const dollarCalls = fillTextCalls
      .map((call, index) => ({ call, index }))
      .filter(({ call }) => call[0] === '$');

    expect(dollarCalls.length).toBeGreaterThan(0);
    dollarCalls.forEach(({ call, index }) => {
      const amountCall = fillTextCalls[index + 1];
      expect(amountCall).toBeTruthy();
      expect(Number(call[2])).toBeLessThan(Number(amountCall[2]));
    });
  });

  it('orders wanted bounties from lower to higher money amounts', () => {
    openBountyHuntingGamePanel(
      {
        ...createBountyHuntingGame(),
        bounties: [
          {
            amount: 125,
            description: 'high bounty',
            id: 'high',
            matcher: { kind: 'mention' }
          },
          {
            amount: 50,
            description: 'low bounty',
            id: 'low',
            matcher: { kind: 'allCaps' }
          },
          {
            amount: 75,
            description: 'mid bounty',
            id: 'mid',
            matcher: { kind: 'question' }
          }
        ]
      },
      'host-user',
      vi.fn()
    );

    expect(context.fillText).toHaveBeenCalledWith('low bounty', 124, 166);
    expect(context.fillText).toHaveBeenCalledWith('mid bounty', 124, 208);
    expect(context.fillText).toHaveBeenCalledWith('high bounty', 124, 250);
  });

  it('renders bounty descriptions from localization keys when available', () => {
    openBountyHuntingGamePanel(
      {
        ...createBountyHuntingGame(),
        bounties: [
          {
            amount: 75,
            description: 'fallback description',
            descriptionKey: 'gamesBountyHuntingBountyNumber',
            id: 'has-number',
            matcher: { kind: 'number' }
          }
        ]
      },
      'host-user',
      vi.fn()
    );

    expect(context.fillText).toHaveBeenCalledWith('a message with a number', 124, 166);
    expect(context.fillText).not.toHaveBeenCalledWith('fallback description', 124, 166);
  });

  it('dims claimed bounty rows in the expanded wanted list', () => {
    const descriptionAlpha = new Map<string, number>();
    context.fillText.mockImplementation((text: string) => {
      if (text === 'a claimed message' || text === 'an open message') {
        descriptionAlpha.set(text, context.globalAlpha);
      }
    });

    openBountyHuntingGamePanel(
      {
        ...createBountyHuntingGame(),
        bounties: [
          createClaimedBounty('first', 'guest'),
          {
            amount: 50,
            description: 'an open message',
            id: 'second',
            matcher: { kind: 'question' as const }
          }
        ]
      },
      'host-user',
      vi.fn()
    );

    expect(descriptionAlpha.get('a claimed message')).toBe(0.66);
    expect(descriptionAlpha.get('an open message')).toBe(1);
  });

  it('uses the title color for the timer until the active round starts', () => {
    const timerColors: string[] = [];
    context.fillText.mockImplementation((text: string, x: number, y: number) => {
      if (text === '00:60' && x === 224 && y === 103) timerColors.push(context.fillStyle);
    });
    openBountyHuntingGamePanel(
      {
        ...createBountyHuntingGame(),
        roundEndsAt: undefined,
        status: 'ready'
      },
      'host-user',
      vi.fn()
    );

    expect(timerColors.at(-1)).toBe('#352c24');

    updateBountyHuntingGamePanel(createBountyHuntingGame(), 'host-user');

    expect(timerColors.at(-1)).toBe('#8f1d25');
  });

  it('pulses and flashes the timer once when the active round starts', () => {
    const timerDraws: Array<{ color: string; font: string; shadowColor: string; text: string }> =
      [];
    context.fillText.mockImplementation((text: string, x: number, y: number) => {
      if (text === '00:60' && x === 224 && y === 103) {
        timerDraws.push({
          color: context.fillStyle,
          font: context.font,
          shadowColor: context.shadowColor,
          text
        });
      }
    });
    const countdownGame = {
      ...createBountyHuntingGame(),
      roundEndsAt: undefined,
      status: 'countdown' as const
    };
    openBountyHuntingGamePanel(countdownGame, 'host-user', vi.fn());
    timerDraws.length = 0;
    context.fillText.mockClear();

    updateBountyHuntingGamePanel(createBountyHuntingGame(), 'host-user');
    frameCallbacks[0]?.(100_860);

    expect(timerDraws).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          color: '#f7d88a',
          font: expect.stringContaining('30px'),
          shadowColor: 'rgba(255, 236, 158, 0.95)'
        })
      ])
    );
    expect(getPlayedAudio(audioElements)?.src).toContain('round-start-cue.mp3');
  });

  it('draws ready players as an avatar stack on the ready button', () => {
    const game = {
      ...createBountyHuntingGame(),
      readyPlayers: {
        guest: true,
        host: false
      },
      status: 'ready' as const
    };

    openBountyHuntingGamePanel(game, 'host-user', vi.fn());

    const readyAvatarCalls = context.arc.mock.calls.filter((call) => call[2] === 10);
    expect(readyAvatarCalls).toHaveLength(1);
    expect(readyAvatarCalls[0][0]).toBe(294);
    expect(readyAvatarCalls[0][1]).toBe(423);
  });

  it('draws claimed bounty avatars above following rows', () => {
    const game = {
      ...createBountyHuntingGame(),
      bounties: [
        createClaimedBounty('first', 'guest'),
        {
          amount: 50,
          description: 'an open message',
          id: 'second',
          matcher: { kind: 'question' as const }
        }
      ]
    };

    openBountyHuntingGamePanel(game, 'host-user', vi.fn());

    const secondRowMoveIndex = context.moveTo.mock.calls.findIndex(
      (call) => call[0] === 45 && call[1] === 188
    );
    const firstClaimAvatarIndex = context.arc.mock.calls.findIndex(
      (call) => call[0] === 386 && call[1] === 180 && call[2] === 15
    );

    expect(secondRowMoveIndex).toBeGreaterThanOrEqual(0);
    expect(firstClaimAvatarIndex).toBeGreaterThanOrEqual(0);
    expect(context.arc.mock.invocationCallOrder[firstClaimAvatarIndex]).toBeGreaterThan(
      context.moveTo.mock.invocationCallOrder[secondRowMoveIndex]
    );
  });

  it('draws the ledger table at the adjusted proportions', () => {
    openBountyHuntingGamePanel(createFinishedBountyHuntingGame(), 'host-user', vi.fn());

    expect(context.fillText).toHaveBeenCalledWith('THE LEDGER', 224, 46);
    expect(context.fillText).toHaveBeenCalledWith('BOUNTIES', 304, 96);
    expect(context.fillText).toHaveBeenCalledWith('CLAIMED', 304, 113);
    expect(context.fillText).toHaveBeenCalledWith('MONEY', 382, 96);
    expect(context.fillText).toHaveBeenCalledWith('EARNED', 382, 113);
    expect(context.fillText).toHaveBeenCalledWith('YOU', 136, 164);
    expect(context.fillText).toHaveBeenCalledWith('4', 304, 164);
    expect(context.fillText).toHaveBeenCalledWith('THEM', 136, 234);
    expect(context.fillText).toHaveBeenCalledWith('2', 304, 234);
    expect(context.fillText).toHaveBeenCalledWith('WINNER: YOU', 224, 318);
    expect(context.moveTo).toHaveBeenCalledWith(92, 136);
    expect(context.lineTo).toHaveBeenCalledWith(420, 136);
  });

  it('prefers the loaded round over title image over text fallback', async () => {
    const roundOverTitle = document.createElement('img');
    assetMock.getAssets.mockResolvedValue({
      ...assetMock.emptyAssets,
      roundOverTitle
    });

    openBountyHuntingGamePanel(
      {
        ...createBountyHuntingGame(),
        roundEndsAt: undefined,
        status: 'roundOver'
      },
      'host-user',
      vi.fn()
    );
    await Promise.resolve();

    expect(context.drawImage).toHaveBeenCalledWith(roundOverTitle, 33, 28, 382, 296);
  });

  it('draws the round over loading button higher with cream text', () => {
    const loadingLabels: Array<{ color: string; x: number; y: number }> = [];
    context.fillText.mockImplementation((text: string, x: number, y: number) => {
      if (text === 'LOADING') loadingLabels.push({ color: context.fillStyle, x, y });
    });

    openBountyHuntingGamePanel(
      {
        ...createBountyHuntingGame(),
        roundEndsAt: undefined,
        status: 'roundOver'
      },
      'host-user',
      vi.fn()
    );

    expect(context.fillText).toHaveBeenCalledWith('ROUND OVER', 224, 169);
    expect(loadingLabels.at(-1)).toEqual({
      color: '#F4DAA5',
      x: 224,
      y: 411
    });
  });

  it('draws a spinner on the logo loading screen', () => {
    openBountyHuntingGamePanel(createPreparingBountyHuntingGame(), 'host-user', vi.fn());

    expect(context.fillText).toHaveBeenCalledWith('RELOADED', 224, 300);
    expect(context.fillText).toHaveBeenCalledWith('Loading...', 224, 370);
    expect(context.arc).toHaveBeenCalledWith(224, 396, 9, 0, Math.PI * 2);
    expect(context.stroke).toHaveBeenCalled();
  });

  it('continues the ready flash when another player starts the countdown', () => {
    const game = {
      ...createBountyHuntingGame(),
      readyPlayers: {
        guest: false,
        host: true
      },
      status: 'ready' as const
    };
    openBountyHuntingGamePanel(game, 'host-user', vi.fn());
    expect(context.shadowColor).toBe('');

    updateBountyHuntingGamePanel(
      {
        ...game,
        readyPlayers: {
          guest: true,
          host: true
        },
        roundEndsAt: undefined,
        status: 'countdown'
      },
      'host-user'
    );

    expect(context.shadowColor).toBe('rgba(255, 238, 156, 0.95)');
    expect(getPlayedAudio(audioElements)?.src).toContain('ready-gun-cock.mp3');
  });

  it('flashes with the button art shape when the button asset is loaded', async () => {
    const buttonBg = document.createElement('img');
    assetMock.getAssets.mockResolvedValue({
      ...assetMock.emptyAssets,
      buttonBg
    });
    const game = {
      ...createBountyHuntingGame(),
      readyPlayers: {
        guest: false,
        host: false
      },
      status: 'ready' as const
    };
    openBountyHuntingGamePanel(game, 'host-user', vi.fn());
    await Promise.resolve();
    context.drawImage.mockClear();

    updateBountyHuntingGamePanel(
      {
        ...game,
        readyPlayers: {
          guest: true,
          host: false
        }
      },
      'host-user'
    );

    const readyButtonDraws = context.drawImage.mock.calls.filter(
      (call) =>
        call[0] === buttonBg &&
        call[1] === 142 &&
        call[2] === 394 &&
        call[3] === 164 &&
        call[4] === 58
    );
    expect(readyButtonDraws).toHaveLength(3);
  });

  it('plays a ricochet when a bounty is claimed', () => {
    const game = createBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', vi.fn());

    updateBountyHuntingGamePanel(
      {
        ...game,
        bounties: [createClaimedBounty('mention-user', 'guest')],
        scores: {
          guest: 125,
          host: 0
        }
      },
      'host-user'
    );

    expect(getPlayedAudio(audioElements)?.src).toContain('claim-ricochet-01.mp3');
  });

  it('plays the sting when the round over screen appears', () => {
    const game = createBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', vi.fn());

    updateBountyHuntingGamePanel(
      {
        ...game,
        phaseStartedAt: 103_000,
        roundEndsAt: undefined,
        status: 'roundOver'
      },
      'host-user'
    );

    expect(getPlayedAudio(audioElements)?.src).toContain('sting.mp3');
  });

  it('requests compact top-center placement when the active round starts', () => {
    const controls = {
      setCompactMode: vi.fn(),
      setPosition: vi.fn()
    };
    const oldMessage = appendChatMessage('msg-old', '@Luna', 'look @Marco');
    const game = {
      ...createBountyHuntingGame(),
      phaseStartedAt: 100_000,
      roundEndsAt: undefined,
      status: 'countdown' as const
    };
    openBountyHuntingGamePanel(game, 'host-user', vi.fn(), controls);

    updateBountyHuntingGamePanel(
      {
        ...game,
        phaseStartedAt: 103_000,
        roundEndsAt: 163_000,
        status: 'active'
      },
      'host-user'
    );

    expect(controls.setCompactMode).toHaveBeenCalledWith(true);
    expect(controls.setPosition).toHaveBeenCalledWith({ placement: 'top-center' });
    expect([...getChatItemsContainer().children]).toContain(oldMessage);
  });

  it('expands back to the round over page when the active round ends', () => {
    const controls = {
      setCompactMode: vi.fn(),
      setPosition: vi.fn()
    };
    const game = createBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', vi.fn(), controls);

    updateBountyHuntingGamePanel(
      {
        ...game,
        phaseStartedAt: 160_000,
        roundEndsAt: undefined,
        status: 'roundOver'
      },
      'host-user'
    );

    expect(controls.setCompactMode).toHaveBeenCalledWith(false);
    expect(controls.setPosition).not.toHaveBeenCalled();
  });

  it('turns the ready button into a pulsing pre-round countdown', () => {
    const countdownDraws: Array<{ color: string; font: string; text: string }> = [];
    context.fillText.mockImplementation((text: string, x: number, y: number) => {
      if (x === 224 && y === 423) {
        countdownDraws.push({
          color: context.fillStyle,
          font: context.font,
          text
        });
      }
    });
    vi.mocked(Date.now).mockReturnValue(100_000);
    const onAction = vi.fn();
    const game = {
      ...createBountyHuntingGame(),
      phaseStartedAt: 100_000,
      roundEndsAt: undefined,
      status: 'countdown' as const
    };

    openBountyHuntingGamePanel(game, 'host-user', onAction);

    expect(countdownDraws).toEqual([
      {
        color: '#8f1d25',
        font: expect.stringContaining('800 36px'),
        text: '3'
      }
    ]);
    expect(context.fillText).not.toHaveBeenCalledWith('3', 224, 228);
    expect(context.arc.mock.calls.filter((call) => call[2] === 10)).toHaveLength(0);
    expect(context.shadowColor).toBe('rgba(255, 238, 156, 0.95)');

    context.shadowColor = '';
    vi.mocked(Date.now).mockReturnValue(100_600);
    frameCallbacks[0]?.(100_600);
    expect(countdownDraws.at(-1)?.font).toContain('800 30px');
    expect(context.shadowColor).not.toBe('rgba(255, 238, 156, 0.95)');

    vi.mocked(Date.now).mockReturnValue(101_000);
    frameCallbacks[1]?.(101_000);
    expect(countdownDraws.at(-1)?.text).toBe('2');
    expect(context.shadowColor).toBe('rgba(255, 238, 156, 0.95)');

    context.shadowColor = '';
    vi.mocked(Date.now).mockReturnValue(101_600);
    frameCallbacks[2]?.(101_600);
    expect(context.shadowColor).not.toBe('rgba(255, 238, 156, 0.95)');

    vi.mocked(Date.now).mockReturnValue(102_000);
    frameCallbacks[3]?.(102_000);
    expect(countdownDraws.at(-1)?.text).toBe('1');
    expect(context.shadowColor).toBe('rgba(255, 238, 156, 0.95)');

    vi.mocked(Date.now).mockReturnValue(103_000);
    frameCallbacks[4]?.(103_000);

    expect(onAction).toHaveBeenCalledWith('game-bounty-hunting', 'startRound');
  });

  it('retries a rejected timer transition after a controlled delay', () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    const game = {
      ...createBountyHuntingGame(),
      phaseStartedAt: 100_000,
      roundEndsAt: undefined,
      status: 'countdown' as const
    };
    vi.setSystemTime(103_000);
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    runLatestBountyHuntingFrame(103_000);

    expect(handleBountyHuntingActionError({
      code: 'countdown_active',
      message: 'Countdown still active.',
      request: {
        action: 'startRound',
        gameId: game.gameId,
        type: 'gameAction'
      }
    })).toBe(true);

    vi.advanceTimersByTime(4_999);
    expect(onAction.mock.calls.filter(([, action]) => action === 'startRound')).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(onAction.mock.calls.filter(([, action]) => action === 'startRound')).toHaveLength(2);

    expect(handleBountyHuntingActionError({
      code: 'game_not_found',
      message: 'Game not found.',
      request: {
        action: 'startRound',
        gameId: game.gameId,
        type: 'gameAction'
      }
    })).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(onAction.mock.calls.filter(([, action]) => action === 'startRound')).toHaveLength(2);
  });

  it.each([
    {
      action: 'startRound',
      game: {
        ...createBountyHuntingGame(),
        phaseStartedAt: 100_000,
        roundEndsAt: undefined,
        status: 'countdown' as const
      },
      now: 103_000
    },
    {
      action: 'timeout',
      game: {
        ...createBountyHuntingGame(),
        phaseStartedAt: 40_000,
        roundEndsAt: 100_000,
        status: 'active' as const
      },
      now: 100_500
    },
    {
      action: 'finish',
      game: {
        ...createBountyHuntingGame(),
        phaseStartedAt: 90_000,
        roundEndsAt: undefined,
        status: 'roundOver' as const
      },
      now: 100_500
    }
  ])('releases the $action latch after reconnecting to the same phase', ({ action, game, now }) => {
    const onAction = vi.fn();
    vi.mocked(Date.now).mockReturnValue(now);
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    runLatestBountyHuntingFrame(now);
    expect(onAction.mock.calls.filter(([, sentAction]) => sentAction === action)).toHaveLength(1);

    resetBountyHuntingGameClientState();
    updateBountyHuntingGamePanel(game, 'host-user');
    runLatestBountyHuntingFrame(now);

    expect(onAction.mock.calls.filter(([, sentAction]) => sentAction === action)).toHaveLength(2);
  });

  it('keeps the start divider at the timestamp boundary after countdown', async () => {
    const onAction = vi.fn();
    const oldMessage = appendChatMessage('msg-old', '@Luna', 'old @Marco');
    const game = {
      ...createBountyHuntingGame(),
      phaseStartedAt: 100_000,
      roundEndsAt: undefined,
      status: 'countdown' as const
    };

    openBountyHuntingGamePanel(game, 'host-user', onAction);
    await sendYouTubeMessageTimestamp(oldMessage, '102999999');
    vi.mocked(Date.now).mockReturnValue(103_000);
    expect(frameCallbacks.length).toBeGreaterThan(0);
    frameCallbacks[frameCallbacks.length - 1]?.(103_000);
    expect(onAction).toHaveBeenCalledWith('game-bounty-hunting', 'startRound');
    expect(getBountyHuntingStartDivider().parentElement).toBe(oldMessage);

    const newMessage = appendChatMessage('msg-new', '@Luna', 'new @Marco');
    updateBountyHuntingGamePanel(
      {
        ...createBountyHuntingGame(),
        phaseStartedAt: 103_000,
        roundStartTimestampUsec: '103000000',
        status: 'active'
      },
      'host-user'
    );
    await sendYouTubeMessageTimestamp(newMessage, '103000001');
    runLatestBountyHuntingFrame(103_100);

    const divider = getBountyHuntingStartDivider();

    const children = [...getChatItemsContainer().children];
    expect(children.indexOf(oldMessage)).toBeLessThan(children.indexOf(newMessage));
    expect(children).not.toContain(divider);
    expect(divider.parentElement).toBe(newMessage);
  });

  it('places the start divider before the first visible post-start timestamp', async () => {
    const firstMessage = appendChatMessage('msg-new-1', '@Luna', 'first after @Marco');
    const secondMessage = appendChatMessage('msg-new-2', '@Luna', 'second after @Marco');

    openBountyHuntingGamePanel(
      {
        ...createBountyHuntingGame(),
        phaseStartedAt: 103_000,
        roundStartTimestampUsec: '103000000',
        status: 'active'
      },
      'host-user',
      vi.fn()
    );
    await sendYouTubeMessageTimestamp(firstMessage, '103000001');
    await sendYouTubeMessageTimestamp(secondMessage, '103000002');
    runPendingBountyHuntingFrames(103_100);

    const divider = getBountyHuntingStartDivider();
    const children = [...getChatItemsContainer().children];
    expect(children.indexOf(firstMessage)).toBeLessThan(children.indexOf(secondMessage));
    expect(children).not.toContain(divider);
    expect(divider.parentElement).toBe(firstMessage);
  });

  it('does not move the start divider past an eligible message when an older row arrives later', async () => {
    const oldMessage = appendChatMessage('msg-old', '@Luna', 'old @Marco');
    const eligibleMessage = appendChatMessage('msg-eligible', '@Luna', 'eligible @Marco');

    openBountyHuntingGamePanel(
      {
        ...createBountyHuntingGame(),
        phaseStartedAt: 103_000,
        roundStartTimestampUsec: '103000000',
        status: 'active'
      },
      'host-user',
      vi.fn()
    );
    await sendYouTubeMessageTimestamp(oldMessage, '102999999');
    await sendYouTubeMessageTimestamp(eligibleMessage, '103000001');
    runPendingBountyHuntingFrames(103_100);
    expect(getBountyHuntingStartDivider().parentElement).toBe(eligibleMessage);

    const lateOldMessage = appendChatMessage('msg-late-old', '@Luna', 'late old @Marco');
    await sendYouTubeMessageTimestamp(lateOldMessage, '102999998');
    handleFeatureMessage(lateOldMessage, { source: 'added' });
    runPendingBountyHuntingFrames(103_200);

    expect(getBountyHuntingStartDivider().parentElement).toBe(eligibleMessage);
  });

  it('keeps the visual start divider outside YouTube message items as newer messages arrive', async () => {
    const oldMessage = appendChatMessage('msg-old', '@Luna', 'old @Marco');

    openBountyHuntingGamePanel(
      {
        ...createBountyHuntingGame(),
        phaseStartedAt: 102_000,
        roundStartTimestampUsec: '103000000',
        status: 'active'
      },
      'host-user',
      vi.fn()
    );
    await sendYouTubeMessageTimestamp(oldMessage, '102999999');
    runPendingBountyHuntingFrames(103_000);
    const divider = getBountyHuntingStartDivider();
    const newMessage = appendChatMessage('msg-new', '@Luna', 'new @Marco');

    await sendYouTubeMessageTimestamp(newMessage, '103000001');
    handleFeatureMessage(newMessage, { source: 'added' });
    runPendingBountyHuntingFrames(104_000);

    const children = [...getChatItemsContainer().children];
    expect(children.indexOf(oldMessage)).toBeLessThan(children.indexOf(newMessage));
    expect(children).not.toContain(divider);
    expect(divider.parentElement).toBe(newMessage);
  });

  it('plays the final ten second clock tick once', () => {
    const game = {
      ...createBountyHuntingGame(),
      phaseStartedAt: 50_500
    };
    openBountyHuntingGamePanel(game, 'host-user', vi.fn());

    frameCallbacks[0]?.(100_500);
    frameCallbacks[1]?.(101_000);

    const playedTicks = audioElements.filter(
      (audio) => audio.src.includes('final-10-clock-tick.mp3') && audio.play.mock.calls.length > 0
    );
    expect(playedTicks).toHaveLength(1);
  });

  it.each([
    { expectedReadyAvatars: 0, hostReady: false },
    { expectedReadyAvatars: 1, hostReady: true }
  ])(
    'keeps the authoritative ready state after a rejected request from $hostReady',
    ({ expectedReadyAvatars, hostReady }) => {
      const onAction = vi.fn();
      const game = {
        ...createBountyHuntingGame(),
        readyPlayers: {
          guest: false,
          host: hostReady
        },
        roundEndsAt: undefined,
        status: 'ready' as const
      };
      openBountyHuntingGamePanel(game, 'host-user', onAction);

      getBountyHuntingCanvas().dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          key: 'Enter'
        })
      );
      context.arc.mockClear();

      expect(handleBountyHuntingActionError({
        code: 'rate_limited',
        message: 'Slow down.',
        request: {
          action: 'ready',
          gameId: game.gameId,
          type: 'gameAction'
        }
      })).toBe(false);
      updateBountyHuntingGamePanel(game, 'host-user');

      expect(context.arc.mock.calls.filter((call) => call[2] === 10)).toHaveLength(
        expectedReadyAvatars
      );
      getBountyHuntingCanvas().dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          key: 'Enter'
        })
      );
      expect(onAction.mock.calls.filter(([, action]) => action === 'ready')).toHaveLength(2);
    }
  );

  it('activates canvas buttons from the keyboard when the canvas is scaled down', () => {
    const onAction = vi.fn();
    const game = {
      ...createBountyHuntingGame(),
      readyPlayers: {
        guest: true,
        host: false
      },
      status: 'ready' as const
    };
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 336,
      height: 336,
      left: 0,
      right: 336,
      top: 0,
      width: 336,
      x: 0,
      y: 0,
      toJSON: () => ({})
    } as DOMRect);

    getBountyHuntingCanvas().dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        key: 'Enter'
      })
    );

    expect(onAction).toHaveBeenCalledWith('game-bounty-hunting', 'ready');
    updateBountyHuntingGamePanel(
      {
        ...game,
        readyPlayers: {
          guest: true,
          host: true
        }
      },
      'host-user'
    );
    expect(context.shadowColor).toBe('rgba(255, 238, 156, 0.95)');
    expect(getPlayedAudio(audioElements)?.src).toContain('ready-gun-cock.mp3');
    const readyAvatarCalls = context.arc.mock.calls.filter((call) => call[2] === 10);
    expect(readyAvatarCalls.slice(-2).map((call) => [call[0], call[1]])).toEqual([
      [282, 423],
      [294, 423]
    ]);
  });

  it('activates the compact ready button', () => {
    const onAction = vi.fn();
    const game = {
      ...createBountyHuntingGame(),
      readyPlayers: {
        guest: true,
        host: false
      },
      status: 'ready' as const
    };
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    setBountyHuntingCompactMode(true);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 128,
      height: 128,
      left: 0,
      right: 448,
      top: 0,
      width: 448,
      x: 0,
      y: 0,
      toJSON: () => ({})
    } as DOMRect);

    getBountyHuntingCanvas().dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: 224,
        clientY: 32
      })
    );

    expect(onAction).toHaveBeenCalledWith('game-bounty-hunting', 'ready');
  });
});

function openBountyHuntingGamePanel(
  game: PublicBountyHuntingGame,
  currentUserId: string,
  onAction: SendGameAction,
  controls: GamePanelControls | null = null
): void {
  const controller = new AbortController();
  shellControllers.push(controller);
  let shell: ReturnType<typeof createGamePanelShell>;
  const closePanel = (options?: { notify?: boolean }) => {
    closeBountyHuntingGamePanel(options);
    controller.abort();
    shell.panel.remove();
  };
  shell = createGamePanelShell({
    ariaLabel: 'Bounty Hunting',
    classNamePrefix: 'ytcq-bounty-hunting-game',
    closeLabel: 'Close',
    icon: document.createElement('span'),
    onClose: () => closePanel(),
    signal: controller.signal,
    subtitle: 'Player TEST',
    title: 'Bounty Hunting'
  });
  shellCleanups.push(() => {
    controller.abort();
    shell.panel.remove();
  });
  mountBountyHuntingGamePanel(
    shell,
    game,
    currentUserId,
    onAction,
    undefined,
    closePanel,
    controls
  );
}

function createShotPayload(
  messageId: string,
  bountyIds: string[] = [],
  messageTimestampUsec?: string
): Record<string, unknown> {
  return {
    messageId,
    observations: [{
      bountyIds,
      messageId,
      ...(messageTimestampUsec ? { messageTimestampUsec } : {})
    }]
  };
}

function createBountyHuntingGame(): PublicBountyHuntingGame {
  return {
    bounties: [
      {
        amount: 125,
        description: 'a message that mentions a user',
        id: 'mention-user',
        matcher: { kind: 'mention' }
      }
    ],
    bountyProviderUserId: 'host-user',
    gameId: 'game-bounty-hunting',
    gameType: 'bounty-hunting',
    phaseStartedAt: 100_000,
    players: {
      guest: {
        displayName: 'Them',
        userId: 'guest-user'
      },
      host: {
        displayName: 'You',
        userId: 'host-user'
      }
    },
    readyPlayers: {
      guest: true,
      host: true
    },
    roundEndsAt: 160_000,
    scores: {
      guest: 0,
      host: 0
    },
    status: 'active'
  };
}

function createPreparingBountyHuntingGame(): PublicBountyHuntingGame {
  return {
    ...createBountyHuntingGame(),
    bounties: [],
    readyPlayers: {},
    roundEndsAt: undefined,
    status: 'preparing'
  };
}

function createFinishedBountyHuntingGame(): PublicBountyHuntingGame {
  return {
    ...createBountyHuntingGame(),
    bounties: [
      createClaimedBounty('host-1', 'host'),
      createClaimedBounty('host-2', 'host'),
      createClaimedBounty('host-3', 'host'),
      createClaimedBounty('host-4', 'host'),
      createClaimedBounty('guest-1', 'guest'),
      createClaimedBounty('guest-2', 'guest')
    ],
    scores: {
      guest: 120,
      host: 270
    },
    status: 'finished',
    winnerUserId: 'host-user'
  };
}

function createCompactBounties(): PublicBountyHuntingGame['bounties'] {
  return [
    {
      amount: 50,
      description: 'a message by a moderator',
      id: 'moderator',
      matcher: { kind: 'moderatorAuthor' }
    },
    {
      amount: 50,
      description: 'a message with a number',
      id: 'number',
      matcher: { kind: 'number' }
    },
    {
      amount: 75,
      description: 'a message by the channel owner',
      id: 'owner',
      matcher: { kind: 'channelOwnerAuthor' }
    },
    {
      amount: 75,
      description: 'a message that mentions a user',
      id: 'mention',
      matcher: { kind: 'mention' }
    },
    {
      amount: 100,
      description: 'a message by a top fan',
      id: 'top-fan',
      matcher: { kind: 'topFanAuthor' }
    },
    {
      amount: 125,
      description: 'a message by a channel member',
      id: 'member',
      matcher: { kind: 'channelMemberAuthor' }
    }
  ];
}

function createClaimedBounty(
  id: string,
  role: 'guest' | 'host'
): PublicBountyHuntingGame['bounties'][number] {
  return {
    amount: 50,
    claim: {
      bountyId: id,
      claimedAt: 100_000,
      messageId: `message-${id}`,
      role,
      userId: `${role}-user`
    },
    description: 'a claimed message',
    id,
    matcher: { kind: 'mention' }
  };
}

function appendChatMessage(
  messageId: string,
  authorName: string,
  text: string,
  options: {
    author?: Partial<YouTubeChatAuthor>;
    kind?: 'paid' | 'text';
    runs?: YouTubeChatMessageRecord['runs'];
    timestampUsec?: string;
  } = {}
): HTMLElement {
  const message = document.createElement('yt-live-chat-text-message-renderer');
  message.setAttribute('data-message-id', messageId);

  const author = document.createElement('span');
  author.id = 'author-name';
  author.textContent = authorName;

  const body = document.createElement('span');
  body.id = 'message';
  body.textContent = text;

  const content = document.createElement('span');
  content.id = 'content';
  content.append(author, body);

  message.append(content);
  getChatItemsContainer().append(message);
  rememberTestChatFeedRecord({
    author: {
      badges: [],
      channelId: `channel-${messageId}`,
      name: authorName,
      ...options.author
    },
    id: messageId,
    kind: options.kind || 'text',
    ...(options.kind === 'paid' ? { paid: { amountText: '$5.00' } } : {}),
    plainText: text,
    runs: options.runs || [{ text, type: 'text' }],
    ...(options.timestampUsec ? { timestampUsec: options.timestampUsec } : {})
  });
  return message;
}

async function sendYouTubeMessageTimestamp(
  message: HTMLElement,
  timestampUsec: string
): Promise<void> {
  const id = message.getAttribute('data-message-id') || message.id;
  const existing = chatFeedMock.recordsById.get(id);
  if (!existing) throw new Error(`Missing test feed record for ${id}`);
  rememberTestChatFeedRecord({ ...existing, timestampUsec });
  await Promise.resolve();
}

function rememberTestChatFeedRecord(record: YouTubeChatMessageRecord): void {
  chatFeedMock.recordsById.delete(record.id);
  chatFeedMock.recordsById.set(record.id, record);
  if (chatFeedMock.onBatch) dispatchChatFeedActions([{ record, type: 'upsert' }]);
}

function dispatchChatFeedActions(actions: YouTubeChatFeedAction[]): void {
  chatFeedMock.onBatch?.({
    activity: 'new',
    actions,
    delivery: 'transport',
    receivedAt: Date.now(),
    sequence: 1,
    source: 'live'
  });
}

function runLatestBountyHuntingFrame(now: number): void {
  if (frameCallbacks.length > 0) {
    frameCallbacks[frameCallbacks.length - 1]?.(now);
    return;
  }

  try {
    vi.advanceTimersByTime(16);
  } catch {
    expect(frameCallbacks.length).toBeGreaterThan(0);
  }
}

function runPendingBountyHuntingFrames(now: number): void {
  const callbacks = frameCallbacks.splice(0);
  callbacks.forEach((callback) => callback(now));
}

function getChatItemsContainer(): HTMLElement {
  let items = document.querySelector<HTMLElement>('#item-scroller > #items');
  if (items) return items;

  const list = document.createElement('yt-live-chat-item-list-renderer');
  const scroller = document.createElement('div');
  scroller.id = 'item-scroller';
  scroller.getBoundingClientRect = () =>
    ({
      bottom: 448,
      height: 448,
      left: 0,
      right: 320,
      top: 0,
      width: 320,
      x: 0,
      y: 0,
      toJSON: () => ({})
    }) as DOMRect;
  items = document.createElement('div');
  items.id = 'items';
  scroller.append(items);
  list.append(scroller);
  document.body.append(list);
  return items;
}

function getBountyHuntingStartDivider(): HTMLElement {
  const divider = document.querySelector<HTMLElement>('.ytcq-bounty-hunting-start-divider');
  expect(divider).toBeInstanceOf(HTMLElement);
  return divider as HTMLElement;
}

function appendCurrentUserIdentity(authorName: string): HTMLElement {
  const identity = document.createElement('yt-live-chat-message-input-renderer');
  const author = document.createElement('span');
  author.id = 'author-name';
  author.textContent = authorName;
  identity.append(author);
  document.body.append(identity);
  return identity;
}

function getBountyHuntingCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>('.ytcq-bounty-hunting-canvas');
  expect(canvas).toBeInstanceOf(HTMLCanvasElement);
  return canvas as HTMLCanvasElement;
}

function createMockCanvasContext() {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    drawImage: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    fillText: vi.fn(),
    font: '',
    globalAlpha: 1,
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    lineTo: vi.fn(),
    lineWidth: 1,
    measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    save: vi.fn(),
    setTransform: vi.fn(),
    shadowBlur: 0,
    shadowColor: '',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    strokeStyle: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    translate: vi.fn()
  };
}

interface FakeAudioElement {
  currentTime: number;
  ended: boolean;
  paused: boolean;
  play: ReturnType<typeof vi.fn>;
  preload: string;
  src: string;
}

function createFakeAudioConstructor(audioElements: FakeAudioElement[]): typeof Audio {
  return class {
    currentTime = 0;
    ended = false;
    paused = true;
    play = vi.fn(() => {
      this.paused = false;
      return Promise.resolve();
    });
    preload = '';
    src: string;

    constructor(src = '') {
      this.src = src;
      audioElements.push(this);
    }

    cloneNode(): FakeAudioElement {
      const audio = new (createFakeAudioConstructor(audioElements) as unknown as new (
        src?: string
      ) => FakeAudioElement)(this.src);
      audio.preload = this.preload;
      return audio;
    }
  } as unknown as typeof Audio;
}

function getPlayedAudio(audioElements: FakeAudioElement[]): FakeAudioElement | undefined {
  return audioElements.find((audio) => audio.play.mock.calls.length > 0);
}

function createEmptyBountyHuntingAssetsForMock(): BountyHuntingAssets {
  return {
    avatarRing: null,
    bountyClaimedStamp: null,
    bountyDescBg: null,
    bountyOpenStamp: null,
    buttonBg: null,
    buttonBgDarker: null,
    divider: null,
    fontsReady: false,
    goldStar: null,
    liveScoreBg: null,
    logo: null,
    paperBg: null,
    roundOverBg: null,
    roundOverTitle: null,
    silverStar: null,
    titleDecorLeft: null,
    titleDecorRight: null,
    woodenRibbon: null
  };
}
