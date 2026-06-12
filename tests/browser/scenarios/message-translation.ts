/**
 * Browser scenarios for incoming message translation.
 *
 * The mocked scenario verifies extension wiring deterministically. The real
 * Translate scenario leaves the endpoint unmocked so provider outages or
 * response-shape changes fail in one clearly named browser test.
 */
import { expect, test, type BrowserContext, type Locator } from '@playwright/test';
import { withExtensionStorageValues } from '../support/extension-storage';
import { closeFocusPromptIfPresent } from '../support/focus-panel';
import { centerLocatorInViewport } from '../support/locator';
import { appendMockFixtureMessage } from '../support/mock-page';
import { cleanVisibleText, getRichVisibleText } from '../support/text';
import { withMockedTranslationEndpoint } from '../support/translation-endpoint';
import { openSettingsMenu } from '../support/menu-openers';
import {
  NORMAL_CHAT_MESSAGE_SELECTOR,
  type ChatSurface,
  type BrowserScenario
} from './types';

const MOCKED_TARGET_LANGUAGE = 'cy';
const MOCKED_TRANSLATED_TEXT = 'Helo fyd';
const DISPLAY_TARGET_LANGUAGE = 'eo';
const DISPLAY_TRANSLATED_TEXT = 'YTCQ display result';
const REAL_TARGET_LANGUAGE = 'ga';
const REAL_TOGGLE_TARGET_LANGUAGE = 'ka';
const SETTINGS_TRANSLATED_TEXT = 'YTCQ settings result';
const TOGGLE_TARGET_LANGUAGE = 'en';
const TOGGLE_SOURCE_LANGUAGE = 'es';
const TOGGLE_TRANSLATED_TEXT = 'Browser translated toggle result';

type TranslationDisplayMode = 'below' | 'replace';

export const mockedMessageTranslationScenario: BrowserScenario = async ({ chat, context }) => {
  await waitForSourceChatMessage(chat);
  await expectMockedIncomingTranslation({ chat, context });
};

export const realMessageTranslationScenario: BrowserScenario = async ({ chat, context }) => {
  await waitForSourceChatMessage(chat);
  await expectRealIncomingTranslation({ chat, context });
};

export const realReplacedTranslationToggleScenario: BrowserScenario = async ({ chat, context }) => {
  await waitForSourceChatMessage(chat);
  await expectRealReplacedTranslationToggle({ chat, context });
};

export const translationDisplayScenario: BrowserScenario = async ({ chat, context }) => {
  await waitForSourceChatMessage(chat);
  await expectTranslationDisplayModes({ chat, context });
};

export const replacedTranslationToggleSurfacesScenario: BrowserScenario = async ({ chat, context }) => {
  await expectReplacedTranslationToggleSurfaces({ chat, context });
};

export const translationSettingsReactScenario: BrowserScenario = async ({ chat, context }) => {
  await waitForSourceChatMessage(chat);
  await expectTranslateSettingReactsLive({ chat, context });
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
  await test.step('Use mocked translation endpoint', async () => {
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
  context
}: {
  chat: ChatSurface;
  context: BrowserContext;
}): Promise<void> {
  await test.step('Use mocked translation endpoint for display modes', async () => {
    await withMockedTranslationEndpoint(context, DISPLAY_TRANSLATED_TEXT, async () => {
      await withTranslationCleared({ chat, context, targetLanguage: DISPLAY_TARGET_LANGUAGE, callback: async () => {
        const { sourceMessage, sourceText } = await expectBelowDisplayMode({
          chat,
          context,
          expectedText: DISPLAY_TRANSLATED_TEXT
        });
        await expectReplaceDisplayMode({
          context,
          sourceMessage,
          sourceText,
          expectedText: DISPLAY_TRANSLATED_TEXT
        });
      } });
    });
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
        await expect(messageText).toHaveAttribute('title', /^Original \(.+\): /);
        await expect(sourceMessage.locator('.ytcq-translation')).toHaveCount(0);
      }
    });
  });
}

