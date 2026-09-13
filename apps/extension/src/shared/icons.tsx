/**
 * Small shared SVG factories for extension-owned UI.
 */
import { jsx, el } from './jsx-dom';

export const ICON_VIEW_BOX = '0 0 24 24';
export const MATERIAL_ICON_VIEW_BOX = '0 -960 960 960';

export const ADD_ICON_PATH = 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2Z';
export const AVATAR_RING_ADD_BADGE_PATH = 'M19 5v6 M16 8h6';
export const AVATAR_RING_ACTIVE_BADGE_PATH = 'M16 8l2 2 4-5';
export const BOOKMARK_ICON_PATH = 'M6 21V7a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v14l-6-4Z';
export const LITE_MODE_ICON_PATH = 'M5 19V13A10 10 0 0 1 15 3h6v6a10 10 0 0 1-10 10Z M3 21 15 9';
// Monochrome version of the two chat bubbles and play cutout in assets/icons/icon.svg.
export const CHAT_ENHANCER_ICON_VIEW_BOX = '11 6 37 37';
export const CHAT_ENHANCER_ICON_PATH =
  'M40.18 18.58C44.4 20 47.15 23.55 47.15 28.3C47.15 31.83 45.78 34.64 43.45 36.45C42.94 36.773 42.5065 37.011 42.4385 37.47L42.209 39.34C42.141 39.901 41.5885 40.241 41.053 40.003L37.6105 38.5495C37.0495 38.269 36.4375 38.116 35.8085 38.099C31.53 37.93 28.33 36.77 26.38 34.62C34.74 34.36 40.35 28.96 40.35 21C40.35 20.14 40.3 19.35 40.18 18.58ZM25.5 9.2C32.9 9.2 38.5 13.9 38.5 21C38.5 27.7 33.55 32.55 26.23 32.78C25.49 32.8 24.77 32.98 24.11 33.31L20.06 35.02C19.43 35.3 18.78 34.9 18.7 34.24L18.43 32.04C18.35 31.5 17.84 31.22 17.24 30.84C14.2 28.93 12.5 25.42 12.5 21C12.5 13.9 18.1 9.2 25.5 9.2ZM23.5793 17.595C23.0941 17.3548 22.5247 17.7078 22.5247 18.2493V24.9514C22.5247 25.4929 23.0941 25.8459 23.5793 25.6057L30.3508 22.2551C30.8924 21.987 30.8924 21.2137 30.3508 20.9456L23.5793 17.595Z';
export const CHEVRON_BACKWARD_ICON_PATH = 'M14.5 5 7.5 12l7 7';
export const CLOSE_ICON_PATH = 'M6 6l12 12 M18 6 6 18';
export const EXPAND_ICON_PATH =
  'M9 5H7a2 2 0 0 0-2 2v2 M15 5h2a2 2 0 0 1 2 2v2 M5 15v2a2 2 0 0 0 2 2h2 M19 15v2a2 2 0 0 1-2 2h-2';
export const INBOX_ICON_PATH =
  'M8 6h8c1.3 0 2 .8 2.5 2L21 14v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-3l2.5-6C6 6.8 6.7 6 8 6Z M3 14h4c2 0 2 3 5 3s3-3 5-3h4';
export const INBOX_TEXT_ICON_PATH =
  'M8 6h8c1.3 0 2 .8 2.5 2L21 14v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-3l2.5-6C6 6.8 6.7 6 8 6Z M3 14h4c2 0 2 3 5 3s3-3 5-3h4 M9 10h6 M10 13h4';
export const GAMES_ICON_PATH =
  'm11 6 1.2-2.7a2 2 0 0 1 2.6-1l6 2.7a2 2 0 0 1 1 2.6l-2.7 6a2 2 0 0 1-2.6 1l-.3-.1';
export const JUMP_TO_MESSAGE_ICON_PATH =
  'M7 4h10a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-4l-5 3v-3H7a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Z M7 11h9 m-3-3 3 3-3 3';
export const LOCK_ICON_PATH =
  'M8 10V7a4 4 0 0 1 8 0v3 M7 10h10a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3Z M12 14v3';
export const MENTION_ICON_PATH =
  'M14 11a3 3 0 1 1-6 0a3 3 0 1 1 6 0Z M14 8v6a3 3 0 0 0 6 0v-3a8 8 0 1 0-8 8h2';
export const MORE_VERTICAL_ICON_PATH =
  'M480-160q-33 0-56.5-23.5T400-240q0-33 23.5-56.5T480-320q33 0 56.5 23.5T560-240q0 33-23.5 56.5T480-160Zm0-240q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm0-240q-33 0-56.5-23.5T400-720q0-33 23.5-56.5T480-800q33 0 56.5 23.5T560-720q0 33-23.5 56.5T480-640Z';
export const OPEN_IN_NEW_ICON_PATH =
  'M13 3h7v7 M20 3 10 13 M9 5H7a4 4 0 0 0-4 4v8a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4v-2';
