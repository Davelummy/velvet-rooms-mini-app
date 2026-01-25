from pathlib import Path
import sys
from typing import Optional

from aiohttp import web
from aiogram import Bot, Dispatcher, F, types
from aiogram.filters import BaseFilter, Command
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    CallbackQuery,
    WebAppInfo,
    MenuButtonWebApp,
)
import logging
import sentry_sdk
from sentry_sdk.integrations.aiohttp import AioHttpIntegration
from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("user_bot")
from shared.config import settings
from shared.db import AsyncSessionLocal
from models import ClientProfile, DigitalContent, ModelProfile, Transaction, User
from bot.content_flow import (
    create_content,
    create_purchase_request,
    get_content_by_id,
    list_active_content,
    list_model_content,
    parse_content_args,
)
from shared.transactions import create_transaction
from shared.time_utils import utcnow
from shared.notifications import send_admin_message
from bot.session_flow import (
    create_session_request,
    get_or_create_user,
    get_escrow_for_session,
    get_session_by_ref,
    get_user_by_telegram_id,
    mark_session_confirmed,
    set_escrow_status,
    set_session_status,
    update_user_role,
)


WEBHOOK_PATH = "/webhook"

PENDING_REGISTRATIONS: dict[int, dict[str, str]] = {}
PENDING_VERIFICATIONS: set[int] = set()
PENDING_CRYPTO: dict[int, dict[str, str]] = {}


class PendingContentFilter(BaseFilter):
    async def __call__(self, message: types.Message) -> bool:
        return bool(message.from_user and message.from_user.id in PENDING_CONTENT)


class PendingCryptoFilter(BaseFilter):
    async def __call__(self, message: types.Message) -> bool:
        return bool(message.from_user and message.from_user.id in PENDING_CRYPTO)
PENDING_CONTENT: dict[int, dict[str, str]] = {}


def _require_bot_token() -> str:
    if not settings.user_bot_token:
        raise RuntimeError("USER_BOT_TOKEN (or BOT_TOKEN) is required")
    return settings.user_bot_token


def _require_webhook_base_url() -> str:
    if not settings.user_bot_webhook_base_url:
        raise RuntimeError("USER_BOT_WEBHOOK_URL (or WEBHOOK_BASE_URL) is required")
    return settings.user_bot_webhook_base_url.rstrip("/")


def _init_sentry():
    if settings.sentry_dsn:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            integrations=[AioHttpIntegration()],
            traces_sample_rate=0.1,
        )


def _role_selection_keyboard() -> InlineKeyboardMarkup:
    rows = []
    webapp = _webapp_button()
    if webapp:
        rows.append([webapp])
    rows += [
        [
            InlineKeyboardButton(text="🧑‍💼 I'm a Client", callback_data="role:client"),
            InlineKeyboardButton(text="✨ I'm a Model", callback_data="role:model"),
        ]
    ]
    rows.append([InlineKeyboardButton(text="ℹ️ Learn More", callback_data="menu:learn_more")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _client_onboarding_keyboard() -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(text="✅ Register as Client", callback_data="register:client")],
        [InlineKeyboardButton(text="🖼️ Browse Content", callback_data="action:list_content")],
        [InlineKeyboardButton(text="📘 How it works", callback_data="info:client")],
        [InlineKeyboardButton(text="⬅️ Back", callback_data="menu:role_select")],
    ]
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _model_onboarding_keyboard() -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(text="✅ Register as Model", callback_data="register:model")],
        [InlineKeyboardButton(text="📘 How it works", callback_data="info:model")],
        [InlineKeyboardButton(text="⬅️ Back", callback_data="menu:role_select")],
    ]
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _webapp_button() -> Optional[InlineKeyboardButton]:
    if not settings.webapp_url:
        return None
    return InlineKeyboardButton(text="Open Velvet Rooms", web_app=WebAppInfo(url=settings.webapp_url))


def _entry_keyboard() -> InlineKeyboardMarkup:
    webapp = _webapp_button()
    if webapp:
        return InlineKeyboardMarkup(inline_keyboard=[[webapp]])
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="Open Velvet Rooms", callback_data="menu:webapp_missing")]]
    )


def _client_menu_keyboard() -> InlineKeyboardMarkup:
    rows = []
    webapp = _webapp_button()
    if webapp:
        rows.append([webapp])
    rows += [
        [
            InlineKeyboardButton(text="🖼️ Browse Content", callback_data="action:list_content"),
            InlineKeyboardButton(text="💳 Buy Content", callback_data="action:buy_content"),
        ],
        [
            InlineKeyboardButton(text="📅 Book Session", callback_data="action:create_session"),
            InlineKeyboardButton(text="⚠️ Dispute Session", callback_data="action:dispute_session"),
        ],
        [
            InlineKeyboardButton(text="⏱️ Extend Session", callback_data="action:extend_session"),
        ],
    ]
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _model_menu_keyboard() -> InlineKeyboardMarkup:
    rows = []
    webapp = _webapp_button()
    if webapp:
        rows.append([webapp])
    rows += [
        [
            InlineKeyboardButton(text="▶️ Start Session", callback_data="action:start_session"),
            InlineKeyboardButton(text="✅ End Session", callback_data="action:end_session"),
        ],
    ]
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _model_verified_keyboard() -> InlineKeyboardMarkup:
    rows = []
    webapp = _webapp_button()
    if webapp:
        rows.append([webapp])
    rows += [
        [
            InlineKeyboardButton(text="➕ Add Content", callback_data="action:add_content"),
            InlineKeyboardButton(text="📂 My Content", callback_data="action:my_content"),
        ],
        [
            InlineKeyboardButton(text="▶️ Start Session", callback_data="action:start_session"),
            InlineKeyboardButton(text="✅ End Session", callback_data="action:end_session"),
        ],
    ]
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _content_type_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="📸 Photo", callback_data="content:type:photo"),
                InlineKeyboardButton(text="🎥 Video", callback_data="content:type:video"),
            ],
            [InlineKeyboardButton(text="Cancel", callback_data="content:cancel")],
        ]
    )