async function expectReplacedTranslationToggleSurfaces({
  chat,
  context
}: {
  chat: ChatSurface;
  context: BrowserContext;
}): Promise<void> {
  await test.step('Use mocked translation endpoint for replaced toggle surfaces', async () => {
    await withMockedTranslationEndpoint(context, TOGGLE_TRANSLATED_TEXT, async () => {
      await withTranslationCleared({ chat, context, targetLanguage: TOGGLE_TARGET_LANGUAGE, callback: async () => {
        await withTranslationEnabled({
          context,
          targetLanguage: TOGGLE_TARGET_LANGUAGE,
          translationDisplay: 'replace',
          callback: async () => {
            const source = await appendTranslatedToggleMessage(chat);
            await expectLiveMessageReplacementToggle(chat, source);
            await expectProfileCardReplacementToggle(chat, source);
            await expectFocusPanelReplacementToggle(chat, source);
          }
        });
      } });
    }, TOGGLE_SOURCE_LANGUAGE);
  });
}

async function expectRealReplacedTranslationToggle({
  chat,
  context
}: {
  chat: ChatSurface;
  context: BrowserContext;
}): Promise<void> {
  await test.step('Use real Google Translate response for replaced toggle', async () => {
    await withTranslationCleared({ chat, context, targetLanguage: REAL_TOGGLE_TARGET_LANGUAGE, callback: async () => {
      await withTranslationEnabled({
        context,
        targetLanguage: REAL_TOGGLE_TARGET_LANGUAGE,
        translationDisplay: 'replace',
        callback: async () => {
          const replaced = await findRealReplacedTranslation(chat, REAL_TOGGLE_TARGET_LANGUAGE);
          await expectToggleableRealReplacement({
            host: replaced.host,
            originalTitle: /^Translated: .+/u,
            sourceText: replaced.sourceText,
            sourceVisibleText: replaced.sourceVisibleText,
            text: replaced.text,
            targetLanguage: REAL_TOGGLE_TARGET_LANGUAGE,
            translatedTitle: replaced.translatedTitle
          });
        }
      });
    } });
  });
}

async function findRealReplacedTranslation(
  chat: ChatSurface,
  targetLanguage: string
): Promise<{
  host: Locator;
  sourceText: string;
  sourceVisibleText: string;
  text: Locator;
  translatedText: string;
  translatedVisibleText: string;
  translatedTitle: string;
}> {
  return test.step('Find a real replaced translation with original-text metadata', async () => {
    const messages = chat.locator(`${NORMAL_CHAT_MESSAGE_SELECTOR}.ytcq-translation-replaced`);
    await expect.poll(async () => findRealReplacedTranslationCandidate(messages, targetLanguage), {
      message: 'Real Google Translate should replace at least one visible chat message.',
      timeout: 30_000
    }).not.toBeNull();

    const candidate = await findRealReplacedTranslationCandidate(messages, targetLanguage);
    if (!candidate) {
      throw new Error('Could not refind the selected real replaced translation.');
    }

    const host = chat.locator(
      `${NORMAL_CHAT_MESSAGE_SELECTOR}[id="${escapeCssAttributeValue(candidate.messageId)}"]`
    ).first();
    const text = host.locator('#message').first();

    if (!candidate.sourceText || !candidate.translatedText) {
      throw new Error('Real replaced translation was missing readable original or translated text.');
    }

    return {
      host,
      sourceText: candidate.sourceText,
      sourceVisibleText: candidate.sourceVisibleText,
      text,
      translatedText: candidate.translatedText,
      translatedVisibleText: candidate.translatedVisibleText,
      translatedTitle: candidate.translatedTitle
    };
  });
}

