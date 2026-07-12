/**
 * Read-only browser checks for YouTube-owned surfaces that remain usable while
 * Lite mode owns the chat feed. User-facing behavior is shared across mock and
 * live surfaces; transport-specific probes remain live-only.
 */
import { expect, test, type BrowserContext, type Locator } from '@playwright/test';
import {
  getExtensionStorageValues,
  setExtensionStorageValues,
  withExtensionStorageValues
} from '../support/extension-storage';
import { openSettingsMenu } from '../support/menu-openers';
import { waitForYouTubeContentVideo } from '../support/youtube-page';
import type { BrowserScenario, ChatSurface } from './types';

const LITE_BATCH_EVENT = 'ytcq:lite-chat-batch';
const LITE_FALLBACK_EVENT = 'ytcq:lite-mode-fallback';
const LITE_BUTTON_SELECTOR = '.ytcq-lite-mode-button';
const LITE_ROOT_SELECTOR = '.ytcq-lite-root';
const LITE_NATIVE_DISCARDED_ATTRIBUTE = 'data-ytcq-lite-native-discarded';
const LITE_NATIVE_RESTORE_SELECTOR = '#ytcq-lite-native-restore';
const LITE_SESSION_COOLDOWN_KEY = 'ytcqLiteModeSessionCooldown:v1';
const NATIVE_LIST_SELECTOR = 'yt-live-chat-item-list-renderer, #chat > #item-list';
const PARTICIPANT_LIST_SELECTOR = 'yt-live-chat-participant-list-renderer';
const SHOULD_CAPTURE_AERO_SCREENSHOTS = process.env.YTCQ_CAPTURE_LIVE_AERO_SCREENSHOTS === '1';

interface LiveSurfaceAudit {
  batchCount: number;
  fallbackReason: string;
  participantChildMutations: number;
  participantMutationCount: number;
}

interface ParticipantEvidence extends LiveSurfaceAudit {
  ariaHidden: string | null;
  batchCountBeforePanel: number;
  rowCount: number;
  selected: boolean;
  textLength: number;
  visibleRowCount: number;
}

interface HeaderIconSnapshot {
  active: boolean;
  buttonColor: string;
  headerBackgroundColor: string;
  headerBackgroundImage: string;
  svgColor: string;
  svgFill: string;
  svgFilter: string;
  theme: 'dark' | 'light';
}

interface AeroEvidence {
  activeIcons: HeaderIconSnapshot[];
  inactiveIcons: HeaderIconSnapshot[];
  liteMessageCount: number;
  startupMs: number;
}