def _content_cancel_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="Cancel", callback_data="content:cancel")]]
    )


async def start_handler(message: types.Message):
    async with AsyncSessionLocal() as db:
        user = await get_or_create_user(
            db=db,
            telegram_id=message.from_user.id,
            username=message.from_user.username,
            first_name=message.from_user.first_name,
            last_name=message.from_user.last_name,
            role="unassigned",
        )
        if user.status == "banned":
            await message.answer("Your account has been suspended. Contact support.")
            return

    await message.answer(
        "Welcome to Velvet Rooms 👋\n"
        "Open the app to continue.",
        reply_markup=_entry_keyboard(),
    )


async def _handle_start_payload(message: types.Message, payload: str) -> None:
    if payload.startswith("content_"):
        content_id = payload.split("_", 1)[1]
        try:
            content_id_int = int(content_id)
        except ValueError:
            await message.answer("Invalid content link.")
            return
        async with AsyncSessionLocal() as db:
            content = await get_content_by_id(db, content_id_int)
            if not content or not content.is_active:
                await message.answer("Content not found or inactive.")
                return
            await message.answer(
                f"Content #{content.id}\n{content.title} - ${content.price}\n{content.description}\n"
                f"To purchase: /buy_content {content.id}"
            )
            return

    if payload.startswith("session_"):
        model_id = payload.split("_", 1)[1]
        try:
            model_id_int = int(model_id)
        except ValueError:
            await message.answer("Invalid model link.")
            return
        await message.answer(
            "Ready to book a session?\n"
            f"Use: /create_session {model_id_int} <type> <price> [duration_minutes]"
        )
        return

    await message.answer("Unknown link payload. Use /start to begin.")


async def menu_handler(message: types.Message):
    await message.answer(
        "Open the app to continue.",
        reply_markup=_entry_keyboard(),
    )


async def cancel_handler(message: types.Message):
    if not message.from_user:
        return
    user_id = message.from_user.id
    PENDING_REGISTRATIONS.pop(user_id, None)
    PENDING_CONTENT.pop(user_id, None)
    PENDING_CRYPTO.pop(user_id, None)
    PENDING_VERIFICATIONS.discard(user_id)
    await message.answer("Canceled. Use /menu to continue.")


async def register_model(message: types.Message):
    await message.answer(
        "Model registration is now handled in the mini app.",
        reply_markup=_entry_keyboard(),
    )


async def register_client(message: types.Message):
    await message.answer(
        "Client registration is now handled in the mini app.",
        reply_markup=_entry_keyboard(),
    )


async def _send_role_menu(message: types.Message, role: str):
    if role == "model":
        async with AsyncSessionLocal() as db:
            user = await get_user_by_telegram_id(db, message.from_user.id)
            model_profile = None
            if user:
                profile = await db.execute(
                    select(ModelProfile).where(ModelProfile.user_id == user.id)
                )
                model_profile = profile.scalar_one_or_none()
        if model_profile and model_profile.verification_status == "approved":
            keyboard = _model_verified_keyboard()
            text = (
                "Model dashboard ✨\n"
                "You are verified. Choose what to do next."
            )
        else:
            keyboard = _model_menu_keyboard()
            text = (
                "Model dashboard ✨\n"
                "Verification pending. Submit your verification video to get approved."
            )
    else:
        keyboard = _client_menu_keyboard()
        text = (
            "Client dashboard 🧑‍💼\n"
            "You are all set. Choose what to do next."
        )
    await message.answer(text, reply_markup=keyboard)


async def _send_onboarding_dashboard(message: types.Message, role: str) -> None:
    if role == "client":
        await message.answer(
            "Client onboarding 🧑‍💼\n"
            "Complete onboarding in the mini app.\n\n"
            "What you'll get:\n"
            "• Access to premium content\n"
            "• Direct session booking\n"
            "• Protected dispute flow\n\n"
            "Open the app to continue.",
            reply_markup=_entry_keyboard(),
        )
        return

    if role == "model":
        await message.answer(
            "Model onboarding ✨\n"
            "Complete onboarding in the mini app.\n\n"
            "What you'll get:\n"
            "• Sell content with previews\n"
            "• Run sessions end-to-end\n"
            "• Track your catalog & revenue\n\n"
            "Open the app to continue.",
            reply_markup=_entry_keyboard(),
        )
        return


async def _get_user_or_prompt_role(
    message: types.Message, user_id: int
) -> Optional[User]:
    async with AsyncSessionLocal() as db:
        user = await get_user_by_telegram_id(db, user_id)
        if not user:
            user = await get_or_create_user(
                db=db,
                telegram_id=user_id,
                username=message.from_user.username if message.from_user else None,
                first_name=message.from_user.first_name if message.from_user else None,
                last_name=message.from_user.last_name if message.from_user else None,
                role="unassigned",
            )
        if user.status == "banned":
            await message.answer("Your account has been suspended. Contact support.")
            return None
        if user.role == "unassigned":
            profile = await db.execute(
                select(ModelProfile).where(ModelProfile.user_id == user.id)
            )
            model_profile = profile.scalar_one_or_none()
            if model_profile and model_profile.verification_status == "approved":
                await update_user_role(db, user, "model")
                return user
            if model_profile and model_profile.verification_status in {"submitted", "pending"}:
                await message.answer("Verification pending. Await admin approval.")
                return None
            client_profile = await db.execute(
                select(ClientProfile).where(ClientProfile.user_id == user.id)
            )
            if client_profile.scalar_one_or_none():
                await update_user_role(db, user, "client")
                return user
            await message.answer(
                "Open the app to choose your role and continue.",
                reply_markup=_entry_keyboard(),
            )
            return None
    return user


