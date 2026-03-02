"use client";

import { useCallback } from "react";

function getHaptic() {
  return typeof window !== "undefined"
    ? window.Telegram?.WebApp?.HapticFeedback
    : null;
}

export function useHaptic() {
  const impact = useCallback((style = "medium") => {
    getHaptic()?.impactOccurred(style);
  }, []);

  const notification = useCallback((type = "success") => {
    getHaptic()?.notificationOccurred(type);
  }, []);

  const selection = useCallback(() => {
    getHaptic()?.selectionChanged();
  }, []);

  return { impact, notification, selection };
}
