import contact from '../../../src/shared/contact.json';
import en from '../i18n/en.json';

export const site = {
  chromeUrl: 'https://www.chatenhancer.com/chrome',
  firefoxUrl: 'https://www.chatenhancer.com/firefox',
  licenseUrl: 'https://www.chatenhancer.com/license',
  privacyUrl: 'https://www.chatenhancer.com/privacy',
  sourceUrl: 'https://www.chatenhancer.com/source',
  supportUrl: 'https://www.chatenhancer.com/support',
  title: 'Chat Enhancer for YouTube',
  url: 'https://chatenhancer.com'
} as const;

export const supportEmail = contact.supportEmail;
export type Messages = typeof en;
