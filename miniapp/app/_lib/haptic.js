function getHapticFeedback() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp?.HapticFeedback ?? null;
}

export const haptic = {
  impact(style = "medium") {
    getHapticFeedback()?.impactOccurred(style);
  },
  notification(type = "success") {
    getHapticFeedback()?.notificationOccurred(type);
  },
  selection() {
    getHapticFeedback()?.selectionChanged();
  },
};
