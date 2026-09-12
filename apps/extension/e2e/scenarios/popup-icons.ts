/** Regression coverage for SVG motion at the popup's real icon size. */
import { expect } from '@playwright/test';
import { getExtensionId } from '../support/extension';
import { withExtensionStorageValues } from '../support/extension-storage';
import type { ExtensionScenario } from './types';

export const popupIconAnimationScenario: ExtensionScenario = async ({ context }) => {
  await withExtensionStorageValues(context, 'sync', { sound: false }, async () => {
    const extensionId = await getExtensionId(context);
    const popup = await context.newPage();
    try {
      await popup.emulateMedia({ reducedMotion: 'no-preference' });
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      await popup.locator('#sound').check();
      const bell = popup.locator('.sound-icon');

      const motion = await bell.evaluate((element) => {
        const clapper = element.querySelector('.ytcq-bell-clapper')!;
        const animations = element.getAnimations({ subtree: true });
        animations.forEach((animation) => animation.pause());
        const frames = Array.from({ length: 41 }, (_, index) => {
          animations.forEach((animation) => {
            animation.currentTime = Number(animation.effect!.getTiming().duration) * index / 40;
          });
          const iconBounds = element.getBoundingClientRect();
          const clapperBounds = clapper.getBoundingClientRect();
          return {
            left: (clapperBounds.left - iconBounds.left) / iconBounds.width,
            right: (clapperBounds.right - iconBounds.left) / iconBounds.width,
            center: (clapperBounds.left + clapperBounds.width / 2 - iconBounds.left)
              / iconBounds.width
          };
        });
        return { animationCount: animations.length, frames };
      });

      expect(motion.animationCount).toBeGreaterThanOrEqual(2);
      for (const frame of motion.frames) {
        // The clapper must remain under the bell, never fly outside its icon.
        expect(frame.left).toBeGreaterThanOrEqual(0);
        expect(frame.right).toBeLessThanOrEqual(1);
      }
      const centers = motion.frames.map((frame) => frame.center);
      const travel = Math.max(...centers) - Math.min(...centers);
      expect(travel).toBeGreaterThan(0.02);
      expect(travel).toBeLessThan(0.35);
      expect(centers.at(-1)).toBeCloseTo(centers[0], 3);

      await expect(bell).not.toHaveClass(/ytcq-bell-ringing/);
      await popup.emulateMedia({ reducedMotion: 'reduce' });
      await popup.locator('#sound').uncheck();
      await expect(bell).not.toHaveClass(/ytcq-bell-ringing/);
      await expect(bell).toHaveCSS('animation-name', 'none');
      await expect(bell.locator('.ytcq-bell-clapper')).toHaveCSS('animation-name', 'none');
    } finally {
      await popup.close();
    }
  });
};
