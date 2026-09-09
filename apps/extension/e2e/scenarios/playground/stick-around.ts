/** Browser scenarios for Playground Games. */
import { expect } from '@playwright/test';
import {
  createMockPlaygroundSnapshot,
  installMockPlaygroundBackend
} from '../../support/playground-backend';
import { withExtensionStorageValues } from '../../support/extension-storage';
import { appendMockFixtureMessage } from '../../support/mock-page';
import type { BrowserScenario } from '../types';
import { waitForGameAction } from './backend-assertions';
import {
  PLAYGROUND_ENABLED_OPTIONS,
  createBrowserStickAroundGame
} from './game-fixtures';
import {
  invitePlayer,
  openGamePlayerListFromChat,
  openGamesCard
} from './interactions';
import {
  findStickAroundReadyHitboxPoint,
  isChatScrolledToBottom,
  readButtonTreatment,
  readSurfaceTreatment,
  type SurfaceTreatment
} from './visuals';

export const playgroundStickAroundActiveOverlayControlsScenario: BrowserScenario = async ({ chat, context, page }) => {
  const activeGame = createBrowserStickAroundGame({
    gameId: 'active-stick-around-game',
    status: 'active'
  });
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot({
      games: [activeGame]
    })
  });

  await withExtensionStorageValues(context, 'sync', PLAYGROUND_ENABLED_OPTIONS, async () => {
    const card = await openGamesCard(chat, backend);
    const activeRow = card.locator('.ytcq-games-active-row').filter({ hasText: 'Stick Around!' });
    await expect(activeRow).toContainText('Computer (Stick Around!)');

    await activeRow.getByRole('button', { name: 'Resume' }).click();
    await expect(chat.locator('.ytcq-stick-around-overlay')).toBeVisible();
    await expect(chat.locator('.ytcq-games-card')).toHaveCount(0);

    await chat.locator('.ytcq-games-button').click();
    const resumedCard = chat.locator('.ytcq-games-card');
    await expect(resumedCard).toBeVisible();
    const resumedActiveRow = resumedCard.locator('.ytcq-games-active-row').filter({ hasText: 'Stick Around!' });
    const hideButton = resumedActiveRow.getByRole('button', { name: 'Hide' });
    await expect(hideButton).toBeVisible();

    const hideBox = await hideButton.boundingBox();
    if (!hideBox) throw new Error('Expected the active Stick Around Hide button to be visible.');
    await page.mouse.move(hideBox.x + hideBox.width / 2, hideBox.y + hideBox.height / 2);
    await page.mouse.down();
    await backend.sendServerMessage({
      game: createBrowserStickAroundGame({
        gameId: 'active-stick-around-game',
        inputs: {
          'browser-user': {
            jump: true,
            left: false,
            right: false,
            frame: 1,
            seq: 1,
            sentAt: Date.now(),
            userId: 'browser-user'
          }
        },
        status: 'active'
      }),
      type: 'gameUpdated'
    });
    await page.mouse.up();
    await expect(chat.locator('.ytcq-stick-around-overlay')).toHaveCount(0);

    await resumedActiveRow.getByRole('button', { name: 'Resume' }).click();
    await expect(chat.locator('.ytcq-stick-around-overlay')).toBeVisible();
    await expect(chat.locator('.ytcq-games-card')).toHaveCount(0);

    await chat.locator('.ytcq-games-button').click();
    const leaveCard = chat.locator('.ytcq-games-card');
    await expect(leaveCard).toBeVisible();
    const leaveActiveRow = leaveCard.locator('.ytcq-games-active-row').filter({ hasText: 'Stick Around!' });
    await leaveActiveRow.getByRole('button', { name: 'Leave' }).click();
    await expect(chat.locator('.ytcq-stick-around-overlay')).toHaveCount(0);

    const leave = await waitForGameAction(backend, 'leave', (message) =>
      message.gameId === 'active-stick-around-game'
    );
    expect(leave).toMatchObject({
      action: 'leave',
      gameId: 'active-stick-around-game'
    });
  });
};

export const playgroundStickAroundLiteOverlayScenario: BrowserScenario = async ({ chat, context }) => {
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot({
      games: [createBrowserStickAroundGame({
        gameId: 'lite-stick-around-game',
        status: 'active'
      })]
    })
  });

  await withExtensionStorageValues(context, 'sync', {
    ...PLAYGROUND_ENABLED_OPTIONS,
    liteModeEnabled: true
  }, async () => {
    const liteRoot = chat.locator('.ytcq-lite-root');
    await expect(liteRoot).toBeVisible();
    const card = await openGamesCard(chat, backend);
    const activeRow = card.locator('.ytcq-games-active-row').filter({ hasText: 'Stick Around!' });
    await activeRow.getByRole('button', { name: 'Resume' }).click();

    await expect(liteRoot.locator(':scope > .ytcq-stick-around-overlay')).toBeVisible();
    await expect(liteRoot.locator('.ytcq-stick-around-canvas')).toBeVisible();
    await expect(chat.locator('yt-live-chat-item-list-renderer > .ytcq-stick-around-overlay'))
      .toHaveCount(0);
  });
};