async def _require_role_from_user_id(
    message: types.Message, user_id: int, role: str
) -> Optional[User]:
    user = await _get_user_or_prompt_role(message, user_id)
    if not user:
        return None
    if user.role != role:
        await message.answer(f"{role.title()} access required. Use /register_{role}.")
        return None
    return user


async def _require_role(message: types.Message, role: str) -> Optional[User]:
    if not message.from_user:
        await message.answer("Unable to identify user. Please try again.")
        return None
    return await _require_role_from_user_id(message, message.from_user.id, role)


async def _require_verified_model(message: types.Message) -> Optional[User]:
    user = await _require_role(message, "model")
    if not user:
        return None
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ModelProfile).where(ModelProfile.user_id == user.id)
        )
        model_profile = result.scalar_one_or_none()
        if not model_profile or model_profile.verification_status != "approved":
            await message.answer("Verification required before accessing this feature.")
            return None
    return user


async def _handle_role_selection(query: CallbackQuery, role: str):
    await query.answer()
    async with AsyncSessionLocal() as db:
        user = await get_or_create_user(
            db=db,
            telegram_id=query.from_user.id,
            username=query.from_user.username,
            first_name=query.from_user.first_name,
            last_name=query.from_user.last_name,
            role="unassigned",
        )

        if user.role == role:
            await _send_role_menu(query.message, role)
            return

        if role == "model":
            profile = await db.execute(
                select(ModelProfile).where(ModelProfile.user_id == user.id)
            )
            model_profile = profile.scalar_one_or_none()
            if model_profile and model_profile.verification_status == "approved":
                await update_user_role(db, user, "model")
                await _send_role_menu(query.message, "model")
                return

        if role == "client":
            profile = await db.execute(
                select(ClientProfile).where(ClientProfile.user_id == user.id)
            )
            if profile.scalar_one_or_none():
                await update_user_role(db, user, "client")
                await _send_role_menu(query.message, "client")
                return

    await _send_onboarding_dashboard(query.message, role)


async def _handle_register_selection(query: CallbackQuery, role: str):
    async with AsyncSessionLocal() as db:
        user = await get_or_create_user(
            db=db,
            telegram_id=query.from_user.id,
            username=query.from_user.username,
            first_name=query.from_user.first_name,
            last_name=query.from_user.last_name,
            role="unassigned",
        )
        if user.role != "unassigned" and user.role != role:
            await query.answer("You already registered in another role.")
            return

        await query.answer()
        await _start_registration_flow(query.message, query.from_user.id, role)


async def _start_registration_flow(message: types.Message, user_id: int, role: str):
    PENDING_REGISTRATIONS[user_id] = {"role": role, "step": "email"}
    await message.answer(
        "Please send your email to complete registration.",
    )


def _looks_like_email(value: str) -> bool:
    return "@" in value and "." in value


async def registration_input_handler(message: types.Message):
    if not message.from_user:
        return
    user_id = message.from_user.id
    if user_id not in PENDING_REGISTRATIONS:
        return
    if not message.text:
        await message.answer("Please send text for registration.")
        return
    if message.text.strip().startswith("/"):
        await message.answer("Please finish registration before using commands.")
        return

    state = PENDING_REGISTRATIONS[user_id]
    role = state["role"]
    step = state["step"]
    text = message.text.strip()

    if step == "email":
        if not _looks_like_email(text):
            await message.answer("That doesn't look like a valid email. Try again.")
            return

        async with AsyncSessionLocal() as db:
            user = await get_or_create_user(
                db=db,
                telegram_id=user_id,
                username=message.from_user.username,
                first_name=message.from_user.first_name,
                last_name=message.from_user.last_name,
                role="unassigned",
            )
            user.email = text
            await db.commit()
            await db.refresh(user)

            if role == "model":
                state["step"] = "display_name"
                await message.answer("Great! Send your display name.")
                return

            await update_user_role(db, user, "client")
            profile = await db.execute(
                select(ClientProfile).where(ClientProfile.user_id == user.id)
            )
            if not profile.scalar_one_or_none():
                db.add(ClientProfile(user_id=user.id))
                await db.commit()
            PENDING_REGISTRATIONS.pop(user_id, None)

        await message.answer(
            "Client registration complete ✅\n"
            "Use /pay_access to pay the access fee and unlock the gallery."
        )
        await _send_role_menu(message, "client")
        return

    if step == "display_name":
        if len(text) < 2:
            await message.answer("Display name is too short. Try again.")
            return
        async with AsyncSessionLocal() as db:
            user = await get_or_create_user(
                db=db,
                telegram_id=user_id,
                username=message.from_user.username,
                first_name=message.from_user.first_name,
                last_name=message.from_user.last_name,
                role="unassigned",
            )
            profile = await db.execute(
                select(ModelProfile).where(ModelProfile.user_id == user.id)
            )
            model_profile = profile.scalar_one_or_none()
            if not model_profile:
                model_profile = ModelProfile(
                    user_id=user.id,
                    display_name=text,
                )
                db.add(model_profile)
                await db.commit()
            else:
                model_profile.display_name = text
                await db.commit()

            state["step"] = "verification_video"

        await message.answer(
            "Almost done ✅\n"
            "Send a short verification video to complete registration."
        )
        return


async def registration_media_handler(message: types.Message):
    if not message.from_user:
        return
    user_id = message.from_user.id
    if user_id in PENDING_REGISTRATIONS:
        state = PENDING_REGISTRATIONS[user_id]
        if state["step"] != "verification_video":
            return
        if not message.video:
            await message.answer("Please send a short video for verification.")
            return

        await _submit_verification_video(message, user_id, message.video.file_id)
        PENDING_REGISTRATIONS.pop(user_id, None)
        await message.answer("Verification submitted. Await admin review.")
        return

    if user_id in PENDING_VERIFICATIONS:
        if not message.video:
            await message.answer("Please send a short video for verification.")
            return
        await _submit_verification_video(message, user_id, message.video.file_id)
        PENDING_VERIFICATIONS.discard(user_id)


