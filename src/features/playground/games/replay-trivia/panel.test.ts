import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const generateReplayTriviaQuestionsMock = vi.hoisted(() => vi.fn());
const getReplayTriviaAssetsMock = vi.hoisted(() => vi.fn());

vi.mock('./client', () => ({
  generateReplayTriviaQuestions: generateReplayTriviaQuestionsMock
}));

vi.mock('./assets', () => ({
  EMPTY_REPLAY_TRIVIA_ASSETS: createEmptyReplayTriviaAssets(),
  getReplayTriviaAssets: getReplayTriviaAssetsMock
}));

import {
  closeReplayTriviaGamePanel,
  getActiveReplayTriviaGameId,
  getReplayTriviaGamePanelOverlay,
  isPublicReplayTriviaGame,
  isReplayTriviaGamePanelOpen,
  openReplayTriviaGamePanel,
  updateReplayTriviaGamePanel
} from './panel';
import {
  ANSWER_TIME_MS,
  ANSWER_UI_DELAY_MS,
  COUNTDOWN_MS,
  REVEAL_MS,
  SCORE_FLAP_ANIMATION_MS,
  SCORE_MS,
  STAMP_ANIMATION_MS
} from './constants';
import type { PublicReplayTriviaGame } from './types';

describe('Replay Trivia panel', () => {
  let context: ReturnType<typeof createMockCanvasContext>;
  let frameCallbacks: FrameRequestCallback[];
  let now: number;

  beforeEach(() => {
    document.body.replaceChildren();
    generateReplayTriviaQuestionsMock.mockReset();
    getReplayTriviaAssetsMock.mockReset();
    getReplayTriviaAssetsMock.mockResolvedValue(createEmptyReplayTriviaAssets());
    frameCallbacks = [];
    now = 1;
    context = createMockCanvasContext();
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
    vi.spyOn(window.performance, 'now').mockImplementation(() => now);
    vi.spyOn(Date, 'now').mockImplementation(() => 100_000);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    closeReplayTriviaGamePanel({ notify: false });
    vi.restoreAllMocks();
  });

  it('tracks open state and active game id while the panel is visible', () => {
    expect(isReplayTriviaGamePanelOpen()).toBe(false);
    expect(getActiveReplayTriviaGameId()).toBe('');

    openReplayTriviaGamePanel(createReplayTriviaGame(), 'host-user', vi.fn());

    expect(isReplayTriviaGamePanelOpen()).toBe(true);
    expect(getActiveReplayTriviaGameId()).toBe('game-replay-trivia');
  });

  it('validates public Replay Trivia game shapes defensively', () => {
    expect(isPublicReplayTriviaGame(createReplayTriviaGame())).toBe(true);
    expect(isPublicReplayTriviaGame(null)).toBe(false);
    expect(isPublicReplayTriviaGame({})).toBe(false);
    expect(isPublicReplayTriviaGame({
      ...createReplayTriviaGame(),
      gameId: 123
    })).toBe(false);
    expect(isPublicReplayTriviaGame({
      ...createReplayTriviaGame(),
      gameType: 'chess'
    })).toBe(false);
    expect(isPublicReplayTriviaGame({
      ...createReplayTriviaGame(),
      players: {
        guest: { displayName: 'Guest', userId: '' },
        host: { displayName: 'Host', userId: 'host-user' }
      }
    })).toBe(false);
  });

  it('renders a fallback when the canvas context is unavailable', () => {
    const visibilityChanged = vi.fn();
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);

    openReplayTriviaGamePanel(createReplayTriviaGame(), 'host-user', vi.fn(), visibilityChanged);

    expect(document.querySelector('.ytcq-replay-trivia-game-fallback')?.textContent).toBe('Canvas is unavailable.');
    expect(isReplayTriviaGamePanelOpen()).toBe(true);

    closeReplayTriviaGamePanel();

    expect(visibilityChanged).toHaveBeenCalledTimes(2);
    expect(isReplayTriviaGamePanelOpen()).toBe(false);
  });

  it('renders a fallback when canvas context creation throws', () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(() => {
      throw new Error('canvas blocked');
    });

    openReplayTriviaGamePanel(createReplayTriviaGame(), 'host-user', vi.fn());

    expect(document.querySelector('.ytcq-replay-trivia-game-fallback')?.textContent).toBe('Canvas is unavailable.');
    expect(getReplayTriviaGamePanelOverlay()).toBeNull();
  });

  it('closes without notifying visibility listeners when notify is false', () => {
    const visibilityChanged = vi.fn();

    openReplayTriviaGamePanel(createReplayTriviaGame(), 'host-user', vi.fn(), visibilityChanged);
    expect(visibilityChanged).toHaveBeenCalledOnce();

    closeReplayTriviaGamePanel({ notify: false });

    expect(visibilityChanged).toHaveBeenCalledOnce();
  });

  it('closes from the shared panel header button', () => {
    const visibilityChanged = vi.fn();
    openReplayTriviaGamePanel(createReplayTriviaGame(), 'host-user', vi.fn(), visibilityChanged);

    document.querySelector<HTMLButtonElement>('.ytcq-replay-trivia-game-close')?.click();

    expect(isReplayTriviaGamePanelOpen()).toBe(false);
    expect(visibilityChanged).toHaveBeenCalledTimes(2);
  });

  it('requests and uses a generation token for the question provider', async () => {
    const onAction = vi.fn();
    generateReplayTriviaQuestionsMock.mockResolvedValue({
      generatedAt: '2026-06-16T00:00:00.000Z',
      languageCode: 'en',
      model: 'test-model',
      questions: [createGeneratedQuestion()],
      transcriptWindow: {
        endSeconds: 120,
        items: [],
        startSeconds: 60
      }
    });

    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'preparing' }), 'host-user', onAction);

    expect(onAction).toHaveBeenCalledWith('game-replay-trivia', 'requestGenerationToken');

    updateReplayTriviaGamePanel(
      createReplayTriviaGame({ status: 'preparing' }),
      'host-user',
      {
        expiresAt: 101_000,
        gameId: 'game-replay-trivia',
        generationToken: 'token-123456'
      }
    );
    await flushPromises();

    expect(generateReplayTriviaQuestionsMock).toHaveBeenCalledWith({
      gameId: 'game-replay-trivia',
      generationToken: 'token-123456',
      questionCount: 10
    });
    expect(onAction).toHaveBeenCalledWith('game-replay-trivia', 'submitQuestions', {
      questions: [{
        choices: ['A', 'B', 'C', 'D'],
        correctChoiceIndex: 2,
        friendIntro: 'can you help me?',
        id: 'generated-q',
        prompt: 'Which answer is correct?',
        rightReply: 'you saved me',
        wrongReply: 'that was not it'
      }]
    });
  });

  it('does not generate questions for waiting players or expired tokens', () => {
    const onAction = vi.fn();

    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'preparing' }), 'guest-user', onAction);

    expect(onAction).not.toHaveBeenCalled();
    closeReplayTriviaGamePanel({ notify: false });

    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'preparing' }), 'host-user', onAction);
    onAction.mockClear();

    updateReplayTriviaGamePanel(
      createReplayTriviaGame({ status: 'preparing' }),
      'host-user',
      {
        expiresAt: 99_999,
        gameId: 'game-replay-trivia',
        generationToken: 'expired-token'
      }
    );

    expect(generateReplayTriviaQuestionsMock).not.toHaveBeenCalled();
    expect(onAction).toHaveBeenCalledWith('game-replay-trivia', 'requestGenerationToken');
  });

  it('does not repeat generation-token requests while one is pending', () => {
    const onAction = vi.fn();

    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'preparing' }), 'host-user', onAction);
    updateReplayTriviaGamePanel(createReplayTriviaGame({ status: 'preparing' }), 'host-user');
    updateReplayTriviaGamePanel(createReplayTriviaGame({ status: 'preparing' }), 'host-user', {
      expiresAt: 101_000,
      gameId: 'other-game',
      generationToken: 'wrong-game-token'
    });

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith('game-replay-trivia', 'requestGenerationToken');
    expect(generateReplayTriviaQuestionsMock).not.toHaveBeenCalled();
  });

  it('ignores stale updates and clears preparation errors once play starts', () => {
    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'preparing' }), 'host-user', vi.fn());
    updateReplayTriviaGamePanel(
      createReplayTriviaGame({ status: 'preparing' }),
      'host-user',
      undefined,
      'Replay Trivia service is unavailable.'
    );
    context.fillText.mockClear();

    updateReplayTriviaGamePanel(createReplayTriviaGame({
      gameId: 'other-game',
      status: 'preparing'
    }), 'host-user');
    expect(drawnText()).toBe('');

    updateReplayTriviaGamePanel(createReplayTriviaGame({ status: 'countdown' }), 'host-user');
    context.fillText.mockClear();
    updateReplayTriviaGamePanel(createReplayTriviaGame({ status: 'countdown' }), 'host-user');

    expect(drawnText()).not.toContain('Replay Trivia service is unavailable.');
  });

  it('shows a generation failure from the question service', async () => {
    const onAction = vi.fn();
    generateReplayTriviaQuestionsMock.mockRejectedValueOnce(new Error('Replay Trivia service is unavailable.'));

    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'preparing' }), 'host-user', onAction);
    updateReplayTriviaGamePanel(
      createReplayTriviaGame({ status: 'preparing' }),
      'host-user',
      {
        expiresAt: 101_000,
        gameId: 'game-replay-trivia',
        generationToken: 'token-123456'
      }
    );
    await flushPromises();
    context.fillText.mockClear();

    updateReplayTriviaGamePanel(createReplayTriviaGame({ status: 'preparing' }), 'host-user');

    expect(drawnText()).toContain('Replay Trivia service is unavailable.');

    expect(generateReplayTriviaQuestionsMock).toHaveBeenCalledTimes(1);
  });

  it('shows default and permanent preparation failures', async () => {
    const onAction = vi.fn();
    generateReplayTriviaQuestionsMock.mockRejectedValueOnce('plain string failure');

    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'preparing' }), 'host-user', onAction);
    updateReplayTriviaGamePanel(
      createReplayTriviaGame({ status: 'preparing' }),
      'host-user',
      {
        expiresAt: 101_000,
        gameId: 'game-replay-trivia',
        generationToken: 'token-123456'
      }
    );
    await flushPromises();
    context.fillText.mockClear();

    updateReplayTriviaGamePanel(createReplayTriviaGame({ status: 'preparing' }), 'host-user');
    expect(drawnText()).toContain('plain string failure');
    closeReplayTriviaGamePanel({ notify: false });

    generateReplayTriviaQuestionsMock.mockRejectedValueOnce({});
    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'preparing' }), 'host-user', onAction);
    updateReplayTriviaGamePanel(
      createReplayTriviaGame({ status: 'preparing' }),
      'host-user',
      {
        expiresAt: 101_000,
        gameId: 'game-replay-trivia',
        generationToken: 'token-abcdef'
      }
    );
    await flushPromises();
    context.fillText.mockClear();

    updateReplayTriviaGamePanel(createReplayTriviaGame({ status: 'preparing' }), 'host-user');
    expect(drawnText()).toContain('Could not load trivia.');
  });

  it('ignores stale question generation and asset completions after the panel changes', async () => {
    const onAction = vi.fn();
    let resolveQuestions: (value: unknown) => void = () => undefined;
    let resolveAssets: (value: unknown) => void = () => undefined;
    generateReplayTriviaQuestionsMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveQuestions = resolve;
    }));
    getReplayTriviaAssetsMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveAssets = resolve;
    }));

    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'preparing' }), 'host-user', onAction);
    updateReplayTriviaGamePanel(
      createReplayTriviaGame({ status: 'preparing' }),
      'host-user',
      {
        expiresAt: 101_000,
        gameId: 'game-replay-trivia',
        generationToken: 'token-123456'
      }
    );
    closeReplayTriviaGamePanel({ notify: false });
    openReplayTriviaGamePanel(createReplayTriviaGame({ gameId: 'other-game', status: 'question' }), 'host-user', onAction);

    resolveQuestions({
      generatedAt: '2026-06-16T00:00:00.000Z',
      languageCode: 'en',
      model: 'test-model',
      questions: [createGeneratedQuestion()],
      transcriptWindow: {
        endSeconds: 120,
        items: [],
        startSeconds: 60
      }
    });
    resolveAssets(createLoadedReplayTriviaAssets());
    await flushPromises();

    expect(onAction).not.toHaveBeenCalledWith('game-replay-trivia', 'submitQuestions', expect.anything());
  });

  it('continues rendering when optional assets fail to load', async () => {
    getReplayTriviaAssetsMock.mockRejectedValueOnce(new Error('asset load failed'));

    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'question' }), 'host-user', vi.fn());
    await flushPromises();

    expect(context.fillRect).toHaveBeenCalled();
  });

  it('renders the opponent answer when revealed after the question phase', () => {
    openReplayTriviaGamePanel(
      createReplayTriviaGame({
        answers: {
          host: { answered: true }
        },
        status: 'question'
      }),
      'host-user',
      vi.fn()
    );
    context.fillText.mockClear();

    updateReplayTriviaGamePanel(createReplayTriviaGame({
      answers: {
        guest: { answered: true, choiceIndex: 1, correct: false },
        host: { answered: true, choiceIndex: 0, correct: true }
      },
      currentQuestion: {
        ...createReplayTriviaQuestion(),
        correctChoiceIndex: 0
      },
      status: 'reveal'
    }), 'host-user');

    const drawnText = context.fillText.mock.calls.map(([text]) => String(text));
    expect(drawnText).toContain('The Last of Us');
    expect(drawnText).toContain('God of War');
    expect(drawnText).not.toContain('No answer');
  });

  it('accepts a keyboard answer once the question UI is ready', () => {
    const onAction = vi.fn();
    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'question' }), 'host-user', onAction);
    setNow(ANSWER_UI_DELAY_MS + 25);
    updateReplayTriviaGamePanel(createReplayTriviaGame({ status: 'question' }), 'host-user');

    const canvas = getCanvas();
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: '2'
    });
    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onAction).toHaveBeenCalledWith('game-replay-trivia', 'answer', { choiceIndex: 1 });
    expect(canvas.style.cursor).not.toBe('pointer');
  });

  it('ignores keyboard answers before the UI is ready, after answering, or for unsupported keys', () => {
    const onAction = vi.fn();
    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'question' }), 'host-user', onAction);
    getCanvas().dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: '1'
    }));
    expect(onAction).not.toHaveBeenCalled();

    setNow(ANSWER_UI_DELAY_MS + 25);
    updateReplayTriviaGamePanel(createReplayTriviaGame({
      answers: {
        host: { answered: true, choiceIndex: 0, correct: true }
      },
      status: 'question'
    }), 'host-user');
    getCanvas().dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: '2'
    }));
    getCanvas().dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'x'
    }));

    expect(onAction).not.toHaveBeenCalled();
  });

  it('ignores answer input while a blocking status is visible', () => {
    const onAction = vi.fn();
    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'question' }), 'host-user', onAction);
    setNow(ANSWER_UI_DELAY_MS + 25);
    updateReplayTriviaGamePanel(createReplayTriviaGame({ status: 'question' }), 'host-user');
    getReplayTriviaGamePanelOverlay()?.show({
      key: 'connection:lost',
      message: 'Connection lost.',
      owner: 'system',
      temporary: false
    });

    getCanvas().dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: '1'
    }));

    expect(onAction).not.toHaveBeenCalledWith('game-replay-trivia', 'answer', expect.anything());
  });

  it('updates hover state and accepts a clicked answer', () => {
    const onAction = vi.fn();
    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'question' }), 'host-user', onAction);
    setNow(ANSWER_UI_DELAY_MS + 25);
    updateReplayTriviaGamePanel(createReplayTriviaGame({ status: 'question' }), 'host-user');

    const canvas = getCanvas();
    canvas.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 40,
      clientY: 260
    }));
    expect(canvas.style.cursor).toBe('pointer');
    context.fillRect.mockClear();
    canvas.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 40,
      clientY: 260
    }));
    expect(context.fillRect).not.toHaveBeenCalled();

    canvas.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: 40,
      clientY: 260
    }));

    expect(onAction).toHaveBeenCalledWith('game-replay-trivia', 'answer', { choiceIndex: 2 });
    canvas.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 40,
      clientY: 260
    }));
    canvas.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: 40,
      clientY: 260
    }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: '3'
    }));
    expect(onAction).toHaveBeenCalledTimes(1);

    canvas.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(canvas.style.cursor).not.toBe('pointer');
  });

  it('ignores answer controls outside the question phase', () => {
    const onAction = vi.fn();
    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'countdown' }), 'host-user', onAction);
    const canvas = getCanvas();

    canvas.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 40,
      clientY: 260
    }));
    canvas.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: 40,
      clientY: 260
    }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: '1'
    }));

    expect(canvas.style.cursor).toBe('');
    expect(onAction).not.toHaveBeenCalled();
  });

  it('resets answer hover when moving outside answer hitboxes', () => {
    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'question' }), 'host-user', vi.fn());
    setNow(ANSWER_UI_DELAY_MS + 25);
    updateReplayTriviaGamePanel(createReplayTriviaGame({ status: 'question' }), 'host-user');

    const canvas = getCanvas();
    canvas.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 40,
      clientY: 260
    }));
    expect(canvas.style.cursor).toBe('pointer');

    canvas.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 430,
      clientY: 24
    }));

    expect(canvas.style.cursor).toBe('default');
  });

  it('ignores pointer answers outside hitboxes and resets blocking hover state', () => {
    const onAction = vi.fn();
    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'question' }), 'host-user', onAction);
    setNow(ANSWER_UI_DELAY_MS + 25);
    updateReplayTriviaGamePanel(createReplayTriviaGame({ status: 'question' }), 'host-user');
    const canvas = getCanvas();

    canvas.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 40,
      clientY: 260
    }));
    expect(canvas.style.cursor).toBe('pointer');

    getReplayTriviaGamePanelOverlay()?.show({
      key: 'connection:lost',
      message: 'Connection lost.',
      owner: 'system',
      temporary: false
    });
    canvas.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 40,
      clientY: 260
    }));
    canvas.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: 1,
      clientY: 1
    }));

    expect(canvas.style.cursor).toBe('default');
    expect(onAction).not.toHaveBeenCalledWith('game-replay-trivia', 'answer', expect.anything());
  });

  it('auto-advances provider-owned phases once their timers expire', () => {
    const onAction = vi.fn();

    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'countdown' }), 'host-user', onAction);
    runNextFrame(COUNTDOWN_MS + 1);
    runNextFrame(COUNTDOWN_MS + 50);

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith('game-replay-trivia', 'advance', undefined);
    closeReplayTriviaGamePanel({ notify: false });
    onAction.mockClear();
    setNow(1);

    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'question' }), 'host-user', onAction);
    runNextFrame(ANSWER_UI_DELAY_MS + ANSWER_TIME_MS + 1);

    expect(onAction).toHaveBeenCalledWith('game-replay-trivia', 'timeout', undefined);
    closeReplayTriviaGamePanel({ notify: false });
    onAction.mockClear();
    setNow(1);

    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'reveal' }), 'host-user', onAction);
    runNextFrame(REVEAL_MS + 1);

    expect(onAction).toHaveBeenCalledWith('game-replay-trivia', 'advance', undefined);
    closeReplayTriviaGamePanel({ notify: false });
    onAction.mockClear();
    setNow(1);

    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'score' }), 'host-user', onAction);
    runNextFrame(SCORE_MS + 1);

    expect(onAction).toHaveBeenCalledWith('game-replay-trivia', 'advance', undefined);
  });

  it('lets an already queued frame exit cleanly after the panel closes', () => {
    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'question' }), 'host-user', vi.fn());
    const callback = frameCallbacks.shift();
    closeReplayTriviaGamePanel({ notify: false });

    expect(() => callback?.(ANSWER_UI_DELAY_MS + 1)).not.toThrow();
  });

  it('renders alternate countdown number animation frames', () => {
    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'countdown' }), 'host-user', vi.fn());
    context.fillText.mockClear();

    runNextFrame(1_050);

    expect(drawnText()).toContain('2');
  });

  it('does not auto-advance phases for non-provider players', () => {
    const onAction = vi.fn();

    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'countdown' }), 'guest-user', onAction);
    runNextFrame(COUNTDOWN_MS + 1);

    expect(onAction).not.toHaveBeenCalledWith('game-replay-trivia', 'advance');
  });

  it('renders score outcomes for user, opponent, and nobody-correct rounds', () => {
    openReplayTriviaGamePanel(createReplayTriviaGame({
      answers: {
        guest: { answered: true, choiceIndex: 1, correct: false },
        host: { answered: true, choiceIndex: 0, correct: true }
      },
      currentQuestion: {
        ...createReplayTriviaQuestion(),
        correctChoiceIndex: 0
      },
      scores: {
        guest: 0,
        host: 1
      },
      status: 'score'
    }), 'host-user', vi.fn());

    expect(drawnText()).toContain('You got this one right');
    closeReplayTriviaGamePanel({ notify: false });

    openReplayTriviaGamePanel(createReplayTriviaGame({
      answers: {
        guest: { answered: true, choiceIndex: 1, correct: true },
        host: { answered: true, choiceIndex: 0, correct: false }
      },
      currentQuestion: {
        ...createReplayTriviaQuestion(),
        correctChoiceIndex: 1
      },
      players: {
        guest: {
          displayName: 'Player Firefox With Long Name',
          userId: 'guest-user'
        },
        host: {
          displayName: 'Player Chrome',
          userId: 'host-user'
        }
      },
      scores: {
        guest: 1,
        host: 0
      },
      status: 'score'
    }), 'host-user', vi.fn());

    expect(drawnText()).toContain('Player Firefox With Long Name');
    closeReplayTriviaGamePanel({ notify: false });

    openReplayTriviaGamePanel(createReplayTriviaGame({
      answers: {
        guest: { answered: true, choiceIndex: 1, correct: false },
        host: { answered: true, choiceIndex: 2, correct: false }
      },
      currentQuestion: {
        ...createReplayTriviaQuestion(),
        correctChoiceIndex: 0
      },
      status: 'score'
    }), 'host-user', vi.fn());

    expect(drawnText()).toContain('Nobody got this one right');
  });

  it('renders completed score and final stamp animation states', async () => {
    const assets = createLoadedReplayTriviaAssets();
    getReplayTriviaAssetsMock.mockResolvedValue(assets);
    const scoreGame = createReplayTriviaGame({
      answers: {
        guest: { answered: true, choiceIndex: 1, correct: false },
        host: { answered: true, choiceIndex: 0, correct: true }
      },
      currentQuestion: {
        ...createReplayTriviaQuestion(),
        correctChoiceIndex: 0
      },
      scores: {
        guest: 0,
        host: 1
      },
      status: 'score'
    });
    openReplayTriviaGamePanel(scoreGame, 'host-user', vi.fn());
    await flushPromises();
    context.stroke.mockClear();

    setNow(SCORE_FLAP_ANIMATION_MS + 1);
    updateReplayTriviaGamePanel(scoreGame, 'host-user');

    expect(drawnText()).toContain('You got this one right');
    closeReplayTriviaGamePanel({ notify: false });

    const finishedGame = createReplayTriviaGame({
      scores: {
        guest: 0,
        host: 3
      },
      status: 'finished'
    });
    openReplayTriviaGamePanel(finishedGame, 'host-user', vi.fn());
    await flushPromises();
    context.drawImage.mockClear();
    context.fillRect.mockClear();

    setNow(STAMP_ANIMATION_MS + 3200);
    updateReplayTriviaGamePanel(finishedGame, 'host-user');

    expect(context.drawImage).toHaveBeenCalledWith(assets.bestie, expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number));
    expect(context.fillRect).toHaveBeenCalled();
  });

  it('renders finished results and closes from keyboard or canvas controls', () => {
    const onAction = vi.fn();
    openReplayTriviaGamePanel(createReplayTriviaGame({
      scores: {
        guest: 1,
        host: 1
      },
      status: 'finished'
    }), 'host-user', onAction);

    expect(drawnText()).toContain('It\'s a tie!');
    getCanvas().dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter'
    }));

    expect(onAction).toHaveBeenCalledWith('game-replay-trivia', 'leave');
    expect(isReplayTriviaGamePanelOpen()).toBe(false);

    openReplayTriviaGamePanel(createReplayTriviaGame({
      scores: {
        guest: 1,
        host: 3
      },
      status: 'finished'
    }), 'host-user', onAction);
    setNow(STAMP_ANIMATION_MS + 600);
    updateReplayTriviaGamePanel(createReplayTriviaGame({
      scores: {
        guest: 1,
        host: 3
      },
      status: 'finished'
    }), 'host-user');

    expect(drawnText()).toContain('You');
    expect(drawnText()).toContain('won this match!');

    const canvas = getCanvas();
    canvas.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 224,
      clientY: 350
    }));
    expect(canvas.style.cursor).toBe('pointer');
    canvas.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: 224,
      clientY: 350
    }));

    expect(onAction).toHaveBeenCalledWith('game-replay-trivia', 'leave');
    closeReplayTriviaGamePanel({ notify: false });

    openReplayTriviaGamePanel(createReplayTriviaGame({
      players: {
        guest: {
          displayName: 'Player Firefox With Long Name',
          userId: 'guest-user'
        },
        host: {
          displayName: 'Player Chrome',
          userId: 'host-user'
        }
      },
      scores: {
        guest: 2,
        host: 0
      },
      status: 'finished'
    }), 'host-user', onAction);

    expect(drawnText()).toContain('P Firef...');
    expect(drawnText()).toContain('won this match!');
  });

  it('ignores finished close controls outside the close hitbox and supports Space', () => {
    const onAction = vi.fn();
    openReplayTriviaGamePanel(createReplayTriviaGame({
      status: 'finished'
    }), 'host-user', onAction);
    const canvas = getCanvas();

    canvas.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 5,
      clientY: 5
    }));
    canvas.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: 5,
      clientY: 5
    }));
    expect(canvas.style.cursor).not.toBe('pointer');
    expect(onAction).not.toHaveBeenCalledWith('game-replay-trivia', 'leave');

    const space = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: ' '
    });
    canvas.dispatchEvent(space);

    expect(space.defaultPrevented).toBe(true);
    expect(onAction).toHaveBeenCalledWith('game-replay-trivia', 'leave');
  });

  it('resets finished close hover after leaving the close hitbox', () => {
    openReplayTriviaGamePanel(createReplayTriviaGame({
      status: 'finished'
    }), 'host-user', vi.fn());
    const canvas = getCanvas();

    canvas.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 224,
      clientY: 350
    }));
    expect(canvas.style.cursor).toBe('pointer');
    canvas.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 5,
      clientY: 5
    }));

    expect(canvas.style.cursor).toBe('default');
  });

  it('renders waiting copy and blank question fallbacks', () => {
    openReplayTriviaGamePanel(createReplayTriviaGame({
      currentQuestion: undefined,
      status: 'preparing'
    }), 'guest-user', vi.fn());

    expect(drawnText()).toContain('Waiting for trivia...');
    closeReplayTriviaGamePanel({ notify: false });
    context.fillText.mockClear();

    openReplayTriviaGamePanel(createReplayTriviaGame({
      currentQuestion: undefined,
      status: 'question'
    }), 'host-user', vi.fn());
    setNow(ANSWER_UI_DELAY_MS + 25);
    updateReplayTriviaGamePanel(createReplayTriviaGame({
      currentQuestion: undefined,
      status: 'question'
    }), 'host-user');

    expect(context.fillText).toHaveBeenCalled();
  });

  it('wraps long question and answer text down to the minimum font size', () => {
    context.measureText.mockImplementation((text: string) => ({ width: text.length * 40 }));
    const longQuestion = {
      ...createReplayTriviaQuestion(),
      choices: [
        'A very long first answer option that has to wrap across several words',
        'A very long second answer option that should also wrap in the grid',
        'A very long third answer option that should be truncated visually',
        'A very long fourth answer option that should be truncated visually'
      ] as [string, string, string, string],
      friendIntro: 'this is a very long friend intro that should wrap and animate like a chat bubble',
      prompt: 'this is an unusually long prompt that needs wrapping so the canvas keeps the game readable'
    };

    openReplayTriviaGamePanel(createReplayTriviaGame({
      currentQuestion: longQuestion,
      status: 'question'
    }), 'host-user', vi.fn());
    setNow(ANSWER_UI_DELAY_MS + 25);
    updateReplayTriviaGamePanel(createReplayTriviaGame({
      currentQuestion: longQuestion,
      status: 'question'
    }), 'host-user');

    expect(drawnText()).toContain('...');
  });

  it('renders loaded image assets for logos, answers, reactions, and final stamps', async () => {
    const assets = createLoadedReplayTriviaAssets();
    getReplayTriviaAssetsMock.mockResolvedValue(assets);
    const onAction = vi.fn();

    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'preparing' }), 'host-user', onAction);
    await flushPromises();

    expect(context.drawImage).toHaveBeenCalledWith(assets.logo, expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number));
    closeReplayTriviaGamePanel({ notify: false });

    openReplayTriviaGamePanel(createReplayTriviaGame({ status: 'question' }), 'host-user', onAction);
    await flushPromises();
    setNow(ANSWER_UI_DELAY_MS + 25);
    updateReplayTriviaGamePanel(createReplayTriviaGame({ status: 'question' }), 'host-user');
    getCanvas().dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: 40,
      clientY: 260
    }));

    expect(context.drawImage).toHaveBeenCalledWith(assets.target, expect.any(Number), expect.any(Number), 31, 31);
    expect(context.drawImage).toHaveBeenCalledWith(assets.greyBubbleTail, expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number));
    closeReplayTriviaGamePanel({ notify: false });

    openReplayTriviaGamePanel(createReplayTriviaGame({
      answers: {
        guest: { answered: true, choiceIndex: 1, correct: false },
        host: { answered: true, choiceIndex: 0, correct: true }
      },
      status: 'reveal'
    }), 'host-user', onAction);
    await flushPromises();

    expect(context.drawImage).toHaveBeenCalledWith(assets.greenBubble, expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number));
    expect(context.drawImage).toHaveBeenCalledWith(assets.blueBubble, expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number));
    expect(context.drawImage).toHaveBeenCalledWith(assets.trophy, expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number));
    expect(context.drawImage).toHaveBeenCalledWith(assets.wrong, expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number));
    closeReplayTriviaGamePanel({ notify: false });

    for (const [assetName, scores] of [
      ['tie', { guest: 1, host: 1 }],
      ['bestie', { guest: 0, host: 2 }],
      ['blocked', { guest: 2, host: 0 }]
    ] as const) {
      context.drawImage.mockClear();
      openReplayTriviaGamePanel(createReplayTriviaGame({
        scores,
        status: 'finished'
      }), 'host-user', onAction);
      await flushPromises();
      setNow(STAMP_ANIMATION_MS / 2);
      updateReplayTriviaGamePanel(createReplayTriviaGame({
        scores,
        status: 'finished'
      }), 'host-user');

      expect(context.drawImage).toHaveBeenCalledWith(assets[assetName], expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number));
      closeReplayTriviaGamePanel({ notify: false });
    }
  });

  it('shows a preparation error instead of staying on loading', () => {
    openReplayTriviaGamePanel(
      createReplayTriviaGame({ status: 'preparing' }),
      'host-user',
      vi.fn()
    );
    context.fillText.mockClear();

    updateReplayTriviaGamePanel(
      createReplayTriviaGame({ status: 'preparing' }),
      'host-user',
      undefined,
      'Replay Trivia questions must include friendIntro.'
    );

    const drawnText = context.fillText.mock.calls.map(([text]) => String(text)).join(' ');
    expect(drawnText).toContain('Could not prepare trivia.');
    expect(drawnText).toContain('Close this game and start a new match.');
  });

  it('exposes the shared overlay with system priority', () => {
    openReplayTriviaGamePanel(
      createReplayTriviaGame(),
      'host-user',
      vi.fn()
    );

    const overlay = getReplayTriviaGamePanelOverlay();
    overlay?.show({
      key: 'connection:reconnecting',
      message: 'Connection lost. Trying to reconnect...',
      owner: 'system',
      temporary: false
    });

    const status = document.querySelector<HTMLElement>('.ytcq-replay-trivia-game-status');
    expect(status?.textContent).toBe('Connection lost. Trying to reconnect...');
    expect(status?.hidden).toBe(false);

    overlay?.show({
      key: 'game:loading',
      message: 'Preparing next question...',
      owner: 'game',
      temporary: false
    });

    expect(status?.textContent).toBe('Connection lost. Trying to reconnect...');
    expect(status?.hidden).toBe(false);

    overlay?.clear({ owner: 'system' });
    expect(status?.textContent).toBe('Preparing next question...');

    updateReplayTriviaGamePanel(createReplayTriviaGame(), 'host-user');

    expect(status?.textContent).toBe('');
    expect(status?.hidden).toBe(true);
  });

  function setNow(value: number): void {
    now = value;
  }

  function runNextFrame(value: number): void {
    setNow(value);
    const callback = frameCallbacks.shift();
    expect(callback).toBeDefined();
    callback?.(value);
  }

  function drawnText(): string {
    return context.fillText.mock.calls.map(([text]) => String(text)).join(' ');
  }
});

