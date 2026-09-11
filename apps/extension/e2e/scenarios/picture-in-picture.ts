import { expect } from '@playwright/test';
import type { BrowserScenario, BrowserScenarioSession } from './types';
import { fixtureLoggedInLiveChatUrl } from '../support/live-chat-fixture';
import { openChatEnhancerMenu } from '../support/menu-openers';
import { NORMAL_CHAT_MESSAGE_SELECTOR } from '../support/chat-surface';
import { openLiveChat, startVideoPlaybackIfPaused } from '../support/youtube-page';

export const pictureInPictureLiveScenario: BrowserScenario = async ({ page, context, chat }) => {
  await runPictureInPictureLiveScenario({ page, context, chat }, false);
};

export const pictureInPictureLivePlaybackScenario: BrowserScenario = async ({ page, context, chat }) => {
  await runPictureInPictureLiveScenario({ page, context, chat }, true);
};

async function runPictureInPictureLiveScenario(
  { page: watchPage, context }: BrowserScenarioSession,
  testPlayback: boolean
): Promise<void> {
  // Pausing a pre-roll in the shared tab would block later chat-only tests.
  const page = await context.newPage();
  try {
    const chat = await openLiveChat(page, watchPage.url());
    await verifyNativePictureInPicture({ page, context, chat }, testPlayback);
  } finally {
    await page.close();
  }
}

