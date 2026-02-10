#!/usr/bin/env python3
import asyncio
import os
import re
from pathlib import Path
from typing import Dict, Tuple

import asyncpg


def load_env(path: str) -> Dict[str, str]:
    values: Dict[str, str] = {}
    p = Path(path)
    if not p.exists():
        return values
    for line in p.read_text("utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line)
        if not m:
            continue
        key, raw = m.group(1), m.group(2)
        # Strip optional surrounding quotes.
        if len(raw) >= 2 and ((raw[0] == raw[-1] == '"') or (raw[0] == raw[-1] == "'")):
            raw = raw[1:-1]
        values[key] = raw
    return values


def normalize_asyncpg_url(url: str) -> str:
    # We store SQLAlchemy-style URLs in .env (postgresql+asyncpg://...).
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


RESET_SQL = r"""
BEGIN;

-- 0) Zero all wallet balances (keeps accounts but wipes balances).
UPDATE users SET wallet_balance = 0;

-- 1) Remove *all* session bookings and their payment artifacts.
DELETE FROM sessions;
DELETE FROM escrow_accounts WHERE escrow_type IN ('session', 'extension');

-- 2) Remove *all* content purchases/payment artifacts (keeps approved teaser content).
DELETE FROM content_purchases;
DELETE FROM escrow_accounts WHERE escrow_type = 'content';

-- 3) Keep only APPROVED access-fee escrows (everything else is wiped).
DELETE FROM escrow_accounts
WHERE escrow_type = 'access_fee' AND status <> 'released';

-- 4) Remove orphan transactions (keep those referenced by remaining escrows).
DELETE FROM transactions
WHERE id NOT IN (
  SELECT DISTINCT transaction_id
  FROM escrow_accounts
  WHERE transaction_id IS NOT NULL
);

-- 5) Keep only APPROVED teaser content by APPROVED models.
DELETE FROM digital_content WHERE COALESCE(is_active, FALSE) <> TRUE;
DELETE FROM digital_content
WHERE model_id NOT IN (
  SELECT user_id FROM model_profiles WHERE verification_status = 'approved'
);

-- 6) Keep only APPROVED model/client profiles.
DELETE FROM model_profiles WHERE verification_status <> 'approved';
DELETE FROM client_profiles WHERE COALESCE(access_fee_paid, FALSE) <> TRUE;

-- 7) Clear social and audit noise for a clean slate.
DELETE FROM blocks;
DELETE FROM follows;
DELETE FROM user_actions;
DELETE FROM worker_heartbeats;
DELETE FROM admin_actions;

-- 8) Delete users that are neither approved clients nor approved models nor admins.
WITH keep_users AS (
  SELECT user_id FROM model_profiles WHERE verification_status = 'approved'
  UNION
  SELECT user_id FROM client_profiles WHERE access_fee_paid = TRUE
  UNION
  SELECT id AS user_id FROM users WHERE role = 'admin'
)
DELETE FROM users
WHERE id NOT IN (SELECT user_id FROM keep_users);

COMMIT;
"""


async def run() -> Tuple[int, int, int]:
    env = load_env(".env")
    db_url = env.get("DATABASE_URL") or os.environ.get("DATABASE_URL") or ""
    if not db_url:
        raise SystemExit("DATABASE_URL missing (set it in .env or environment).")

    db_url = normalize_asyncpg_url(db_url)
    confirm = os.environ.get("CONFIRM_RESET", "").strip().upper()
    if confirm != "YES":
        raise SystemExit(
            "Refusing to run destructive reset.\n"
            "Re-run with: CONFIRM_RESET=YES"
        )

    conn = await asyncpg.connect(db_url)
    try:
        # Basic sanity: ensure core tables exist.
        await conn.execute("SELECT 1 FROM users LIMIT 1")
        await conn.execute(RESET_SQL)

        users = await conn.fetchval("SELECT COUNT(*) FROM users")
        models = await conn.fetchval(
            "SELECT COUNT(*) FROM model_profiles WHERE verification_status = 'approved'"
        )
        clients = await conn.fetchval(
            "SELECT COUNT(*) FROM client_profiles WHERE access_fee_paid = TRUE"
        )
        return int(users or 0), int(models or 0), int(clients or 0)
    finally:
        await conn.close()


def main() -> None:
    users, models, clients = asyncio.run(run())
    print("Reset complete.")
    print(f"Remaining users: {users}")
    print(f"Approved models: {models}")
    print(f"Approved clients: {clients}")


if __name__ == "__main__":
    main()