export const playgroundStickAroundComputerOverlayScenario: BrowserScenario = async ({ chat, context, page }) => {
  const backend = await installMockPlaygroundBackend(context, {
    snapshot: createMockPlaygroundSnapshot()
  });

  await withExtensionStorageValues(context, 'sync', {
    ...PLAYGROUND_ENABLED_OPTIONS,
    chatSkin: 'aero'
  }, async () => {
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = `
        html,
        body,
        yt-live-chat-item-list-renderer {
          --yt-live-chat-primary-text-color: #0f0f0f;
          --yt-spec-text-primary: #0f0f0f;
          background: #fff !important;
          color: #0f0f0f !important;
        }
      `;
      document.head.append(style);
    });

    for (let index = 0; index < 12; index += 1) {
      await appendMockFixtureMessage(chat, {
        author: `@StickSetup${index}`,
        text: `setup stick around message ${index}`
      });
    }

    const card = await openGamePlayerListFromChat(chat, backend, 'Stick Around!');
    const root = chat.locator('html');
    const aeroSurfaceTreatments = {} as Record<'dark' | 'light', SurfaceTreatment>;
    for (const theme of ['light', 'dark'] as const) {
      await root.evaluate((element, value) => {
        element.setAttribute('data-ytcq-chat-skin-theme', value);
      }, theme);
      aeroSurfaceTreatments[theme] = await readSurfaceTreatment(card);
    }
    await root.evaluate((element) => {
      element.setAttribute('data-ytcq-chat-skin-theme', 'light');
    });
    await invitePlayer(card, 'Computer (Stick Around!)');
    const invite = await backend.waitForClientMessage('invite');
    expect(invite).toMatchObject({
      gameId: 'stick-around',
      toUserId: 'server:computer:stick-around'
    });

    await chat.locator('#item-scroller').evaluate((scroller) => {
      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await backend.sendServerMessage({
      game: createBrowserStickAroundGame(),
      type: 'gameStarted'
    });

    await expect(chat.locator('.ytcq-games-card')).toHaveCount(0);
    const overlay = chat.locator('yt-live-chat-item-list-renderer > .ytcq-stick-around-overlay');
    await expect(overlay).toBeVisible();
    await expect.poll(() => isChatScrolledToBottom(chat)).toBe(true);
    await expect(overlay).toHaveClass(/ytcq-game-overlay-theme-light/);
    await expect(overlay).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.78)');
    const overlayHeader = overlay.locator('.ytcq-game-overlay-header');
    await expect(overlayHeader).toBeVisible();
    for (const theme of ['light', 'dark'] as const) {
      await root.evaluate((element, value) => {
        element.setAttribute('data-ytcq-chat-skin-theme', value);
      }, theme);
      expect(await readSurfaceTreatment(overlayHeader)).toEqual(aeroSurfaceTreatments[theme]);
    }
    await root.evaluate((element) => {
      element.setAttribute('data-ytcq-chat-skin-theme', 'light');
    });
    await expect(overlay.locator('.ytcq-game-overlay-icon')).toBeVisible();
    await expect(overlay.locator('.ytcq-game-overlay-title')).toHaveText('Stick Around!');
    await expect(overlay.locator('.ytcq-game-overlay-subtitle')).toHaveText('Computer (Stick Around!)');
    const soundButton = overlay.getByRole('button', { name: 'Mute game sounds' });
    await expect(soundButton).toBeVisible();
    const hideButton = overlay.getByRole('button', { name: 'Hide' });
    await expect(hideButton).toBeVisible();
    await expect(hideButton).toHaveCSS('color', 'rgb(0, 90, 147)');
    await expect(hideButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await soundButton.hover();
    const soundButtonStyle = await readButtonTreatment(soundButton);
    await hideButton.hover();
    expect(await readButtonTreatment(hideButton)).toEqual(soundButtonStyle);
    expect(soundButtonStyle.color).toBe('rgb(0, 90, 147)');
    expect(soundButtonStyle.backgroundImage).toContain('linear-gradient');
    const canvas = chat.locator('.ytcq-stick-around-canvas');
    await expect(canvas).toBeVisible();
    await expect(overlay.getByRole('button', { name: 'Ready' })).toHaveCount(0);
    const readyPoint = await findStickAroundReadyHitboxPoint(page, overlay, canvas);
    await page.mouse.click(readyPoint.x, readyPoint.y);
    const ready = await waitForGameAction(backend, 'ready', (message) =>
      message.gameId === 'browser-stick-around-game'
    );
    expect(ready).toMatchObject({
      action: 'ready',
      gameId: 'browser-stick-around-game'
    });
    await expect(chat.locator('#item-scroller > .ytcq-stick-around-overlay')).toHaveCount(0);
    await expect(chat.locator('yt-live-chat-header-renderer .ytcq-stick-around-overlay')).toHaveCount(0);
    await expect(chat.locator('#input-panel .ytcq-stick-around-overlay')).toHaveCount(0);
    await chat.locator('#item-scroller').evaluate((scroller) => {
      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await expect.poll(() => isChatScrolledToBottom(chat)).toBe(true);

    const messageMenuButton = chat.locator('yt-live-chat-text-message-renderer #menu button:not(.ytcq-bookmark-toggle)').first();
    const box = await messageMenuButton.boundingBox();
    if (!box) throw new Error('Expected a visible message menu button under the Stick Around overlay.');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(chat.locator('ytd-menu-popup-renderer')).toHaveCount(0);
  });
};
