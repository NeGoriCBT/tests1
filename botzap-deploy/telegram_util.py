"""Безопасные ответы Telegram (просроченные callback, дубли edit, VPN)."""
from __future__ import annotations

import logging

from telegram.error import BadRequest, NetworkError, TimedOut

logger = logging.getLogger(__name__)


def _ignorable_callback_error(exc: BadRequest) -> bool:
    msg = str(exc).lower()
    return any(
        part in msg
        for part in (
            "query is too old",
            "query id is invalid",
            "query has already been answered",
            "response timeout expired",
        )
    )


async def safe_answer(query, *args, **kwargs) -> bool:
    """Снять «часики»; False если callback уже недействителен."""
    try:
        await query.answer(*args, **kwargs)
        return True
    except BadRequest as exc:
        if _ignorable_callback_error(exc):
            return False
        raise
    except (NetworkError, TimedOut) as exc:
        logger.warning("Telegram answer failed (network): %s", exc)
        return False


def _is_non_text_message_error(exc: BadRequest) -> bool:
    msg = str(exc).lower()
    return "no text" in msg or "message to edit not found" in msg


async def _replace_with_text_message(chat, text: str, **kwargs):
    """Удалить фото/устаревшее сообщение и отправить текстовое."""
    old = kwargs.pop("_old_message", None)
    if old is not None:
        try:
            await old.delete()
        except Exception:
            pass
    return await chat.send_message(text, **kwargs)


async def safe_edit_message_text(query, text: str, **kwargs):
    """edit_message_text без падения на «не изменено», фото и кратких обрывах VPN."""
    try:
        return await query.edit_message_text(text, **kwargs)
    except BadRequest as exc:
        low = str(exc).lower()
        if "message is not modified" in low:
            return None
        if _is_non_text_message_error(exc):
            msg = query.message
            if not msg:
                return None
            return await _replace_with_text_message(
                msg.chat, text, _old_message=msg, **kwargs
            )
        raise
    except (NetworkError, TimedOut) as exc:
        logger.warning("Telegram edit failed (network): %s", exc)
        msg = query.message
        if not msg:
            return None
        try:
            return await msg.reply_text(
                text + "\n\n_(экран обновлён — сеть)_",
                **kwargs,
            )
        except Exception as e2:
            logger.warning("Telegram reply fallback failed: %s", e2)
            return None


async def safe_bot_edit_message_text(
    bot, *, chat_id: int, message_id: int, text: str, **kwargs
):
    try:
        return await bot.edit_message_text(
            chat_id=chat_id, message_id=message_id, text=text, **kwargs
        )
    except BadRequest as exc:
        low = str(exc).lower()
        if "message is not modified" in low:
            return None
        if _is_non_text_message_error(exc):
            try:
                await bot.delete_message(chat_id=chat_id, message_id=message_id)
            except Exception:
                pass
            return await bot.send_message(chat_id=chat_id, text=text, **kwargs)
        raise
    except (NetworkError, TimedOut) as exc:
        logger.warning("Telegram bot edit failed (network): %s", exc)
        return None
