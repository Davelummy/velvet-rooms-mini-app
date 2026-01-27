import { query } from "./db";

const ALPHANUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function generatePublicId() {
  let out = "";
  for (let i = 0; i < 4; i += 1) {
    out += ALPHANUM[Math.floor(Math.random() * ALPHANUM.length)];
  }
  return out;
}

function normalizeUsername(username) {
  if (!username || typeof username !== "string") {
    return null;
  }
  const trimmed = username.trim().replace(/^@/, "");
  return trimmed.length ? trimmed : null;
}

async function allocatePublicId() {
  for (let i = 0; i < 20; i += 1) {
    const candidate = generatePublicId();
    const res = await query("SELECT id FROM users WHERE public_id = $1", [candidate]);
    if (res.rowCount === 0) {
      return candidate;
    }
  }
  throw new Error("Unable to allocate public_id");
}

export async function ensureUser({
  telegramId,
  username,
  firstName,
  lastName,
  role,
  status,
  email,
}) {
  const normalizedUsername = normalizeUsername(username);
  const isClient = role === "client";
  const existing = await query(
    "SELECT id, public_id, username FROM users WHERE telegram_id = $1",
    [telegramId]
  );
  if (existing.rowCount) {
    const userId = existing.rows[0].id;
    const publicId = existing.rows[0].public_id;
    let finalUsername = normalizedUsername || existing.rows[0].username || null;
    if (isClient) {
      if (!finalUsername) {
        finalUsername = `client_${publicId}`;
      }
      const conflict = await query(
        "SELECT id FROM users WHERE username = $1 AND id <> $2",
        [finalUsername, userId]
      );
      if (conflict.rowCount) {
        finalUsername = `client_${publicId}`;
      }
    }
    await query(
      `UPDATE users SET username = $1, first_name = $2, last_name = $3, email = COALESCE($4, email), role = $5, status = $6 WHERE id = $7`,
      [finalUsername, firstName, lastName, email || null, role, status, userId]
    );
    return userId;
  }
  const publicId = await allocatePublicId();
  let finalUsername = normalizedUsername;
  if (isClient && !finalUsername) {
    finalUsername = `client_${publicId}`;
  }
  if (finalUsername) {
    const conflict = await query("SELECT id FROM users WHERE username = $1", [finalUsername]);
    if (conflict.rowCount) {
      finalUsername = `client_${publicId}`;
    }
  }
  const now = new Date();
  const res = await query(
    `INSERT INTO users (telegram_id, public_id, username, first_name, last_name, email, role, status, wallet_balance, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9)
     RETURNING id`,
    [
      telegramId,
      publicId,
      finalUsername,
      firstName,
      lastName,
      email || null,
      role,
      status,
      now,
    ]
  );
  return res.rows[0].id;
}
