import { LANGUAGE_OPTIONS } from '../shared/languages';
import { CHAT_SKIN_OPTIONS, DEFAULT_CHAT_SKIN, isCustomChatSkin } from '../shared/chat-skins';
import { initThemePicker } from './themes';
import { DEFAULT_MESSAGE_DENSITY, MESSAGE_DENSITY_OPTIONS } from '../shared/message-density';
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
} from '@chatenhancer/playground-core/identity';
import { playAlertSoundPreview } from '../shared/sounds/alert-sounds';
import {
  DEFAULT_OPTIONS,
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
  animatePopupGameInvitesIcon,
  animatePopupLiteModeIcon,
  animatePopupMessageDensityIcon,
  animatePopupPlaygroundIcon,
  animatePopupSoundIcon,
  animatePopupStartupEffectIcon,
  animatePopupTranslationIcon
} from './animations';
import { getExtensionMessage, getLocalizedLanguageLabel } from './i18n';
import { prefersReducedMotion } from '../shared/motion';
import { addPopupTabSelectionListener } from './tabs';

const PLAYGROUND_PANEL_ID = 'playgroundPanel';
const SETTINGS_GROUP_COLLAPSED_CLASS = 'settings-group-collapsed';
const SETTINGS_GROUP_ANIMATION_MS = 180;
const SETTINGS_GROUP_ANIMATION_FALLBACK_MS = SETTINGS_GROUP_ANIMATION_MS + 50;
const APPEARANCE_MORE_SETTINGS_TOGGLE_CONTAINER_DISMISSED_CLASS =
  'appearance-more-settings-toggle-container-dismissed';
const APPEARANCE_MORE_SETTINGS_REVEALED_CLASS = 'appearance-more-settings-group-revealed';
const APPEARANCE_MORE_SETTINGS_REVEAL_ANIMATION = 'ytcq-popup-option-added';
const TRANSLATION_TARGET_ICON_CLASS = 'option-icon translation-target-icon';

let lastKnownTranslationTarget = DEFAULT_OPTIONS.lastTranslationTarget;
let playgroundPanelActive = false;
let playgroundProfileRequested = false;
let playgroundProfileRequestToken = 0;
let playgroundProfileStatsRequestToken = 0;
const settingsGroupVisibilityTokens = new WeakMap<HTMLElement, number>();

