"""Сообщения клиенту от администратора через бота."""
from __future__ import annotations

from typing import Callable, Dict, Optional, Tuple

from telegram import InlineKeyboardButton, InlineKeyboardMarkup

import db
import homework_db as hwdb
import ui_text

MSG_CLIENT_KEY = "adm_msg_client"


def _client_name(client_id: int) -> str:
    client = hwdb.get_client(client_id) or {}
    return (client.get("display_name") or "").strip()


def _next_booking_line(client_id: int) -> str:
    b = hwdb.get_next_booking(client_id)
    if not b:
        return ""
    mode = db.visit_type_label(b.get("visit_type") or "in_person")
    when = ui_text.format_booking_when(
        b["book_date"], b["book_time"], client_id, admin_view=True
    )
    return f"{when} ({mode})"


def _tpl_remind(client_id: int) -> str:
    name = _client_name(client_id)
    when = _next_booking_line(client_id)
    greet = f"Здравствуйте{', ' + name if name else ''}!"
    if when:
        return (
            f"{greet}\n\n"
            f"Напоминаем о вашей записи:\n🗓 *{when}*\n\n"
            "Если планы изменились — напишите сюда или отмените запись в боте."
        )
    return (
        f"{greet}\n\n"
        "Напоминаем о предстоящей консультации. "
        "Если появятся вопросы — напишите в этот чат."
    )


def _tpl_reschedule(client_id: int) -> str:
    name = _client_name(client_id)
    when = _next_booking_line(client_id)
    base = f"Здравствуйте{', ' + name if name else ''}!"
    if when:
        return (
            f"{base}\n\n"
            f"По записи *{when}* предлагаем перенести время.\n"
            "Напишите, когда вам было бы удобно, или выберите новый слот в боте."
        )
    return (
        f"{base}\n\n"
        "Предлагаем перенести время консультации. "
        "Напишите, когда вам было бы удобно."
    )


def _tpl_delay(client_id: int) -> str:
    name = _client_name(client_id)
    when = _next_booking_line(client_id)
    base = f"Здравствуйте{', ' + name if name else ''}!"
    if when:
        return (
            f"{base}\n\n"
            f"К сожалению, по записи *{when}* нужно скорректировать время.\n"
            "Свяжитесь, пожалуйста, с нами в этом чате — подберём другой вариант."
        )
    return (
        f"{base}\n\n"
        "К сожалению, нужно скорректировать время консультации. "
        "Напишите, пожалуйста, в этот чат."
    )


TEMPLATES: Dict[str, Tuple[str, Callable[[int], str]]] = {
    "remind": ("🔔 Напоминание", _tpl_remind),
    "reschedule": ("📅 Перенос", _tpl_reschedule),
    "delay": ("⏱ Задержка / форс", _tpl_delay),
}


def message_menu_text(client_id: int) -> str:
    client = hwdb.get_client(client_id) or {}
    name = client.get("display_name") or f"id {client_id}"
    lines = [f"💬 *Сообщение клиенту*\n", f"👤 *{name}*", ""]
    nxt = _next_booking_line(client_id)
    if nxt:
        lines.append(f"📅 Следующая запись: *{nxt}*")
        lines.append("")
    lines.append("Выберите шаблон или свой текст:")
    return "\n".join(lines)


def message_menu_keyboard(client_id: int) -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(label, callback_data=f"adm_msg_tpl_{key}_{client_id}")]
        for key, (label, _) in TEMPLATES.items()
    ]
    rows.append(
        [
            InlineKeyboardButton(
                "✏️ Свой текст", callback_data=f"adm_msg_custom_{client_id}"
            )
        ]
    )
    rows.append(
        [InlineKeyboardButton("◀️ Профиль", callback_data=f"adm_profile_{client_id}")]
    )
    return InlineKeyboardMarkup(rows)


def render_template(template_key: str, client_id: int) -> Optional[str]:
    entry = TEMPLATES.get(template_key)
    if not entry:
        return None
    return entry[1](client_id)


def custom_prompt_text(client_id: int) -> str:
    name = (hwdb.get_client(client_id) or {}).get("display_name") or str(client_id)
    return (
        f"✏️ *Свой текст — {name}*\n\n"
        "Отправьте *следующим сообщением* текст для клиента.\n"
        "_Клиент получит его от бота записи._"
    )


def custom_prompt_keyboard(client_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton(
                "◀️ Отмена", callback_data=f"adm_msg_{client_id}"
            )
        ]
    ])