export const liteModeTimestampsScenario: BrowserScenario = async ({ chat, context }) => {
  test.setTimeout(120_000);
  const button = chat.locator(LITE_BUTTON_SELECTOR).first();
  const root = chat.locator(LITE_ROOT_SELECTOR);
  let originalTimestamps: boolean | null = null;
  let timestampEvidence: Record<string, unknown> | null = null;

  try {
    await setExtensionStorageValues(context, 'sync', { liteModeEnabled: false });
    await expectStoredLiteMode(context, false);
    await clearLiteCooldown(chat);
    await chat
      .locator(NATIVE_LIST_SELECTOR)
      .first()
      .waitFor({ state: 'attached', timeout: 20_000 });
    await expect(button).toBeVisible({ timeout: 20_000 });
    await expect(button).toHaveAttribute('aria-pressed', 'false');

    await button.click();
    await expectStoredLiteMode(context, true);
    await expect(root).toBeVisible({ timeout: 20_000 });
    await expect(chat.locator('html')).toHaveAttribute(LITE_NATIVE_DISCARDED_ATTRIBUTE, 'true', {
      timeout: 20_000
    });
    const liteTimestamp = root.locator('.ytcq-lite-message #timestamp').first();
    await liteTimestamp.waitFor({ state: 'attached', timeout: 20_000 });

    await test.step('Mirror YouTube’s real Timestamps toggle into Lite rows', async () => {
      originalTimestamps = await getNativeTimestampsEnabled(chat);
      const toggled = !originalTimestamps;
      await setNativeTimestampsEnabled(chat, toggled);
      const toggledMirrored = await waitForLiteTimestampState(root, toggled);
      const toggledTextVisible = toggled ? await hasVisibleLiteTimestampText(liteTimestamp) : true;

      await setNativeTimestampsEnabled(chat, originalTimestamps);
      const restoredMirrored = await waitForLiteTimestampState(root, originalTimestamps);
      const restoredTextVisible = originalTimestamps
        ? await hasVisibleLiteTimestampText(liteTimestamp)
        : true;
      timestampEvidence = {
        original: originalTimestamps,
        toggled,
        toggledMirrored,
        toggledTextVisible,
        restored: originalTimestamps,
        restoredMirrored,
        restoredTextVisible,
        liteDataset: await root.getAttribute('data-ytcq-show-timestamps'),
        liteDisplay: await liteTimestamp.evaluate((element) => getComputedStyle(element).display)
      };
      expect(toggledMirrored, 'Expected the changed native timestamp state to reach Lite.').toBe(
        true
      );
      expect(restoredMirrored, 'Expected restoring the native timestamp state to reach Lite.').toBe(
        true
      );
      expect(
        toggledTextVisible && restoredTextVisible,
        'Expected enabled Lite timestamps to contain visible clock text.'
      ).toBe(true);
    });
  } finally {
    if (originalTimestamps !== null) {
      await setNativeTimestampsEnabled(chat, originalTimestamps).catch(() => undefined);
    }
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
    await clearLiteCooldown(chat).catch(() => undefined);
    await test
      .info()
      .attach('lite-timestamps-evidence', {
        body: JSON.stringify(timestampEvidence, null, 2),
        contentType: 'application/json'
      })
      .catch(() => undefined);
  }
};

