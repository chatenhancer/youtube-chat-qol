/**
 * Browser coverage for the optional bounded Lite chat surface.
 *
 * Mock coverage drives the sanitized page boundary directly so fallback is
 * deterministic. Live coverage verifies that YouTube continues delivering
 * response batches after its native item list has been discarded.
 */
import { expect, test, type BrowserContext, type Locator, type Request } from '@playwright/test';
import {
  YOUTUBE_CHAT_FEED_BATCH_EVENT,
  YOUTUBE_CHAT_FEED_CONTROL_EVENT,
  YOUTUBE_CHAT_FEED_PROTOCOL_VERSION,
  type YouTubeChatFeedTransportBatch,
  type YouTubeChatMessageRecord
} from '../../../src/youtube/chat-feed/protocol';
import { MARKED_USERS_STORAGE_KEY } from '../../../src/shared/marked-users';
import { clearChatComposerIfVisible, getChatComposerText } from '../support/composer';
import {
  getExtensionStorageValues,
  setExtensionStorageValues,
  withExtensionStorageValues
} from '../support/extension-storage';
import { getRichVisibleText } from '../support/text';
import { withMockedTranslationEndpoint } from '../support/translation-endpoint';
import type { BrowserScenario, ChatSurface } from './types';

const NATIVE_LIST_SELECTOR = 'yt-live-chat-item-list-renderer, #chat > #item-list';
const NATIVE_MESSAGE_SELECTOR = [
  'yt-gift-message-view-model',
  'yt-live-chat-membership-item-renderer',
  'yt-live-chat-paid-message-renderer',
  'yt-live-chat-paid-sticker-renderer',
  'yt-live-chat-sponsorships-gift-purchase-announcement-renderer',
  'yt-live-chat-sponsorships-gift-redemption-announcement-renderer',
  'yt-live-chat-text-message-renderer'
].join(',');
const LITE_MODE_FALLBACK_EVENT = 'ytcq:lite-mode-fallback';
const LITE_BUTTON_SELECTOR = '.ytcq-lite-mode-button';
const LITE_ROOT_SELECTOR = '.ytcq-lite-root';
const LITE_NATIVE_DISCARDED_ATTRIBUTE = 'data-ytcq-lite-native-discarded';
const LITE_NATIVE_RESTORE_SELECTOR = '#ytcq-lite-native-restore';
const LITE_SESSION_COOLDOWN_KEY = 'ytcqLiteModeSessionCooldown:v1';
const DEFAULT_POST_DISCARD_BATCH_TARGET = 2;
const MOCK_LITE_TARGET_LANGUAGE = 'cy';
const MOCK_LITE_TRANSLATED_TEXT = 'Lite translated result';

interface LiteBatchDiagnostic {
  actions: number;
  at: number;
  compatibilityWarnings?: string[];
  continuationTimeoutMs?: number;
  fatalErrors?: string[];
  sequence?: number;
  source?: string;
  unreadableFeed?: boolean;
  upserts: number;
}

interface LiteEdgeDiagnostic {
  at: number;
  distance: number;
  following: boolean;
  newMessagesVisible: boolean;
}

interface LiteClientDiagnostics {
  batches: LiteBatchDiagnostic[];
  controls: Array<{ at: number; enabled?: boolean; requestInitial?: boolean }>;
  fallbackReason: string;
  followingLiveEdge: boolean;
  hasLiteRoot: boolean;
  hasNativeList: boolean;
  nativeDiscarded: boolean;
  liteDescendants: number;
  liveEdgeDistance: number;
  liveEdgeSamples: LiteEdgeDiagnostic[];
  liteRows: number;
  nativeDescendants: number;
  newMessagesVisible: boolean;
  pendingLiveActions: number;
  rowAdds: Array<{ at: number; count: number }>;
  visibilityState: string;
}

interface LiteNetworkRequestDiagnostic {
  at: number;
  framePath: string;
  requestPath: string;
}

type SyntheticLiteBatch = Omit<YouTubeChatFeedTransportBatch, 'sequence'>;

interface LiteContinuityEvidence {
  nativeDescendantDelta: number;
  postDiscardLiteIds: string[];
  restoredOverlapIds: string[];
}

interface LiteContinuitySnapshot {
  liteIds: string[];
  nativeDescendants: number;
  nativeIds: string[];
}

