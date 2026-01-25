import crypto from "crypto";

export function parseInitData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    return { ok: false };
  }
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  return { ok: true, dataCheckString, hash, params };
}

export function verifyInitData(initData, botToken) {
  if (!initData || !botToken) {
    return false;
  }
  const parsed = parseInitData(initData);
  if (!parsed.ok) {
    return false;
  }
  const secret = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const signature = crypto
    .createHmac("sha256", secret)
    .update(parsed.dataCheckString)
    .digest("hex");
  return signature === parsed.hash;
}

export function extractUser(initData) {
  const params = new URLSearchParams(initData);
  const rawUser = params.get("user");
  if (!rawUser) {
    return null;
  }
  try {
    return JSON.parse(rawUser);
  } catch {
    return null;
  }
}
