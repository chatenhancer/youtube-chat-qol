/**
 * Extension status helpers for browser tests.
 */
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { getExtensionServiceWorker } from './extension';

export async function expectCurrentTabActionReportsConnectedStatus(
  context: BrowserContext,
  sourcePage: Page
): Promise<void> {
  await sourcePage.bringToFront();

  await expect.poll(async () => {
    const status = await getCurrentTabActionStatus(context);
    return status.attached && /^Chat Enhancer for YouTube is active/i.test(status.title);
  }, {
    message: 'Expected the current YouTube tab to have an active extension action status.',
    timeout: 15_000
  }).toBe(true);
}

async function getCurrentTabActionStatus(context: BrowserContext): Promise<{
  attached: boolean;
  title: string;
}> {
  const serviceWorker = await getExtensionServiceWorker(context);
  return serviceWorker.evaluate(() => new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (typeof tabId !== 'number') {
        resolve({ attached: false, title: '' });
        return;
      }

      chrome.action.getTitle({ tabId }, (title) => {
        chrome.tabs.sendMessage(tabId, { type: 'ytcq:chat-attached-ping' }, (response?: { attached?: unknown }) => {
          resolve({
            attached: !chrome.runtime.lastError && response?.attached === true,
            title
          });
        });
      });
    });
  }));
}