export const liteModeLiveParticipantsScenario: BrowserScenario = async ({ chat, context }) => {
  test.setTimeout(120_000);
  const button = chat.locator(LITE_BUTTON_SELECTOR).first();
  const root = chat.locator(LITE_ROOT_SELECTOR);
  let participantEvidence: ParticipantEvidence | null = null;

  try {
    await setExtensionStorageValues(context, 'sync', { liteModeEnabled: false });
    await expectStoredLiteMode(context, false);
    await clearLiteCooldown(chat);
    await installLiveSurfaceAudit(chat);
    await chat
      .locator(NATIVE_LIST_SELECTOR)
      .first()
      .waitFor({ state: 'attached', timeout: 20_000 });
    await expect(button).toBeVisible({ timeout: 20_000 });
    await expect(button).toHaveAttribute('aria-pressed', 'false');

    await button.click();
    await expectStoredLiteMode(context, true);
    await expect(root).toBeVisible({ timeout: 20_000 });
    await expect(chat.locator('html')).toHaveAttribute(LITE_NATIVE_DISCARDED_ATTRIBUTE, 'true', {
      timeout: 20_000
    });
    await expect(root.locator('.ytcq-lite-message').first()).toBeVisible({ timeout: 20_000 });

    await test.step('Keep Participants native, populated, and compatible with active Lite transport', async () => {
      const baseline = await getLiveSurfaceAudit(chat);
      await openParticipantsPanel(chat);
      const participants = chat
        .locator(PARTICIPANT_LIST_SELECTOR)
        .filter({ visible: true })
        .first();
      await expect(participants).toBeVisible({ timeout: 15_000 });
      await expect(root).toBeHidden();
      await expect(root).toHaveAttribute('aria-hidden', 'true');

      await expect
        .poll(async () => getParticipantRowCount(participants), {
          message: 'Expected YouTube’s native Participants panel to populate.',
          timeout: 20_000
        })
        .toBeGreaterThan(0);
      await expect
        .poll(async () => (await getLiveSurfaceAudit(chat)).batchCount, {
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
      await expect(root).not.toHaveAttribute('aria-hidden', 'true');
      await expect(root.locator('.ytcq-lite-message').first()).toBeVisible();
      expect((await getLiveSurfaceAudit(chat)).fallbackReason).toBe('');
    });
  } finally {
    const finalAudit = await getLiveSurfaceAudit(chat).catch(() => null);
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
    await clearLiteCooldown(chat).catch(() => undefined);
    await uninstallLiveSurfaceAudit(chat).catch(() => undefined);
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

export const liteModeAeroBehaviorScenario: BrowserScenario = async ({ chat, context }) => {
  test.setTimeout(120_000);
  const button = chat.locator(LITE_BUTTON_SELECTOR).first();
  const root = chat.locator(LITE_ROOT_SELECTOR);
  let evidence: AeroEvidence | null = null;

  await withExtensionStorageValues(
    context,
    'sync',
    { chatSkin: 'aero', liteModeEnabled: false },
    async () => {
      try {
        await clearLiteCooldown(chat);
        await expect(button).toBeVisible({ timeout: 20_000 });
        await expect(button).toHaveAttribute('aria-pressed', 'false');
        await expect(chat.locator('html')).toHaveAttribute('data-ytcq-chat-skin', 'aero');
        await chat
          .locator('yt-live-chat-text-message-renderer')
          .last()
          .waitFor({ state: 'visible', timeout: 30_000 });

        const inactiveIcons = await sampleHeaderIconThemes(chat, false);

        const startupAt = Date.now();
        await button.click();
        await expectStoredLiteMode(context, true);
        await expect(root).toBeVisible({ timeout: 20_000 });
        const liteText = root.locator('.ytcq-lite-message-text').last();
        await liteText.waitFor({ state: 'visible', timeout: 30_000 });
        const startupMs = Date.now() - startupAt;
        await expect(chat.locator('html')).toHaveAttribute(
          LITE_NATIVE_DISCARDED_ATTRIBUTE,
          'true',
          { timeout: 20_000 }
        );
        await expect(chat.locator(NATIVE_LIST_SELECTOR)).toHaveCount(0);

        const activeIcons = await sampleHeaderIconThemes(
          chat,
          true,
          SHOULD_CAPTURE_AERO_SCREENSHOTS
        );
        await expect(liteText.locator('#author-photo')).toBeVisible();
        await expect(liteText.locator('#author-name')).toBeVisible();
        await expect(liteText.locator('#message')).toBeVisible();
        await expect.poll(() => liteText.locator('#author-name').innerText()).not.toBe('');
        await expect.poll(() => liteText.locator('#message').innerText()).not.toBe('');
        await expect(root.locator('.ytcq-lite-scroller')).toBeVisible();
        await expect(root.locator('.ytcq-lite-toolbar')).toHaveCount(0);

        evidence = {
          activeIcons,
          inactiveIcons,
          liteMessageCount: await root.locator('.ytcq-lite-message').count(),
          startupMs
        };

        for (const icon of [...inactiveIcons, ...activeIcons]) {
          expect(icon.buttonColor).not.toBe('rgb(0, 0, 0)');
          expect(icon.svgFill).not.toBe('rgb(0, 0, 0)');
          expect(icon.headerBackgroundImage).not.toBe('none');
        }
        for (const icon of activeIcons) {
          expect(icon.buttonColor).not.toBe('rgb(255, 255, 255)');
          expect(icon.svgFilter).not.toBe('none');
        }

        await test.step('Restore native chat without losing the selected skin', async () => {
          await button.click();
          await expectStoredLiteMode(context, false);
          await expect(root).toHaveCount(0, { timeout: 20_000 });
          await expect(chat.locator(NATIVE_LIST_SELECTOR).first()).toBeVisible({
            timeout: 20_000
          });
          await expect(chat.locator('yt-live-chat-text-message-renderer').first()).toBeVisible({
            timeout: 30_000
          });
          await expect(chat.locator(LITE_NATIVE_RESTORE_SELECTOR)).toHaveCount(0, {
            timeout: 20_000
          });
          await expect(chat.locator('html')).toHaveAttribute('data-ytcq-chat-skin', 'aero');
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
        await expect(chat.locator(LITE_NATIVE_RESTORE_SELECTOR))
          .toHaveCount(0, {
            timeout: 20_000
          })
          .catch(() => undefined);
        await clearLiteCooldown(chat).catch(() => undefined);
        await test
          .info()
          .attach('lite-aero-behavior-evidence', {
            body: JSON.stringify(evidence, null, 2),
            contentType: 'application/json'
          })
          .catch(() => undefined);
      }
    }
  );
};

export const liteModeReplayRapidSeekScenario: BrowserScenario = async ({ chat, context, page }) => {
  test.setTimeout(180_000);
  const button = chat.locator(LITE_BUTTON_SELECTOR).first();
  const root = chat.locator(LITE_ROOT_SELECTOR);
  let initialReplayTime: number | null = null;

  try {
    await setExtensionStorageValues(context, 'sync', { liteModeEnabled: false });
    await expectStoredLiteMode(context, false);
    await clearLiteCooldown(chat);
    await chat
      .locator(NATIVE_LIST_SELECTOR)
      .first()
      .waitFor({ state: 'attached', timeout: 20_000 });
    await expect(button).toBeVisible({ timeout: 20_000 });

    await button.click();
    await expectStoredLiteMode(context, true);
    await expect(root).toHaveAttribute('data-ytcq-connection-state', 'connected', {
      timeout: 50_000
    });
    await root.locator('.ytcq-lite-message').last().waitFor({
      state: 'visible',
      timeout: 30_000
    });

    await waitForYouTubeContentVideo(page);
    const video = page.locator('video.html5-main-video').first();
    await expect(video).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => video.evaluate((element) => (element as HTMLVideoElement).duration), {
        timeout: 45_000
      })
      .toBeGreaterThan(60);
    const duration = await video.evaluate((element) => (element as HTMLVideoElement).duration);
    initialReplayTime = await video.evaluate(
      (element) => (element as HTMLVideoElement).currentTime
    );
    const seekFractions = [0.72, 0.16, 0.84, 0.28, 0.63, 0.41];
    const finalTime = duration * seekFractions.at(-1)!;
    const seekTolerance = Math.max(10, duration * 0.01);
    await performRapidReplaySeeks({
      duration,
      finalTime,
      page,
      seekFractions,
      seekTolerance,
      video
    });
    await expect
      .poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime), {
        timeout: 15_000
      })
      .toBeGreaterThan(finalTime - seekTolerance);
    await expect
      .poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime), {
        timeout: 15_000
      })
      .toBeLessThan(finalTime + seekTolerance);
    // The old race cleared the final response when a delayed progress signal
    // arrived just after it, so give that signal time to land before asserting.
    await page.waitForTimeout(1_500);
    await expect(root).toHaveAttribute('data-ytcq-connection-state', 'connected');
    await expect
      .poll(() => root.locator('.ytcq-lite-message').count(), {
        message: 'Expected Lite chat to stay populated at the final rapid replay seek position.',
        timeout: 30_000
      })
      .toBeGreaterThan(0);
    await expect(root.locator('.ytcq-lite-message').last()).toBeVisible();
  } finally {
    if (initialReplayTime !== null) {
      await page
        .locator('video.html5-main-video')
        .first()
        .evaluate((element, time) => {
          (element as HTMLVideoElement).currentTime = time;
        }, initialReplayTime)
        .catch(() => undefined);
    }
    await setExtensionStorageValues(context, 'sync', { liteModeEnabled: false }).catch(
      () => undefined
    );
    await clearLiteCooldown(chat).catch(() => undefined);
  }
};

async function performRapidReplaySeeks({
  duration,
  finalTime,
  page,
  seekFractions,
  seekTolerance,
  video
}: {
  duration: number;
  finalTime: number;
  page: Parameters<BrowserScenario>[0]['page'];
  seekFractions: number[];
  seekTolerance: number;
  video: Locator;
}): Promise<void> {
  const player = page.locator('#movie_player').first();
  const progressBar = player.locator('.ytp-progress-bar').first();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    for (const fraction of seekFractions) {
      // A large replay seek can trigger a mid-roll ad. Resume the burst on the
      // content progress bar instead of sending the remaining clicks to the ad.
      await waitForYouTubeContentVideo(page);
      await player.hover();
      await expect(progressBar).toBeVisible({ timeout: 20_000 });
      await expect(progressBar).not.toHaveAttribute('aria-disabled', 'true');
      const bounds = await progressBar.boundingBox();
      if (!bounds) throw new Error('YouTube replay progress bar has no visible bounds.');
      await page.mouse.click(bounds.x + bounds.width * fraction, bounds.y + bounds.height / 2);
      await page.waitForTimeout(100);
    }

    await waitForYouTubeContentVideo(page);
    const currentTime = await video.evaluate(
      (element) => (element as HTMLVideoElement).currentTime
    );
    if (Math.abs(currentTime - finalTime) <= seekTolerance) return;
  }

  const currentTime = await video.evaluate((element) => (element as HTMLVideoElement).currentTime);
  throw new Error(
    `YouTube progress-bar seeks did not reach the final replay position: ${JSON.stringify({
      currentTime,
      duration,
      finalTime,
      seekTolerance
    })}`
  );
}