async def _submit_verification_video(
    message: types.Message, user_id: int, video_file_id: str
) -> None:
    video_url = None
    video_path = None
    try:
        video_url, video_path = await _upload_verification_video_to_supabase(
            message, user_id, video_file_id
        )
    except Exception as exc:
        logger.warning("Supabase upload failed: %s", exc)
    async with AsyncSessionLocal() as db:
        user = await get_or_create_user(
            db=db,
            telegram_id=user_id,
            username=message.from_user.username,
            first_name=message.from_user.first_name,
            last_name=message.from_user.last_name,
            role="unassigned",
        )
        result = await db.execute(
            select(ModelProfile).where(ModelProfile.user_id == user.id)
        )
        model_profile = result.scalar_one_or_none()
        if not model_profile:
            model_profile = ModelProfile(user_id=user.id, display_name=user.first_name)
            db.add(model_profile)
            await db.commit()

        model_profile.verification_video_file_id = video_file_id
        model_profile.verification_video_url = video_url
        model_profile.verification_video_path = video_path
        model_profile.verification_status = "submitted"
        model_profile.verification_submitted_at = utcnow()
        await db.commit()

    await message.answer("Verification submitted. Await admin review.")
    await _notify_admins_verification(message, user, video_file_id)


async def _upload_verification_video_to_supabase(
    message: types.Message, user_id: int, video_file_id: str
) -> tuple[str | None, str | None]:
    if not settings.supabase_url or not settings.supabase_service_key:
        return None, None
    try:
        from supabase_storage import upload_file, get_public_url
    except Exception as exc:
        logger.warning("Supabase client unavailable: %s", exc)
        return None, None

    tg_file = await message.bot.get_file(video_file_id)
    if not tg_file or not tg_file.file_path:
        return None, None
    ext = ".mp4"
    if "." in tg_file.file_path:
        ext = "." + tg_file.file_path.rsplit(".", 1)[-1]
    remote_path = f"verifications/{user_id}/video{ext}"
    url = f"https://api.telegram.org/file/bot{_require_bot_token()}/{tg_file.file_path}"
    import tempfile
    from aiohttp import ClientSession

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_file:
        temp_path = temp_file.name
    async with ClientSession() as session:
        async with session.get(url) as resp:
            resp.raise_for_status()
            data = await resp.read()
    with open(temp_path, "wb") as handle:
        handle.write(data)

    upload_file(temp_path, settings.supabase_verification_bucket, remote_path)
    try:
        import os

        os.remove(temp_path)
    except OSError:
        pass
    public_url = get_public_url(settings.supabase_verification_bucket, remote_path)
    return public_url, remote_path


async def callback_handler(query: CallbackQuery):
    data = query.data or ""
    if data.startswith("role:"):
        role = data.split(":", 1)[1]
        await _handle_role_selection(query, role)
        return

    if data.startswith("register:"):
        role = data.split(":", 1)[1]
        await _handle_register_selection(query, role)
        return

    if data == "menu:role_select":
        await query.answer()
        await query.message.answer(
            "Open the app to continue.",
            reply_markup=_entry_keyboard(),
        )
        return

    if data == "menu:learn_more":
        await query.answer()
        await query.message.answer(
            "Velvet Rooms is a curated space for premium sessions and content.\n\n"
            "Clients:\n"
            "• Discover premium content\n"
            "• Book sessions securely\n\n"
            "Models:\n"
            "• Sell content\n"
            "• Run sessions end-to-end",
            reply_markup=_entry_keyboard(),
        )
        return
    if data == "menu:webapp_missing":
        await query.answer()
        await query.message.answer("Mini app URL is not configured yet.")
        return

    if data == "info:client":
        await query.answer()
        await query.message.answer(
            "Client guide 🧑‍💼\n"
            "1) Register as a client\n"
            "2) Browse content or book a session\n"
            "3) Pay and enjoy your experience\n\n"
            "Need help? Use /menu to return.",
            reply_markup=_client_onboarding_keyboard(),
        )
        return

    if data == "info:model":
        await query.answer()
        await query.message.answer(
            "Model guide ✨\n"
            "1) Register as a model\n"
            "2) Add content to your catalog\n"
            "3) Start and complete sessions\n\n"
            "Need help? Use /menu to return.",
            reply_markup=_model_onboarding_keyboard(),
        )
        return

    if data == "action:list_content":
        await query.answer()
        await list_content_handler(query.message)
        return

    if data == "action:my_content":
        await query.answer()
        await _send_my_content(query.message, query.from_user.id)
        return

    if data == "action:add_content":
        await query.answer()
        await start_content_flow(query.message)
        return

    if data == "action:buy_content":
        await query.answer()
        await query.message.answer("Usage: /buy_content <content_id>")
        return
    if data.startswith("content:type:"):
        await query.answer()
        content_type = data.split(":", 2)[2]
        await _set_content_type(query.message, content_type)
        return
    if data == "content:cancel":
        await query.answer()
        if query.from_user:
            PENDING_CONTENT.pop(query.from_user.id, None)
        await query.message.answer("Content creation canceled.")
        return
    if data == "crypto:cancel":
        await query.answer()
        if query.from_user:
            PENDING_CRYPTO.pop(query.from_user.id, None)
        await query.message.answer("Crypto payment canceled.")
        return
    if data.startswith("crypto:submit:"):
        await query.answer()
        if not query.from_user:
            return
        tx_ref = data.split(":", 2)[2]
        PENDING_CRYPTO[query.from_user.id] = {"step": "network", "transaction_ref": tx_ref}
        await query.message.answer(
            f"Select the network you used:\n{', '.join(_crypto_networks())}"
        )
        return

    if data == "action:create_session":
        await query.answer()
        await query.message.answer(
            "Usage: /create_session <model_telegram_id> <type> <price>"
        )
        return

    if data == "action:start_session":
        await query.answer()
        await query.message.answer("Usage: /start_session <session_ref>")
        return

    if data == "action:end_session":
        await query.answer()
        await query.message.answer("Usage: /end_session <session_ref>")
        return

    if data == "action:dispute_session":
        await query.answer()
        await query.message.answer(
            "Usage: /dispute_session <session_ref> <reason>"
        )
        return
    if data == "action:extend_session":
        await query.answer()
        await query.message.answer(
            "Usage: /extend_session <session_ref> <price>"
        )
        return


