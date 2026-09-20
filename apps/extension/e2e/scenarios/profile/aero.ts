/** Browser scenarios for profile aero behavior. */
import { expect, test, type Locator } from '@playwright/test';
import {
  withExtensionStorageValues,
  setExtensionStorageValues
} from '../../support/extension-storage';
import { centerLocatorInViewport } from '../../support/locator';
import { isMockPageSurface } from '../../support/mock-page';
import { NORMAL_CHAT_MESSAGE_SELECTOR, type BrowserScenario } from '../types';
import {
  closeProfileCard,
  closeProfileCardIfPresent,
  escapeCssString,
  getProfileCardRecord,
  openStableProfileCardFromRecentMessage
} from './card-fixture';

const PROFILE_ACCENT_TEST_AVATAR = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <rect width="64" height="64" fill="#a62fd0"/>
  </svg>
`)}`;

export const profileCardAeroOriginHighlightScenario: BrowserScenario = async ({
  chat,
  context
}) => {
  await withExtensionStorageValues(context, 'sync', { chatSkin: 'custom:aero' }, async () => {
    await test.step('Keep the profile origin message highlighted in Aero', async () => {
      if (!isMockPageSurface(chat)) {
        throw new Error('Aero profile origin styling requires the deterministic mock chat page.');
      }

      const root = chat.locator('html');
      const wasDark = await root.evaluate((element) => element.hasAttribute('dark'));
      try {
        await expect(root).toHaveAttribute('data-ytcq-chat-skin', 'custom');
        const source = await openStableProfileCardFromRecentMessage(chat);
        const originRecord = await getProfileCardRecord(chat, source);
        await expect(originRecord).toHaveClass(/ytcq-profile-card-message-origin/);

        for (const theme of ['light', 'dark'] as const) {
          await root.evaluate((element, value) => {
            element.toggleAttribute('dark', value === 'dark');
          }, theme);
          const avatar = chat.locator('.ytcq-profile-card-avatar-button');
          const ringToggle = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card) .ytcq-avatar-ring-toggle');
          await ringToggle.click();
          await expect(avatar).toHaveCSS('box-shadow', 'none');
          await expect.poll(() => avatar.evaluate(element => {
            const frame = getComputedStyle(element, '::before');
            return frame.content !== 'none' && frame.maskImage.startsWith('url(') && frame.backgroundImage.includes('gradient(');
          })).toBe(true);
          await ringToggle.click();
          await expect.poll(() => avatar.evaluate(element => {
            const frame = getComputedStyle(element, '::before');
            return { width: frame.width, height: frame.height, backgroundSize: frame.backgroundSize };
          })).toEqual({ width: '50px', height: '50px', backgroundSize: '50px 50px' });
          await test.info().attach(`aero-profile-${theme}`, {
            body: await chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)').screenshot(),
            contentType: 'image/png'
          });
          await expect(
            originRecord,
            `Expected an Aero ${theme} origin-message highlight.`
          ).toHaveCSS('box-shadow', /inset/);
          await originRecord.hover();
          for (const selector of ['.ytcq-bookmark-toggle', '.ytcq-profile-card-jump']) {
            const action = originRecord.locator(selector);
            await expect(action).toHaveCSS('background-image', 'none');
            await expect(action).toHaveCSS('border-radius', '50%');
            await action.hover();
            await expect.poll(() => action.evaluate(element => getComputedStyle(element, '::before').backgroundColor)).toBe('rgba(62, 166, 255, 0.18)');
          }
        }
      } finally {
        await closeProfileCardIfPresent(chat);
        await root.evaluate((element, dark) => element.toggleAttribute('dark', dark), wasDark);
      }
    });
  });
};

