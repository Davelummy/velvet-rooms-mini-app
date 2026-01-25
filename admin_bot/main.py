from pathlib import Path
import sys
from typing import Optional

from aiohttp import web
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import (
    BufferedInputFile,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    CallbackQuery,
    MenuButtonWebApp,
    WebAppInfo,
)
from aiohttp import ClientSession
import logging
import sentry_sdk
from sentry_sdk.integrations.aiohttp import AioHttpIntegration
from sqlalchemy import func, select

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("admin_bot")
from shared.config import settings
from shared.db import AsyncSessionLocal
from shared.escrow import refund_escrow, release_escrow
from shared.time_utils import utcnow
from models import (
    AdminAction,
    ClientProfile,
    ContentPurchase,
    DigitalContent,
    EscrowAccount,
    ModelProfile,
    Transaction,
    User,
)
from bot.session_flow import get_or_create_user
from shared.notifications import send_user_message
from shared.payment_processor import process_transaction, _deliver_content_to_buyer


WEBHOOK_PATH = "/admin_webhook"


def _require_admin(user_id: Optional[int]) -> bool:
    if user_id is None:
        return False
    try:
        user_id_int = int(user_id)
    except (TypeError, ValueError):
        return False
    return user_id_int in tuple(int(x) for x in settings.admin_telegram_ids)


def _admin_guard(message: types.Message) -> bool:
    user_id = message.from_user.id if message.from_user else None
    is_admin = _require_admin(user_id)
    chat_id = message.chat.id if message.chat else None
    if not is_admin and chat_id is not None:
        try:
            chat_id_int = int(chat_id)
        except (TypeError, ValueError):
            chat_id_int = None
        if chat_id_int is not None:
            is_admin = is_admin or chat_id_int in tuple(int(x) for x in settings.admin_telegram_ids)
    logger.info(
        "Admin guard: user_id=%s chat_id=%s is_admin=%s",
        user_id,
        chat_id,
        is_admin,
    )
    return is_admin


def _admin_guard_query(query: types.CallbackQuery) -> bool:
    user_id = query.from_user.id if query.from_user else None
    chat_id = query.message.chat.id if query.message and query.message.chat else None
    is_admin = _require_admin(user_id)
    if not is_admin and chat_id is not None:
        try:
            chat_id_int = int(chat_id)
        except (TypeError, ValueError):
            chat_id_int = None
        if chat_id_int is not None:
            is_admin = is_admin or chat_id_int in tuple(int(x) for x in settings.admin_telegram_ids)
    logger.info(
        "Admin guard (callback): user_id=%s chat_id=%s is_admin=%s data=%s",
        user_id,
        chat_id,
        is_admin,
        query.data,
    )
    return is_admin


async def _get_admin_user_from_user(telegram_user: Optional[types.User]) -> Optional[User]:
    if not telegram_user:
        return None
    async with AsyncSessionLocal() as db:
        admin_user = await get_or_create_user(
            db=db,
            telegram_id=telegram_user.id,
            username=telegram_user.username,
            first_name=telegram_user.first_name,
            last_name=telegram_user.last_name,
            role="admin",
        )
        if admin_user.role != "admin":
            admin_user.role = "admin"
            await db.commit()
        return admin_user


async def _get_admin_user(message: types.Message) -> Optional[User]:
    return await _get_admin_user_from_user(message.from_user if message else None)


def _admin_menu_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="✅ Pending Models", callback_data="admin:pending_models")],
            [InlineKeyboardButton(text="🗂️ Pending Content", callback_data="admin:pending_content")],
            [InlineKeyboardButton(text="🧾 Pending Escrows", callback_data="admin:pending_escrows")],
            [InlineKeyboardButton(text="⚠️ Disputes", callback_data="admin:disputes")],
            [InlineKeyboardButton(text="💠 Crypto Approvals", callback_data="admin:pending_crypto")],
            [InlineKeyboardButton(text="📊 Stats", callback_data="admin:stats")],
            [InlineKeyboardButton(text="⛔ Ban User", callback_data="admin:ban_help")],
        ]
    )


def _admin_entry_keyboard() -> InlineKeyboardMarkup:
    if settings.webapp_url:
        admin_url = f"{settings.webapp_url.rstrip('/')}/admin"
        return InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text="Open Admin Console", web_app=WebAppInfo(url=admin_url))],
            ]
        )
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="Open Admin Console", callback_data="admin:webapp_missing")]]
    )


def _model_action_keyboard(user_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Review",
                    callback_data=f"admin:review_model:{user_id}",
                ),
                InlineKeyboardButton(
                    text="Approve",
                    callback_data=f"admin:approve_model:{user_id}",
                ),
                InlineKeyboardButton(
                    text="Reject",
                    callback_data=f"admin:reject_model:{user_id}",
                ),
            ]
        ]
    )


def _escrow_action_keyboard(escrow_ref: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Release",
                    callback_data=f"admin:release_escrow:{escrow_ref}",
                )
            ]
        ]
    )


def _content_action_keyboard(content_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Review",
                    callback_data=f"admin:review_content:{content_id}",
                ),
                InlineKeyboardButton(
                    text="Approve",
                    callback_data=f"admin:approve_content:{content_id}",
                ),
                InlineKeyboardButton(
                    text="Reject",
                    callback_data=f"admin:reject_content:{content_id}",
                ),
            ]
        ]
    )


