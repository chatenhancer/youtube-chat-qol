import { jsx, el } from '../shared/jsx-dom';
import { CHAT_SKIN_OPTIONS, isCustomChatSkin, normalizeChatSkin } from '../shared/chat-skins';
import {
  CUSTOM_THEMES_KEY,
  applyCustomTheme,
  customThemeSkin,
  loadCustomThemes,
  isPreinstalledTheme,
  type CustomTheme
} from '../shared/custom-themes';
import { showExtensionDialog, closeExtensionDialog } from '../shared/extension-dialog';
import { getExtensionMessage as message } from './i18n';

export function initThemePicker(picker: HTMLSelectElement): void {
  const edit = document.querySelector<HTMLButtonElement>('#editThemes');
  if (!edit) return;
  let themes: CustomTheme[] = [];
  edit.addEventListener('click', () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('themes.html') });
  });

  async function refresh(): Promise<void> {
    const [library, stored] = await Promise.all([
      loadCustomThemes(),
      chrome.storage.sync.get('chatSkin')
    ]);
    themes = library;
    picker.replaceChildren(
      ...CHAT_SKIN_OPTIONS.map(({ id, labelMessage }) => new Option(message(labelMessage), id)),
      ...(themes.some((theme) => !isPreinstalledTheme(theme))
        ? [
            el<HTMLOptGroupElement>(
              <optgroup label={message('themeCustom')}>
                {themes
                  .filter((theme) => !isPreinstalledTheme(theme))
                  .map((theme) => (
                    <option value={customThemeSkin(theme)}>{theme.name}</option>
                  ))}
              </optgroup>
            )
          ]
        : [])
    );
    picker.value = normalizeChatSkin(stored.chatSkin);
    if (!picker.value) picker.value = 'system';
  }
  function reportError(): void {
    showExtensionDialog({
      message: message('themeApplyError'),
      actions: [{ label: message('close'), onClick: closeExtensionDialog }]
    });
  }
  picker.addEventListener('change', () => {
    if (!isCustomChatSkin(picker.value)) return;
    const selected = themes.find((theme) => customThemeSkin(theme) === picker.value);
    if (selected)
      void applyCustomTheme(selected).catch(() => {
        reportError();
        void refresh().catch(reportError);
      });
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if ((area === 'local' && changes[CUSTOM_THEMES_KEY]) || (area === 'sync' && changes.chatSkin)) {
      void refresh().catch(reportError);
    }
  });
  void refresh().catch(reportError);
}
