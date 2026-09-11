/** DOM-only communication between the chat frame and its owning window. */
export const PIP_TOGGLE_EVENT = 'ytcq:pip-toggle';
export const PIP_ERROR_EVENT = 'ytcq:pip-error';
export const PIP_RELOAD_EVENT = 'ytcq:pip-reload';
export const PIP_DRAFT_READY_EVENT = 'ytcq:pip-draft-ready';
export const PIP_AVAILABLE_ATTRIBUTE = 'data-ytcq-pip-available';
export const PIP_WINDOW_ATTRIBUTE = 'data-ytcq-pip-window';

export interface DocumentPictureInPicture {
  requestWindow(options: { width: number; height: number }): Promise<Window>;
}

export function getDocumentPictureInPicture(owner: Window): DocumentPictureInPicture | undefined {
  return (owner as Window & { documentPictureInPicture?: DocumentPictureInPicture })
    .documentPictureInPicture;
}

export function isPictureInPictureChat(): boolean {
  try {
    return Boolean(window.top?.document.documentElement.hasAttribute(PIP_WINDOW_ATTRIBUTE));
  } catch {
    return false;
  }
}

export function canTogglePictureInPicture(): boolean {
  try {
    const owner = window.top;
    if (!owner || owner === window) return false;
    if (isPictureInPictureChat()) return true;
    return owner.location.pathname === '/watch'
      && owner.document.documentElement.hasAttribute(PIP_AVAILABLE_ATTRIBUTE)
      && owner.document.querySelector('ytd-live-chat-frame iframe#chatframe') === window.frameElement
      && Boolean(owner.document.querySelector('#movie_player video'));
  } catch {
    return false;
  }
}

export function togglePictureInPicture(): void {
  if (canTogglePictureInPicture()) {
    // A synchronous DOM event retains the click's transient user activation.
    window.top?.document.dispatchEvent(new Event(PIP_TOGGLE_EVENT));
  }
}