def _gallery_cta_keyboard(
    webapp_url: Optional[str],
    content_id: int,
    model_telegram_id: int,
) -> Optional[InlineKeyboardMarkup]:
    if not webapp_url:
        return None
    base_url = webapp_url.rstrip("/")
    content_url = f"{base_url}/?content={content_id}"
    session_url = f"{base_url}/?model={model_telegram_id}"
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="Buy content", url=content_url),
                InlineKeyboardButton(text="Book session", url=session_url),
            ]
        ]
    )


async def _post_gallery_content(message_bot: Bot, content: DigitalContent, model: Optional[User]) -> None:
    if not settings.main_gallery_channel_id:
        return
    caption = f"{content.title} - ${content.price}\n{content.description}"
    keyboard = _gallery_cta_keyboard(
        settings.webapp_url, content.id, model.telegram_id if model else 0
    )
    if content.telegram_file_id:
        try:
            if content.content_type == "photo":
                await message_bot.send_photo(
                    settings.main_gallery_channel_id,
                    content.telegram_file_id,
                    caption=caption,
                    protect_content=True,
                    has_spoiler=True,
                    reply_markup=keyboard,
                )
            else:
                await message_bot.send_video(
                    settings.main_gallery_channel_id,
                    content.telegram_file_id,
                    caption=caption,
                    protect_content=True,
                    has_spoiler=True,
                    reply_markup=keyboard,
                )
            return
        except Exception as exc:
            logger.warning("Failed to send gallery media: %s", exc)
            await _transfer_media_to_admin_target(
                message_bot,
                settings.main_gallery_channel_id,
                content.content_type or "photo",
                content.telegram_file_id,
                caption=caption,
            )
            return
    await message_bot.send_message(
        settings.main_gallery_channel_id,
        f"New content drop:\n{content.title} - ${content.price}\n{content.description}",
        reply_markup=keyboard,
    )


def _crypto_action_keyboard(transaction_ref: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Approve",
                    callback_data=f"admin:approve_crypto:{transaction_ref}",
                ),
                InlineKeyboardButton(
                    text="Reject",
                    callback_data=f"admin:reject_crypto:{transaction_ref}",
                ),
            ]
        ]
    )


def _dispute_action_keyboard(escrow_ref: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Release",
                    callback_data=f"admin:resolve_dispute:{escrow_ref}:release",
                ),
                InlineKeyboardButton(
                    text="Refund",
                    callback_data=f"admin:resolve_dispute:{escrow_ref}:refund",
                ),
            ]
        ]
    )


def _init_sentry():
    if settings.sentry_dsn:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            integrations=[AioHttpIntegration()],
            traces_sample_rate=0.1,
        )


def _require_bot_token() -> str:
    if not settings.admin_bot_token:
        raise RuntimeError("ADMIN_BOT_TOKEN is required")
    return settings.admin_bot_token


def _require_webhook_base_url() -> str:
    if not settings.admin_bot_webhook_base_url:
        raise RuntimeError("ADMIN_BOT_WEBHOOK_URL (or ADMIN_BOT_WEBHOOK_BASE_URL) is required")
    return settings.admin_bot_webhook_base_url.rstrip("/")


async def admin_start_handler(message: types.Message):
    user_id = message.from_user.id if message.from_user else None
    logger.info(
        "Admin check: user_id=%s admins=%s",
        user_id,
        settings.admin_telegram_ids,
    )
    is_admin = _require_admin(user_id)
    logger.info("Admin allowed=%s user_id_type=%s", is_admin, type(user_id).__name__)
    if not is_admin:
        try:
            await message.answer("Admin access required.")
            logger.info("Admin denial sent to chat_id=%s", message.chat.id)
        except Exception as exc:
            logger.warning("Failed to send admin denial: %s", exc)
        return
    try:
        await message.bot.send_message(
            message.chat.id,
            "Admin console 🛡️\nOpen the admin app to continue.",
            reply_markup=_admin_entry_keyboard(),
        )
        logger.info("Admin dashboard sent to chat_id=%s", message.chat.id)
    except Exception as exc:
        logger.warning("Failed to send admin dashboard: %s", exc)


async def whoami_handler(message: types.Message):
    user_id = message.from_user.id if message.from_user else None
    is_admin = _require_admin(user_id)
    await message.answer(
        f"Bot: {message.bot.id}\nUser: {user_id}\nAdmin: {is_admin}\nAdmins: {settings.admin_telegram_ids}"
    )


async def pending_models_handler(message: types.Message):
    if not _admin_guard(message):
        await message.answer("Admin access required.")
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ModelProfile).where(ModelProfile.verification_status == "submitted")
        )
        models = list(result.scalars().all())

    if not models:
        await message.answer("No pending models.")
        return

    await message.answer("Pending model verifications:")
    async with AsyncSessionLocal() as db:
        for item in models[:20]:
            user = await db.get(User, item.user_id)
            public_id = user.public_id if user else str(item.user_id)
            await message.answer(
                f"User ID: {public_id}\nName: {item.display_name or 'N/A'}",
                reply_markup=_model_action_keyboard(item.user_id),
            )


