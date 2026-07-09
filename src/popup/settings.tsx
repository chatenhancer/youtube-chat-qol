import { LANGUAGE_OPTIONS } from '../shared/languages';
import { CHAT_SKIN_OPTIONS } from '../shared/chat-skins';
import { createSplitTranslateIcon } from '../shared/icons';
import {
  getPlaygroundAvatarPresentation,
  PLAYGROUND_PROFILE_MESSAGE_TYPE,
  PLAYGROUND_PROFILE_STATS_MESSAGE_TYPE,
  PLAYGROUND_PROFILE_UPDATE_MESSAGE_TYPE,
  isValidPlaygroundDisplayName,
  normalizePlaygroundDisplayName,
  type PlaygroundProfile,
  type PlaygroundProfileResponse,
  type PlaygroundProfileStatsResponse
} from '../shared/playground/identity';
import { playAlertSoundPreview } from '../shared/sounds/alert-sounds';
import {
  DEFAULT_OPTIONS,
  getPlaygroundDisabledUpdate,
  getTargetLanguageUpdate,
  normalizeOptions,
  type Options
} from '../shared/options';
import { createLoadingSpinner } from '../shared/loading-spinner';
import { jsx, el } from '../shared/jsx-dom';
import { getSettingsControls } from './controls';
import {
  animatePopupChatSkinIcon,
  animatePopupDisplayIcon,
  animatePopupSoundIcon,
  animatePopupStartupEffectIcon,
  animatePopupTranslationIcon
} from './animations';
import { getExtensionMessage, getLocalizedLanguageLabel } from './i18n';
import { prefersReducedMotion } from './motion';

const PLAYGROUND_GROUP_COLLAPSED_CLASS = 'playground-group-collapsed';
const PLAYGROUND_GROUP_ANIMATION_MS = 180;
const TRANSLATION_TARGET_ICON_CLASS = 'option-icon translation-target-icon';

let lastKnownTranslationTarget = DEFAULT_OPTIONS.lastTranslationTarget;
let playgroundGamesVisibilityToken = 0;
let playgroundProfileRequestToken = 0;
let playgroundProfileStatsRequestToken = 0;

