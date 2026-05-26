/**
 * Alert sound.
 *
 * Plays the small inbox blip for messages that need attention, such as direct
 * mentions and keyword matches.
 */
import { playSoftChime } from '../../shared/sounds/soft-chime';
import { getOptions } from '../../shared/state';

const ALERT_COOLDOWN_MS = 1400;

let lastSoundAt = 0;

export function initSound(): void {
  // Kept as an explicit startup hook next to other feature initializers.
}

export function playAlertSound(): void {
  if (!getOptions().sound) return;

  const now = Date.now();
  if (now - lastSoundAt < ALERT_COOLDOWN_MS) return;
  lastSoundAt = now;

  playSoftChime();
}