def _parse_args(message: types.Message) -> list[str]:
    if not message.text:
        return []
    return message.text.strip().split()[1:]


async def create_session_handler(message: types.Message):
    user = await _require_role(message, "client")
    if not user:
        return

    args = _parse_args(message)
    if len(args) < 3:
        await message.answer("Usage: /create_session <model_telegram_id> <type> <price> [duration_minutes]")
        return

    try:
        model_telegram_id = int(args[0])
        session_type = args[1]
        price = float(args[2])
        duration_minutes = int(args[3]) if len(args) > 3 else None
    except ValueError:
        await message.answer("Invalid arguments. Example: /create_session 123456 video 50 10")
        return

    async with AsyncSessionLocal() as db:
        profile = await db.execute(
            select(ClientProfile).where(ClientProfile.user_id == user.id)
        )
        client_profile = profile.scalar_one_or_none()
        if not client_profile or not client_profile.access_fee_paid:
            await message.answer("Access fee required. Use /pay_access to unlock bookings.")
            return
        client = await get_or_create_user(
            db=db,
            telegram_id=message.from_user.id,
            username=message.from_user.username,
            first_name=message.from_user.first_name,
            last_name=message.from_user.last_name,
            role="client",
        )
        model = await get_user_by_telegram_id(db, model_telegram_id)
        if not model or model.role != "model":
            await message.answer("Model not found or not registered as model.")
            return

        session, transaction = await create_session_request(
            db, client, model, session_type, price, duration_minutes=duration_minutes
        )
        await _send_payment_instructions(
            message,
            transaction.transaction_ref,
            f"Session request created: {session.session_ref}",
        )


async def start_session_handler(message: types.Message):
    user = await _require_verified_model(message)
    if not user:
        return

    args = _parse_args(message)
    if len(args) < 1:
        await message.answer("Usage: /start_session <session_ref>")
        return

    session_ref = args[0]
    async with AsyncSessionLocal() as db:
        session = await get_session_by_ref(db, session_ref)
        if not session:
            await message.answer("Session not found.")
            return

        user = await get_user_by_telegram_id(db, message.from_user.id)
        if not user or user.id != session.model_id:
            await message.answer("Only the model can start the session.")
            return

        session.started_at = utcnow()
        await set_session_status(db, session, "active")
        await message.answer(f"Session {session_ref} started.")


async def end_session_handler(message: types.Message):
    user = await _require_verified_model(message)
    if not user:
        return

    args = _parse_args(message)
    if len(args) < 1:
        await message.answer("Usage: /end_session <session_ref>")
        return

    session_ref = args[0]
    async with AsyncSessionLocal() as db:
        session = await get_session_by_ref(db, session_ref)
        if not session:
            await message.answer("Session not found.")
            return

        user = await get_user_by_telegram_id(db, message.from_user.id)
        if not user or user.id != session.model_id:
            await message.answer("Only the model can end the session.")
            return

        session.status = "awaiting_confirmation"
        session.client_confirmed = False
        session.model_confirmed = False
        session.ended_at = utcnow()
        await db.commit()
        await message.answer(
            f"Session {session_ref} ended. Waiting for both users to confirm.\n"
            f"Ask the client to run: /confirm_session {session_ref}"
        )
        client = await db.get(User, session.client_id)
        if client:
            await message.bot.send_message(
                client.telegram_id,
                f"Session {session_ref} ended. Confirm completion with /confirm_session {session_ref}.",
            )


async def dispute_session_handler(message: types.Message):
    user = await _get_user_or_prompt_role(message, message.from_user.id)
    if not user:
        return

    args = _parse_args(message)
    if len(args) < 2:
        await message.answer("Usage: /dispute_session <session_ref> <reason>")
        return

    session_ref = args[0]
    reason = " ".join(args[1:])
    async with AsyncSessionLocal() as db:
        session = await get_session_by_ref(db, session_ref)
        if not session:
            await message.answer("Session not found.")
            return

        user = await get_user_by_telegram_id(db, message.from_user.id)
        if not user or user.id not in {session.client_id, session.model_id}:
            await message.answer("Only participants can dispute a session.")
            return

        session.status = "disputed"
        escrow = await get_escrow_for_session(db, session.id)
        if escrow:
            await set_escrow_status(db, escrow, "disputed", reason=reason)
        else:
            await db.commit()
        await message.answer(f"Session {session_ref} disputed: {reason}")
        if settings.escrow_log_channel_id:
            await message.bot.send_message(
                settings.escrow_log_channel_id,
                f"Dispute opened for session {session_ref} by user {message.from_user.id}: {reason}",
            )


async def confirm_session_handler(message: types.Message):
    user = await _get_user_or_prompt_role(message, message.from_user.id)
    if not user:
        return

    args = _parse_args(message)
    if len(args) < 1:
        await message.answer("Usage: /confirm_session <session_ref>")
        return

    session_ref = args[0]
    async with AsyncSessionLocal() as db:
        session = await get_session_by_ref(db, session_ref)
        if not session:
            await message.answer("Session not found.")
            return

        if user.id == session.client_id:
            role = "client"
        elif user.id == session.model_id:
            role = "model"
        else:
            await message.answer("Only participants can confirm a session.")
            return

        session = await mark_session_confirmed(db, session, by_role=role)
        await message.answer(f"Confirmation received for {session_ref}.")
        if session.status == "awaiting_admin_release":
            escrow = await get_escrow_for_session(db, session.id)
            if escrow:
                await send_admin_message(
                    f"Session complete. Escrow release needed:\n{escrow.escrow_ref}",
                    reply_markup=InlineKeyboardMarkup(
                        inline_keyboard=[
                            [
                                InlineKeyboardButton(
                                    text="Release",
                                    callback_data=f"admin:release_escrow:{escrow.escrow_ref}",
                                ),
                                InlineKeyboardButton(
                                    text="Refund",
                                    callback_data=f"admin:resolve_dispute:{escrow.escrow_ref}:refund",
                                ),
                            ]
                        ]
                    ),
                )
            await message.answer(
                f"Session {session_ref} completed and is awaiting admin release."
            )
            other_id = session.model_id if role == "client" else session.client_id
            other = await db.get(User, other_id)
            if other:
                await message.bot.send_message(
                    other.telegram_id,
                    f"Session {session_ref} completed and is awaiting admin release.",
                )


