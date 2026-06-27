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
    const status = await getCurrentTabActionStatus(context, sourcePage.url());
    return status.attached && /^Chat Enhancer for YouTube is active/i.test(status.title);
  }, {
    message: 'Expected the current YouTube tab to have an active extension action status.',
    timeout: 15_000
  }).toBe(true);
}

async function getCurrentTabActionStatus(
  context: BrowserContext,
  sourcePageUrl: string
): Promise<{
  attached: boolean;
  title: string;
}> {
  const serviceWorker = await getExtensionServiceWorker(context);
  return serviceWorker.evaluate((targetUrl) => new Promise((resolve) => {
    const normalizeTabUrl = (value: string | undefined): string => {
      if (!value) return '';
      try {
        const url = new URL(value);
        url.hash = '';
        url.searchParams.delete('reload');
        url.searchParams.sort();
        return url.toString();
      } catch {
        return '';
      }
    };

    chrome.tabs.query({}, (tabs) => {
      const normalizedTargetUrl = normalizeTabUrl(targetUrl);
      const matchingTab = tabs.find((tab) => {
        return typeof tab.id === 'number' &&
          normalizeTabUrl(tab.url || tab.pendingUrl) === normalizedTargetUrl;
      }) || tabs.find((tab) => tab.active);
      const tabId = matchingTab?.id;
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
  }), sourcePageUrl);
}
