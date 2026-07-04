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
        ? createMockCanvasContext() as unknown as CanvasRenderingContext2D
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

  it('keeps the chat scroller pinned to the bottom while open', () => {
    const frameCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((contextId) => {
      return contextId === '2d'
        ? createMockCanvasContext() as unknown as CanvasRenderingContext2D
        : null;
    });

    const { feed, scroller } = createScrollableChatFeedSurface();
    const jumpToBottom = createJumpToBottomButton();
    feed.append(jumpToBottom.wrapper);
    const scrollEvents: number[] = [];
    scroller.addEventListener('scroll', () => scrollEvents.push(scroller.scrollTop));
    document.body.append(feed);

    const opened = openStickAroundOverlay(createStickAroundGame(), 'me-user', vi.fn(), vi.fn(), vi.fn());

    expect(opened).toBe(true);
    expect(scroller.scrollTop).toBe(800);
    expect(jumpToBottom.button.click).toHaveBeenCalledOnce();
    expect(scrollEvents).toEqual([800]);

    scroller.scrollTop = 0;
    frameCallbacks[0](1_016);

    expect(scroller.scrollTop).toBe(800);
    expect(jumpToBottom.button.click).toHaveBeenCalledTimes(2);
    expect(scrollEvents).toEqual([800, 800]);
  });

  it('activates ready from the canvas hitbox without a DOM ready button', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((contextId) => {
      return contextId === '2d'
        ? createMockCanvasContext() as unknown as CanvasRenderingContext2D
        : null;
    });

    const feed = createChatFeedSurface();
    mockElementRect(feed, {
      height: 560,
      left: 0,
      top: 0,
      width: 360
    });
    document.body.append(feed);
    const sendGameAction = vi.fn();
    const opened = openStickAroundOverlay(createStickAroundGame({
      readyPlayers: {
        guest: true,
        host: false
      },
      status: 'ready'
    }), 'me-user', sendGameAction, vi.fn(), vi.fn());
    expect(opened).toBe(true);

    const canvas = document.querySelector<HTMLCanvasElement>('.ytcq-stick-around-canvas');
    const overlay = document.querySelector<HTMLElement>('.ytcq-stick-around-overlay');
    expect(canvas).not.toBeNull();
    expect(overlay).not.toBeNull();
    expect(document.querySelector('.ytcq-stick-around-ready')).toBeNull();

    canvas!.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 180,
      clientY: 300
    }));
    expect(overlay!.style.cursor).toBe('pointer');

    canvas!.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 20,
      clientY: 20
    }));
    expect(overlay!.style.cursor).toBe('default');

    canvas!.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: 180,
      clientY: 300
    }));
    canvas!.dispatchEvent(createPointerReleaseEvent({ x: 180, y: 300 }));

    expect(sendGameAction).toHaveBeenCalledOnce();
    expect(sendGameAction).toHaveBeenCalledWith('game-stick-around', 'ready');

    overlay!.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(overlay!.style.cursor).toBe('default');
  });

  it('keeps wrapped text inside small falling bubbles', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    const context = createMockCanvasContext();
    context.measureText.mockImplementation((text: string) => ({ width: text.length * 6 }) as TextMetrics);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((contextId) => {
      return contextId === '2d'
        ? context as unknown as CanvasRenderingContext2D
        : null;
    });

    document.body.append(createChatFeedSurface());
    const opened = openStickAroundOverlay(createStickAroundGame({
      simulation: createStickAroundSimulationSnapshot({
        bubbles: [
          createStickAroundBubbleSnapshot({
            height: 30,
            text: 'I thought he was dead for sure today',
            width: 82
          })
        ]
      })
    }), 'me-user', vi.fn(), vi.fn(), vi.fn());
    expect(opened).toBe(true);

    const bubbleTextCalls = context.fillText.mock.calls.filter(([text]) =>
      ['I', 'thought', 'he', 'was', 'dead', 'for', 'sure', 'today', '...'].includes(String(text))
    );
    const lineYs = [...new Set(bubbleTextCalls.map(([, , y]) => Number(y)))];

    expect(lineYs).toEqual([-8, 0, 8]);
    expect(bubbleTextCalls.some(([text]) => text === '...')).toBe(true);
  });

  it('ellipsizes unbroken words after wrapping to a new bubble line', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    const context = createMockCanvasContext();
    const textWidth = (text: string): number => text.length * 6;
    context.measureText.mockImplementation((text: string) => ({ width: textWidth(text) }) as TextMetrics);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((contextId) => {
      return contextId === '2d'
        ? context as unknown as CanvasRenderingContext2D
        : null;
    });

    document.body.append(createChatFeedSurface());
    const opened = openStickAroundOverlay(createStickAroundGame({
      simulation: createStickAroundSimulationSnapshot({
        bubbles: [
          createStickAroundBubbleSnapshot({
            height: 44,
            text: `DIRTY DIANA ${'NO'.repeat(90)}`,
            width: 126
          })
        ]
      })
    }), 'me-user', vi.fn(), vi.fn(), vi.fn());
    expect(opened).toBe(true);

    const maxTextWidth = 126 - 22;
    const bubbleTextCalls = context.fillText.mock.calls.filter(([text]) =>
      ['DIRTY', 'DIANA'].includes(String(text)) || String(text).startsWith('NO')
    );

    expect(bubbleTextCalls.every(([text]) => textWidth(String(text)) <= maxTextWidth)).toBe(true);
    expect(bubbleTextCalls.some(([text]) => String(text).startsWith('NO') && String(text).endsWith('...')))
      .toBe(true);
  });

  it('scales short text up inside large falling bubbles', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    const context = createMockCanvasContext();
    const drawnText: Array<{ font: string; text: string }> = [];
    context.fillText.mockImplementation((text: string) => {
      drawnText.push({
        font: context.font,
        text
      });
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((contextId) => {
      return contextId === '2d'
        ? context as unknown as CanvasRenderingContext2D
        : null;
    });

    document.body.append(createChatFeedSurface());
    const opened = openStickAroundOverlay(createStickAroundGame({
      simulation: createStickAroundSimulationSnapshot({
        bubbles: [
          createStickAroundBubbleSnapshot({
            height: 58,
            text: 'chat',
            width: 172
          })
        ]
      })
    }), 'me-user', vi.fn(), vi.fn(), vi.fn());
    expect(opened).toBe(true);

    const bubbleText = drawnText.find(({ text }) => text === 'chat');

    expect(bubbleText?.font).toContain('22px');
  });
});

