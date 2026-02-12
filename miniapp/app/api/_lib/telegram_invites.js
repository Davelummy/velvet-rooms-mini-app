import { query } from "./db";
import { checkRateLimit } from "./rate_limit";

let ensured = false;

async function ensureInviteTable() {
  if (ensured) {
    return;
  }
  await query(
    `CREATE TABLE IF NOT EXISTS telegram_invites (
       id BIGSERIAL PRIMARY KEY,
       chat_id TEXT NOT NULL,
       invite_link TEXT NOT NULL,
       expires_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_telegram_invites_chat ON telegram_invites(chat_id)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_telegram_invites_expire ON telegram_invites(expires_at)"
  );
  ensured = true;
}

export async function getCachedInvite(chatId) {
  await ensureInviteTable();
  const res = await query(
    `SELECT invite_link, expires_at
     FROM telegram_invites
     WHERE chat_id = $1
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC
     LIMIT 1`,
    [chatId]
  );
  return res.rowCount ? res.rows[0] : null;
}

export async function storeInvite(chatId, inviteLink, expiresAt) {
  await ensureInviteTable();
  await query(
    `INSERT INTO telegram_invites (chat_id, invite_link, expires_at, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [chatId, inviteLink, expiresAt || null]
  );
}

export async function getOrCreateInviteLink({
  botToken,
  chatId,
  ttlSeconds = 3600,
  rateLimitKey,
}) {
  if (!botToken || !chatId) {
    return { ok: false, error: "missing_bot_or_chat" };
  }
  const cached = await getCachedInvite(chatId);
  if (cached?.invite_link) {
    return { ok: true, invite_link: cached.invite_link };
  }
  const allowed = await checkRateLimit({
    key: rateLimitKey || `invite:${chatId}`,
    limit: 6,
    windowSeconds: 600,
  });
  if (!allowed) {
    return { ok: false, error: "rate_limited" };
  }
  const expireDate = ttlSeconds ? Math.floor(Date.now() / 1000) + ttlSeconds : undefined;
  const payload = {
    chat_id: chatId,
    creates_join_request: false,
  };
  if (expireDate) {
    payload.expire_date = expireDate;
  }
  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/createChatInviteLink`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: "invite_failed", detail: body };
  }
  const data = await res.json();
  const invite = data?.result?.invite_link || null;
  if (!invite) {
    return { ok: false, error: "invite_failed" };
  }
  const expiresAt = data?.result?.expire_date
    ? new Date(data.result.expire_date * 1000).toISOString()
    : null;
  await storeInvite(chatId, invite, expiresAt);
  return { ok: true, invite_link: invite };
}