export const MINIMIZE_ICON_PATH =
  'M5 9h2a2 2 0 0 0 2-2V5 M15 5v2a2 2 0 0 0 2 2h2 M5 15h2a2 2 0 0 1 2 2v2 M15 19v-2a2 2 0 0 1 2-2h2';
export const QUOTE_ICON_PATH =
  'M4.5 6.5h4A1.5 1.5 0 0 1 10 8v5c0 3.2-1.8 5.4-5 6.5l-1-2c2.1-.8 3.2-1.9 3.5-3.5h-3A1.5 1.5 0 0 1 3 12.5V8a1.5 1.5 0 0 1 1.5-1.5Z M15.5 6.5h4A1.5 1.5 0 0 1 21 8v5c0 3.2-1.8 5.4-5 6.5l-1-2c2.1-.8 3.2-1.9 3.5-3.5h-3a1.5 1.5 0 0 1-1.5-1.5V8a1.5 1.5 0 0 1 1.5-1.5Z';
export const SOUND_BELL_BODY_ICON_PATH = 'M5 17h14l-2-4V8a5 5 0 0 0-10 0v5Z';
export const SOUND_BELL_CLAPPER_ICON_PATH = 'M10 21h4';
export const SOUND_BELL_RING_ICON_PATH = 'M3 9a9 9 0 0 1 2-5 M21 9a9 9 0 0 0-2-5';
export const SOUND_BELL_ICON_PATH = `${SOUND_BELL_BODY_ICON_PATH}${SOUND_BELL_CLAPPER_ICON_PATH}`;
export const SOUND_RINGING_BELL_ICON_PATH = `${SOUND_BELL_RING_ICON_PATH}${SOUND_BELL_ICON_PATH}`;
export const TV_ICON_PATH =
  'M7 3h10a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z M6 21h12 M10 7l5 3-5 3Z';
export const TRANSLATE_SOURCE_ICON_PATH =
  'M3 6h10 M8 3v3 M11 6a15 15 0 0 1-8 10 M5 10a15 15 0 0 0 6 5';
export const TRANSLATE_TARGET_ICON_PATH = 'M13 21l4-11 4 11 M15 17h4';
export const TRANSLATE_ICON_PATH = `${TRANSLATE_TARGET_ICON_PATH}${TRANSLATE_SOURCE_ICON_PATH}`;
export const VOLUME_OFF_ICON_PATH =
  'M4 9h3l5-4v14l-5-4H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Z M17 10l4 4 M21 10l-4 4';
export const VOLUME_UP_ICON_PATH =
  'M4 9h3l5-4v14l-5-4H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Z M16 9a5 5 0 0 1 0 6 M19 6a9 9 0 0 1 0 12';

export function createSvgIcon(
  viewBox: string,
  pathData: string,
  strokeWidth?: number
): SVGSVGElement {
  return el<SVGSVGElement>(
    <svg viewBox={viewBox} focusable="false" aria-hidden="true">
      {createSvgPath(pathData, '', strokeWidth)}
    </svg>
  );
}

export function createChatEnhancerIcon(): SVGSVGElement {
  return el<SVGSVGElement>(
    <svg viewBox={CHAT_ENHANCER_ICON_VIEW_BOX} focusable="false" aria-hidden="true">
      <path d={CHAT_ENHANCER_ICON_PATH} fill="currentColor" fill-rule="evenodd" />
    </svg>
  );
}

export function createSplitTranslateIcon({
  iconClassName = '',
  sourceClassName = '',
  targetClassName = ''
}: {
  iconClassName?: string;
  sourceClassName?: string;
  targetClassName?: string;
} = {}): SVGSVGElement {
  return el<SVGSVGElement>(
    <svg
      viewBox={ICON_VIEW_BOX}
      focusable="false"
      aria-hidden="true"
      class={iconClassName || undefined}
    >
      {createSvgPath(TRANSLATE_SOURCE_ICON_PATH, sourceClassName, 2)}
      {createSvgPath(TRANSLATE_TARGET_ICON_PATH, targetClassName, 2)}
    </svg>
  );
}

export function createSoundBellIcon(ringing = false): SVGSVGElement {
  return el<SVGSVGElement>(
    <svg viewBox={ICON_VIEW_BOX} focusable="false" aria-hidden="true">
      {ringing ? createSvgPath(SOUND_BELL_RING_ICON_PATH, 'ytcq-bell-ring', 2) : null}
      {createSvgPath(SOUND_BELL_BODY_ICON_PATH, 'ytcq-bell-body', 2)}
      {createSvgPath(SOUND_BELL_CLAPPER_ICON_PATH, 'ytcq-bell-clapper', 2)}
    </svg>
  );
}

