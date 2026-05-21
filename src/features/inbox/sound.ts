/**
 * Alert sound.
 *
 * Plays the small inbox blip for messages that need attention, such as direct
 * mentions and keyword matches.
 */
import { getOptions } from '../../shared/state';

const SOUND_COOLDOWN_MS = 1400;

let lastSoundAt = 0;
let audioContext: AudioContext | null = null;

export function initSound(): void {
  // Kept as an explicit startup hook next to other feature initializers.
}

export function playAlertSound(): void {
  if (!getOptions().sound) return;

  const now = Date.now();
  if (now - lastSoundAt < SOUND_COOLDOWN_MS) return;
  lastSoundAt = now;

  try {
    const AudioContextConstructor = window.AudioContext || (window as Window & {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;
    if (!AudioContextConstructor) return;

    audioContext ||= new AudioContextConstructor();
    void audioContext.resume();

    const start = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, start);
    oscillator.frequency.exponentialRampToValueAtTime(1320, start + 0.075);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.08, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.2);
  } catch {
    // Browser autoplay and audio-device failures should not affect chat.
  }
}
