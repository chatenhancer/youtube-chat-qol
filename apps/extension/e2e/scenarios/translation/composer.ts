/**
 * Browser scenario for the composer translation control.
 *
 * This scenario is logged-in only because YouTube exposes the composer only
 * when the current viewer can write in chat.
 */
import { expect, test, type Request } from '@playwright/test';
import {
  clearChatComposer,
  getChatComposerText,
  setChatComposerText
} from '../../support/composer';
import {
  getExtensionStorageValues,
  withExtensionStorageValues
} from '../../support/extension-storage';
import { withMockedTranslationEndpoint } from '../../support/translation-endpoint';
import type { BrowserScenario, ChatSurface } from '../types';

const MOCKED_COMPOSER_TRANSLATION = 'texte traduit depuis le compositeur';
const MOCKED_PROTECTED_COMPOSER_TRANSLATION = 'texte traduit §0§ §1§';
const MOCKED_COMPOSER_SOURCE = 'translate this composer draft';
const PROTECTED_COMPOSER_SOURCE = 'hello @DraftTarget ✅';
const PROTECTED_COMPOSER_EXPECTED = 'texte traduit @DraftTarget ✅';
const REAL_COMPOSER_SOURCE = 'thank you for the stream';

export const mockedComposerTranslationScenario: BrowserScenario = async ({ chat, context }) => {
  await expectChatComposerVisible(chat);
  await withMockedTranslationEndpoint(context, MOCKED_COMPOSER_TRANSLATION, async () => {
    await withExtensionStorageValues(context, 'sync', {
      composerTranslateLanguage: ''
    }, async () => {
      await expectComposerTranslateButtonAttached(chat);
      await openComposerTranslationPanel(chat);
      await chat.locator('.ytcq-composer-translate-select').selectOption('fr');
      await expect.poll(async () =>
        (await getExtensionStorageValues(context, 'sync', ['composerTranslateLanguage']))
          .composerTranslateLanguage
      ).toBe('fr');
      await chat.locator('.ytcq-composer-translate-button').click();
      await expect(chat.locator('.ytcq-composer-translate-panel')).toBeHidden();
      await translateComposerDraft({
        chat,
        expectedText: MOCKED_COMPOSER_TRANSLATION,
        sourceText: MOCKED_COMPOSER_SOURCE
      });
    });
  });
};

export const mockedComposerTranslationProtectedDraftScenario: BrowserScenario = async ({ chat, context }) => {
  await expectChatComposerVisible(chat);
  await withMockedTranslationEndpoint(context, MOCKED_PROTECTED_COMPOSER_TRANSLATION, async () => {
    await withExtensionStorageValues(context, 'sync', {
      composerTranslateLanguage: 'fr'
    }, async () => {
      await translateComposerDraft({
        chat,
        expectedText: PROTECTED_COMPOSER_EXPECTED,
        sourceText: PROTECTED_COMPOSER_SOURCE
      });
    });
  });
};

export const realComposerTranslationScenario: BrowserScenario = async ({ chat, context }) => {
  await expectChatComposerVisible(chat);
  const requestedBodies: unknown[] = [];
  const captureRequest = (request: Request) => {
    const url = new URL(request.url());
    if (url.hostname === 'translate-pa.googleapis.com' && url.pathname === '/v1/translateHtml') {
      requestedBodies.push(request.postDataJSON());
    }
  };
  context.on('request', captureRequest);
  try {
    await withExtensionStorageValues(context, 'sync', {
      composerTranslateLanguage: 'ja'
    }, async () => {
      await translateComposerDraft({
        chat,
        expectedPattern: /[\u3040-\u30ff\u4e00-\u9faf]/,
        sourceText: REAL_COMPOSER_SOURCE
      });
    });
    expect(requestedBodies).toContainEqual([[[REAL_COMPOSER_SOURCE], 'auto', 'ja'], 'wt_lib']);
  } finally {
    context.off('request', captureRequest);
    await clearChatComposer(chat);
  }
};

async function expectChatComposerVisible(chat: ChatSurface): Promise<void> {
  await test.step('Verify chat composer is visible', async () => {
    const composer = chat.locator('yt-live-chat-message-input-renderer');
    const composerVisible = await composer.waitFor({ state: 'visible', timeout: 15_000 }).then(
      () => true,
      () => false
    );
    if (composerVisible) return;

    const restrictedParticipation = chat.locator('yt-live-chat-restricted-participation-renderer');
    test.skip(
      await restrictedParticipation.isVisible(),
      'YouTube live chat currently restricts participation, so the composer is unavailable.'
    );
    await expect(composer).toBeVisible({ timeout: 1_000 });
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
    await expect.poll(async () => {
      const translatedText = await getChatComposerText(chat);
      if (expectedText) return translatedText.includes(expectedText);
      if (expectedPattern) return expectedPattern.test(translatedText);
      return false;
    }, {
      message: 'Composer translation should replace the draft text.',
      timeout: 15_000
    }).toBe(true);

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
