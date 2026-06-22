"""Закреплённая в чате карточка с записями клиента."""
from __future__ import annotations

import logging

from telegram import Bot, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.error import TelegramError

import db
from telegram_util import safe_bot_edit_message_text
import homework_db as hwdb
import ui_text

logger = logging.getLogger(__name__)

VISIT_IN_PERSON = "in_person"


def format_booking_card_text(user_id: int) -> str:
    import tzutil

    today = tzutil.admin_today().isoformat()
    bookings = db.get_user_upcoming_bookings(user_id, today)
    lines = [
        "📌 *Ваши записи*",
        "",
    ]
    if not bookings:
        lines.append("Пока нет предстоящих визитов.")
        lines.append("")
        lines.append("Нажмите «Записаться» в меню бота, чтобы выбрать время.")
    else:
        for b in bookings:
            mode = db.visit_type_label(b.get("visit_type") or VISIT_IN_PERSON)
            suffix = ui_text.client_booking_status_suffix(
                b.get("status") or "booked",
                b.get("evening_confirmed"),
            )
            when = ui_text.format_booking_when(
                b["book_date"], b["book_time"], user_id
            )
            lines.append(f"• {when}")
            lines.append(f"  {mode}{suffix}")
        lines.append("")
        lines.append("_Сообщение обновляется при новой записи или отмене._")
    return "\n".join(lines)


def _card_keyboard(user_id: int) -> InlineKeyboardMarkup:
    import tzutil

    today = tzutil.admin_today().isoformat()
    bookings = db.get_user_upcoming_bookings(user_id, today)
    rows = [
        [InlineKeyboardButton("📅 Записаться", callback_data="book_start")],
        [InlineKeyboardButton("📋 Управление записями", callback_data="my_bookings")],
    ]
    if len(bookings) > 1:
        rows.append(
            [InlineKeyboardButton("❌ Отменить все", callback_data="cancel_all_ask")]
        )
    return InlineKeyboardMarkup(rows)


async def refresh_booking_card(bot: Bot, user_id: int) -> None:
    """Отправить или обновить карточку записей; попытаться закрепить в чате."""
    hwdb.ensure_client(user_id)
    text = format_booking_card_text(user_id)
    kb = _card_keyboard(user_id)
    client = hwdb.get_client(user_id) or {}
    message_id = client.get("pin_message_id")

    if message_id:
        edited = await safe_bot_edit_message_text(
            bot,
            chat_id=user_id,
            message_id=message_id,
            text=text,
            reply_markup=kb,
            parse_mode="Markdown",
        )
        if edited is not None:
            new_id = getattr(edited, "message_id", message_id)
            if new_id != message_id:
                hwdb.set_pin_message_id(user_id, new_id)
            await _try_pin(bot, user_id, new_id)
            return
        logger.info("Не удалось обновить карточку %s", message_id)

    try:
        msg = await bot.send_message(
            user_id,
            text,
            reply_markup=kb,
            parse_mode="Markdown",
        )
    except TelegramError as e:
        logger.warning("Карточка записей не отправлена %s: %s", user_id, e)
        return

    hwdb.set_pin_message_id(user_id, msg.message_id)
    await _try_pin(bot, user_id, msg.message_id)


async def _try_pin(bot: Bot, user_id: int, message_id: int) -> None:
    try:
        await bot.pin_chat_message(
            chat_id=user_id,
            message_id=message_id,
            disable_notification=True,
        )
    except TelegramError as e:
        logger.debug("pin_chat_message %s: %s", user_id, e)
