"use client";

import { useCallback } from "react";

function getHaptic() {
  return typeof window !== "undefined"
    ? window.Telegram?.WebApp?.HapticFeedback
    : null;
}

function safelyRunHaptic(action) {
  try {
    action?.();
  } catch {
    // Some Telegram WebView builds can throw for unsupported haptic calls.
    // Never let UX haptics crash app interactions.
  }
}

export function useHaptic() {
  const impact = useCallback((style = "medium") => {
    safelyRunHaptic(() => getHaptic()?.impactOccurred(style));
  }, []);

  const notification = useCallback((type = "success") => {
    safelyRunHaptic(() => getHaptic()?.notificationOccurred(type));
  }, []);

  const selection = useCallback(() => {
    safelyRunHaptic(() => getHaptic()?.selectionChanged());
  }, []);

  return { impact, notification, selection };
}
