import contact from '../shared/contact.json';
import { controls } from './controls';
import { getExtensionMessage } from './i18n';

const LANDING_PAGE_URL = 'https://chatenhancer.com';
const SOURCE_CODE_URL = 'https://www.chatenhancer.com/source';
const SUPPORT_URL = 'https://www.chatenhancer.com/support';
const SUPPORT_EMAIL = contact.supportEmail;

export function initPopupLinks(): void {
  controls.landingLink?.addEventListener('click', (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: LANDING_PAGE_URL });
  });

  controls.sourceCodeLink?.addEventListener('click', (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: SOURCE_CODE_URL });
  });

  controls.supportLink?.addEventListener('click', (event) => {
    event.preventDefault();
    const confirmed = window.confirm(getExtensionMessage('supportIssueTrackerPrompt', SUPPORT_EMAIL));
    if (!confirmed) return;
    chrome.tabs.create({ url: SUPPORT_URL });
  });
}
