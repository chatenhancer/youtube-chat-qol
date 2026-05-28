import { t } from '../../shared/i18n';
import { openChannelWindow } from '../channel-popup';

export function createAvatarElement(src: string): HTMLImageElement {
  const image = document.createElement('img');
  image.className = 'ytcq-profile-card-avatar';
  image.src = src;
  image.alt = '';
  image.referrerPolicy = 'no-referrer';
  return image;
}

export function createProfileAvatarButton(avatar: HTMLImageElement, profileUrl: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ytcq-profile-card-avatar-button';
  button.title = t('openChannel');
  button.setAttribute('aria-label', t('openChannel'));
  button.append(avatar, createOpenInNewIcon());
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openChannelWindow(profileUrl);
  });
  return button;
}

function createOpenInNewIcon(): SVGSVGElement {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('focusable', 'false');
  icon.setAttribute('aria-hidden', 'true');
  icon.classList.add('ytcq-profile-card-avatar-open-icon');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3ZM5 5h6v2H5v12h12v-6h2v6a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2Z');
  icon.append(path);

  return icon;
}
