import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeReplayTriviaGamePanel,
  openReplayTriviaGamePanel,
  updateReplayTriviaGamePanel
} from './panel';
import type { PublicReplayTriviaGame } from './types';

describe('Replay Trivia panel', () => {
  let context: ReturnType<typeof createMockCanvasContext>;

  beforeEach(() => {
    document.body.replaceChildren();
    context = createMockCanvasContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  });

  afterEach(() => {
    closeReplayTriviaGamePanel({ notify: false });
    vi.restoreAllMocks();
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
