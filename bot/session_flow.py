from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import User, Session, EscrowAccount, Transaction
from shared.escrow import create_escrow, release_escrow
from shared.transactions import create_transaction
from shared.id_utils import generate_public_id
from shared.time_utils import utcnow


def generate_session_ref() -> str:
    import secrets

    return f"sess_{secrets.token_hex(4)}"


async def get_user_by_telegram_id(db: AsyncSession, telegram_id: int) -> Optional[User]:
    result = await db.execute(select(User).where(User.telegram_id == telegram_id))
    return result.scalar_one_or_none()


async def get_or_create_user(
    db: AsyncSession,
    telegram_id: int,
    username: Optional[str],
    first_name: Optional[str],
    last_name: Optional[str],
    role: str,
) -> User:
    user = await get_user_by_telegram_id(db, telegram_id)
    if user:
        if not user.public_id:
            user.public_id = await _allocate_public_id(db)
            await db.commit()
            await db.refresh(user)
        return user

    user = User(
        telegram_id=telegram_id,
        username=username,
        first_name=first_name,
        last_name=last_name,
        role=role,
        public_id=await _allocate_public_id(db),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _allocate_public_id(db: AsyncSession, max_tries: int = 20) -> str:
    for _ in range(max_tries):
        candidate = generate_public_id()
        result = await db.execute(select(User).where(User.public_id == candidate))
        if not result.scalar_one_or_none():
            return candidate
    raise RuntimeError("Unable to allocate unique public_id")


async def update_user_role(db: AsyncSession, user: User, role: str) -> User:
    user.role = role
    await db.commit()
    await db.refresh(user)
    return user


async def create_session_request(
    db: AsyncSession,
    client: User,
    model: User,
    session_type: str,
    price: float,
    duration_minutes: Optional[int] = None,
) -> tuple[Session, Transaction]:
    session_ref = generate_session_ref()
    session = Session(
        session_ref=session_ref,
        client_id=client.id,
        model_id=model.id,
        session_type=session_type,
        package_price=price,
        duration_minutes=duration_minutes,
        status="pending_payment",
    )
    db.add(session)
    await db.flush()

    transaction = await create_transaction(
        db,
        user_id=client.id,
        transaction_type="session",
        amount=price,
        metadata={
            "escrow_type": "session",
            "session_id": session.id,
            "model_id": model.id,
        },
    )
    await db.commit()
    await db.refresh(session)
    await db.refresh(transaction)
    return session, transaction


async def create_session_with_escrow(
    db: AsyncSession,
    session: Session,
    transaction: Transaction,
    payer_id: int,
    receiver_id: int,
    amount: float,
) -> EscrowAccount:
    escrow = await create_escrow(
        db,
        escrow_type="session",
        related_id=session.id,
        payer_id=payer_id,
        receiver_id=receiver_id,
        amount=amount,
        transaction=transaction,
        release_condition="both_confirmed",
        auto_release_hours=24,
    )
    session.escrow_id = escrow.id
    await db.commit()
    await db.refresh(escrow)
    return escrow


async def get_session_by_ref(db: AsyncSession, session_ref: str) -> Optional[Session]:
    result = await db.execute(select(Session).where(Session.session_ref == session_ref))
    return result.scalar_one_or_none()


async def set_session_status(db: AsyncSession, session: Session, status: str):
    session.status = status
    await db.commit()
    await db.refresh(session)


async def set_escrow_status(
    db: AsyncSession,
    escrow: EscrowAccount,
    status: str,
    reason: Optional[str] = None,
):
    escrow.status = status
    if reason is not None:
        escrow.dispute_reason = reason
    await db.commit()
    await db.refresh(escrow)


async def get_escrow_for_session(db: AsyncSession, session_id: int) -> Optional[EscrowAccount]:
    result = await db.execute(
        select(EscrowAccount).where(
            (EscrowAccount.escrow_type == "session") & (EscrowAccount.related_id == session_id)
        )
    )
    return result.scalar_one_or_none()


async def mark_session_confirmed(
    db: AsyncSession,
    session: Session,
    *,
    by_role: str,
) -> Session:
    if by_role == "client":
        session.client_confirmed = True
    elif by_role == "model":
        session.model_confirmed = True
    await db.flush()

    if session.client_confirmed and session.model_confirmed:
        session.status = "completed"
        session.completed_at = utcnow()
        escrow = await get_escrow_for_session(db, session.id)
        if escrow and escrow.status == "held":
            escrow.release_condition_met = True
            escrow.release_condition = "both_confirmed"
            session.status = "awaiting_admin_release"
    await db.commit()
    await db.refresh(session)
    return session