export const profileCardAvatarAccentScenario: BrowserScenario = async ({ chat, context }) => {
  await withExtensionStorageValues(context, 'sync', { chatSkin: 'system' }, async () => {
    await test.step('Tint the profile card and reflect its avatar color through the Glass finish', async () => {
      if (!isMockPageSurface(chat)) {
        throw new Error('Avatar-derived profile accents require the deterministic mock chat page.');
      }

      const root = chat.locator('html');
      const wasDark = await root.evaluate((element) => element.hasAttribute('dark'));
      try {
        await expect(root).not.toHaveAttribute('data-ytcq-chat-skin');
        const sourceMessageId = await chat
          .locator(NORMAL_CHAT_MESSAGE_SELECTOR)
          .last()
          .getAttribute('id');
        expect(sourceMessageId).not.toBeNull();
        const source = chat.locator(
          `${NORMAL_CHAT_MESSAGE_SELECTOR}[id="${escapeCssString(sourceMessageId || '')}"]`
        );
        await centerLocatorInViewport(source);
        await source
          .locator('#author-photo img, #author-photo #img, img#img')
          .first()
          .evaluate((image, src) => {
            (image as HTMLImageElement).src = src;
          }, PROFILE_ACCENT_TEST_AVATAR);
        await source.locator('#author-photo').click();

        const card = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');
        await expect(card).toHaveClass(/ytcq-profile-card-has-avatar-accent/);
        await expect(card).toHaveCSS('--ytcq-profile-avatar-accent', /hsl\(/);
        const cornerGeometry = await card.evaluate((element) => {
          const avatar = element.querySelector<HTMLElement>('.ytcq-profile-card-avatar-tint');
          if (!avatar) return null;
          const panelRect = element.getBoundingClientRect();
          const avatarRect = avatar.getBoundingClientRect();
          const panelStyle = getComputedStyle(element);
          const surfaceStyle = getComputedStyle(element, '::before');
          return {
            avatarBleedsPastPanel: {
              bottom: avatarRect.bottom > panelRect.bottom,
              left: avatarRect.left < panelRect.left,
              right: avatarRect.right > panelRect.right,
              top: avatarRect.top < panelRect.top
            },
            panelCornerShape: panelStyle.getPropertyValue('corner-shape'),
            panelRadius: panelStyle.borderRadius,
            surfaceCornerShape: surfaceStyle.getPropertyValue('corner-shape'),
            surfaceRadius: surfaceStyle.borderRadius
          };
        });
        expect(cornerGeometry).not.toBeNull();
        expect(cornerGeometry!.avatarBleedsPastPanel).toEqual({
          bottom: true,
          left: true,
          right: true,
          top: true
        });
        expect(cornerGeometry!.surfaceRadius).toBe(cornerGeometry!.panelRadius);
        expect(cornerGeometry!.surfaceCornerShape).toBe(cornerGeometry!.panelCornerShape);
        await expectProfileAvatarAccentReveal(card);
        const firstAvatarSrc = await card
          .locator('.ytcq-profile-card-avatar-tint')
          .getAttribute('src');

        await closeProfileCard(chat);
        const cachedReopen = await source.locator('#author-photo').evaluate((element) => {
          (element as HTMLElement).click();
          const reopenedCard = element.ownerDocument.querySelector<HTMLElement>(
            '.ytcq-profile-card:not(.ytcq-inbox-card)'
          );
          if (!reopenedCard) return null;

          return {
            hasAccent: reopenedCard.classList.contains('ytcq-profile-card-has-avatar-accent'),
            sourceAvatarSrc: element.querySelector<HTMLImageElement>('img#img, img')?.src || '',
            tintAvatarSrc:
              reopenedCard.querySelector<HTMLImageElement>('.ytcq-profile-card-avatar-tint')?.src ||
              '',
            surfaceOpacity: Number(getComputedStyle(reopenedCard, '::before').opacity)
          };
        });
        expect(cachedReopen).toEqual({
          hasAccent: true,
          sourceAvatarSrc: firstAvatarSrc,
          tintAvatarSrc: firstAvatarSrc,
          surfaceOpacity: 1
        });
        await expect(card).toBeVisible();

        await setExtensionStorageValues(context, 'sync', { chatSkin: 'custom:aero' });
        await root.evaluate((element) => element.removeAttribute('dark'));
        await expect(root).toHaveAttribute('data-ytcq-theme-finish', 'glass');
        await expect(card).toHaveCSS('--ytcq-profile-avatar-accent', /hsl\(/);
        await expect(card.locator('.ytcq-profile-card-author')).toHaveCSS(
          'color',
          'rgb(0, 90, 147)'
        );
        const aeroReflection = await card.evaluate((element) => {
          const cardStyle = getComputedStyle(element);
          const surfaceStyle = getComputedStyle(element, '::before');
          return {
            backgroundImage: surfaceStyle.backgroundImage,
            boxShadow: surfaceStyle.boxShadow,
            reflection: cardStyle.getPropertyValue('--ytcq-profile-glass-avatar-reflection').trim()
          };
        });
        expect(aeroReflection.reflection).not.toBe('');
        expect(aeroReflection.backgroundImage).not.toBe('none');
        expect(aeroReflection.boxShadow).not.toBe('none');
        await expectProfileAvatarAccentReveal(card);

        await root.evaluate((element) => {
          element.setAttribute('dark', '');
        });
        const darkPalette = await card.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            active: style.getPropertyValue('--ytcq-profile-avatar-accent').trim(),
            dark: style.getPropertyValue('--ytcq-profile-avatar-accent-dark').trim()
          };
        });
        expect(darkPalette.active).toBe(darkPalette.dark);
      } finally {
        await closeProfileCardIfPresent(chat);
        await root.evaluate((element, dark) => element.toggleAttribute('dark', dark), wasDark);
      }
    });
  });
};

async function expectProfileAvatarAccentReveal(card: Locator): Promise<void> {
  await card.evaluate((element) => {
    element.classList.remove('ytcq-profile-card-has-avatar-accent');
  });
  await expect
    .poll(() => card.evaluate((element) => Number(getComputedStyle(element, '::before').opacity)))
    .toBe(0);
  const reveal = await card.evaluate((element) => {
    element.classList.add('ytcq-profile-card-has-avatar-accent');
    const style = getComputedStyle(element, '::before');
    return {
      transitionDuration: style.transitionDuration,
      transitioningOpacity: Number(style.opacity)
    };
  });
  expect(reveal.transitionDuration).toBe('0.18s');
  expect(reveal.transitioningOpacity).toBeLessThan(1);
  await expect
    .poll(() => card.evaluate((element) => Number(getComputedStyle(element, '::before').opacity)))
    .toBe(1);
}
