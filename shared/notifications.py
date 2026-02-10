from typing import Optional

import logging
from aiogram import Bot
from aiogram.types import InlineKeyboardMarkup

from shared.config import settings

logger = logging.getLogger(__name__)


async def send_escrow_log(message: str) -> None:
    if not settings.escrow_log_channel_id or not settings.user_bot_token:
        return
    bot = Bot(token=settings.user_bot_token)
    try:
        await bot.send_message(settings.escrow_log_channel_id, message)
    finally:
        await bot.session.close()


async def send_user_message(telegram_id: int, message: str) -> None:
    if not settings.user_bot_token:
        return
    bot = Bot(token=settings.user_bot_token)
    try:
        await bot.send_message(telegram_id, message)
    finally:
        await bot.session.close()


async def send_admin_message(message: str, reply_markup: InlineKeyboardMarkup | None = None) -> None:
    if not settings.admin_bot_token or not settings.admin_telegram_ids:
        return
    bot = Bot(token=settings.admin_bot_token)
    try:
        for admin_id in settings.admin_telegram_ids:
            try:
                await bot.send_message(admin_id, message, reply_markup=reply_markup)
            except Exception as exc:
                logger.warning("Failed to send admin message to %s: %s", admin_id, exc)
    finally:
        await bot.session.close()
