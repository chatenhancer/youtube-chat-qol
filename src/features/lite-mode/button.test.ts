import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../../shared/options';
import { setOptions } from '../../shared/state';
import {
  cleanupLiteModeButton,
  initLiteModeButton,
  refreshLiteModeButton,
  scheduleLiteModeButtonWire,
  shouldWireLiteModeButton,
  wireLiteModeButton
} from './button';

describe('Lite mode header button', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    setOptions({ ...DEFAULT_OPTIONS });
    initLiteModeButton(vi.fn());
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanupLiteModeButton();
    vi.useRealTimers();
  });

  it('stays ordered before Games, Inbox, and the native menu', () => {
    const header = createHeader();
    const games = createButton('ytcq-games-button');
    const inbox = createButton('ytcq-inbox-button');
    header.prepend(games, inbox);
    document.body.append(header);

    wireLiteModeButton();

    expect([...header.children].map((element) => element.className || element.id)).toEqual([
      'ytcq-lite-mode-button',
      'ytcq-games-button',
      'ytcq-inbox-button',
      'live-chat-header-context-menu'
    ]);
  });

  it('saves toggles and reflects the enabled state accessibly', () => {
    const saveOptions = vi.fn();
    initLiteModeButton(saveOptions);
    document.body.append(createHeader());
    wireLiteModeButton();

    const button = document.querySelector<HTMLButtonElement>('.ytcq-lite-mode-button')!;
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Turn on Lite mode');
    expect(button.querySelector('path')).not.toBeNull();

    button.click();
    expect(saveOptions).toHaveBeenCalledWith({ liteModeEnabled: true });

    setOptions({ ...DEFAULT_OPTIONS, liteModeEnabled: true });
    refreshLiteModeButton();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Turn off Lite mode');
    expect(button.classList.contains('ytcq-lite-mode-button-active')).toBe(true);

    button.click();
    expect(saveOptions).toHaveBeenLastCalledWith({ liteModeEnabled: false });
  });

  it('coalesces scheduled wiring and replaces stale owned buttons', async () => {
    scheduleLiteModeButtonWire();
    scheduleLiteModeButtonWire();
    await vi.runOnlyPendingTimersAsync();
    expect(document.querySelector('.ytcq-lite-mode-button')).toBeNull();

    const header = createHeader();
    const stale = createButton('ytcq-lite-mode-button');
    stale.dataset.ytcqLiteModeOwner = 'stale-owner';
    header.prepend(stale);
    document.body.append(header);

    scheduleLiteModeButtonWire();
    await vi.runOnlyPendingTimersAsync();
    expect(header.querySelectorAll('.ytcq-lite-mode-button')).toHaveLength(1);
    expect(header.querySelector('.ytcq-lite-mode-button')).not.toBe(stale);
  });

  it('recognizes header mutations and removes its surface during cleanup', () => {
    const header = createHeader();
    document.body.append(header);
    wireLiteModeButton();

    expect(shouldWireLiteModeButton({
      addedElements: [],
      mutations: [{
        target: header,
        type: 'childList'
      } as unknown as MutationRecord]
    })).toBe(true);

    cleanupLiteModeButton();
    expect(document.querySelector('.ytcq-lite-mode-button')).toBeNull();
  });

  it('uses nested native More options and close-button fallbacks', () => {
    const header = document.createElement('yt-live-chat-header-renderer');
    const wrapper = document.createElement('span');
    const more = document.createElement('button');
    more.setAttribute('aria-label', 'More options');
    wrapper.append(more);
    header.append(wrapper);
    document.body.append(header);

    wireLiteModeButton();
    expect(header.firstElementChild?.className).toBe('ytcq-lite-mode-button');

    cleanupLiteModeButton();
    header.replaceChildren();
    const close = document.createElement('button');
    close.id = 'close-button';
    header.append(close);
    wireLiteModeButton();
    expect(header.firstElementChild?.className).toBe('ytcq-lite-mode-button');
  });
});

function createHeader(): HTMLElement {
  const header = document.createElement('yt-live-chat-header-renderer');
  const menu = document.createElement('div');
  menu.id = 'live-chat-header-context-menu';
  header.append(menu);
  return header;
}

function createButton(className: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = className;
  return button;
}
