/**
 * The watch page owns PiP: moving an iframe into another document reloads its
 * content scripts. Keep restoration and pending requests outside that frame.
 */
import { initUiLocaleFromDocument } from '../../shared/i18n';
import { getChatInputNodesText } from '../../youtube/chat-input';
import { CHAT_INPUT_DRAFT_READY_ATTRIBUTE, createChatInputDraftContent, saveChatInputDraft } from '../chat-drafts/storage';
import {
  getDocumentPictureInPicture,
  PIP_AVAILABLE_ATTRIBUTE,
  PIP_DRAFT_READY_EVENT,
  PIP_ERROR_EVENT,
  PIP_RELOAD_EVENT,
  PIP_TOGGLE_EVENT,
  PIP_WINDOW_ATTRIBUTE
} from './bridge';
import { copyPageStyles, createPipPlaceholder, createPipStyles } from './ui';

const CLAIM_EVENT = 'ytcq:pip-controller-claim';

export function initPictureInPictureController(): void {
  if (window !== window.top || document.documentElement.hasAttribute(PIP_WINDOW_ATTRIBUTE)) return;
  // Chat also reconnects when moved into PiP. Keep the current window and its
  // restoration handlers whenever this page still has a valid controller.
  if (!document.dispatchEvent(new Event(CLAIM_EVENT, { cancelable: true }))) return;
  const api = getDocumentPictureInPicture(window);
  if (!api?.requestWindow) return;

  const lifetime = new AbortController();
  let active: AbortController | null = null;
  let returnToPage: (() => void) | null = null;
  void initUiLocaleFromDocument();
  document.documentElement.setAttribute(PIP_AVAILABLE_ATTRIBUTE, '');

  const stop = (): void => {
    active?.abort();
    active = null;
    returnToPage?.();
    returnToPage = null;
  };
  const dispose = (): void => {
    stop();
    lifetime.abort();
    document.documentElement.removeAttribute(PIP_AVAILABLE_ATTRIBUTE);
  };
  document.addEventListener(CLAIM_EVENT, (event) => {
    if (event.cancelable && chrome.runtime?.id) event.preventDefault();
    else dispose();
  }, { signal: lifetime.signal });
  document.addEventListener('yt-navigate-start', stop, { signal: lifetime.signal });
  window.addEventListener('pagehide', dispose, { signal: lifetime.signal });
  document.addEventListener(
    PIP_TOGGLE_EVENT,
    () => {
      if (active) {
        stop();
      } else {
        void open();
      }
    },
    { signal: lifetime.signal }
  );

  async function open(): Promise<void> {
    if (location.pathname !== '/watch') return;
    const player = document.querySelector<HTMLElement>('#movie_player');
    const video = player?.querySelector('video');
    const frame = document.querySelector<HTMLIFrameElement>('ytd-live-chat-frame iframe#chatframe');
    const chatUrl = getChatUrl(frame);
    if (!player || !video || !frame || !chatUrl) return;
    // Reloading the extension can leave this watch-page script alive while the
    // chat frame already has a fresh instance. Its storage APIs no longer work.
    if (!chrome.runtime?.id) {
      frame.contentDocument?.dispatchEvent(new Event(PIP_RELOAD_EVENT));
      return;
    }
    const sourceUrl = location.href;
    const request = new AbortController();
    active = request;
    try {
      // Request before any storage await: browsers require a user gesture here.
      const pip = await api!.requestWindow({ width: 460, height: 640 });
      if (request.signal.aborted) {
        pip.close();
        return;
      }
      returnToPage = () => pip.close();
      pip.addEventListener('pagehide', stop, { signal: request.signal });
      await saveFrameDraft(frame, sourceUrl);
      if (
        request.signal.aborted || pip.closed || !player.isConnected ||
        !player.contains(video) || !frame.isConnected
      ) {
        pip.close();
        return;
      }
      returnToPage = moveToPictureInPicture(pip, player, frame, chatUrl, sourceUrl, stop);
    } catch {
      stop();
      frame.contentDocument?.dispatchEvent(new Event(PIP_ERROR_EVENT));
    }
  }
}

