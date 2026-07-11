/**
 * Read-only live-browser checks for YouTube-owned surfaces that remain usable
 * while Lite mode owns the chat feed. These scenarios never touch the composer.
 */
import { expect, test, type BrowserContext, type Locator } from '@playwright/test';
import {
  getExtensionStorageValues,
  setExtensionStorageValues,
  withExtensionStorageValues
} from '../support/extension-storage';
import { openSettingsMenu } from '../support/menu-openers';
import type { BrowserScenario, ChatSurface } from './types';

const LITE_BATCH_EVENT = 'ytcq:lite-chat-batch';
const LITE_FALLBACK_EVENT = 'ytcq:lite-mode-fallback';
const LITE_BUTTON_SELECTOR = '.ytcq-lite-mode-button';
const LITE_ROOT_SELECTOR = '.ytcq-lite-root';
const LITE_NATIVE_DISCARDED_ATTRIBUTE = 'data-ytcq-lite-native-discarded';
const LITE_NATIVE_RESTORE_SELECTOR = '#ytcq-lite-native-restore';
const LITE_SESSION_COOLDOWN_KEY = 'ytcqLiteModeSessionCooldown:v1';
const NATIVE_LIST_SELECTOR = 'yt-live-chat-item-list-renderer, #chat > #item-list';
const OPTIONAL_GIFT_WAIT_MS = 5_000;
const PARTICIPANT_LIST_SELECTOR = 'yt-live-chat-participant-list-renderer';
const SHOULD_CAPTURE_AERO_SCREENSHOTS =
  process.env.YTCQ_CAPTURE_LIVE_AERO_SCREENSHOTS === '1';

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

