"""6-дневные вечерние программы ДЗ (дневник эмоций, наблюдение мыслей)."""
from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

PROGRAM_POSITIVE_EMOTIONS = "positive_emotions"
PROGRAM_ANXIETY_THOUGHTS = "anxiety_thoughts"

TITLE_POSITIVE = "Дневник положительных эмоций"
TITLE_ANXIETY = "Наблюдение за тревожными мыслями"

TITLE_TO_PROGRAM = {
    TITLE_POSITIVE: PROGRAM_POSITIVE_EMOTIONS,
    TITLE_ANXIETY: PROGRAM_ANXIETY_THOUGHTS,
}

POSITIVE_EVENTS_COUNT = 5


def program_type_for_title(title: str) -> Optional[str]:
    return TITLE_TO_PROGRAM.get((title or "").strip())


def positive_emotions_body() -> str:
    return (
        "*Дневник положительных эмоций* (6 вечеров)\n\n"
        "Каждый вечер в течение *6 дней* бот напомнит заполнить дневник.\n\n"
        "Запишите *5 событий, явлений или вещей*, которые принесли вам "
        "удовольствие или приятные эмоции — с кратким описанием каждого.\n\n"
        "Это может быть что угодно: чашка чая, разговор, прогулка, музыка, "
        "запах, момент отдыха.\n\n"
        "📲 Заполнение — здесь, по кнопке из вечернего напоминания "
        "или в меню «Моё ДЗ»."
    )


def anxiety_thoughts_body() -> str:
    return (
        "*Наблюдение за тревожными мыслями* (6 вечеров)\n\n"
        "Каждый вечер в течение *6 дней* бот напомнит сделать запись.\n\n"
        "Запишите *все тревожные мысли*, которые заметили за день — "
        "сколько угодно. Одна мысль = одно сообщение (или строка).\n\n"
        "Цель — не бороться с мыслями, а *замечать* их: когда появляются, "
        "как часто, о чём.\n\n"
        "📲 Заполнение — здесь, по кнопке из напоминания или в меню «Моё ДЗ»."
    )


def day_index_for_program(start_date: str, today: Optional[date] = None) -> Optional[int]:
    """Номер дня программы 1..N или None, если вне периода."""
    if today is None:
        today = date.today()
    try:
        start = date.fromisoformat(start_date)
    except ValueError:
        return None
    delta = (today - start).days
    if delta < 0:
        return None
    return delta + 1


def program_days_total() -> int:
    import config

    return int(getattr(config, "HOMEWORK_PROGRAM_DAYS", 6))


def is_program_day_active(start_date: str, today: Optional[date] = None) -> bool:
    idx = day_index_for_program(start_date, today)
    if idx is None:
        return False
    return 1 <= idx <= program_days_total()
