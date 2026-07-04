/**
 * Alert sound.
 *
 * Plays the alert sound for messages that need attention, such as direct
 * mentions and keyword matches.
 */
import { playAlertSound as playSharedAlertSound } from '../../shared/sounds/alert-sounds';

export function playAlertSound(): void {
  playSharedAlertSound('message');
}
