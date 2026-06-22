"""Недельный обзор для админа: свободные и занятые слоты."""
from datetime import date, timedelta
from typing import Dict, List, Optional

import db
import tzutil

FREE = "⚪"
BUSY = "🟡"
CONFIRMED = "🟢"


def booking_status_dot(booking: Optional[Dict]) -> str:
    if not booking:
        return FREE
    if booking.get("status") == "confirmed":
        return CONFIRMED
    return BUSY


def week_monday(week_offset: int = 0) -> date:
    today = tzutil.admin_today()
    monday = today - timedelta(days=today.weekday())
    return monday + timedelta(weeks=week_offset)


def _short_label(slot_label: str) -> str:
    s = (slot_label or "").lower()
    if "онлайн" in s:
        return "онлайн"
    if "ментал" in s:
        return "очно"
    return "открыто"


def format_day_line(d: date) -> str:
    if not db.has_schedule():
        return ""
    iso = d.isoformat()
    if db.uses_date_schedule():
        with db._conn() as c:
            rows = c.execute(
                """SELECT slot_time, slot_label FROM schedule_date_slots
                   WHERE book_date=? AND is_open=1 ORDER BY slot_time""",
                (iso,),
            ).fetchall()
    else:
        weekday = d.weekday()
        with db._conn() as c:
            rows = c.execute(
                """SELECT slot_time, slot_label FROM schedule_slots
                   WHERE weekday=? AND is_open=1 ORDER BY slot_time""",
                (weekday,),
            ).fetchall()
    if not rows:
        return "  (день закрыт)\n"

    bookings = {b["book_time"]: b for b in db.get_bookings_on(d.isoformat())}
    lines = []
    for r in rows:
        t = r["slot_time"]
        kind = _short_label(r["slot_label"])
        if t in bookings:
            b = bookings[t]
            dot = booking_status_dot(b)
            mode = db.visit_type_label(b.get("visit_type") or "in_person")
            name = (b.get("user_name") or str(b["user_id"]))[:25]
            lines.append(f"  {t} {dot} {name} ({mode})")
        else:
            lines.append(f"  {t} {FREE} свободно ({kind})")
    return "\n".join(lines) + "\n"


def format_week_message(week_offset: int) -> str:
    start = week_monday(week_offset)
    end = start + timedelta(days=6)
    header = (
        f"📄 *Сводка недели* {start.strftime('%d.%m')} – {end.strftime('%d.%m.%Y')}\n"
        f"{FREE} свободно · {BUSY} занят · {CONFIRMED} точно придёт\n\n"
    )
    if not db.has_schedule():
        return header + "Расписание не загружено. Отправьте Excel (.xlsx)."

    names = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
    parts = [header]
    for i in range(7):
        d = start + timedelta(days=i)
        parts.append(f"*{names[i]} {d.strftime('%d.%m')}*\n")
        parts.append(format_day_line(d) or "  (нет слотов)\n")

    text = "".join(parts)
    if len(text) > 4000:
        return text[:3990] + "\n\n… (сообщение обрезано, откройте день через /today)"
    return text


def week_nav_keyboard(week_offset: int) -> "InlineKeyboardMarkup":
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup

    prev_o = week_offset - 1
    next_o = week_offset + 1
    from admin_calendar import schedule_nav_row

    return InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton("◀ Неделя", callback_data=f"admin_week_full_{prev_o}"),
                InlineKeyboardButton("Неделя ▶", callback_data=f"admin_week_full_{next_o}"),
            ],
            [
                InlineKeyboardButton(
                    "📅 Дни недели", callback_data=f"admin_week_{week_offset}"
                ),
            ],
            schedule_nav_row(),
        ]
    )
