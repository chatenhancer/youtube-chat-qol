/* global document, window, KeyboardEvent, MouseEvent */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const walkthroughClipsScript = await readFile(
  path.join(process.cwd(), 'docs', 'src', 'scripts', 'walkthrough-clips.js'),
  'utf8'
);

describe('docs walkthrough clips', () => {
  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads metadata when idle and upgrades to full preload on intent', () => {
    document.body.innerHTML = `
      <button
        id="games-clip"
        type="button"
        data-walkthrough-clip-open
        data-walkthrough-clip-chapter="games"
        data-walkthrough-clip-start="122"
        data-walkthrough-clip-end="154"
      >Games</button>
      <dialog id="walkthrough-clip" data-walkthrough-clip-modal>
        <video data-walkthrough-clip-video preload="none"></video>
      </dialog>
      <script type="application/json" data-docs-config>{"walkthrough":"../videos/walkthrough.mp4"}</script>
    `;

    const trigger = document.querySelector('#games-clip');
    const video = document.querySelector('[data-walkthrough-clip-video]');
    const idleCallbacks = [];
    Object.defineProperty(video, 'load', { configurable: true, value: vi.fn() });
    vi.stubGlobal('requestIdleCallback', vi.fn((callback) => {
      idleCallbacks.push(callback);
      return idleCallbacks.length;
    }));

    window.eval(walkthroughClipsScript);

    expect(video.src).toBe('');
    expect(video.preload).toBe('none');
    expect(video.load).not.toHaveBeenCalled();

    idleCallbacks.shift()();
    expect(video.src).toBe(new URL('../videos/walkthrough.mp4', window.location.href).href);
    expect(video.preload).toBe('metadata');
    expect(video.load).toHaveBeenCalledOnce();

    trigger.dispatchEvent(new Event('pointerenter'));
    expect(video.preload).toBe('auto');
    expect(video.load).toHaveBeenCalledTimes(2);
  });

  it('shows a delayed desktop hover preview and promotes the same player into the modal', () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <button
        id="games-clip"
        type="button"
        data-walkthrough-clip-open
        data-walkthrough-clip-chapter="games"
        data-walkthrough-clip-start="122"
        data-walkthrough-clip-end="154"
        data-walkthrough-clip-title="Games"
      >Watch</button>
      <div data-walkthrough-clip-preview aria-hidden="true" hidden></div>
      <dialog id="walkthrough-clip" data-walkthrough-clip-modal>
        <div data-walkthrough-clip-modal-panel>
          <h2 data-walkthrough-clip-title>Feature walkthrough</h2>
          <div data-walkthrough-clip-frame>
            <video data-walkthrough-clip-video preload="none"></video>
          </div>
        </div>
      </dialog>
      <script type="application/json" data-docs-config>{"walkthrough":"../videos/walkthrough.mp4"}</script>
    `;

    const trigger = document.querySelector('#games-clip');
    const preview = document.querySelector('[data-walkthrough-clip-preview]');
    const modal = document.querySelector('[data-walkthrough-clip-modal]');
    const modalPanel = document.querySelector('[data-walkthrough-clip-modal-panel]');
    const frame = document.querySelector('[data-walkthrough-clip-frame]');
    const video = document.querySelector('[data-walkthrough-clip-video]');
    let currentTime = 0;
    let isPaused = true;

    vi.stubGlobal('matchMedia', vi.fn((query) => ({
      matches: query === '(hover: hover) and (pointer: fine)'
    })));
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      bottom: 330,
      height: 30,
      left: 500,
      right: 600,
      top: 300,
      width: 100,
      x: 500,
      y: 300,
      toJSON: () => ({})
    });
    vi.spyOn(preview, 'getBoundingClientRect').mockReturnValue({
      bottom: 270,
      height: 270,
      left: 0,
      right: 480,
      top: 0,
      width: 480,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    Object.defineProperties(video, {
      currentTime: {
        configurable: true,
        get: () => currentTime,
        set: (value) => {
          currentTime = value;
        }
      },
      duration: { configurable: true, get: () => 221 },
      load: { configurable: true, value: vi.fn() },
      pause: {
        configurable: true,
        value: vi.fn(() => {
          isPaused = true;
          video.dispatchEvent(new Event('pause'));
        })
      },
      paused: { configurable: true, get: () => isPaused },
      play: {
        configurable: true,
        value: vi.fn(() => {
          isPaused = false;
          video.dispatchEvent(new Event('play'));
          return Promise.resolve();
        })
      },
      readyState: { configurable: true, get: () => 1 }
    });
    Object.defineProperty(modal, 'showModal', {
      configurable: true,
      value: vi.fn(() => modal.setAttribute('open', ''))
    });

    window.eval(walkthroughClipsScript);
    trigger.dispatchEvent(new Event('pointerenter'));

    vi.advanceTimersByTime(249);
    expect(preview.hidden).toBe(true);

    vi.advanceTimersByTime(1);
    expect(preview.hidden).toBe(false);
    expect(preview.classList.contains('is-visible')).toBe(true);
    expect(preview.dataset.placement).toBe('above');
    expect(preview.style.left).toBe('310px');
    expect(preview.style.top).toBe('20px');
    expect(frame.parentElement).toBe(preview);
    expect(video.currentTime).toBe(122);
    expect(video.muted).toBe(true);
    expect(video.play).toHaveBeenCalledOnce();

    trigger.dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(100);
    preview.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(100);
    expect(preview.hidden).toBe(false);
    expect(video.pause).not.toHaveBeenCalled();

    preview.dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(100);
    trigger.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(100);
    expect(preview.hidden).toBe(false);
    expect(video.currentTime).toBe(122);
    expect(video.play).toHaveBeenCalledOnce();

    trigger.style.direction = 'rtl';
    window.dispatchEvent(new Event('resize'));
    expect(preview.style.left).toBe('310px');

    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, cancelable: true }));
    expect(modal.open).toBe(true);
    expect(preview.hidden).toBe(true);
    expect(frame.parentElement).toBe(modalPanel);
    expect(video.currentTime).toBe(122);
    expect(video.muted).toBe(false);
    expect(video.play).toHaveBeenCalledTimes(2);
  });

  it('opens shared clip hashes, updates the URL, and loops each clip within its bounds', () => {
    document.body.innerHTML = `
      <a
        id="games-clip"
        href="#clip-games"
        data-walkthrough-clip-open
        data-walkthrough-clip-chapter="games"
        data-walkthrough-clip-start="122"
        data-walkthrough-clip-end="154"
        data-walkthrough-clip-title="Games"
      >Games</a>
      <button
        id="drafts-clip"
        type="button"
        data-walkthrough-clip-open
        data-walkthrough-clip-chapter="translate-what-you-type"
        data-walkthrough-clip-start="28"
        data-walkthrough-clip-end="45"
        data-walkthrough-clip-title="Draft translator"
      >Drafts</button>
      <button
        id="commands-tag"
        type="button"
        data-walkthrough-clip-open
        data-walkthrough-clip-chapter="use-tab-commands"
        data-walkthrough-clip-start="185"
        data-walkthrough-clip-end="200"
        data-walkthrough-clip-title="Use Tab commands"
      >Watch</button>
      <dialog id="walkthrough-clip" data-walkthrough-clip-modal>
        <h2 data-walkthrough-clip-title>Feature walkthrough</h2>
        <video data-walkthrough-clip-video></video>
      </dialog>
      <script type="application/json" data-docs-config>{"walkthrough":"../videos/walkthrough.mp4"}</script>
    `;

    const modal = document.querySelector('[data-walkthrough-clip-modal]');
    const video = document.querySelector('[data-walkthrough-clip-video]');
    const gamesTrigger = document.querySelector('#games-clip');
    const draftsTrigger = document.querySelector('#drafts-clip');
    const commandsTrigger = document.querySelector('#commands-tag');
    const frameCallbacks = [];
    const idleCallbacks = [];
    let currentTime = 0;
    let isPaused = true;

    Object.defineProperties(video, {
      currentTime: {
        configurable: true,
        get: () => currentTime,
        set: (value) => {
          currentTime = value;
        }
      },
      duration: { configurable: true, get: () => 221 },
      load: { configurable: true, value: vi.fn() },
      pause: {
        configurable: true,
        value: vi.fn(() => {
          isPaused = true;
          video.dispatchEvent(new Event('pause'));
        })
      },
      paused: { configurable: true, get: () => isPaused },
      play: {
        configurable: true,
        value: vi.fn(() => {
          isPaused = false;
          video.dispatchEvent(new Event('play'));
          return Promise.resolve();
        })
      },
      readyState: { configurable: true, get: () => 1 }
    });
    Object.defineProperties(modal, {
      close: {
        configurable: true,
        value: vi.fn(() => {
          modal.removeAttribute('open');
          modal.dispatchEvent(new Event('close'));
        })
      },
      showModal: {
        configurable: true,
        value: vi.fn(() => modal.setAttribute('open', ''))
      }
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    vi.stubGlobal('requestIdleCallback', vi.fn((callback) => {
      idleCallbacks.push(callback);
      return idleCallbacks.length;
    }));

    window.history.replaceState(null, '', '#clip-translate-what-you-type');
    window.eval(walkthroughClipsScript);
    expect(window.requestIdleCallback).toHaveBeenCalledOnce();
    frameCallbacks.shift()(0);

    expect(modal.open).toBe(true);
    expect(window.location.hash).toBe('#clip-translate-what-you-type');
    expect(modal.querySelector('[data-walkthrough-clip-title]').textContent).toBe('Draft translator');
    expect(video.currentTime).toBe(28);
    expect(video.play).toHaveBeenCalledOnce();
    expect(video.preload).toBe('auto');
    expect(video.src).toBe(new URL('../videos/walkthrough.mp4', window.location.href).href);

    idleCallbacks.shift()();
    expect(video.preload).toBe('auto');

    expect(gamesTrigger.getAttribute('aria-controls')).toBe('walkthrough-clip');
    expect(gamesTrigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(gamesTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, cancelable: true }))).toBe(false);
    expect(window.location.hash).toBe('#clip-games');
    expect(modal.open).toBe(true);
    expect(gamesTrigger.textContent).toBe('Games');
    expect(modal.querySelector('[data-walkthrough-clip-title]').textContent).toBe('Games');
    expect(video.currentTime).toBe(122);
    expect(video.play).toHaveBeenCalledTimes(2);

    video.currentTime = 153.96;
    video.dispatchEvent(new Event('timeupdate'));
    expect(video.currentTime).toBe(122);

    video.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    modal.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: ' ' }));
    expect(video.paused).toBe(false);
    expect(video.pause).not.toHaveBeenCalled();

    draftsTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, cancelable: true }));
    expect(window.location.hash).toBe('#clip-translate-what-you-type');
    expect(draftsTrigger.textContent).toBe('Drafts');
    expect(modal.querySelector('[data-walkthrough-clip-title]').textContent).toBe('Draft translator');
    expect(video.currentTime).toBe(28);

    commandsTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, cancelable: true }));
    expect(window.location.hash).toBe('#clip-use-tab-commands');
    expect(commandsTrigger.textContent).toBe('Watch');
    expect(commandsTrigger.getAttribute('aria-controls')).toBe('walkthrough-clip');
    expect(modal.querySelector('[data-walkthrough-clip-title]').textContent).toBe('Use Tab commands');
    expect(video.currentTime).toBe(185);

    modal.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    expect(modal.open).toBe(false);
    expect(window.location.hash).toBe('');
    expect(video.pause).toHaveBeenCalled();

    window.history.pushState(null, '', '#clip-games');
    window.dispatchEvent(new Event('hashchange'));
    expect(modal.open).toBe(true);
    expect(modal.querySelector('[data-walkthrough-clip-title]').textContent).toBe('Games');

    window.history.replaceState(null, '', '#features');
    window.dispatchEvent(new Event('hashchange'));
    expect(modal.open).toBe(false);
    expect(window.location.hash).toBe('#features');
  });
});
