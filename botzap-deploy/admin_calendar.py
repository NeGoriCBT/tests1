"""Админ: панель, неделя, месяц, день, фильтры."""
from __future__ import annotations

from calendar import monthrange
from datetime import date, timedelta
from typing import Dict, List, Optional, Tuple

from telegram import InlineKeyboardButton, InlineKeyboardMarkup

import db
import google_calendar as gcal
import tzutil
import ui_text
from admin_week import (
    BUSY,
    CONFIRMED,
    FREE,
    booking_status_dot,
    _short_label,
)

FILTER_ALL = "all"
FILTER_ONLINE = "online"
FILTER_IN_PERSON = "in_person"

WEEKDAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
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


def is_admin_calendar_callback(data: str) -> bool:
    prefixes = (
        "admin_settings",
        "admin_materials",
        "admin_month",
        "admin_day_",
        "admin_day_prev_",
        "admin_day_next_",
        "admin_filter_",
        "adm_cal_",
        "admin_recent",
        "adm_slot_",
        "adm_add_slot_",
        "adm_cancel_",
    )
    if data in ("admin_today", "admin_excel_help"):
        return True
    return data.startswith(prefixes)


def filter_label(flt: str) -> str:
    if flt == FILTER_ONLINE:
        return "💻 онлайн"
    if flt == FILTER_IN_PERSON:
        return "🏥 очно"
    return "все форматы"


def _slot_matches_type(slot_label: str, flt: str) -> bool:
    if flt == FILTER_ALL:
        return True
    s = (slot_label or "").lower()
    if flt == FILTER_ONLINE:
        return "онлайн" in s
    return "ментал" in s or ("открыто" in s and "онлайн" not in s)


def _booking_matches_filter(booking: Dict, flt: str) -> bool:
    if flt == FILTER_ALL:
        return True
    vt = booking.get("visit_type") or "in_person"
    return vt == flt


def _open_slots_for_weekday(weekday: int) -> List[Dict]:
    with db._conn() as c:
        rows = c.execute(
            """SELECT slot_time, slot_label FROM schedule_slots
               WHERE weekday=? AND is_open=1 ORDER BY slot_time""",
            (weekday,),
        ).fetchall()
    return [dict(r) for r in rows]


def _open_slots_for_date(iso: str) -> List[Dict]:
    if db.uses_date_schedule():
        if not db.is_date_bookable(iso):
            return []
        with db._conn() as c:
            rows = c.execute(
                """SELECT slot_time, slot_label FROM schedule_date_slots
                   WHERE book_date=? AND is_open=1 ORDER BY slot_time""",
                (iso,),
            ).fetchall()
        return [dict(r) for r in rows]
    d = date.fromisoformat(iso)
    return _open_slots_for_weekday(d.weekday())


def _dates_in_schedule_period() -> List[str]:
    if db.uses_date_schedule():
        open_from = db.get_schedule_open_from()
        close_from = db.get_schedule_close_from()
        with db._conn() as c:
            rows = c.execute(
                """SELECT DISTINCT book_date FROM schedule_date_slots
                   WHERE is_open=1
                     AND (? IS NULL OR book_date >= ?)
                     AND (? IS NULL OR book_date < ?)
                   ORDER BY book_date""",
                (open_from, open_from, close_from, close_from),
            ).fetchall()
        return [r["book_date"] for r in rows]
    today = tzutil.admin_today()
    result: List[str] = []
    for offset in range(14):
        d = today + timedelta(days=offset)
        if _open_slots_for_weekday(d.weekday()):
            result.append(d.isoformat())
    return result


def schedule_period_header() -> str:
    if not db.has_schedule():
        return "⚠️ Расписание не загружено — отправьте Excel."
    lines = ["*Период записи:*"]
    open_from = db.get_schedule_open_from()
    close_from = db.get_schedule_close_from()
    if open_from and close_from:
        last = (date.fromisoformat(close_from) - timedelta(days=1)).isoformat()
        lines.append(
            f"📅 {ui_text.format_date_iso(open_from)} – {ui_text.format_date_iso(last)}"
        )
    elif open_from:
        lines.append(f"📅 с {ui_text.format_date_iso(open_from)}")
    by_type = db.get_bookable_dates_by_visit_type()
    online_txt = ui_text._format_dates_short(by_type.get("online", []))
    in_person_txt = ui_text._format_dates_short(by_type.get("in_person", []))
    if online_txt:
        lines.append(f"💻 Онлайн — {online_txt}")
    if in_person_txt:
        lines.append(f"🏥 Очно — {in_person_txt}")
    free = busy = 0
    for iso in _dates_in_schedule_period():
        st = day_stats(iso, FILTER_ALL)
        free += st["free"]
        busy += st["busy"] + st["confirmed"]
    lines.append(f"\nСлоты: *{free}* свободно · *{busy}* занято")
    return "\n".join(lines)


