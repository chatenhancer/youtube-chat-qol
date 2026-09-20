import { describe, expect, it } from 'vitest';
import { createCustomTheme } from '../shared/custom-themes';
import { createThemeHistory } from './history';

describe('theme edit undo', () => {
  it('undoes a continuous slider gesture in one step and ignores unchanged values', () => {
    const theme = { ...createCustomTheme(), radius: 8 };
    const history = createThemeHistory();
    expect(history.set(theme, 'radius', 8, 'Corner radius')).toBe(false);
    history.set(theme, 'radius', 12, 'Corner radius');
    history.set(theme, 'radius', 18, 'Corner radius');
    history.set(theme, 'radius', 24, 'Corner radius');
    expect(history.undo()).toBe('Corner radius');
    expect(theme.radius).toBe(8);
    expect(history.undo()).toBeUndefined();
  });

  it('undoes separate edits to the same field independently', () => {
    const theme = createCustomTheme();
    const history = createThemeHistory();
    history.set(theme, 'name', 'First name', 'Theme name');
    history.commit();
    history.set(theme, 'name', 'Second name', 'Theme name');
    history.undo();
    expect(theme.name).toBe('First name');
    history.undo();
    expect(theme.name).toBe('');
  });

  it('keeps changes to different areas separate', () => {
    const theme = createCustomTheme();
    const history = createThemeHistory();
    const header = theme.surfaces.header;
    const chat = theme.surfaces.chat;
    history.set(header, 'color', '#123456', 'Header · Background');
    history.set(chat, 'color', '#654321', 'Chat · Background');
    expect(history.undo()).toBe('Chat · Background');
    expect(chat.color).toBe('#ffffff');
    expect(header.color).toBe('#123456');
    history.undo();
    expect(header.color).toBe('#ffffff');
  });

  it('restores a cleared draft and can continue undoing its earlier edits', () => {
    let theme = createCustomTheme();
    const history = createThemeHistory();
    history.set(theme, 'name', 'Ocean', 'Theme name');
    const previous = theme;
    history.record(() => { theme = previous; }, 'Clear new theme');
    theme = createCustomTheme();
    expect(history.undo()).toBe('Clear new theme');
    expect(theme.name).toBe('Ocean');
    history.undo();
    expect(theme.name).toBe('');
  });

  it('starts a fresh undo step after undo and forgets the previous theme when cleared', () => {
    const theme = createCustomTheme();
    const history = createThemeHistory();
    history.set(theme, 'font', 'mono', 'Font');
    history.undo();
    history.set(theme, 'font', 'classic', 'Font');
    history.undo();
    expect(theme.font).toBe('default');
    history.set(theme, 'font', 'playful', 'Font');
    history.clear();
    expect(history.undo()).toBeUndefined();
    expect(theme.font).toBe('playful');
  });
});
