import secrets
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from models import Transaction
from shared.time_utils import utcnow


def generate_transaction_ref() -> str:
    return f"txn_{secrets.token_hex(6)}"


async def create_transaction(
    db: AsyncSession,
    *,
    user_id: int,
    transaction_type: str,
    amount: float,
    metadata: dict,
    payment_provider: str = "pending",
    status: str = "pending",
) -> Transaction:
    transaction = Transaction(
        transaction_ref=generate_transaction_ref(),
        user_id=user_id,
        transaction_type=transaction_type,
        amount=amount,
        payment_provider=payment_provider,
        status=status,
        metadata_json=metadata,
        created_at=utcnow(),
    )
    db.add(transaction)
    await db.flush()
    return transaction
