"use client";

import { useLiveStore } from "../../_store/useLiveStore";
import VirtualGiftOverlay from "../../_components/VirtualGiftOverlay";

export default function LiveGiftAnimation() {
  const { giftQueue } = useLiveStore();

  const gifts = giftQueue.map((g) => ({
    id: g.id,
    emoji: g.emoji,
    senderName: g.senderName,
  }));

  return <VirtualGiftOverlay gifts={gifts} />;
}
