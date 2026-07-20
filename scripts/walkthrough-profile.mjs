import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  getWalkthroughBrowserLocale,
  getWalkthroughPreferredLanguages
} from './walkthrough-locales.mjs';

const profileNamePrefix = 'youtube-walkthrough-demo';

export function getWalkthroughProfilePath(profilesDir, locale) {
  const safeLocale = String(locale).replace(/[^A-Za-z0-9_-]/g, '-');
  return path.join(profilesDir, `${profileNamePrefix}-${safeLocale}`);
}

export async function configureWalkthroughProfileLocale(profileDir, locale) {
  const preferencesPath = path.join(profileDir, 'Default', 'Preferences');
  const preferences = JSON.parse(await readFile(preferencesPath, 'utf8'));
  const browserLocale = getWalkthroughBrowserLocale(locale);
  const preferredLanguages = getWalkthroughPreferredLanguages(locale).join(',');

  // Set these before Chrome starts so cloned profiles never inherit the source
  // profile's UI or Accept-Language preferences during the capture.
  preferences.intl = {
    ...(preferences.intl || {}),
    app_locale: browserLocale,
    accept_languages: preferredLanguages,
    selected_languages: preferredLanguages
  };

  await writeFile(preferencesPath, `${JSON.stringify(preferences)}\n`);
  return { browserLocale, preferredLanguages };
}