def day_stats(iso_or_d, flt: str = FILTER_ALL) -> Dict[str, int]:
    """Счётчики: open, free, busy, confirmed (по фильтру)."""
    iso = iso_or_d.isoformat() if isinstance(iso_or_d, date) else iso_or_d
    if not db.has_schedule():
        return {"open": 0, "free": 0, "busy": 0, "confirmed": 0, "closed": True}

    rows = _open_slots_for_date(iso)
    if not rows:
        return {"open": 0, "free": 0, "busy": 0, "confirmed": 0, "closed": True}

    bookings = {b["book_time"]: b for b in db.get_bookings_on(iso)}
    open_n = free_n = busy_n = conf_n = 0
    for r in rows:
        if flt != FILTER_ALL and not _slot_matches_type(r["slot_label"], flt):
            if r["slot_time"] not in bookings:
                continue
            b = bookings[r["slot_time"]]
            if not _booking_matches_filter(b, flt):
                continue
        open_n += 1
        t = r["slot_time"]
        if t in bookings:
            b = bookings[t]
            if not _booking_matches_filter(b, flt) and flt != FILTER_ALL:
                continue
            if b.get("status") == "confirmed":
                conf_n += 1
            else:
                busy_n += 1
        else:
            if flt != FILTER_ALL and not _slot_matches_type(r["slot_label"], flt):
                continue
            free_n += 1

    return {
        "open": open_n,
        "free": free_n,
        "busy": busy_n,
        "confirmed": conf_n,
        "closed": open_n == 0,
    }


def panel_text() -> str:
    today = tzutil.admin_today()
    n = len(db.get_bookings_on(today.isoformat()))
    lines = [
        "⚙️ *Панель администратора*",
        "",
        f"📅 Сегодня, {ui_text.format_date(today)}: "
        + ("записей нет" if n == 0 else f"*{n}* записей"),
        "_Подробно — кнопка «Сегодня — клиенты и ДЗ»._",
    ]
    if not db.has_schedule():
        lines.extend(["", "⚠️ Расписание не загружено — отправьте Excel."])
    else:
        lines.extend(["", schedule_period_header()])
    return "\n".join(lines)


def panel_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("📋 Сегодня — клиенты и ДЗ", callback_data="admin_today")],
        [InlineKeyboardButton("📅 Календарь записи", callback_data="admin_month")],
        [InlineKeyboardButton("👥 Клиенты", callback_data="admin_recent")],
        [InlineKeyboardButton("⚙️ Настройка", callback_data="admin_settings")],
        [InlineKeyboardButton("📦 Материалы", callback_data="admin_materials")],
        [InlineKeyboardButton("🏠 Клиентское меню", callback_data="menu_main")],
    ])


def settings_text() -> str:
    header = schedule_period_header() if db.has_schedule() else (
        "⚠️ Расписание не загружено — загрузите Excel."
    )
    gcal_line = (
        "📅 Google Calendar: подключён"
        if gcal.is_enabled()
        else "📅 Google Calendar: не настроен"
    )
    return (
        "⚙️ *Настройка*\n\n"
        f"{header}\n\n"
        f"{gcal_line}\n\n"
        "• *Excel* — обновить сетку (активные записи сохраняются)\n"
        "• *Google Calendar* — статус и синхронизация"
    )


def settings_keyboard() -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton("📤 Загрузить Excel", callback_data="admin_excel_help")],
    ]
    rows.append(
        [InlineKeyboardButton("📅 Google Calendar", callback_data="admin_gcal")]
    )
    rows.append(panel_nav_row())
    return InlineKeyboardMarkup(rows)