async function expectStoredLiteMode(context: BrowserContext, enabled: boolean): Promise<void> {
  await expect
    .poll(async () => {
      const stored = await getExtensionStorageValues(context, 'sync', ['liteModeEnabled']);
      return stored.liteModeEnabled === true;
    })
    .toBe(enabled);
}

async function waitForLiteTimestampState(root: Locator, enabled: boolean): Promise<boolean> {
  return expect
    .poll(() => root.getAttribute('data-ytcq-show-timestamps'), { timeout: 5_000 })
    .toBe(String(enabled))
    .then(
      () => true,
      () => false
    );
}

async function hasVisibleLiteTimestampText(timestamp: Locator): Promise<boolean> {
  return timestamp.evaluate((element) => {
    const style = getComputedStyle(element);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Boolean(element.textContent?.trim())
    );
  });
}

async function getNativeTimestampsEnabled(chat: ChatSurface): Promise<boolean> {
  const menu = await openSettingsMenu(chat);
  const { toggle } = await findTimestampToggle(menu);
  const enabled = await isToggleEnabled(toggle);
  await chat.locator('body').press('Escape');
  return enabled;
}

async function setNativeTimestampsEnabled(chat: ChatSurface, enabled: boolean): Promise<void> {
  const menu = await openSettingsMenu(chat);
  const { renderer, toggle } = await findTimestampToggle(menu);
  if ((await isToggleEnabled(toggle)) !== enabled) {
    const item = renderer.locator('tp-yt-paper-item').first();
    if (await item.count()) await item.click();
    else await renderer.click();
  }
  await chat.locator('body').press('Escape');
  await expect.poll(() => getNativeTimestampsEnabled(chat), { timeout: 8_000 }).toBe(enabled);
}

