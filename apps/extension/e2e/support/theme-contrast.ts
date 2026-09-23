import { expect, type Locator } from '@playwright/test';

/** Check the actual foreground against a background property or a known image color. */
export async function expectThemeContrast(element: Locator, background = 'background-color', minimum = 4.5, pseudoElement?: string): Promise<void> {
  await expect.poll(() => element.evaluate((node, { property, pseudoElement }) => {
    const style = getComputedStyle(node, pseudoElement);
    const context = document.createElement('canvas').getContext('2d')!;
    const luminance = (color: string): number => {
      context.fillStyle = style.getPropertyValue('--ytcq-theme-panels-color');
      context.fillRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b] = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map(value => {
        const channel = value / 255;
        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
      });
      return .2126 * r + .7152 * g + .0722 * b;
    };
    const values = [luminance(style.color), luminance(style.getPropertyValue(property) || property)];
    return (Math.max(...values) + .05) / (Math.min(...values) + .05);
  }, { property: background, pseudoElement })).toBeGreaterThanOrEqual(minimum);
}
