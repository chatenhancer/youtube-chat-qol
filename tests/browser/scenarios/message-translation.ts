/**
 * Browser scenarios for incoming message translation.
 *
 * The mocked scenario verifies extension wiring deterministically. The real
 * Translate scenario leaves the endpoint unmocked so provider outages or
 * response-shape changes fail in one clearly named browser test.
 */
import { expect, test, type BrowserContext } from '@playwright/test';
import { withExtensionStorageValues } from '../helpers/extension-storage';
import { cleanVisibleText } from '../helpers/text';
import { withMockedTranslationEndpoint } from '../helpers/translation-endpoint';
import {
  NORMAL_CHAT_MESSAGE_SELECTOR,
  type ChatSurface,
  type BrowserScenario
} from './types';

const MOCKED_TARGET_LANGUAGE = 'cy';
const MOCKED_TRANSLATED_TEXT = 'Helo fyd';
const REAL_TARGET_LANGUAGE = 'ga';

export const messageTranslationScenario: BrowserScenario = {
  name: 'Incoming chat messages are translated',
  run: async ({ chat, context }) => {
    await waitForSourceChatMessage(chat);
    await expectMockedIncomingTranslation({ chat, context });
  }
};

export const realMessageTranslationScenario: BrowserScenario = {
  name: 'Incoming chat messages translate through real Google Translate',
  run: async ({ chat, context }) => {
    await waitForSourceChatMessage(chat);
    await expectRealIncomingTranslation({ chat, context });
  }
};

async function waitForSourceChatMessage(chat: ChatSurface): Promise<void> {
  await test.step('Wait for a source chat message', async () => {
    await expect(chat.locator(NORMAL_CHAT_MESSAGE_SELECTOR).first()).toBeVisible({ timeout: 45_000 });
  });
}

async function expectMockedIncomingTranslation({
  chat,
  context
}: {
  chat: ChatSurface;
  context: BrowserContext;
}): Promise<void> {
  await test.step('Mock Google Translate response', async () => {
    await withMockedTranslationEndpoint(context, MOCKED_TRANSLATED_TEXT, async () => {
      await enableTranslationAndExpectRendered({
        chat,
        context,
        targetLanguage: MOCKED_TARGET_LANGUAGE,
        expectedText: MOCKED_TRANSLATED_TEXT
      });
    });
  });
}

async function expectRealIncomingTranslation({
  chat,
  context
}: {
  chat: ChatSurface;
  context: BrowserContext;
}): Promise<void> {
  await test.step('Use real Google Translate response', async () => {
    await enableTranslationAndExpectRendered({
      chat,
      context,
      targetLanguage: REAL_TARGET_LANGUAGE
    });
  });
}

async function enableTranslationAndExpectRendered({
  chat,
  context,
  targetLanguage,
  expectedText
}: {
  chat: ChatSurface;
  context: BrowserContext;
  targetLanguage: string;
  expectedText?: string;
}): Promise<void> {
  const sourceMessage = chat.locator(NORMAL_CHAT_MESSAGE_SELECTOR).first();
  const sourceText = await test.step('Capture source message text', async () => (
    cleanVisibleText(await sourceMessage.locator('#message').innerText())
  ));

  await test.step(`Enable translation to ${targetLanguage}`, async () => {
    await withExtensionStorageValues(context, 'sync', {
      targetLanguage,
      lastTranslationTarget: targetLanguage,
      translationDisplay: 'below'
    }, async () => {
      const translation = chat.locator(`.ytcq-translation[lang="${targetLanguage}"]`).first();
      await test.step('Wait for rendered translation', async () => {
        await expect(translation).toBeVisible({ timeout: 20_000 });
      });
      await test.step('Verify rendered translation differs from source', async () => {
        await expect.poll(async () => cleanVisibleText(await translation.innerText()), {
          message: 'Rendered translation text should differ from the original chat message.',
          timeout: 5_000
        }).not.toBe(sourceText);
      });
      if (expectedText) {
        await test.step('Verify mocked translation text', async () => {
          await expect(translation).toContainText(expectedText);
        });
      }
    });
  });
}
