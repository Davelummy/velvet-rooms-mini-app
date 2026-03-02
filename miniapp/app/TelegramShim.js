"use client";

import { useEffect } from "react";

export default function TelegramShim() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!window.TelegramGameProxy) {
      window.TelegramGameProxy = {
        receiveEvent: () => {},
      };
    }
    if (!window.Telegram) {
      window.Telegram = {};
    }
    // Stub HapticFeedback for development (no-ops when not in Telegram)
    if (!window.Telegram.WebApp) {
      window.Telegram.WebApp = {
        initData: "",
        initDataUnsafe: {},
        ready: () => {},
        expand: () => {},
        close: () => {},
        showAlert: (msg) => window.alert(msg),
        showConfirm: (msg, cb) => cb(window.confirm(msg)),
        openLink: (url) => window.open(url, "_blank"),
        HapticFeedback: {
          impactOccurred: () => {},
          notificationOccurred: () => {},
          selectionChanged: () => {},
        },
        MainButton: {
          show: () => {},
          hide: () => {},
          setText: () => {},
          onClick: () => {},
          offClick: () => {},
          enable: () => {},
          disable: () => {},
        },
        BackButton: {
          show: () => {},
          hide: () => {},
          onClick: () => {},
          offClick: () => {},
        },
        themeParams: {},
      };
    } else if (!window.Telegram.WebApp.HapticFeedback) {
      // WebApp exists but HapticFeedback not present (older client)
      window.Telegram.WebApp.HapticFeedback = {
        impactOccurred: () => {},
        notificationOccurred: () => {},
        selectionChanged: () => {},
      };
    }

    // Apply saved theme on load
    const savedTheme = localStorage.getItem("vr_theme");
    if (savedTheme === "light") {
      document.body.classList.add("theme-light");
    }

    // Call ready
    window.Telegram.WebApp.ready?.();
    window.Telegram.WebApp.expand?.();
  }, []);

  return null;
}
