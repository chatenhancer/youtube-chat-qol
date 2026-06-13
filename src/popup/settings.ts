import { LANGUAGE_OPTIONS } from '../shared/languages';
import {
  PLAYGROUND_PROFILE_MESSAGE_TYPE,
  type PlaygroundProfileResponse
} from '../shared/playground-identity';
import { playSoftChime } from '../shared/sounds/soft-chime';
import {
  DEFAULT_OPTIONS,
  getPlaygroundDisabledUpdate,
  getTargetLanguageUpdate,
  normalizeOptions,
  type Options
} from '../shared/options';
import { getSettingsControls } from './controls';
import {
  animatePopupDisplayIcon,
  animatePopupSoundIcon,
  animatePopupStartupEffectIcon,
  animatePopupTranslationIcon
} from './animations';
import { getExtensionMessage, getLocalizedLanguageLabel } from './i18n';
import { prefersReducedMotion } from './motion';

const PLAYGROUND_GROUP_COLLAPSED_CLASS = 'playground-group-collapsed';
const PLAYGROUND_GROUP_ANIMATION_MS = 180;

let lastKnownTranslationTarget = DEFAULT_OPTIONS.lastTranslationTarget;
let playgroundGamesVisibilityToken = 0;
let playgroundProfileRequestToken = 0;

export function initSettingsControls(popupLocale: string): void {
  const settingsControls = getSettingsControls();
  if (!settingsControls) return;

  const {
    targetLanguage,
    translationDisplay,
    sound,
    startupEffect,
    playgroundEnabled,
    playgroundGamesAvailable,
    playgroundProfileToggle
  } = settingsControls;

  targetLanguage.appendChild(createLanguageOption('', getExtensionMessage('off')));
  for (const [value, label] of LANGUAGE_OPTIONS) {
    targetLanguage.appendChild(createLanguageOption(value, getLocalizedLanguageLabel(value, popupLocale) || label));
  }

  chrome.storage.sync.get(DEFAULT_OPTIONS, (storedOptions: Partial<Options>) => {
    applyOptionsToControls(storedOptions);
  });

  targetLanguage.addEventListener('change', () => {
    const targetLanguageValue = targetLanguage.value || '';
    if (targetLanguageValue) {
      lastKnownTranslationTarget = targetLanguageValue;
      animatePopupTranslationIcon();
    }
    save(getTargetLanguageUpdate(targetLanguageValue, lastKnownTranslationTarget));
  });

  translationDisplay.addEventListener('change', () => {
    animatePopupDisplayIcon();
    save({ translationDisplay: translationDisplay.value as Options['translationDisplay'] });
  });

  sound.addEventListener('change', () => {
    const enabled = sound.checked;
    if (enabled) {
      animatePopupSoundIcon();
      playSoftChime();
    }
    save({ sound: enabled });
  });

  startupEffect.addEventListener('change', () => {
    const enabled = startupEffect.checked;
    if (enabled) animatePopupStartupEffectIcon();
    save({ startupEffect: enabled });
  });

  playgroundEnabled.addEventListener('change', () => {
    const enabled = playgroundEnabled.checked;
    if (!enabled) clearPlaygroundOptionControls();
    updatePlaygroundProfile(enabled);
    updatePlaygroundGamesVisibility(enabled, true);
    save(enabled ? { playgroundEnabled: true } : getPlaygroundDisabledUpdate());
  });

  playgroundGamesAvailable.addEventListener('change', () => {
    save({ playgroundGamesAvailable: playgroundGamesAvailable.checked });
  });

  playgroundProfileToggle.addEventListener('click', () => {
    const expanded = playgroundProfileToggle.getAttribute('aria-expanded') === 'true';
    setPlaygroundProfileDetailsExpanded(!expanded);
  });
}

export function applyOptionsToControls(options: Partial<Options>): void {
  const settingsControls = getSettingsControls();
  if (!settingsControls) return;

  const {
    targetLanguage,
    translationDisplay,
    sound,
    startupEffect,
    playgroundEnabled,
    playgroundGamesAvailable
  } = settingsControls;

  const normalized = normalizeOptions(options);
  lastKnownTranslationTarget = normalized.lastTranslationTarget;
  targetLanguage.value = normalized.targetLanguage;
  translationDisplay.value = normalized.translationDisplay;
  sound.checked = normalized.sound;
  startupEffect.disabled = prefersReducedMotion();
  startupEffect.checked = normalized.startupEffect && !startupEffect.disabled;
  playgroundEnabled.checked = normalized.playgroundEnabled;
  playgroundGamesAvailable.checked = normalized.playgroundEnabled && normalized.playgroundGamesAvailable;
  updatePlaygroundProfile(normalized.playgroundEnabled);
  updatePlaygroundGamesVisibility(normalized.playgroundEnabled);
}

function save(values: Partial<Options>): void {
  chrome.storage.sync.set(values);
}

function updatePlaygroundGamesVisibility(playgroundEnabled: boolean, animated = false): void {
  const settingsControls = getSettingsControls();
  if (!settingsControls) return;

  const section = settingsControls.playgroundGamesSection;
  const token = ++playgroundGamesVisibilityToken;
  const shouldAnimate = animated && !prefersReducedMotion();

  if (playgroundEnabled) {
    section.hidden = false;
    if (!shouldAnimate) {
      section.classList.remove(PLAYGROUND_GROUP_COLLAPSED_CLASS);
      return;
    }

    section.classList.add(PLAYGROUND_GROUP_COLLAPSED_CLASS);
    window.setTimeout(() => {
      if (token === playgroundGamesVisibilityToken) {
        section.classList.remove(PLAYGROUND_GROUP_COLLAPSED_CLASS);
      }
    }, 0);
    return;
  }

  section.classList.add(PLAYGROUND_GROUP_COLLAPSED_CLASS);
  if (!shouldAnimate) {
    section.hidden = true;
    return;
  }

  window.setTimeout(() => {
    if (token === playgroundGamesVisibilityToken) section.hidden = true;
  }, PLAYGROUND_GROUP_ANIMATION_MS);
}

function clearPlaygroundOptionControls(): void {
  const settingsControls = getSettingsControls();
  if (settingsControls) {
    settingsControls.playgroundGamesAvailable.checked = false;
  }
}

function updatePlaygroundProfile(playgroundEnabled: boolean): void {
  const settingsControls = getSettingsControls();
  if (!settingsControls) return;

  const { playgroundProfile, playgroundProfileName } = settingsControls;
  const token = ++playgroundProfileRequestToken;
  setPlaygroundProfileDetailsExpanded(false);
  playgroundProfile.hidden = true;
  playgroundProfileName.textContent = '';

  if (!playgroundEnabled) return;

  chrome.runtime.sendMessage({ type: PLAYGROUND_PROFILE_MESSAGE_TYPE }, (response?: PlaygroundProfileResponse) => {
    if (token !== playgroundProfileRequestToken) return;
    if (chrome.runtime.lastError || !response?.ok) return;

    const displayName = typeof response.profile?.displayName === 'string'
      ? response.profile.displayName.trim()
      : '';
    if (!displayName) return;

    playgroundProfileName.textContent = displayName;
    playgroundProfile.hidden = false;
  });
}

function setPlaygroundProfileDetailsExpanded(expanded: boolean): void {
  const settingsControls = getSettingsControls();
  if (!settingsControls) return;

  settingsControls.playgroundProfileToggle.setAttribute('aria-expanded', String(expanded));
  settingsControls.playgroundProfileDetails.hidden = !expanded;
}

function createLanguageOption(value: string, label: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}
