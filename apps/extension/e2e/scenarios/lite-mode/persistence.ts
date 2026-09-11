/** Browser scenarios for Lite mode persistence behavior. */
import { expect, test } from '@playwright/test';
import { expectLiteModeMenuState } from './menu';
import {
  getExtensionStorageValues,
  setExtensionStorageValues,
  withExtensionStorageValues
} from '../../support/extension-storage';
import type { BrowserScenario } from '../types';
import {
  clearLiteTestCooldown,
  expectLiteAtLiveEdge,
  expectStoredLiteMode
} from './assertions';
import { installLiteDiagnostics, uninstallLiteDiagnostics } from './diagnostics';
import {
  LITE_NATIVE_DISCARDED_ATTRIBUTE,
  LITE_ROOT_SELECTOR,
  LITE_SESSION_COOLDOWN_KEY,
  NATIVE_LIST_SELECTOR,
  NATIVE_MESSAGE_SELECTOR
} from './selectors';
import {
  createBatch,
  createRecord,
  dispatchLiteBatch,
  getLiteContinuitySnapshot
} from './transport-fixtures';

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
        await expectStoredLiteMode(context, true);
        await expect(root).toBeVisible();
      });

      await test.step('Reload directly into stored Lite mode with its history', async () => {
        await page.reload({ timeout: 15_000, waitUntil: 'commit' });
        await expect(chat.locator('yt-live-chat-renderer')).toBeVisible({ timeout: 15_000 });
        await expectLiteModeMenuState(chat, true);
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
