import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicStickAroundGame } from './types';
import {
  closeStickAroundOverlay,
  getStickAroundThemeFighterColor,
  openStickAroundOverlay
} from './overlay';

describe('Stick Around overlay', () => {
  afterEach(() => {
    closeStickAroundOverlay({ notify: false });
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('dark');
    document.documentElement.removeAttribute('light');
    document.body.replaceChildren();
  });

  it('uses white fighters when the chat theme text is light', () => {
    const darkSurface = document.createElement('div');
    darkSurface.style.color = 'rgb(241, 241, 241)';
    document.body.append(darkSurface);

    expect(getStickAroundThemeFighterColor(darkSurface)).toBe('#ffffff');
  });

  it('uses black fighters when the chat theme text is dark', () => {
    const lightSurface = document.createElement('div');
    lightSurface.style.color = 'rgb(15, 15, 15)';
    document.body.append(lightSurface);

    expect(getStickAroundThemeFighterColor(lightSurface)).toBe('#111111');
  });

  it('uses the explicit YouTube dark document theme before sampled colors', () => {
    document.documentElement.setAttribute('dark', '');
    const surface = document.createElement('div');
    surface.style.color = 'rgb(15, 15, 15)';
    document.body.append(surface);

    expect(getStickAroundThemeFighterColor(surface)).toBe('#ffffff');
  });

  it('continues the previous input sequence when resuming an active game', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const frameCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((contextId) => {
      return contextId === '2d'
        ? createMockCanvasContext() as CanvasRenderingContext2D
        : null;
    });

    document.body.append(createChatFeedSurface());
    const sendGameAction = vi.fn();
    const opened = openStickAroundOverlay(createStickAroundGame({
      inputs: {
        'me-user': {
          frame: 120,
          jump: false,
          left: false,
          right: true,
          sentAt: 900,
          seq: 120,
          userId: 'me-user'
        }
      }
    }), 'me-user', sendGameAction, vi.fn(), vi.fn());
    expect(opened).toBe(true);

    frameCallbacks[0](1_000);

    expect(sendGameAction).toHaveBeenCalledWith('game-stick-around', 'input', expect.objectContaining({
      seq: 121
    }));
  });
});

function createChatFeedSurface(): HTMLElement {
  return document.createElement('yt-live-chat-item-list-renderer');
}

function createStickAroundGame(overrides: Partial<PublicStickAroundGame> = {}): PublicStickAroundGame {
  return {
    finishReports: {},
    gameId: 'game-stick-around',
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
        displayName: 'Me',
        userId: 'me-user'
      }
    },
    readyPlayers: {
      guest: true,
      host: true
    },
    roundSeed: 123,
    roundStartedAt: Date.now(),
    status: 'active',
    ...overrides
  };
}

function createMockCanvasContext(): Partial<CanvasRenderingContext2D> {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    drawImage: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 8 }) as TextMetrics),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    roundRect: vi.fn(),
    scale: vi.fn(),
    save: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    strokeText: vi.fn(),
    translate: vi.fn()
  };
}
