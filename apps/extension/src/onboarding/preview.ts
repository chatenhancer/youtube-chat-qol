import type { ChatSkin, ChatSkinTheme } from '../shared/chat-skins';
import type { TranslationDisplay } from '../shared/options';
import { getExtensionMessage } from '../shared/extension-page-i18n';

interface PreviewSourceMessage {
  language: string;
  text: string;
}

interface PreviewElements {
  featuredMessage: HTMLElement;
  gamesIcon: HTMLElement;
  inlineTranslateIcon: HTMLElement;
  primaryText: HTMLElement;
  primaryTextLead: HTMLElement;
  primaryTextTail: HTMLElement;
  secondaryText: HTMLElement;
  translationLine: HTMLElement;
}

interface PreviewState {
  chatSkin: ChatSkin;
  liteModeEnabled: boolean;
  playgroundEnabled: boolean;
  source: PreviewSourceMessage;
  status: 'idle' | 'loading' | 'translated' | 'error';
  targetLanguage: string;
  translatedText: string;
  translationDisplay: TranslationDisplay;
}

export interface OnboardingPreview {
  applyOptions(options: {
    chatSkin: ChatSkin;
    liteModeEnabled: boolean;
    playgroundEnabled: boolean;
    targetLanguage: string;
    translationDisplay: TranslationDisplay;
  }): void;
  setChatSkin(chatSkin: ChatSkin): void;
  setLiteModeEnabled(enabled: boolean): void;
  setPlaygroundEnabled(enabled: boolean): void;
  setTargetLanguage(targetLanguage: string): void;
  setTranslationDisplay(display: TranslationDisplay): void;
}

export type PreviewTranslator = (text: string, targetLanguage: string) => Promise<string>;

const DARK_COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';
const PREVIEW_SOURCE_MESSAGES: readonly PreviewSourceMessage[] = [
  { language: 'zh-CN', text: '看来现在可以正常工作了' },
  { language: 'es', text: 'Parece que ya funciona' },
  { language: 'ja', text: 'ちゃんと動いているみたい' },
  { language: 'fr', text: 'On dirait que ça marche maintenant' }
];

export function createOnboardingPreview(
  root: HTMLElement,
  uiLocale: string,
  translate: PreviewTranslator = translatePreviewText
): OnboardingPreview | null {
  const elements = getPreviewElements(root);
  if (!elements) return null;

  const colorScheme = window.matchMedia(DARK_COLOR_SCHEME_QUERY);
  let translationRequestToken = 0;
  const state: PreviewState = {
    chatSkin: 'system',
    liteModeEnabled: false,
    playgroundEnabled: false,
    source: getPreviewSourceMessage(uiLocale, ''),
    status: 'idle',
    targetLanguage: '',
    translatedText: '',
    translationDisplay: 'replace'
  };

  const render = (): void => {
    const chatSkinTheme: ChatSkinTheme = colorScheme.matches ? 'dark' : 'light';
    root.dataset.chatSkin = state.chatSkin;
    root.dataset.chatTheme = chatSkinTheme;
    root.dataset.liteModeEnabled = String(state.liteModeEnabled);
    root.dataset.playgroundEnabled = String(state.playgroundEnabled);
    root.dataset.translationState = state.status;
    applyChatSkinTheme(root, state.chatSkin, chatSkinTheme);
    setPreviewElementVisible(elements.gamesIcon, state.playgroundEnabled);
    elements.featuredMessage.classList.toggle(
      'ytcq-translation-replaced',
      state.status === 'translated' && state.translationDisplay === 'replace'
    );

    elements.primaryText.lang = state.source.language;
    elements.secondaryText.lang = state.targetLanguage;

    if (!state.targetLanguage || state.status === 'idle') {
      setPreviewPrimaryText(elements, state.source.text);
      setPreviewElementVisible(elements.inlineTranslateIcon, false);
      setPreviewElementVisible(elements.translationLine, false);
      return;
    }

    if (state.status === 'loading') {
      setPreviewPrimaryText(elements, state.source.text);
      elements.secondaryText.textContent = getExtensionMessage(
        'onboardingTranslating',
        undefined,
        'Translating…'
      );
      setPreviewElementVisible(elements.inlineTranslateIcon, false);
      setPreviewElementVisible(elements.translationLine, true);
      return;
    }

    if (state.status === 'error') {
      setPreviewPrimaryText(elements, state.source.text);
      elements.secondaryText.textContent = getExtensionMessage(
        'onboardingTranslationUnavailable',
        undefined,
        'Preview unavailable right now.'
      );
      setPreviewElementVisible(elements.inlineTranslateIcon, false);
      setPreviewElementVisible(elements.translationLine, true);
      return;
    }

    if (state.translationDisplay === 'replace') {
      elements.primaryText.lang = state.targetLanguage;
      setPreviewPrimaryText(elements, state.translatedText);
      setPreviewElementVisible(elements.inlineTranslateIcon, true);
      setPreviewElementVisible(elements.translationLine, false);
      return;
    }

    setPreviewPrimaryText(elements, state.source.text);
    elements.secondaryText.textContent = state.translatedText;
    setPreviewElementVisible(elements.inlineTranslateIcon, false);
    setPreviewElementVisible(elements.translationLine, true);
  };

  colorScheme.addEventListener('change', render);
  render();

  const setTargetLanguage = (targetLanguage: string): void => {
    state.targetLanguage = targetLanguage;
    state.source = getPreviewSourceMessage(uiLocale, targetLanguage);
    state.translatedText = '';
    const requestToken = ++translationRequestToken;

    if (!targetLanguage) {
      state.status = 'idle';
      render();
      return;
    }

    state.status = 'loading';
    render();
    void translate(state.source.text, targetLanguage)
      .then((translatedText) => {
        if (requestToken !== translationRequestToken) return;
        state.translatedText = translatedText;
        state.status = 'translated';
        render();
      })
      .catch(() => {
        if (requestToken !== translationRequestToken) return;
        state.status = 'error';
        render();
      });
  };

  return {
    applyOptions(options): void {
      state.chatSkin = options.chatSkin;
      state.liteModeEnabled = options.liteModeEnabled;
      state.playgroundEnabled = options.playgroundEnabled;
      state.translationDisplay = options.translationDisplay;
      setTargetLanguage(options.targetLanguage);
    },
    setChatSkin(chatSkin): void {
      state.chatSkin = chatSkin;
      render();
    },
    setLiteModeEnabled(enabled): void {
      state.liteModeEnabled = enabled;
      render();
    },
    setPlaygroundEnabled(enabled): void {
      state.playgroundEnabled = enabled;
      render();
    },
    setTargetLanguage,
    setTranslationDisplay(display): void {
      state.translationDisplay = display;
      render();
    }
  };
}

