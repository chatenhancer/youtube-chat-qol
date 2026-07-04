/**
 * Two-tone invite chime.
 *
 * Creates a short ascending sound for realtime game invitations.
 */
let audioContext: AudioContext | null = null;

export function playGameInviteChime(): void {
  try {
    const AudioContextConstructor = window.AudioContext || (window as Window & {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;
    if (!AudioContextConstructor) return;

    audioContext ||= new AudioContextConstructor();
    void audioContext.resume();

    const start = audioContext.currentTime;
    playTone(audioContext, {
      durationSeconds: 0.11,
      frequency: 660,
      start
    });
    playTone(audioContext, {
      durationSeconds: 0.15,
      frequency: 990,
      start: start + 0.105
    });
  } catch {
    // Browser autoplay and audio-device failures should not affect chat.
  }
}

function playTone(
  context: AudioContext,
  options: {
    durationSeconds: number;
    frequency: number;
    start: number;
  }
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const end = options.start + options.durationSeconds;

  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(options.frequency, options.start);

  gain.gain.setValueAtTime(0.0001, options.start);
  gain.gain.exponentialRampToValueAtTime(0.13, options.start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(options.start);
  oscillator.stop(end + 0.012);
  oscillator.addEventListener('ended', () => {
    oscillator.disconnect();
    gain.disconnect();
  }, { once: true });
}
