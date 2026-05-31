/**
 * Browser scenarios for incoming message translation.
 *
 * The mocked scenario verifies extension wiring deterministically. The real
 * Translate scenario leaves the endpoint unmocked so provider outages or
 * response-shape changes fail in one clearly named browser test.
 */
import { expect, test, type BrowserContext, type Locator } from '@playwright/test';
import { withExtensionStorageValues } from '../helpers/extension-storage';
import { cleanVisibleText } from '../helpers/text';
import { withMockedTranslationEndpoint } from '../helpers/translation-endpoint';
import { openSettingsMenu } from './menu-openers';
import {
  NORMAL_CHAT_MESSAGE_SELECTOR,
  type ChatSurface,
  type BrowserScenario,
  type BrowserScenarioEnvironment
} from './types';

const MOCKED_TARGET_LANGUAGE = 'cy';
const MOCKED_TRANSLATED_TEXT = 'Helo fyd';
const DISPLAY_TARGET_LANGUAGE = 'eo';
const DISPLAY_TRANSLATED_TEXT = 'YTCQ display result';
const REAL_TARGET_LANGUAGE = 'ga';
const SETTINGS_TRANSLATED_TEXT = 'YTCQ settings result';

type TranslationDisplayMode = 'below' | 'replace';

export const messageTranslationScenario: BrowserScenario = {
  name: 'Incoming chat messages are translated',
  run: async ({ chat, context, environment }) => {
    await waitForSourceChatMessage(chat);
    await expectIncomingTranslation({ chat, context, environment });
  }
};

export const realMessageTranslationScenario: BrowserScenario = {
  name: 'Incoming chat messages translate through real Google Translate',
  run: async ({ chat, context }) => {
    await waitForSourceChatMessage(chat);
    await expectRealIncomingTranslation({ chat, context });
  }
};

export const translationDisplayScenario: BrowserScenario = {
  name: 'Translation display modes render correctly',
  run: async ({ chat, context, environment }) => {
    await waitForSourceChatMessage(chat);
    await expectTranslationDisplayModes({ chat, context, environment });
  }
};

export const translationSettingsReactScenario: BrowserScenario = {
  name: 'Translate chat setting reacts live',
  run: async ({ chat, context, environment }) => {
    await waitForSourceChatMessage(chat);
    await expectTranslateSettingReactsLive({ chat, context, environment });
  }
};

async function waitForSourceChatMessage(chat: ChatSurface): Promise<void> {
  await test.step('Wait for a source chat message', async () => {
    await expect(chat.locator(NORMAL_CHAT_MESSAGE_SELECTOR).first()).toBeVisible({ timeout: 45_000 });
  });
}