def schedule_period_date_bounds() -> tuple[Optional[date], Optional[date]]:
    open_from = db.get_schedule_open_from()
    close_from = db.get_schedule_close_from()
    if not open_from:
        return None, None
    start = date.fromisoformat(open_from)
    if close_from:
        end = date.fromisoformat(close_from) - timedelta(days=1)
    else:
        end = start
    return start, end


def month_overlaps_schedule(year: int, month: int) -> bool:
    """Есть ли в месяце хотя бы один день из периода записи."""
    start, end = schedule_period_date_bounds()
    if not start or not end:
        return True
    _, last_day = monthrange(year, month)
    month_start = date(year, month, 1)
    month_end = date(year, month, last_day)
    return month_start <= end and month_end >= start


def month_nav_blocked_alert(year: int, month: int) -> str:
    start, end = schedule_period_date_bounds()
    if start and end:
        return (
            f"Период записи: {ui_text.format_date(start)} – {ui_text.format_date(end)}. "
            f"{MONTHS_RU[month]} {year} вне периода."
        )
    return "В этом месяце нет расписания."


def calendar_month_text(year: int, month: int, flt: str) -> str:
    lines = [
        "📅 *Календарь записи*",
        f"*{MONTHS_RU[month]} {year}* · фильтр: *{filter_label(flt)}*",
        "",
        "Нажмите день — слоты и записи.",
        "🟢🟡⚪ — записи/слоты · • — сегодня",
    ]
    if db.has_schedule() and not month_overlaps_schedule(year, month):
        start, end = schedule_period_date_bounds()
        if start and end:
            lines.extend(
                [
                    "",
                    f"⚠️ _В {MONTHS_RU[month].lower()} нет открытых дней._",
                    f"_Запись: {ui_text.format_date(start)} – {ui_text.format_date(end)}._",
                    "_Листайте ▶ к июню._",
                ]
            )
    return "\n".join(lines)


def panel_nav_row() -> List[InlineKeyboardButton]:
    return [InlineKeyboardButton("◀️ Панель", callback_data="menu_admin")]


def calendar_nav_row() -> List[InlineKeyboardButton]:
    return [
        InlineKeyboardButton("◀️ Календарь", callback_data="admin_month"),
        InlineKeyboardButton("◀️ Панель", callback_data="menu_admin"),
    ]


def day_nav_row() -> List[InlineKeyboardButton]:
    return [
        InlineKeyboardButton("◀️ Календарь", callback_data="admin_month"),
        InlineKeyboardButton("📋 Сегодня", callback_data="admin_today"),
        InlineKeyboardButton("◀️ Панель", callback_data="menu_admin"),
    ]


def _filter_row(flt: str) -> List[InlineKeyboardButton]:
    def mark(key: str, label: str) -> str:
        return f"• {label}" if flt == key else label

    return [
        InlineKeyboardButton(mark(FILTER_ALL, "Все"), callback_data="admin_filter_all"),
        InlineKeyboardButton(
            mark(FILTER_ONLINE, "Онлайн"), callback_data="admin_filter_online"
        ),
        InlineKeyboardButton(
            mark(FILTER_IN_PERSON, "Очно"), callback_data="admin_filter_in_person"
        ),
    ]


def _parse_slot_ref(rest: str) -> Tuple[str, str]:
    """2026-06-01_11:00 → (date, time)."""
    book_date, slot_time = rest.rsplit("_", 1)
    return book_date, slot_time


def free_slot_detail_text(iso: str, slot_time: str) -> str:
    d = date.fromisoformat(iso)
    slot = db.get_open_slot(iso, slot_time)
    if not slot:
        return (
            f"📅 *{ui_text.format_date(d)}*\n\n"
            f"Окно *{slot_time}* уже закрыто или занято."
        )
    kind = _short_label(slot.get("slot_label") or "")
    return (
        f"⚪ *Свободное окно*\n\n"
        f"📅 {ui_text.format_date(d)}\n"
        f"🕐 *{slot_time}*\n"
        f"Формат: *{kind}*"
    )


