import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { extractUser, verifyInitData } from "../../_lib/telegram";
import { ensureUserColumns } from "../../_lib/users";
import { ensureClientProfileColumns } from "../../_lib/clients";
import { ensureModelProfileColumns } from "../../_lib/models";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

function clampText(value, limit) {
  const out = (value || "").toString().trim();
  if (!out) {
    return "";
  }
  return out.slice(0, limit);
}

function normalizeTags(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set();
  const tags = [];
  for (const raw of value) {
    const tag = clampText(raw, 24)
      .replace(/\s+/g, " ")
      .replace(/^#/, "")
      .trim();
    if (!tag) {
      continue;
    }
    const key = tag.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    tags.push(tag);
    if (tags.length >= 8) {
      break;
    }
  }
  return tags;
}

function isAdult(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m || m < 1 || m > 12) {
    return false;
  }
  const now = new Date();
  const cutoff = new Date(now.getFullYear() - 18, now.getMonth(), 1);
  const dob = new Date(y, m - 1, 1);
  return dob <= cutoff;
}

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

  await ensureUserColumns();
  await ensureClientProfileColumns();
  await ensureModelProfileColumns();

  const userRes = await query(
    "SELECT id, role, telegram_id FROM users WHERE telegram_id = $1",
    [tgUser.id]
  );
  if (!userRes.rowCount) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }
  const userId = userRes.rows[0].id;
  const role = userRes.rows[0].role;

  // Common fields
  const email = clampText(body?.email, 254) || null;
  const location = clampText(body?.location, 120) || null;

  // Client username/display name
  const username = clampText(body?.username, 32).replace(/^@/, "") || null;

  // Birth fields (optional update)
  const birthMonth = body?.birth_month != null ? String(body.birth_month).trim() : "";
  const birthYear = body?.birth_year != null ? String(body.birth_year).trim() : "";

  // Model fields
  const bio = clampText(body?.bio, 500);
  const availability = clampText(body?.availability, 120);
  const tags = normalizeTags(body?.tags);
  const displayName = clampText(body?.display_name, 60);

  if (role === "client") {
    if (username) {
      const conflict = await query(
        "SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id <> $2",
        [username, userId]
      );
      if (conflict.rowCount) {
        return NextResponse.json({ error: "username_taken" }, { status: 409 });
      }
      await query("UPDATE users SET username = $1 WHERE id = $2", [username, userId]);
    }
    if (email) {
      await query("UPDATE users SET email = $1 WHERE id = $2", [email, userId]);
    }
    if (location != null || birthMonth || birthYear) {
      if (birthMonth || birthYear) {
        if (!isAdult(birthYear, birthMonth)) {
          return NextResponse.json({ error: "age_restricted" }, { status: 400 });
        }
      }
      await query(
        `UPDATE client_profiles
         SET location = COALESCE($2, location),
             birth_month = COALESCE($3, birth_month),
             birth_year = COALESCE($4, birth_year)
         WHERE user_id = $1`,
        [
          userId,
          location,
          birthMonth ? Number(birthMonth) : null,
          birthYear ? Number(birthYear) : null,
        ]
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (role === "model") {
    // Only allow edits for registered models (verification pending/approved).
    const profileRes = await query(
      "SELECT id FROM model_profiles WHERE user_id = $1",
      [userId]
    );
    if (!profileRes.rowCount) {
      return NextResponse.json({ error: "model_profile_missing" }, { status: 400 });
    }
    const fields = [];
    const params = [userId];
    let idx = 2;
    if (displayName) {
      fields.push(`display_name = $${idx++}`);
      params.push(displayName);
    }
    if (bio) {
      fields.push(`bio = $${idx++}`);
      params.push(bio);
    }
    if (location) {
      fields.push(`location = $${idx++}`);
      params.push(location);
    }
    if (availability) {
      fields.push(`availability = $${idx++}`);
      params.push(availability);
    }
    if (tags.length) {
      fields.push(`tags = $${idx++}::jsonb`);
      params.push(JSON.stringify(tags));
    }
    if (!fields.length && !email) {
      return NextResponse.json({ ok: true });
    }
    if (email) {
      await query("UPDATE users SET email = $1 WHERE id = $2", [email, userId]);
    }
    if (fields.length) {
      await query(
        `UPDATE model_profiles SET ${fields.join(", ")} WHERE user_id = $1`,
        params
      );
    }
    return NextResponse.json({ ok: true });
  }

  // Admin or unknown roles: allow email update only.
  if (email) {
    await query("UPDATE users SET email = $1 WHERE id = $2", [email, userId]);
  }
  return NextResponse.json({ ok: true });
}
