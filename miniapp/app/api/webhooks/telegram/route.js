import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { ensureClientProfileColumns } from "../../_lib/clients";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";

function normalizeChannelId(rawId) {
  if (!rawId) {
    return null;
  }
  const asString = String(rawId);
  if (asString.startsWith("-")) {
    return asString;
  }
  if (asString.startsWith("100")) {
    return `-${asString}`;
  }
  return `-100${asString}`;
}

const GALLERY_CHAT_ID = normalizeChannelId(process.env.MAIN_GALLERY_CHANNEL_ID || "");

async function sendTelegram(method, payload) {
  if (!BOT_TOKEN) {
    return { ok: false };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data || { ok: false };
  } catch {
    return { ok: false };
  }
}

async function ensureAccess(userId) {
  await ensureClientProfileColumns();
  const profileRes = await query(
    "SELECT id, access_fee_paid FROM client_profiles WHERE user_id = $1",
    [userId]
  );
  if (profileRes.rowCount && profileRes.rows[0].access_fee_paid) {
    return true;
  }
  const accessTxRes = await query(
    `SELECT id FROM transactions
     WHERE user_id = $1
       AND status = 'completed'
       AND metadata_json->>'escrow_type' IN ('access_fee','access')
     ORDER BY completed_at DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [userId]
  );
  const escrowRes = await query(
    `SELECT id FROM escrow_accounts
     WHERE payer_id = $1
       AND status = 'released'
       AND escrow_type IN ('access_fee','access')
     ORDER BY released_at DESC NULLS LAST
     LIMIT 1`,
    [userId]
  );
  if (!accessTxRes.rowCount && !escrowRes.rowCount) {
    return false;
  }
  const escrowId = escrowRes.rowCount ? escrowRes.rows[0].id : null;
  if (!profileRes.rowCount) {
    await query(
      `INSERT INTO client_profiles (user_id, access_fee_paid, access_granted_at, access_fee_escrow_id)
       VALUES ($1, TRUE, NOW(), $2)`,
      [userId, escrowId]
    );
  } else {
    await query(
      `UPDATE client_profiles
       SET access_fee_paid = TRUE,
           access_granted_at = COALESCE(access_granted_at, NOW()),
           access_fee_escrow_id = COALESCE(access_fee_escrow_id, $1)
       WHERE user_id = $2`,
      [escrowId, userId]
    );
  }
  return true;
}

export async function POST(request) {
  if (WEBHOOK_SECRET) {
    const header = request.headers.get("x-telegram-bot-api-secret-token") || "";
    if (header !== WEBHOOK_SECRET) {
      return NextResponse.json({ ok: true });
    }
  }

  if (!BOT_TOKEN || !GALLERY_CHAT_ID) {
    return NextResponse.json({ ok: true });
  }

  let update = null;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  if (!update || !update.chat_join_request) {
    return NextResponse.json({ ok: true });
  }

  const join = update.chat_join_request;
  const chatId = String(join.chat?.id || "");
  if (chatId !== String(GALLERY_CHAT_ID)) {
    return NextResponse.json({ ok: true });
  }
  const tgUserId = join.from?.id;
  if (!tgUserId) {
    return NextResponse.json({ ok: true });
  }

  const userRes = await query("SELECT id FROM users WHERE telegram_id = $1", [
    tgUserId,
  ]);
  if (!userRes.rowCount) {
    await sendTelegram("declineChatJoinRequest", {
      chat_id: join.chat.id,
      user_id: tgUserId,
    });
    return NextResponse.json({ ok: true });
  }

  const userId = userRes.rows[0].id;
  const hasAccess = await ensureAccess(userId);
  if (hasAccess) {
    await sendTelegram("approveChatJoinRequest", {
      chat_id: join.chat.id,
      user_id: tgUserId,
    });
  } else {
    await sendTelegram("declineChatJoinRequest", {
      chat_id: join.chat.id,
      user_id: tgUserId,
    });
    await sendTelegram("sendMessage", {
      chat_id: tgUserId,
      text: "Gallery access requires the access fee. Please complete payment in the mini app.",
    });
  }

  return NextResponse.json({ ok: true });
}
