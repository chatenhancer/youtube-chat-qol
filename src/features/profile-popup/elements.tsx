/**
 * Profile card element helpers.
 *
 * Builds avatar and channel-link controls shared by the recent-messages card
 * without mixing SVG details into the card renderer.
 */
import { createOpenInNewIcon } from '../../shared/icons';
import { t } from '../../shared/i18n';
import { jsx, el } from '../../shared/jsx-dom';
import { openChannelWindow } from '../channel-popup';

export function createAvatarElement(src: string): HTMLImageElement {
  return el<HTMLImageElement>(
    <img class="ytcq-profile-card-avatar" src={src} alt="" referrerPolicy="no-referrer" />
  );
}

export function createProfileAvatarButton(
  avatar: HTMLImageElement,
  profileUrl: string
): HTMLButtonElement {
  const button = el<HTMLButtonElement>(
    <button
      type="button"
      class="ytcq-profile-card-avatar-button"
      title={t('openChannel')}
      aria-label={t('openChannel')}
      onClick={(event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        openChannelWindow(profileUrl);
      }}
    >
      {avatar}
      {createProfileOpenInNewIcon()}
    </button>
  );
  return button;
}

function createProfileOpenInNewIcon(): SVGSVGElement {
  const icon = createOpenInNewIcon();
  icon.classList.add('ytcq-profile-card-avatar-open-icon');
  return icon;
}
