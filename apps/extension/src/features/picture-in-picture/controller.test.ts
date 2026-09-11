import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initPictureInPictureController } from './controller';
import { PIP_AVAILABLE_ATTRIBUTE, PIP_ERROR_EVENT, PIP_RELOAD_EVENT, PIP_TOGGLE_EVENT } from './bridge';

describe('watch-page picture-in-picture lifecycle', () => {
  let requestWindow: ReturnType<typeof vi.fn>;
  let frame: HTMLIFrameElement;
  let video: HTMLVideoElement;

  beforeEach(() => {
    vi.stubGlobal('chrome', { ...chrome, runtime: { ...chrome.runtime, id: 'test-extension' } });
    history.replaceState(null, '', '/watch?v=stream-test');
    document.body.innerHTML = '<div id="movie_player"><video></video></div>'
      + '<ytd-live-chat-frame><iframe id="chatframe"></iframe></ytd-live-chat-frame>';
    video = document.querySelector('video')!;
    frame = document.querySelector('iframe')!;
    Object.defineProperty(frame.contentDocument, 'URL', {
      configurable: true,
      value: `${location.origin}/live_chat?continuation=fixture`
    });
    requestWindow = vi.fn();
    Object.defineProperty(window, 'documentPictureInPicture', {
      configurable: true,
      value: { requestWindow }
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  });

  afterEach(() => {
    document.dispatchEvent(new Event('ytcq:pip-controller-claim'));
    Reflect.deleteProperty(window, 'documentPictureInPicture');
    document.body.replaceChildren();
    history.replaceState(null, '', '/');
    vi.unstubAllGlobals();
  });

  it('does not advertise PiP on unsupported browsers', () => {
    Reflect.deleteProperty(window, 'documentPictureInPicture');
    initPictureInPictureController();
    expect(document.documentElement.hasAttribute(PIP_AVAILABLE_ATTRIBUTE)).toBe(false);
  });

  it('keeps the player and chat intact when the browser rejects opening', async () => {
    const error = vi.fn();
    frame.contentDocument!.addEventListener(PIP_ERROR_EVENT, error);
    requestWindow.mockRejectedValue(new DOMException('No activation', 'NotAllowedError'));
    initPictureInPictureController();
    document.dispatchEvent(new Event(PIP_TOGGLE_EVENT));
    // The API must be called synchronously inside the originating click.
    expect(requestWindow).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(error).toHaveBeenCalledOnce());
    expect(document.querySelector('#movie_player video')).toBe(video);
    expect(document.querySelector('#chatframe')).toBe(frame);
    expect(video.controls).toBe(false);
    expect(document.querySelector('.ytcq-pip-placeholder')).toBeNull();
  });

  it('asks for a tab refresh after the extension context is invalidated', () => {
    const reload = vi.fn();
    frame.contentDocument!.addEventListener(PIP_RELOAD_EVENT, reload);
    initPictureInPictureController();
    vi.stubGlobal('chrome', { ...chrome, runtime: undefined });
    document.dispatchEvent(new Event(PIP_TOGGLE_EVENT));
    expect(reload).toHaveBeenCalledOnce();
    expect(requestWindow).not.toHaveBeenCalled();
    expect(document.querySelector('#movie_player video')).toBe(video);
    expect(document.querySelector('#chatframe')).toBe(frame);
  });

  it.each(['yt-navigate-start', 'ytcq:pip-controller-claim'])(
    'cancels a pending window on %s without borrowing the old stream',
    async (event) => {
      let resolve!: (value: Window) => void;
      requestWindow.mockReturnValue(new Promise<Window>((done) => { resolve = done; }));
      initPictureInPictureController();
      document.dispatchEvent(new Event(PIP_TOGGLE_EVENT));
      document.dispatchEvent(new Event(event));
      const close = vi.fn();
      resolve({ close } as unknown as Window);
      await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
      expect(document.querySelector('#movie_player video')).toBe(video);
      expect(document.querySelector('#chatframe')).toBe(frame);
    }
  );

  it('reuses a healthy controller without duplicating the request handler', async () => {
    requestWindow.mockRejectedValue(new Error('Opening denied'));
    initPictureInPictureController();
    initPictureInPictureController();
    document.dispatchEvent(new Event(PIP_TOGGLE_EVENT));
    expect(requestWindow).toHaveBeenCalledOnce();
    await Promise.resolve();
  });

  it('preserves a pending PiP request when a healthy controller is reinjected', () => {
    requestWindow.mockReturnValue(new Promise(() => {}));
    initPictureInPictureController();
    document.dispatchEvent(new Event(PIP_TOGGLE_EVENT));
    initPictureInPictureController();
    // A second click cancels the same pending request instead of opening another.
    document.dispatchEvent(new Event(PIP_TOGGLE_EVENT));
    expect(requestWindow).toHaveBeenCalledOnce();
  });
});
