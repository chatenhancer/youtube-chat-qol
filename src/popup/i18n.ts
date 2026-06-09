export function localizePopup(): string {
  const popupLocale = getBrowserUiLocale();
  document.documentElement.lang = popupLocale;

  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    if (key) element.textContent = getExtensionMessage(key);
  });

  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((element) => {
    const key = element.dataset.i18nTitle;
    if (key) element.title = getExtensionMessage(key);
  });

  document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach((element) => {
    const key = element.dataset.i18nAriaLabel;
    if (key) element.setAttribute('aria-label', getExtensionMessage(key));
  });

  return popupLocale;
}

export function getBrowserUiLocale(): string {
  return chrome.i18n?.getUILanguage?.() || navigator.language || 'en';
}

export function getExtensionMessage(key: string, substitutions?: string | string[]): string {
  return chrome.i18n?.getMessage?.(key, substitutions) || key;
}

export function getLocalizedLanguageLabel(languageCode: string, locale: string): string {
  try {
    const displayName = new Intl.DisplayNames([locale], { type: 'language' }).of(languageCode);
    if (displayName) return displayName;
  } catch {
    // Fall back to the static English catalog from LANGUAGE_OPTIONS.
  }

  return '';
}