async def extend_session_handler(message: types.Message):
    user = await _require_role(message, "client")
    if not user:
        return

    args = _parse_args(message)
    if len(args) < 2:
        await message.answer("Usage: /extend_session <session_ref> <price>")
        return

    session_ref = args[0]
    try:
        price = float(args[1])
    except ValueError:
        await message.answer("Invalid price. Example: /extend_session sess_123 2500")
        return

    async with AsyncSessionLocal() as db:
        session = await get_session_by_ref(db, session_ref)
        if not session:
            await message.answer("Session not found.")
            return
        if session.client_id != user.id:
            await message.answer("Only the client can request an extension.")
            return
        transaction = await create_transaction(
            db,
            user_id=user.id,
            transaction_type="extension",
            amount=price,
            metadata={
                "escrow_type": "extension",
                "session_id": session.id,
                "model_id": session.model_id,
            },
        )
        await db.commit()

    await _send_payment_instructions(
        message,
        transaction.transaction_ref,
        f"Extension request created for {session_ref}.",
    )


async def add_content_handler(message: types.Message):
    user = await _require_verified_model(message)
    if not user:
        return
    await start_content_flow(message)


async def list_content_handler(message: types.Message):
    user = await _require_role(message, "client")
    if not user:
        return

    async with AsyncSessionLocal() as db:
        profile = await db.execute(
            select(ClientProfile).where(ClientProfile.user_id == user.id)
        )
        client_profile = profile.scalar_one_or_none()
        if not client_profile or not client_profile.access_fee_paid:
            await message.answer("Access fee required. Use /pay_access to unlock the gallery.")
            return
        content_list = await list_active_content(db)
        if not content_list:
            await message.answer("No content available.")
            return

        lines = ["Available content:"]
        for item in content_list[:20]:
            lines.append(f"#{item.id} {item.title} - ${item.price}")
        await message.answer("\n".join(lines))


async def _send_my_content(message: types.Message, user_id: int):
    async with AsyncSessionLocal() as db:
        user = await _require_role_from_user_id(message, user_id, "model")
        if not user:
            return

        content_list = await list_model_content(db, user.id)
        if not content_list:
            await message.answer("You have no content yet.")
            return

        lines = ["Your content:"]
        for item in content_list[:20]:
            status = "active" if item.is_active else "pending"
            lines.append(f"#{item.id} {item.title} - ${item.price} ({status})")
        await message.answer("\n".join(lines))


async def my_content_handler(message: types.Message):
    if not message.from_user:
        await message.answer("Unable to identify user. Please try again.")
        return
    await _send_my_content(message, message.from_user.id)


async def buy_content_handler(message: types.Message):
    user = await _require_role(message, "client")
    if not user:
        return

    args = _parse_args(message)
    if len(args) < 1:
        await message.answer("Usage: /buy_content <content_id>")
        return

    try:
        content_id = int(args[0])
    except ValueError:
        await message.answer("Invalid content id.")
        return

    async with AsyncSessionLocal() as db:
        profile = await db.execute(
            select(ClientProfile).where(ClientProfile.user_id == user.id)
        )
        client_profile = profile.scalar_one_or_none()
        if not client_profile or not client_profile.access_fee_paid:
            await message.answer("Access fee required. Use /pay_access to unlock the gallery.")
            return
        content = await get_content_by_id(db, content_id)
        if not content or not content.is_active:
            await message.answer("Content not found or inactive.")
            return

        purchase, transaction = await create_purchase_request(db, content, user)
        await _send_payment_instructions(
            message,
            transaction.transaction_ref,
            f"Purchase request created for content #{content_id}.",
        )


async def pay_access_handler(message: types.Message):
    user = await _require_role(message, "client")
    if not user:
        return
    async with AsyncSessionLocal() as db:
        profile = await db.execute(
            select(ClientProfile).where(ClientProfile.user_id == user.id)
        )
        client_profile = profile.scalar_one_or_none()
        if not client_profile:
            client_profile = ClientProfile(user_id=user.id)
            db.add(client_profile)
            await db.commit()

        transaction = await create_transaction(
            db,
            user_id=user.id,
            transaction_type="access_fee",
            amount=5000,
            metadata={"escrow_type": "access_fee", "client_id": user.id},
        )
        await db.commit()

    await _send_payment_instructions(
        message,
        transaction.transaction_ref,
        "Access fee payment initiated.",
    )


def _crypto_available() -> bool:
    if settings.crypto_wallet_addresses:
        return True
    return bool(settings.crypto_wallet_address and settings.crypto_currency and settings.crypto_network)


def _crypto_networks() -> list[str]:
    return settings.crypto_networks or ([settings.crypto_network] if settings.crypto_network else [])


def _crypto_currencies() -> list[str]:
    return settings.crypto_currencies or ([settings.crypto_currency] if settings.crypto_currency else [])


def _crypto_keyboard(transaction_ref: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="I sent crypto",
                    callback_data=f"crypto:submit:{transaction_ref}",
                )
            ],
            [InlineKeyboardButton(text="Cancel", callback_data="crypto:cancel")],
        ]
    )


