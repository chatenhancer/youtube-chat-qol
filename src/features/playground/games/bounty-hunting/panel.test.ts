import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const assetMock = vi.hoisted(() => ({
  emptyAssets: createEmptyBountyHuntingAssetsForMock(),
  getAssets: vi.fn()
}));

vi.mock('./assets', () => ({
  BOUNTY_HUNTING_FONT_BARNUM: 'YtcqBountyHuntingBarnum',
  BOUNTY_HUNTING_FONT_BARTLE: 'YtcqBountyHuntingBartle',
  BOUNTY_HUNTING_FONT_TEX_MEX: 'YtcqBountyHuntingTexMex',
  EMPTY_BOUNTY_HUNTING_ASSETS: assetMock.emptyAssets,
  getBountyHuntingAssets: assetMock.getAssets
}));

import { handleFeatureMessage } from '../../../../content/lifecycle';
import { initMentionDetection } from '../../../mention-detection';
import { createGamePanelShell } from '../panel-shell';
import {
  closeBountyHuntingGamePanel,
  openBountyHuntingGamePanel as mountBountyHuntingGamePanel,
  setBountyHuntingCompactMode,
  updateBountyHuntingGamePanel
} from './panel';
import type { GamePanelControls } from '../adapter';
import type { BountyHuntingAssets, PublicBountyHuntingGame } from './types';

let shellControllers: AbortController[] = [];
let shellCleanups: Array<() => void> = [];