async def pending_content_handler(message: types.Message):
    if not _admin_guard(message):
        await message.answer("Admin access required.")
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(DigitalContent).where(DigitalContent.is_active.is_(False))
        )
        items = list(result.scalars().all())

    if not items:
        await message.answer("No pending content.")
        return

    await message.answer("Pending content approvals:")
    async with AsyncSessionLocal() as db:
        for content in items[:20]:
            user = await db.get(User, content.model_id)
            public_id = user.public_id if user else str(content.model_id)
            await message.answer(
                f"Content #{content.id}\nModel: {public_id}\n{content.title} - ${content.price}",
                reply_markup=_content_action_keyboard(content.id),
            )


async def pending_crypto_handler(message: types.Message):
    if not _admin_guard(message):
        await message.answer("Admin access required.")
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Transaction).where(
                Transaction.payment_provider == "crypto",
                Transaction.status == "pending_review",
            )
        )
        items = list(result.scalars().all())

    if not items:
        await message.answer("No pending crypto approvals.")
        return

    await message.answer("Pending crypto approvals:")
    for tx in items[:20]:
        metadata = tx.metadata_json or {}
        network = metadata.get("crypto_network") or "-"
        currency = metadata.get("crypto_currency") or "-"
        tx_hash = metadata.get("crypto_tx_hash") or "-"
        await message.answer(
            f"Transaction ref: {tx.transaction_ref}\n"
            f"Amount: {tx.amount}\n"
            f"User ID: {tx.user_id}\n"
            f"Network: {network}\n"
            f"Currency: {currency}\n"
            f"Tx hash: {tx_hash}",
            reply_markup=_crypto_action_keyboard(tx.transaction_ref),
        )


async def stats_handler(message: types.Message):
    if not _admin_guard(message):
        await message.answer("Admin access required.")
        return

    async with AsyncSessionLocal() as db:
        total_users = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
        total_models = (
            await db.execute(
                select(func.count()).select_from(User).where(User.role == "model")
            )
        ).scalar() or 0
        pending_models = (
            await db.execute(
                select(func.count()).select_from(ModelProfile).where(
                    ModelProfile.verification_status == "submitted"
                )
            )
        ).scalar() or 0
        held_escrows = (
            await db.execute(
                select(func.count()).select_from(EscrowAccount).where(
                    EscrowAccount.status == "held"
                )
            )
        ).scalar() or 0
        disputed_escrows = (
            await db.execute(
                select(func.count()).select_from(EscrowAccount).where(
                    EscrowAccount.status == "disputed"
                )
            )
        ).scalar() or 0
        total_volume = (
            await db.execute(select(func.coalesce(func.sum(Transaction.amount), 0)))
        ).scalar() or 0

    await message.answer(
        "Platform stats 📊\n"
        f"Users: {total_users}\n"
        f"Models: {total_models}\n"
        f"Pending models: {pending_models}\n"
        f"Held escrows: {held_escrows}\n"
        f"Disputed escrows: {disputed_escrows}\n"
        f"Total volume: {total_volume}"
    )


async def review_model_handler(message: types.Message):
    if not _admin_guard(message):
        await message.answer("Admin access required.")
        return

    args = (message.text or "").strip().split()[1:]
    if len(args) < 1:
        await message.answer("Usage: /review_model <user_id>")
        return

    user_id = await _resolve_user_id(args[0])
    if not user_id:
        await message.answer("Invalid user id.")
        return
    await _send_review_media(message.bot, message.chat.id, user_id)


async def _resolve_user_id(raw_value: str) -> Optional[int]:
    if raw_value.isdigit():
        return int(raw_value)
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.public_id == raw_value))
        user = result.scalar_one_or_none()
        return user.id if user else None


async def _send_review_media(admin_bot: Bot, chat_id: int, user_id: int) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ModelProfile).where(ModelProfile.user_id == user_id))
        profile = result.scalar_one_or_none()
        if not profile:
            await admin_bot.send_message(chat_id, "Model profile not found.")
            return

    public_id = None
    async with AsyncSessionLocal() as db:
        user = await db.get(User, user_id)
        public_id = user.public_id if user else None
    await admin_bot.send_message(
        chat_id,
        f"Verification media for user {public_id or user_id} ({profile.display_name or 'N/A'})",
    )
    if profile.verification_photos:
        for file_id in profile.verification_photos:
            try:
                await admin_bot.send_photo(chat_id, file_id)
            except Exception as exc:
                logger.warning("Failed to send verification photo: %s", exc)
                await _transfer_media_to_admin_target(admin_bot, chat_id, "photo", file_id)
    if profile.verification_video_url:
        try:
            await admin_bot.send_video(chat_id, profile.verification_video_url)
        except Exception as exc:
            logger.warning("Failed to send verification video via URL: %s", exc)
    elif profile.verification_video_file_id:
        try:
            await admin_bot.send_video(chat_id, profile.verification_video_file_id)
        except Exception as exc:
            logger.warning("Failed to send verification video: %s", exc)
            await _transfer_media_to_admin_target(
                admin_bot, chat_id, "video", profile.verification_video_file_id
            )
    else:
        await admin_bot.send_message(chat_id, "No verification video on file.")