def free_slot_msg_keyboard(iso: str, slot_time: str) -> InlineKeyboardMarkup:
    import homework_db as hwdb

    rows = []
    for c in hwdb.list_recent_clients(12):
        name = c.get("display_name") or str(c["user_id"])
        rows.append(
            [
                InlineKeyboardButton(
                    f"💬 {name}",
                    callback_data=f"adm_msg_{c['user_id']}",
                )
            ]
        )
    rows.append(
        [
            InlineKeyboardButton(
                "◀️ К окну",
                callback_data=f"adm_slot_free_{iso}_{slot_time}",
            )
        ]
    )
    rows.append(
        [InlineKeyboardButton("◀️ К дню", callback_data=f"admin_day_{iso}")]
    )
    return InlineKeyboardMarkup(rows)


def free_slot_msg_text(iso: str, slot_time: str) -> str:
    d = date.fromisoformat(iso)
    slot = db.get_open_slot(iso, slot_time)
    kind = _short_label((slot or {}).get("slot_label") or "")
    return (
        f"💬 *Написать клиенту*\n\n"
        f"Свободное окно: *{ui_text.format_date(d)}* {slot_time}"
        + (f" ({kind})" if kind else "")
        + "\n\n_Выберите клиента — откроется меню сообщений._"
    )


def free_slot_detail_keyboard(iso: str, slot_time: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton(
                "💬 Написать",
                callback_data=f"adm_slot_free_msg_{iso}_{slot_time}",
            ),
            InlineKeyboardButton(
                "✕ Закрыть",
                callback_data=f"adm_slot_close_{iso}_{slot_time}",
            ),
        ],
        [InlineKeyboardButton("◀️ К дню", callback_data=f"admin_day_{iso}")],
    ])


def _iter_day_slots(d: date, flt: str) -> List[Tuple[str, Optional[Dict], str]]:
    """(time, booking|None, kind_label)."""
    iso = d.isoformat()
    rows = _open_slots_for_date(iso)
    if not rows:
        return []
    bookings = {b["book_time"]: b for b in db.get_bookings_on(iso)}
    result = []
    for r in rows:
        t = r["slot_time"]
        kind = _short_label(r["slot_label"])
        b = bookings.get(t)
        if b:
            if not _booking_matches_filter(b, flt):
                continue
            result.append((t, b, kind))
        else:
            if flt != FILTER_ALL and not _slot_matches_type(r["slot_label"], flt):
                continue
            result.append((t, None, kind))
    return result


def day_view_text(iso: str, flt: str) -> str:
    d = date.fromisoformat(iso)
    lines = [
        f"📅 *{ui_text.format_date(d)}*",
        f"Фильтр: *{filter_label(flt)}*",
        "",
    ]
    if not db.has_schedule():
        lines.append("Расписание не загружено.")
        return "\n".join(lines)

    slots = _iter_day_slots(d, flt)
    if not slots:
        lines.append("(нет слотов по фильтру или день закрыт)")
        return "\n".join(lines)

    for t, b, kind in slots:
        if b:
            dot = booking_status_dot(b)
            mode = db.visit_type_label(b.get("visit_type") or "in_person")
            name = (b.get("user_name") or str(b["user_id"]))[:30]
            lines.append(f"{t} {dot} *{name}* ({mode})")
        else:
            lines.append(f"{t} {FREE} свободно ({kind})")
    lines.append("")
    lines.append(f"_{FREE} своб · {BUSY} занят · {CONFIRMED} придёт_")
    return "\n".join(lines)


def add_slot_ask_text(iso: str) -> str:
    d = date.fromisoformat(iso)
    return (
        f"➕ *Добавить окно*\n\n"
        f"📅 {ui_text.format_date(d)}\n\n"
        "_Только на эту дату — остальное расписание не меняется._\n\n"
        "Выберите время:"
    )


def add_slot_times_keyboard(iso: str) -> InlineKeyboardMarkup:
    times = db.list_addable_slot_times(iso)
    rows: List[List[InlineKeyboardButton]] = []
    row: List[InlineKeyboardButton] = []
    for t in times:
        row.append(
            InlineKeyboardButton(t, callback_data=f"adm_add_slot_time_{iso}_{t}")
        )
        if len(row) == 4:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    rows.append([InlineKeyboardButton("◀️ К дню", callback_data=f"admin_day_{iso}")])
    return InlineKeyboardMarkup(rows)


