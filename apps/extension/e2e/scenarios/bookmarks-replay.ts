/** Follow a bookmark from the popup into an unmodified, real YouTube replay. */
import { expect, test, type BrowserContext } from '@playwright/test';
import { BOOKMARKS_STORAGE_KEY, type BookmarkRecord } from '../../src/shared/bookmarks';
import { getExtensionId } from '../support/extension';
import {
  getExtensionStorageValues,
  withExtensionStorageValues
} from '../support/extension-storage';
import { getRichVisibleText } from '../support/text';
import { getReplayUrl, openLiveChat, startVideoPlaybackIfPaused } from '../support/youtube-page';
import { LITE_ROOT_SELECTOR } from './lite-mode/selectors';
import { toggleLiteModeFromMenu } from './lite-mode/menu';
import {
  NORMAL_CHAT_MESSAGE_SELECTOR,
  type BrowserScenario,
  type BrowserScenarioSession
} from './types';

interface ObservedBookmarkJump {
  messageId: string;
  visible: boolean;
  videoTime: number;
}

type BookmarkObservationWindow = Window & {
  __ytcqTestBookmarkJump?: ObservedBookmarkJump;
};

export const bookmarkReplayLinkScenario: BrowserScenario = async ({ context, page }) => {
  await verifyBookmarkReplayLink({ context, page }, false);
};

export const liteBookmarkReplayLinkScenario: BrowserScenario = async ({ context, page }) => {
  await verifyBookmarkReplayLink({ context, page }, true);
};

async function verifyBookmarkReplayLink(
  { context, page: previousPage }: Pick<BrowserScenarioSession, 'context' | 'page'>,
  liteMode: boolean
): Promise<void> {
  test.setTimeout(180_000);
  const previousPages = new Set(context.pages());
  try {
    await withExtensionStorageValues(context, 'sync', {
      liteModeEnabled: false,
      targetLanguage: ''
    }, async () => {
      await withExtensionStorageValues(context, 'local', { [BOOKMARKS_STORAGE_KEY]: {} }, async () => {
        const page = await context.newPage();
        const url = new URL(getReplayUrl());
        // Start at a positive offset without moving the suite's shared watch tab.
        if (!url.searchParams.has('t')) url.searchParams.set('t', '60s');
        url.hash = '';
        const chat = await openLiveChat(page, url.toString());
        await startVideoPlaybackIfPaused(page);
        await followBookmarkReplayLink({ chat, context, page }, liteMode);
      });
    });
  } finally {
    await Promise.all(context.pages().filter((page) => !previousPages.has(page))
      .map((page) => page.close().catch(() => undefined)));
    await previousPage.bringToFront();
  }
}

