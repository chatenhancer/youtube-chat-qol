import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bootFeatures,
  handleFeatureMutations,
  resetFeatures
} from '../../content/dispatcher';

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

  it('clears stale native width caps from live chat menus even when no enhancer is routed', async () => {
    const menu = createMenu(`
      <div id="items">
        <ytd-menu-service-item-renderer></ytd-menu-service-item-renderer>
        <ytd-menu-navigation-item-renderer></ytd-menu-navigation-item-renderer>
      </div>
    `);
    menu.className = 'style-scope yt-live-chat-app';
    menu.style.width = '65.5625px';
    menu.style.minWidth = '65.5625px';
    menu.style.maxWidth = '65.5625px';
    menuMocks.isRecentActiveContextMessage.mockReturnValue(false);

    enhanceMenu(menu);
    await vi.runAllTimersAsync();

    expect(menu.classList.contains('ytcq-live-chat-menu-size-repaired')).toBe(true);
    expect(menu.style.width).toBe('');
    expect(menu.style.minWidth).toBe('');
    expect(menu.style.maxWidth).toBe('');
    expect(menuMocks.enhanceMessageContextMenu).not.toHaveBeenCalled();
    expect(menuMocks.enhanceSettingsMenu).not.toHaveBeenCalled();
  });

  it('shifts repaired live chat menus left when YouTube anchors them past the chat edge', async () => {
    const app = document.createElement('yt-live-chat-app');
    const dropdown = document.createElement('tp-yt-iron-dropdown');
    const menu = createMenu(`
      <div id="items">
        <ytd-menu-service-item-renderer></ytd-menu-service-item-renderer>
        <ytd-menu-navigation-item-renderer></ytd-menu-navigation-item-renderer>
      </div>
    `);
    dropdown.style.position = 'fixed';
    dropdown.style.left = '320px';
    dropdown.append(menu);
    app.append(dropdown);
    document.body.append(app);
    app.getBoundingClientRect = () => rect({ left: 0, right: 400, width: 400 });
    dropdown.getBoundingClientRect = () => rect({
      height: 168,
      left: 320,
      right: 452,
      width: 132
    });
    menu.getBoundingClientRect = () => rect({
      height: 168,
      left: 320,
      right: 452,
      width: 132
    });
    menuMocks.isRecentActiveContextMessage.mockReturnValue(false);

    enhanceMenu(menu);
    await vi.runAllTimersAsync();

    expect(menu.classList.contains('ytcq-live-chat-menu-size-repaired')).toBe(true);
    expect(dropdown.style.left).toBe('260px');
    expect(dropdown.style.right).toBe('auto');
    expect(menuMocks.enhanceMessageContextMenu).not.toHaveBeenCalled();
    expect(menuMocks.enhanceSettingsMenu).not.toHaveBeenCalled();
  });

  it('leaves unrelated menu popup width caps alone', async () => {
    const menu = createMenu(`
      <div id="items">
        <ytd-menu-service-item-renderer></ytd-menu-service-item-renderer>
      </div>
    `);
    menu.style.maxWidth = '65.5625px';
    menuMocks.isRecentActiveContextMessage.mockReturnValue(false);

    enhanceMenu(menu);
    await vi.runAllTimersAsync();

    expect(menu.classList.contains('ytcq-live-chat-menu-size-repaired')).toBe(false);
    expect(menu.style.maxWidth).toBe('65.5625px');
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

function rect(overrides: Partial<DOMRect> = {}): DOMRect {
  return {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...overrides
  } as DOMRect;
}
