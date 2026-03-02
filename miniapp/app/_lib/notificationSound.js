// Web Audio API notification sounds — no external dependency
// All sounds are gated by the user's sound_enabled preference.

let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx && typeof window !== "undefined") {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playTone(frequency, duration = 0.15, gain = 0.18) {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);

    gainNode.gain.setValueAtTime(gain, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Silently fail if audio isn't available (e.g. autoplay policy)
  }
}

/**
 * 440 Hz — general notification sound
 * Call when any new non-payment notification arrives.
 */
export function playNotificationSound() {
  playTone(440, 0.15);
}

/**
 * 880 Hz + 660 Hz two-tone — payment / tip / gift received
 * Call when a payment-related notification arrives.
 */
export function playPaymentSound() {
  playTone(880, 0.12);
  setTimeout(() => playTone(660, 0.18), 120);
}

const PAYMENT_TYPES = new Set([
  "payment_received",
  "tip_received",
  "gift_received",
  "escrow_released",
  "payout_processed",
  "session_payment",
]);

/**
 * Pick the right sound based on notification type and play it.
 * Automatically no-ops if soundEnabled is false.
 */
export function playNotificationSoundForType(type, soundEnabled = true) {
  if (!soundEnabled) return;
  if (PAYMENT_TYPES.has(type)) {
    playPaymentSound();
  } else {
    playNotificationSound();
  }
}
