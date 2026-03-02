import { NextResponse } from "next/server";
import { verifyInitData, extractUser } from "../../_lib/telegram";
import { query } from "../../_lib/db";
import { createRequestContext } from "../../_lib/observability";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

async function ensureGiftsCatalog() {
  await query(
    `CREATE TABLE IF NOT EXISTS virtual_gifts_catalog (
       id SERIAL PRIMARY KEY,
       name TEXT NOT NULL,
       emoji TEXT NOT NULL,
       animation_key TEXT,
       price_ngn INTEGER NOT NULL,
       is_active BOOLEAN DEFAULT TRUE
     )`
  );

  // Seed default catalog
  await query(
    `INSERT INTO virtual_gifts_catalog (name, emoji, animation_key, price_ngn) VALUES
     ('Heart','❤️','heart_burst',200),
     ('Rose','🌹','rose_float',500),
     ('Fire','🔥','fire_burst',1000),
     ('Champagne','🥂','confetti_pop',1500),
     ('Crown','👑','crown_rise',2500),
     ('Diamond','💎','diamond_spin',5000)
     ON CONFLICT DO NOTHING`
  );
}

export async function GET(req) {
  const ctx = createRequestContext("GET /api/gifts/catalog");
  try {
    const initData = req.headers.get("x-telegram-init") || "";
    if (!verifyInitData(initData, BOT_TOKEN)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureGiftsCatalog();
    const res = await query(
      "SELECT id, name, emoji, animation_key, price_ngn FROM virtual_gifts_catalog WHERE is_active = TRUE ORDER BY price_ngn"
    );
    return NextResponse.json({ gifts: res.rows });
  } catch (err) {
    ctx.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
