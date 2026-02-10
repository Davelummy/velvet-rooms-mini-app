import asyncio
from pathlib import Path
import sys

from sqlalchemy import select
from datetime import timedelta

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))

from shared.db import AsyncSessionLocal
from shared.escrow import release_escrow
from shared.notifications import send_user_message
from shared.config import settings
from shared.time_utils import utcnow
from shared.db import engine
from sqlalchemy.exc import DBAPIError
from models import EscrowAccount, Session, User


async def process_auto_release():
    if settings.manual_release_only:
        return
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(EscrowAccount).where(
                    (EscrowAccount.status == "held")
                    & (EscrowAccount.auto_release_at.is_not(None))
                    & (EscrowAccount.auto_release_at <= utcnow())
                )
            )
            escrows = list(result.scalars().all())
            for escrow in escrows:
                _, changed = await release_escrow(db, escrow, reason="auto_release")
                if not changed:
                    continue
    except DBAPIError as exc:
        # Connection drops can happen; reset pool and try again next cycle.
        print(f"Worker DB error: {exc}")
        await engine.dispose()


async def process_session_timeouts():
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Session).where(
                    (Session.status == "active")
                    & (Session.started_at.is_not(None))
                    & (Session.duration_minutes.is_not(None))
                )
            )
            sessions = list(result.scalars().all())
            now = utcnow()
            for session in sessions:
                cutoff = session.started_at + timedelta(minutes=session.duration_minutes)
                if cutoff <= now:
                    session.status = "awaiting_confirmation"
                    session.ended_at = now
                    await db.commit()
                    client = await db.get(User, session.client_id)
                    model = await db.get(User, session.model_id)
                    if client:
                        await send_user_message(
                            client.telegram_id,
                            f"Session {session.session_ref} time ended. Confirm completion with /confirm_session {session.session_ref}.",
                        )
                    if model:
                        await send_user_message(
                            model.telegram_id,
                            f"Session {session.session_ref} time ended. Confirm completion with /confirm_session {session.session_ref}.",
                        )
    except DBAPIError as exc:
        print(f"Worker DB error: {exc}")
        await engine.dispose()


async def background_worker():
    while True:
        await process_auto_release()
        await process_session_timeouts()
        await asyncio.sleep(60)


if __name__ == "__main__":
    asyncio.run(background_worker())
