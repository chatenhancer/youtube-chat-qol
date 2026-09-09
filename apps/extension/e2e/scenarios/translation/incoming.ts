/** Browser scenarios for incoming translation behavior. */
import { expect, test, type BrowserContext } from '@playwright/test';
import { requireControlledChat, type ControlledChat } from '../../support/controlled-chat';
import { withMockedTranslationEndpoint } from '../../support/translation-endpoint';
import {
  NORMAL_CHAT_MESSAGE_SELECTOR,
  type BrowserScenario,
  type ChatSurface
} from '../types';
import {
  expectAnyRenderedTranslation,
  expectToggleableReplacement,
  findTranslatableSourceMessage
} from './rendering';
import { withTranslationCleared, withTranslationEnabled } from './storage';
import {
  CONTENT_INSTANCE_ATTRIBUTE,
  MOCKED_TARGET_LANGUAGE,
  MOCKED_TRANSLATED_TEXT,
  TOGGLE_SOURCE_LANGUAGE,
  TOGGLE_TARGET_LANGUAGE,
  TOGGLE_TRANSLATED_TEXT
} from './test-data';

export const mockedMessageTranslationScenario: BrowserScenario = async ({ chat, context, controlledChat }) => {
  await expectMockedIncomingTranslation({ chat, context, controlledChat });
};

export const mockedReplacedTranslationToggleScenario: BrowserScenario = async ({ chat, context, controlledChat }) => {
  await expectMockedReplacedTranslationToggle({
    chat,
    context,
    controlledChat: requireControlledChat(controlledChat)
  });
};

async function expectMockedIncomingTranslation({
  chat,
  context,
  controlledChat
}: {
  chat: ChatSurface;
  context: BrowserContext;
  controlledChat?: ControlledChat;
}): Promise<void> {
  await test.step('Use mocked translation endpoint', async () => {
    await withMockedTranslationEndpoint(context, MOCKED_TRANSLATED_TEXT, async () => {
      await enableTranslationAndExpectRendered({
        chat,
        context,
        controlledChat,
        targetLanguage: MOCKED_TARGET_LANGUAGE,
        expectedText: MOCKED_TRANSLATED_TEXT
      });
    });
  });
}

async function enableTranslationAndExpectRendered({
  chat,
  context,
  controlledChat,
  targetLanguage,
  expectedText
}: {
  chat: ChatSurface;
  context: BrowserContext;
  controlledChat?: ControlledChat;
  targetLanguage: string;
  expectedText: string;
}): Promise<void> {
  await withTranslationCleared({ chat, context, targetLanguage, callback: async () => {
    // Recorded replay has no controlled ingress. Live tests use known text
    // instead of depending on the language/content of the current public chat.
    if (!controlledChat) {
      await reloadChatForMockedTranslation(chat);
      await findTranslatableSourceMessage(chat);
    }

    await test.step(`Enable translation to ${targetLanguage}`, async () => {
      await withTranslationEnabled({
        chat,
        context,
        targetLanguage,
        translationDisplay: 'below',
        callback: async () => {
          if (!controlledChat) {
            await expectAnyRenderedTranslation({ chat, targetLanguage, expectedText });
            return;
          }
          const sourceText = 'Gracias por probar la traducción de mensajes entrantes';
          const messageId = await controlledChat.injectMessage({
            author: '@IncomingTranslationViewer',
            text: sourceText
          });
          const sourceMessage = chat.locator(`#${messageId}`);
          const translation = sourceMessage.locator(`.ytcq-translation[lang="${targetLanguage}"]`);
          await expect(translation).toBeVisible({ timeout: 20_000 });
          await expect(translation).toContainText(expectedText);
          await expect(sourceMessage.locator('#message')).toHaveText(sourceText);
        }
      });
    });
  } });
}

async function expectMockedReplacedTranslationToggle({
  chat,
  context,
  controlledChat
}: {
  chat: ChatSurface;
  context: BrowserContext;
  controlledChat: ControlledChat;
}): Promise<void> {
  await test.step('Toggle a controlled native message translation', async () => {
    await withMockedTranslationEndpoint(context, TOGGLE_TRANSLATED_TEXT, async () => {
      await withTranslationCleared({ chat, context, targetLanguage: TOGGLE_TARGET_LANGUAGE, callback: async () => {
        await withTranslationEnabled({
          chat,
          context,
          targetLanguage: TOGGLE_TARGET_LANGUAGE,
          translationDisplay: 'replace',
          callback: async () => {
            const sourceText = 'Gracias por probar la traducción del mensaje';
            const messageId = await controlledChat.injectMessage({
              author: '@InlineToggleViewer',
              text: sourceText
            });
            const sourceMessage = chat.locator(`#${messageId}`);
            await expectToggleableReplacement({
              host: sourceMessage,
              originalTitle: /^Translated: Browser translated toggle result(?:\s.*)?$/u,
              sourceText,
              text: sourceMessage.locator('#message').first()
            });
          }
        });
      } });
    }, TOGGLE_SOURCE_LANGUAGE);
  });
}

async function reloadChatForMockedTranslation(chat: ChatSurface): Promise<void> {
  await test.step('Reload chat after disabling translation', async () => {
    const html = chat.locator('html');
    await expect(html).toHaveAttribute(CONTENT_INSTANCE_ATTRIBUTE, /.+/, { timeout: 15_000 });
    const previousInstance = await html.getAttribute(CONTENT_INSTANCE_ATTRIBUTE);
    await chat.locator('body').evaluate(() => {
      window.location.reload();
    });
    await expect.poll(
      () => html.getAttribute(CONTENT_INSTANCE_ATTRIBUTE),
      {
        message: 'Expected the reloaded chat document to claim a new extension instance.',
        timeout: 45_000
      }
    ).not.toBe(previousInstance);
    await expect(chat.locator('yt-live-chat-renderer')).toBeVisible({ timeout: 45_000 });
    await expect(chat.locator(NORMAL_CHAT_MESSAGE_SELECTOR).first()).toBeVisible({
      timeout: 45_000
    });
  });
}
