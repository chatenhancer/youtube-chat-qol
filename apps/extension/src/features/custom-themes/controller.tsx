import { type ChatSkin } from '../../shared/chat-skins';
import {
  APPLIED_CUSTOM_THEME_KEY,
  normalizeCustomTheme,
  loadCustomThemes,
  isPreinstalledTheme,
  selectedTheme,
  type CustomTheme
} from '../../shared/custom-themes';
import { createThemeStyleCache, customThemeFontFace } from './styles';
import { jsx, el } from '../../shared/jsx-dom';

const STYLE_ID = 'ytcq-custom-theme-values';
const SKIN_ATTRIBUTE = 'data-ytcq-chat-skin';
const MODE_ATTRIBUTE = 'data-ytcq-chat-skin-theme';

export function createChatThemeController(): {
  apply: (skin: ChatSkin) => void;
  reset: () => void;
  dispose: () => void;
} {
  const root = document.documentElement;
  document.getElementById(STYLE_ID)?.remove();
  let selected: ChatSkin = 'system';
  let applied: CustomTheme | null = null;
  let preset: CustomTheme | null = null;
  let style: HTMLStyleElement | null = null;
  let disposed = false;
  const themeStyles = createThemeStyleCache(render);

  function render(): void {
    if (disposed) return;
    const theme = selectedTheme(selected, applied, preset);
    const skin = theme ? 'custom' : 'system';
    const mode = root.hasAttribute('dark') ? 'dark' : 'light';
    if (theme) {
      if (!style) {
        style = el<HTMLStyleElement>(<style id={STYLE_ID} />);
        root.append(style);
      }
      const css = `${customThemeFontFace(theme)}:root[data-ytcq-chat-skin="custom"]{${themeStyles(theme, mode)};color-scheme:${mode}}`;
      if (style.textContent !== css) style.textContent = css;
    } else {
      style?.remove();
      style = null;
      themeStyles.clear();
    }
    if (skin === 'system') {
      root.removeAttribute(SKIN_ATTRIBUTE);
      root.removeAttribute(MODE_ATTRIBUTE);
      root.removeAttribute('data-ytcq-theme-finish');
    } else {
      root.setAttribute('data-ytcq-theme-finish', theme!.finish);
      if (root.getAttribute(SKIN_ATTRIBUTE) !== skin) root.setAttribute(SKIN_ATTRIBUTE, skin);
      if (root.getAttribute(MODE_ATTRIBUTE) !== mode) root.setAttribute(MODE_ATTRIBUTE, mode);
    }
  }

  function storageChanged(
    changes: Record<string, chrome.storage.StorageChange>,
    area: string
  ): void {
    if (area !== 'local' || !changes[APPLIED_CUSTOM_THEME_KEY]) return;
    applied = normalizeCustomTheme(changes[APPLIED_CUSTOM_THEME_KEY].newValue);
    render();
  }

  chrome.storage.onChanged.addListener(storageChanged);
  void loadCustomThemes()
    .then((themes) => {
      preset = themes.find(isPreinstalledTheme) || null;
      render();
    })
    .catch(() => {});
  chrome.storage.local.get(APPLIED_CUSTOM_THEME_KEY, (stored) => {
    if (disposed) return;
    applied = normalizeCustomTheme(stored[APPLIED_CUSTOM_THEME_KEY]);
    render();
  });
  function reset(): void {
    selected = 'system';
    render();
  }

  return {
    apply(skin) {
      selected = skin;
      render();
    },
    reset,
    dispose() {
      reset();
      disposed = true;
      chrome.storage?.onChanged.removeListener(storageChanged);
    }
  };
}
