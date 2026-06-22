"""Тексты и форматирование интерфейса для клиентов."""
from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

import config
import db

IN_PERSON_ROUTE_IMAGE = (
    Path(__file__).resolve().parent / "assets" / "in_person_route.png"
)

WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
WEEKDAYS_LOWER = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]
MONTHS_GENITIVE = [
    "",
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
]


def format_date(d: date) -> str:
    """Пн, 24 мая."""
    return f"{WEEKDAYS_SHORT[d.weekday()]}, {d.day} {MONTHS_GENITIVE[d.month]}"


def format_date_iso(iso: str) -> str:
    return format_date(date.fromisoformat(iso))


def format_datetime_iso(iso: str, time_str: str) -> str:
    return f"{format_date_iso(iso)} в {time_str}"


def format_booking_when(
    book_date: str,
    book_time: str,
    user_id: int | None = None,
    *,
    admin_view: bool = False,
) -> str:
    import tzutil

    if admin_view:
        return tzutil.format_datetime_admin(book_date, book_time)
    tz = db.get_user_timezone(user_id) if user_id else None
    if tz:
        return tzutil.format_datetime_user(book_date, book_time, tz)
    return format_datetime_iso(book_date, book_time)


def step_header(step: int, total: int, title: str, hint: str = "") -> str:
    lines = [f"*{title}*", f"_Шаг {step} из {total}_"]
    if hint:
        lines.append("")
        lines.append(hint)
    return "\n".join(lines)


def _weekdays_for_visit_type(visit_type: str) -> list[str]:
    if db.uses_date_schedule():
        dates = db.get_bookable_dates_by_visit_type().get(visit_type, [])
        return [_format_dates_short(dates)] if dates else []
    names = []
    for wd in range(7):
        if db.get_open_times_for_weekday(wd, visit_type):
            names.append(WEEKDAYS_LOWER[wd])
    return names


def _format_dates_short(dates: list[str]) -> str:
    if not dates:
        return ""
    if dates[0].isdigit():
        return ", ".join(WEEKDAYS_LOWER[int(d)] for d in dates)
    parsed = [date.fromisoformat(d) for d in dates]
    ranges: list[tuple[date, date]] = []
    start = end = parsed[0]
    for d in parsed[1:]:
        if d == end + timedelta(days=1):
            end = d
        else:
            ranges.append((start, end))
            start = end = d
    ranges.append((start, end))
    parts: list[str] = []
    for s, e in ranges:
        if s == e:
            parts.append(format_date(s))
        elif s.month == e.month:
            parts.append(
                f"{WEEKDAYS_SHORT[s.weekday()]}, {s.day}–{e.day} {MONTHS_GENITIVE[s.month]}"
            )
        else:
            parts.append(f"{format_date(s)} – {format_date(e)}")
    return ", ".join(parts)


def schedule_availability_lines() -> str:
    """Когда можно записаться — по датам или дням недели."""
    if not db.has_schedule():
        return "Расписание пока не загружено — запись временно недоступна."

    by_type = db.get_bookable_dates_by_visit_type()
    if db.uses_date_schedule():
        online_txt = _format_dates_short(by_type.get("online", []))
        in_person_txt = _format_dates_short(by_type.get("in_person", []))
    else:
        online = [
            WEEKDAYS_LOWER[int(wd)]
            for wd in by_type.get("online", [])
        ]
        in_person = [
            WEEKDAYS_LOWER[int(wd)]
            for wd in by_type.get("in_person", [])
        ]
        online_txt = ", ".join(online)
        in_person_txt = ", ".join(in_person)

    lines = ["*Когда можно записаться:*"]
    if online_txt:
        lines.append(f"💻 Онлайн — {online_txt}")
    else:
        lines.append("💻 Онлайн — сейчас нет свободных дней")
    if in_person_txt:
        lines.append(f"🏥 Очно — {in_person_txt}")
    else:
        lines.append("🏥 Очно — сейчас нет свободных дней")
    lines.append("")
    lines.append("Часы приёма: 09:00–22:00")
    return "\n".join(lines)


def welcome_text(first_name: str | None, is_admin: bool) -> str:
    name = (first_name or "").strip()
    greeting = f"Здравствуйте{', ' + name if name else ''}!"
    parts = [
        f"👋 *{greeting}*",
        "",
        "Здесь можно записаться на консультацию — очно или онлайн.",
        "",
        schedule_availability_lines(),
        "",
        "Накануне визита в 18:00 бот попросит подтвердить запись.",
    ]
    if is_admin:
        parts.append("")
        parts.append("⚙️ Админ-панель: /admin")
    return "\n".join(parts)