async function expectIncomingTranslation({
  chat,
  context,
  environment
}: {
  chat: ChatSurface;
  context: BrowserContext;
  environment: BrowserScenarioEnvironment;
}): Promise<void> {
  await test.step('Use scenario translation endpoint', async () => {
    await withScenarioTranslationEndpoint({ context, environment, mockedText: MOCKED_TRANSLATED_TEXT, callback: async () => {
      await enableTranslationAndExpectRendered({
        chat,
        context,
        targetLanguage: MOCKED_TARGET_LANGUAGE,
        expectedText: getExpectedMockText(environment, MOCKED_TRANSLATED_TEXT)
      });
    } });
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
  await withTranslationCleared({ chat, context, targetLanguage, callback: async () => {
    await findTranslatableSourceMessage(chat);

    await test.step(`Enable translation to ${targetLanguage}`, async () => {
      await withTranslationEnabled({
        context,
        targetLanguage,
        translationDisplay: 'below',
        callback: async () => {
          await expectAnyRenderedTranslation({ chat, targetLanguage, expectedText });
        }
      });
    });
  } });
}

async function expectTranslationDisplayModes({
  chat,
  context,
  environment
}: {
  chat: ChatSurface;
  context: BrowserContext;
  environment: BrowserScenarioEnvironment;
}): Promise<void> {
  const expectedText = getExpectedMockText(environment, DISPLAY_TRANSLATED_TEXT);

  await test.step('Use scenario translation endpoint for display modes', async () => {
    await withScenarioTranslationEndpoint({ context, environment, mockedText: DISPLAY_TRANSLATED_TEXT, callback: async () => {
      await withTranslationCleared({ chat, context, targetLanguage: DISPLAY_TARGET_LANGUAGE, callback: async () => {
        const { sourceMessage, sourceText } = await expectBelowDisplayMode({ chat, context, expectedText });
        await expectReplaceDisplayMode({ context, sourceMessage, sourceText, expectedText });
      } });
    } });
  });
}

async function expectBelowDisplayMode({
  chat,
  context,
  expectedText
}: {
  chat: ChatSurface;
  context: BrowserContext;
  expectedText?: string;
}): Promise<{
  sourceMessage: Locator;
  sourceText: string;
}> {
  return test.step('Render translation below the original message', async () => {
    return withTranslationEnabled({
      context,
      targetLanguage: DISPLAY_TARGET_LANGUAGE,
      translationDisplay: 'below',
      callback: async () => {
        const { sourceMessage, sourceText, translation } = await findRenderedTranslation({
          chat,
          targetLanguage: DISPLAY_TARGET_LANGUAGE,
          expectedText
        });
        await expect(sourceMessage.locator('#message')).toContainText(sourceText);
        await expect(sourceMessage).not.toHaveClass(/ytcq-translation-replaced/);
        return { sourceMessage, sourceText, translation };
      }
    });
  });
}

async function expectReplaceDisplayMode({
  context,
  sourceMessage,
  sourceText,
  expectedText
}: {
  context: BrowserContext;
  sourceMessage: Locator;
  sourceText: string;
  expectedText?: string;
}): Promise<void> {
  await test.step('Render translation as a message replacement', async () => {
    await withTranslationEnabled({
      context,
      targetLanguage: DISPLAY_TARGET_LANGUAGE,
      translationDisplay: 'replace',
      callback: async () => {
        const messageText = sourceMessage.locator('#message').first();
        await expect(sourceMessage).toHaveClass(/ytcq-translation-replaced/, { timeout: 20_000 });
        await expect(messageText).toHaveClass(/ytcq-translation-replaced-text/);
        await expect.poll(async () => cleanVisibleText(await messageText.innerText()), {
          message: 'Replacement mode should put the translated text in the original message body.',
          timeout: 5_000
        }).not.toBe(sourceText);
        if (expectedText) {
          await expect(messageText).toContainText(expectedText);
        }
        await expect(messageText).toHaveAttribute('lang', DISPLAY_TARGET_LANGUAGE);
        await expect(messageText).toHaveAttribute('title', /^Translated from /);
        await expect(sourceMessage.locator('.ytcq-translation')).toHaveCount(0);
      }
    });
  });
}

async function expectTranslateSettingReactsLive({
  chat,
  context,
  environment
}: {
  chat: ChatSurface;
  context: BrowserContext;
  environment: BrowserScenarioEnvironment;
}): Promise<void> {
  const expectedText = getExpectedMockText(environment, SETTINGS_TRANSLATED_TEXT);

  await test.step('Use scenario translation endpoint for chat settings', async () => {
    await withScenarioTranslationEndpoint({ context, environment, mockedText: SETTINGS_TRANSLATED_TEXT, callback: async () => {
      await withTranslationCleared({ chat, context, targetLanguage: MOCKED_TARGET_LANGUAGE, callback: async () => {
        const menu = await openSettingsMenu(chat);
        const translateItem = menu.locator('.ytcq-settings-item[data-ytcq-setting="targetLanguage"]').first();
        await findTranslatableSourceMessage(chat);

        await test.step('Enable Translate chat and verify existing message translates', async () => {
          await expect(translateItem).toHaveAttribute('aria-checked', 'false');
          await translateItem.click();
          await expect(translateItem).toHaveAttribute('aria-checked', 'true');
          await expectAnyRenderedTranslation({ chat, targetLanguage: MOCKED_TARGET_LANGUAGE, expectedText });
        });

        await test.step('Disable Translate chat and verify visible translation clears', async () => {
          await translateItem.click();
          await expect(translateItem).toHaveAttribute('aria-checked', 'false');
          await expect(chat.locator('.ytcq-translation')).toHaveCount(0, { timeout: 5_000 });
          await expect(chat.locator('.ytcq-translation-replaced')).toHaveCount(0, { timeout: 5_000 });
        });
      } });
    } });
  });
}

async function expectAnyRenderedTranslation({
  chat,
  targetLanguage,
  expectedText
}: {
  chat: ChatSurface;
  targetLanguage: string;
  expectedText?: string;
}): Promise<void> {
  const translation = chat.locator(`.ytcq-translation[lang="${targetLanguage}"]`).first();
  await test.step('Wait for any rendered translation', async () => {
    await expect(translation).toBeVisible({ timeout: 20_000 });
  });
  await test.step('Verify rendered translation has text', async () => {
    await expect.poll(async () => cleanVisibleText(await translation.innerText()), {
      message: 'Rendered translation text should not be empty.',
      timeout: 5_000
    }).not.toBe('');
  });
  if (expectedText) {
    await test.step('Verify mocked translation text', async () => {
      await expect(translation).toContainText(expectedText);
    });
  }
}

async function findRenderedTranslation({
  chat,
  targetLanguage,
  expectedText
}: {
  chat: ChatSurface;
  targetLanguage: string;
  expectedText?: string;
}): Promise<{
  sourceMessage: Locator;
  sourceText: string;
  translation: Locator;
}> {
  const translation = chat.locator(`.ytcq-translation[lang="${targetLanguage}"]`).first();
  await expectRenderedTranslation({ translation, expectedText });

  const renderedSource = await translation.evaluate((element) => {
    const sourceMessage = element.closest('yt-live-chat-text-message-renderer');
    const messageText = sourceMessage?.querySelector<HTMLElement>('#message');

    return {
      id: sourceMessage?.id || null,
      text: messageText?.innerText || messageText?.textContent || ''
    };
  });
  if (!renderedSource.id) {
    throw new Error('Rendered translation did not belong to a stable chat message.');
  }

  const sourceMessage = chat.locator(
    `yt-live-chat-text-message-renderer[id="${escapeCssAttributeValue(renderedSource.id)}"]`
  ).first();
  const sourceText = cleanVisibleText(renderedSource.text);
  if (!sourceText) {
    throw new Error('Rendered translation belonged to a chat message with no readable source text.');
  }

  return { sourceMessage, sourceText, translation };
}

async function expectRenderedTranslation({
  translation,
  sourceText,
  expectedText
}: {
  translation: Locator;
  sourceText?: string;
  expectedText?: string;
}): Promise<void> {
  await test.step('Wait for rendered translation', async () => {
    await expect(translation).toBeVisible({ timeout: 20_000 });
  });
  if (sourceText) {
    await test.step('Verify rendered translation differs from source', async () => {
      await expect.poll(async () => cleanVisibleText(await translation.innerText()), {
        message: 'Rendered translation text should differ from the original chat message.',
        timeout: 5_000
      }).not.toBe(sourceText);
    });
  } else {
    await test.step('Verify rendered translation has text', async () => {
      await expect.poll(async () => cleanVisibleText(await translation.innerText()), {
        message: 'Rendered translation text should not be empty.',
        timeout: 5_000
      }).not.toBe('');
    });
  }
  if (expectedText) {
    await test.step('Verify mocked translation text', async () => {
      await expect(translation).toContainText(expectedText);
    });
  }
}

async function findTranslatableSourceMessage(chat: ChatSurface): Promise<{
  sourceMessage: Locator;
  sourceText: string;
}> {
  return test.step('Find a translatable source chat message', async () => {
    const messages = chat.locator(NORMAL_CHAT_MESSAGE_SELECTOR);
    await expect(messages.first()).toBeVisible({ timeout: 45_000 });

    const count = await messages.count();
    const firstCandidate = Math.max(0, count - 80);
    for (let index = count - 1; index >= firstCandidate; index -= 1) {
      const candidate = messages.nth(index);
      if (!await candidate.isVisible().catch(() => false)) continue;

      const sourceText = cleanVisibleText(await candidate.locator('#message').innerText().catch(() => ''));
      if (!isLikelyTranslatableSource(sourceText)) continue;
      if (await candidate.getAttribute('data-ytcq-translation-key').catch(() => null)) continue;
      if (await candidate.locator('.ytcq-translation').count().catch(() => 0)) continue;

      const messageId = await candidate.getAttribute('id').catch(() => null);
      if (!messageId) continue;

      const sourceMessage = chat.locator(
        `${NORMAL_CHAT_MESSAGE_SELECTOR}[id="${escapeCssAttributeValue(messageId)}"]`
      ).first();
      if (!await sourceMessage.isVisible().catch(() => false)) continue;

      return { sourceMessage, sourceText };
    }

    throw new Error('Could not find a visible chat message with stable id and enough text to translate.');
  });
}

async function withTranslationCleared<T>({
  chat,
  context,
  targetLanguage,
  callback
}: {
  chat: ChatSurface;
  context: BrowserContext;
  targetLanguage: string;
  callback: () => Promise<T>;
}): Promise<T> {
  return withExtensionStorageValues(context, 'sync', {
    targetLanguage: '',
    lastTranslationTarget: targetLanguage,
    translationDisplay: 'below'
  }, async () => {
    await waitForTranslationsCleared(chat);
    return callback();
  });
}

async function withTranslationEnabled<T>({
  context,
  targetLanguage,
  translationDisplay,
  callback
}: {
  context: BrowserContext;
  targetLanguage: string;
  translationDisplay: TranslationDisplayMode;
  callback: () => Promise<T>;
}): Promise<T> {
  return withExtensionStorageValues(context, 'sync', {
    targetLanguage,
    lastTranslationTarget: targetLanguage,
    translationDisplay
  }, callback);
}

function isLikelyTranslatableSource(text: string): boolean {
  const letters = text.match(/\p{Letter}/gu) || [];
  return letters.length >= 2;
}

function getExpectedMockText(
  environment: BrowserScenarioEnvironment,
  expectedText: string
): string | undefined {
  return environment === 'mock' ? expectedText : undefined;
}

async function withScenarioTranslationEndpoint<T>({
  context,
  environment,
  mockedText,
  callback
}: {
  context: BrowserContext;
  environment: BrowserScenarioEnvironment;
  mockedText: string;
  callback: () => Promise<T>;
}): Promise<T> {
  if (environment === 'mock') {
    return withMockedTranslationEndpoint(context, mockedText, callback);
  }

  return callback();
}

async function waitForTranslationsCleared(chat: ChatSurface): Promise<void> {
  await test.step('Wait for previous translation state to clear', async () => {
    await expect(chat.locator('.ytcq-translation')).toHaveCount(0, { timeout: 5_000 });
    await expect(chat.locator('.ytcq-translation-replaced')).toHaveCount(0, { timeout: 5_000 });
    await expect(chat.locator(`${NORMAL_CHAT_MESSAGE_SELECTOR}[data-ytcq-translation-key]`)).toHaveCount(0, {
      timeout: 5_000
    });
  });
}

function escapeCssAttributeValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\a ');
}
