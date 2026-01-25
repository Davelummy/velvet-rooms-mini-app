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
  }, []);

  return null;
}
