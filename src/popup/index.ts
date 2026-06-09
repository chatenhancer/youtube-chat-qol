/**
 * Extension action popup.
 *
 * Mirrors the most important chat settings outside YouTube's iframe. The popup
 * writes to chrome.storage.sync, and the content script reacts to those same
 * option updates as the injected chat settings menu.
 */
import { initBookmarksPanel } from './bookmarks';
import { controls, getSettingsControls } from './controls';
import { localizePopup } from './i18n';
import { initPopupLinks } from './links';
import { initResetControl } from './reset';
import { initSettingsControls } from './settings';
import { initExtensionStatus } from './status';
import { initOptionHelperLinks, initPopupTabs } from './tabs';

init();

function init(): void {
  const popupLocale = localizePopup();
  initPopupTabs();
  initOptionHelperLinks();
  initExtensionStatus();
  initBookmarksPanel();

  if (!getSettingsControls()) return;

  if (controls.version) {
    controls.version.textContent = `v${chrome.runtime.getManifest().version}`;
  }

  initPopupLinks();
  initResetControl();
  initSettingsControls(popupLocale);
}
