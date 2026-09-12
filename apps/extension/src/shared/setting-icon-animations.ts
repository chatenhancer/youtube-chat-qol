import { prefersReducedMotion } from './motion';

export interface SettingIconAnimation {
  className: string;
  durationMs: number;
}

export const SETTING_ICON_ANIMATIONS = {
  bell: {
    className: 'ytcq-bell-ringing',
    durationMs: 700
  },
  chatSkin: {
    className: 'ytcq-palette-pop',
    durationMs: 1200
  },
  gameInvites: {
    className: 'ytcq-game-controller-hop',
    durationMs: 850
  },
  liteMode: {
    className: 'ytcq-bolt-redraw',
    durationMs: 1000
  },
  messageDensity: {
    className: 'ytcq-density-compress',
    durationMs: 700
  },
  startupEffect: {
    className: 'ytcq-sparkle-burst',
    durationMs: 1000
  },
  translation: {
    className: 'ytcq-translation-pulse',
    durationMs: 900
  },
  translationDisplay: {
    className: 'ytcq-display-reflow',
    durationMs: 900
  }
} as const satisfies Record<string, SettingIconAnimation>;

export function animateSettingIcon(
  icon: Element | null,
  { className, durationMs }: SettingIconAnimation
): void {
  if (!icon || prefersReducedMotion() || icon.classList.contains(className)) return;

  icon.classList.add(className);
  window.setTimeout(() => {
    icon.classList.remove(className);
  }, durationMs);
}