interface RectSnapshot {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

interface RowStyleSnapshot {
  authorMessageBaselineDelta: number | null;
  avatar: RectSnapshot | null;
  bounds: RectSnapshot;
  content: RectSnapshot | null;
  giftImage: RectSnapshot | null;
  giftImageContained: boolean | null;
  style: {
    backgroundColor: string;
    backgroundImage: string;
    color: string;
    display: string;
    fontFamily: string;
    fontSize: string;
    lineHeight: string;
    overflowX: string;
    paddingBottom: string;
    paddingLeft: string;
    paddingRight: string;
    paddingTop: string;
  };
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
  liteFeed: RectSnapshot;
  liteGift: RowStyleSnapshot | null;
  liteText: RowStyleSnapshot;
  nativeFeed: RectSnapshot;
  nativeGift: RowStyleSnapshot | null;
  nativeText: RowStyleSnapshot;
  startupMs: number;
}

export const liteModeLiveNativeSurfacesScenario: BrowserScenario = async ({ chat, context }) => {
  test.setTimeout(120_000);
  const button = chat.locator(LITE_BUTTON_SELECTOR).first();
  const root = chat.locator(LITE_ROOT_SELECTOR);
  let originalTimestamps: boolean | null = null;
  let participantEvidence: ParticipantEvidence | null = null;
  let timestampEvidence: Record<string, unknown> | null = null;

  try {
    await setExtensionStorageValues(context, 'sync', { liteModeEnabled: false });
    await expectStoredLiteMode(context, false);
    await clearLiteCooldown(chat);
    await installLiveSurfaceAudit(chat);
    await chat.locator(NATIVE_LIST_SELECTOR).first().waitFor({ state: 'attached', timeout: 20_000 });
    await expect(button).toBeVisible({ timeout: 20_000 });
    await expect(button).toHaveAttribute('aria-pressed', 'false');

    await button.click();
    await expectStoredLiteMode(context, true);
    await expect(root).toBeVisible({ timeout: 20_000 });
    await expect(chat.locator('html')).toHaveAttribute(
      LITE_NATIVE_DISCARDED_ATTRIBUTE,
      'true',
      { timeout: 20_000 }
    );
    const liteTimestamp = root.locator('.ytcq-lite-message #timestamp').first();
    await liteTimestamp.waitFor({ state: 'attached', timeout: 20_000 });

    await test.step('Mirror YouTube’s real Timestamps toggle into Lite rows', async () => {
      originalTimestamps = await getNativeTimestampsEnabled(chat);
      const toggled = !originalTimestamps;
      await setNativeTimestampsEnabled(chat, toggled);
      const toggledMirrored = await waitForLiteTimestampState(root, toggled);
      const toggledTextVisible = toggled
        ? await hasVisibleLiteTimestampText(liteTimestamp)
        : true;

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
      expect(
        restoredMirrored,
        'Expected restoring the native timestamp state to reach Lite.'
      ).toBe(true);
      expect(
        toggledTextVisible && restoredTextVisible,
        'Expected enabled Lite timestamps to contain visible clock text.'
      ).toBe(true);
    });

    await test.step('Keep Participants native, populated, and compatible with active Lite transport', async () => {
      const baseline = await getLiveSurfaceAudit(chat);
      await openParticipantsPanel(chat);
      const participants = chat.locator(PARTICIPANT_LIST_SELECTOR).filter({ visible: true }).first();
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
    if (originalTimestamps !== null) {
      await setNativeTimestampsEnabled(chat, originalTimestamps).catch(() => undefined);
    }
    await setExtensionStorageValues(context, 'sync', { liteModeEnabled: false }).catch(
      () => undefined
    );
    await root.waitFor({ state: 'detached', timeout: 8_000 }).catch(() => undefined);
    await chat.locator(NATIVE_LIST_SELECTOR).first().waitFor({
      state: 'visible',
      timeout: 20_000
    }).catch(() => undefined);
    await clearLiteCooldown(chat).catch(() => undefined);
    await uninstallLiveSurfaceAudit(chat).catch(() => undefined);
    await test
      .info()
      .attach('lite-native-surfaces-evidence', {
        body: JSON.stringify(
          {
            finalAudit,
            participantEvidence,
            timestampEvidence
          },
          null,
          2
        ),
        contentType: 'application/json'
      })
      .catch(() => undefined);
  }
};

export const liteModeReplayAeroInspectionScenario: BrowserScenario = async ({ chat, context }) => {
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
        await expect(button).toBeVisible({ timeout: 20_000 });
        await expect(button).toHaveAttribute('aria-pressed', 'false');
        await expect(chat.locator('html')).toHaveAttribute('data-ytcq-chat-skin', 'aero');
        await chat
          .locator('yt-live-chat-text-message-renderer')
          .last()
          .waitFor({ state: 'visible', timeout: 30_000 });

        const inactiveIcons = await sampleHeaderIconThemes(chat, false);
        const nativeText = await getRowStyleSnapshot(
          chat,
          'yt-live-chat-text-message-renderer',
          'text'
        );
        const nativeGift = await waitForOptionalRowStyleSnapshot(
          chat,
          'yt-gift-message-view-model',
          'gift',
          OPTIONAL_GIFT_WAIT_MS
        );
        const nativeFeed = await getRectSnapshot(chat.locator(NATIVE_LIST_SELECTOR).first());

        const startupAt = Date.now();
        await button.click();
        await expectStoredLiteMode(context, true);
        await expect(root).toBeVisible({ timeout: 20_000 });
        await expect(root).toHaveAttribute('data-ytcq-connection-state', 'connected', {
          timeout: 20_000
        });
        await root.locator('.ytcq-lite-message-text').last().waitFor({
          state: 'visible',
          timeout: 30_000
        });
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
        const liteText = await getRowStyleSnapshot(chat, '.ytcq-lite-message-text', 'text');
        const liteFeed = await getRectSnapshot(root);
        const liteGift = await waitForOptionalRowStyleSnapshot(
          chat,
          '.ytcq-lite-message-gift',
          'gift',
          OPTIONAL_GIFT_WAIT_MS
        );

        evidence = {
          activeIcons,
          inactiveIcons,
          liteFeed,
          liteGift,
          liteText,
          nativeFeed,
          nativeGift,
          nativeText,
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

        expect(nativeText.avatar).not.toBeNull();
        expect(liteText.avatar).not.toBeNull();
        expect(Math.abs((nativeText.avatar?.width || 0) - (liteText.avatar?.width || 0))).toBeLessThanOrEqual(1);
        expect(Math.abs((nativeText.avatar?.height || 0) - (liteText.avatar?.height || 0))).toBeLessThanOrEqual(1);
        expect(nativeText.authorMessageBaselineDelta).not.toBeNull();
        expect(liteText.authorMessageBaselineDelta).not.toBeNull();
        expect(nativeText.authorMessageBaselineDelta || 0).toBeLessThanOrEqual(2);
        expect(liteText.authorMessageBaselineDelta || 0).toBeLessThanOrEqual(2);
        expect(Math.abs(nativeFeed.top - liteFeed.top)).toBeLessThanOrEqual(1);
        expect(Math.abs(nativeFeed.bottom - liteFeed.bottom)).toBeLessThanOrEqual(1);
        expect(Math.abs(nativeFeed.height - liteFeed.height)).toBeLessThanOrEqual(1);
        const lastLiteRow = await getRectSnapshot(root.locator('.ytcq-lite-message').last());
        expect(lastLiteRow.bottom).toBeLessThanOrEqual(liteFeed.bottom + 1);

        if (nativeGift?.giftImage) expect(nativeGift.giftImageContained).toBe(true);
        if (liteGift?.giftImage) expect(liteGift.giftImageContained).toBe(true);

        await test.step('Show restore loading while YouTube rebuilds native chat', async () => {
          await setExtensionStorageValues(context, 'sync', { liteModeEnabled: false });
          await expect(chat.locator(LITE_NATIVE_RESTORE_SELECTOR)).toBeVisible({
            timeout: 8_000
          });
          await expect(chat.locator(NATIVE_LIST_SELECTOR).first()).toBeVisible({
            timeout: 20_000
          });
          await expect(chat.locator(LITE_NATIVE_RESTORE_SELECTOR)).toHaveCount(0, {
            timeout: 20_000
          });
        });
      } finally {
        await setExtensionStorageValues(context, 'sync', { liteModeEnabled: false }).catch(
          () => undefined
        );
        await root.waitFor({ state: 'detached', timeout: 8_000 }).catch(() => undefined);
        await chat.locator(NATIVE_LIST_SELECTOR).first().waitFor({
          state: 'visible',
          timeout: 20_000
        }).catch(() => undefined);
        await expect(chat.locator(LITE_NATIVE_RESTORE_SELECTOR)).toHaveCount(0, {
          timeout: 20_000
        }).catch(() => undefined);
        await clearLiteCooldown(chat).catch(() => undefined);
        await test
          .info()
          .attach('lite-aero-computed-style-evidence', {
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

  try {
    await setExtensionStorageValues(context, 'sync', { liteModeEnabled: false });
    await expectStoredLiteMode(context, false);
    await clearLiteCooldown(chat);
    await chat.locator(NATIVE_LIST_SELECTOR).first().waitFor({ state: 'attached', timeout: 20_000 });
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

    const video = page.locator('video.html5-main-video').first();
    await expect(video).toBeVisible({ timeout: 20_000 });
    await expect.poll(
      () => video.evaluate((element) => (element as HTMLVideoElement).duration),
      { timeout: 45_000 }
    ).toBeGreaterThan(60);
    const duration = await video.evaluate((element) => (element as HTMLVideoElement).duration);
    const progressBar = page.locator('.ytp-progress-bar').first();
    await expect(progressBar).toBeVisible({ timeout: 20_000 });
    const bounds = await progressBar.boundingBox();
    if (!bounds) throw new Error('YouTube replay progress bar has no visible bounds.');

    const seekFractions = [0.72, 0.16, 0.84, 0.28, 0.63, 0.41];
    for (const fraction of seekFractions) {
      await page.mouse.click(bounds.x + bounds.width * fraction, bounds.y + bounds.height / 2);
      await page.waitForTimeout(100);
    }

    const finalTime = duration * seekFractions.at(-1)!;
    const seekTolerance = Math.max(10, duration * 0.01);
    await expect.poll(
      () => video.evaluate((element) => (element as HTMLVideoElement).currentTime),
      { timeout: 15_000 }
    ).toBeGreaterThan(finalTime - seekTolerance);
    await expect.poll(
      () => video.evaluate((element) => (element as HTMLVideoElement).currentTime),
      { timeout: 15_000 }
    ).toBeLessThan(finalTime + seekTolerance);
    // The old race cleared the final response when a delayed progress signal
    // arrived just after it, so give that signal time to land before asserting.
    await page.waitForTimeout(1_500);
    await expect(root).toHaveAttribute('data-ytcq-connection-state', 'connected');
    await expect.poll(() => root.locator('.ytcq-lite-message').count(), {
      message: 'Expected Lite chat to stay populated at the final rapid replay seek position.',
      timeout: 30_000
    }).toBeGreaterThan(0);
    await expect(root.locator('.ytcq-lite-message').last()).toBeVisible();
  } finally {
    await setExtensionStorageValues(context, 'sync', { liteModeEnabled: false }).catch(
      () => undefined
    );
    await clearLiteCooldown(chat).catch(() => undefined);
  }
};

async function getRectSnapshot(locator: Locator): Promise<RectSnapshot> {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width
    };
  });
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
    .then(() => true, () => false);
}

async function hasVisibleLiteTimestampText(timestamp: Locator): Promise<boolean> {
  return timestamp.evaluate((element) => {
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' &&
      Boolean(element.textContent?.trim());
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
  throw new Error(`YouTube Timestamps toggle was not found. Menu text: ${(await menu.innerText()).slice(0, 500)}`);
}

async function isToggleEnabled(toggle: Locator): Promise<boolean> {
  return (await toggle.getAttribute('aria-pressed')) === 'true' ||
    (await toggle.getAttribute('checked')) !== null ||
    (await toggle.getAttribute('active')) !== null;
}

async function openParticipantsPanel(chat: ChatSurface): Promise<void> {
  const menu = await openSettingsMenu(chat);
  const candidates = menu.locator([
    'ytd-menu-navigation-item-renderer',
    'ytd-menu-service-item-renderer',
    'yt-live-chat-menu-sub-menu-item-renderer',
    'tp-yt-paper-item'
  ].join(','));
  for (let index = 0; index < (await candidates.count()); index += 1) {
    const candidate = candidates.nth(index);
    if (!/\bparticipants\b/i.test(await candidate.innerText().catch(() => ''))) continue;
    if (!(await candidate.isVisible().catch(() => false))) continue;
    await candidate.click();
    return;
  }
  throw new Error(`YouTube Participants item was not found. Menu text: ${(await menu.innerText()).slice(0, 500)}`);
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
  await chat.locator('body').press('Escape').catch(() => undefined);
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
    const rows = Array.from(element.querySelectorAll<HTMLElement>('yt-live-chat-participant-renderer'));
    return {
      ariaHidden: element.getAttribute('aria-hidden'),
      rowCount: rows.length,
      selected: element.classList.contains('iron-selected') ||
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
      window.addEventListener(eventNames.batch, () => {
        audit.batchCount += 1;
      }, { signal: controller.signal });
      window.addEventListener(eventNames.fallback, (event) => {
        if (!(event instanceof CustomEvent) || typeof event.detail !== 'string') return;
        try {
          const detail = JSON.parse(event.detail) as { reason?: unknown };
          if (typeof detail.reason === 'string') audit.fallbackReason = detail.reason;
        } catch {
          audit.fallbackReason = 'invalid-fallback-detail';
        }
      }, { signal: controller.signal });
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          const target = mutation.target instanceof Element
            ? mutation.target
            : mutation.target.parentElement;
          const participantMutation = Boolean(target?.closest('yt-live-chat-participant-list-renderer')) ||
            [...mutation.addedNodes, ...mutation.removedNodes].some((node) => {
              return node instanceof Element && (
                node.matches('yt-live-chat-participant-list-renderer') ||
                Boolean(node.querySelector('yt-live-chat-participant-list-renderer'))
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
    return (window as Window & { __ytcqLiveSurfaceAudit?: LiveSurfaceAudit })
      .__ytcqLiveSurfaceAudit || {
      batchCount: 0,
      fallbackReason: '',
      participantChildMutations: 0,
      participantMutationCount: 0
    };
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
    const snapshot = await chat.locator(LITE_BUTTON_SELECTOR).first().evaluate(
      (button, values) => {
        const header = button.closest('yt-live-chat-header-renderer');
        const svg = button.querySelector('svg');
        if (!header || !svg) throw new Error('Lite header icon is missing its native header or SVG.');
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

async function waitForOptionalRowStyleSnapshot(
  chat: ChatSurface,
  selector: string,
  kind: 'gift' | 'text',
  timeout: number
): Promise<RowStyleSnapshot | null> {
  const visible = await chat
    .locator(selector)
    .last()
    .waitFor({ state: 'visible', timeout })
    .then(() => true, () => false);
  return visible ? getRowStyleSnapshot(chat, selector, kind) : null;
}

async function getRowStyleSnapshot(
  chat: ChatSurface,
  selector: string,
  kind: 'gift' | 'text'
): Promise<RowStyleSnapshot> {
  return chat.locator('body').evaluate(
    (_body, values) => {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(values.selector));
      const firstTextRect = (element: HTMLElement | null): DOMRect | null => {
        if (!element) return null;
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node && !node.textContent?.trim()) node = walker.nextNode();
        if (!node) return null;
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getBoundingClientRect();
      };
      const visibleCandidates = candidates.reverse().filter((candidate) => {
        const style = getComputedStyle(candidate);
        const rect = candidate.getBoundingClientRect();
        return candidate.isConnected && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      });
      const host = values.kind === 'text'
        ? visibleCandidates.find((candidate) => {
            const authorRect = firstTextRect(candidate.querySelector('#author-name-v2, #author-name'));
            const messageRect = firstTextRect(candidate.querySelector('#message-v2, #message'));
            return Boolean(authorRect && messageRect && Math.abs(authorRect.bottom - messageRect.bottom) <= 2);
          }) || visibleCandidates[0]
        : visibleCandidates[0];
      if (!host) throw new Error(`No visible row matched ${values.selector}.`);
      const row = values.kind === 'gift'
        ? host.querySelector<HTMLElement>('#gift-message-v2') || host
        : host;
      const avatar = row.querySelector<HTMLElement>('#author-photo');
      const content = row.querySelector<HTMLElement>('#content');
      const author = row.querySelector<HTMLElement>('#author-name-v2, #author-name');
      const message = row.querySelector<HTMLElement>('#message-v2, #message');
      const giftImage = row.querySelector<HTMLElement>('#gift-image img, .ytcq-lite-gift-image');
      const rowRect = row.getBoundingClientRect();
      const rectSnapshot = (rect: DOMRect): RectSnapshot => ({
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width
      });
      const authorRect = firstTextRect(author);
      const messageRect = firstTextRect(message);
      const giftImageRect = giftImage?.getBoundingClientRect() || null;
      const style = getComputedStyle(row);
      return {
        authorMessageBaselineDelta: authorRect && messageRect
          ? Math.abs(authorRect.bottom - messageRect.bottom)
          : null,
        avatar: avatar ? rectSnapshot(avatar.getBoundingClientRect()) : null,
        bounds: rectSnapshot(rowRect),
        content: content ? rectSnapshot(content.getBoundingClientRect()) : null,
        giftImage: giftImageRect ? rectSnapshot(giftImageRect) : null,
        giftImageContained: giftImageRect
          ? giftImageRect.left >= rowRect.left - 1 &&
            giftImageRect.right <= rowRect.right + 1 &&
            giftImageRect.top >= rowRect.top - 1 &&
            giftImageRect.bottom <= rowRect.bottom + 1
          : null,
        style: {
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          color: style.color,
          display: style.display,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          overflowX: style.overflowX,
          paddingBottom: style.paddingBottom,
          paddingLeft: style.paddingLeft,
          paddingRight: style.paddingRight,
          paddingTop: style.paddingTop
        }
      };
    },
    { kind, selector }
  );
}

async function clearLiteCooldown(chat: ChatSurface): Promise<void> {
  await chat.locator('body').evaluate((_body, key) => {
    sessionStorage.removeItem(key);
  }, LITE_SESSION_COOLDOWN_KEY);
}