function getChatUrl(frame: HTMLIFrameElement | null): string | null {
  try {
    // YouTube can navigate chat without setting an iframe src attribute.
    const url = new URL(frame?.contentDocument?.URL || '');
    return url.origin === location.origin && /^\/live_chat(?:_replay)?$/.test(url.pathname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function moveToPictureInPicture(
  pip: Window,
  player: HTMLElement,
  frame: HTMLIFrameElement,
  chatUrl: string,
  sourceUrl: string,
  onReturn: () => void
): () => void {
  const listeners = new AbortController();
  const video = player.querySelector('video')!;
  const playerAnchor = document.createComment('ytcq-pip-player');
  const frameAnchor = document.createComment('ytcq-pip-chat');
  const placeholder = createPipPlaceholder(onReturn, 'video');
  const chatPlaceholder = createPipPlaceholder(onReturn, 'chat');
  // YouTube's player still listens to its original window for layout changes.
  const resizePlayer = (): void => { window.dispatchEvent(new Event('resize')); };
  let restored = false;
  player.before(playerAnchor);
  frame.before(frameAnchor);
  // Playback errors hide the inner player container and cover it with an overlay.
  // Keep our return action above both, without changing YouTube's error state.
  (player.closest('#player') ?? player.parentElement!).append(placeholder);
  frame.after(chatPlaceholder);

  const restore = (): void => {
    if (restored) return;
    restored = true;
    listeners.abort();
    const draftSaved = saveFrameDraft(frame, sourceUrl);
    const playing = !video.paused;
    if (player.ownerDocument !== document && playerAnchor.isConnected) playerAnchor.replaceWith(player);
    if (frame.ownerDocument !== document && frameAnchor.isConnected) {
      // Closing PiP cannot await storage; notify the reloaded chat after both
      // the save and its navigation finish, in addition to normal draft recovery.
      frame.addEventListener(
        'load',
        () => {
          void draftSaved
            .then(() => {
              frame.contentDocument?.dispatchEvent(new Event(PIP_DRAFT_READY_EVENT));
            })
            .catch(() => {});
        },
        { once: true }
      );
      frameAnchor.replaceWith(frame);
    }
    void draftSaved.catch(() => {});
    placeholder.remove();
    chatPlaceholder.remove();
    playerAnchor.remove();
    frameAnchor.remove();
    resizePlayer();
    if (playing && video.isConnected) void video.play().catch(() => {});
    if (!pip.closed) pip.close();
  };

  try {
    pip.document.title = document.title;
    pip.document.documentElement.lang = document.documentElement.lang;
    pip.document.documentElement.dir = document.documentElement.dir;
    pip.document.documentElement.toggleAttribute('dark', document.documentElement.hasAttribute('dark'));
    pip.document.documentElement.setAttribute(PIP_WINDOW_ATTRIBUTE, '');
    copyPageStyles(pip.document);
    pip.document.head.append(createPipStyles());
    pip.document.addEventListener(PIP_TOGGLE_EVENT, onReturn, { signal: listeners.signal });
    pip.addEventListener('resize', resizePlayer, { signal: listeners.signal });
    // YouTube attaches seek/volume drag handlers to its original document.
    for (const type of ['mousemove', 'mouseup'] as const) {
      pip.document.addEventListener(type, (event) => {
        if (type === 'mouseup' || event.buttons) {
          document.dispatchEvent(new MouseEvent(type, event));
        }
      }, { signal: listeners.signal });
    }
    // Native chat sends replay/resize actions to its parent. Keep YouTube's
    // existing watch-page handlers connected to this same, borrowed iframe.
    pip.addEventListener(
      'message',
      (event: MessageEvent) => {
        if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
        window.dispatchEvent(
          new MessageEvent('message', {
            data: event.data,
            origin: event.origin,
            source: event.source
          })
        );
      },
      { signal: listeners.signal }
    );

    const playing = !video.paused;
    pip.document.body.append(player, frame);
    frame.src = chatUrl;
    resizePlayer();
    if (playing) void video.play().catch(() => {});
    return restore;
  } catch (error) {
    restore();
    throw error;
  }
}

async function saveFrameDraft(frame: HTMLIFrameElement, sourceUrl: string): Promise<void> {
  const input = frame.contentDocument?.querySelector('#input[contenteditable]');
  if (!input) return;
  // Import into this realm so rich-text instanceof checks preserve custom emoji.
  const childNodes = Array.from(input.childNodes, (node) => document.importNode(node, true));
  const text = getChatInputNodesText(childNodes);
  if (!text.trim() && !input.ownerDocument.documentElement.hasAttribute(CHAT_INPUT_DRAFT_READY_ATTRIBUTE)) return;
  await saveChatInputDraft(
    sourceUrl,
    createChatInputDraftContent({
      childNodes,
      text
    })
  );
}
