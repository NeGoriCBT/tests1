from __future__ import annotations

from datetime import date, datetime
from typing import List
from zoneinfo import ZoneInfo

import config
import db

VISIT_IN_PERSON = "in_person"


def _tz() -> ZoneInfo:
    return ZoneInfo(config.ADMIN_TZ)


def _now() -> datetime:
    return datetime.now(_tz())


def min_advance_hours() -> int:
    return int(getattr(config, "MIN_BOOKING_HOURS", 5))


def self_book_hours() -> int:
    return int(getattr(config, "SELF_BOOKING_HOURS", 6))


def in_person_wave_min_slots() -> int:
    return int(getattr(config, "IN_PERSON_WAVE_MIN_SLOTS", 5))


def slot_datetime(book_date: str, book_time: str) -> datetime:
    y, m, d = (int(x) for x in book_date.split("-"))
    hh, mm = (int(x) for x in book_time.split(":"))
    return datetime(y, m, d, hh, mm, tzinfo=_tz())


def hours_until(book_date: str, book_time: str) -> float:
    delta = slot_datetime(book_date, book_time) - _now()
    return delta.total_seconds() / 3600


def can_self_book(book_date: str, book_time: str) -> bool:
    """Самостоятельная запись: не раньше чем через SELF_BOOKING_HOURS."""
    return hours_until(book_date, book_time) >= self_book_hours()


def needs_coordination(book_date: str, book_time: str) -> bool:
    """Между 5 и 6 часами — только по согласованию с администратором."""
    h = hours_until(book_date, book_time)
    return min_advance_hours() <= h < self_book_hours()


def available_times_for_date(d: date, visit_type: str) -> List[str]:
    iso = d.isoformat()
    if not db.is_date_bookable(iso):
        return []
    times = db.get_open_times_for_date(iso, visit_type)
    return [t for t in times if not db.slot_taken(iso, t)]


def _booked_times_on_date(book_date: str) -> set[str]:
    return {
        b["book_time"]
        for b in db.get_bookings_on(book_date)
        if b.get("status") in ("booked", "confirmed")
    }


def uses_in_person_waves(all_times: List[str]) -> bool:
    return len(all_times) >= in_person_wave_min_slots()


def wave_client_visible_times(book_date: str, all_times: List[str]) -> List[str]:
    """
    Большой очный день: волны слотов для самозаписи клиентов.

    1) Всегда: первые 3 слота дня.
    2) ≥2 занято из первых 3 → +2 следующих (4-й и 5-й).
    3) ≥2 занято из слотов с индексами 2,3,4 → остальные.

    Разблокировка монотонная: уже существующие записи в «поздних»
    слотах не скрывают их от новых клиентов (слот всё равно занят).
    """
    n = len(all_times)
    if n < in_person_wave_min_slots():
        return list(all_times)

    booked = _booked_times_on_date(book_date)
    visible: set[int] = set(range(min(3, n)))

    wave2_unlocked = sum(
        1 for i in range(min(3, n)) if all_times[i] in booked
    ) >= 2 or any(all_times[i] in booked for i in range(3, n))
    if wave2_unlocked:
        visible.update(range(3, min(5, n)))

    trio_start, trio_end = 2, min(5, n)
    wave3_unlocked = sum(
        1 for i in range(trio_start, trio_end) if all_times[i] in booked
    ) >= 2 or any(all_times[i] in booked for i in range(5, n))
    if wave3_unlocked:
        visible.update(range(5, n))

    return [all_times[i] for i in sorted(visible)]


def client_visible_times_for_date(d: date, visit_type: str) -> List[str]:
    """Слоты, которые клиент может выбрать (с учётом волн на больших очных днях)."""
    iso = d.isoformat()
    if not db.is_date_bookable(iso):
        return []
    all_open = db.get_open_times_for_date(iso, visit_type)
    if visit_type == VISIT_IN_PERSON and uses_in_person_waves(all_open):
        allowed = set(wave_client_visible_times(iso, all_open))
        all_open = [t for t in all_open if t in allowed]
    return [t for t in all_open if not db.slot_taken(iso, t)]


def self_book_times_for_date(d: date, visit_type: str) -> List[str]:
    """Слоты, доступные для записи без согласования (≥ 6 ч)."""
    iso = d.isoformat()
    return [
        t
        for t in client_visible_times_for_date(d, visit_type)
        if can_self_book(iso, t)
    ]


def day_has_self_book_slots(d: date, visit_type: str) -> bool:
    return bool(self_book_times_for_date(d, visit_type))


def admin_book_times_for_date(d: date, visit_type: str) -> List[str]:
    """Все свободные слоты дня для админа (без волн и без ограничения 6 ч)."""
    return available_times_for_date(d, visit_type)


def day_has_admin_book_slots(d: date, visit_type: str) -> bool:
    return bool(admin_book_times_for_date(d, visit_type))


def format_schedule_summary_text() -> str:
    lines = []
    for item in db.get_schedule_summary():
        lines.append(f"{item['name']}: {item['text']}")
    return "\n".join(lines)
