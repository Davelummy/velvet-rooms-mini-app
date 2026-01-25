import { NextResponse } from "next/server";
import { query } from "../../../_lib/db";
import { extractUser, verifyInitData } from "../../../_lib/telegram";
import { getCryptoWallets } from "../../../_lib/crypto";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

export async function POST(request) {
  const body = await request.json();
  const initData = body?.initData || "";
  if (!verifyInitData(initData, BOT_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tgUser = extractUser(initData);
  if (!tgUser?.id) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }

  const transactionRef = body?.transaction_ref || "";
  const txHash = (body?.tx_hash || "").toString().trim();
  const network = (body?.network || "").toString().trim();
  const currency = (body?.currency || "").toString().trim();
  if (!transactionRef || !txHash || !network || !currency) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const txRes = await query(
    `SELECT id, user_id, status, metadata_json
     FROM transactions WHERE transaction_ref = $1`,
    [transactionRef]
  );
  if (!txRes.rowCount) {
    return NextResponse.json({ error: "transaction_missing" }, { status: 404 });
  }
  const transaction = txRes.rows[0];
  if (transaction.user_id === null) {
    return NextResponse.json({ error: "transaction_owner_missing" }, { status: 400 });
  }

  const userRes = await query("SELECT id FROM users WHERE telegram_id = $1", [tgUser.id]);
  if (!userRes.rowCount || userRes.rows[0].id !== transaction.user_id) {
    return NextResponse.json({ error: "transaction_owner_mismatch" }, { status: 403 });
  }

  if (transaction.status === "completed") {
    return NextResponse.json({ error: "already_completed" }, { status: 409 });
  }

  const wallets = getCryptoWallets();
  const address = wallets[network] || "";
  let metadata = transaction.metadata_json || {};
  if (typeof metadata === "string") {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      metadata = {};
    }
  }
  metadata.crypto_tx_hash = txHash;
  metadata.crypto_currency = currency;
  metadata.crypto_network = network;
  metadata.crypto_address = address;

  await query(
    `UPDATE transactions
     SET status = 'submitted', metadata_json = $1
     WHERE transaction_ref = $2`,
    [JSON.stringify(metadata), transactionRef]
  );

  return NextResponse.json({ ok: true });
}
