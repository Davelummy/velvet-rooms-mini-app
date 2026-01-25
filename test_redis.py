import asyncio
from redis.asyncio import Redis
from config import settings

REDIS_URL = settings.redis_url or "redis://localhost:6379/0"

async def main():
    redis = Redis.from_url(REDIS_URL)
    
    # Test setting a value
    await redis.set("test_key", "Hello Redis!")
    
    # Get value (manual decode)
    value = await redis.get("test_key")
    if value is not None:
        value = value.decode("utf-8")
    
    print("✅ Redis Test Value:", value)
    
    await redis.aclose()

asyncio.run(main())