async function findRealReplacedTranslationCandidate(
  messages: Locator,
  targetLanguage: string
): Promise<{
  messageId: string;
  sourceText: string;
  sourceVisibleText: string;
  translatedText: string;
  translatedVisibleText: string;
  translatedTitle: string;
} | null> {
  const count = await messages.count();

  for (let index = 0; index < count; index += 1) {
    const message = messages.nth(index);
    const snapshot = await message.evaluate((element) => {
      const text = element.querySelector<HTMLElement>('#message');
      return {
        language: text?.getAttribute('lang') || '',
        messageId: element.id || '',
        translatedText: text?.innerText || text?.textContent || '',
        translatedTitle: text?.getAttribute('title') || ''
      };
    }).catch(() => null);
    if (!snapshot?.messageId || snapshot.language !== targetLanguage) continue;

    const { messageId, translatedTitle } = snapshot;
    const sourceText = getOriginalTextFromReplacementTitle(translatedTitle);
    if (!sourceText) continue;

    const translatedText = cleanVisibleText(snapshot.translatedText);
    if (!translatedText || translatedText === sourceText) continue;

    const sourceVisibleText = getComparableVisibleText(sourceText);
    const translatedVisibleText = getComparableVisibleText(translatedText);
    if (!sourceVisibleText || !translatedVisibleText || sourceVisibleText === translatedVisibleText) continue;

    return {
      messageId,
      sourceText,
      sourceVisibleText,
      translatedText,
      translatedVisibleText,
      translatedTitle
    };
  }

  return null;
}

async function appendTranslatedToggleMessage(chat: ChatSurface): Promise<{
  authorName: string;
  messageId: string;
  sourceText: string;
}> {
  return test.step('Append a deterministic translatable mock message', async () => {
    const messageId = await appendMockFixtureMessage(chat, {
      author: '@ToggleViewer',
      channel: 'fixture-channel-toggle-viewer',
      text: 'Gracias por probar el cambio'
    });
    if (!messageId) throw new Error('Could not append mock translation toggle message.');

    const source = {
      authorName: '@ToggleViewer',
      messageId,
      sourceText: 'Gracias por probar el cambio'
    };
    await expect(getSourceMessage(chat, source)).toBeVisible({ timeout: 10_000 });
    return source;
  });
}

async function expectLiveMessageReplacementToggle(
  chat: ChatSurface,
  source: {
    messageId: string;
    sourceText: string;
  }
): Promise<void> {
  await test.step('Toggle replaced translation in the chat message row', async () => {
    const sourceMessage = getSourceMessage(chat, source);
    await expectToggleableReplacement({
      host: sourceMessage,
      text: sourceMessage.locator('#message').first(),
      sourceText: source.sourceText
    });
  });
}

async function expectProfileCardReplacementToggle(
  chat: ChatSurface,
  source: {
    messageId: string;
    sourceText: string;
  }
): Promise<void> {
  await test.step('Toggle replaced translation in recent-message profile card', async () => {
    const sourceMessage = getSourceMessage(chat, source);
    await centerLocatorInViewport(sourceMessage);
    await sourceMessage.locator('#author-photo').first().click();

    const profileCard = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');
    await expect(profileCard).toBeVisible({ timeout: 10_000 });

    const record = profileCard.locator(`.ytcq-profile-card-message[data-ytcq-live-message-id="${escapeCssAttributeValue(source.messageId)}"]`).first();
    const text = record.locator('.ytcq-profile-card-message-text').first();
    await expectToggleableReplacement({
      host: record,
      text,
      sourceText: source.sourceText
    });

    await profileCard.locator('.ytcq-profile-card-close').click();
    await expect(profileCard).toHaveCount(0);
  });
}

