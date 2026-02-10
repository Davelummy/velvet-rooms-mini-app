from __future__ import annotations

import secrets
from datetime import timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import EscrowAccount, Transaction, User
from shared.config import settings
from shared.notifications import send_escrow_log
from shared.time_utils import utcnow


def generate_escrow_ref(prefix: str = "esc") -> str:
    return f"{prefix}_{secrets.token_hex(6)}"


def calculate_fees(amount: float, escrow_type: str) -> tuple[float, Optional[float]]:
    if escrow_type == "access_fee":
        return amount, None
    platform_fee = round(amount * 0.2, 2)
    receiver_payout = round(amount - platform_fee, 2)
    return platform_fee, receiver_payout


async def create_escrow(
    db: AsyncSession,
    *,
    escrow_type: str,
    related_id: int,
    payer_id: int,
    receiver_id: Optional[int],
    amount: float,
    transaction: Optional[Transaction],
    release_condition: str,
    auto_release_hours: Optional[int] = 24,
) -> EscrowAccount:
    if settings.manual_release_only:
        auto_release_hours = None
    platform_fee, receiver_payout = calculate_fees(amount, escrow_type)
    auto_release_at = None
    if auto_release_hours:
        auto_release_at = utcnow() + timedelta(hours=auto_release_hours)

    escrow = EscrowAccount(
        escrow_ref=generate_escrow_ref(escrow_type[:3]),
        escrow_type=escrow_type,
        related_id=related_id,
        payer_id=payer_id,
        receiver_id=receiver_id,
        amount=amount,
        platform_fee=platform_fee,
        receiver_payout=receiver_payout,
        status="held",
        transaction_id=transaction.id if transaction else None,
        auto_release_at=auto_release_at,
        release_condition=release_condition,
        release_condition_met=False,
    )
    db.add(escrow)
    await db.flush()
    return escrow


async def release_escrow(
    db: AsyncSession,
    escrow: EscrowAccount,
    *,
    reason: Optional[str] = None,
) -> tuple[EscrowAccount, bool]:
    result = await db.execute(
        select(EscrowAccount)
        .where(EscrowAccount.id == escrow.id)
        .with_for_update()
    )
    locked = result.scalar_one_or_none()
    if not locked:
        return escrow, False
    if locked.status not in {"held", "disputed"}:
        return locked, False

    locked.status = "released"
    locked.released_at = utcnow()
    locked.release_condition_met = True
    if reason:
        locked.dispute_reason = reason

    if locked.receiver_id and locked.receiver_payout:
        user = await db.get(User, locked.receiver_id)
        if user:
            user.wallet_balance = (user.wallet_balance or 0) + locked.receiver_payout

    await db.commit()
    await db.refresh(locked)
    message = (
        f"Escrow released: {locked.escrow_ref} ({locked.escrow_type}) amount {locked.amount}"
    )
    if reason:
        message = f"{message} reason={reason}"
    await send_escrow_log(message)
    return locked, True


async def refund_escrow(
    db: AsyncSession,
    escrow: EscrowAccount,
    *,
    reason: Optional[str] = None,
) -> tuple[EscrowAccount, bool]:
    result = await db.execute(
        select(EscrowAccount)
        .where(EscrowAccount.id == escrow.id)
        .with_for_update()
    )
    locked = result.scalar_one_or_none()
    if not locked:
        return escrow, False
    if locked.status not in {"held", "disputed"}:
        return locked, False

    locked.status = "refunded"
    locked.released_at = utcnow()
    locked.release_condition_met = True
    if reason:
        locked.dispute_reason = reason

    if locked.payer_id:
        user = await db.get(User, locked.payer_id)
        if user:
            user.wallet_balance = (user.wallet_balance or 0) + (locked.amount or 0)

    await db.commit()
    await db.refresh(locked)
    message = (
        f"Escrow refunded: {locked.escrow_ref} ({locked.escrow_type}) amount {locked.amount}"
    )
    if reason:
        message = f"{message} reason={reason}"
    await send_escrow_log(message)
    return locked, True
