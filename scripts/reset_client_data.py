import argparse
import asyncio
from pathlib import Path
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))

from config import settings  # noqa: E402


async def main():
    parser = argparse.ArgumentParser(
        description="Clear client/activity data while preserving model/admin users and content."
    )
    parser.add_argument(
        "--keep-unapproved-content",
        action="store_true",
        help="Keep unapproved (inactive) content. Default removes inactive content.",
    )
    args = parser.parse_args()

    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is required")

    engine = create_async_engine(settings.database_url, echo=False)
    try:
        async with engine.begin() as conn:
            keep_users_cte = """
                WITH keep_users AS (
                    SELECT id FROM users WHERE role IN ('model','admin')
                    UNION
                    SELECT user_id AS id FROM model_profiles
                )
            """

            await conn.execute(text("DELETE FROM content_likes"))
            await conn.execute(text("DELETE FROM content_views"))
            await conn.execute(text("DELETE FROM follows"))
            await conn.execute(text("DELETE FROM blocks"))
            await conn.execute(text("DELETE FROM user_actions"))
            await conn.execute(text("DELETE FROM worker_heartbeats"))

            await conn.execute(text("DELETE FROM content_purchases"))
            await conn.execute(text("DELETE FROM sessions"))

            # Client profiles reference escrow_accounts; delete them first.
            await conn.execute(text("DELETE FROM client_profiles"))
            await conn.execute(text("DELETE FROM escrow_accounts"))
            await conn.execute(text("DELETE FROM transactions"))

            await conn.execute(
                text(
                    keep_users_cte
                    + """
                    DELETE FROM admin_actions
                    WHERE (admin_id IS NOT NULL AND admin_id NOT IN (SELECT id FROM keep_users))
                       OR (target_user_id IS NOT NULL AND target_user_id NOT IN (SELECT id FROM keep_users));
                    """
                )
            )

            await conn.execute(
                text(
                    keep_users_cte
                    + """
                    DELETE FROM users
                    WHERE id NOT IN (SELECT id FROM keep_users);
                    """
                )
            )

            if not args.keep_unapproved_content:
                await conn.execute(text("DELETE FROM digital_content WHERE is_active IS NOT TRUE"))

            await conn.execute(
                text("UPDATE digital_content SET total_sales = 0, total_revenue = 0")
            )
            await conn.execute(text("UPDATE users SET wallet_balance = 0"))
            await conn.execute(text("UPDATE model_profiles SET total_earnings = 0"))

        print("✅ Client data reset complete.")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