async function expectFocusPanelReplacementToggle(
  chat: ChatSurface,
  source: {
    authorName: string;
    messageId: string;
    sourceText: string;
  }
): Promise<void> {
  await test.step('Toggle replaced translation in focus panel', async () => {
    const sourceMessage = getSourceMessage(chat, source);
    await centerLocatorInViewport(sourceMessage);
    await sourceMessage.locator('#author-name').first().click();

    const collapsed = chat.locator('.ytcq-focus-card-collapsed');
    await expect(collapsed).toBeVisible({ timeout: 10_000 });
    await collapsed.click();

    const panel = chat.locator('.ytcq-focus-card-expanded');
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(panel.locator('.ytcq-focus-author')).toContainText(source.authorName);

    const records = panel.locator('.ytcq-focus-message');
    await expect.poll(async () => findLocatorIndexByText(records, TOGGLE_TRANSLATED_TEXT), {
      message: 'Focus panel should contain the translated message record.',
      timeout: 10_000
    }).toBeGreaterThanOrEqual(0);

    const record = records.nth(await findLocatorIndexByText(records, TOGGLE_TRANSLATED_TEXT));
    const text = record.locator('.ytcq-focus-bubble').first();
    await expectToggleableReplacement({
      host: record,
      text,
      sourceText: source.sourceText
    });

    await closeFocusPromptIfPresent(chat);
  });
}

