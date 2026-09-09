/** Browser scenarios for settings translation behavior. */
import { expect, test, type BrowserContext } from '@playwright/test';
import { requireControlledChat, type ControlledChat } from '../../support/controlled-chat';
import { openSettingsMenu } from '../../support/menu-openers';
import { withMockedTranslationEndpoint } from '../../support/translation-endpoint';
import type { BrowserScenario, ChatSurface } from '../types';
import { withTranslationCleared } from './storage';
import { MOCKED_TARGET_LANGUAGE, SETTINGS_TRANSLATED_TEXT } from './test-data';

export const translationSettingsReactScenario: BrowserScenario = async ({
  chat,
  context,
  controlledChat
}) => {
  await expectTranslateSettingReactsLive({
    chat,
    context,
    controlledChat: requireControlledChat(controlledChat)
  });
};

async function expectTranslateSettingReactsLive({
  chat,
  context,
  controlledChat
}: {
  chat: ChatSurface;
  context: BrowserContext;
  controlledChat: ControlledChat;
}): Promise<void> {
  await test.step('Use mocked translation endpoint for chat settings', async () => {
    await withMockedTranslationEndpoint(context, SETTINGS_TRANSLATED_TEXT, async () => {
      await withTranslationCleared({ chat, context, targetLanguage: MOCKED_TARGET_LANGUAGE, callback: async () => {
        const sourceText = 'Gracias por probar la configuración de traducción';
        const messageId = await controlledChat.injectMessage({
          author: '@TranslationSettingViewer',
          channel: 'UCTranslationSettingViewer',
          text: sourceText
        });
        const sourceMessage = chat.locator(`#${messageId}`);
        await expect(sourceMessage.locator('#message')).toHaveText(sourceText);
        const translation = sourceMessage.locator(`.ytcq-translation[lang="${MOCKED_TARGET_LANGUAGE}"]`);
        await expect(translation).toHaveCount(0);
        const menu = await openSettingsMenu(chat);
        const translateItem = menu.locator('.ytcq-settings-item[data-ytcq-setting="targetLanguage"]').first();

        await test.step('Enable Translate and verify existing message translates', async () => {
          await expect(translateItem).toHaveAttribute('aria-checked', 'false');
          await translateItem.click();
          await expect(translateItem).toHaveAttribute('aria-checked', 'true');
          await expect(translation).toBeVisible({ timeout: 20_000 });
          await expect(translation).toContainText(SETTINGS_TRANSLATED_TEXT);
          await expect(sourceMessage.locator('#message')).toHaveText(sourceText);
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
