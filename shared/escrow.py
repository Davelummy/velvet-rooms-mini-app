from __future__ import annotations

import secrets
from datetime import timedelta
from typing import Optional

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
    await db.commit()
    await db.refresh(escrow)
    return escrow


async def release_escrow(
    db: AsyncSession,
    escrow: EscrowAccount,
    *,
    reason: Optional[str] = None,
) -> EscrowAccount:
    escrow.status = "released"
    escrow.released_at = utcnow()
    escrow.release_condition_met = True
    if reason:
        escrow.dispute_reason = reason

    if escrow.receiver_id and escrow.receiver_payout:
        user = await db.get(User, escrow.receiver_id)
        if user:
            user.wallet_balance = (user.wallet_balance or 0) + escrow.receiver_payout

    await db.commit()
    await db.refresh(escrow)
    await send_escrow_log(
        f"Escrow released: {escrow.escrow_ref} ({escrow.escrow_type}) amount {escrow.amount}"
    )
    return escrow


async def refund_escrow(
    db: AsyncSession,
    escrow: EscrowAccount,
    *,
    reason: Optional[str] = None,
) -> EscrowAccount:
    escrow.status = "refunded"
    escrow.released_at = utcnow()
    escrow.release_condition_met = True
    if reason:
        escrow.dispute_reason = reason

    if escrow.payer_id:
        user = await db.get(User, escrow.payer_id)
        if user:
            user.wallet_balance = (user.wallet_balance or 0) + (escrow.amount or 0)

    await db.commit()
    await db.refresh(escrow)
    await send_escrow_log(
        f"Escrow refunded: {escrow.escrow_ref} ({escrow.escrow_type}) amount {escrow.amount}"
    )
    return escrow
