function getHapticFeedback() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp?.HapticFeedback ?? null;
}

function safelyRunHaptic(action) {
  try {
    action?.();
  } catch {
    // Ignore WebView-specific haptic errors; haptics are best-effort only.
  }
}

export const haptic = {
  impact(style = "medium") {
    safelyRunHaptic(() => getHapticFeedback()?.impactOccurred(style));
  },
  notification(type = "success") {
    safelyRunHaptic(() => getHapticFeedback()?.notificationOccurred(type));
  },
  selection() {
    safelyRunHaptic(() => getHapticFeedback()?.selectionChanged());
  },
};
