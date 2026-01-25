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
                    "WHERE table_schema='public' AND table_name='sessions'"
                )
            )
            columns = {row[0] for row in result.fetchall()}

            statements = []
            if "client_confirmed" not in columns:
                statements.append("ALTER TABLE sessions ADD COLUMN client_confirmed BOOLEAN DEFAULT FALSE")
            if "model_confirmed" not in columns:
                statements.append("ALTER TABLE sessions ADD COLUMN model_confirmed BOOLEAN DEFAULT FALSE")
            if "duration_minutes" not in columns:
                statements.append("ALTER TABLE sessions ADD COLUMN duration_minutes INTEGER")
            if "started_at" not in columns:
                statements.append("ALTER TABLE sessions ADD COLUMN started_at TIMESTAMP")
            if "ended_at" not in columns:
                statements.append("ALTER TABLE sessions ADD COLUMN ended_at TIMESTAMP")
            if "completed_at" not in columns:
                statements.append("ALTER TABLE sessions ADD COLUMN completed_at TIMESTAMP")

            if not statements:
                print("No session column migrations needed.")
                return

            for stmt in statements:
                await conn.execute(text(stmt))
            print("✅ Session columns added:")
            for stmt in statements:
                print(stmt)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