async function findTimestampToggle(menu: Locator): Promise<{ renderer: Locator; toggle: Locator }> {
  const renderers = menu.locator('yt-live-chat-toggle-renderer');
  for (let index = 0; index < (await renderers.count()); index += 1) {
    const renderer = renderers.nth(index);
    const text = await renderer.innerText().catch(() => '');
    const toggle = renderer.locator('tp-yt-paper-toggle-button').first();
    const ariaLabel = await toggle.getAttribute('aria-label').catch(() => '');
    if (/timestamps/i.test(text) || /timestamps/i.test(ariaLabel || '')) {
      await expect(renderer).toBeVisible();
      return { renderer, toggle };
    }
  }
  throw new Error(
    `YouTube Timestamps toggle was not found. Menu text: ${(await menu.innerText()).slice(0, 500)}`
  );
}

async function isToggleEnabled(toggle: Locator): Promise<boolean> {
  return (
    (await toggle.getAttribute('aria-pressed')) === 'true' ||
    (await toggle.getAttribute('checked')) !== null ||
    (await toggle.getAttribute('active')) !== null
  );
}

async function openParticipantsPanel(chat: ChatSurface): Promise<void> {
  const menu = await openSettingsMenu(chat);
  const candidates = menu.locator(
    [
      'ytd-menu-navigation-item-renderer',
      'ytd-menu-service-item-renderer',
      'yt-live-chat-menu-sub-menu-item-renderer',
      'tp-yt-paper-item'
    ].join(',')
  );
  for (let index = 0; index < (await candidates.count()); index += 1) {
    const candidate = candidates.nth(index);
    if (!/\bparticipants\b/i.test(await candidate.innerText().catch(() => ''))) continue;
    if (!(await candidate.isVisible().catch(() => false))) continue;
    await candidate.click();
    return;
  }
  throw new Error(
    `YouTube Participants item was not found. Menu text: ${(await menu.innerText()).slice(0, 500)}`
  );
}

