import { jsx, el } from '../../shared/jsx-dom';
import { themeBorder } from './appearance';
import {
  APPLIED_CUSTOM_THEME_KEY,
  loadCustomThemes,
  isPreinstalledTheme,
  selectedTheme,
  normalizeCustomTheme,
  type CustomTheme
} from '../../shared/custom-themes';

const STYLE_ID = 'ytcq-custom-theme-frame';
const DISPOSE_EVENT = 'ytcq:watch-theme-dispose';

export function initWatchPageTheme(): void {
  // Replace the prior instance after an unpacked extension reload.
  document.dispatchEvent(new Event(DISPOSE_EVENT));
  document.getElementById(STYLE_ID)?.remove();
  const lifetime = new AbortController();
  const style = el<HTMLStyleElement>(<style id={STYLE_ID} />);
  document.documentElement.append(style);
  let selected: unknown;
  let applied: CustomTheme | null = null;
  let preset: CustomTheme | null = null;

  function render(): void {
    if (lifetime.signal.aborted) return;
    const theme = selectedTheme(selected, applied, preset);
    // YouTube owns this outline outside the chat iframe. CSS follows its native
    // light/dark mode and also covers chat frames added after page navigation.
    // Clip once at the bordered wrapper; the iframe's own rounding leaves gaps.
    style.textContent = theme
      ? `ytd-live-chat-frame { border-color: ${themeBorder(theme.border, 'light')} !important; }
         :root[dark] ytd-live-chat-frame { border-color: ${themeBorder(theme.border, 'dark')} !important; }
         ytd-live-chat-frame iframe#chatframe { border-radius: 0 !important; }`
      : '';
  }

  function storageChanged(
    changes: Record<string, chrome.storage.StorageChange>,
    area: string
  ): void {
    if (area === 'sync' && changes.chatSkin) {
      selected = changes.chatSkin.newValue;
    } else if (area === 'local' && changes[APPLIED_CUSTOM_THEME_KEY]) {
      applied = normalizeCustomTheme(changes[APPLIED_CUSTOM_THEME_KEY].newValue);
    } else {
      return;
    }
    render();
  }

  function dispose(): void {
    lifetime.abort();
    chrome.storage?.onChanged.removeListener(storageChanged);
    style.remove();
  }

  chrome.storage.onChanged.addListener(storageChanged);
  document.addEventListener(DISPOSE_EVENT, dispose, { signal: lifetime.signal });
  void Promise.all([
    chrome.storage.sync.get('chatSkin'),
    chrome.storage.local.get(APPLIED_CUSTOM_THEME_KEY),
    loadCustomThemes()
  ])
    .then(([options, local, library]) => {
      preset = library.find(isPreinstalledTheme) || null;
      selected = options.chatSkin;
      applied = normalizeCustomTheme(local[APPLIED_CUSTOM_THEME_KEY]);
      render();
    })
    .catch(() => {});
}
