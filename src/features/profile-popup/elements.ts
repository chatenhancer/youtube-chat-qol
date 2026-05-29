/**
 * Profile card element helpers.
 *
 * Builds avatar and channel-link controls shared by the recent-messages card
 * without mixing SVG details into the card renderer.
 */
import { createOpenInNewIcon } from '../../shared/icons';
import { t } from '../../shared/i18n';
import { ytcqCreateElement } from '../../shared/managed-dom';
import { openChannelWindow } from '../channel-popup';

export function createAvatarElement(src: string): HTMLImageElement {
  const image = ytcqCreateElement('img');
  image.className = 'ytcq-profile-card-avatar';
  image.src = src;
  image.alt = '';
  image.referrerPolicy = 'no-referrer';
  return image;
}

export function createProfileAvatarButton(avatar: HTMLImageElement, profileUrl: string): HTMLButtonElement {
  const button = ytcqCreateElement('button');
  button.type = 'button';
  button.className = 'ytcq-profile-card-avatar-button';
  button.title = t('openChannel');
  button.setAttribute('aria-label', t('openChannel'));
  button.append(avatar, createProfileOpenInNewIcon());
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openChannelWindow(profileUrl);
  });
  return button;
}

function createProfileOpenInNewIcon(): SVGSVGElement {
  const icon = createOpenInNewIcon();
  icon.classList.add('ytcq-profile-card-avatar-open-icon');
  return icon;
}