async def _transfer_media_to_admin_target(
    admin_bot: Bot,
    chat_id: int,
    media_type: str,
    file_id: str,
    caption: Optional[str] = None,
) -> None:
    if not settings.user_bot_token:
        logger.warning("USER_BOT_TOKEN not configured; cannot fetch media.")
        return
    user_bot = Bot(token=settings.user_bot_token)
    file_path = None
    try:
        tg_file = await user_bot.get_file(file_id)
        file_path = tg_file.file_path
    except Exception as exc:
        logger.warning("Failed to fetch file path via user bot: %s", exc)
    finally:
        await user_bot.session.close()

    if not file_path:
        logger.warning("No file path available for media transfer.")
        return

    url = f"https://api.telegram.org/file/bot{settings.user_bot_token}/{file_path}"
    try:
        async with ClientSession() as session:
            async with session.get(url) as resp:
                resp.raise_for_status()
                data = await resp.read()
        filename = "verification.mp4" if media_type == "video" else "verification.jpg"
        buffered = BufferedInputFile(data, filename)
        if media_type == "photo":
            await admin_bot.send_photo(chat_id, buffered, caption=caption)
        elif media_type == "video":
            await admin_bot.send_video(chat_id, buffered, caption=caption)
        else:
            logger.warning("Unsupported media type: %s", media_type)
    except Exception as exc:
        logger.warning("Failed to transfer media via admin bot: %s", exc)


async def _send_content_review_media(admin_bot: Bot, chat_id: int, content_id: int) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(DigitalContent).where(DigitalContent.id == content_id))
        content = result.scalar_one_or_none()
        if not content:
            await admin_bot.send_message(chat_id, "Content not found.")
            return
        user = await db.get(User, content.model_id)

    public_id = user.public_id if user else str(content.model_id)
    await admin_bot.send_message(
        chat_id,
        f"Content #{content.id}\nModel: {public_id}\n{content.title} - ${content.price}\n{content.description}",
        reply_markup=_content_action_keyboard(content.id),
    )
    if content.telegram_file_id:
        try:
            if content.content_type == "photo":
                await admin_bot.send_photo(chat_id, content.telegram_file_id)
            else:
                await admin_bot.send_video(chat_id, content.telegram_file_id)
        except Exception as exc:
            logger.warning("Failed to send content media: %s", exc)
            await _transfer_media_to_admin_target(
                admin_bot,
                chat_id,
                content.content_type or "photo",
                content.telegram_file_id,
            )




async def _notify_model(telegram_id: int, text: str) -> None:
    if settings.user_bot_token:
        bot = Bot(token=settings.user_bot_token)
        try:
            await bot.send_message(telegram_id, text)
            return
        except Exception as exc:
            logger.warning("User bot notify failed: %s", exc)
        finally:
            await bot.session.close()
    if not settings.admin_bot_token:
        return
    admin_bot = Bot(token=settings.admin_bot_token)
    try:
        await admin_bot.send_message(telegram_id, text)
    except Exception as exc:
        logger.warning("Admin bot notify failed: %s", exc)
    finally:
        await admin_bot.session.close()


async def _approve_model(user_id: int, admin_id: int) -> Optional[int]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ModelProfile).where(ModelProfile.user_id == user_id))
        profile = result.scalar_one_or_none()
        if not profile:
            raise ValueError("Model profile not found.")
        user = await db.get(User, user_id)
        if user:
            user.role = "model"
            user.status = "active"
        profile.verification_status = "approved"
        profile.approved_by = admin_id
        profile.approved_at = utcnow()
        db.add(
            AdminAction(
                admin_id=admin_id,
                action_type="approve_model",
                target_user_id=user_id,
                target_type="model_profile",
                target_id=profile.id,
                details={"status": "approved"},
            )
        )
        await db.commit()

    return user.telegram_id if user else None


async def approve_model_handler(message: types.Message):
    if not _admin_guard(message):
        await message.answer("Admin access required.")
        return

    args = (message.text or "").strip().split()[1:]
    if len(args) < 1:
        await message.answer("Usage: /approve_model <user_id>")
        return

    user_id = await _resolve_user_id(args[0])
    if not user_id:
        await message.answer("Invalid user id.")
        return

    admin_user = await _get_admin_user(message)
    if not admin_user:
        await message.answer("Admin access required.")
        return
    try:
        telegram_id = await _approve_model(user_id, admin_user.id)
        await message.answer(f"Model {user_id} approved.")
        if telegram_id:
            await _notify_model(telegram_id, "Your model verification has been approved ✅")
    except ValueError as exc:
        await message.answer(str(exc))


async def _reject_model(user_id: int, admin_id: int) -> Optional[int]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ModelProfile).where(ModelProfile.user_id == user_id))
        profile = result.scalar_one_or_none()
        if not profile:
            raise ValueError("Model profile not found.")
        user = await db.get(User, user_id)
        if user:
            user.status = "inactive"
        profile.verification_status = "rejected"
        profile.approved_by = admin_id
        profile.approved_at = utcnow()
        db.add(
            AdminAction(
                admin_id=admin_id,
                action_type="reject_model",
                target_user_id=user_id,
                target_type="model_profile",
                target_id=profile.id,
                details={"status": "rejected"},
            )
        )
        await db.commit()

    return user.telegram_id if user else None