async function closeParticipantsPanel(chat: ChatSurface, participants: Locator): Promise<void> {
  for (const selector of [
    '#close-button button',
    'button[aria-label*="Close" i]',
    'button[aria-label*="Back" i]',
    'yt-icon-button#close-button',
    'yt-icon-button#back-button',
    '#close-button',
    '#back-button'
  ]) {
    const candidate = participants.locator(selector).first();
    if (!(await candidate.isVisible({ timeout: 250 }).catch(() => false))) continue;
    await candidate.click();
    return;
  }
  await participants.press('Escape').catch(() => undefined);
  await chat
    .locator('body')
    .press('Escape')
    .catch(() => undefined);
}

async function getParticipantRowCount(participants: Locator): Promise<number> {
  return participants.locator('yt-live-chat-participant-renderer').count();
}

async function getParticipantEvidence(
  chat: ChatSurface,
  participants: Locator,
  batchCountBeforePanel: number
): Promise<ParticipantEvidence> {
  const panel = await participants.evaluate((element) => {
    const rows = Array.from(
      element.querySelectorAll<HTMLElement>('yt-live-chat-participant-renderer')
    );
    return {
      ariaHidden: element.getAttribute('aria-hidden'),
      rowCount: rows.length,
      selected:
        element.classList.contains('iron-selected') ||
        element.hasAttribute('selected') ||
        element.getAttribute('aria-selected') === 'true',
      textLength: (element.textContent || '').trim().length,
      visibleRowCount: rows.filter((row) => {
        const style = getComputedStyle(row);
        const rect = row.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.height > 0;
      }).length
    };
  });
  return {
    ...(await getLiveSurfaceAudit(chat)),
    ...panel,
    batchCountBeforePanel
  };
}

async function installLiveSurfaceAudit(chat: ChatSurface): Promise<void> {
  await chat.locator('body').evaluate(
    (_body, eventNames) => {
      const auditWindow = window as Window & {
        __ytcqLiveSurfaceAudit?: LiveSurfaceAudit;
        __ytcqLiveSurfaceAuditAbort?: AbortController;
        __ytcqLiveSurfaceAuditObserver?: MutationObserver;
      };
      auditWindow.__ytcqLiveSurfaceAuditAbort?.abort();
      auditWindow.__ytcqLiveSurfaceAuditObserver?.disconnect();
      const controller = new AbortController();
      const audit: LiveSurfaceAudit = {
        batchCount: 0,
        fallbackReason: '',
        participantChildMutations: 0,
        participantMutationCount: 0
      };
      auditWindow.__ytcqLiveSurfaceAudit = audit;
      auditWindow.__ytcqLiveSurfaceAuditAbort = controller;
      window.addEventListener(
        eventNames.batch,
        () => {
          audit.batchCount += 1;
        },
        { signal: controller.signal }
      );
      window.addEventListener(
        eventNames.fallback,
        (event) => {
          if (!(event instanceof CustomEvent) || typeof event.detail !== 'string') return;
          try {
            const detail = JSON.parse(event.detail) as { reason?: unknown };
            if (typeof detail.reason === 'string') audit.fallbackReason = detail.reason;
          } catch {
            audit.fallbackReason = 'invalid-fallback-detail';
          }
        },
        { signal: controller.signal }
      );
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          const target =
            mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
          const participantMutation =
            Boolean(target?.closest('yt-live-chat-participant-list-renderer')) ||
            [...mutation.addedNodes, ...mutation.removedNodes].some((node) => {
              return (
                node instanceof Element &&
                (node.matches('yt-live-chat-participant-list-renderer') ||
                  Boolean(node.querySelector('yt-live-chat-participant-list-renderer')))
              );
            });
          if (!participantMutation) continue;
          audit.participantMutationCount += 1;
          if (mutation.type === 'childList') audit.participantChildMutations += 1;
        }
      });
      observer.observe(document.documentElement, {
        attributeFilter: ['aria-hidden', 'aria-selected', 'class', 'hidden', 'selected'],
        attributes: true,
        childList: true,
        subtree: true
      });
      auditWindow.__ytcqLiveSurfaceAuditObserver = observer;
    },
    { batch: LITE_BATCH_EVENT, fallback: LITE_FALLBACK_EVENT }
  );
}