async def _send_payment_instructions(
    message: types.Message,
    transaction_ref: str,
    intro: str,
) -> None:
    lines = [
        intro,
        f"Transaction ref: {transaction_ref}",
        "Status: pending payment",
    ]
    if _crypto_available():
        networks = _crypto_networks()
        currencies = _crypto_currencies()
        lines.append(
            "Crypto available ✅\n"
            f"Supported networks: {', '.join(networks)}\n"
            f"Supported currencies: {', '.join(currencies)}"
        )
        if settings.crypto_wallet_addresses:
            lines.append("Wallets:")
            for network, address in settings.crypto_wallet_addresses.items():
                lines.append(f"{network}: {address}")
        else:
            lines.append(
                f"Send {settings.crypto_currency} on {settings.crypto_network} to:\n"
                f"{settings.crypto_wallet_address}"
            )
        lines.append(
            "Then tap 'I sent crypto' and submit the transaction hash."
        )
        await message.answer("\n".join(lines), reply_markup=_crypto_keyboard(transaction_ref))
        return
    lines.append("Complete payment via Paystack/Flutterwave to proceed.")
    await message.answer("\n".join(lines))


async def crypto_text_handler(message: types.Message):
    if not message.from_user or not message.text:
        return
    state = PENDING_CRYPTO.get(message.from_user.id)
    if not state:
        return
    step = state.get("step")
    text = message.text.strip()
    tx_ref = state.get("transaction_ref")
    if step == "network":
        networks = _crypto_networks()
        if text not in networks:
            await message.answer(f"Please choose a valid network: {', '.join(networks)}")
            return
        state["network"] = text
        state["step"] = "currency"
        await message.answer(f"Select currency: {', '.join(_crypto_currencies())}")
        return
    if step == "currency":
        currencies = _crypto_currencies()
        if text not in currencies:
            await message.answer(f"Please choose a valid currency: {', '.join(currencies)}")
            return
        state["currency"] = text
        state["step"] = "tx_hash"
        await message.answer("Send your crypto transaction hash now.")
        return
    if step != "tx_hash":
        return
    tx_hash = text
    if not tx_ref:
        await message.answer("Missing transaction ref. Start the crypto flow again.")
        PENDING_CRYPTO.pop(message.from_user.id, None)
        return
    if tx_hash.startswith("/"):
        await message.answer("Please send the transaction hash (not a command).")
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Transaction).where(Transaction.transaction_ref == tx_ref)
        )
        transaction = result.scalar_one_or_none()
        if not transaction:
            await message.answer("Transaction not found.")
            PENDING_CRYPTO.pop(message.from_user.id, None)
            return
        metadata = transaction.metadata_json or {}
        selected_network = state.get("network")
        if selected_network and settings.crypto_wallet_addresses:
            metadata["crypto_address"] = settings.crypto_wallet_addresses.get(
                selected_network, settings.crypto_wallet_address
            )
        metadata.update(
            {
                "crypto_tx_hash": tx_hash,
                "crypto_currency": state.get("currency") or settings.crypto_currency,
                "crypto_network": selected_network or settings.crypto_network,
            }
        )
        transaction.metadata_json = metadata
        transaction.payment_provider = "crypto"
        transaction.status = "pending_review"
        await db.commit()

    PENDING_CRYPTO.pop(message.from_user.id, None)
    await message.answer("Crypto payment submitted ✅ Await admin confirmation.")
    await _notify_admins_crypto(message, tx_ref)


async def _notify_admins_crypto(message: types.Message, transaction_ref: str) -> None:
    if not settings.admin_telegram_ids or not settings.admin_bot_token:
        logger.warning("Admin notification not configured; crypto approval pending.")
        return
    admin_bot = Bot(token=settings.admin_bot_token)
    keyboard = InlineKeyboardMarkup(
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
    for admin_id in settings.admin_telegram_ids:
        try:
            await admin_bot.send_message(
                admin_id,
                f"Crypto payment submitted ✅\nTransaction ref: {transaction_ref}",
                reply_markup=keyboard,
            )
        except Exception as exc:
            logger.warning("Failed to notify admin %s: %s", admin_id, exc)
    await admin_bot.session.close()


async def submit_verification_handler(message: types.Message):
    user = await _require_role(message, "model")
    if not user:
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ModelProfile).where(ModelProfile.user_id == user.id)
        )
        profile = result.scalar_one_or_none()
        if profile and profile.verification_status == "approved":
            await message.answer("You are already verified ✅")
            return

    if not message.video:
        PENDING_VERIFICATIONS.add(user.id)
        await message.answer("Send a short video to complete verification.")
        return

    photo_ids = [p.file_id for p in (message.photo or [])]
    video_id = message.video.file_id

    async with AsyncSessionLocal() as db:
        profile = await db.execute(
            select(ModelProfile).where(ModelProfile.user_id == user.id)
        )
        model_profile = profile.scalar_one_or_none()
        if not model_profile:
            model_profile = ModelProfile(user_id=user.id, display_name=user.first_name)
            db.add(model_profile)
            await db.commit()
        if photo_ids:
            model_profile.verification_photos = photo_ids
        if video_id:
            model_profile.verification_video_file_id = video_id
        model_profile.verification_status = "submitted"
        model_profile.verification_submitted_at = utcnow()
        await db.commit()

    await message.answer("Verification submitted. Await admin review.")
    await _notify_admins_verification(message, user, video_id, photo_ids)