describe('Bounty Hunting panel', () => {
  let audioElements: FakeAudioElement[];
  let context: ReturnType<typeof createMockCanvasContext>;
  let frameCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    document.body.replaceChildren();
    initMentionDetection();
    assetMock.getAssets.mockReset();
    assetMock.getAssets.mockResolvedValue(assetMock.emptyAssets);
    frameCallbacks = [];
    shellControllers = [];
    shellCleanups = [];
    audioElements = [];
    context = createMockCanvasContext();
    vi.stubGlobal('Audio', createFakeAudioConstructor(audioElements));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
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

  it('claims a matching bounty only when the player clicks the chat message', () => {
    const onAction = vi.fn();
    const game = createBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    const message = appendChatMessage('msg-1', '@Luna', 'look @Marco');

    handleFeatureMessage(message, { allowTranslate: true });
    updateBountyHuntingGamePanel(game, 'host-user');

    expect(onAction).toHaveBeenCalledWith('game-bounty-hunting', 'observeBountyMessage', {
      observations: [{
        bountyIds: ['mention-user'],
        messageId: 'msg-1'
      }]
    });
    expect(onAction).not.toHaveBeenCalledWith(
      'game-bounty-hunting',
      'claimBounty',
      expect.anything()
    );

    message.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onAction).toHaveBeenCalledWith('game-bounty-hunting', 'claimBounty', {
      bountyId: 'mention-user',
      messageId: 'msg-1'
    });
  });

  it('does not claim bounties from the current user authored chat messages', () => {
    appendCurrentUserIdentity('@CurrentViewer');
    initMentionDetection();
    const onAction = vi.fn();
    const game = createBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', onAction);
    const message = appendChatMessage('msg-own', '@CurrentViewer', 'look @Marco');

    handleFeatureMessage(message, { allowTranslate: true });
    updateBountyHuntingGamePanel(game, 'host-user');

    expect(onAction).toHaveBeenCalledWith('game-bounty-hunting', 'observeBountyMessage', {
      observations: [{
        bountyIds: ['mention-user'],
        messageId: 'msg-own'
      }]
    });

    message.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onAction).not.toHaveBeenCalledWith(
      'game-bounty-hunting',
      'claimBounty',
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

    handleFeatureMessage(message, { allowTranslate: true });
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
    const verifiedMessage = appendChatMessage('msg-verified', '@Luna', 'verified message');
    const verifiedBadge = document.createElement('yt-live-chat-author-badge-renderer');
    verifiedBadge.setAttribute('type', 'verified');
    verifiedMessage.append(verifiedBadge);
    const memberMessage = appendChatMessage('msg-member', '@Luna', 'member message');
    const memberBadge = document.createElement('yt-live-chat-author-badge-renderer');
    memberBadge.setAttribute('type', 'member');
    memberMessage.append(memberBadge);
    const moderatorMessage = appendChatMessage('msg-moderator', '@Luna', 'moderator message');
    const moderatorBadge = document.createElement('yt-live-chat-author-badge-renderer');
    moderatorBadge.setAttribute('type', 'moderator');
    moderatorMessage.append(moderatorBadge);
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
        expect.objectContaining({ id: 'has-number' }),
        expect.objectContaining({ id: 'question' }),
        expect.objectContaining({ id: 'verified-author' })
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

  it('ignores clicked messages that do not match open bounties', () => {
    const onAction = vi.fn();
    openBountyHuntingGamePanel(createBountyHuntingGame(), 'host-user', onAction);
    const message = appendChatMessage('msg-2', '@Luna', 'hello chat');

    message.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onAction).not.toHaveBeenCalled();
  });

  it('renders into a replay-sized backing canvas and display width', () => {
    openBountyHuntingGamePanel(createBountyHuntingGame(), 'host-user', vi.fn());

    const canvas = getBountyHuntingCanvas();

    expect(canvas.width).toBe(448);
    expect(canvas.height).toBe(448);
    expect(canvas.style.maxWidth).toBe('336px');
  });

  it('renders a compact hunt belt with score, timer, and bounty chips', () => {
    openBountyHuntingGamePanel({
      ...createBountyHuntingGame(),
      bounties: createCompactBounties()
    }, 'host-user', vi.fn());

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
    openBountyHuntingGamePanel({
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
    }, 'host-user', vi.fn());
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
    openBountyHuntingGamePanel({
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
    }, 'host-user', vi.fn());

    expect(context.fillText).toHaveBeenCalledWith('low bounty', 124, 166);
    expect(context.fillText).toHaveBeenCalledWith('mid bounty', 124, 208);
    expect(context.fillText).toHaveBeenCalledWith('high bounty', 124, 250);
  });

  it('dims claimed bounty rows in the expanded wanted list', () => {
    const descriptionAlpha = new Map<string, number>();
    context.fillText.mockImplementation((text: string) => {
      if (text === 'a claimed message' || text === 'an open message') {
        descriptionAlpha.set(text, context.globalAlpha);
      }
    });

    openBountyHuntingGamePanel({
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
    }, 'host-user', vi.fn());

    expect(descriptionAlpha.get('a claimed message')).toBe(0.66);
    expect(descriptionAlpha.get('an open message')).toBe(1);
  });

  it('uses the title color for the timer until the active round starts', () => {
    const timerColors: string[] = [];
    context.fillText.mockImplementation((text: string, x: number, y: number) => {
      if (text === '00:60' && x === 224 && y === 103) timerColors.push(context.fillStyle);
    });
    openBountyHuntingGamePanel({
      ...createBountyHuntingGame(),
      roundEndsAt: undefined,
      status: 'ready'
    }, 'host-user', vi.fn());

    expect(timerColors.at(-1)).toBe('#352c24');

    updateBountyHuntingGamePanel(createBountyHuntingGame(), 'host-user');

    expect(timerColors.at(-1)).toBe('#8f1d25');
  });

  it('pulses and flashes the timer once when the active round starts', () => {
    const timerDraws: Array<{ color: string; font: string; shadowColor: string; text: string }> = [];
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

    expect(timerDraws).toEqual(expect.arrayContaining([
      expect.objectContaining({
        color: '#f7d88a',
        font: expect.stringContaining('30px'),
        shadowColor: 'rgba(255, 236, 158, 0.95)'
      })
    ]));
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

    const secondRowMoveIndex = context.moveTo.mock.calls.findIndex((call) =>
      call[0] === 45 && call[1] === 188
    );
    const firstClaimAvatarIndex = context.arc.mock.calls.findIndex((call) =>
      call[0] === 386 && call[1] === 180 && call[2] === 15
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
    expect(context.fillText).toHaveBeenCalledWith('CLAIMED', 304, 116);
    expect(context.fillText).toHaveBeenCalledWith('YOU', 136, 164);
    expect(context.fillText).toHaveBeenCalledWith('4', 304, 164);
    expect(context.fillText).toHaveBeenCalledWith('THEM', 136, 234);
    expect(context.fillText).toHaveBeenCalledWith('2', 304, 234);
    expect(context.fillText).toHaveBeenCalledWith('WINNER: YOU', 224, 318);
    expect(context.moveTo).toHaveBeenCalledWith(92, 136);
    expect(context.lineTo).toHaveBeenCalledWith(420, 136);
  });

  it('draws the round over loading button higher with cream text', () => {
    const loadingLabels: Array<{ color: string; x: number; y: number }> = [];
    context.fillText.mockImplementation((text: string, x: number, y: number) => {
      if (text === 'LOADING') loadingLabels.push({ color: context.fillStyle, x, y });
    });

    openBountyHuntingGamePanel({
      ...createBountyHuntingGame(),
      roundEndsAt: undefined,
      status: 'roundOver'
    }, 'host-user', vi.fn());

    expect(loadingLabels.at(-1)).toEqual({
      color: '#F4DAA5',
      x: 224,
      y: 411
    });
  });

  it('draws a spinner on the logo loading screen', () => {
    openBountyHuntingGamePanel(createPreparingBountyHuntingGame(), 'host-user', vi.fn());

    expect(context.arc).toHaveBeenCalledWith(224, 424, 9, 0, Math.PI * 2);
    expect(context.stroke).toHaveBeenCalled();
  });

  it('flashes the ready button when another player turns ready', () => {
    const game = {
      ...createBountyHuntingGame(),
      readyPlayers: {
        guest: false,
        host: false
      },
      status: 'ready' as const
    };
    openBountyHuntingGamePanel(game, 'host-user', vi.fn());
    expect(context.shadowColor).toBe('');

    updateBountyHuntingGamePanel({
      ...game,
      readyPlayers: {
        guest: true,
        host: false
      }
    }, 'host-user');

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

    updateBountyHuntingGamePanel({
      ...game,
      readyPlayers: {
        guest: true,
        host: false
      }
    }, 'host-user');

    const readyButtonDraws = context.drawImage.mock.calls.filter((call) =>
      call[0] === buttonBg && call[1] === 142 && call[2] === 394 && call[3] === 164 && call[4] === 58
    );
    expect(readyButtonDraws).toHaveLength(3);
  });

  it('plays a ricochet when a bounty is claimed', () => {
    const game = createBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', vi.fn());

    updateBountyHuntingGamePanel({
      ...game,
      bounties: [createClaimedBounty('mention-user', 'guest')],
      scores: {
        guest: 125,
        host: 0
      }
    }, 'host-user');

    expect(getPlayedAudio(audioElements)?.src).toContain('claim-ricochet-01.mp3');
  });

  it('plays the sting when the round over screen appears', () => {
    const game = createBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', vi.fn());

    updateBountyHuntingGamePanel({
      ...game,
      phaseStartedAt: 103_000,
      roundEndsAt: undefined,
      status: 'roundOver'
    }, 'host-user');

    expect(getPlayedAudio(audioElements)?.src).toContain('sting.mp3');
  });

  it('requests compact top-center placement when the active round starts', () => {
    const controls = {
      setCompactMode: vi.fn(),
      setPosition: vi.fn()
    };
    const game = {
      ...createBountyHuntingGame(),
      phaseStartedAt: 100_000,
      roundEndsAt: undefined,
      status: 'countdown' as const
    };
    openBountyHuntingGamePanel(game, 'host-user', vi.fn(), controls);

    updateBountyHuntingGamePanel({
      ...game,
      phaseStartedAt: 103_000,
      roundEndsAt: 163_000,
      status: 'active'
    }, 'host-user');

    expect(controls.setCompactMode).toHaveBeenCalledWith(true);
    expect(controls.setPosition).toHaveBeenCalledWith({ placement: 'top-center' });
  });

  it('expands back to the round over page when the active round ends', () => {
    const controls = {
      setCompactMode: vi.fn(),
      setPosition: vi.fn()
    };
    const game = createBountyHuntingGame();
    openBountyHuntingGamePanel(game, 'host-user', vi.fn(), controls);

    updateBountyHuntingGamePanel({
      ...game,
      phaseStartedAt: 160_000,
      roundEndsAt: undefined,
      status: 'roundOver'
    }, 'host-user');

    expect(controls.setCompactMode).toHaveBeenCalledWith(false);
    expect(controls.setPosition).not.toHaveBeenCalled();
  });

  it('shows a pre-round countdown before starting the round', () => {
    const onAction = vi.fn();
    const game = {
      ...createBountyHuntingGame(),
      phaseStartedAt: 100_000,
      roundEndsAt: undefined,
      status: 'countdown' as const
    };

    openBountyHuntingGamePanel(game, 'host-user', onAction);

    const countdownCircleIndex = context.arc.mock.calls.findIndex((call) =>
      call[0] === 224 && call[1] === 224 && call[2] === 57
    );
    expect(countdownCircleIndex).toBeGreaterThanOrEqual(0);
    const countdownCircleOrder = context.arc.mock.invocationCallOrder[countdownCircleIndex];
    expect(context.stroke.mock.invocationCallOrder.some((order) => order > countdownCircleOrder)).toBe(false);
    expect(context.fillText).toHaveBeenCalledWith('3', 224, 228);

    vi.mocked(Date.now).mockReturnValue(103_000);
    frameCallbacks[0]?.(103_000);

    expect(onAction).toHaveBeenCalledWith('game-bounty-hunting', 'startRound');
  });

  it('plays the final ten second clock tick once', () => {
    const game = {
      ...createBountyHuntingGame(),
      phaseStartedAt: 50_500
    };
    openBountyHuntingGamePanel(game, 'host-user', vi.fn());

    frameCallbacks[0]?.(100_500);
    frameCallbacks[1]?.(101_000);

    const playedTicks = audioElements.filter((audio) =>
      audio.src.includes('final-10-clock-tick.mp3') && audio.play.mock.calls.length > 0
    );
    expect(playedTicks).toHaveLength(1);
  });

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

    getBountyHuntingCanvas().dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      key: 'Enter'
    }));

    expect(onAction).toHaveBeenCalledWith('game-bounty-hunting', 'ready');
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

    getBountyHuntingCanvas().dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: 224,
      clientY: 32
    }));

    expect(onAction).toHaveBeenCalledWith('game-bounty-hunting', 'ready');
  });
});

