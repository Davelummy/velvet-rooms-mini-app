"use client";

import { useEffect, useCallback } from "react";

function getWebApp() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

export function useTelegram() {
  const webApp = typeof window !== "undefined" ? window.Telegram?.WebApp : null;

  const haptic = {
    impact: useCallback((style = "medium") => {
      getWebApp()?.HapticFeedback?.impactOccurred(style);
    }, []),
    notification: useCallback((type = "success") => {
      getWebApp()?.HapticFeedback?.notificationOccurred(type);
    }, []),
    selection: useCallback(() => {
      getWebApp()?.HapticFeedback?.selectionChanged();
    }, []),
  };

  const close = useCallback(() => {
    getWebApp()?.close();
  }, []);

  const expand = useCallback(() => {
    getWebApp()?.expand();
  }, []);

  const showAlert = useCallback((message) => {
    getWebApp()?.showAlert(message);
  }, []);

  const showConfirm = useCallback((message, callback) => {
    getWebApp()?.showConfirm(message, callback);
  }, []);

  const openLink = useCallback((url) => {
    getWebApp()?.openLink(url);
  }, []);

  const initData = typeof window !== "undefined" ? window.Telegram?.WebApp?.initData : "";

  const user = typeof window !== "undefined"
    ? window.Telegram?.WebApp?.initDataUnsafe?.user
    : null;

  return {
    webApp,
    initData,
    user,
    haptic,
    close,
    expand,
    showAlert,
    showConfirm,
    openLink,
  };
}
