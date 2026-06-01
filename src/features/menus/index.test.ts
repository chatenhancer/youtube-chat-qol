import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const menuMocks = vi.hoisted(() => ({
  cleanupStaleMessageMenuSurfaces: vi.fn(),
  enhanceMessageContextMenu: vi.fn(),
  isRecentActiveContextMessage: vi.fn(),
  cleanupStaleSettingsMenuSurfaces: vi.fn(),
  enhanceSettingsMenu: vi.fn(),
  refreshSettingsMenus: vi.fn()
}));

vi.mock('./message-menu', () => ({
  cleanupStaleMessageMenuSurfaces: menuMocks.cleanupStaleMessageMenuSurfaces,
  enhanceMessageContextMenu: menuMocks.enhanceMessageContextMenu,
  isRecentActiveContextMessage: menuMocks.isRecentActiveContextMessage
}));

vi.mock('./settings-menu', () => ({
  cleanupStaleSettingsMenuSurfaces: menuMocks.cleanupStaleSettingsMenuSurfaces,
  enhanceSettingsMenu: menuMocks.enhanceSettingsMenu,
  refreshSettingsMenus: menuMocks.refreshSettingsMenus
}));

import { cleanupStaleMenuSurfaces, enhanceMenu } from './index';

describe('menu router', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.useFakeTimers();
    menuMocks.cleanupStaleMessageMenuSurfaces.mockClear();
    menuMocks.enhanceMessageContextMenu.mockClear();
    menuMocks.isRecentActiveContextMessage.mockReset();
    menuMocks.cleanupStaleSettingsMenuSurfaces.mockClear();
    menuMocks.enhanceSettingsMenu.mockClear();
    menuMocks.refreshSettingsMenus.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('routes chat settings menus to the settings enhancer', async () => {
    const menu = createMenu(`
      <div id="items">
        <yt-live-chat-toggle-renderer></yt-live-chat-toggle-renderer>
      </div>
    `);

    enhanceMenu(menu);
    await vi.runAllTimersAsync();

    expect(menuMocks.enhanceSettingsMenu).toHaveBeenCalledWith(menu);
    expect(menuMocks.enhanceMessageContextMenu).not.toHaveBeenCalled();
  });

  it('routes recent message context menus to the message enhancer', async () => {
    const menu = createMenu(`
      <div id="items">
        <ytd-menu-service-item-renderer></ytd-menu-service-item-renderer>
      </div>
    `);
    menuMocks.isRecentActiveContextMessage.mockReturnValue(true);

    enhanceMenu(menu);
    await vi.runAllTimersAsync();

    expect(menuMocks.enhanceMessageContextMenu).toHaveBeenCalledWith(menu);
    expect(menuMocks.enhanceSettingsMenu).not.toHaveBeenCalled();
  });

  it('ignores non-menu elements and inactive message menus', async () => {
    const menu = createMenu(`
      <div id="items">
        <ytd-menu-service-item-renderer></ytd-menu-service-item-renderer>
      </div>
    `);
    menuMocks.isRecentActiveContextMessage.mockReturnValue(false);

    enhanceMenu(document.createElement('div'));
    enhanceMenu(menu);
    await vi.runAllTimersAsync();

    expect(menuMocks.enhanceMessageContextMenu).not.toHaveBeenCalled();
    expect(menuMocks.enhanceSettingsMenu).not.toHaveBeenCalled();
  });

  it('cleans all routed menu surfaces', () => {
    cleanupStaleMenuSurfaces();

    expect(menuMocks.cleanupStaleMessageMenuSurfaces).toHaveBeenCalledOnce();
    expect(menuMocks.cleanupStaleSettingsMenuSurfaces).toHaveBeenCalledOnce();
  });
});

function createMenu(html: string): HTMLElement {
  const menu = document.createElement('ytd-menu-popup-renderer');
  menu.innerHTML = html;
  return menu;
}
