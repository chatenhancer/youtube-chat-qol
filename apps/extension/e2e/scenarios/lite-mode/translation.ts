/** Browser scenarios for Lite mode translation behavior. */
import { expect, type Locator } from '@playwright/test';
import { toggleLiteModeFromMenu } from './menu';
import {
  setExtensionStorageValues,
  withExtensionStorageValues
} from '../../support/extension-storage';
import { getRichVisibleText } from '../../support/text';
import { withMockedTranslationEndpoint } from '../../support/translation-endpoint';
import type { BrowserScenario, ChatSurface } from '../types';
import {
  LITE_NATIVE_RESTORE_SELECTOR,
  LITE_ROOT_SELECTOR
} from './selectors';

export const liteModeTranslationContinuityScenario: BrowserScenario = async ({ chat, context }) => {
  const translatedText = 'Lite history translation';
  await withExtensionStorageValues(
    context,
    'sync',
    {
      lastTranslationTarget: 'ja',
      liteModeEnabled: false,
      targetLanguage: '',
      translationDisplay: 'below'
    },
    async () => {
      await withMockedTranslationEndpoint(context, translatedText, async () => {
        const { messageId, row: nativeRow } = await findNativeTextRow(chat);
        await setExtensionStorageValues(context, 'sync', {
          lastTranslationTarget: 'ja',
          targetLanguage: 'ja'
        });
        await expect(nativeRow.locator('.ytcq-translation[lang="ja"]')).toContainText(
          translatedText,
          { timeout: 20_000 }
        );

        await toggleLiteModeFromMenu(chat);
        await expect(chat.locator(LITE_ROOT_SELECTOR)).toBeVisible();

        const liteRow = chat.locator(
          `[data-message-id=${JSON.stringify(messageId)}]`
        );
        await expect(liteRow).toBeVisible({ timeout: 20_000 });
        await expect(liteRow.locator('.ytcq-translation[lang="ja"]')).toContainText(
          translatedText,
          { timeout: 20_000 }
        );
      });
    }
  );
  await chat
    .locator(LITE_ROOT_SELECTOR)
    .waitFor({ state: 'detached', timeout: 8_000 })
    .catch(() => undefined);
  await chat
    .locator(LITE_NATIVE_RESTORE_SELECTOR)
    .waitFor({ state: 'detached', timeout: 20_000 })
    .catch(() => undefined);
};

async function findNativeTextRow(
  chat: ChatSurface
): Promise<{ messageId: string; row: Locator; text: string }> {
  const rows = chat.locator('yt-live-chat-text-message-renderer:has(#message)');
  let selectedMessageId = '';
  let selectedRow: Locator | null = null;
  let selectedText = '';

  await expect
    .poll(
      async () => {
        for (let index = (await rows.count()) - 1; index >= 0; index -= 1) {
          const row = rows.nth(index);
          const text = await getRichVisibleText(row.locator('#message').first()).catch(() => '');
          const messageId = await row
            .evaluate((element) => {
              const data = (element as HTMLElement & { data?: { id?: unknown } }).data;
              if (typeof data?.id === 'string' && data.id) return data.id;
              return element.id;
            })
            .catch(() => '');
          if (!text || !messageId) continue;
          selectedMessageId = messageId;
          selectedRow = row;
          selectedText = text;
          return true;
        }
        return false;
      },
      {
        message: 'Expected a populated native text chat row.',
        timeout: 20_000
      }
    )
    .toBe(true);

  return { messageId: selectedMessageId, row: selectedRow!, text: selectedText };
}