async function getLiveSurfaceAudit(chat: ChatSurface): Promise<LiveSurfaceAudit> {
  return chat.locator('body').evaluate(() => {
    return (
      (window as Window & { __ytcqLiveSurfaceAudit?: LiveSurfaceAudit }).__ytcqLiveSurfaceAudit || {
        batchCount: 0,
        fallbackReason: '',
        participantChildMutations: 0,
        participantMutationCount: 0
      }
    );
  });
}

async function uninstallLiveSurfaceAudit(chat: ChatSurface): Promise<void> {
  await chat.locator('body').evaluate(() => {
    const auditWindow = window as Window & {
      __ytcqLiveSurfaceAudit?: LiveSurfaceAudit;
      __ytcqLiveSurfaceAuditAbort?: AbortController;
      __ytcqLiveSurfaceAuditObserver?: MutationObserver;
    };
    auditWindow.__ytcqLiveSurfaceAuditAbort?.abort();
    auditWindow.__ytcqLiveSurfaceAuditObserver?.disconnect();
    delete auditWindow.__ytcqLiveSurfaceAudit;
    delete auditWindow.__ytcqLiveSurfaceAuditAbort;
    delete auditWindow.__ytcqLiveSurfaceAuditObserver;
  });
}

async function sampleHeaderIconThemes(
  chat: ChatSurface,
  active: boolean,
  captureScreenshots = false
): Promise<HeaderIconSnapshot[]> {
  const snapshots: HeaderIconSnapshot[] = [];
  for (const theme of ['light', 'dark'] as const) {
    await chat.locator('html').evaluate((element, value) => {
      element.setAttribute('data-ytcq-chat-skin', 'aero');
      element.setAttribute('data-ytcq-chat-skin-theme', value);
    }, theme);
    const snapshot = await chat
      .locator(LITE_BUTTON_SELECTOR)
      .first()
      .evaluate(
        (button, values) => {
          const header = button.closest('yt-live-chat-header-renderer');
          const svg = button.querySelector('svg');
          if (!header || !svg)
            throw new Error('Lite header icon is missing its native header or SVG.');
          const buttonStyle = getComputedStyle(button);
          const headerStyle = getComputedStyle(header);
          const svgStyle = getComputedStyle(svg);
          return {
            active: values.active,
            buttonColor: buttonStyle.color,
            headerBackgroundColor: headerStyle.backgroundColor,
            headerBackgroundImage: headerStyle.backgroundImage,
            svgColor: svgStyle.color,
            svgFill: svgStyle.fill,
            svgFilter: svgStyle.filter,
            theme: values.theme
          };
        },
        { active, theme }
      );
    snapshots.push(snapshot);
    if (captureScreenshots) {
      const screenshot = await chat
        .locator('yt-live-chat-renderer')
        .screenshot({ animations: 'disabled' })
        .catch(() => null);
      if (screenshot) {
        await test.info().attach(`lite-aero-${theme}`, {
          body: screenshot,
          contentType: 'image/png'
        });
      }
    }
  }
  return snapshots;
}

async function clearLiteCooldown(chat: ChatSurface): Promise<void> {
  await chat.locator('body').evaluate((_body, key) => {
    sessionStorage.removeItem(key);
  }, LITE_SESSION_COOLDOWN_KEY);
}