export function getPreviewSourceMessage(uiLocale: string, targetLanguage: string): PreviewSourceMessage {
  const uiLanguage = getBaseLanguage(uiLocale);
  const target = getBaseLanguage(targetLanguage);
  return PREVIEW_SOURCE_MESSAGES.find(({ language }) => {
    const source = getBaseLanguage(language);
    return source !== uiLanguage && source !== target;
  }) || PREVIEW_SOURCE_MESSAGES[0];
}

export function translatePreviewText(text: string, targetLanguage: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: 'ytcq:translate',
        text,
        targetLanguage
      },
      (response?: { ok?: boolean; translatedText?: string; error?: string }) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        const translatedText = response?.translatedText?.trim();
        if (!response?.ok || !translatedText) {
          reject(new Error(response?.error || 'Translation preview failed.'));
          return;
        }

        resolve(translatedText);
      }
    );
  });
}

function getPreviewElements(root: HTMLElement): PreviewElements | null {
  const featuredMessage = root.querySelector<HTMLElement>('#previewFeaturedMessage');
  const gamesIcon = root.querySelector<HTMLElement>('#previewGamesIcon');
  const inlineTranslateIcon = root.querySelector<HTMLElement>('#previewInlineTranslateIcon');
  const primaryText = root.querySelector<HTMLElement>('#previewPrimaryText');
  const primaryTextLead = root.querySelector<HTMLElement>('#previewPrimaryTextLead');
  const primaryTextTail = root.querySelector<HTMLElement>('#previewPrimaryTextTail');
  const secondaryText = root.querySelector<HTMLElement>('#previewSecondaryText');
  const translationLine = root.querySelector<HTMLElement>('#previewTranslationLine');

  if (
    !featuredMessage ||
    !gamesIcon ||
    !inlineTranslateIcon ||
    !primaryText ||
    !primaryTextLead ||
    !primaryTextTail ||
    !secondaryText ||
    !translationLine
  ) {
    return null;
  }

  return {
    featuredMessage,
    gamesIcon,
    inlineTranslateIcon,
    primaryText,
    primaryTextLead,
    primaryTextTail,
    secondaryText,
    translationLine
  };
}

function setPreviewPrimaryText(elements: PreviewElements, text: string): void {
  const wordTail = text.match(/^(.*\s)(\S+)$/u);
  if (wordTail) {
    elements.primaryTextLead.textContent = wordTail[1];
    elements.primaryTextTail.textContent = wordTail[2];
    return;
  }

  const characters = Array.from(text);
  elements.primaryTextTail.textContent = characters.pop() || '';
  elements.primaryTextLead.textContent = characters.join('');
}

function applyChatSkinTheme(
  root: HTMLElement,
  chatSkin: ChatSkin,
  chatSkinTheme: ChatSkinTheme
): void {
  const pageRoot = root.ownerDocument.documentElement;
  if (chatSkin === 'aero') {
    pageRoot.setAttribute('data-ytcq-chat-skin', chatSkin);
    pageRoot.setAttribute('data-ytcq-chat-skin-theme', chatSkinTheme);
    return;
  }

  pageRoot.removeAttribute('data-ytcq-chat-skin');
  pageRoot.removeAttribute('data-ytcq-chat-skin-theme');
}

function getBaseLanguage(languageCode: string): string {
  return languageCode.trim().toLowerCase().replaceAll('_', '-').split('-')[0];
}

function setPreviewElementVisible(element: HTMLElement, visible: boolean): void {
  const wasVisible = element.classList.contains('preview-element-visible');

  if (visible) {
    element.classList.remove('preview-element-exiting');
    element.classList.add('preview-element-visible');
  } else if (wasVisible) {
    element.classList.remove('preview-element-visible');
    element.classList.add('preview-element-exiting');
    element.addEventListener('animationend', function handleExitAnimationEnd(event) {
      if (event.target !== element) return;
      element.classList.remove('preview-element-exiting');
      element.removeEventListener('animationend', handleExitAnimationEnd);
    });
  }

  element.setAttribute('aria-hidden', String(!visible));
}