function createReplayTriviaGame(overrides: Partial<PublicReplayTriviaGame> = {}): PublicReplayTriviaGame {
  return {
    answers: {},
    currentQuestion: createReplayTriviaQuestion(),
    currentQuestionIndex: 0,
    gameId: 'game-replay-trivia',
    gameType: 'replay-trivia',
    phaseStartedAt: 0,
    players: {
      guest: {
        displayName: 'Player Firefox',
        userId: 'guest-user'
      },
      host: {
        displayName: 'Player Chrome',
        userId: 'host-user'
      }
    },
    questionProviderUserId: 'host-user',
    scores: {
      guest: 0,
      host: 0
    },
    status: 'question',
    totalQuestions: 1,
    ...overrides
  };
}

function createReplayTriviaQuestion() {
  return {
    choices: ['The Last of Us', 'God of War', 'Yandere Simulator', 'The Sims 4'] as [string, string, string, string],
    friendIntro: 'hey guys...! pls i need an answer',
    id: 'q_1',
    prompt: 'do you guys know who won the Game Awards 2018?',
    rightReply: 'wow, you actually helped. thank you.',
    wrongReply: 'wow, what a let down. it was The Last of Us.'
  };
}

function createGeneratedQuestion() {
  return {
    choices: ['A', 'B', 'C', 'D'] as [string, string, string, string],
    correctChoiceIndex: 2,
    difficulty: 'easy',
    explanation: 'C is correct.',
    friendIntro: 'can you help me?',
    id: 'generated-q',
    prompt: 'Which answer is correct?',
    rightReply: 'you saved me',
    sourceEndSeconds: 120,
    sourceStartSeconds: 60,
    wrongReply: 'that was not it'
  };
}

function getCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>('.ytcq-replay-trivia-canvas');
  expect(canvas).toBeInstanceOf(HTMLCanvasElement);
  return canvas as HTMLCanvasElement;
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(resolve);
  });
}

function createMockCanvasContext() {
  const context = {
    arc: vi.fn(),
    beginPath: vi.fn(),
    bezierCurveTo: vi.fn(),
    clearRect: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    drawImage: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    fillText: vi.fn(),
    font: '',
    globalAlpha: 1,
    lineTo: vi.fn(),
    lineWidth: 1,
    measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    shadowBlur: 0,
    shadowColor: '',
    shadowOffsetY: 0,
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    strokeStyle: '',
    strokeText: vi.fn(),
    textAlign: 'start',
    textBaseline: 'alphabetic',
    translate: vi.fn()
  };

  return context;
}

function createEmptyReplayTriviaAssets() {
  return {
    bestie: null,
    blueBubble: null,
    blocked: null,
    greenBubble: null,
    greyBubbleNoTail: null,
    greyBubbleTail: null,
    logo: null,
    target: null,
    tie: null,
    trophy: null,
    wrong: null
  };
}

function createLoadedReplayTriviaAssets() {
  return {
    bestie: createImage(),
    blueBubble: createImage(),
    blocked: createImage(),
    greenBubble: createImage(),
    greyBubbleNoTail: createImage(),
    greyBubbleTail: createImage(),
    logo: createImage(412, 268),
    target: createImage(),
    tie: createImage(288, 190),
    trophy: createImage(64, 64),
    wrong: createImage(64, 64)
  };
}

function createImage(width = 64, height = 64): HTMLImageElement {
  const image = document.createElement('img');
  Object.defineProperties(image, {
    height: { configurable: true, value: height },
    naturalHeight: { configurable: true, value: height },
    naturalWidth: { configurable: true, value: width },
    width: { configurable: true, value: width }
  });
  return image;
}
