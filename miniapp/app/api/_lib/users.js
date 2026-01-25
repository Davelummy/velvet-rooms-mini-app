import { query } from "./db";

const ALPHANUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function generatePublicId() {
  let out = "";
  for (let i = 0; i < 4; i += 1) {
    out += ALPHANUM[Math.floor(Math.random() * ALPHANUM.length)];
  }
  return out;
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
  const existing = await query("SELECT id FROM users WHERE telegram_id = $1", [telegramId]);
  if (existing.rowCount) {
    const userId = existing.rows[0].id;
    await query(
      `UPDATE users SET username = $1, first_name = $2, last_name = $3, email = COALESCE($4, email), role = $5, status = $6 WHERE id = $7`,
      [username, firstName, lastName, email || null, role, status, userId]
    );
    return userId;
  }
  const publicId = await allocatePublicId();
  const now = new Date();
  const res = await query(
    `INSERT INTO users (telegram_id, public_id, username, first_name, last_name, email, role, status, wallet_balance, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9)
     RETURNING id`,
    [telegramId, publicId, username, firstName, lastName, email || null, role, status, now]
  );
  return res.rows[0].id;
}