def mode_choice_hint() -> str:
    by_type = db.get_bookable_dates_by_visit_type()
    if db.uses_date_schedule():
        online_txt = _format_dates_short(by_type.get("online", []))
        in_person_txt = _format_dates_short(by_type.get("in_person", []))
    else:
        online_txt = ", ".join(
            WEEKDAYS_LOWER[int(wd)] for wd in by_type.get("online", [])
        )
        in_person_txt = ", ".join(
            WEEKDAYS_LOWER[int(wd)] for wd in by_type.get("in_person", [])
        )
    parts = []
    if online_txt:
        parts.append(f"💻 Онлайн — {online_txt}")
    if in_person_txt:
        parts.append(f"🏥 Очно — {in_person_txt}")
    rules = booking_time_rules_hint()
    if parts:
        parts.append("")
        parts.append(rules)
        return "\n".join(parts)
    return "Сейчас нет доступных форматов приёма."


def booking_time_rules_hint() -> str:
    return (
        "_Запись в боте: не ранее чем за 6 ч._\n"
        "_За 5–6 ч до приёма — только по согласованию с администратором._"
    )


def in_person_confirmed_text(
    book_date: str, book_time: str, booking_id: int, user_id: int | None = None
) -> str:
    when = format_booking_when(book_date, book_time, user_id)
    tz = db.get_user_timezone(user_id) if user_id else None
    tz_line = ""
    if tz and tz != config.ADMIN_TZ:
        import tzutil

        tz_line = f"\n_(Ваш часовой пояс: {tzutil.tz_label(tz)})_\n"
    return (
        f"✅ Вы записаны на консультацию на *{when}*{tz_line}\n\n"
        "📍 *Адрес:* улица Загира Исмагилова, 21. "
        "Вход с торца здания, со стороны детской площадки. "
        "На домофоне нажмите кнопку напротив кабинета № 2.\n\n"
        "⏱ Длительность: 45–55 минут.\n\n"
        "В рамках первой встречи медикаментозные препараты не выписываются.\n\n"
        "Если появятся вопросы — пишите в этот чат."
    )


def booking_confirmed_text(
    visit_type: str,
    book_date: str,
    book_time: str,
    booking_id: int,
    user_id: int | None = None,
) -> str:
    if visit_type == "in_person":
        return in_person_confirmed_text(book_date, book_time, booking_id, user_id)
    mode = db.visit_type_label(visit_type)
    return (
        "✅ *Запись оформлена*\n\n"
        f"📋 {mode}\n"
        f"🗓 {format_booking_when(book_date, book_time, user_id)}\n\n"
        "До встречи! Напоминание придёт утром в день визита."
    )


def my_booking_detail_text(booking: dict, user_id: int | None = None) -> str:
    """Полная информация о предстоящей записи (раздел «Мои записи»)."""
    visit_type = booking.get("visit_type") or "in_person"
    suffix = client_booking_status_suffix(
        booking.get("status") or "booked",
        booking.get("evening_confirmed"),
    )
    body = booking_confirmed_text(
        visit_type,
        booking["book_date"],
        booking["book_time"],
        booking["id"],
        user_id,
    )
    if body.startswith("✅"):
        body = body[len("✅"):].lstrip()
    lines = ["📋 *Моя запись*", "", body]
    if suffix:
        lines.append(suffix)
    return "\n".join(lines)


def has_in_person_route_image() -> bool:
    return IN_PERSON_ROUTE_IMAGE.is_file()


def already_has_booking_text(booking: dict, user_id: int | None = None) -> str:
    mode = db.visit_type_label(booking.get("visit_type") or "in_person")
    when = format_booking_when(
        booking["book_date"], booking["book_time"], user_id
    )
    return (
        "⚠️ *У вас уже есть запись*\n\n"
        f"🗓 {when}\n"
        f"📋 {mode}\n\n"
        "Нельзя оформить две записи одновременно.\n"
        "Сначала отмените текущую в разделе *Мои записи*, "
        "затем выберите новое время."
    )


def registration_phone_prompt() -> str:
    return (
        "📱 *Номер телефона* _(необязательно)_\n\n"
        "Можно указать номер для связи — так администратору проще "
        "связаться с вами при необходимости.\n"
        "Если не хотите — нажмите «Пропустить»."
    )


def phone_optional_prompt() -> str:
    return (
        "📱 *Телефон для связи* _(необязательно)_\n\n"
        "Можно оставить номер — он попадёт в календарь администратора."
    )


def client_booking_status_suffix(status: str, evening_confirmed) -> str:
    """Для клиента — без «ожидает подтверждения»; только отмена."""
    if evening_confirmed == 0 or status == "cancelled":
        return " — ❌ отменена"
    return ""


def admin_booking_status_label(status: str, evening_confirmed) -> str:
    if status == "confirmed" or evening_confirmed == 1:
        return "🟢 подтверждена"
    if evening_confirmed == 0:
        return "❌ отменена"
    return "🟡 ожидает подтверждения"


def booking_status_label(status: str, evening_confirmed) -> str:
    """Алиас для админских экранов."""
    return admin_booking_status_label(status, evening_confirmed)


def help_text() -> str:
    return (
        "ℹ️ *Как записаться*\n\n"
        "1️⃣ Нажмите «Записаться»\n"
        "2️⃣ Выберите очно или онлайн\n"
        "3️⃣ Выберите дату в календаре (• — сегодня)\n"
        "4️⃣ Выберите свободное время\n\n"
        + schedule_availability_lines()
    )