async def reject_model_handler(message: types.Message):
    if not _admin_guard(message):
        await message.answer("Admin access required.")
        return

    args = (message.text or "").strip().split()[1:]
    if len(args) < 1:
        await message.answer("Usage: /reject_model <user_id>")
        return

    user_id = await _resolve_user_id(args[0])
    if not user_id:
        await message.answer("Invalid user id.")
        return

    admin_user = await _get_admin_user(message)
    if not admin_user:
        await message.answer("Admin access required.")
        return
    try:
        telegram_id = await _reject_model(user_id, admin_user.id)
        await message.answer(f"Model {user_id} rejected.")
        if telegram_id:
            await _notify_model(
                telegram_id,
                "Your model verification was rejected. Contact support for details.",
            )
    except ValueError as exc:
        await message.answer(str(exc))


async def approve_content_handler(message: types.Message):
    if not _admin_guard(message):
        await message.answer("Admin access required.")
        return

    args = (message.text or "").strip().split()[1:]
    if len(args) < 1:
        await message.answer("Usage: /approve_content <content_id>")
        return

    try:
        content_id = int(args[0])
    except ValueError:
        await message.answer("Invalid content id.")
        return

    admin_user = await _get_admin_user(message)
    if not admin_user:
        await message.answer("Admin access required.")
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(DigitalContent).where(DigitalContent.id == content_id))
        content = result.scalar_one_or_none()
        if not content:
            await message.answer("Content not found.")
            return
        profile = await db.execute(
            select(ModelProfile).where(ModelProfile.user_id == content.model_id)
        )
        model_profile = profile.scalar_one_or_none()
        if not model_profile or model_profile.verification_status != "approved":
            await message.answer("Model is not approved. Cannot approve content.")
            return
        content.is_active = True
        db.add(AdminAction(
            admin_id=admin_user.id,
            action_type="approve_content",
            target_type="digital_content",
            target_id=content.id,
            details={"status": "approved"},
        ))
        await db.commit()

    await message.answer(f"Content #{content_id} approved.")
    model = None
    async with AsyncSessionLocal() as db:
        model = await db.get(User, content.model_id)
    await _post_gallery_content(message.bot, content, model)


async def reject_content_handler(message: types.Message):
    if not _admin_guard(message):
        await message.answer("Admin access required.")
        return

    args = (message.text or "").strip().split()[1:]
    if len(args) < 1:
        await message.answer("Usage: /reject_content <content_id>")
        return

    try:
        content_id = int(args[0])
    except ValueError:
        await message.answer("Invalid content id.")
        return

    admin_user = await _get_admin_user(message)
    if not admin_user:
        await message.answer("Admin access required.")
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(DigitalContent).where(DigitalContent.id == content_id))
        content = result.scalar_one_or_none()
        if not content:
            await message.answer("Content not found.")
            return
        content.is_active = False
        db.add(AdminAction(
            admin_id=admin_user.id,
            action_type="reject_content",
            target_type="digital_content",
            target_id=content.id,
            details={"status": "rejected"},
        ))
        await db.commit()

        await message.answer(f"Content #{content_id} rejected.")


async def ban_user_handler(message: types.Message):
    if not _admin_guard(message):
        await message.answer("Admin access required.")
        return
    args = (message.text or "").strip().split()[1:]
    if len(args) < 1:
        await message.answer("Usage: /ban_user <user_id>")
        return
    user_id = await _resolve_user_id(args[0])
    if not user_id:
        await message.answer("Invalid user id.")
        return
    admin_user = await _get_admin_user(message)
    if not admin_user:
        await message.answer("Admin access required.")
        return
    async with AsyncSessionLocal() as db:
        user = await db.get(User, user_id)
        if not user:
            await message.answer("User not found.")
            return
        user.status = "banned"
        db.add(
            AdminAction(
                admin_id=admin_user.id,
                action_type="ban_user",
                target_user_id=user_id,
                target_type="user",
                target_id=user.id,
                details={"status": "banned"},
            )
        )
        await db.commit()
    await message.answer(f"User {user_id} banned.")
    if user.telegram_id:
        await _notify_model(user.telegram_id, "Your account has been suspended by admin.")


async def unban_user_handler(message: types.Message):
    if not _admin_guard(message):
        await message.answer("Admin access required.")
        return
    args = (message.text or "").strip().split()[1:]
    if len(args) < 1:
        await message.answer("Usage: /unban_user <user_id>")
        return
    user_id = await _resolve_user_id(args[0])
    if not user_id:
        await message.answer("Invalid user id.")
        return
    admin_user = await _get_admin_user(message)
    if not admin_user:
        await message.answer("Admin access required.")
        return
    async with AsyncSessionLocal() as db:
        user = await db.get(User, user_id)
        if not user:
            await message.answer("User not found.")
            return
        user.status = "active"
        db.add(
            AdminAction(
                admin_id=admin_user.id,
                action_type="unban_user",
                target_user_id=user_id,
                target_type="user",
                target_id=user.id,
                details={"status": "active"},
            )
        )
        await db.commit()
    await message.answer(f"User {user_id} unbanned.")


