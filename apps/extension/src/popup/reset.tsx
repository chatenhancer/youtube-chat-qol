import { DEFAULT_OPTIONS } from '../shared/options';
import {
  closeExtensionDialog as closeResetDialog,
  showExtensionDialog as showResetDialog
} from '../shared/extension-dialog';
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
  'popupResetItemRememberedUsers',
  'popupResetItemPlaygroundIdentity',
  'popupResetItemGamePreferences',
  'themeResetItem'
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
