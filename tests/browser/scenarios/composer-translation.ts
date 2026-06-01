/**
 * Browser scenario for the composer translation control.
 *
 * This scenario is logged-in only because YouTube exposes the composer only
 * when the current viewer can write in chat.
 */
import { expect, test } from '@playwright/test';
import {
  clearChatComposer,
  getChatComposerText,
  setChatComposerText
} from '../helpers/composer';
import { withExtensionStorageValues } from '../helpers/extension-storage';
import { withMockedTranslationEndpoint } from '../helpers/translation-endpoint';
import type { BrowserScenario, ChatSurface } from './types';

const MOCKED_COMPOSER_TRANSLATION = 'texte traduit depuis le compositeur';
const MOCKED_COMPOSER_SOURCE = 'translate this composer draft';
const REAL_COMPOSER_SOURCE = 'thank you for the stream';

export const composerTranslationScenario: BrowserScenario = async ({ chat }) => {
  await expectChatComposerVisible(chat);
  await expectComposerTranslateButtonAttached(chat);
  await openComposerTranslationPanel(chat);
};

export const mockedComposerTranslationScenario: BrowserScenario = async ({ chat, context }) => {
  await expectChatComposerVisible(chat);
  await withMockedTranslationEndpoint(context, MOCKED_COMPOSER_TRANSLATION, async () => {
    await withExtensionStorageValues(context, 'sync', {
      composerTranslateLanguage: 'fr'
    }, async () => {
      await translateComposerDraft({
        chat,
        expectedText: MOCKED_COMPOSER_TRANSLATION,
        sourceText: MOCKED_COMPOSER_SOURCE
      });
    });
  });
};

export const realComposerTranslationScenario: BrowserScenario = async ({ chat, context }) => {
  await expectChatComposerVisible(chat);
  await withExtensionStorageValues(context, 'sync', {
    composerTranslateLanguage: 'ja'
  }, async () => {
    await translateComposerDraft({
      chat,
      expectedPattern: /[\u3040-\u30ff\u4e00-\u9faf]/,
      sourceText: REAL_COMPOSER_SOURCE
    });
  });
};

async function expectChatComposerVisible(chat: ChatSurface): Promise<void> {
  await test.step('Verify chat composer is visible', async () => {
    await expect(chat.locator('yt-live-chat-message-input-renderer')).toBeVisible();
  });
}

async function expectComposerTranslateButtonAttached(chat: ChatSurface): Promise<void> {
  await test.step('Verify composer translate button is attached', async () => {
    await expect(chat.locator('.ytcq-composer-translate-button')).toBeVisible();
  });
}

async function openComposerTranslationPanel(chat: ChatSurface): Promise<void> {
  await test.step('Open composer translation panel', async () => {
    await chat.locator('.ytcq-composer-translate-button').click();
    await expect(chat.locator('.ytcq-composer-translate-panel')).toBeVisible();
  });
}

async function translateComposerDraft({
  chat,
  expectedPattern,
  expectedText,
  sourceText
}: {
  chat: ChatSurface;
  expectedPattern?: RegExp;
  expectedText?: string;
  sourceText: string;
}): Promise<void> {
  await test.step('Type draft text for composer translation', async () => {
    await clearChatComposer(chat);
    await setChatComposerText(chat, sourceText);
  });

  await test.step('Wait for composer draft translation', async () => {
    await expect.poll(async () => getChatComposerText(chat), {
      message: 'Composer translation should replace the draft text.',
      timeout: 15_000
    }).not.toBe(sourceText);

    const translatedText = await getChatComposerText(chat);
    if (expectedText) {
      expect(translatedText).toContain(expectedText);
    }
    if (expectedPattern) {
      expect(translatedText).toMatch(expectedPattern);
    }
  });

  await test.step('Clear translated composer draft', async () => {
    await clearChatComposer(chat);
  });
}
