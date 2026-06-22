"""Безопасное обновление сообщений в callback (текст / фото)."""
from __future__ import annotations

from telegram import InlineKeyboardMarkup

from telegram_util import safe_edit_message_text


async def edit_or_send(
    query,
    text: str,
    *,
    reply_markup: InlineKeyboardMarkup | None = None,
    parse_mode: str | None = "Markdown",
):
    """edit_message_text; если сообщение — фото/без текста, отправить новое."""
    await safe_edit_message_text(
        query, text, reply_markup=reply_markup, parse_mode=parse_mode
    )
