import { DEFAULT_OPTIONS } from '../shared/options';
import { controls } from './controls';
import { getExtensionMessage } from './i18n';
import { applyOptionsToControls } from './settings';

export function initResetControl(): void {
  controls.resetExtension?.addEventListener('click', resetExtensionState);
}

function resetExtensionState(): void {
  const confirmed = window.confirm(getExtensionMessage('popupResetConfirm'));
  if (!confirmed) return;

  chrome.storage.local.clear(() => {
    chrome.storage.sync.clear(() => {
      chrome.storage.sync.set(DEFAULT_OPTIONS, () => {
        applyOptionsToControls(DEFAULT_OPTIONS);
        broadcastPageReset(() => {
          window.alert(getExtensionMessage('popupResetComplete'));
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