async function expectToggleableReplacement({
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

  await text.locator('.ytcq-replaced-translation-icon').click();

  await expect(host).toHaveAttribute('data-ytcq-translation-view', 'original');
  await expectVisibleTextToContain(text, sourceVisibleText);
  await expect(text).toHaveAttribute('title', originalTitle);
  await expect.poll(async () => text.evaluate((element) => getComputedStyle(element).textDecorationLine), {
    message: 'Original view should not keep the translated-message underline.',
    timeout: 2_000
  }).toBe('none');

  await text.locator('.ytcq-replaced-translation-icon').click();

  await expect(host).toHaveAttribute('data-ytcq-translation-view', 'translated');
  await expectVisibleTextToContain(text, expectedTranslatedVisibleText);
  await expect(text).toHaveAttribute('title', translatedTitle);
}

async function expectToggleableRealReplacement({
  host,
  originalTitle,
  sourceText,
  sourceVisibleText = sourceText,
  targetLanguage,
  text,
  translatedTitle
}: {
  host: Locator;
  originalTitle: RegExp | string;
  sourceText: string;
  sourceVisibleText?: string;
  targetLanguage: string;
  text: Locator;
  translatedTitle: string;
}): Promise<void> {
  await expect(host).toHaveClass(/ytcq-translation-replaced/, { timeout: 20_000 });
  await expect(host).toHaveAttribute('data-ytcq-translation-view', 'translated');
  await expect(text).toHaveClass(/ytcq-translation-replaced-text/);
  await expect(text).toHaveAttribute('lang', targetLanguage);
  await expect(text).toHaveAttribute('title', translatedTitle);
  await expectVisibleTextToDifferFrom(text, sourceVisibleText);

  await text.locator('.ytcq-replaced-translation-icon').click();

  await expect(host).toHaveAttribute('data-ytcq-translation-view', 'original');
  await expectVisibleTextToMatchStoredOriginal(text, sourceVisibleText);
  await expect(text).toHaveAttribute('title', originalTitle);
  await expect.poll(async () => text.evaluate((element) => getComputedStyle(element).textDecorationLine), {
    message: 'Original view should not keep the translated-message underline.',
    timeout: 2_000
  }).toBe('none');

  await text.locator('.ytcq-replaced-translation-icon').click();

  await expect(host).toHaveAttribute('data-ytcq-translation-view', 'translated');
  await expect(text).toHaveAttribute('title', translatedTitle);
  await expectVisibleTextToDifferFrom(text, sourceVisibleText);
}

async function expectVisibleTextToContain(locator: Locator, expectedText: string): Promise<void> {
  await expect.poll(async () => getComparableLocatorText(locator), {
    message: `Expected visible text to include ${expectedText}.`,
    timeout: 15_000
  }).toContain(getComparableVisibleText(expectedText));
}

async function expectVisibleTextToMatchStoredOriginal(locator: Locator, expectedText: string): Promise<void> {
  const comparableExpectedText = getComparableVisibleText(expectedText);
  await expect.poll(async () => {
    const comparableText = await getComparableLocatorText(locator);
    return Boolean(comparableText)
      && comparableText.length >= Math.min(6, comparableExpectedText.length)
      && (
        comparableText.includes(comparableExpectedText)
        || comparableExpectedText.includes(comparableText)
      );
  }, {
    message: `Expected visible original text to match stored original text ${expectedText}.`,
    timeout: 15_000
  }).toBe(true);
}

async function expectVisibleTextToDifferFrom(locator: Locator, unexpectedText: string): Promise<void> {
  const comparableUnexpectedText = getComparableVisibleText(unexpectedText);
  await expect.poll(async () => {
    const comparableText = await getComparableLocatorText(locator);
    return Boolean(comparableText) && comparableText !== comparableUnexpectedText;
  }, {
    message: `Expected visible text to differ from ${unexpectedText}.`,
    timeout: 15_000
  }).toBe(true);
}

async function expectTranslateSettingReactsLive({
  chat,
  context
}: {
  chat: ChatSurface;
  context: BrowserContext;
}): Promise<void> {
  await test.step('Use mocked translation endpoint for chat settings', async () => {
    await withMockedTranslationEndpoint(context, SETTINGS_TRANSLATED_TEXT, async () => {
      await withTranslationCleared({ chat, context, targetLanguage: MOCKED_TARGET_LANGUAGE, callback: async () => {
        const menu = await openSettingsMenu(chat);
        const translateItem = menu.locator('.ytcq-settings-item[data-ytcq-setting="targetLanguage"]').first();
        await findTranslatableSourceMessage(chat);

        await test.step('Enable Translate and verify existing message translates', async () => {
          await expect(translateItem).toHaveAttribute('aria-checked', 'false');
          await translateItem.click();
          await expect(translateItem).toHaveAttribute('aria-checked', 'true');
          await expectAnyRenderedTranslation({
            chat,
            targetLanguage: MOCKED_TARGET_LANGUAGE,
            expectedText: SETTINGS_TRANSLATED_TEXT
          });
        });

        await test.step('Disable Translate and verify visible translation clears', async () => {
          await translateItem.click();
          await expect(translateItem).toHaveAttribute('aria-checked', 'false');
          await expect(chat.locator('.ytcq-translation')).toHaveCount(0, { timeout: 5_000 });
          await expect(chat.locator('.ytcq-translation-replaced')).toHaveCount(0, { timeout: 5_000 });
        });
      } });
    });
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

async function waitForTranslationsCleared(chat: ChatSurface): Promise<void> {
  await test.step('Wait for previous translation state to clear', async () => {
    await expect(chat.locator('.ytcq-translation')).toHaveCount(0, { timeout: 5_000 });
    await expect(chat.locator('.ytcq-translation-replaced')).toHaveCount(0, { timeout: 5_000 });
    await expect(chat.locator(`${NORMAL_CHAT_MESSAGE_SELECTOR}[data-ytcq-translation-key]`)).toHaveCount(0, {
      timeout: 5_000
    });
  });
}

function getSourceMessage(
  chat: ChatSurface,
  source: {
    messageId: string;
  }
): Locator {
  return chat.locator(`${NORMAL_CHAT_MESSAGE_SELECTOR}[id="${escapeCssAttributeValue(source.messageId)}"]`).first();
}

async function findLocatorIndexByText(locator: Locator, expectedText: string): Promise<number> {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const text = cleanVisibleText(await locator.nth(index).innerText().catch(() => ''));
    if (text.includes(expectedText)) return index;
  }
  return -1;
}

function getOriginalTextFromReplacementTitle(title: string): string {
  const match = /^Original \([^)]+\):\s+([\s\S]+)$/u.exec(title);
  return cleanVisibleText(match?.[1] || '');
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

function escapeCssAttributeValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\a ');
}