async def pending_escrows_handler(message: types.Message):
    if not _admin_guard(message):
        await message.answer("Admin access required.")
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(EscrowAccount).where(EscrowAccount.status == "held").order_by(
                EscrowAccount.held_at.desc()
            )
        )
        escrows = list(result.scalars().all())

    if not escrows:
        await message.answer("No pending escrows.")
        return

    await message.answer("Held escrows:")
    for item in escrows[:20]:
        await message.answer(
            f"{item.escrow_ref}\nType: {item.escrow_type}\nAmount: {item.amount}",
            reply_markup=_escrow_action_keyboard(item.escrow_ref),
        )


async def disputes_handler(message: types.Message):
    if not _admin_guard(message):
        await message.answer("Admin access required.")
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(EscrowAccount).where(EscrowAccount.status == "disputed")
        )
        escrows = list(result.scalars().all())

    if not escrows:
        await message.answer("No active disputes.")
        return

    await message.answer("Disputed escrows:")
    for item in escrows[:20]:
        await message.answer(
            f"{item.escrow_ref}\nType: {item.escrow_type}\nAmount: {item.amount}",
            reply_markup=_dispute_action_keyboard(item.escrow_ref),
        )


async def resolve_dispute_handler(message: types.Message):
    if not _admin_guard(message):
        await message.answer("Admin access required.")
        return

    args = (message.text or "").strip().split()[1:]
    if len(args) < 2:
        await message.answer("Usage: /resolve_dispute <escrow_ref> <release|refund>")
        return

    escrow_ref, resolution = args[0], args[1].lower()
    await _resolve_dispute_by_ref(message, escrow_ref, resolution)


async def release_escrow_handler(message: types.Message):
    if not _admin_guard(message):
        await message.answer("Admin access required.")
        return

    args = (message.text or "").strip().split()[1:]
    if len(args) < 1:
        await message.answer("Usage: /release_escrow <escrow_ref>")
        return

    escrow_ref = args[0]
    await _release_escrow_by_ref(message, escrow_ref)


async def _release_escrow_by_ref(
    message: types.Message, escrow_ref: str, admin_user: Optional[User] = None
) -> None:
    admin_user = admin_user or await _get_admin_user(message)
    if not admin_user:
        await message.answer("Admin access required.")
        return
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(EscrowAccount).where(EscrowAccount.escrow_ref == escrow_ref)
        )
        escrow = result.scalar_one_or_none()
        if not escrow:
            await message.answer("Escrow not found.")
            return
        if escrow.escrow_type == "content":
            result = await db.execute(
                select(ContentPurchase).where(ContentPurchase.escrow_id == escrow.id)
            )
            purchase = result.scalar_one_or_none()
            content = await db.get(DigitalContent, escrow.related_id) if escrow.related_id else None
            buyer = await db.get(User, escrow.payer_id) if escrow.payer_id else None
            if not purchase or not content or not buyer:
                await message.answer("Content delivery failed: missing purchase or content.")
                return
            delivered = await _deliver_content_to_buyer(buyer, content)
            if not delivered:
                await message.answer("Content delivery failed. Escrow not released.")
                return
            purchase.status = "delivered"
        elif escrow.escrow_type == "access_fee":
            profile = await db.execute(
                select(ClientProfile).where(ClientProfile.access_fee_escrow_id == escrow.id)
            )
            client_profile = profile.scalar_one_or_none()
            if client_profile:
                client_profile.access_fee_paid = True
                client_profile.access_granted_at = utcnow()
        await release_escrow(db, escrow, reason="admin_release")
        db.add(
            AdminAction(
                admin_id=admin_user.id,
                action_type="release_escrow",
                target_type="escrow",
                target_id=escrow.id,
                details={"escrow_ref": escrow_ref},
            )
        )
        await db.commit()
        await message.answer(f"Escrow {escrow_ref} released.")
        if escrow.payer_id:
            payer = await db.get(User, escrow.payer_id)
            if payer:
                if escrow.escrow_type == "access_fee":
                    await send_user_message(
                        payer.telegram_id,
                        "Access granted ✅ Your gallery is now unlocked.",
                    )
                else:
                    await send_user_message(
                        payer.telegram_id,
                        f"Escrow {escrow_ref} has been released.",
                    )
        if escrow.receiver_id:
            receiver = await db.get(User, escrow.receiver_id)
            if receiver:
                await send_user_message(
                    receiver.telegram_id,
                    f"Escrow {escrow_ref} has been released.",
                )


