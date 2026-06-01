/**
 * Browser scenario for the popup reset action.
 *
 * The storage snapshot helpers restore the test profile after the assertion so
 * the destructive reset action can run against mock and live browser sessions.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { getExtensionId } from '../helpers/extension';
import {
  getExtensionStorageValues,
  withExtensionStorageSnapshot,
  withExtensionStorageValues
} from '../helpers/extension-storage';
import type { BrowserScenario, ChatSurface } from './types';

const RESET_SYNC_SEED = {
  composerTranslateLanguage: 'ja',
  targetLanguage: 'es',
  lastTranslationTarget: 'es',
  translationDisplay: 'below',
  sound: false,
  startupEffect: false
};
const RESET_LOCAL_SEED = {
  ytcqEmojiUsage: [{ key: 'text:😀', emojiId: '', src: '', alt: '', label: 'grinning face', shortcut: '', text: '😀', count: 3, lastUsed: 1 }],
  ytcqInboxKeywords: ['reset-browser-test']
};

export const popupResetScenario: BrowserScenario = async ({ chat, context }) => {
  await withExtensionStorageSnapshot(context, 'sync', async () => {
    await withExtensionStorageSnapshot(context, 'local', async () => {
      await withExtensionStorageValues(context, 'sync', RESET_SYNC_SEED, async () => {
        await withExtensionStorageValues(context, 'local', RESET_LOCAL_SEED, async () => {
          await openInboxPanel(chat);
          await resetExtensionFromPopup(context);
          await expectPopupResetState({ chat, context });
        });
      });
    });
  });
};

async function openInboxPanel(chat: ChatSurface): Promise<void> {
  await test.step('Open Inbox panel before reset', async () => {
    await chat.locator('.ytcq-inbox-button').click();
    await expect(chat.locator('.ytcq-inbox-card')).toBeVisible();
  });
}

async function resetExtensionFromPopup(context: BrowserContext): Promise<void> {
  await test.step('Confirm popup reset', async () => {
    const popup = await openExtensionPopup(context);
    const dialogMessages: string[] = [];
    popup.on('dialog', async (dialog) => {
      dialogMessages.push(dialog.message());
      await dialog.accept();
    });

    try {
      await popup.locator('#resetExtension').click();
      await expect.poll(() => dialogMessages.length, {
        message: 'Reset should show confirmation and completion dialogs.',
        timeout: 10_000
      }).toBeGreaterThanOrEqual(2);
    } finally {
      await popup.close();
    }
  });
}

async function expectPopupResetState({
  chat,
  context
}: {
  chat: ChatSurface;
  context: BrowserContext;
}): Promise<void> {
  await test.step('Verify sync options were restored to defaults', async () => {
    await expect.poll(async () => getExtensionStorageValues(context, 'sync', Object.keys(RESET_SYNC_SEED)), {
      timeout: 5_000
    }).toMatchObject({
      composerTranslateLanguage: '',
      targetLanguage: '',
      lastTranslationTarget: 'en',
      translationDisplay: 'replace',
      sound: true,
      startupEffect: true
    });
  });

  await test.step('Verify local extension data was cleared', async () => {
    const localValues = await getExtensionStorageValues(context, 'local', Object.keys(RESET_LOCAL_SEED));
    expect(localValues).toEqual({});
  });

  await test.step('Verify visible panels were reset', async () => {
    await expect(chat.locator('.ytcq-inbox-card')).toHaveCount(0);
  });
}

async function openExtensionPopup(context: BrowserContext): Promise<Page> {
  const extensionId = await getExtensionId(context);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  return popup;
}
