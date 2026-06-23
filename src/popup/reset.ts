import { DEFAULT_OPTIONS } from '../shared/options';
import { controls } from './controls';
import { getExtensionMessage } from './i18n';
import { applyOptionsToControls } from './settings';

const RESET_CONFIRM_ITEM_KEYS = [
  'popupResetItemSettings',
  'popupResetItemInboxMessages',
  'popupResetItemWatchedKeywords',
  'popupResetItemFrequentEmojis',
  'popupResetItemUnsentDrafts',
  'popupResetItemBookmarkedUsers',
  'popupResetItemPlaygroundIdentity',
  'popupResetItemGamePreferences'
];

export function initResetControl(): void {
  controls.resetExtension?.addEventListener('click', resetExtensionState);
}

function resetExtensionState(): void {
  showResetDialog({
    actions: [{
      className: 'popup-reset-dialog-cancel',
      label: getExtensionMessage('close'),
      onClick: closeResetDialog
    }, {
      className: 'popup-reset-dialog-confirm',
      label: getExtensionMessage('resetExtension'),
      onClick: runResetExtensionState
    }],
    items: RESET_CONFIRM_ITEM_KEYS.map((key) => getExtensionMessage(key)),
    listLabel: getExtensionMessage('popupResetConfirmIncludes'),
    message: getExtensionMessage('popupResetConfirm')
  });
}

function runResetExtensionState(): void {
  chrome.storage.local.clear(() => {
    chrome.storage.sync.clear(() => {
      chrome.storage.sync.set(DEFAULT_OPTIONS, () => {
        applyOptionsToControls(DEFAULT_OPTIONS);
        broadcastPageReset(() => {
          showResetDialog({
            actions: [{
              className: 'popup-reset-dialog-close',
              label: getExtensionMessage('close'),
              onClick: closeResetDialog
            }],
            message: getExtensionMessage('popupResetComplete')
          });
        });
      });
    });
  });
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

  const overlay = document.createElement('div');
  overlay.className = 'popup-reset-dialog-backdrop';
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeResetDialog();
  });

  const dialog = document.createElement('section');
  dialog.className = 'popup-reset-dialog';
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('role', 'dialog');

  const copy = document.createElement('p');
  copy.className = 'popup-reset-dialog-message';
  copy.textContent = message;

  const fragments: HTMLElement[] = [copy];
  if (items.length) {
    if (listLabel) {
      const includes = document.createElement('p');
      includes.className = 'popup-reset-dialog-list-label';
      includes.textContent = listLabel;
      fragments.push(includes);
    }

    const list = document.createElement('ul');
    list.className = 'popup-reset-dialog-list';
    items.forEach((item) => {
      const listItem = document.createElement('li');
      listItem.textContent = item;
      list.append(listItem);
    });
    fragments.push(list);
  }

  const actionRow = document.createElement('div');
  actionRow.className = 'popup-reset-dialog-actions';
  actions.forEach((action) => {
    const button = document.createElement('button');
    button.className = `popup-reset-dialog-button ${action.className}`;
    button.type = 'button';
    button.textContent = action.label;
    button.addEventListener('click', action.onClick);
    actionRow.append(button);
  });

  dialog.append(...fragments, actionRow);
  overlay.append(dialog);
  document.body.append(overlay);
}

function closeResetDialog(): void {
  document.querySelector('.popup-reset-dialog-backdrop')?.remove();
}
