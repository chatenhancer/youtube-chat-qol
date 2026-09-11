/**
 * Open onboarding once for a new installation without interrupting updates.
 */
import { DEFAULT_OPTIONS } from '../shared/options';

const ONBOARDING_SHOWN_KEY = 'ytcqOnboardingShown';

export async function handleExtensionInstalled(details: chrome.runtime.InstalledDetails): Promise<void> {
  if (details.reason !== 'install' && details.reason !== 'update') return;

  // Safari can report another install when an existing extension is enabled.
  const stored = await chrome.storage.local.get(ONBOARDING_SHOWN_KEY);
  if (stored[ONBOARDING_SHOWN_KEY] === true) return;
  await chrome.storage.local.set({ [ONBOARDING_SHOWN_KEY]: true });
  if (details.reason !== 'install') return;

  // Existing installations predate this marker; keep their saved setup quiet.
  const savedOptions = await chrome.storage.sync.get(Object.keys(DEFAULT_OPTIONS));
  if (Object.keys(savedOptions).length) return;

  await chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
}

chrome.runtime.onInstalled.addListener(handleExtensionInstalled);
