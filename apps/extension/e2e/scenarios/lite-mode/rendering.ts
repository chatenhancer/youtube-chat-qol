/** Browser scenarios for Lite mode rendering behavior. */
import { expect, test } from '@playwright/test';
import { expectLiteModeMenuState, toggleLiteModeFromMenu } from './menu';
import { clearChatComposerIfVisible, getChatComposerText } from '../../support/composer';
import { closeFocusPromptIfPresent } from '../../support/focus-panel';
import {
  setExtensionStorageValues,
  withExtensionStorageValues
} from '../../support/extension-storage';
import { pauseMockFixtureMessages } from '../../support/mock-page';
import type { BrowserScenario } from '../types';
import {
  clearLiteTestCooldown,
  expectLiteReplacementTranslation,
  expectStoredLiteMode
} from './assertions';
import {
  getLiteDiagnostics,
  installLiteDiagnostics,
  uninstallLiteDiagnostics,
  waitForRequestedLiteInitialSnapshot
} from './diagnostics';
import {
  LITE_NATIVE_DISCARDED_ATTRIBUTE,
  LITE_NATIVE_RESTORE_SELECTOR,
  LITE_ROOT_SELECTOR,
  NATIVE_LIST_SELECTOR
} from './selectors';
import {
  createBatch,
  createRecord,
  dispatchLiteBatch,
  dispatchLiteBatches
} from './transport-fixtures';