async def _notify_admins_verification(
    message: types.Message,
    user: User,
    video_file_id: str,
    photo_ids: Optional[list[str]] = None,
) -> None:
    if not settings.admin_telegram_ids:
        logger.warning("ADMIN_TELEGRAM_IDS not set; cannot notify admins.")
        return
    if not settings.admin_bot_token:
        logger.warning("ADMIN_BOT_TOKEN not set; cannot notify admins.")
        return
    admin_bot = Bot(token=settings.admin_bot_token)
    admin_url = f"{settings.webapp_url.rstrip('/')}/admin" if settings.webapp_url else ""
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Open Admin Console",
                    web_app=WebAppInfo(url=admin_url),
                )
            ]
        ]
    )
    for admin_id in settings.admin_telegram_ids:
        try:
            await admin_bot.send_message(
                admin_id,
                f"New model verification submitted ✅\nUser ID: {user.public_id}\nOpen the admin console to review.",
                reply_markup=keyboard,
            )
        except Exception as exc:
            logger.warning("Failed to notify admin %s: %s", admin_id, exc)
    await admin_bot.session.close()


async def on_startup(bot: Bot):
    webhook_url = f"{_require_webhook_base_url()}{WEBHOOK_PATH}"
    logger.info("Setting webhook to %s", webhook_url)
    await bot.set_webhook(webhook_url, drop_pending_updates=True)
    if settings.webapp_url:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(
                text="Open Velvet Rooms",
                web_app=WebAppInfo(url=settings.webapp_url),
            )
        )


async def on_shutdown(bot: Bot):
    await bot.delete_webhook()
    await bot.session.close()


def main():
    _init_sentry()

    bot = Bot(token=_require_bot_token())
    dp = Dispatcher()
    logger.info("User bot starting on %s:%s", settings.user_bot_host, settings.user_bot_port)

    dp.message.register(start_handler, Command("start"))
    dp.message.register(menu_handler, Command("menu"))

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

    web.run_app(app, host=settings.user_bot_host, port=settings.user_bot_port)


async def start_content_flow(message: types.Message):
    if not message.from_user:
        return
    user = await _require_verified_model(message)
    if not user:
        return
    PENDING_CONTENT[message.from_user.id] = {"step": "type"}
    await message.answer(
        "Create new content ✨\nChoose the type:",
        reply_markup=_content_type_keyboard(),
    )


async def _set_content_type(message: types.Message, content_type: str):
    if not message.from_user:
        return
    state = PENDING_CONTENT.get(message.from_user.id)
    if not state:
        return
    state["content_type"] = content_type
    state["step"] = "price"
    await message.answer(
        "Enter price (numbers only):\nExample: 2500",
        reply_markup=_content_cancel_keyboard(),
    )


async def content_text_handler(message: types.Message):
    if not message.from_user or not message.text:
        return
    state = PENDING_CONTENT.get(message.from_user.id)
    if not state:
        return
    step = state.get("step")
    text = message.text.strip()
    if step == "price":
        try:
            price = float(text)
        except ValueError:
            await message.answer("Invalid price. Send a number like 2000.")
            return
        state["price"] = str(price)
        state["step"] = "title"
        await message.answer("Enter a short title:", reply_markup=_content_cancel_keyboard())
        return
    if step == "title":
        state["title"] = text
        state["step"] = "description"
        await message.answer("Enter a short description:", reply_markup=_content_cancel_keyboard())
        return
    if step == "description":
        state["description"] = text
        state["step"] = "media"
        await message.answer(
            "Send the photo or video file now.",
            reply_markup=_content_cancel_keyboard(),
        )
        return


async def content_media_handler(message: types.Message):
    if not message.from_user:
        return
    state = PENDING_CONTENT.get(message.from_user.id)
    if not state or state.get("step") != "media":
        return
    content_type = state.get("content_type")
    file_id = None
    if content_type == "photo" and message.photo:
        file_id = message.photo[-1].file_id
    if content_type == "video" and message.video:
        file_id = message.video.file_id
    if not file_id:
        await message.answer("Please send the correct media type.")
        return

    user = await _require_verified_model(message)
    if not user:
        return

    async with AsyncSessionLocal() as db:
        content = await create_content(
            db=db,
            model=user,
            content_type=content_type,
            price=float(state["price"]),
            title=state["title"],
            description=state["description"],
            telegram_file_id=file_id,
            preview_file_id=file_id,
        )

    PENDING_CONTENT.pop(message.from_user.id, None)
    await message.answer(
        f"Content submitted ✅\n"
        f"ID: {content.id}\n"
        "Your gallery has been updated and it's pending approval."
    )
    if settings.model_dashboard_channel_id:
        await message.bot.send_message(
            settings.model_dashboard_channel_id,
            f"Content approval needed:\n"
            f"#{content.id} {content.title} - ${content.price}\n"
            f"{content.description}\n"
            f"Model: @{message.from_user.username or message.from_user.id}",
        )
        if content_type == "photo":
            await message.bot.send_photo(settings.model_dashboard_channel_id, file_id)
        else:
            await message.bot.send_video(settings.model_dashboard_channel_id, file_id)

    await _notify_admins_content(message, content, file_id)


async def _notify_admins_content(
    message: types.Message,
    content: DigitalContent,
    file_id: str,
) -> None:
    if not settings.admin_telegram_ids:
        logger.warning("ADMIN_TELEGRAM_IDS not set; cannot notify admins.")
        return
    if not settings.admin_bot_token:
        logger.warning("ADMIN_BOT_TOKEN not set; cannot notify admins.")
        return
    admin_bot = Bot(token=settings.admin_bot_token)
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="Review content",
                    callback_data=f"admin:review_content:{content.id}",
                ),
                InlineKeyboardButton(
                    text="Approve",
                    callback_data=f"admin:approve_content:{content.id}",
                ),
                InlineKeyboardButton(
                    text="Reject",
                    callback_data=f"admin:reject_content:{content.id}",
                ),
            ]
        ]
    )
    for admin_id in settings.admin_telegram_ids:
        try:
            await admin_bot.send_message(
                admin_id,
                f"New content submitted ✅\nContent #{content.id}\n{content.title} - ${content.price}",
                reply_markup=keyboard,
            )
        except Exception as exc:
            logger.warning("Failed to notify admin %s: %s", admin_id, exc)
    await admin_bot.session.close()


if __name__ == "__main__":
    main()
