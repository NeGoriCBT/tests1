"""Часовые пояса: расписание в поясе админа, показ клиенту в его поясе."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import List, Optional, Tuple
from zoneinfo import ZoneInfo

import config

# (подпись для кнопки, IANA)
RUSSIAN_TIMEZONES: List[Tuple[str, str]] = [
    ("Калининград (UTC+2)", "Europe/Kaliningrad"),
    ("Москва, СПб (UTC+3)", "Europe/Moscow"),
    ("Самара (UTC+4)", "Europe/Samara"),
    ("Уфа, Екатеринбург (UTC+5)", "Asia/Yekaterinburg"),
    ("Омск (UTC+6)", "Asia/Omsk"),
    ("Красноярск (UTC+7)", "Asia/Krasnoyarsk"),
    ("Иркутск (UTC+8)", "Asia/Irkutsk"),
    ("Якутск (UTC+9)", "Asia/Yakutsk"),
    ("Владивосток (UTC+10)", "Asia/Vladivostok"),
    ("Магадан (UTC+11)", "Asia/Magadan"),
    ("Камчатка (UTC+12)", "Asia/Kamchatka"),
]

DEFAULT_USER_TZ = "Europe/Moscow"


def admin_zone() -> ZoneInfo:
    return ZoneInfo(config.ADMIN_TZ)


def zone(tz_name: str) -> ZoneInfo:
    return ZoneInfo(tz_name or DEFAULT_USER_TZ)


def admin_now() -> datetime:
    return datetime.now(admin_zone())


def admin_today() -> date:
    return admin_now().date()


def user_today(user_tz: str) -> date:
    return datetime.now(zone(user_tz)).date()


def tz_label(tz_name: str) -> str:
    for label, z in RUSSIAN_TIMEZONES:
        if z == tz_name:
            return label.split(" (")[0]
    return tz_name


def admin_slot_datetime(book_date: str, book_time: str) -> datetime:
    y, m, d = (int(x) for x in book_date.split("-"))
    hh, mm = (int(x) for x in book_time.split(":"))
    return datetime(y, m, d, hh, mm, tzinfo=admin_zone())


def format_time_in_tz(book_date: str, book_time: str, tz_name: str) -> str:
    dt = admin_slot_datetime(book_date, book_time)
    return dt.astimezone(zone(tz_name)).strftime("%H:%M")


def format_datetime_user(book_date: str, book_time: str, user_tz: str) -> str:
    """Для клиента: дата и время в его поясе."""
    import ui_text

    dt = admin_slot_datetime(book_date, book_time).astimezone(zone(user_tz))
    return f"{ui_text.format_date(dt.date())} в {dt.strftime('%H:%M')}"


def format_datetime_admin(book_date: str, book_time: str) -> str:
    """Для админа: дата и время в поясе кабинета."""
    import ui_text

    dt = admin_slot_datetime(book_date, book_time)
    return f"{ui_text.format_date(dt.date())} в {dt.strftime('%H:%M')}"


def display_time_buttons(
    book_date: str, admin_times: List[str], user_tz: str
) -> List[Tuple[str, str]]:
    """
    Список (время_в_базе_админа, подпись_на_кнопке) для клавиатуры.
  admin_times отсортированы.
    """
    user_tz_name = user_tz or DEFAULT_USER_TZ
    if user_tz_name == config.ADMIN_TZ:
        return [(t, t) for t in admin_times]

    out: List[Tuple[str, str]] = []
    for t in admin_times:
        label = format_time_in_tz(book_date, t, user_tz_name)
        out.append((t, label))
    return out


def timezone_picker_keyboard(back_callback: str = "menu_main") -> "InlineKeyboardMarkup":
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup

    rows = []
    for i, (label, _) in enumerate(RUSSIAN_TIMEZONES):
        rows.append(
            [InlineKeyboardButton(label, callback_data=f"tz_pick_{i}")]
        )
    rows.append([InlineKeyboardButton("◀️ Назад", callback_data=back_callback)])
    return InlineKeyboardMarkup(rows)


def timezone_by_index(index: int) -> Optional[str]:
    if 0 <= index < len(RUSSIAN_TIMEZONES):
        return RUSSIAN_TIMEZONES[index][1]
    return None