function openBountyHuntingGamePanel(
  game: PublicBountyHuntingGame,
  currentUserId: string,
  onAction: (gameId: string, action: string, payload?: Record<string, unknown>) => void,
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
  mountBountyHuntingGamePanel(shell, game, currentUserId, onAction, undefined, closePanel, controls);
}

function createBountyHuntingGame(): PublicBountyHuntingGame {
  return {
    bounties: [{
      amount: 125,
      description: 'a message that mentions a user',
      id: 'mention-user',
      matcher: { kind: 'mention' }
    }],
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

function createClaimedBounty(id: string, role: 'guest' | 'host'): PublicBountyHuntingGame['bounties'][number] {
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

function appendChatMessage(messageId: string, authorName: string, text: string): HTMLElement {
  const message = document.createElement('yt-live-chat-text-message-renderer') as HTMLElement & {
    data?: {
      authorName: { simpleText: string };
      id: string;
      message: { runs: Array<{ text: string }> };
    };
  };
  message.setAttribute('data-message-id', messageId);
  message.data = {
    authorName: { simpleText: authorName },
    id: messageId,
    message: { runs: [{ text }] }
  };

  const author = document.createElement('span');
  author.id = 'author-name';
  author.textContent = authorName;

  const body = document.createElement('span');
  body.id = 'message';
  body.textContent = text;

  message.append(author, body);
  document.body.append(message);
  return message;
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
      const audio = new (createFakeAudioConstructor(audioElements) as unknown as new (src?: string) => FakeAudioElement)(this.src);
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