export const liteModeMockRenderingAndFallbackScenario: BrowserScenario = async ({
  chat,
  context,
  page
}) => {
  await withExtensionStorageValues(context, 'sync', { liteModeEnabled: false }, async () => {
    await installLiteDiagnostics(chat);
    try {
      const nativeList = chat.locator(NATIVE_LIST_SELECTOR).first();
      const nativeRow = nativeList.locator('yt-live-chat-text-message-renderer').first();
      const nativeTimestamp = nativeRow.locator('#timestamp');

      await test.step('Start with a readable native fixture row', async () => {
        await expect(nativeRow.locator('#author-photo')).toBeVisible();
        await expect(nativeRow.locator('#author-name')).toContainText('@ExampleCreator');
        await expect(nativeRow.locator('#message')).toContainText('Hola mundo');
        await expect(nativeTimestamp).toBeHidden();
      });

      const liteRow = chat.locator('[data-message-id="lite-browser-message-1"]');
      await expectLiteModeMenuState(chat, false);

      await test.step('Enable Lite mode from the Chat Enhancer menu', async () => {
        await toggleLiteModeFromMenu(chat);
        await expectStoredLiteMode(context, true);
        await expectLiteModeMenuState(chat, true);
        await expect(chat.locator(LITE_ROOT_SELECTOR))
          .toBeVisible()
          .catch(async (error) => {
            throw new Error(
              `Lite root did not mount: ${JSON.stringify(await getLiteDiagnostics(chat))}`,
              { cause: error }
            );
          });
        await expect(chat.locator(`${LITE_ROOT_SELECTOR} .ytcq-lite-toolbar`)).toHaveCount(0);
        const seededHistoryRow = chat.locator('[data-message-id="fixture-message-1"]');
        await expect(seededHistoryRow).toBeVisible();
        await expect(seededHistoryRow.locator('#message')).toContainText('Hola mundo');
        await waitForRequestedLiteInitialSnapshot(chat);
      });

      await test.step('Render a sanitized batch and discard the native list', async () => {
        const primaryRecord = createRecord(
          'lite-browser-message-1',
          'Hello from the lightweight feed'
        );
        primaryRecord.author!.badges = [];
        primaryRecord.author!.avatarUrl = 'https://www.youtube.com/favicon.ico';
        primaryRecord.author!.topFanRank = 3;
        const longModeratorRecord = createRecord(
          'lite-browser-message-long-moderator',
          'Long handles remain readable'
        );
        longModeratorRecord.author = {
          ...longModeratorRecord.author!,
          badges: [{ kind: 'moderator', label: 'Moderator' }],
          name: '@A_very_long_moderator_handle_that_should_not_be_ellipsized'
        };
        const ownerRecord = createRecord(
          'lite-browser-message-owner',
          'Owner styling stays native'
        );
        ownerRecord.author = {
          ...ownerRecord.author!,
          badges: [{ kind: 'verified', label: 'Verified' }],
          isOwner: true,
          name: '@ChannelOwner'
        };
        await dispatchLiteBatch(
          chat,
          createBatch([
            {
              type: 'upsert',
              record: primaryRecord
            },
            {
              type: 'upsert',
              record: longModeratorRecord
            },
            {
              type: 'upsert',
              record: ownerRecord
            }
          ])
        );

        await expect(liteRow).toBeVisible();
        await expect(liteRow.locator('#message')).toContainText('Hello from the lightweight feed');
        await expect(liteRow.locator('.ytcq-lite-emoji')).toHaveAttribute(
          'data-emoji-id',
          'wave-emoji'
        );
        await expect(liteRow.locator('#author-photo')).toBeVisible();
        await expect(liteRow.locator('.ytcq-lite-content')).toHaveCSS('align-self', 'center');
        await expect(liteRow.locator('#author-name')).toContainText('@LiteViewer');
        const topFanBadge = liteRow.locator('.ytcq-lite-top-fan-badge');
        await expect(topFanBadge).toBeVisible();
        await expect(topFanBadge).toHaveText('#3');
        await expect(topFanBadge).toHaveAttribute('aria-label', '#3');
        await expect(topFanBadge).toHaveAttribute('data-top-fan-rank', '3');
        await expect(topFanBadge).toHaveCSS('height', '24px');
        await expect(topFanBadge).toHaveCSS('border-radius', '12px');
        await expect(topFanBadge).toHaveCSS('color', 'rgb(255, 255, 255)');
        await expect(topFanBadge).toHaveCSS('background-color', 'rgb(54, 0, 140)');
        await expect(topFanBadge.locator('.ytcq-lite-top-fan-badge-icon')).toBeVisible();
        const longModerator = chat.locator(
          '[data-message-id="lite-browser-message-long-moderator"]'
        );
        await expect(longModerator.locator('.ytcq-lite-moderator-badge-icon')).toBeVisible();
        await expect(longModerator.locator('.ytcq-lite-author-badge')).toHaveText('');
        await expect(longModerator.locator('#author-name')).toContainText(
          '@A_very_long_moderator_handle_that_should_not_be_ellipsized'
        );
        await expect(longModerator.locator('#author-name')).toHaveCSS('text-overflow', 'clip');
        await expect(longModerator.locator('#author-name')).toHaveCSS('overflow', 'visible');

        const owner = chat.locator('[data-message-id="lite-browser-message-owner"]');
        const ownerName = owner.locator('#author-name.owner');
        await expect(ownerName).toBeVisible();
        await expect(
          ownerName.locator('#chip-badges .ytcq-lite-verified-badge-icon')
        ).toBeVisible();
        await expect(owner.locator('#chat-badges .ytcq-lite-author-badge')).toHaveCount(0);
        const ownerColors = await ownerName.evaluate((element) => {
          const style = getComputedStyle(element);
          const badge = element.querySelector<HTMLElement>('.ytcq-lite-author-badge');
          return {
            background: style.backgroundColor,
            badgeColor: badge ? getComputedStyle(badge).color : '',
            color: style.color
          };
        });
        expect(ownerColors.background).toBe('rgb(255, 214, 0)');
        expect(ownerColors.color).toMatch(/^rgba?\(0, 0, 0(?:, 0\.87)?\)$/);
        expect(ownerColors.badgeColor).toBe(ownerColors.color);
        await expect(liteRow.locator('#timestamp')).toBeHidden();
        await expect(chat.locator(NATIVE_LIST_SELECTOR)).toHaveCount(0);
        await expect(chat.locator('html')).toHaveAttribute(LITE_NATIVE_DISCARDED_ATTRIBUTE, 'true');
      });

      await test.step('Style replacement translations like native chat', async () => {
        await expectLiteReplacementTranslation({ context, row: liteRow });
      });

      await test.step('Keep existing author actions working on Lite rows', async () => {
        await liteRow.locator('#author-name').click();
        await expect.poll(() => getChatComposerText(chat)).toContain('@LiteViewer');
        await closeFocusPromptIfPresent(chat);
        await clearChatComposerIfVisible(chat);
      });

      await test.step('Page away from and back toward the live edge with wheel input', async () => {
        // Keep the paging contract independent of the fixture's timed background messages.
        await pauseMockFixtureMessages(chat);
        await dispatchLiteBatch(
          chat,
          createBatch(
            Array.from({ length: 40 }, (_value, index) => ({
              type: 'upsert',
              record: createRecord(
                `lite-browser-scroll-${index}`,
                `Scrollable Lite message ${index}`
              )
            }))
          )
        );
        await expect(chat.locator('[data-message-id="lite-browser-scroll-39"]')).toBeVisible();
        const scroller = chat.locator(`${LITE_ROOT_SELECTOR} .ytcq-lite-scroller`);
        await expect.poll(() => scroller.evaluate((element) =>
          element.scrollHeight > element.clientHeight
        )).toBe(true);
        await scroller.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
          element.dispatchEvent(new Event('scroll', { bubbles: true }));
        });
        await expect(chat.locator(LITE_ROOT_SELECTOR)).toHaveAttribute(
          'data-ytcq-following-live-edge',
          'true'
        );

        await scroller.hover();
        await page.mouse.wheel(0, -20);

        await expect(chat.locator(LITE_ROOT_SELECTOR)).toHaveAttribute(
          'data-ytcq-following-live-edge',
          'false'
        );
        const afterReleaseId = 'lite-browser-scroll-after-release';
        await dispatchLiteBatch(
          chat,
          createBatch([
            {
              type: 'upsert',
              record: createRecord(afterReleaseId, 'Message received while reading older chat')
            }
          ])
        );
        await expect(chat.locator('.ytcq-lite-new-messages')).toBeVisible();
        await expect(chat.locator(`[data-message-id="${afterReleaseId}"]`)).toHaveCount(0);

        await scroller.hover();
        await page.mouse.wheel(0, 20);
        await expect(chat.locator(LITE_ROOT_SELECTOR)).toHaveAttribute(
          'data-ytcq-following-live-edge',
          'false'
        );
        await expect(chat.locator(`[data-message-id="${afterReleaseId}"]`)).toBeAttached();

        await page.mouse.wheel(0, 1_000);
        await expect(chat.locator(LITE_ROOT_SELECTOR)).toHaveAttribute(
          'data-ytcq-following-live-edge',
          'true'
        );
        await expect(chat.locator(`[data-message-id="${afterReleaseId}"]`)).toBeVisible();
        await expect.poll(() => scroller.evaluate((element) =>
          element.scrollHeight - element.clientHeight - element.scrollTop
        )).toBeLessThanOrEqual(2);
      });

      await test.step('Keep Lite mode after one unsupported feed row', async () => {
        await dispatchLiteBatch(chat, {
          ...createBatch([]),
          compatibilityWarnings: ['feed:liveChatFutureRenderer'],
          unreadableFeed: true
        });

        await expect(chat.locator(LITE_ROOT_SELECTOR)).toBeVisible();
        await expect(chat.locator(LITE_NATIVE_RESTORE_SELECTOR)).toHaveCount(0);
      });

      await test.step('Reset compatibility health after a supported message', async () => {
        await dispatchLiteBatch(chat, {
          ...createBatch([
            {
              type: 'upsert',
              record: createRecord('lite-browser-health-reset', 'Supported after unknown row')
            }
          ]),
          compatibilityWarnings: ['feed:liveChatFutureRenderer'],
          unreadableFeed: true
        });
        await expect(chat.locator('[data-message-id="lite-browser-health-reset"]')).toBeVisible();
      });

      await test.step('Reload after three unreadable feed batches without progress', async () => {
        await dispatchLiteBatches(
          chat,
          Array.from({ length: 3 }, () => ({
            ...createBatch([]),
            compatibilityWarnings: ['feed:liveChatFutureRenderer'],
            unreadableFeed: true
          }))
        );

        await expect(chat.locator(LITE_NATIVE_RESTORE_SELECTOR)).toBeVisible({ timeout: 8_000 });
        await expect(chat.locator('.ytcq-lite-handoff-overlay')).toHaveCount(0);
        await expect(chat.locator(LITE_ROOT_SELECTOR)).toHaveCount(0, { timeout: 8_000 });
        const restored = chat.locator(NATIVE_LIST_SELECTOR).first();
        await expect(restored).toBeVisible();
        await expect(chat.locator(LITE_NATIVE_RESTORE_SELECTOR)).toHaveCount(0, {
          timeout: 20_000
        });
        await expect(chat.locator('html')).not.toHaveAttribute(
          LITE_NATIVE_DISCARDED_ATTRIBUTE,
          'true'
        );
        await expectLiteModeMenuState(chat, true);

        await expect(restored.locator('#timestamp').first()).toBeHidden();
        await toggleLiteModeFromMenu(chat);
        await expectStoredLiteMode(context, false);
        await expectLiteModeMenuState(chat, false);
      });
    } finally {
      await setExtensionStorageValues(context, 'sync', { liteModeEnabled: false }).catch(
        () => undefined
      );
      await chat
        .locator(LITE_ROOT_SELECTOR)
        .waitFor({ state: 'detached', timeout: 8_000 })
        .catch(() => undefined);
      await chat
        .locator(LITE_NATIVE_RESTORE_SELECTOR)
        .waitFor({ state: 'detached', timeout: 20_000 })
        .catch(() => undefined);
      await clearChatComposerIfVisible(chat).catch(() => undefined);
      await clearLiteTestCooldown(chat).catch(() => undefined);
      await uninstallLiteDiagnostics(chat).catch(() => undefined);
    }
  });
};