export const liteModeToggleAndRestoreScenario: BrowserScenario = async ({ chat, context }) => {
  test.setTimeout(120_000);
  await withExtensionStorageValues(context, 'sync', { liteModeEnabled: false }, async () => {
    const button = chat.locator(LITE_BUTTON_SELECTOR).first();
    const root = chat.locator(LITE_ROOT_SELECTOR);
    try {
      await clearLiteTestCooldown(chat);
      await expect(chat.locator(NATIVE_LIST_SELECTOR).first()).toBeVisible({ timeout: 20_000 });
      await expect(chat.locator(NATIVE_MESSAGE_SELECTOR).first()).toBeVisible({ timeout: 30_000 });

      await test.step('Enable Lite mode from the chat header', async () => {
        await expect(button).toBeVisible({ timeout: 20_000 });
        await expect(button).toHaveAttribute('aria-pressed', 'false');
        await button.click();
        await expectStorageValue(context, true);
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        await expect(root).toBeVisible({ timeout: 20_000 });
        await expect(chat.locator('html')).toHaveAttribute(
          LITE_NATIVE_DISCARDED_ATTRIBUTE,
          'true',
          { timeout: 20_000 }
        );
        await expect(chat.locator(NATIVE_LIST_SELECTOR)).toHaveCount(0);
      });

      await test.step('Keep the lightweight feed readable and usable', async () => {
        const row = root.locator('.ytcq-lite-message-text').last();
        const author = row.locator('#author-name');
        const message = row.locator('#message');
        await expect(root.locator('.ytcq-lite-scroller')).toBeVisible();
        await expect(row).toBeVisible({ timeout: 30_000 });
        await expect(row.locator('#author-photo')).toBeVisible();
        await expect(author).toBeVisible();
        await expect(message).toBeVisible();
        await expect.poll(() => author.innerText()).not.toBe('');
        await expect.poll(() => message.innerText()).not.toBe('');
        await expect(root.locator('.ytcq-lite-toolbar')).toHaveCount(0);
        await expect(button).toBeVisible();
        await expectLiteAtLiveEdge(root);
      });

      await test.step('Disable Lite mode and restore native chat', async () => {
        await button.click();
        await expectStorageValue(context, false);
        await expect(root).toHaveCount(0, { timeout: 20_000 });
        await expect(chat.locator(NATIVE_LIST_SELECTOR).first()).toBeVisible({ timeout: 30_000 });
        await expect(chat.locator(NATIVE_MESSAGE_SELECTOR).first()).toBeVisible({
          timeout: 30_000
        });
        await expect(chat.locator(LITE_NATIVE_RESTORE_SELECTOR)).toHaveCount(0, {
          timeout: 20_000
        });
        await expect(chat.locator('html')).not.toHaveAttribute(
          LITE_NATIVE_DISCARDED_ATTRIBUTE,
          'true'
        );
        await expect(button).toHaveAttribute('aria-pressed', 'false');
      });
    } finally {
      await setExtensionStorageValues(context, 'sync', { liteModeEnabled: false }).catch(
        () => undefined
      );
      await root.waitFor({ state: 'detached', timeout: 8_000 }).catch(() => undefined);
      await chat
        .locator(NATIVE_LIST_SELECTOR)
        .first()
        .waitFor({
          state: 'visible',
          timeout: 20_000
        })
        .catch(() => undefined);
      await clearLiteTestCooldown(chat).catch(() => undefined);
    }
  });
};

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

      const button = chat.locator(LITE_BUTTON_SELECTOR).first();
      const liteRow = chat.locator('[data-message-id="lite-browser-message-1"]');
      await expect(button).toHaveAttribute('aria-pressed', 'false');

      await test.step('Enable Lite mode from the chat header', async () => {
        await button.click();
        await expectStorageValue(context, true);
        await expect(button).toHaveAttribute('aria-pressed', 'true');
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

      await test.step('Keep bookmarked Lite avatars circular in the default theme', async () => {
        await withExtensionStorageValues(
          context,
          'local',
          {
            [MARKED_USERS_STORAGE_KEY]: {
              'channel:UCLiteBrowserViewer': {
                authorName: '@LiteViewer',
                channelId: 'UCLiteBrowserViewer',
                markedAt: Date.now()
              }
            }
          },
          async () => {
            const avatar = liteRow.locator('#author-photo');
            await expect(avatar).toHaveClass(/ytcq-marked-user-avatar/);
            await expect(avatar.locator('img')).toHaveCSS('border-radius', '50%');
          }
        );
      });

      await test.step('Style replacement translations like native chat', async () => {
        await expectLiteReplacementTranslation({ context, row: liteRow });
      });

      await test.step('Keep existing author actions working on Lite rows', async () => {
        await liteRow.locator('#author-name').click();
        await expect.poll(() => getChatComposerText(chat)).toContain('@LiteViewer');
        await clearChatComposerIfVisible(chat);
      });

      await test.step('Release the live edge on a small upward wheel step', async () => {
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
        await expect(button).toHaveAttribute('aria-pressed', 'true');

        await expect(restored.locator('#timestamp').first()).toBeHidden();
        await button.click();
        await expectStorageValue(context, false);
        await expect(button).toHaveAttribute('aria-pressed', 'false');
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

export const liteModeStoredPreferenceReloadScenario: BrowserScenario = async ({
  chat,
  context,
  page
}) => {
  await withExtensionStorageValues(context, 'sync', { liteModeEnabled: false }, async () => {
    const root = chat.locator(LITE_ROOT_SELECTOR);
    let nativeHistoryBeforeReload: string[] = [];
    try {
      await test.step('Enable Lite mode and keep its preference stored', async () => {
        await expect(chat.locator(NATIVE_MESSAGE_SELECTOR).first()).toBeVisible({
          timeout: 15_000
        });
        nativeHistoryBeforeReload = (await getLiteContinuitySnapshot(chat)).nativeIds;
        expect(nativeHistoryBeforeReload.length).toBeGreaterThan(0);
        await setExtensionStorageValues(context, 'sync', { liteModeEnabled: true });
        await expectStorageValue(context, true);
        await expect(root).toBeVisible();
      });

      await test.step('Reload directly into stored Lite mode with its history', async () => {
        await page.reload({ timeout: 15_000, waitUntil: 'commit' });
        await expect(chat.locator('yt-live-chat-renderer')).toBeVisible({ timeout: 15_000 });
        await expect(chat.locator(LITE_BUTTON_SELECTOR).first()).toHaveAttribute(
          'aria-pressed',
          'true'
        );
        await expect(root)
          .toBeVisible({ timeout: 15_000 })
          .catch(async (error) => {
            const documentState = await chat.locator('body').evaluate((_body, cooldownKey) => {
              const transport = (
                window as unknown as Record<
                  PropertyKey,
                  | {
                      enabled?: unknown;
                      generation?: unknown;
                      receiverReady?: unknown;
                      sequence?: unknown;
                    }
                  | undefined
                >
              )[Symbol.for('ytcq:lite-chat-transport:v1')];
              return {
                cooldown: window.sessionStorage.getItem(cooldownKey),
                discarded: document.documentElement.hasAttribute('data-ytcq-lite-native-discarded'),
                intent: document.documentElement.getAttribute('data-ytcq-lite-mode-intent'),
                transport: transport
                  ? {
                      enabled: transport.enabled,
                      generation: transport.generation,
                      receiverReady: transport.receiverReady,
                      sequence: transport.sequence
                    }
                  : null
              };
            }, LITE_SESSION_COOLDOWN_KEY);
            const storage = await getExtensionStorageValues(context, 'sync', ['liteModeEnabled']);
            throw new Error(
              `Reloaded Lite mode did not mount: ${JSON.stringify({ documentState, storage })}`,
              { cause: error }
            );
          });
        await expect
          .poll(
            async () => {
              const liteIds = (await getLiteContinuitySnapshot(chat)).liteIds;
              return nativeHistoryBeforeReload.some((id) => liteIds.includes(id));
            },
            {
              message: 'Expected reloaded Lite mode to restore native chat history.',
              timeout: 15_000
            }
          )
          .toBe(true);
        await expectLiteAtLiveEdge(root);
        await expect
          .poll(
            () =>
              chat.locator('body').evaluate((_body, key) => {
                return window.sessionStorage.getItem(key);
              }, LITE_SESSION_COOLDOWN_KEY),
            { message: 'A normal user reload must not inherit a fallback cooldown.' }
          )
          .toBeNull();
      });

      await installLiteDiagnostics(chat);
      const nativeList = chat.locator(NATIVE_LIST_SELECTOR).first();

      await test.step('Discard native immediately while the reloaded Lite transport connects', async () => {
        await expect(nativeList).toHaveCount(0);
        await expect(chat.locator('html')).toHaveAttribute(LITE_NATIVE_DISCARDED_ATTRIBUTE, 'true');
        await dispatchLiteBatch(
          chat,
          createBatch([
            {
              type: 'upsert',
              record: createRecord(
                'lite-browser-reload-message',
                'Stored Lite mode survived the reload'
              )
            }
          ])
        );
        await expect(chat.locator('[data-message-id="lite-browser-reload-message"]')).toBeVisible();
        await expect(chat.locator(NATIVE_LIST_SELECTOR)).toHaveCount(0);
        await expect(chat.locator('html')).toHaveAttribute(LITE_NATIVE_DISCARDED_ATTRIBUTE, 'true');
      });
    } finally {
      await setExtensionStorageValues(context, 'sync', { liteModeEnabled: false }).catch(
        () => undefined
      );
      await root.waitFor({ state: 'detached', timeout: 8_000 }).catch(() => undefined);
      await chat
        .locator(NATIVE_LIST_SELECTOR)
        .first()
        .waitFor({
          state: 'visible',
          timeout: 20_000
        })
        .catch(() => undefined);
      await clearLiteTestCooldown(chat).catch(() => undefined);
      await uninstallLiteDiagnostics(chat).catch(() => undefined);
    }
  });
};

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

        const button = chat.locator(LITE_BUTTON_SELECTOR).first();
        await button.click();
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

export const liteModeLiveSustainedScenario: BrowserScenario = async ({ chat, context, page }) => {
  const target = getPostDiscardBatchTarget();
  test.setTimeout(Math.max(test.info().timeout, 60_000 + target * 12_000));
  const networkRequests: LiteNetworkRequestDiagnostic[] = [];
  const onRequest = (request: Request) => {
    const diagnostic = getLiteNetworkRequestDiagnostic(request);
    if (diagnostic) networkRequests.push(diagnostic);
  };
  page.on('request', onRequest);

  const nativeList = chat.locator(NATIVE_LIST_SELECTOR).first();
  const button = chat.locator(LITE_BUTTON_SELECTOR).first();
  const root = chat.locator(LITE_ROOT_SELECTOR);
  let continuationEvidence: { batches: number; requests: number } | null = null;
  let continuityEvidence: LiteContinuityEvidence | null = null;
  let sustainedEvidence: LiteClientDiagnostics | null = null;
  let baselineContinuity: LiteContinuitySnapshot | null = null;

  try {
    await setExtensionStorageValues(context, 'sync', { liteModeEnabled: false });
    await expectStorageValue(context, false);
    await installLiteDiagnostics(chat);
    await nativeList.waitFor({ state: 'attached', timeout: 20_000 });
    await expect(nativeList.locator(NATIVE_MESSAGE_SELECTOR).first()).toBeVisible({
      timeout: 20_000
    });
    await expect(button).toBeVisible({ timeout: 20_000 });
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    const nativeHistoryBeforeEnable = await getLiteContinuitySnapshot(chat);
    expect(nativeHistoryBeforeEnable.nativeIds.length).toBeGreaterThan(0);

    await button.click();
    await expectStorageValue(context, true);
    await expect(root).toBeVisible({ timeout: 20_000 });
    await expect(root.locator('.ytcq-lite-toolbar')).toHaveCount(0);

    try {
      await expect(chat.locator('html')).toHaveAttribute(LITE_NATIVE_DISCARDED_ATTRIBUTE, 'true', {
        timeout: 20_000
      });
      await expect
        .poll(
          async () => {
            const liteIds = (await getLiteContinuitySnapshot(chat)).liteIds;
            return nativeHistoryBeforeEnable.nativeIds.some((id) => liteIds.includes(id));
          },
          {
            message: 'Expected Lite mode to preserve at least one row from native chat history.',
            timeout: 20_000
          }
        )
        .toBe(true);
    } catch (error) {
      const diagnostics = await getLiteDiagnostics(chat);
      throw new Error(`Lite mode did not discard the native feed: ${JSON.stringify(diagnostics)}`, {
        cause: error
      });
    }

    const baseline = await getLiteDiagnostics(chat);
    baselineContinuity = await getLiteContinuitySnapshot(chat);
    const observationBaselineAt = Date.now();
    const baselineSequence = getLatestLiveSequence(baseline);
    const networkBaseline = networkRequests.length;
    const continuationTimeoutMs = getContinuationEvidenceTimeout(baseline, target);
    test.setTimeout(Math.max(test.info().timeout, continuationTimeoutMs + 60_000));
    continuationEvidence = await waitForContinuationEvidence({
      baselineSequence,
      chat,
      networkBaseline,
      networkRequests,
      page,
      target,
      timeoutMs: continuationTimeoutMs
    });

    const sustained = await getLiteDiagnostics(chat);
    sustainedEvidence = sustained;
    const beforeRestoreContinuity = await getLiteContinuitySnapshot(chat);
    const baselineLiteIds = new Set(baselineContinuity.liteIds);
    const postDiscardLiteIds = beforeRestoreContinuity.liteIds.filter(
      (messageId) => !baselineLiteIds.has(messageId)
    );
    continuityEvidence = {
      nativeDescendantDelta:
        beforeRestoreContinuity.nativeDescendants - baselineContinuity.nativeDescendants,
      postDiscardLiteIds,
      restoredOverlapIds: []
    };
    const edgeSamples = sustained.liveEdgeSamples.filter(
      (sample) => sample.at >= observationBaselineAt
    );
    expect(sustained.fallbackReason).toBe('');
    expect(sustained.followingLiveEdge).toBe(true);
    expect(sustained.liveEdgeDistance).toBeLessThanOrEqual(32);
    expect(sustained.liteRows).toBeGreaterThan(0);
    expect(sustained.liteRows).toBeLessThanOrEqual(150);
    expect(sustained.newMessagesVisible).toBe(false);
    expect(sustained.pendingLiveActions).toBe(0);
    expect(edgeSamples.length).toBeGreaterThan(0);
    expect(edgeSamples.every((sample) => sample.following && !sample.newMessagesVisible)).toBe(
      true
    );
    console.log(
      'Lite mode sustained evidence:',
      JSON.stringify({
        continuationEvidence,
        liteDescendants: sustained.liteDescendants,
        liteRows: sustained.liteRows,
        nativeDescendants: sustained.nativeDescendants,
        continuityEvidence
      })
    );
    await expect(root).toBeVisible();

    await button.click();
    await expectStorageValue(context, false);
    await expect(root).toHaveCount(0, { timeout: 8_000 });
    await expect(chat.locator(NATIVE_LIST_SELECTOR).first()).toBeVisible({
      timeout: 15_000
    });
    await expect(chat.locator(LITE_NATIVE_RESTORE_SELECTOR)).toHaveCount(0, {
      timeout: 20_000
    });
    const afterRestoreContinuity = await getLiteContinuitySnapshot(chat);
    if (continuityEvidence) {
      continuityEvidence.restoredOverlapIds = continuityEvidence.postDiscardLiteIds.filter(
        (messageId) => afterRestoreContinuity.nativeIds.includes(messageId)
      );
    }
  } finally {
    page.off('request', onRequest);
    const diagnostics = await getLiteDiagnostics(chat).catch(() => null);
    await setExtensionStorageValues(context, 'sync', { liteModeEnabled: false }).catch(
      () => undefined
    );
    await root.waitFor({ state: 'detached', timeout: 8_000 }).catch(() => undefined);
    await clearChatComposerIfVisible(chat).catch(() => undefined);
    await clearLiteTestCooldown(chat).catch(() => undefined);
    await uninstallLiteDiagnostics(chat).catch(() => undefined);
    await test
      .info()
      .attach('lite-mode-diagnostics', {
        body: JSON.stringify(
          {
            client: diagnostics,
            continuationEvidence,
            continuityEvidence,
            networkRequests,
            sustained: sustainedEvidence
          },
          null,
          2
        ),
        contentType: 'application/json'
      })
      .catch(() => undefined);
  }
};

async function getLiteContinuitySnapshot(chat: ChatSurface): Promise<LiteContinuitySnapshot> {
  return chat.locator('body').evaluate(
    (_body, selectors) => {
      const nativeList = document.querySelector(selectors.nativeList);
      const getNativeId = (element: Element): string => {
        const data = (element as HTMLElement & { data?: { id?: unknown } }).data;
        if (typeof data?.id === 'string' && data.id) return data.id;
        return element.id;
      };
      return {
        liteIds: Array.from(document.querySelectorAll<HTMLElement>('.ytcq-lite-message'))
          .map((element) => element.dataset.messageId || '')
          .filter(Boolean),
        nativeDescendants: nativeList?.querySelectorAll('*').length || 0,
        nativeIds: nativeList
          ? Array.from(nativeList.querySelectorAll(selectors.nativeMessage))
              .map(getNativeId)
              .filter(Boolean)
          : []
      };
    },
    { nativeList: NATIVE_LIST_SELECTOR, nativeMessage: NATIVE_MESSAGE_SELECTOR }
  );
}

async function expectLiteReplacementTranslation({
  context,
  row
}: {
  context: BrowserContext;
  row: Locator;
}): Promise<void> {
  await withMockedTranslationEndpoint(context, MOCK_LITE_TRANSLATED_TEXT, async () => {
    await withExtensionStorageValues(
      context,
      'sync',
      {
        lastTranslationTarget: MOCK_LITE_TARGET_LANGUAGE,
        targetLanguage: MOCK_LITE_TARGET_LANGUAGE,
        translationDisplay: 'replace'
      },
      async () => {
        const message = row.locator('#message').first();
        const icon = message.locator('.ytcq-replaced-translation-icon').first();
        await expect(row).toHaveClass(/ytcq-translation-replaced/, { timeout: 20_000 });
        await expect(message).toContainText(MOCK_LITE_TRANSLATED_TEXT);
        await expect(icon).toBeVisible();
        await expect(icon.locator('svg')).toBeVisible();
        await expect(icon).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(message).toHaveCSS('text-decoration-line', 'underline');
        await expect(message).toHaveCSS('text-decoration-style', 'dotted');
      }
    );
  });
}

async function dispatchLiteBatch(chat: ChatSurface, batch: SyntheticLiteBatch): Promise<void> {
  await dispatchLiteBatches(chat, [batch]);
}

async function dispatchLiteBatches(
  chat: ChatSurface,
  batches: SyntheticLiteBatch[]
): Promise<void> {
  await chat.locator('body').evaluate(
    (_body, payload) => {
      const diagnosticSequence =
        (
          window as Window & {
            __ytcqLiteLastBatchSequence?: number;
          }
        ).__ytcqLiteLastBatchSequence || 0;
      const transport = (
        window as unknown as Record<PropertyKey, { sequence?: unknown } | undefined>
      )[Symbol.for('ytcq:lite-chat-transport:v1')];
      const transportSequence = typeof transport?.sequence === 'number' ? transport.sequence : 0;
      let sequence = Math.max(diagnosticSequence, transportSequence);
      for (const batch of payload.batches) {
        sequence += 1;
        if (transport) transport.sequence = sequence;
        window.dispatchEvent(
          new CustomEvent(payload.eventName, {
            detail: JSON.stringify({
              ...batch,
              sequence
            })
          })
        );
      }
    },
    {
      batches,
      eventName: YOUTUBE_CHAT_FEED_BATCH_EVENT
    }
  );
}

async function installLiteDiagnostics(chat: ChatSurface): Promise<void> {
  await chat.locator('body').evaluate(
    (_body, eventNames) => {
      const testWindow = window as Window & {
        __ytcqLiteBatchCounterAbort?: AbortController;
        __ytcqLiteBatches?: LiteBatchDiagnostic[];
        __ytcqLiteControls?: LiteClientDiagnostics['controls'];
        __ytcqLiteEdgeSamples?: LiteEdgeDiagnostic[];
        __ytcqLiteEdgeTimer?: number;
        __ytcqLiteFallbackReason?: string;
        __ytcqLiteLastBatchSequence?: number;
        __ytcqLiteMutationObserver?: MutationObserver;
        __ytcqLiteRowAdds?: LiteClientDiagnostics['rowAdds'];
      };
      testWindow.__ytcqLiteBatchCounterAbort?.abort();
      testWindow.__ytcqLiteMutationObserver?.disconnect();
      if (testWindow.__ytcqLiteEdgeTimer) {
        window.clearInterval(testWindow.__ytcqLiteEdgeTimer);
      }
      const controller = new AbortController();
      testWindow.__ytcqLiteBatchCounterAbort = controller;
      testWindow.__ytcqLiteBatches = [];
      testWindow.__ytcqLiteControls = [];
      testWindow.__ytcqLiteEdgeSamples = [];
      testWindow.__ytcqLiteFallbackReason = '';
      testWindow.__ytcqLiteLastBatchSequence = 0;
      testWindow.__ytcqLiteRowAdds = [];
      const mutationObserver = new MutationObserver((records) => {
        let count = 0;
        for (const record of records) {
          for (const addedNode of record.addedNodes) {
            if (!(addedNode instanceof Element)) continue;
            if (addedNode.matches('.ytcq-lite-message')) count += 1;
            count += addedNode.querySelectorAll('.ytcq-lite-message').length;
          }
        }
        if (!count) return;
        const rowAdds = testWindow.__ytcqLiteRowAdds || [];
        rowAdds.push({ at: Date.now(), count });
        testWindow.__ytcqLiteRowAdds = rowAdds.slice(-500);
      });
      mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
      testWindow.__ytcqLiteMutationObserver = mutationObserver;
      window.addEventListener(
        eventNames.batch,
        (event) => {
          if (!(event instanceof CustomEvent) || typeof event.detail !== 'string') return;
          try {
            const batch = JSON.parse(event.detail) as {
              actions?: unknown;
              compatibilityWarnings?: unknown;
              continuationTimeoutMs?: unknown;
              fatalErrors?: unknown;
              sequence?: unknown;
              source?: unknown;
              unreadableFeed?: unknown;
            };
            if (Number.isSafeInteger(batch.sequence)) {
              testWindow.__ytcqLiteLastBatchSequence = Number(batch.sequence);
            }
            const batches = testWindow.__ytcqLiteBatches || [];
            batches.push({
              actions: Array.isArray(batch.actions) ? batch.actions.length : -1,
              at: Date.now(),
              ...(Array.isArray(batch.compatibilityWarnings)
                ? {
                    compatibilityWarnings: batch.compatibilityWarnings.filter(
                      (value): value is string => typeof value === 'string'
                    )
                  }
                : {}),
              ...(typeof batch.continuationTimeoutMs === 'number' &&
              Number.isFinite(batch.continuationTimeoutMs)
                ? { continuationTimeoutMs: Number(batch.continuationTimeoutMs) }
                : {}),
              ...(Array.isArray(batch.fatalErrors)
                ? {
                    fatalErrors: batch.fatalErrors.filter(
                      (value): value is string => typeof value === 'string'
                    )
                  }
                : {}),
              ...(Number.isSafeInteger(batch.sequence) ? { sequence: Number(batch.sequence) } : {}),
              ...(typeof batch.source === 'string' ? { source: batch.source } : {}),
              ...(typeof batch.unreadableFeed === 'boolean'
                ? { unreadableFeed: batch.unreadableFeed }
                : {}),
              upserts: Array.isArray(batch.actions)
                ? batch.actions.filter((action) =>
                    Boolean(
                      action &&
                      typeof action === 'object' &&
                      (action as { type?: unknown }).type === 'upsert'
                    )
                  ).length
                : 0
            });
            testWindow.__ytcqLiteBatches = batches.slice(-200);
          } catch {
            // The production receiver owns malformed-batch behavior.
          }
        },
        { signal: controller.signal }
      );
      window.addEventListener(
        eventNames.control,
        (event) => {
          if (!(event instanceof CustomEvent) || typeof event.detail !== 'string') return;
          try {
            const detail = JSON.parse(event.detail) as {
              enabled?: unknown;
              requestInitial?: unknown;
            };
            const controls = testWindow.__ytcqLiteControls || [];
            controls.push({
              at: Date.now(),
              ...(typeof detail.enabled === 'boolean' ? { enabled: detail.enabled } : {}),
              ...(typeof detail.requestInitial === 'boolean'
                ? { requestInitial: detail.requestInitial }
                : {})
            });
            testWindow.__ytcqLiteControls = controls.slice(-50);
          } catch {
            // Production validation owns malformed control events.
          }
        },
        { signal: controller.signal }
      );
      testWindow.__ytcqLiteEdgeTimer = window.setInterval(() => {
        const root = document.querySelector('.ytcq-lite-root');
        const scroller = root?.querySelector<HTMLElement>('.ytcq-lite-scroller');
        const newMessagesButton = root?.querySelector<HTMLButtonElement>('.ytcq-lite-new-messages');
        if (!root || !scroller) return;
        const samples = testWindow.__ytcqLiteEdgeSamples || [];
        samples.push({
          at: Date.now(),
          distance: Math.max(0, scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight),
          following: root.getAttribute('aria-live') === 'polite',
          newMessagesVisible: Boolean(newMessagesButton && !newMessagesButton.hidden)
        });
        testWindow.__ytcqLiteEdgeSamples = samples.slice(-500);
      }, 100);
      window.addEventListener(
        eventNames.fallback,
        (event) => {
          if (!(event instanceof CustomEvent) || typeof event.detail !== 'string') return;
          try {
            const detail = JSON.parse(event.detail) as { reason?: unknown };
            if (typeof detail.reason === 'string')
              testWindow.__ytcqLiteFallbackReason = detail.reason;
          } catch {
            testWindow.__ytcqLiteFallbackReason = 'invalid-fallback-detail';
          }
        },
        { signal: controller.signal }
      );
    },
    {
      batch: YOUTUBE_CHAT_FEED_BATCH_EVENT,
      control: YOUTUBE_CHAT_FEED_CONTROL_EVENT,
      fallback: LITE_MODE_FALLBACK_EVENT
    }
  );
}

async function getLiteDiagnostics(chat: ChatSurface): Promise<LiteClientDiagnostics> {
  return chat.locator('body').evaluate(() => {
    const testWindow = window as Window & {
      __ytcqLiteBatches?: LiteBatchDiagnostic[];
      __ytcqLiteControls?: LiteClientDiagnostics['controls'];
      __ytcqLiteEdgeSamples?: LiteEdgeDiagnostic[];
      __ytcqLiteFallbackReason?: string;
      __ytcqLiteRowAdds?: LiteClientDiagnostics['rowAdds'];
    };
    const root = document.querySelector('.ytcq-lite-root');
    const scroller = root?.querySelector<HTMLElement>('.ytcq-lite-scroller');
    const newMessagesButton = document.querySelector<HTMLButtonElement>('.ytcq-lite-new-messages');
    return {
      batches: testWindow.__ytcqLiteBatches || [],
      controls: testWindow.__ytcqLiteControls || [],
      fallbackReason: testWindow.__ytcqLiteFallbackReason || '',
      followingLiveEdge: root?.getAttribute('aria-live') === 'polite',
      hasLiteRoot: Boolean(root),
      hasNativeList: Boolean(
        document.querySelector('yt-live-chat-item-list-renderer, #chat > #item-list')
      ),
      nativeDiscarded: document.documentElement.hasAttribute('data-ytcq-lite-native-discarded'),
      liteDescendants: root?.querySelectorAll('*').length || 0,
      liveEdgeDistance: scroller
        ? Math.max(0, scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight)
        : 0,
      liveEdgeSamples: testWindow.__ytcqLiteEdgeSamples || [],
      liteRows: root?.querySelectorAll('.ytcq-lite-message').length || 0,
      nativeDescendants:
        document
          .querySelector('yt-live-chat-item-list-renderer, #chat > #item-list')
          ?.querySelectorAll('*').length || 0,
      newMessagesVisible: Boolean(newMessagesButton && !newMessagesButton.hidden),
      pendingLiveActions: Number(root?.getAttribute('data-ytcq-lite-pending-live-actions') || 0),
      rowAdds: testWindow.__ytcqLiteRowAdds || [],
      visibilityState: document.visibilityState
    };
  });
}

async function expectLiteAtLiveEdge(root: Locator): Promise<void> {
  await expect(root).toHaveAttribute('data-ytcq-following-live-edge', 'true');
  const scroller = root.locator('.ytcq-lite-scroller');
  await expect.poll(
    () => scroller.evaluate((element) =>
      Math.max(0, element.scrollHeight - element.scrollTop - element.clientHeight)
    ),
    { message: 'Expected Lite mode to start at the live edge.' }
  ).toBeLessThanOrEqual(2);
}

async function waitForRequestedLiteInitialSnapshot(chat: ChatSurface): Promise<void> {
  await expect.poll(
    () => chat.locator('body').evaluate(() => {
      const testWindow = window as Window & {
        __ytcqLiteBatches?: LiteBatchDiagnostic[];
        __ytcqLiteControls?: LiteClientDiagnostics['controls'];
      };
      const requested = testWindow.__ytcqLiteControls?.some(
        (control) => control.requestInitial === true
      );
      return !requested || testWindow.__ytcqLiteBatches?.some(
        (batch) => batch.source === 'initial'
      ) === true;
    }),
    { message: 'Expected the requested Lite history snapshot before fault injection.' }
  ).toBe(true);
}

async function uninstallLiteDiagnostics(chat: ChatSurface): Promise<void> {
  await chat.locator('body').evaluate(() => {
    const testWindow = window as Window & {
      __ytcqLiteBatchCounterAbort?: AbortController;
      __ytcqLiteBatches?: LiteBatchDiagnostic[];
      __ytcqLiteControls?: LiteClientDiagnostics['controls'];
      __ytcqLiteEdgeSamples?: LiteEdgeDiagnostic[];
      __ytcqLiteEdgeTimer?: number;
      __ytcqLiteFallbackReason?: string;
      __ytcqLiteLastBatchSequence?: number;
      __ytcqLiteMutationObserver?: MutationObserver;
      __ytcqLiteRowAdds?: LiteClientDiagnostics['rowAdds'];
    };
    testWindow.__ytcqLiteBatchCounterAbort?.abort();
    testWindow.__ytcqLiteMutationObserver?.disconnect();
    if (testWindow.__ytcqLiteEdgeTimer) window.clearInterval(testWindow.__ytcqLiteEdgeTimer);
    delete testWindow.__ytcqLiteBatchCounterAbort;
    delete testWindow.__ytcqLiteBatches;
    delete testWindow.__ytcqLiteControls;
    delete testWindow.__ytcqLiteEdgeSamples;
    delete testWindow.__ytcqLiteEdgeTimer;
    delete testWindow.__ytcqLiteFallbackReason;
    delete testWindow.__ytcqLiteLastBatchSequence;
    delete testWindow.__ytcqLiteMutationObserver;
    delete testWindow.__ytcqLiteRowAdds;
  });
}

async function clearLiteTestCooldown(chat: ChatSurface): Promise<void> {
  await chat.locator('body').evaluate((_body, key) => {
    window.sessionStorage.removeItem(key);
  }, LITE_SESSION_COOLDOWN_KEY);
}

async function waitForContinuationEvidence({
  baselineSequence,
  chat,
  networkBaseline,
  networkRequests,
  page,
  target,
  timeoutMs
}: {
  baselineSequence: number;
  chat: ChatSurface;
  networkBaseline: number;
  networkRequests: LiteNetworkRequestDiagnostic[];
  page: Parameters<BrowserScenario>[0]['page'];
  target: number;
  timeoutMs: number;
}): Promise<{ batches: number; requests: number }> {
  const deadline = Date.now() + timeoutMs;
  let lastDiagnostics = await getLiteDiagnostics(chat);

  while (Date.now() < deadline) {
    lastDiagnostics = await getLiteDiagnostics(chat);
    if (lastDiagnostics.fallbackReason) {
      throw new Error(`Lite mode fell back while polling: ${JSON.stringify(lastDiagnostics)}`);
    }
    if (
      !lastDiagnostics.hasLiteRoot ||
      !lastDiagnostics.nativeDiscarded ||
      lastDiagnostics.hasNativeList
    ) {
      throw new Error(`Lite mode was removed while polling: ${JSON.stringify(lastDiagnostics)}`);
    }

    const batches = lastDiagnostics.batches.filter(
      (batch) => batch.source === 'live' && (batch.sequence || 0) > baselineSequence
    ).length;
    const requests = networkRequests.length - networkBaseline;
    if (batches >= target && requests >= target) return { batches, requests };
    await page.waitForTimeout(200);
  }

  throw new Error(
    JSON.stringify({
      message: `Expected ${target} post-discard live requests and matching sanitized batches.`,
      batches: lastDiagnostics.batches,
      fallbackReason: lastDiagnostics.fallbackReason,
      postDiscardRequests: networkRequests.length - networkBaseline
    })
  );
}

function getLatestLiveSequence(diagnostics: LiteClientDiagnostics): number {
  return diagnostics.batches.reduce(
    (latest, batch) =>
      batch.source === 'live' && Number.isSafeInteger(batch.sequence)
        ? Math.max(latest, batch.sequence || 0)
        : latest,
    0
  );
}

function getContinuationEvidenceTimeout(
  diagnostics: LiteClientDiagnostics,
  target: number
): number {
  const providerTimeout =
    [...diagnostics.batches]
      .reverse()
      .find((batch) => batch.source === 'live' && batch.continuationTimeoutMs)
      ?.continuationTimeoutMs || 0;
  const perBatchTimeout = Math.max(10_000, providerTimeout * 1.5 + 2_000);
  return Math.max(35_000, Math.min(240_000, Math.ceil(target * perBatchTimeout)));
}

function getLiteNetworkRequestDiagnostic(request: Request): LiteNetworkRequestDiagnostic | null {
  let requestUrl: URL;
  let frameUrl: URL;
  try {
    requestUrl = new URL(request.url());
    frameUrl = new URL(request.frame().url());
  } catch {
    return null;
  }
  if (requestUrl.hostname !== 'www.youtube.com') return null;
  if (requestUrl.pathname !== '/youtubei/v1/live_chat/get_live_chat') return null;
  if (frameUrl.pathname !== '/live_chat') return null;
  return {
    at: Date.now(),
    framePath: frameUrl.pathname,
    requestPath: requestUrl.pathname
  };
}

function getPostDiscardBatchTarget(): number {
  const value = Number.parseInt(
    process.env.YTCQ_LITE_LIVE_POST_DISCARD_BATCHES ||
      process.env.YTCQ_LITE_LIVE_POST_DETACH_BATCHES ||
      '',
    10
  );
  if (!Number.isFinite(value)) return DEFAULT_POST_DISCARD_BATCH_TARGET;
  return Math.max(1, Math.min(12, value));
}

async function expectStorageValue(
  context: Parameters<typeof getExtensionStorageValues>[0],
  expected: boolean
): Promise<void> {
  await expect
    .poll(
      async () => {
        const values = await getExtensionStorageValues(context, 'sync', ['liteModeEnabled']);
        return values.liteModeEnabled;
      },
      {
        message: `Expected Lite mode storage to be ${String(expected)}.`,
        timeout: 5_000
      }
    )
    .toBe(expected);
}

function createBatch(actions: YouTubeChatFeedTransportBatch['actions']): SyntheticLiteBatch {
  return {
    actions,
    receivedAt: Date.now(),
    source: 'live',
    version: YOUTUBE_CHAT_FEED_PROTOCOL_VERSION
  };
}

function createRecord(id: string, text: string): YouTubeChatMessageRecord {
  return {
    author: {
      badges: [{ label: 'Member' }],
      channelId: 'UCLiteBrowserViewer',
      name: '@LiteViewer'
    },
    id,
    kind: 'text',
    plainText: `${text} :wave:`,
    runs: [
      { text: `${text} `, type: 'text' },
      {
        alt: ':wave:',
        emojiId: 'wave-emoji',
        imageUrl: 'https://www.youtube.com/favicon.ico',
        shortcuts: [':wave:'],
        type: 'emoji'
      }
    ],
    timestampText: '10:30 PM',
    timestampUsec: '1782000000000000'
  };
}
