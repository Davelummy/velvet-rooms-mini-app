from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from shared.config import settings

if not settings.database_url:
    raise RuntimeError("DATABASE_URL is required")

engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db_session():
    async with AsyncSessionLocal() as session:
        yield session
