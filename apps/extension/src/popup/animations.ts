import {
  animateSettingIcon,
  SETTING_ICON_ANIMATIONS,
  type SettingIconAnimation
} from '../shared/setting-icon-animations';

export function animatePopupSoundIcon(): void {
  animatePopupIcon('.sound-icon', SETTING_ICON_ANIMATIONS.bell);
}

export function animatePopupTranslationIcon(): void {
  animatePopupIcon('.translation-target-icon', SETTING_ICON_ANIMATIONS.translation);
}

export function animatePopupDisplayIcon(): void {
  animatePopupIcon('.translation-display-icon', SETTING_ICON_ANIMATIONS.translationDisplay);
}

export function animatePopupStartupEffectIcon(): void {
  animatePopupIcon('.startup-effect-icon', SETTING_ICON_ANIMATIONS.startupEffect);
}

export function animatePopupChatSkinIcon(): void {
  animatePopupIcon('.chat-skin-icon', SETTING_ICON_ANIMATIONS.chatSkin);
}

export function animatePopupLiteModeIcon(): void {
  animatePopupIcon('.lite-mode-icon', SETTING_ICON_ANIMATIONS.liteMode);
}

export function animatePopupMessageDensityIcon(): void {
  animatePopupIcon('.message-density-icon', SETTING_ICON_ANIMATIONS.messageDensity);
}

export function animatePopupPlaygroundIcon(): void {
  animatePopupIcon('.playground-join-icon', SETTING_ICON_ANIMATIONS.gameInvites);
}

export function animatePopupGameInvitesIcon(): void {
  animatePopupIcon('.game-invites-icon', SETTING_ICON_ANIMATIONS.gameInvites);
}

function animatePopupIcon(selector: string, animation: SettingIconAnimation): void {
  animateSettingIcon(document.querySelector(selector), animation);
}