export function initSettingsControls(popupLocale: string): void {
  const settingsControls = getSettingsControls();
  if (!settingsControls) return;

  const {
    appearanceMoreSettingsToggle,
    appearanceMoreSettingsToggleContainer,
    chatSkin,
    liteModeEnabled,
    messageDensity,
    targetLanguage,
    translationDisplay,
    sound,
    startupEffect,
    appearanceMoreSettingsGroup,
    playgroundEnabled,
    playgroundGamesAvailable,
    playgroundDisplayName,
    playgroundProfileToggle
  } = settingsControls;

  addPopupTabSelectionListener((panelId) => {
    playgroundPanelActive = panelId === PLAYGROUND_PANEL_ID;
    if (playgroundPanelActive) requestPlaygroundProfile();
  });

  preparePopupTranslationIcon();
  populateChatSkinOptions(chatSkin);
  populateMessageDensityOptions(messageDensity);

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
    if (nextSkin !== DEFAULT_CHAT_SKIN) animatePopupChatSkinIcon();
    if (!isCustomChatSkin(nextSkin)) save({ chatSkin: nextSkin });
  });

  messageDensity.addEventListener('change', () => {
    const nextDensity = messageDensity.value as Options['messageDensity'];
    if (nextDensity !== DEFAULT_MESSAGE_DENSITY) animatePopupMessageDensityIcon();
    save({ messageDensity: nextDensity });
  });

  liteModeEnabled.addEventListener('change', () => {
    const enabled = liteModeEnabled.checked;
    if (enabled) animatePopupLiteModeIcon();
    save({ liteModeEnabled: enabled });
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

  appearanceMoreSettingsToggle.addEventListener('click', () => {
    if (appearanceMoreSettingsToggle.getAttribute('aria-expanded') === 'true') return;

    const appearanceSection =
      appearanceMoreSettingsToggle.closest<HTMLElement>('.settings-section');
    const settingsPanel = appearanceSection?.closest<HTMLElement>('#settingsPanel');
    appearanceMoreSettingsToggle.setAttribute('aria-expanded', 'true');
    appearanceMoreSettingsToggleContainer.classList.add(
      APPEARANCE_MORE_SETTINGS_TOGGLE_CONTAINER_DISMISSED_CLASS
    );
    const stopFollowingPanelBottom =
      settingsPanel && !prefersReducedMotion()
        ? followScrollableElementBottom(settingsPanel)
        : () => undefined;
    flashRevealedSettingsGroup(appearanceMoreSettingsGroup);
    updateSettingsGroupVisibility(appearanceMoreSettingsGroup, true, true, () => {
      stopFollowingPanelBottom();
      appearanceMoreSettingsToggleContainer.hidden = true;
      if (settingsPanel) settingsPanel.scrollTop = settingsPanel.scrollHeight;
    });
  });

  playgroundEnabled.addEventListener('change', () => {
    const enabled = playgroundEnabled.checked;
    if (enabled) animatePopupPlaygroundIcon();
    updatePlaygroundProfile(enabled, enabled);
    updatePlaygroundGamesVisibility(enabled, true);
    save({ playgroundEnabled: enabled });
  });

  playgroundGamesAvailable.addEventListener('change', () => {
    const enabled = playgroundGamesAvailable.checked;
    if (enabled) animatePopupGameInvitesIcon();
    save({ playgroundGamesAvailable: enabled });
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
  initThemePicker(chatSkin);
}

export function applyOptionsToControls(options: Partial<Options>): void {
  const settingsControls = getSettingsControls();
  if (!settingsControls) return;

  const {
    chatSkin,
    liteModeEnabled,
    messageDensity,
    targetLanguage,
    translationDisplay,
    sound,
    startupEffect,
    playgroundEnabled,
    playgroundGamesAvailable
  } = settingsControls;

  const normalized = normalizeOptions(options);
  chatSkin.value = normalized.chatSkin;
  liteModeEnabled.checked = normalized.liteModeEnabled;
  messageDensity.value = normalized.messageDensity;
  lastKnownTranslationTarget = normalized.lastTranslationTarget;
  targetLanguage.value = normalized.targetLanguage;
  translationDisplay.value = normalized.translationDisplay;
  sound.checked = normalized.sound;
  startupEffect.disabled = prefersReducedMotion();
  startupEffect.checked = normalized.startupEffect && !startupEffect.disabled;
  playgroundEnabled.checked = normalized.playgroundEnabled;
  playgroundGamesAvailable.checked = normalized.playgroundGamesAvailable;
  updatePlaygroundProfile(normalized.playgroundEnabled, playgroundPanelActive);
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

function populateMessageDensityOptions(messageDensity: HTMLSelectElement): void {
  messageDensity.replaceChildren(
    ...MESSAGE_DENSITY_OPTIONS.map(({ id, labelMessage }) =>
      createSelectOption(id, getExtensionMessage(labelMessage))
    )
  );
}

function flashRevealedSettingsGroup(group: HTMLElement): void {
  if (prefersReducedMotion()) return;

  const handleAnimationEnd = (event: AnimationEvent): void => {
    if (event.animationName !== APPEARANCE_MORE_SETTINGS_REVEAL_ANIMATION) return;
    group.classList.remove(APPEARANCE_MORE_SETTINGS_REVEALED_CLASS);
    group.removeEventListener('animationend', handleAnimationEnd);
  };
  group.addEventListener('animationend', handleAnimationEnd);
  group.classList.add(APPEARANCE_MORE_SETTINGS_REVEALED_CLASS);
}

function updatePlaygroundGamesVisibility(playgroundEnabled: boolean, animated = false): void {
  const settingsControls = getSettingsControls();
  if (!settingsControls) return;

  updateSettingsGroupVisibility(
    settingsControls.playgroundGamesSection,
    playgroundEnabled,
    animated
  );
}

function updateSettingsGroupVisibility(
  section: HTMLElement,
  visible: boolean,
  animated: boolean,
  afterShow?: () => void
): void {
  const token = (settingsGroupVisibilityTokens.get(section) ?? 0) + 1;
  settingsGroupVisibilityTokens.set(section, token);
  const shouldAnimate = animated && !prefersReducedMotion();

  if (visible) {
    section.hidden = false;
    if (!shouldAnimate) {
      section.classList.remove(SETTINGS_GROUP_COLLAPSED_CLASS);
      afterShow?.();
      return;
    }

    section.classList.add(SETTINGS_GROUP_COLLAPSED_CLASS);
    window.setTimeout(() => {
      if (settingsGroupVisibilityTokens.get(section) !== token) return;
      if (afterShow) {
        runAfterSettingsGroupTransition(section, token, afterShow);
      }
      section.classList.remove(SETTINGS_GROUP_COLLAPSED_CLASS);
    }, 0);
    return;
  }

  if (!shouldAnimate) {
    section.classList.add(SETTINGS_GROUP_COLLAPSED_CLASS);
    section.hidden = true;
    return;
  }

  runAfterSettingsGroupTransition(section, token, () => {
    section.hidden = true;
  });
  section.classList.add(SETTINGS_GROUP_COLLAPSED_CLASS);
}

function runAfterSettingsGroupTransition(
  section: HTMLElement,
  token: number,
  callback: () => void
): void {
  let completed = false;
  let fallbackTimer: number | undefined;
  const finish = (): void => {
    if (completed) return;
    completed = true;
    section.removeEventListener('transitionend', handleTransitionEnd);
    if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
    if (settingsGroupVisibilityTokens.get(section) === token) callback();
  };
  const handleTransitionEnd = (event: TransitionEvent): void => {
    if (event.target === section && event.propertyName === 'transform') finish();
  };

  section.addEventListener('transitionend', handleTransitionEnd);
  fallbackTimer = window.setTimeout(finish, SETTINGS_GROUP_ANIMATION_FALLBACK_MS);
}

function followScrollableElementBottom(element: HTMLElement): () => void {
  let active = true;
  let frameId = 0;
  const follow = (): void => {
    if (!active) return;
    element.scrollTop = element.scrollHeight;
    frameId = window.requestAnimationFrame(follow);
  };

  follow();
  return () => {
    active = false;
    window.cancelAnimationFrame(frameId);
  };
}

function updatePlaygroundProfile(enabled: boolean, requestImmediately = false): void {
  playgroundProfileRequested = false;
  resetPlaygroundProfile();
  if (enabled && requestImmediately) requestPlaygroundProfile();
}

function resetPlaygroundProfile(): void {
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
  ++playgroundProfileRequestToken;
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
}

function requestPlaygroundProfile(): void {
  const settingsControls = getSettingsControls();
  if (
    !settingsControls ||
    !settingsControls.playgroundEnabled.checked ||
    playgroundProfileRequested
  ) {
    return;
  }

  playgroundProfileRequested = true;
  const token = ++playgroundProfileRequestToken;
  ++playgroundProfileStatsRequestToken;

  chrome.runtime.sendMessage(
    { type: PLAYGROUND_PROFILE_MESSAGE_TYPE },
    (response?: PlaygroundProfileResponse) => {
      if (token !== playgroundProfileRequestToken) return;
      if (chrome.runtime.lastError || !response?.ok) {
        playgroundProfileRequested = false;
        return;
      }

      const displayName =
        typeof response.profile?.displayName === 'string'
          ? response.profile.displayName.trim()
          : '';
      if (!displayName) {
        playgroundProfileRequested = false;
        return;
      }

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
