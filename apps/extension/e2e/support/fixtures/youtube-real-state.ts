/** Per-test cleanup for worker-scoped real YouTube sessions. */
import type { FrameLocator, Locator } from '@playwright/test';
import { clearChatComposerIfVisible } from '../composer';
import { resumeLiveChat, waitForYouTubeContentVideo } from '../youtube-page';
import type { RealYouTubeSession } from './browser-session';

const CHAT_MENU_POPUP_SELECTOR = 'ytd-menu-popup-renderer';

export async function resetRealYouTubeScenarioState(session: RealYouTubeSession): Promise<void> {
  // Fresh profiles open onboarding, and prior scenarios can open a channel.
  // Activate this worker's watch tab before interacting with YouTube's UI.
  await session.page.bringToFront();
  // Reused live workers can encounter a pre-roll or mid-roll between tests,
  // temporarily replacing the chat frame with the ad player.
  await waitForYouTubeContentVideo(session.page);
  await session.page
    .evaluate(() => {
      window.scrollTo(0, 0);
    })
    .catch(() => undefined);
  await closeChatNativeMenus(session.chat);
  await closeTransientSurfaces(session.chat);
  await clearChatComposerIfVisible(session.chat).catch(() => undefined);
  await closeChatNativeMenus(session.chat);
}

export async function restoreRealYouTubeChatLiveEdge(
  session: RealYouTubeSession
): Promise<void> {
  await resumeLiveChat(session.page);
}

async function closeChatNativeMenus(chat: FrameLocator): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const menu = await findOpenChatNativeMenu(chat);
    if (!menu) return;
    await menu.press('Escape').catch(() => undefined);
    await chat
      .locator('body')
      .press('Escape')
      .catch(() => undefined);
    await menu.waitFor({ state: 'hidden', timeout: 500 }).catch(() => undefined);
  }
}

async function findOpenChatNativeMenu(chat: FrameLocator): Promise<Locator | null> {
  const menus = chat.locator(CHAT_MENU_POPUP_SELECTOR);
  const count = await menus.count();

  for (let index = count - 1; index >= 0; index -= 1) {
    const menu = menus.nth(index);
    const box = await menu.boundingBox().catch(() => null);
    if (box && box.width > 0 && box.height > 0 && (await menu.isVisible().catch(() => false))) {
      return menu;
    }
  }

  return null;
}

async function closeTransientSurfaces(chat: FrameLocator): Promise<void> {
  await chat
    .locator(
      ['.ytcq-focus-card', '.ytcq-inbox-card', '.ytcq-profile-card:not(.ytcq-inbox-card)'].join(',')
    )
    .evaluateAll((elements) => {
      for (const element of elements) {
        element.remove();
      }
    })
    .catch(() => undefined);

  await chat
    .locator('.ytcq-composer-translate-panel')
    .evaluateAll((panels) => {
      for (const panel of panels) {
        if (panel instanceof HTMLElement) panel.hidden = true;
      }
    })
    .catch(() => undefined);
}
