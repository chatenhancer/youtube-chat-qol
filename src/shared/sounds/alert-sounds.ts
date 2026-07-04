/**
 * Shared alert sounds.
 *
 * Uses the extension's single alert sound preference for attention sounds such
 * as mention/keyword alerts and realtime game invites.
 */
import { getOptions } from '../state';
import { playGameInviteChime } from './game-invite-chime';
import { playSoftChime } from './soft-chime';

export type AlertSoundKind = 'gameInvite' | 'message';

const ALERT_COOLDOWN_MS = 1400;
const lastPlayedAt = new Map<AlertSoundKind, number>();

export function playAlertSound(kind: AlertSoundKind): void {
  if (!getOptions().sound) return;

  const now = Date.now();
  const previous = lastPlayedAt.get(kind);
  if (previous !== undefined && now - previous < ALERT_COOLDOWN_MS) return;
  lastPlayedAt.set(kind, now);

  if (kind === 'gameInvite') {
    playGameInviteChime();
    return;
  }

  playSoftChime();
}

export function playAlertSoundPreview(): void {
  playSoftChime();
}
