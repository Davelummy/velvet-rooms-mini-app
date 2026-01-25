import asyncio
from pathlib import Path
import sys

from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))

from shared.db import engine


async def migrate():
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT FALSE"))
        await conn.execute(text("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP"))
    print("✅ model_profiles presence columns added")


if __name__ == "__main__":
    asyncio.run(migrate())
