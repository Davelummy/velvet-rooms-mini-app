from typing import Any, Optional

from aiogram import Bot
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from bot.content_flow import confirm_content_purchase
from bot.session_flow import create_session_with_escrow
from models import (
    ClientProfile,
    ContentPurchase,
    DigitalContent,
    EscrowAccount,
    Session,
    Transaction,
    User,
)
from shared.escrow import create_escrow
from shared.notifications import send_escrow_log, send_admin_message
from shared.config import settings
from shared.notifications import send_user_message
from shared.time_utils import utcnow


async def process_transaction(
    db: AsyncSession,
    *,
    transaction_ref: str,
    provider: str,
    payload: dict[str, Any],
) -> Optional[EscrowAccount]:
    result = await db.execute(
        select(Transaction).where(Transaction.transaction_ref == transaction_ref)
    )
    transaction = result.scalar_one_or_none()
    if not transaction:
        return None
    if transaction.status == "completed":
        return None

    metadata = transaction.metadata_json or {}
    escrow_type = metadata.get("escrow_type") or payload.get("metadata", {}).get("escrow_type")
    if not escrow_type:
        return None

    transaction.status = "completed"
    transaction.payment_provider = provider
    transaction.completed_at = utcnow()
    await db.flush()

    escrow: Optional[EscrowAccount] = None
    if escrow_type == "session":
        session_id = metadata.get("session_id")
        model_id = metadata.get("model_id")
        if not session_id or not model_id:
            return None
        session = await db.get(Session, session_id)
        if not session:
            return None
        escrow = await create_session_with_escrow(
            db,
            session=session,
            transaction=transaction,
            payer_id=transaction.user_id,
            receiver_id=model_id,
            amount=transaction.amount or 0,
        )
        session.status = "paid"
        client = await db.get(User, session.client_id)
        if client:
            await send_user_message(
                client.telegram_id,
                f"Payment received for session {session.session_ref}. Waiting for model to start.",
            )
    elif escrow_type == "content":
        result = await db.execute(
            select(ContentPurchase).where(ContentPurchase.transaction_id == transaction.id)
        )
        purchase = result.scalar_one_or_none()
        if not purchase:
            return None
        content = await db.get(DigitalContent, purchase.content_id)
        if not content:
            return None
        escrow = await confirm_content_purchase(
            db,
            purchase=purchase,
            transaction=transaction,
            payer_id=transaction.user_id,
            receiver_id=content.model_id,
            amount=transaction.amount or 0,
        )
        content.total_sales += 1
        content.total_revenue += transaction.amount or 0
        buyer = await db.get(User, transaction.user_id)
        if buyer:
            await send_user_message(
                buyer.telegram_id,
                f"Payment received. Content #{content.id} awaiting admin approval for release.",
            )
    elif escrow_type == "access_fee":
        client_id = metadata.get("client_id") or transaction.user_id
        result = await db.execute(
            select(ClientProfile).where(ClientProfile.user_id == client_id)
        )
        profile = result.scalar_one_or_none()
        if not profile:
            profile = ClientProfile(user_id=client_id)
            db.add(profile)
            await db.flush()
        escrow = await create_escrow(
            db,
            escrow_type="access_fee",
            related_id=profile.id,
            payer_id=client_id,
            receiver_id=None,
            amount=transaction.amount or 0,
            transaction=transaction,
            release_condition="access_granted",
            auto_release_hours=None,
        )
        profile.access_fee_paid = False
        profile.access_fee_escrow_id = escrow.id
        client = await db.get(User, transaction.user_id)
        if client:
            await send_user_message(
                client.telegram_id,
                "Access fee received. Awaiting admin approval to unlock gallery.",
            )
    elif escrow_type == "extension":
        session_id = metadata.get("session_id")
        model_id = metadata.get("model_id")
        if not session_id or not model_id:
            return None
        escrow = await create_escrow(
            db,
            escrow_type="extension",
            related_id=session_id,
            payer_id=transaction.user_id,
            receiver_id=model_id,
            amount=transaction.amount or 0,
            transaction=transaction,
            release_condition="session_complete",
            auto_release_hours=24,
        )
        model = await db.get(User, model_id)
        if model:
            await send_user_message(
                model.telegram_id,
                f"Session extension paid for session {session_id}.",
            )

    await db.commit()
    if escrow:
        await send_escrow_log(
            f"Escrow created: {escrow.escrow_ref} ({escrow.escrow_type}) amount {escrow.amount}"
        )
        await send_admin_message(
            f"Escrow approval needed:\n{escrow.escrow_ref}\nType: {escrow.escrow_type}\nAmount: {escrow.amount}",
            reply_markup=_admin_console_keyboard(),
        )
    return escrow


def _admin_console_keyboard():
    from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

    if not settings.webapp_url:
        return None
    admin_url = f"{settings.webapp_url.rstrip('/')}/admin"
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Open Admin Console", web_app=WebAppInfo(url=admin_url))]
        ]
    )


async def _deliver_content_to_buyer(buyer: User, content: DigitalContent) -> bool:
    if not settings.user_bot_token or not content.telegram_file_id:
        return False
    bot = Bot(token=settings.user_bot_token)
    try:
        caption = f"{content.title}\n{content.description}"
        if content.content_type == "photo":
            await bot.send_photo(buyer.telegram_id, content.telegram_file_id, caption=caption)
        else:
            await bot.send_video(buyer.telegram_id, content.telegram_file_id, caption=caption)
        return True
    except Exception:
        return False
    finally:
        await bot.session.close()
