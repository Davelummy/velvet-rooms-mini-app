export const sessionPricing = {
  chat: { 5: 2000, 10: 3500, 20: 6500, 30: 9000 },
  voice: { 5: 2000, 10: 3500, 20: 6500, 30: 9000 },
  video: { 5: 5000, 10: 9000, 20: 16000, 30: 22000 },
  quick_chat: { 2: 800, 3: 1200 },
};

export const SESSION_TYPES = ["quick_chat", "chat", "voice", "video"];

export const SESSION_TYPE_LABELS = {
  quick_chat: "Quick Chat",
  chat: "Text Chat",
  voice: "Voice",
  video: "Video",
};

export const SESSION_DURATIONS = {
  quick_chat: [2, 3],
  chat: [5, 10, 20, 30],
  voice: [5, 10, 20, 30],
  video: [5, 10, 20, 30],
};

export function getSessionPrice(type, durationMinutes) {
  const typeMap = sessionPricing[type];
  if (!typeMap) return null;
  return typeMap[durationMinutes] ?? null;
}

export const PLATFORM_FEE_PCT = 0.15; // 15%

export function calculatePlatformFee(amount) {
  return Math.round(amount * PLATFORM_FEE_PCT);
}

export function calculateNetAmount(amount) {
  return amount - calculatePlatformFee(amount);
}

export const TIP_PRESETS = [200, 500, 1000];

export const EXTENSION_PRICING = {
  chat: { 5: 2000, 10: 3500 },
  voice: { 5: 2000, 10: 3500 },
  video: { 5: 5000, 10: 9000 },
};
