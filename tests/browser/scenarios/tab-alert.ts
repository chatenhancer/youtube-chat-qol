/**
 * Browser scenario for background-tab Inbox alerts.
 *
 * This is mock-only so the test can deterministically append a keyword-matching
 * message while the content script sees a hidden document. Headless Chromium
 * keeps pages visible even when another page is foregrounded, so this scenario
 * sets visibility in the extension's isolated world and fails if that exact
 * extension context cannot be found.
 */
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import {
  withExtensionStorageSnapshot,
  withExtensionStorageValues
} from '../support/extension-storage';
import { getExtensionId } from '../support/extension';
import {
  appendMockFixtureMessage,
  isMockPageSurface
} from '../support/mock-page';
import type { BrowserScenario } from './types';

const ALERT_KEYWORD = 'ytcq-alert-browser-test';

export const tabAlertScenario: BrowserScenario = async ({ chat, context }) => {
  if (!isMockPageSurface(chat)) {
    throw new Error('tabAlertScenario requires the deterministic mock chat page.');
  }

  await withExtensionStorageSnapshot(context, 'local', async () => {
    await withExtensionStorageValues(context, 'local', {
      ytcqInboxKeywords: [ALERT_KEYWORD]
    }, async () => {
      await reloadMockChat(chat);
      await setContentScriptVisibility(chat, 'hidden');
      try {
        await appendKeywordMessage(chat);
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

async function appendKeywordMessage(page: Page): Promise<void> {
  await test.step('Append keyword-matching chat message', async () => {
    await appendMockFixtureMessage(page, {
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
      const executionContextId = await getContentScriptContextId(page, client);
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

async function getContentScriptContextId(
  page: Page,
  client: CDPSession
): Promise<number> {
  const extensionId = await getExtensionId(page.context());
  const contexts: RuntimeExecutionContextDescription[] = [];

  client.on('Runtime.executionContextCreated', (event: RuntimeExecutionContextCreatedEvent) => {
    contexts.push(event.context);
  });

  await client.send('Runtime.enable');
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const context = contexts.find((candidate) => isExtensionContext(candidate, extensionId));
    if (context) return context.id;
    await page.waitForTimeout(50);
  }

  throw new Error(`Could not find extension content-script context for ${extensionId}.`);
}

function isExtensionContext(context: RuntimeExecutionContextDescription, extensionId: string): boolean {
  return context.origin === `chrome-extension://${extensionId}` ||
    context.name === extensionId ||
    Boolean(context.name?.includes(extensionId));
}

interface RuntimeExecutionContextCreatedEvent {
  context: RuntimeExecutionContextDescription;
}

interface RuntimeExecutionContextDescription {
  id: number;
  name?: string;
  origin?: string;
}
