/**
 * Browser scenario for background-tab Inbox alerts.
 *
 * This is mock-only because it forces document visibility inside the
 * extension's isolated world and asserts fixture-owned title/favicon state.
 * Headless Chromium otherwise keeps pages visible when another page is
 * foregrounded.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  requireControlledChat,
  type ControlledChat
} from '../support/controlled-chat';
import {
  withExtensionStorageSnapshot,
  withExtensionStorageValues
} from '../support/extension-storage';
import { getExtensionContentScriptContextId } from '../support/extension';
import { isMockPageSurface } from '../support/mock-page';
import type { BrowserScenario } from './types';

const ALERT_KEYWORD = 'ytcq-alert-browser-test';

export const tabAlertScenario: BrowserScenario = async ({
  chat,
  context,
  controlledChat
}) => {
  if (!isMockPageSurface(chat)) {
    throw new Error('tabAlertScenario requires the deterministic mock chat page.');
  }
  const incoming = requireControlledChat(controlledChat);

  await withExtensionStorageSnapshot(context, 'local', async () => {
    await withExtensionStorageValues(context, 'local', {
      ytcqInboxKeywords: [ALERT_KEYWORD]
    }, async () => {
      await reloadMockChat(chat);
      await setContentScriptVisibility(chat, 'hidden');
      try {
        await appendKeywordMessage(incoming);
        await expectAlertShown(chat);
      } finally {
        await setContentScriptVisibility(chat, 'visible');
      }
      await expectAlertCleared(chat);
    });
  });
};

async function reloadMockChat(page: Page): Promise<void> {
  await test.step('Reload mock chat with alert keyword storage', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.ytcq-inbox-button')).toBeVisible({ timeout: 15_000 });
  });
}

async function appendKeywordMessage(controlledChat: ControlledChat): Promise<void> {
  await test.step('Append keyword-matching chat message', async () => {
    await controlledChat.injectMessage({
      author: '@AlertBrowserTest',
      text: `This message contains ${ALERT_KEYWORD}`
    });
  });
}

async function expectAlertShown(page: Page): Promise<void> {
  await test.step('Verify tab title and favicon alert are shown', async () => {
    await expect.poll(async () => page.title(), {
      timeout: 10_000
    }).toMatch(/^\(\d+\)\s+Mock YouTube Live Chat/);
    await expect(page.locator('link.ytcq-tab-alert-favicon')).toHaveCount(4);
  });
}

async function expectAlertCleared(page: Page): Promise<void> {
  await test.step('Verify tab alert clears when page becomes active', async () => {
    await expect.poll(async () => page.title(), {
      timeout: 5_000
    }).toBe('Mock YouTube Live Chat');
    await expect(page.locator('link.ytcq-tab-alert-favicon')).toHaveCount(0);
  });
}

async function setContentScriptVisibility(page: Page, state: 'hidden' | 'visible'): Promise<void> {
  await test.step(`Set extension content-script visibility to ${state}`, async () => {
    const client = await page.context().newCDPSession(page);

    try {
      const executionContextId = await getExtensionContentScriptContextId(page, client);
      const result = await client.send('Runtime.evaluate', {
        contextId: executionContextId,
        expression: [
          `Object.defineProperty(document, 'visibilityState', { configurable: true, value: ${JSON.stringify(state)} });`,
          `Object.defineProperty(document, 'hidden', { configurable: true, value: ${state !== 'visible'} });`,
          'document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));',
          'document.visibilityState'
        ].join('\n'),
        returnByValue: true
      });

      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || 'Failed to set content-script visibility.');
      }

      expect(result.result.value).toBe(state);
    } finally {
      await client.detach().catch(() => undefined);
    }
  });
}
