/**
 * Browser scenario for background-tab Inbox alerts.
 *
 * This is mock-only so the test can deterministically append a keyword-matching
 * message and simulate the extension content-script world becoming hidden.
 */
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import {
  withExtensionStorageSnapshot,
  withExtensionStorageValues
} from '../helpers/extension-storage';
import { getExtensionId } from '../helpers/extension';
import {
  appendMockFixtureMessage,
  isMockPageSurface
} from '../helpers/mock-page';
import type { BrowserScenario } from './types';

const ALERT_KEYWORD = 'ytcq-alert-browser-test';

export const tabAlertScenario: BrowserScenario = async ({ chat, extensionContext }) => {
  if (!isMockPageSurface(chat)) {
    throw new Error('tabAlertScenario requires the deterministic mock chat page.');
  }

  await withExtensionStorageSnapshot(extensionContext, 'local', async () => {
    await withExtensionStorageValues(extensionContext, 'local', {
      ytcqInboxKeywords: [ALERT_KEYWORD]
    }, async () => {
      await reloadMockChat(chat);
      await setExtensionWorldVisibility(chat, 'hidden');
      await appendKeywordMessage(chat);
      await expectAlertShown(chat);
      await setExtensionWorldVisibility(chat, 'visible');
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

async function setExtensionWorldVisibility(page: Page, state: 'hidden' | 'visible'): Promise<void> {
  await test.step(`Set extension-world visibility to ${state}`, async () => {
    const client = await page.context().newCDPSession(page);

    try {
      const extensionContextId = await getExtensionExecutionContextId(page, client);
      const result = await client.send('Runtime.evaluate', {
        contextId: extensionContextId,
        expression: [
          `Object.defineProperty(document, 'visibilityState', { configurable: true, value: ${JSON.stringify(state)} });`,
          `Object.defineProperty(document, 'hidden', { configurable: true, value: ${state !== 'visible'} });`,
          'document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));',
          'document.visibilityState'
        ].join('\n'),
        returnByValue: true
      });

      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || 'Failed to set extension-world visibility.');
      }

      expect(result.result.value).toBe(state);
    } finally {
      await client.detach().catch(() => undefined);
    }
  });
}

async function getExtensionExecutionContextId(
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
    const context = findExtensionExecutionContext(contexts, extensionId);
    if (context) return context.id;
    await page.waitForTimeout(50);
  }

  throw new Error(`Could not find extension execution context for ${extensionId}.`);
}

function findExtensionExecutionContext(
  contexts: RuntimeExecutionContextDescription[],
  extensionId: string
): RuntimeExecutionContextDescription | undefined {
  return contexts.find((context) => isExtensionContext(context, extensionId)) ||
    contexts.find((context) => {
      return context.auxData?.isDefault === false &&
        context.auxData?.type === 'isolated' &&
        !context.name?.includes('playwright');
    });
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
  auxData?: {
    isDefault?: boolean;
    type?: string;
  };
  id: number;
  name?: string;
  origin?: string;
}
