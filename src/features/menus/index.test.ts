import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bootFeatures,
  handleFeatureMutations,
  resetFeatures
} from '../../content/lifecycle';

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

  it('scans already-open menus during feature boot', async () => {
    const menu = createMenu(`
      <div id="items">
        <yt-live-chat-toggle-renderer></yt-live-chat-toggle-renderer>
      </div>
    `);
    document.body.append(menu);

    bootFeatures();
    await vi.runAllTimersAsync();

    expect(menuMocks.enhanceSettingsMenu).toHaveBeenCalledWith(menu);
  });

  it('refreshes settings menus during feature reset', () => {
    resetFeatures();

    expect(menuMocks.refreshSettingsMenus).toHaveBeenCalledOnce();
  });

  it('routes menus from mutation targets, added popups, containing popups, and descendants', async () => {
    menuMocks.isRecentActiveContextMessage.mockReturnValue(true);
    const targetMenu = createMenu(`
      <div id="items">
        <ytd-menu-service-item-renderer></ytd-menu-service-item-renderer>
      </div>
    `);
    const targetChild = targetMenu.querySelector('#items')!;
    const addedMenu = createMenu(`
      <div id="items">
        <yt-live-chat-toggle-renderer></yt-live-chat-toggle-renderer>
      </div>
    `);
    const containingMenu = createMenu(`
      <div id="items">
        <ytd-menu-navigation-item-renderer></ytd-menu-navigation-item-renderer>
      </div>
    `);
    const containingChild = document.createElement('span');
    containingMenu.append(containingChild);
    const wrapper = document.createElement('div');
    const descendantMenu = createMenu(`
      <div id="items">
        <yt-live-chat-toggle-renderer></yt-live-chat-toggle-renderer>
      </div>
    `);
    wrapper.append(descendantMenu);
    document.body.append(targetMenu, containingMenu);

    handleFeatureMutations({
      addedElements: [addedMenu, containingChild, wrapper],
      changedMessages: [],
      mutations: [{
        target: targetChild,
        type: 'childList'
      } as unknown as MutationRecord]
    });
    await vi.runAllTimersAsync();

    expect(menuMocks.enhanceMessageContextMenu).toHaveBeenCalledWith(targetMenu);
    expect(menuMocks.enhanceSettingsMenu).toHaveBeenCalledWith(addedMenu);
    expect(menuMocks.enhanceSettingsMenu).toHaveBeenCalledWith(descendantMenu);
  });

  it('ignores unrelated mutations and added elements', async () => {
    const unrelated = document.createElement('div');
    const text = document.createTextNode('changed text');
    unrelated.append(text);

    handleFeatureMutations({
      addedElements: [unrelated],
      changedMessages: [],
      mutations: [{
        target: text,
        type: 'characterData'
      } as unknown as MutationRecord]
    });
    await vi.runAllTimersAsync();

    expect(menuMocks.enhanceMessageContextMenu).not.toHaveBeenCalled();
    expect(menuMocks.enhanceSettingsMenu).not.toHaveBeenCalled();
  });
});

function createMenu(html: string): HTMLElement {
  const menu = document.createElement('ytd-menu-popup-renderer');
  menu.innerHTML = html;
  return menu;
}
