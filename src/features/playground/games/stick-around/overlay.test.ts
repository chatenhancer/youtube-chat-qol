import { afterEach, describe, expect, it } from 'vitest';
import { getStickAroundThemeFighterColor } from './overlay';

describe('Stick Around overlay', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('dark');
    document.documentElement.removeAttribute('light');
    document.body.replaceChildren();
  });

  it('uses white fighters when the chat theme text is light', () => {
    const darkSurface = document.createElement('div');
    darkSurface.style.color = 'rgb(241, 241, 241)';
    document.body.append(darkSurface);

    expect(getStickAroundThemeFighterColor(darkSurface)).toBe('#ffffff');
  });

  it('uses black fighters when the chat theme text is dark', () => {
    const lightSurface = document.createElement('div');
    lightSurface.style.color = 'rgb(15, 15, 15)';
    document.body.append(lightSurface);

    expect(getStickAroundThemeFighterColor(lightSurface)).toBe('#111111');
  });

  it('uses the explicit YouTube dark document theme before sampled colors', () => {
    document.documentElement.setAttribute('dark', '');
    const surface = document.createElement('div');
    surface.style.color = 'rgb(15, 15, 15)';
    document.body.append(surface);

    expect(getStickAroundThemeFighterColor(surface)).toBe('#ffffff');
  });
});
