/**
 * First-install onboarding page.
 *
 * The controls write the same sync-storage options as the popup while the
 * adjacent mock chat reflects each choice immediately.
 */
import { CHAT_SKIN_OPTIONS, DEFAULT_CHAT_SKIN, type ChatSkin } from '../shared/chat-skins';
import {
  createBoltIcon,
  createGamesIcon,
  createInboxIcon,
  createPlaygroundIcon,
  createSplitTranslateIcon,
  createTranslateIcon
} from '../shared/icons';
import { LANGUAGE_OPTIONS } from '../shared/languages';
import {
  DEFAULT_OPTIONS,
  getTargetLanguageUpdate,
  normalizeOptions,
  type Options,
  type TranslationDisplay
} from '../shared/options';
import { animateSettingIcon, SETTING_ICON_ANIMATIONS } from '../shared/setting-icon-animations';
import {
  getExtensionMessage,
  getLocalizedLanguageLabel,
  localizeExtensionPage
} from '../shared/extension-page-i18n';
import { createOnboardingPreview } from './preview';
import { initMenuPreview } from './menu-preview';
import { initProfilePreview } from './profile-preview';
import { initInboxPreview } from './inbox-preview';

interface OnboardingControls {
  chatPreview: HTMLElement;
  chatSkin: HTMLSelectElement;
  liteModeEnabled: HTMLInputElement;
  playgroundEnabled: HTMLInputElement;
  targetLanguage: HTMLSelectElement;
  translationDisplay: HTMLSelectElement;
  translationDisplayRow: HTMLElement;
}

const TRANSLATION_DISPLAY_COLLAPSED_CLASS = 'translation-display-row-collapsed';
const TRANSLATION_DISPLAY_ANIMATION_MS = 180;
let translationDisplayVisibilityToken = 0;

initOnboarding();

export function initOnboarding(): void {
  const controls = getOnboardingControls();
  if (!controls) return;

  const uiLocale = localizeExtensionPage(true);
  installIcons();
  populateLanguageOptions(controls.targetLanguage, uiLocale);
  populateChatSkinOptions(controls.chatSkin);

  const preview = createOnboardingPreview(controls.chatPreview, uiLocale);
  if (!preview) return;

  let lastKnownTranslationTarget = DEFAULT_OPTIONS.lastTranslationTarget;

  chrome.storage.sync.get(DEFAULT_OPTIONS, (storedOptions: Partial<Options>) => {
    const options = normalizeOptions(storedOptions);
    lastKnownTranslationTarget = options.lastTranslationTarget;
    controls.chatSkin.value = options.chatSkin;
    controls.liteModeEnabled.checked = options.liteModeEnabled;
    controls.playgroundEnabled.checked = options.playgroundEnabled;
    controls.targetLanguage.value = options.targetLanguage;
    controls.translationDisplay.value = options.translationDisplay;
    updateTranslationDisplayVisibility(
      controls.translationDisplayRow,
      Boolean(options.targetLanguage)
    );
    preview.applyOptions(options);
    // The menu reads these controls, so initialize it after saved options load.
    void initMenuPreview(controls.chatPreview, controls, () => {
      controls.targetLanguage.value = controls.targetLanguage.value ? '' : lastKnownTranslationTarget;
      controls.targetLanguage.dispatchEvent(new Event('change'));
    });
    void initProfilePreview(controls.chatPreview);
    void initInboxPreview(controls.chatPreview);
  });

  controls.targetLanguage.addEventListener('change', () => {
    const targetLanguage = controls.targetLanguage.value;
    if (targetLanguage) {
      lastKnownTranslationTarget = targetLanguage;
      animateSettingIcon(
        document.querySelector('.translation-target-icon'),
        SETTING_ICON_ANIMATIONS.translation
      );
    }
    chrome.storage.sync.set(getTargetLanguageUpdate(targetLanguage, lastKnownTranslationTarget));
    updateTranslationDisplayVisibility(
      controls.translationDisplayRow,
      Boolean(targetLanguage),
      true
    );
    preview.setTargetLanguage(targetLanguage);
  });

  controls.translationDisplay.addEventListener('change', () => {
    const translationDisplay = controls.translationDisplay.value as TranslationDisplay;
    animateSettingIcon(
      document.querySelector('.translation-display-icon'),
      SETTING_ICON_ANIMATIONS.translationDisplay
    );
    chrome.storage.sync.set({ translationDisplay });
    preview.setTranslationDisplay(translationDisplay);
  });

  controls.chatSkin.addEventListener('change', () => {
    const chatSkin = controls.chatSkin.value as ChatSkin;
    if (chatSkin !== DEFAULT_CHAT_SKIN) {
      animateSettingIcon(
        document.querySelector('.chat-skin-icon'),
        SETTING_ICON_ANIMATIONS.chatSkin
      );
    }
    chrome.storage.sync.set({ chatSkin });
    preview.setChatSkin(chatSkin);
  });

  controls.playgroundEnabled.addEventListener('change', () => {
    const playgroundEnabled = controls.playgroundEnabled.checked;
    chrome.storage.sync.set({ playgroundEnabled });
    preview.setPlaygroundEnabled(playgroundEnabled);
    if (playgroundEnabled) {
      animateSettingIcon(
        document.querySelector('#onboardingPlaygroundIcon .playground-joystick-icon'),
        SETTING_ICON_ANIMATIONS.playgroundJoystick
      );
      animateSettingIcon(
        document.querySelector('#previewGamesIcon .game-invites-icon'),
        SETTING_ICON_ANIMATIONS.gameInvites
      );
    }
  });

  controls.liteModeEnabled.addEventListener('change', () => {
    const liteModeEnabled = controls.liteModeEnabled.checked;
    if (liteModeEnabled) {
      animateSettingIcon(
        document.querySelector('#onboardingLiteIcon .lite-mode-icon'),
        SETTING_ICON_ANIMATIONS.liteMode
      );
    }
    chrome.storage.sync.set({ liteModeEnabled });
    preview.setLiteModeEnabled(liteModeEnabled);
  });
}

