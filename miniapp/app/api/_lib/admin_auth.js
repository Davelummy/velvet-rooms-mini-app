import { extractUser, verifyInitData } from "./telegram";

export function requireAdmin(initData) {
  const botToken = process.env.ADMIN_BOT_TOKEN || "";
  const adminIds = (process.env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((val) => val.trim())
    .filter(Boolean)
    .map((val) => Number(val));
  if (!verifyInitData(initData, botToken)) {
    return { ok: false, error: "unauthorized" };
  }
  const user = extractUser(initData);
  if (!user || !adminIds.includes(Number(user.id))) {
    return { ok: false, error: "forbidden" };
  }
  return { ok: true, user };
}
