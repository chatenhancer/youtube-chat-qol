import { DEFAULT_OPTIONS } from '../shared/options';
import { jsx, el } from '../shared/jsx-dom';
import { controls } from './controls';
import { getExtensionMessage } from './i18n';
import { applyOptionsToControls } from './settings';

const RESET_CONFIRM_ITEM_KEYS = [
  'popupResetItemSettings',
  'popupResetItemInboxMessages',
  'popupResetItemWatchedKeywords',
  'popupResetItemFrequentEmojis',
  'popupResetItemUnsentDrafts',
  'popupResetItemBookmarks',
  'popupResetItemAvatarRings',
  'popupResetItemPlaygroundIdentity',
  'popupResetItemGamePreferences'
];

export function initResetControl(): void {
  controls.resetExtension?.addEventListener('click', resetExtensionState);
}

function resetExtensionState(): void {
  showResetDialog({
    actions: [
      {
        className: 'popup-reset-dialog-cancel',
        label: getExtensionMessage('close'),
        onClick: closeResetDialog
      },
      {
        className: 'popup-reset-dialog-confirm',
        label: getExtensionMessage('resetExtension'),
        onClick: runResetExtensionState
      }
    ],
    items: RESET_CONFIRM_ITEM_KEYS.map((key) => getExtensionMessage(key)),
    listLabel: getExtensionMessage('popupResetConfirmIncludes'),
    message: getExtensionMessage('popupResetConfirm')
  });
}

function runResetExtensionState(): void {
  chrome.storage.local.clear(() => {
    clearSessionStorage(() => {
      chrome.storage.sync.clear(() => {
        chrome.storage.sync.set(DEFAULT_OPTIONS, () => {
          applyOptionsToControls(DEFAULT_OPTIONS);
          broadcastPageReset(() => {
            showResetDialog({
              actions: [
                {
                  className: 'popup-reset-dialog-close',
                  label: getExtensionMessage('close'),
                  onClick: closeResetDialog
                }
              ],
              message: getExtensionMessage('popupResetComplete')
            });
          });
        });
      });
    });
  });
}

function clearSessionStorage(callback: () => void): void {
  const sessionStorage = chrome.storage.session;
  if (sessionStorage) {
    sessionStorage.clear(callback);
  } else {
    callback();
  }
}

function broadcastPageReset(callback: () => void): void {
  chrome.tabs.query({}, (tabs) => {
    let pending = tabs.filter((tab) => typeof tab.id === 'number').length;
    if (!pending) {
      callback();
      return;
    }

    tabs.forEach((tab) => {
      if (typeof tab.id !== 'number') return;
      chrome.tabs.sendMessage(tab.id, { type: 'ytcq:reset-page' }, () => {
        void chrome.runtime.lastError;
        pending -= 1;
        if (!pending) callback();
      });
    });
  });
}

function showResetDialog({
  actions,
  items = [],
  listLabel,
  message
}: {
  actions: Array<{ className: string; label: string; onClick: () => void }>;
  items?: string[];
  listLabel?: string;
  message: string;
}): void {
  closeResetDialog();

  const overlay = el<HTMLDivElement>(
    <div
      class="popup-reset-dialog-backdrop"
      onClick={(event: MouseEvent) => {
        if (event.target === event.currentTarget) closeResetDialog();
      }}
    >
      <section class="popup-reset-dialog" aria-modal="true" role="dialog">
        <p class="popup-reset-dialog-message">{message}</p>
        {items.length && listLabel ? (
          <p class="popup-reset-dialog-list-label">{listLabel}</p>
        ) : null}
        {items.length ? (
          <ul class="popup-reset-dialog-list">
            {items.map((item) => (
              <li>{item}</li>
            ))}
          </ul>
        ) : null}
        <div class="popup-reset-dialog-actions">
          {actions.map((action) => (
            <button
              type="button"
              class={`popup-reset-dialog-button ${action.className}`}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );

  document.body.append(overlay);
}

function closeResetDialog(): void {
  document.querySelector('.popup-reset-dialog-backdrop')?.remove();
}