async function followBookmarkReplayLink(
  { chat, context, page }: BrowserScenarioSession,
  liteMode: boolean
): Promise<void> {
  const messageSelector = liteMode ? '.ytcq-lite-message-text' : NORMAL_CHAT_MESSAGE_SELECTOR;

  await test.step('Read an actual message from the chat replay', async () => {
    await expect(chat.locator('.ytcq-inbox-button')).toBeVisible();
    if (liteMode) {
      await toggleLiteModeFromMenu(chat);
      await expect(chat.locator(LITE_ROOT_SELECTOR)).toBeVisible();
    }
    await expect(chat.locator(messageSelector).last()).toBeVisible({ timeout: 45_000 });

    // Pause through the player UI so selecting and saving cannot race moving rows.
    const video = page.locator('video.html5-main-video').first();
    if (!(await video.evaluate((element) => (element as HTMLVideoElement).paused))) {
      await page.locator('.ytp-play-button').click();
    }
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).paused))
      .toBe(true);
  });

  const messageId = await chat.locator(messageSelector).last().evaluate(
    (row) => row.getAttribute('data-message-id') || row.id
  );
  // Keep the same row even if a final replay batch arrives after pausing.
  const source = chat.locator(messageSelector).and(chat.locator(messageIdSelector(messageId)));
  const timestampText = (await source.locator('#timestamp').textContent())?.trim() || '';
  const text = await getRichVisibleText(source.locator('#message'));
  expect(messageId).not.toBe('');
  expect(text).not.toBe('');
  expect(timestampText).toMatch(/^\d+:\d{2}(?::\d{2})?$/);
  const offsetSeconds = timestampText.split(':').reduce((seconds, part) => seconds * 60 + Number(part), 0);
  expect(offsetSeconds).toBeGreaterThan(0);

  await test.step('Save that exact message through its profile card', async () => {
    await source.locator('#author-photo').first().click();
    const card = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');
    await expect(card).toBeVisible();
    const save = card.locator('.ytcq-profile-card-message-origin .ytcq-bookmark-toggle');
    await expect(save).toHaveAttribute('aria-pressed', 'false');
    await save.click();
    await expect(save).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => {
      const stored = await getExtensionStorageValues(context, 'local', [BOOKMARKS_STORAGE_KEY]);
      return Object.values((stored[BOOKMARKS_STORAGE_KEY] || {}) as Record<string, BookmarkRecord>)
        .map((record) => record.message);
    }).toEqual([expect.objectContaining({ messageId, timestampText, videoOffsetSeconds: offsetSeconds })]);
    await card.locator('.ytcq-profile-card-close').click();
  });

  const extensionId = await getExtensionId(context);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator('#bookmarksTab').click();
  const bookmark = popup.locator('.bookmark-row[data-bookmark-key]');
  await expect(bookmark).toHaveCount(1);
  await expect.poll(() => getRichVisibleText(bookmark.locator('.bookmark-message'))).toBe(text);

  // Install before the popup opens its new tab: the 1.6-second highlight can
  // finish before Playwright has acquired the new page and its chat iframe.
  await observeReplayBookmarkJump(context, messageSelector, messageId);
  const [linkedPage] = await test.step('Open the saved message from Bookmarks', async () => {
    return Promise.all([
      context.waitForEvent('page'),
      bookmark.locator('.bookmark-source-button').click()
    ]);
  });
  await linkedPage.waitForURL(/^https:\/\/www\.youtube\.com\/watch\?/, {
    waitUntil: 'domcontentloaded'
  });
  const targetUrl = new URL(linkedPage.url());
  expect(targetUrl.origin).toBe('https://www.youtube.com');
  expect(targetUrl.pathname).toBe('/watch');
  expect(targetUrl.searchParams.get('v')).toBe(new URL(page.url()).searchParams.get('v'));
  expect(targetUrl.searchParams.get('t')).toBe(`${offsetSeconds}s`);
  expect(new URLSearchParams(targetUrl.hash.slice(1)).get('ytcq-message')).toBe(messageId);

  await test.step('Verify the exact message is highlighted in the chat viewport at its replay time', async () => {
    await linkedPage.bringToFront();
    await startVideoPlaybackIfPaused(linkedPage);
    const linkedChat = linkedPage.frameLocator('iframe#chatframe');
    await expect(linkedPage.locator('iframe#chatframe')).toBeVisible();
    const observation = () => linkedChat.locator('html').evaluate(
      () => (window as BookmarkObservationWindow).__ytcqTestBookmarkJump
    );
    await expect.poll(observation, {
      message: 'The bookmark must highlight the saved message and bring it inside the chat viewport.',
      timeout: 30_000
    }).toMatchObject({ messageId, visible: true });
    const jump = (await observation())!;
    expect(jump.videoTime).toBeGreaterThanOrEqual(offsetSeconds - 2);
    expect(jump.videoTime).toBeLessThan(offsetSeconds + 15);
  });
}

function messageIdSelector(messageId: string): string {
  return `[data-message-id=${JSON.stringify(messageId)}], [id=${JSON.stringify(messageId)}]`;
}

async function observeReplayBookmarkJump(
  context: BrowserContext,
  messageSelector: string,
  messageId: string
): Promise<void> {
  await context.addInitScript(({ selector, id }) => {
    if (location.pathname !== '/live_chat_replay') return;
    // The replay suite reuses its context; observe only this case's linked tab.
    const targetId = new URLSearchParams(window.top?.location.hash.slice(1)).get('ytcq-message');
    if (targetId !== id) return;
    const testWindow = window as BookmarkObservationWindow;
    const observer = new MutationObserver(() => {
      const row = Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) => {
        return (element.getAttribute('data-message-id') || element.id) === id &&
          element.classList.contains('ytcq-message-jump-target');
      });
      if (!row) return;
      observer.disconnect();
      const jump: ObservedBookmarkJump = {
        messageId: id,
        visible: false,
        videoTime: window.top?.document.querySelector<HTMLVideoElement>('video')?.currentTime ?? NaN
      };
      testWindow.__ytcqTestBookmarkJump = jump;
      const checkVisibility = (): void => {
        const scroller = row.closest('#item-scroller');
        const bounds = row.getBoundingClientRect();
        const viewport = scroller?.getBoundingClientRect();
        jump.visible = Boolean(viewport && bounds.width > 0 && bounds.height > 0 &&
          bounds.top >= Math.max(0, viewport.top) &&
          bounds.bottom <= Math.min(window.innerHeight, viewport.bottom));
        if (!jump.visible && row.classList.contains('ytcq-message-jump-target')) {
          requestAnimationFrame(checkVisibility);
        }
      };
      requestAnimationFrame(checkVisibility);
    });
    observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  }, { selector: messageSelector, id: messageId });
}
