/** Browser scenario for Lite mode participants behavior. */
import { expect, test } from '@playwright/test';
import { expectLiteModeMenuState, toggleLiteModeFromMenu } from './menu';
import { setExtensionStorageValues } from '../../support/extension-storage';
import type { BrowserScenario } from '../types';
import {
  getRealYouTubeSurfaceAudit,
  installRealYouTubeSurfaceAudit,
  uninstallRealYouTubeSurfaceAudit
} from './real-youtube-audit';
import {
  closeParticipantsPanel,
  getParticipantEvidence,
  getParticipantRowCount,
  openParticipantsPanel,
  type ParticipantEvidence
} from './real-youtube-participants';
import {
  clearLiteTestCooldown,
  expectStoredLiteMode
} from './assertions';
import {
  LITE_NATIVE_DISCARDED_ATTRIBUTE,
  LITE_ROOT_SELECTOR,
  NATIVE_LIST_SELECTOR,
  PARTICIPANT_LIST_SELECTOR
} from './selectors';

export const liteModeLiveParticipantsScenario: BrowserScenario = async ({ chat, context }) => {
  test.setTimeout(120_000);
  const root = chat.locator(LITE_ROOT_SELECTOR);
  let participantEvidence: ParticipantEvidence | null = null;

  try {
    await setExtensionStorageValues(context, 'sync', { liteModeEnabled: false });
    await expectStoredLiteMode(context, false);
    await clearLiteTestCooldown(chat);
    await installRealYouTubeSurfaceAudit(chat);
    await chat
      .locator(NATIVE_LIST_SELECTOR)
      .first()
      .waitFor({ state: 'attached', timeout: 20_000 });

    await expectLiteModeMenuState(chat, false);

    await toggleLiteModeFromMenu(chat);
    await expectStoredLiteMode(context, true);
    await expect(root).toBeVisible({ timeout: 20_000 });
    await expect(chat.locator('html')).toHaveAttribute(LITE_NATIVE_DISCARDED_ATTRIBUTE, 'true', {
      timeout: 20_000
    });
    await expect(root.locator('.ytcq-lite-message').first()).toBeVisible({ timeout: 20_000 });

    await test.step('Keep Participants native, populated, and compatible with active Lite transport', async () => {
      const baseline = await getRealYouTubeSurfaceAudit(chat);
      await openParticipantsPanel(chat);
      const participants = chat
        .locator(PARTICIPANT_LIST_SELECTOR)
        .filter({ visible: true })
        .first();
      await expect(participants).toBeVisible({ timeout: 15_000 });
      await expect(root).toBeHidden();
      await expect(root).not.toHaveAttribute('aria-hidden', 'true');

      await expect
        .poll(async () => getParticipantRowCount(participants), {
          message: 'Expected YouTube’s native Participants panel to populate.',
          timeout: 20_000
        })
        .toBeGreaterThan(0);
      await expect
        .poll(async () => (await getRealYouTubeSurfaceAudit(chat)).batchCount, {
          message: 'Expected Lite transport batches to continue while Participants is selected.',
          timeout: 30_000
        })
        .toBeGreaterThan(baseline.batchCount);

      participantEvidence = await getParticipantEvidence(chat, participants, baseline.batchCount);
      expect(participantEvidence.selected).toBe(true);
      expect(participantEvidence.visibleRowCount).toBeGreaterThan(0);
      expect(participantEvidence.fallbackReason).toBe('');

      await closeParticipantsPanel(chat, participants);
      await expect(root).toBeVisible({ timeout: 15_000 });
      await expect(root.locator('.ytcq-lite-message').first()).toBeVisible();
      expect((await getRealYouTubeSurfaceAudit(chat)).fallbackReason).toBe('');
    });
  } finally {
    const finalAudit = await getRealYouTubeSurfaceAudit(chat).catch(() => null);
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
    await uninstallRealYouTubeSurfaceAudit(chat).catch(() => undefined);
    await test
      .info()
      .attach('lite-participants-evidence', {
        body: JSON.stringify(
          {
            finalAudit,
            participantEvidence
          },
          null,
          2
        ),
        contentType: 'application/json'
      })
      .catch(() => undefined);
  }
};