def add_slot_type_text(iso: str, slot_time: str) -> str:
    d = date.fromisoformat(iso)
    return (
        f"➕ *Новое окно*\n\n"
        f"📅 {ui_text.format_date(d)}\n"
        f"🕐 *{slot_time}*\n\n"
        "Выберите формат приёма:"
    )


def add_slot_type_keyboard(iso: str, slot_time: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton(
                "💻 Онлайн",
                callback_data=f"adm_add_slot_type_online_{iso}_{slot_time}",
            ),
            InlineKeyboardButton(
                "🏥 Очно",
                callback_data=f"adm_add_slot_type_in_person_{iso}_{slot_time}",
            ),
        ],
        [
            InlineKeyboardButton(
                "◀️ Время",
                callback_data=f"adm_add_slot_ask_{iso}",
            )
        ],
        [InlineKeyboardButton("◀️ К дню", callback_data=f"admin_day_{iso}")],
    ])


def day_view_keyboard(iso: str, flt: str) -> InlineKeyboardMarkup:
    d = date.fromisoformat(iso)
    rows = []
    for t, b, kind in _iter_day_slots(d, flt):
        if b:
            name = (b.get("user_name") or str(b["user_id"]))[:18]
            dot = booking_status_dot(b)
            label = f"{t} {dot} {name}"
            rows.append(
                [
                    InlineKeyboardButton(
                        label, callback_data=f"adm_slot_{b['id']}"
                    ),
                    InlineKeyboardButton(
                        "💬", callback_data=f"adm_msg_{b['user_id']}"
                    ),
                ]
            )
        else:
            rows.append(
                [
                    InlineKeyboardButton(
                        f"{t} {FREE} ({kind})",
                        callback_data=f"adm_slot_free_{iso}_{t}",
                    ),
                    InlineKeyboardButton(
                        "💬",
                        callback_data=f"adm_slot_free_msg_{iso}_{t}",
                    ),
                    InlineKeyboardButton(
                        "✕",
                        callback_data=f"adm_slot_close_{iso}_{t}",
                    ),
                ]
            )

    if db.uses_date_schedule() and db.is_date_bookable(iso):
        rows.append(
            [
                InlineKeyboardButton(
                    "➕ Добавить окно",
                    callback_data=f"adm_add_slot_ask_{iso}",
                )
            ]
        )

    prev_d = (d - timedelta(days=1)).isoformat()
    next_d = (d + timedelta(days=1)).isoformat()
    rows.append(
        [
            InlineKeyboardButton("◀ День", callback_data=f"admin_day_prev_{iso}"),
            InlineKeyboardButton("День ▶", callback_data=f"admin_day_next_{iso}"),
        ]
    )
    rows.append(_filter_row(flt))
    rows.append(day_nav_row())
    return InlineKeyboardMarkup(rows)


def _admin_day_marker(d: date, flt: str) -> str:
    if d < tzutil.admin_today():
        return ""
    st = day_stats(d.isoformat(), flt)
    if st["closed"]:
        return ""
    if st["confirmed"]:
        return "🟢"
    if st["busy"]:
        return "🟡"
    if st["free"]:
        return "⚪"
    return ""


def build_admin_month_calendar(
    year: int, month: int, flt: str = FILTER_ALL
) -> InlineKeyboardMarkup:
    today = tzutil.admin_today()
    _, days_in_month = monthrange(year, month)
    first_weekday = date(year, month, 1).weekday()

    keyboard = [
        [
            InlineKeyboardButton("◀", callback_data=f"adm_cal_prev_{year}_{month}"),
            InlineKeyboardButton(
                f"{MONTHS_RU[month]} {year}", callback_data="adm_cal_ignore"
            ),
            InlineKeyboardButton("▶", callback_data=f"adm_cal_next_{year}_{month}"),
        ],
        [
            InlineKeyboardButton(x, callback_data="adm_cal_ignore")
            for x in WEEKDAY_NAMES
        ],
    ]

    row = []
    for _ in range(first_weekday):
        row.append(InlineKeyboardButton("·", callback_data="adm_cal_ignore"))
    for day in range(1, days_in_month + 1):
        d = date(year, month, day)
        marker = _admin_day_marker(d, flt)
        if d < today:
            row.append(InlineKeyboardButton("·", callback_data="adm_cal_ignore"))
        elif marker or db.has_schedule():
            st = day_stats(d.isoformat(), flt)
            if st["closed"] and not marker:
                row.append(InlineKeyboardButton("·", callback_data="adm_cal_ignore"))
            else:
                label = f"•{day}" if d == today else f"{day}{marker}"
                if len(label) > 4:
                    label = str(day) + marker[0] if marker else str(day)
                row.append(
                    InlineKeyboardButton(
                        label, callback_data=f"adm_cal_day_{d.isoformat()}"
                    )
                )
        else:
            row.append(InlineKeyboardButton("·", callback_data="adm_cal_ignore"))
        if len(row) == 7:
            keyboard.append(row)
            row = []
    if row:
        while len(row) < 7:
            row.append(InlineKeyboardButton("·", callback_data="adm_cal_ignore"))
        keyboard.append(row)

    keyboard.append(_filter_row(flt))
    keyboard.append(calendar_nav_row())
    return InlineKeyboardMarkup(keyboard)


def shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    month += delta
    if month < 1:
        return year - 1, 12
    if month > 12:
        return year + 1, 1
    return year, month


def materials_text() -> str:
    return (
        "📦 *Материалы*\n\n"
        "• *Библиотека ДЗ* — пул заданий (КПТ)\n"
        "• *Каталог литературы* — книги для клиентов"
    )


def materials_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("📚 Библиотека ДЗ", callback_data="adm_hw_library")],
        [InlineKeyboardButton("📖 Каталог литературы", callback_data="adm_lit_library")],
        [InlineKeyboardButton("◀️ Панель", callback_data="menu_admin")],
    ])


def today_timeline_text(bookings: list) -> str:
    today = tzutil.admin_today()
    iso = today.isoformat()
    flt = FILTER_ALL
    lines = [
        f"📋 *Сегодня,* {ui_text.format_date(today)}",
        "",
        "*Записи:*",
    ]
    if bookings:
        for b in bookings:
            mode = db.visit_type_label(b.get("visit_type") or "in_person")
            dot = booking_status_dot(b)
            lines.append(
                f"• {dot} {b['book_time']} ({mode}) — "
                f"{b.get('user_name') or b['user_id']}"
            )
    else:
        lines.append("_нет_")

    lines.extend(["", "*Слоты дня:*"])
    for t, b, kind in _iter_day_slots(today, flt):
        if b:
            dot = booking_status_dot(b)
            mode = db.visit_type_label(b.get("visit_type") or "in_person")
            name = b.get("user_name") or b["user_id"]
            lines.append(f"• {t} {dot} {name} ({mode})")
        else:
            lines.append(f"• {t} {FREE} свободно ({kind})")

    lines.extend(
        [
            "",
            "_Нажмите клиента — профиль, ДЗ, отмена записи._",
            f"_{FREE} своб · {BUSY} занят · {CONFIRMED} придёт_",
        ]
    )
    return "\n".join(lines)


def back_button_label(callback_data: str) -> str:
    labels = {
        "admin_today": "◀️ Сегодня",
        "admin_month": "◀️ Календарь",
        "admin_recent": "◀️ Клиенты",
        "admin_settings": "◀️ Настройка",
        "admin_materials": "◀️ Материалы",
        "menu_admin": "◀️ Панель",
    }
    if callback_data.startswith("admin_day_"):
        return "◀️ День"
    return labels.get(callback_data, "◀️ Назад")


def back_button(callback_data: str) -> InlineKeyboardButton:
    return InlineKeyboardButton(
        back_button_label(callback_data), callback_data=callback_data
    )


def today_keyboard(bookings: list) -> InlineKeyboardMarkup:
    rows = []
    for b in bookings:
        name = b.get("user_name") or str(b["user_id"])
        mode = db.visit_type_label(b.get("visit_type") or "in_person")
        rows.append(
            [
                InlineKeyboardButton(
                    f"👤 {b['book_time']} {name} ({mode})",
                    callback_data=f"adm_profile_{b['user_id']}",
                )
            ]
        )
    iso = tzutil.admin_today().isoformat()
    rows.append(
        [
            InlineKeyboardButton(
                "📅 Все слоты дня", callback_data=f"admin_day_{iso}"
            )
        ]
    )
    rows.append(panel_nav_row())
    return InlineKeyboardMarkup(rows)
