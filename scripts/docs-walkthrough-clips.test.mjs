import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const walkthroughClipsScript = await readFile(
  path.join(process.cwd(), 'docs', 'src', 'scripts', 'walkthrough-clips.js'),
  'utf8'
);

describe('docs walkthrough clips', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('opens data-driven clips and loops each one within its bounds', () => {
    document.body.innerHTML = `
      <a
        id="games-clip"
        href="/#install"
        data-walkthrough-clip-open
        data-walkthrough-clip-start="105"
        data-walkthrough-clip-end="135"
        data-walkthrough-clip-title="Games"
      >Games</a>
      <button
        id="drafts-clip"
        type="button"
        data-walkthrough-clip-open
        data-walkthrough-clip-start="25"
        data-walkthrough-clip-end="40"
        data-walkthrough-clip-title="Draft translator"
      >Drafts</button>
      <button
        id="commands-tag"
        type="button"
        data-walkthrough-clip-open
        data-walkthrough-clip-start="164"
        data-walkthrough-clip-end="176"
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
      duration: { configurable: true, get: () => 198 },
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
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    window.eval(walkthroughClipsScript);

    expect(gamesTrigger.getAttribute('aria-controls')).toBe('walkthrough-clip');
    expect(gamesTrigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(gamesTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, cancelable: true }))).toBe(false);
    expect(modal.open).toBe(true);
    expect(gamesTrigger.textContent).toBe('Games');
    expect(modal.querySelector('[data-walkthrough-clip-title]').textContent).toBe('Games');
    expect(video.currentTime).toBe(105);
    expect(video.play).toHaveBeenCalledOnce();

    video.currentTime = 134.96;
    video.dispatchEvent(new Event('timeupdate'));
    expect(video.currentTime).toBe(105);

    video.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    modal.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: ' ' }));
    expect(video.paused).toBe(false);
    expect(video.pause).not.toHaveBeenCalled();

    draftsTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, cancelable: true }));
    expect(draftsTrigger.textContent).toBe('Drafts');
    expect(modal.querySelector('[data-walkthrough-clip-title]').textContent).toBe('Draft translator');
    expect(video.currentTime).toBe(25);

    commandsTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, cancelable: true }));
    expect(commandsTrigger.textContent).toBe('Watch');
    expect(commandsTrigger.getAttribute('aria-controls')).toBe('walkthrough-clip');
    expect(modal.querySelector('[data-walkthrough-clip-title]').textContent).toBe('Use Tab commands');
    expect(video.currentTime).toBe(164);

    modal.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    expect(modal.open).toBe(false);
    expect(video.pause).toHaveBeenCalled();
  });
});
