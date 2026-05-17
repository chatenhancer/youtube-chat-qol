/**
 * Mention sound detection.
 *
 * The signed-in chat handle is read from YouTube's message input author chip
 * and cached once it appears. New incoming messages are checked for explicit
 * @handle mentions while own-authored messages are ignored.
 */
import { getOptions } from '../shared/state';
import {
  initMentionDetection,
  processPotentialMentionForConsumer,
  registerMentionProcessor
} from './mentionDetection';

const MENTION_COOLDOWN_MS = 1400;

let lastMentionSoundAt = 0;
let audioContext: AudioContext | null = null;
let registeredMentionSound = false;

export function initMentionSound(): void {
  initMentionDetection();
  if (registeredMentionSound) return;

  registeredMentionSound = true;
  registerMentionProcessor(handlePotentialMention);
}

export function handlePotentialMention(message: HTMLElement): void {
  if (!getOptions().mentionSound) return;
  processPotentialMentionForConsumer(message, 'ytcqMentionSoundChecked', playMentionBlip);
}

function playMentionBlip(): void {
  const now = Date.now();
  if (now - lastMentionSoundAt < MENTION_COOLDOWN_MS) return;
  lastMentionSoundAt = now;

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
