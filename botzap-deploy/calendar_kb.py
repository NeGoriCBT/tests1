from __future__ import annotations

from calendar import monthrange
from datetime import date
from typing import Callable, Optional

from telegram import InlineKeyboardButton, InlineKeyboardMarkup

MONTHS_RU = [
    "",
    "Январь",
    "Февраль",
    "Март",
    "Апрель",
    "Май",
    "Июнь",
    "Июль",
    "Август",
    "Сентябрь",
    "Октябрь",
    "Ноябрь",
    "Декабрь",
]


def build_calendar(
    year: int,
    month: int,
    day_available: Optional[Callable[[date], bool]] = None,
    today: Optional[date] = None,
) -> InlineKeyboardMarkup:
    """Календарь: прошлые и дни без слотов — неактивны."""
    if today is None:
        today = date.today()
    _, days_in_month = monthrange(year, month)
    first_weekday = date(year, month, 1).weekday()  # Mon=0

    keyboard = [
        [
            InlineKeyboardButton("◀", callback_data=f"cal_prev_{year}_{month}"),
            InlineKeyboardButton(f"{MONTHS_RU[month]} {year}", callback_data="cal_ignore"),
            InlineKeyboardButton("▶", callback_data=f"cal_next_{year}_{month}"),
        ],
        [
            InlineKeyboardButton(x, callback_data="cal_ignore")
            for x in ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
        ],
    ]

    row = []
    for _ in range(first_weekday):
        row.append(InlineKeyboardButton("·", callback_data="cal_ignore"))
    for day in range(1, days_in_month + 1):
        d = date(year, month, day)
        if d < today:
            row.append(InlineKeyboardButton("·", callback_data="cal_ignore"))
        elif day_available is not None and not day_available(d):
            row.append(InlineKeyboardButton("·", callback_data="cal_ignore"))
        else:
            label = f"•{day}" if d == today else str(day)
            row.append(
                InlineKeyboardButton(label, callback_data=f"cal_day_{d.isoformat()}")
            )
        if len(row) == 7:
            keyboard.append(row)
            row = []
    if row:
        while len(row) < 7:
            row.append(InlineKeyboardButton("·", callback_data="cal_ignore"))
        keyboard.append(row)

    keyboard.append([InlineKeyboardButton("🔙 Назад", callback_data="book_back_mode")])
    keyboard.append([InlineKeyboardButton("❌ Отмена", callback_data="book_cancel")])
    return InlineKeyboardMarkup(keyboard)


def shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    month += delta
    if month < 1:
        return year - 1, 12
    if month > 12:
        return year + 1, 1
    return year, month


def time_slots_keyboard(
    times: list[str],
    book_date: str,
    labeled_slots: Optional[list[tuple[str, str]]] = None,
) -> InlineKeyboardMarkup:
    """labeled_slots: (admin_time, подпись_для_кнопки)."""
    rows = []
    row = []
    items = labeled_slots or [(t, t) for t in times]
    for admin_time, label in items:
        row.append(
            InlineKeyboardButton(
                label, callback_data=f"book_time_{book_date}_{admin_time}"
            )
        )
        if len(row) == 3:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    rows.append([InlineKeyboardButton("🔙 К дате", callback_data="book_back_calendar")])
    rows.append([InlineKeyboardButton("🔙 Формат", callback_data="book_back_mode")])
    rows.append([InlineKeyboardButton("❌ Отмена", callback_data="book_cancel")])
    return InlineKeyboardMarkup(rows)