export function initSettingsControls(popupLocale: string): void {
  const settingsControls = getSettingsControls();
  if (!settingsControls) return;

  const {
    chatSkin,
    targetLanguage,
    translationDisplay,
    sound,
    startupEffect,
    playgroundEnabled,
    playgroundGamesAvailable,
    playgroundDisplayName,
    playgroundProfileToggle
  } = settingsControls;

  preparePopupTranslationIcon();
  populateChatSkinOptions(chatSkin);

  targetLanguage.appendChild(createSelectOption('', getExtensionMessage('off')));
  for (const [value, label] of LANGUAGE_OPTIONS) {
    targetLanguage.appendChild(
      createSelectOption(value, getLocalizedLanguageLabel(value, popupLocale) || label)
    );
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

  chatSkin.addEventListener('change', () => {
    const nextSkin = chatSkin.value as Options['chatSkin'];
    animatePopupChatSkinIcon();
    save({ chatSkin: nextSkin });
  });

  sound.addEventListener('change', () => {
    const enabled = sound.checked;
    if (enabled) {
      animatePopupSoundIcon();
      playAlertSoundPreview();
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

  playgroundDisplayName.addEventListener('input', () => {
    playgroundDisplayName.setCustomValidity('');
  });

  playgroundDisplayName.addEventListener('change', () => {
    savePlaygroundDisplayName();
  });

  playgroundDisplayName.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') playgroundDisplayName.blur();
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
    chatSkin,
    targetLanguage,
    translationDisplay,
    sound,
    startupEffect,
    playgroundEnabled,
    playgroundGamesAvailable
  } = settingsControls;

  const normalized = normalizeOptions(options);
  chatSkin.value = normalized.chatSkin;
  lastKnownTranslationTarget = normalized.lastTranslationTarget;
  targetLanguage.value = normalized.targetLanguage;
  translationDisplay.value = normalized.translationDisplay;
  sound.checked = normalized.sound;
  startupEffect.disabled = prefersReducedMotion();
  startupEffect.checked = normalized.startupEffect && !startupEffect.disabled;
  playgroundEnabled.checked = normalized.playgroundEnabled;
  playgroundGamesAvailable.checked =
    normalized.playgroundEnabled && normalized.playgroundGamesAvailable;
  updatePlaygroundProfile(normalized.playgroundEnabled);
  updatePlaygroundGamesVisibility(normalized.playgroundEnabled);
}

function save(values: Partial<Options>): void {
  chrome.storage.sync.set(values);
}

function preparePopupTranslationIcon(): void {
  const currentIcon = document.querySelector<HTMLElement>('.translation-target-icon');
  if (!currentIcon) return;

  currentIcon.replaceWith(
    createSplitTranslateIcon({
      iconClassName: TRANSLATION_TARGET_ICON_CLASS,
      sourceClassName: 'translation-source-mark',
      targetClassName: 'translation-target-mark'
    })
  );
}

function populateChatSkinOptions(chatSkin: HTMLSelectElement): void {
  chatSkin.replaceChildren(
    ...CHAT_SKIN_OPTIONS.map(({ id, labelMessage }) =>
      createSelectOption(id, getExtensionMessage(labelMessage))
    )
  );
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

  const {
    playgroundProfile,
    playgroundProfileAvatar,
    playgroundDisplayName,
    playgroundProfileName,
    playgroundProfileWins,
    playgroundProfileWinsCount
  } = settingsControls;
  const token = ++playgroundProfileRequestToken;
  ++playgroundProfileStatsRequestToken;
  setPlaygroundProfileDetailsExpanded(false);
  playgroundProfile.hidden = true;
  playgroundProfileAvatar.textContent = '';
  playgroundProfileAvatar.style.removeProperty('--playground-profile-avatar-bg');
  playgroundDisplayName.value = '';
  playgroundDisplayName.placeholder = '';
  playgroundDisplayName.setCustomValidity('');
  playgroundProfileName.textContent = '';
  updatePlaygroundProfileWins(playgroundProfileWins, playgroundProfileWinsCount, 0);

  if (!playgroundEnabled) return;

  chrome.runtime.sendMessage(
    { type: PLAYGROUND_PROFILE_MESSAGE_TYPE },
    (response?: PlaygroundProfileResponse) => {
      if (token !== playgroundProfileRequestToken) return;
      if (chrome.runtime.lastError || !response?.ok) return;

      const displayName =
        typeof response.profile?.displayName === 'string'
          ? response.profile.displayName.trim()
          : '';
      if (!displayName) return;

      renderPlaygroundProfile(response.profile, { winsLoading: true });
      requestPlaygroundProfileStats(response.profile.userId);
    }
  );
}

function savePlaygroundDisplayName(): void {
  const settingsControls = getSettingsControls();
  if (!settingsControls || !settingsControls.playgroundEnabled.checked) return;

  const input = settingsControls.playgroundDisplayName;
  const requested = input.value;
  const displayName = normalizePlaygroundDisplayName(requested);
  if (requested.trim() && !isValidPlaygroundDisplayName(requested)) {
    input.setCustomValidity(getExtensionMessage('playgroundDisplayNameInvalid'));
    input.reportValidity();
    return;
  }

  input.value = displayName;
  input.setCustomValidity('');
  const token = ++playgroundProfileRequestToken;
  chrome.runtime.sendMessage(
    {
      displayName,
      type: PLAYGROUND_PROFILE_UPDATE_MESSAGE_TYPE
    },
    (response?: PlaygroundProfileResponse) => {
      if (token !== playgroundProfileRequestToken) return;
      if (chrome.runtime.lastError || !response?.ok) {
        input.setCustomValidity(
          response?.ok === false
            ? response.error
            : getExtensionMessage('playgroundDisplayNameSaveFailed')
        );
        input.reportValidity();
        return;
      }

      renderPlaygroundProfile(response.profile, { preserveWins: true });
    }
  );
}

interface RenderPlaygroundProfileOptions {
  preserveWins?: boolean;
  winsLoading?: boolean;
}

function renderPlaygroundProfile(
  profile: PlaygroundProfile,
  options: RenderPlaygroundProfileOptions = {}
): void {
  const settingsControls = getSettingsControls();
  if (!settingsControls) return;

  const displayName = typeof profile.displayName === 'string' ? profile.displayName.trim() : '';
  if (!displayName) return;

  const customDisplayName =
    typeof profile.customDisplayName === 'string' ? profile.customDisplayName.trim() : '';
  const generatedDisplayName =
    typeof profile.generatedDisplayName === 'string'
      ? profile.generatedDisplayName.trim()
      : displayName;
  const avatar = getPlaygroundAvatarPresentation({
    displayName,
    userId: profile.userId || ''
  });

  settingsControls.playgroundProfileName.textContent = displayName;
  settingsControls.playgroundDisplayName.value = customDisplayName;
  settingsControls.playgroundDisplayName.placeholder = generatedDisplayName;
  settingsControls.playgroundProfileAvatar.textContent = avatar.initial;
  settingsControls.playgroundProfileAvatar.style.setProperty(
    '--playground-profile-avatar-bg',
    avatar.backgroundColor
  );
  if (options.winsLoading) {
    updatePlaygroundProfileWinsLoading(
      settingsControls.playgroundProfileWins,
      settingsControls.playgroundProfileWinsCount
    );
  } else if (!options.preserveWins) {
    updatePlaygroundProfileWins(
      settingsControls.playgroundProfileWins,
      settingsControls.playgroundProfileWinsCount,
      profile.wins
    );
  }
  settingsControls.playgroundProfile.hidden = false;
}

function requestPlaygroundProfileStats(userId: string): void {
  const settingsControls = getSettingsControls();
  if (!settingsControls || !settingsControls.playgroundEnabled.checked) return;

  const requestedUserId = typeof userId === 'string' ? userId.trim() : '';
  if (!requestedUserId) {
    updatePlaygroundProfileWins(
      settingsControls.playgroundProfileWins,
      settingsControls.playgroundProfileWinsCount,
      0
    );
    return;
  }

  const token = ++playgroundProfileStatsRequestToken;
  updatePlaygroundProfileWinsLoading(
    settingsControls.playgroundProfileWins,
    settingsControls.playgroundProfileWinsCount
  );
  chrome.runtime.sendMessage(
    {
      type: PLAYGROUND_PROFILE_STATS_MESSAGE_TYPE,
      userId: requestedUserId
    },
    (response?: PlaygroundProfileStatsResponse) => {
      if (token !== playgroundProfileStatsRequestToken) return;
      const latestControls = getSettingsControls();
      if (!latestControls || !latestControls.playgroundEnabled.checked) return;

      if (chrome.runtime.lastError || !response?.ok || response.userId !== requestedUserId) {
        updatePlaygroundProfileWins(
          latestControls.playgroundProfileWins,
          latestControls.playgroundProfileWinsCount,
          0
        );
        return;
      }

      updatePlaygroundProfileWins(
        latestControls.playgroundProfileWins,
        latestControls.playgroundProfileWinsCount,
        response.wins
      );
    }
  );
}

function setPlaygroundProfileDetailsExpanded(expanded: boolean): void {
  const settingsControls = getSettingsControls();
  if (!settingsControls) return;

  settingsControls.playgroundProfileToggle.setAttribute('aria-expanded', String(expanded));
  settingsControls.playgroundProfileDetails.hidden = !expanded;
}

function createSelectOption(value: string, label: string): HTMLOptionElement {
  return el<HTMLOptionElement>(<option value={value}>{label}</option>);
}

function updatePlaygroundProfileWins(
  container: HTMLElement,
  countElement: HTMLElement,
  value: unknown
): void {
  const numericValue = typeof value === 'number' ? value : 0;
  const wins = Number.isFinite(numericValue) && numericValue > 0 ? Math.floor(numericValue) : 0;
  const label = `${getExtensionMessage('playgroundWins')}: ${wins}`;
  const spinner = getPlaygroundWinsSpinner(container);
  spinner.hidden = true;
  container.removeAttribute('aria-busy');
  countElement.hidden = false;
  countElement.textContent = String(wins);
  container.title = label;
  container.setAttribute('aria-label', label);
}

function updatePlaygroundProfileWinsLoading(
  container: HTMLElement,
  countElement: HTMLElement
): void {
  const spinner = getPlaygroundWinsSpinner(container);
  spinner.hidden = false;
  countElement.hidden = true;
  countElement.textContent = '';
  container.title = getExtensionMessage('playgroundWins');
  container.setAttribute('aria-label', getExtensionMessage('playgroundWins'));
  container.setAttribute('aria-busy', 'true');
}

function getPlaygroundWinsSpinner(container: HTMLElement): HTMLElement {
  const existing = container.querySelector<HTMLElement>('.playground-profile-wins-spinner');
  if (existing) return existing;

  const spinner = createLoadingSpinner('playground-profile-wins-spinner');
  spinner.hidden = true;
  container.append(spinner);
  return spinner;
}