function getOnboardingControls(): OnboardingControls | null {
  const chatPreview = document.querySelector<HTMLElement>('#chatPreview');
  const chatSkin = document.querySelector<HTMLSelectElement>('#onboardingChatSkin');
  const liteModeEnabled = document.querySelector<HTMLInputElement>('#onboardingLiteModeEnabled');
  const playgroundEnabled = document.querySelector<HTMLInputElement>(
    '#onboardingPlaygroundEnabled'
  );
  const targetLanguage = document.querySelector<HTMLSelectElement>('#onboardingTargetLanguage');
  const translationDisplay = document.querySelector<HTMLSelectElement>(
    '#onboardingTranslationDisplay'
  );
  const translationDisplayRow = document.querySelector<HTMLElement>(
    '#onboardingTranslationDisplayRow'
  );

  if (
    !chatPreview ||
    !chatSkin ||
    !liteModeEnabled ||
    !playgroundEnabled ||
    !targetLanguage ||
    !translationDisplay ||
    !translationDisplayRow
  ) {
    return null;
  }

  return {
    chatPreview,
    chatSkin,
    liteModeEnabled,
    playgroundEnabled,
    targetLanguage,
    translationDisplay,
    translationDisplayRow
  };
}

function populateLanguageOptions(select: HTMLSelectElement, uiLocale: string): void {
  select.replaceChildren(createOption('', getExtensionMessage('off', undefined, 'Off')));
  for (const [value, label] of LANGUAGE_OPTIONS) {
    select.appendChild(createOption(value, getLocalizedLanguageLabel(value, uiLocale) || label));
  }
}

function populateChatSkinOptions(select: HTMLSelectElement): void {
  select.replaceChildren(
    ...CHAT_SKIN_OPTIONS.map(({ id, labelMessage }) =>
      createOption(
        id,
        getExtensionMessage(labelMessage, undefined, id === 'system' ? 'Default' : 'Aero')
      )
    )
  );
}

function createOption(value: string, label: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function updateTranslationDisplayVisibility(
  row: HTMLElement,
  visible: boolean,
  animated = false
): void {
  const token = ++translationDisplayVisibilityToken;
  const shouldAnimate = animated && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  row.toggleAttribute('aria-hidden', !visible);

  if (visible) {
    if (!shouldAnimate) {
      row.hidden = false;
      row.classList.remove(TRANSLATION_DISPLAY_COLLAPSED_CLASS);
      return;
    }

    row.classList.add(TRANSLATION_DISPLAY_COLLAPSED_CLASS);
    row.hidden = false;
    void row.offsetHeight;
    if (token === translationDisplayVisibilityToken) {
      row.classList.remove(TRANSLATION_DISPLAY_COLLAPSED_CLASS);
    }
    return;
  }

  row.classList.add(TRANSLATION_DISPLAY_COLLAPSED_CLASS);
  if (!shouldAnimate) {
    row.hidden = true;
    return;
  }

  window.setTimeout(() => {
    if (token === translationDisplayVisibilityToken) row.hidden = true;
  }, TRANSLATION_DISPLAY_ANIMATION_MS);
}

function installIcons(): void {
  replaceIcon(
    'onboardingTranslationIcon',
    createSplitTranslateIcon({
      iconClassName: 'translation-target-icon',
      sourceClassName: 'translation-source-mark',
      targetClassName: 'translation-target-mark'
    })
  );
  replaceIcon('onboardingPlaygroundIcon', createPlaygroundIcon(), 'playground-joystick-icon');
  replaceIcon(
    'onboardingLiteIcon',
    createBoltIcon({ drawMaskId: 'ytcq-onboarding-lite-mode-draw-mask' }),
    'lite-mode-icon'
  );
  replaceIcon('previewGamesIcon', createGamesIcon(), 'game-invites-icon');
  replaceIcon('previewInboxIcon', createInboxIcon(true));
  replaceIcon('previewInlineTranslateIcon', createTranslateIcon());
  replaceIcon('previewComposerTranslateIcon', createTranslateIcon());
}

function replaceIcon(id: string, icon: SVGSVGElement, iconClassName = ''): void {
  if (iconClassName) icon.classList.add(iconClassName);
  document.getElementById(id)?.replaceChildren(icon);
}