async def _resolve_dispute_by_ref(
    message: types.Message,
    escrow_ref: str,
    resolution: str,
    admin_user: Optional[User] = None,
) -> None:
    if resolution not in {"release", "refund"}:
        await message.answer("Resolution must be release or refund.")
        return
    admin_user = admin_user or await _get_admin_user(message)
    if not admin_user:
        await message.answer("Admin access required.")
        return
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(EscrowAccount).where(EscrowAccount.escrow_ref == escrow_ref)
        )
        escrow = result.scalar_one_or_none()
        if not escrow:
            await message.answer("Escrow not found.")
            return

        if resolution == "release":
            await release_escrow(db, escrow, reason="dispute_release")
        else:
            await refund_escrow(db, escrow, reason="dispute_refund")

        db.add(
            AdminAction(
                admin_id=admin_user.id,
                action_type="resolve_dispute",
                target_type="escrow",
                target_id=escrow.id,
                details={"escrow_ref": escrow_ref, "resolution": resolution},
            )
        )
        await db.commit()
        await message.answer(f"Dispute resolved for {escrow_ref}: {resolution}.")
        if escrow.payer_id:
            payer = await db.get(User, escrow.payer_id)
            if payer:
                await send_user_message(
                    payer.telegram_id,
                    f"Dispute resolved for {escrow_ref}: {resolution}.",
                )
        if escrow.receiver_id:
            receiver = await db.get(User, escrow.receiver_id)
            if receiver:
                await send_user_message(
                    receiver.telegram_id,
                    f"Dispute resolved for {escrow_ref}: {resolution}.",
                )


async def admin_callback_handler(query: types.CallbackQuery):
    if not _admin_guard_query(query):
        await query.answer("Admin access required.", show_alert=True)
        return
    logger.info("Admin callback received: %s", query.data)
    data = query.data or ""
    if data == "admin:pending_models":
        await query.answer()
        await pending_models_handler(query.message)
        return
    if data == "admin:pending_content":
        await query.answer()
        await pending_content_handler(query.message)
        return
    if data == "admin:pending_escrows":
        await query.answer()
        await pending_escrows_handler(query.message)
        return
    if data == "admin:disputes":
        await query.answer()
        await disputes_handler(query.message)
        return
    if data == "admin:pending_crypto":
        await query.answer()
        await pending_crypto_handler(query.message)
        return
    if data == "admin:webapp_missing":
        await query.answer()
        await query.message.answer("Admin app URL is not configured yet.")
        return
    if data == "admin:stats":
        await query.answer()
        await stats_handler(query.message)
        return
    if data == "admin:ban_help":
        await query.answer()
        await query.message.answer("Use /ban_user <user_id> or /unban_user <user_id>.")
        return
    if data.startswith("admin:review_model:"):
        await query.answer()
        try:
            user_id = int(data.split(":", 2)[2])
        except (ValueError, IndexError):
            await query.message.answer("Invalid review payload.")
            return
        await _send_review_media(query.message.bot, query.message.chat.id, user_id)
        return
    if data.startswith("admin:review_content:"):
        await query.answer()
        try:
            content_id = int(data.split(":", 2)[2])
        except (ValueError, IndexError):
            await query.message.answer("Invalid content review payload.")
            return
        await _send_content_review_media(query.message.bot, query.message.chat.id, content_id)
        return
    if data.startswith("admin:approve_model:"):
        await query.answer()
        try:
            user_id = int(data.split(":", 2)[2])
        except (ValueError, IndexError):
            await query.message.answer("Invalid approval payload.")
            return
        try:
            admin_user = await _get_admin_user_from_user(query.from_user)
            if not admin_user:
                await query.message.answer("Admin access required.")
                return
            telegram_id = await _approve_model(user_id, admin_user.id)
            await query.message.answer(f"Model {user_id} approved.")
            if telegram_id:
                await _notify_model(
                    telegram_id,
                    "Your model verification has been approved ✅",
                )
        except ValueError as exc:
            await query.message.answer(str(exc))
        return
    if data.startswith("admin:approve_content:"):
        await query.answer()
        try:
            content_id = int(data.split(":", 2)[2])
        except (ValueError, IndexError):
            await query.message.answer("Invalid content approval payload.")
            return
        admin_user = await _get_admin_user_from_user(query.from_user)
        if not admin_user:
            await query.message.answer("Admin access required.")
            return
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(DigitalContent).where(DigitalContent.id == content_id)
            )
            content = result.scalar_one_or_none()
            if not content:
                await query.message.answer("Content not found.")
                return
            profile = await db.execute(
                select(ModelProfile).where(ModelProfile.user_id == content.model_id)
            )
            model_profile = profile.scalar_one_or_none()
            if not model_profile or model_profile.verification_status != "approved":
                await query.message.answer("Model is not approved. Cannot approve content.")
                return
            content.is_active = True
            model = await db.get(User, content.model_id)
            db.add(
                AdminAction(
                    admin_id=admin_user.id,
                    action_type="approve_content",
                    target_type="digital_content",
                    target_id=content.id,
                    details={"status": "approved"},
                )
            )
            await db.commit()
        await query.message.answer(f"Content #{content_id} approved.")
        await _post_gallery_content(query.message.bot, content, model)
        return
    if data.startswith("admin:reject_model:"):
        await query.answer()
        try:
            user_id = int(data.split(":", 2)[2])
        except (ValueError, IndexError):
            await query.message.answer("Invalid rejection payload.")
            return
        try:
            admin_user = await _get_admin_user_from_user(query.from_user)
            if not admin_user:
                await query.message.answer("Admin access required.")
                return
            telegram_id = await _reject_model(user_id, admin_user.id)
            await query.message.answer(f"Model {user_id} rejected.")
            if telegram_id:
                await _notify_model(
                    telegram_id,
                    "Your model verification was rejected. Contact support for details.",
                )
        except ValueError as exc:
            await query.message.answer(str(exc))
        return
    if data.startswith("admin:reject_content:"):
        await query.answer()
        try:
            content_id = int(data.split(":", 2)[2])
        except (ValueError, IndexError):
            await query.message.answer("Invalid content rejection payload.")
            return
        admin_user = await _get_admin_user_from_user(query.from_user)
        if not admin_user:
            await query.message.answer("Admin access required.")
            return
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(DigitalContent).where(DigitalContent.id == content_id)
            )
            content = result.scalar_one_or_none()
            if not content:
                await query.message.answer("Content not found.")
                return
            content.is_active = False
            db.add(
                AdminAction(
                    admin_id=admin_user.id,
                    action_type="reject_content",
                    target_type="digital_content",
                    target_id=content.id,
                    details={"status": "rejected"},
                )
            )
            await db.commit()
        await query.message.answer(f"Content #{content_id} rejected.")
        return
    if data.startswith("admin:approve_crypto:"):
        await query.answer()
        tx_ref = data.split(":", 2)[2]
        admin_user = await _get_admin_user_from_user(query.from_user)
        if not admin_user:
            await query.message.answer("Admin access required.")
            return
        async with AsyncSessionLocal() as db:
            escrow = await process_transaction(
                db,
                transaction_ref=tx_ref,
                provider="crypto",
                payload={},
            )
            if not escrow:
                await query.message.answer("Transaction not found or already processed.")
                return
            db.add(
                AdminAction(
                    admin_id=admin_user.id,
                    action_type="approve_crypto",
                    target_type="transaction",
                    target_id=escrow.transaction_id,
                    details={"transaction_ref": tx_ref},
                )
            )
            await db.commit()
        await query.message.answer(f"Crypto payment approved for {tx_ref}.")
        return
    if data.startswith("admin:reject_crypto:"):
        await query.answer()
        tx_ref = data.split(":", 2)[2]
        admin_user = await _get_admin_user_from_user(query.from_user)
        if not admin_user:
            await query.message.answer("Admin access required.")
            return
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Transaction).where(Transaction.transaction_ref == tx_ref)
            )
            tx = result.scalar_one_or_none()
            if not tx:
                await query.message.answer("Transaction not found.")
                return
            tx.status = "rejected"
            db.add(
                AdminAction(
                    admin_id=admin_user.id,
                    action_type="reject_crypto",
                    target_type="transaction",
                    target_id=tx.id,
                    details={"transaction_ref": tx_ref},
                )
            )
            await db.commit()
            user = await db.get(User, tx.user_id)
            if user:
                await send_user_message(
                    user.telegram_id,
                    "Your crypto payment was rejected. Please contact support.",
                )
        await query.message.answer(f"Crypto payment rejected for {tx_ref}.")
        return
    if data.startswith("admin:release_escrow:"):
        await query.answer()
        try:
            escrow_ref = data.split(":", 2)[2]
        except IndexError:
            await query.message.answer("Invalid escrow payload.")
            return
        admin_user = await _get_admin_user_from_user(query.from_user)
        await _release_escrow_by_ref(query.message, escrow_ref, admin_user)
        return
    if data.startswith("admin:resolve_dispute:"):
        await query.answer()
        parts = data.split(":", 3)
        if len(parts) < 4:
            await query.message.answer("Invalid dispute payload.")
            return
        escrow_ref = parts[2]
        resolution = parts[3]
        admin_user = await _get_admin_user_from_user(query.from_user)
        await _resolve_dispute_by_ref(query.message, escrow_ref, resolution, admin_user)
        return