export function createAvatarRingIcon(active = false): SVGSVGElement {
  return el<SVGSVGElement>(
    <svg viewBox={ICON_VIEW_BOX} focusable="false" aria-hidden="true" class="ytcq-avatar-ring-icon">
      <circle cx="9" cy="6" r="3" fill="none" stroke="currentColor" stroke-width="2" />
      {createSvgPath('M3 21v-2a6 6 0 0 1 12 0v2', '', 2)}
      {createSvgPath(
        active ? AVATAR_RING_ACTIVE_BADGE_PATH : AVATAR_RING_ADD_BADGE_PATH,
        'ytcq-avatar-ring-icon-badge-symbol',
        2
      )}
    </svg>
  );
}

export function createBookmarkIcon(saved = false): SVGSVGElement {
  const icon = createSvgIcon(ICON_VIEW_BOX, BOOKMARK_ICON_PATH, 2);
  icon.firstElementChild?.setAttribute('fill', saved ? 'currentColor' : 'none');
  return icon;
}

function createSvgPath(pathData: string, className = '', strokeWidth?: number): SVGPathElement {
  return el<SVGPathElement>(
    <path
      d={pathData}
      class={className || undefined}
      fill={strokeWidth ? 'none' : undefined}
      stroke={strokeWidth ? 'currentColor' : undefined}
      stroke-width={strokeWidth}
      stroke-linecap={strokeWidth ? 'round' : undefined}
      stroke-linejoin={strokeWidth ? 'round' : undefined}
    />
  );
}

export function createCloseIcon(): SVGSVGElement {
  return createSvgIcon(ICON_VIEW_BOX, CLOSE_ICON_PATH, 2);
}

export function createExpandIcon(): SVGSVGElement {
  return createSvgIcon(ICON_VIEW_BOX, EXPAND_ICON_PATH, 2);
}

export function createAddIcon(): SVGSVGElement {
  return createSvgIcon(ICON_VIEW_BOX, ADD_ICON_PATH);
}

export function createChannelIcon(): SVGSVGElement {
  return createSvgIcon(ICON_VIEW_BOX, TV_ICON_PATH, 2);
}

export function createLiteModeIcon(): SVGSVGElement {
  return el<SVGSVGElement>(
    <svg viewBox={ICON_VIEW_BOX} focusable="false" aria-hidden="true">
      <g class="lite-mode-wind">
        {['M-11 7H1', 'M-5 15H1.5'].map((path) => (
          <path
            d={path}
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
            pathLength="1"
            stroke-dasharray=".55 1"
            stroke-dashoffset=".55"
            opacity="0"
          />
        ))}
        {['M26 6h2', 'M24 15h2.5'].map((path) => (
          <path
            d={path}
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
            opacity="0"
          />
        ))}
      </g>
      <g class="lite-mode-leaf">{createSvgPath(LITE_MODE_ICON_PATH, '', 2)}</g>
    </svg>
  );
}

export function createChevronBackwardIcon(): SVGSVGElement {
  return createSvgIcon(ICON_VIEW_BOX, CHEVRON_BACKWARD_ICON_PATH, 2);
}

export function createInboxIcon(inboxText = false): SVGSVGElement {
  return createSvgIcon(ICON_VIEW_BOX, inboxText ? INBOX_TEXT_ICON_PATH : INBOX_ICON_PATH, 1.8);
}

export function createGamesIcon(): SVGSVGElement {
  return el<SVGSVGElement>(
    <svg viewBox={ICON_VIEW_BOX} focusable="false" aria-hidden="true">
      {createSvgPath(GAMES_ICON_PATH, '', 1.7)}
      <g transform="rotate(-17 8.2 15.6)">
        <rect
          x="3.2"
          y="10.6"
          width="10"
          height="10"
          rx="2.3"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
        />
        <g fill="currentColor" stroke="none">
          <circle cx="6.3" cy="13.7" r=".85" />
          <circle cx="10.1" cy="17.5" r=".85" />
        </g>
      </g>
      <circle cx="16.5" cy="8.1" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function createJumpToMessageIcon(): SVGSVGElement {
  return createSvgIcon(ICON_VIEW_BOX, JUMP_TO_MESSAGE_ICON_PATH, 2);
}

export function createLockIcon(): SVGSVGElement {
  return createSvgIcon(ICON_VIEW_BOX, LOCK_ICON_PATH, 2);
}

export function createOpenInNewIcon(): SVGSVGElement {
  return createSvgIcon(ICON_VIEW_BOX, OPEN_IN_NEW_ICON_PATH, 2);
}

export function createMinimizeIcon(): SVGSVGElement {
  return createSvgIcon(ICON_VIEW_BOX, MINIMIZE_ICON_PATH, 2);
}

export function createTranslateIcon(): SVGSVGElement {
  return createSvgIcon(ICON_VIEW_BOX, TRANSLATE_ICON_PATH, 2);
}

export function createVolumeOffIcon(): SVGSVGElement {
  return createSvgIcon(ICON_VIEW_BOX, VOLUME_OFF_ICON_PATH, 2);
}

export function createVolumeUpIcon(): SVGSVGElement {
  return createSvgIcon(ICON_VIEW_BOX, VOLUME_UP_ICON_PATH, 2);
}