async function verifyNativePictureInPicture(
  { page, context, chat }: BrowserScenarioSession,
  testPlayback: boolean
): Promise<void> {
  if (testPlayback) {
    await startVideoPlaybackIfPaused(page);
  } else {
    // Public CI can load native chat while YouTube media never starts. Exercise
    // the paused player there; the mock and signed-in scenarios cover playback.
    await page.locator('#movie_player video').evaluate((video: HTMLVideoElement) => video.pause());
  }
  const nativePlayer = await page.locator('#movie_player').evaluateHandle((element) => element);
  const close = chat.locator('yt-live-chat-header-renderer #close-button button');
  await expect(close).toBeVisible();
  const input = chat.locator('#input[contenteditable]');
  const hasComposer = await input.isVisible();
  if (hasComposer) await input.fill('Unsent before PiP');
  const menu = await openChatEnhancerMenu(chat);
  const opened = context.waitForEvent('page');
  await menu.locator('[data-ytcq-action="picture-in-picture"]').click();
  const pip = await opened;
  try {
    await pip.setViewportSize({ width: 460, height: 640 });
    const pipChat = pip.frameLocator('#chatframe');
    await expect(pipChat.locator('.ytcq-inbox-button')).toBeVisible();
    await expect(pipChat.locator(NORMAL_CHAT_MESSAGE_SELECTOR).last()).toBeVisible();
    await expect(pipChat.locator('html')).toHaveAttribute('data-ytcq-pip-chat', '');
    await expect(pip.locator('#chatframe')).toHaveCSS('border-width', '1px 0px 0px');
    await expect(pipChat.locator('yt-live-chat-header-renderer #close-button')).toBeHidden();
    if (hasComposer) {
      await expect(pipChat.locator('#input[contenteditable]')).toHaveText('Unsent before PiP');
      await pipChat.locator('#input[contenteditable]').fill('Unsent from PiP');
    }
    expect(await nativePlayer.evaluate((element) =>
      element.isConnected && element.ownerDocument.documentElement.hasAttribute('data-ytcq-pip-window')
    )).toBe(true);
    await expect(pip.locator('video')).toHaveJSProperty('paused', !testPlayback);
    await expect(pip.locator('video')).toHaveJSProperty('controls', false);
    const player = pip.locator('#movie_player');
    await player.hover();
    if (testPlayback) {
      await player.locator('.ytp-play-button').click();
      await expect(pip.locator('video')).toHaveJSProperty('paused', true);
      await player.locator('.ytp-play-button').click();
      await expect(pip.locator('video')).toHaveJSProperty('paused', false);
      await player.locator('.ytp-settings-button').click();
      await player.getByRole('menuitem', { name: /^Quality/ }).click();
      await expect(player.getByRole('heading', { name: 'Quality', exact: true })).toBeVisible();
      await player.getByRole('menuitemradio', { checked: true }).click();
      await player.press('k');
      await expect(pip.locator('video')).toHaveJSProperty('paused', true);
      await player.press('k');
      await expect(pip.locator('video')).toHaveJSProperty('paused', false);
    }
    await expect(player).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await pip.setViewportSize({ width: 1100, height: 650 });
    await player.hover();
    const widePlayer = await player.boundingBox();
    const wideChat = await pip.locator('#chatframe').boundingBox();
    expect(wideChat!.x).toBeCloseTo(widePlayer!.width);
    expect(wideChat!.height).toBe(650);
    await expect(pip.locator('#chatframe')).toHaveCSS('border-width', '0px 0px 0px 1px');
    if (testPlayback) {
      const controls = player.locator('.ytp-chrome-bottom');
      await expect(controls).toBeVisible();
      const bounds = await controls.boundingBox();
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(widePlayer!.width);
    }
    const replay = await pipChat.locator('html').evaluate(
      (element) => element.ownerDocument.location.pathname === '/live_chat_replay'
    );
    if (testPlayback && replay) {
      const seek = (await player.getByRole('slider', { name: 'Seek slider', exact: true }).boundingBox())!;
      await pip.mouse.move(seek.x + 2, seek.y + seek.height / 2);
      await pip.mouse.down();
      await pip.mouse.move(seek.x + seek.width * 0.02, seek.y + seek.height / 2, { steps: 5 });
      await pip.mouse.up();
      await expect.poll(() => pip.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime))
        .toBeGreaterThan(30);
    }
    const captions = player.locator('.ytp-subtitles-button');
    if (
      testPlayback && await captions.isVisible() && await captions.isEnabled() &&
      !(await captions.getAttribute('aria-label'))?.includes('unavailable')
    ) {
      const pressed = await captions.getAttribute('aria-pressed');
      await captions.click();
      await expect(captions).toHaveAttribute('aria-pressed', pressed === 'true' ? 'false' : 'true');
      await captions.click();
      await expect(captions).toHaveAttribute('aria-pressed', pressed || 'false');
    }
    await pip.setViewportSize({ width: 460, height: 640 });
    if (testPlayback) {
      const time = await pip.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime);
      await expect.poll(() => pip.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime))
        .toBeGreaterThan(time);
    }
    const placeholder = page.locator('.ytcq-pip-video-placeholder');
    expect((await placeholder.boundingBox())!.height).toBeGreaterThan(100);
    expect((await page.locator('.ytcq-pip-chat-placeholder').boundingBox())!.height).toBeGreaterThan(100);
    await expect(placeholder.locator('.ytcq-pip-return-button')).toHaveCSS('border-radius', '20px');
    await expect(placeholder.locator('.ytcq-pip-return-button')).toHaveCSS('height', '40px');
    await placeholder.getByRole('button', { name: 'Return to tab' }).click();
    await expect.poll(() => pip.isClosed()).toBe(true);
    // A YouTube error can hide its video and controls while the player remains visible.
    await expect(page.locator('#movie_player')).toBeVisible();
    if (testPlayback) await expect(page.locator('#movie_player video')).toBeVisible();
    expect(await nativePlayer.evaluate((element) => document.querySelector('#movie_player') === element)).toBe(true);
    await expect(page.locator('#movie_player video')).toHaveJSProperty('paused', !testPlayback);
    await expect(page.locator('#movie_player video')).toHaveJSProperty('controls', false);
    await expect(chat.locator('.ytcq-inbox-button')).toBeVisible();
    await expect(close).toBeVisible();
    await expect(chat.locator(NORMAL_CHAT_MESSAGE_SELECTOR).last()).toBeVisible();
    if (hasComposer) {
      await expect(input).toHaveText('Unsent from PiP');
      await input.fill('');
    }
  } finally {
    if (!pip.isClosed()) await pip.close();
    await nativePlayer.dispose();
    if (hasComposer && await input.isVisible()) await input.fill('');
  }
}