async def on_startup(bot: Bot):
    webhook_url = f"{_require_webhook_base_url()}{WEBHOOK_PATH}"
    logger.info("Setting webhook to %s", webhook_url)
    await bot.set_webhook(webhook_url, drop_pending_updates=True)
    if settings.webapp_url:
        admin_url = f"{settings.webapp_url.rstrip('/')}/admin"
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text="Open Admin Console", web_app=WebAppInfo(url=admin_url))
        )


async def on_shutdown(bot: Bot):
    await bot.delete_webhook()
    await bot.session.close()


def main():
    _init_sentry()

    bot = Bot(token=_require_bot_token())
    dp = Dispatcher()
    logger.info("Admin bot starting on %s:%s", settings.admin_bot_host, settings.admin_bot_port)

    dp.message.register(admin_start_handler, Command("start"))

    async def handle_startup(app: web.Application):
        await on_startup(bot)

    async def handle_shutdown(app: web.Application):
        await on_shutdown(bot)

    app = web.Application()
    app.on_startup.append(handle_startup)
    app.on_shutdown.append(handle_shutdown)

    from aiogram.webhook.aiohttp_server import SimpleRequestHandler, setup_application

    SimpleRequestHandler(dispatcher=dp, bot=bot).register(app, path=WEBHOOK_PATH)
    setup_application(app, dp, bot=bot)

    web.run_app(app, host=settings.admin_bot_host, port=settings.admin_bot_port)


if __name__ == "__main__":
    main()