type StickAroundSimulationSnapshotForTest = NonNullable<PublicStickAroundGame['simulation']>;
type StickAroundBubbleSnapshotForTest = StickAroundSimulationSnapshotForTest['bubbles'][number];

function createChatFeedSurface(): HTMLElement {
  return document.createElement('yt-live-chat-item-list-renderer');
}

function createScrollableChatFeedSurface(): { feed: HTMLElement; scroller: HTMLElement } {
  const feed = createChatFeedSurface();
  const scroller = document.createElement('div');
  scroller.id = 'item-scroller';
  setElementScrollMetrics(scroller, {
    clientHeight: 240,
    scrollHeight: 800
  });
  feed.append(scroller);
  return { feed, scroller };
}

function createJumpToBottomButton(): { button: HTMLButtonElement; wrapper: HTMLElement } {
  const wrapper = document.createElement('div');
  const button = document.createElement('button');
  wrapper.id = 'jump-to-bottom-button';
  button.click = vi.fn();
  button.getBoundingClientRect = () => ({
    bottom: 20,
    height: 20,
    left: 0,
    right: 20,
    top: 0,
    width: 20,
    x: 0,
    y: 0,
    toJSON: () => ({})
  });
  wrapper.append(button);
  return { button, wrapper };
}

function setElementScrollMetrics(
  element: HTMLElement,
  { clientHeight, scrollHeight }: { clientHeight: number; scrollHeight: number }
): void {
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: clientHeight
  });
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: scrollHeight
  });
}

function mockElementRect(
  element: Element,
  { height, left, top, width }: { height: number; left: number; top: number; width: number }
): void {
  element.getBoundingClientRect = () => ({
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({})
  });
}

function createPointerReleaseEvent({ x, y }: { x: number; y: number }): Event {
  const init = {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX: x,
    clientY: y
  };
  return typeof window.PointerEvent === 'function'
    ? new window.PointerEvent('pointerup', init)
    : new MouseEvent('mouseup', init);
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

function createStickAroundSimulationSnapshot(
  overrides: Partial<StickAroundSimulationSnapshotForTest> = {}
): StickAroundSimulationSnapshotForTest {
  return {
    bubbles: [],
    fighters: {},
    flash: 0,
    frame: 1,
    height: 560,
    lastTime: Date.now(),
    particles: [],
    platforms: [],
    roundSeed: 123,
    shake: 0,
    spawnedHazardIds: [],
    width: 360,
    ...overrides
  };
}

function createStickAroundBubbleSnapshot(
  overrides: Partial<StickAroundBubbleSnapshotForTest> = {}
): StickAroundBubbleSnapshotForTest {
  return {
    angle: 0,
    height: 30,
    hitUserIds: [],
    id: 'bubble-1',
    seed: 1,
    spin: 0,
    text: 'chat',
    vx: 0,
    vy: 0,
    width: 82,
    x: 20,
    y: 20,
    ...overrides
  };
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
    fillText: vi.fn(),
    font: '',
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