/** Real Document PiP and extension scripts, with deterministic YouTube markup. */
export const pictureInPictureScenario: BrowserScenario = async ({ page, context }) => {
  const watchUrl = 'https://www.youtube.com/watch?v=pip-test-01';
  await context.route(watchUrl, (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="en"><title>PiP test stream</title>
      <style>
        :root { --yt-live-chat-header-bottom-border: 1px solid rgba(0, 0, 0, 0.1); }
        :root[dark] { --yt-live-chat-header-bottom-border: 1px solid rgba(255, 255, 255, 0.2); }
        body { display:flex; margin:0; background:#fff; }
        #movie_player { position:relative; width:640px; height:360px; }
        video { width:100%; height:100%; }
        .ytp-chrome-bottom { position:absolute; bottom:0; left:12px; width:616px; background:#222; }
        ytd-live-chat-frame, iframe { position:relative; display:block; width:400px; height:800px; border:0; }
      </style>
      <div id="movie_player"><video muted></video>
        <div class="ytp-chrome-bottom"><button class="ytp-play-button">Play / pause</button></div>
      </div>
      <ytd-live-chat-frame><iframe id="chatframe" src="${fixtureLoggedInLiveChatUrl}&v=pip-test-01"></iframe></ytd-live-chat-frame>
    </html>`
  }));
  await page.goto(watchUrl);
  // A real playing video with no network, codec, or media fixture dependency.
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const drawing = canvas.getContext('2d')!;
    drawing.fillRect(0, 0, 640, 360);
    // Keep producing frames so time-advance assertions verify real playback.
    window.setInterval(() => drawing.fillRect(0, 0, 640, 360), 100);
    const video = document.querySelector('video')!;
    video.srcObject = canvas.captureStream(1);
    await video.play();
    document.querySelector('.ytp-play-button')!.addEventListener('click', () => {
      if (video.paused) void video.play();
      else video.pause();
    });
  });
  const chat = page.frameLocator('#chatframe');
  await expect(chat.locator('.ytcq-inbox-button')).toBeVisible();
  // The fixture has a tall standalone feed; embedded chat needs flexible height.
  await chat.locator('#item-scroller').evaluate((element) => {
    (element as HTMLElement).style.minHeight = '0';
  });
  await chat.locator('#input[contenteditable]').fill('Unsent before PiP');
  const menu = await openChatEnhancerMenu(chat);
  const pipOpened = context.waitForEvent('page');
  await menu.locator('[data-ytcq-action="picture-in-picture"]').click();
  const pip = await pipOpened;
  try {
    await pip.setViewportSize({ width: 460, height: 640 });
    const pipChat = pip.frameLocator('#chatframe');
    await expect(pipChat.locator('.ytcq-inbox-button')).toBeVisible();
    await expect(pipChat.locator('#input[contenteditable]')).toHaveText('Unsent before PiP');
    await pipChat.locator('#item-scroller').evaluate((element) => {
      (element as HTMLElement).style.minHeight = '0';
    });
    await expect(pipChat.locator('html')).toHaveAttribute('data-ytcq-message-density', 'compact');
    await expect(pip.locator('#chatframe')).toHaveCSS('border-width', '1px 0px 0px');
    await expect(pip.locator('#chatframe')).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0.1)');
    await pip.locator('html').evaluate((element) => element.setAttribute('dark', ''));
    await expect(pip.locator('#chatframe')).toHaveCSS('border-top-color', 'rgba(255, 255, 255, 0.2)');
    await expect(pip.locator('video')).toHaveJSProperty('paused', false);
    const time = await pip.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime);
    await expect.poll(() => pip.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime))
      .toBeGreaterThan(time);
    await expect(pip.locator('video')).toHaveJSProperty('controls', false);
    await expect(pip.locator('.ytp-chrome-bottom')).toHaveCSS('background-color', 'rgb(34, 34, 34)');
    await pip.getByRole('button', { name: 'Play / pause' }).click();
    await expect(pip.locator('video')).toHaveJSProperty('paused', true);
    await pip.getByRole('button', { name: 'Play / pause' }).click();
    await expect(pip.locator('video')).toHaveJSProperty('paused', false);
    const stackedVideo = await pip.locator('video').boundingBox();
    const stackedChat = await pip.locator('#chatframe').boundingBox();
    expect(stackedChat!.y).toBeCloseTo(stackedVideo!.height);
    expect(stackedChat!.width).toBe(460);
    await pip.setViewportSize({ width: 900, height: 500 });
    const wideVideo = await pip.locator('video').boundingBox();
    const wideChat = await pip.locator('#chatframe').boundingBox();
    expect(wideChat!.x).toBeCloseTo(wideVideo!.width);
    expect(wideChat!.height).toBe(500);
    const controls = pip.locator('.ytp-chrome-bottom');
    await expect(controls).toBeVisible();
    const controlsBounds = await controls.boundingBox();
    expect(controlsBounds!.x + controlsBounds!.width).toBeLessThanOrEqual(wideVideo!.width);
    await expect(pip.locator('#chatframe')).toHaveCSS('border-width', '0px 0px 0px 1px');
    await expect(pip.locator('#chatframe')).toHaveCSS('border-left-color', 'rgba(255, 255, 255, 0.2)');

    // Short stacked and wide windows must keep the whole composer visible.
    for (const size of [{ width: 460, height: 500 }, { width: 900, height: 300 }]) {
      await pip.setViewportSize(size);
      await expect.poll(() => pipChat.locator('yt-live-chat-message-input-renderer').evaluate(
        (element) => element.getBoundingClientRect().bottom - element.ownerDocument.defaultView!.innerHeight
      )).toBeLessThanOrEqual(1);
    }

    await pip.setViewportSize({ width: 460, height: 640 });
    await expect(page.locator('#movie_player')).toHaveCount(0);
    await expect(page.locator('.ytcq-pip-chat-placeholder')).toContainText('Video and chat are in picture-in-picture');
    await pipChat.locator('#input[contenteditable]').fill('Unsent from PiP');
    await pip.close();
    await expect(chat.locator('.ytcq-inbox-button')).toBeVisible();
    await expect(chat.locator('#input[contenteditable]')).toHaveText('Unsent from PiP');
    await expect(chat.locator('html')).not.toHaveAttribute('data-ytcq-message-density');
    await expect(chat.locator('yt-live-chat-app')).toHaveCSS('border-width', '0px');
    await expect(page.locator('#movie_player video')).toHaveJSProperty('paused', false);
    await expect(page.locator('#movie_player video')).toHaveJSProperty('controls', false);
    await expect(page.locator('.ytcq-pip-placeholder')).toHaveCount(0);

    // Reopening and returning through our action uses the same cleanup path.
    const nextOpened = context.waitForEvent('page');
    await (await openChatEnhancerMenu(chat)).locator('[data-ytcq-action="picture-in-picture"]').click();
    const next = await nextOpened;
    const nextChat = next.frameLocator('#chatframe');
    await expect(nextChat.locator('.ytcq-inbox-button')).toBeVisible();
    const nextMenu = await openChatEnhancerMenu(nextChat);
    const returnAction = nextMenu.locator('[data-ytcq-action="picture-in-picture"]');
    await expect(returnAction).toHaveText('Return to tab');
    await returnAction.click();
    await expect.poll(() => next.isClosed()).toBe(true);
    await expect(chat.locator('.ytcq-inbox-button')).toBeVisible();

    // The user can return before the borrowed chat has finished restoring.
    const quickOpened = context.waitForEvent('page');
    await (await openChatEnhancerMenu(chat)).locator('[data-ytcq-action="picture-in-picture"]').click();
    const quick = await quickOpened;
    await expect(quick.frameLocator('#chatframe').locator('#input[contenteditable]')).toBeVisible();
    await page.locator('.ytcq-pip-video-placeholder button').click();
    await expect.poll(() => quick.isClosed()).toBe(true);
    await expect(chat.locator('#input[contenteditable]')).toHaveText('Unsent from PiP');

    const lastOpened = context.waitForEvent('page');
    await (await openChatEnhancerMenu(chat)).locator('[data-ytcq-action="picture-in-picture"]').click();
    const last = await lastOpened;
    await expect(last.frameLocator('#chatframe').locator('.ytcq-inbox-button')).toBeVisible();
    const lastInput = last.frameLocator('#chatframe').locator('#input[contenteditable]');
    await expect(lastInput).toHaveText('Unsent from PiP');
    await lastInput.fill('');
    await page.evaluate(() => document.dispatchEvent(new Event('yt-navigate-start')));
    await expect.poll(() => last.isClosed()).toBe(true);
    await expect(page.locator('#movie_player video')).toBeVisible();
    await expect(chat.locator('.ytcq-inbox-button')).toBeVisible();
    await expect(chat.locator('#input[contenteditable]')).toHaveText('');
  } finally {
    if (!pip.isClosed()) await pip.close();
  }
};
