/** Incoming-translation rendering queries and assertions. */
import { expect, test, type Locator } from '@playwright/test';
import { centerLocatorInViewport } from '../../support/locator';
import { cleanVisibleText, getRichVisibleText } from '../../support/text';
import { NORMAL_CHAT_MESSAGE_SELECTOR, type ChatSurface } from '../types';
import { TOGGLE_TARGET_LANGUAGE, TOGGLE_TRANSLATED_TEXT } from './test-data';

const TRANSLATION_RENDER_TIMEOUT_MS = 20_000;
const TRANSLATION_TARGET_ATTRIBUTE = 'data-ytcq-e2e-translation-target';
let nextTranslationTargetId = 0;

export async function expectToggleableReplacement({
  expectedTranslatedText = TOGGLE_TRANSLATED_TEXT,
  expectedTranslatedVisibleText = expectedTranslatedText,
  host,
  originalTitle = `Translated: ${expectedTranslatedText}`,
  sourceText,
  sourceVisibleText = sourceText,
  targetLanguage = TOGGLE_TARGET_LANGUAGE,
  text,
  translatedTitle = `Original (Spanish): ${sourceText}`
}: {
  expectedTranslatedText?: string;
  expectedTranslatedVisibleText?: string;
  host: Locator;
  originalTitle?: RegExp | string;
  sourceText: string;
  sourceVisibleText?: string;
  targetLanguage?: string;
  text: Locator;
  translatedTitle?: string;
}): Promise<void> {
  await expect(host).toHaveClass(/ytcq-translation-replaced/, { timeout: 20_000 });
  await expect(host).toHaveAttribute('data-ytcq-translation-view', 'translated');
  await expect(text).toHaveClass(/ytcq-translation-replaced-text/);
  await expectVisibleTextToContain(text, expectedTranslatedVisibleText);
  await expect(text).toHaveAttribute('lang', targetLanguage);
  await expect(text).toHaveAttribute('title', translatedTitle);

  await clickReplacedTranslationIcon({ host, text });

  await expect(host).toHaveAttribute('data-ytcq-translation-view', 'original');
  await expectVisibleTextToContain(text, sourceVisibleText);
  await expect(text).toHaveAttribute('title', originalTitle);
  await expect.poll(async () => text.evaluate((element) => getComputedStyle(element).textDecorationLine), {
    message: 'Original view should not keep the translated-message underline.',
    timeout: 2_000
  }).toBe('none');

  await clickReplacedTranslationIcon({ host, text });

  await expect(host).toHaveAttribute('data-ytcq-translation-view', 'translated');
  await expectVisibleTextToContain(text, expectedTranslatedVisibleText);
  await expect(text).toHaveAttribute('title', translatedTitle);
}

async function expectVisibleTextToContain(locator: Locator, expectedText: string): Promise<void> {
  await expect.poll(async () => getComparableLocatorText(locator), {
    message: `Expected visible text to include ${expectedText}.`,
    timeout: 15_000
  }).toContain(getComparableVisibleText(expectedText));
}

async function clickReplacedTranslationIcon({
  host,
  text
}: {
  host: Locator;
  text: Locator;
}): Promise<void> {
  const icon = text.locator('.ytcq-replaced-translation-icon').first();
  await centerLocatorInViewport(host);
  await centerLocatorInViewport(icon);
  await icon.click();
}

export async function expectAnyRenderedTranslation({
  chat,
  targetLanguage,
  expectedText
}: {
  chat: ChatSurface;
  targetLanguage: string;
  expectedText?: string;
}): Promise<void> {
  const { sourceText, translation } = await findRenderedTranslation({
    chat,
    targetLanguage,
    expectedText
  });

  await test.step('Verify rendered translation differs from source text', async () => {
    await expect.poll(async () => cleanVisibleText(await translation.innerText()), {
      message: 'Rendered translation text should differ from the original chat message.',
      timeout: 5_000
    }).not.toBe(sourceText);
  });
}

export async function findRenderedTranslation({
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
    await expect(translation).toBeVisible({ timeout: TRANSLATION_RENDER_TIMEOUT_MS });
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

export async function findTranslatableSourceMessage(chat: ChatSurface): Promise<{
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

      const targetId = `translation-${Date.now()}-${nextTranslationTargetId++}`;
      const didFreeze = await candidate
        .evaluate(
          (element, { attribute, value }) => {
            if (!(element instanceof HTMLElement) || !element.isConnected) return false;
            element.setAttribute(attribute, value);
            return true;
          },
          { attribute: TRANSLATION_TARGET_ATTRIBUTE, value: targetId }
        )
        .catch(() => false);
      if (!didFreeze) continue;

      const sourceMessage = chat
        .locator(
          `${NORMAL_CHAT_MESSAGE_SELECTOR}[${TRANSLATION_TARGET_ATTRIBUTE}="${escapeCssAttributeValue(targetId)}"]`
        )
        .first();
      await centerLocatorInViewport(sourceMessage);

      const messageText = sourceMessage.locator('#message').first();
      const plainText = cleanVisibleText(await messageText.innerText().catch(() => ''));
      if (!isLikelyTranslatableSource(plainText)) continue;

      const sourceText = cleanVisibleText(
        await getRichVisibleText(messageText).catch(() => '')
      );
      if (await sourceMessage.getAttribute('data-ytcq-translation-key').catch(() => null)) continue;
      if (await sourceMessage.locator('.ytcq-translation').count().catch(() => 0)) continue;

      const messageId = await sourceMessage.getAttribute('id').catch(() => null);
      if (!messageId) continue;

      if (!await sourceMessage.isVisible().catch(() => false)) continue;
      if ((await sourceMessage.getAttribute('id').catch(() => null)) !== messageId) continue;
      const stableSourceText = cleanVisibleText(
        await getRichVisibleText(sourceMessage.locator('#message').first()).catch(() => '')
      );
      if (stableSourceText !== sourceText) continue;

      return { sourceMessage, sourceText };
    }

    throw new Error('Could not find a visible chat message with stable id and enough text to translate.');
  });
}

function isLikelyTranslatableSource(text: string): boolean {
  const textOutsideMentions = text.replace(/(^|\s)@[\p{Letter}\p{Number}_][^\s@]*/gu, '$1');
  const letters = textOutsideMentions.match(/\p{Letter}/gu) || [];
  return letters.length >= 2;
}

function getComparableVisibleText(text: string): string {
  return cleanVisibleText(text)
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\u200d/g, '')
    .replace(/\ufe0e/g, '')
    .replace(/\ufe0f/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getComparableLocatorText(locator: Locator): Promise<string> {
  const visibleText = await getRichVisibleText(locator, {
    ignoredSelector: '.ytcq-replaced-translation-icon'
  });
  return getComparableVisibleText(visibleText);
}

export function escapeCssAttributeValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\a ');
}
