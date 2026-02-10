import asyncio
from pathlib import Path
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))

from config import settings  # noqa: E402


async def main():
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is required")

    engine = create_async_engine(settings.database_url, echo=False)
    try:
        async with engine.begin() as conn:
            result = await conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema='public' AND table_name='users'"
                )
            )
            columns = {row[0] for row in result.fetchall()}

            statements = []
            if "first_name" not in columns:
                statements.append("ALTER TABLE users ADD COLUMN first_name TEXT")
            if "last_name" not in columns:
                statements.append("ALTER TABLE users ADD COLUMN last_name TEXT")
            if "email" not in columns:
                statements.append("ALTER TABLE users ADD COLUMN email TEXT")
            if "wallet_balance" not in columns:
                statements.append("ALTER TABLE users ADD COLUMN wallet_balance DOUBLE PRECISION DEFAULT 0")
            if "public_id" not in columns:
                statements.append("ALTER TABLE users ADD COLUMN public_id VARCHAR(4)")
                statements.append("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_id ON users(public_id)")
            if "disclaimer_accepted_at" not in columns:
                statements.append("ALTER TABLE users ADD COLUMN disclaimer_accepted_at TIMESTAMP")
            if "disclaimer_version" not in columns:
                statements.append("ALTER TABLE users ADD COLUMN disclaimer_version TEXT")

            if not statements:
                print("No user column migrations needed.")
                return

            for stmt in statements:
                await conn.execute(text(stmt))
            print("✅ User columns added:")
            for stmt in statements:
                print(stmt)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
