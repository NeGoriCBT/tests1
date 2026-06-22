from datetime import date, datetime, timedelta
from typing import List, Optional, Dict, Any

from db_conn import DB_PATH, connect as _conn

_SCHEDULE_CLOSE_FROM_KEY = "schedule_close_from"
_SCHEDULE_OPEN_FROM_KEY = "schedule_open_from"
_HOURS = range(9, 23)
SLOT_LABEL_ONLINE = "открыто онлайн"
SLOT_LABEL_IN_PERSON = "открыто ментал хелп"


def init_db():
    with _conn() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS schedule_slots (
            weekday INTEGER NOT NULL,
            slot_time TEXT NOT NULL,
            is_open INTEGER NOT NULL DEFAULT 0,
            slot_label TEXT DEFAULT '',
            updated_at TEXT NOT NULL,
            PRIMARY KEY (weekday, slot_time)
        );
        CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            user_name TEXT,
            book_date TEXT NOT NULL,
            book_time TEXT NOT NULL,
            visit_type TEXT NOT NULL DEFAULT 'in_person',
            status TEXT NOT NULL DEFAULT 'booked',
            evening_confirmed INTEGER,
            created_at TEXT NOT NULL,
            UNIQUE(user_id, book_date, book_time)
        );
        CREATE TABLE IF NOT EXISTS user_profiles (
            user_id INTEGER PRIMARY KEY,
            full_name TEXT,
            phone TEXT
        );
        """)
        cols = [r[1] for r in c.execute("PRAGMA table_info(bookings)").fetchall()]
        if "visit_type" not in cols:
            c.execute("ALTER TABLE bookings ADD COLUMN visit_type TEXT NOT NULL DEFAULT 'in_person'")
        cols = [r[1] for r in c.execute("PRAGMA table_info(bookings)").fetchall()]
        if "google_event_id" not in cols:
            c.execute("ALTER TABLE bookings ADD COLUMN google_event_id TEXT")
        cols = [r[1] for r in c.execute("PRAGMA table_info(bookings)").fetchall()]
        if "evening_confirm_sent_at" not in cols:
            c.execute("ALTER TABLE bookings ADD COLUMN evening_confirm_sent_at TEXT")
        cols = [r[1] for r in c.execute("PRAGMA table_info(bookings)").fetchall()]
        if "morning_reminder_sent_date" not in cols:
            c.execute("ALTER TABLE bookings ADD COLUMN morning_reminder_sent_date TEXT")
        cols = [r[1] for r in c.execute("PRAGMA table_info(user_profiles)").fetchall()]
        if "timezone" not in cols:
            c.execute(
                "ALTER TABLE user_profiles ADD COLUMN timezone TEXT NOT NULL DEFAULT ''"
            )
        cols = [r[1] for r in c.execute("PRAGMA table_info(user_profiles)").fetchall()]
        if "phone_skipped" not in cols:
            c.execute(
                "ALTER TABLE user_profiles ADD COLUMN phone_skipped INTEGER NOT NULL DEFAULT 0"
            )
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS bot_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS schedule_date_slots (
                book_date TEXT NOT NULL,
                slot_time TEXT NOT NULL,
                is_open INTEGER NOT NULL DEFAULT 0,
                slot_label TEXT DEFAULT '',
                updated_at TEXT NOT NULL,
                PRIMARY KEY (book_date, slot_time)
            );
            """
        )


def _closed_schedule_slots() -> List[Dict[str, Any]]:
    return [
        {
            "weekday": wd,
            "slot_time": f"{hour:02d}:00",
            "is_open": False,
            "slot_label": "",
        }
        for wd in range(7)
        for hour in _HOURS
    ]


def get_schedule_close_from() -> Optional[str]:
    with _conn() as c:
        row = c.execute(
            "SELECT value FROM bot_settings WHERE key=?",
            (_SCHEDULE_CLOSE_FROM_KEY,),
        ).fetchone()
    return row["value"] if row else None


def set_schedule_close_from(from_date: str | None) -> None:
    with _conn() as c:
        if from_date:
            c.execute(
                """INSERT INTO bot_settings (key, value) VALUES (?, ?)
                   ON CONFLICT(key) DO UPDATE SET value=excluded.value""",
                (_SCHEDULE_CLOSE_FROM_KEY, from_date),
            )
        else:
            c.execute(
                "DELETE FROM bot_settings WHERE key=?",
                (_SCHEDULE_CLOSE_FROM_KEY,),
            )


def get_schedule_open_from() -> Optional[str]:
    with _conn() as c:
        row = c.execute(
            "SELECT value FROM bot_settings WHERE key=?",
            (_SCHEDULE_OPEN_FROM_KEY,),
        ).fetchone()
    return row["value"] if row else None


def set_schedule_open_from(from_date: str | None) -> None:
    with _conn() as c:
        if from_date:
            c.execute(
                """INSERT INTO bot_settings (key, value) VALUES (?, ?)
                   ON CONFLICT(key) DO UPDATE SET value=excluded.value""",
                (_SCHEDULE_OPEN_FROM_KEY, from_date),
            )
        else:
            c.execute(
                "DELETE FROM bot_settings WHERE key=?",
                (_SCHEDULE_OPEN_FROM_KEY,),
            )


def uses_date_schedule() -> bool:
    with _conn() as c:
        n = c.execute(
            "SELECT COUNT(*) FROM schedule_date_slots WHERE is_open=1"
        ).fetchone()[0]
    return int(n) > 0


def is_date_bookable(book_date: str) -> bool:
    """Дата в разрешённом периоде расписания."""
    open_from = get_schedule_open_from()
    close_from = get_schedule_close_from()
    if open_from and book_date < open_from:
        return False
    if close_from and book_date >= close_from:
        return False
    return True


def save_schedule_by_date(
    slots: List[Dict[str, Any]],
    *,
    open_from: str | None = None,
    close_from: str | None = None,
) -> None:
    now = datetime.now().isoformat()
    with _conn() as c:
        c.execute("DELETE FROM schedule_date_slots")
        c.execute("DELETE FROM schedule_slots")
        for s in slots:
            c.execute(
                """INSERT INTO schedule_date_slots
                   (book_date, slot_time, is_open, slot_label, updated_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (
                    s["book_date"],
                    s["slot_time"],
                    1 if s.get("is_open") else 0,
                    s.get("slot_label") or "",
                    now,
                ),
            )
    open_count = sum(1 for s in slots if s.get("is_open"))
    if open_count:
        set_schedule_open_from(open_from)
        set_schedule_close_from(close_from)
    else:
        set_schedule_open_from(None)
        set_schedule_close_from(None)


def save_schedule(
    slots: List[Dict[str, Any]], *, close_from: str | None = None
) -> None:
    now = datetime.now().isoformat()
    with _conn() as c:
        c.execute("DELETE FROM schedule_slots")
        for s in slots:
            c.execute(
                """INSERT INTO schedule_slots (weekday, slot_time, is_open, slot_label, updated_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (
                    s["weekday"],
                    s["slot_time"],
                    1 if s.get("is_open") else 0,
                    s.get("slot_label") or "",
                    now,
                ),
            )
    open_count = sum(1 for s in slots if s.get("is_open"))
    if open_count and close_from is not None:
        set_schedule_close_from(close_from)
    elif not open_count:
        set_schedule_close_from(None)
    set_schedule_open_from(None)
    with _conn() as c:
        c.execute("DELETE FROM schedule_date_slots")


def close_all_schedule() -> bool:
    """Закрыть все слоты. True, если что-то было открыто."""
    had = has_schedule()
    with _conn() as c:
        c.execute("DELETE FROM schedule_date_slots")
    set_schedule_open_from(None)
    set_schedule_close_from(None)
    if not had:
        return False
    save_schedule(_closed_schedule_slots(), close_from=None)
    return True


def has_schedule() -> bool:
    if uses_date_schedule():
        return True
    with _conn() as c:
        n = c.execute("SELECT COUNT(*) FROM schedule_slots WHERE is_open=1").fetchone()[0]
    return n > 0


def _label_matches_visit_type(label: str, visit_type: str) -> bool:
    s = (label or "").lower()
    if visit_type == "online":
        return "онлайн" in s
    # очно: «ментал хелп» и прочие открытые без онлайн
    return "ментал" in s or ("открыто" in s and "онлайн" not in s)


def has_schedule_for_type(visit_type: str) -> bool:
    if uses_date_schedule():
        with _conn() as c:
            rows = c.execute(
                "SELECT slot_label FROM schedule_date_slots WHERE is_open=1"
            ).fetchall()
        return any(_label_matches_visit_type(r["slot_label"], visit_type) for r in rows)
    with _conn() as c:
        rows = c.execute(
            "SELECT slot_label FROM schedule_slots WHERE is_open=1"
        ).fetchall()
    return any(_label_matches_visit_type(r["slot_label"], visit_type) for r in rows)


def get_open_times_for_date(book_date: str, visit_type: str) -> List[str]:
    if not uses_date_schedule():
        d = datetime.strptime(book_date, "%Y-%m-%d").date()
        return get_open_times_for_weekday(d.weekday(), visit_type)
    with _conn() as c:
        rows = c.execute(
            """SELECT slot_time, slot_label FROM schedule_date_slots
               WHERE book_date=? AND is_open=1 ORDER BY slot_time""",
            (book_date,),
        ).fetchall()
    return [
        r["slot_time"]
        for r in rows
        if _label_matches_visit_type(r["slot_label"], visit_type)
    ]


def get_open_times_for_weekday(weekday: int, visit_type: str) -> List[str]:
    with _conn() as c:
        rows = c.execute(
            """SELECT slot_time, slot_label FROM schedule_slots
               WHERE weekday=? AND is_open=1 ORDER BY slot_time""",
            (weekday,),
        ).fetchall()
    return [
        r["slot_time"]
        for r in rows
        if _label_matches_visit_type(r["slot_label"], visit_type)
    ]


def get_open_slot(book_date: str, slot_time: str) -> Optional[Dict[str, Any]]:
    """Открытый слот на дату (slot_label) или None."""
    with _conn() as c:
        if uses_date_schedule():
            row = c.execute(
                """SELECT slot_time, slot_label FROM schedule_date_slots
                   WHERE book_date=? AND slot_time=? AND is_open=1""",
                (book_date, slot_time),
            ).fetchone()
        else:
            wd = datetime.strptime(book_date, "%Y-%m-%d").date().weekday()
            row = c.execute(
                """SELECT slot_time, slot_label FROM schedule_slots
                   WHERE weekday=? AND slot_time=? AND is_open=1""",
                (wd, slot_time),
            ).fetchone()
    return dict(row) if row else None


def close_schedule_slot(book_date: str, slot_time: str) -> bool:
    """Закрывает ячейку расписания (is_open=0)."""
    now = datetime.now().isoformat()
    with _conn() as c:
        if uses_date_schedule():
            cur = c.execute(
                """UPDATE schedule_date_slots SET is_open=0, updated_at=?
                   WHERE book_date=? AND slot_time=? AND is_open=1""",
                (now, book_date, slot_time),
            )
        else:
            wd = datetime.strptime(book_date, "%Y-%m-%d").date().weekday()
            cur = c.execute(
                """UPDATE schedule_slots SET is_open=0, updated_at=?
                   WHERE weekday=? AND slot_time=? AND is_open=1""",
                (now, wd, slot_time),
            )
    return cur.rowcount > 0


def slot_label_for_visit_type(visit_type: str) -> str:
    return SLOT_LABEL_ONLINE if visit_type == "online" else SLOT_LABEL_IN_PERSON


def list_addable_slot_times(book_date: str) -> List[str]:
    """Часы без открытого окна на конкретную дату (можно добавить или открыть заново)."""
    if not uses_date_schedule():
        return []
    with _conn() as c:
        open_times = {
            r["slot_time"]
            for r in c.execute(
                """SELECT slot_time FROM schedule_date_slots
                   WHERE book_date=? AND is_open=1""",
                (book_date,),
            ).fetchall()
        }
    return [f"{h:02d}:00" for h in _HOURS if f"{h:02d}:00" not in open_times]


def add_schedule_slot_for_date(
    book_date: str, slot_time: str, visit_type: str
) -> tuple[bool, str]:
    """Одно окно на одну дату — остальное расписание не трогаем."""
    if not uses_date_schedule():
        return False, "Сначала загрузите расписание по датам (Excel)."
    if not is_date_bookable(book_date):
        return False, "Дата вне периода записи."
    if slot_time not in {f"{h:02d}:00" for h in _HOURS}:
        return False, "Время вне рабочих часов (09:00–22:00)."
    if slot_taken(book_date, slot_time):
        return False, "На это время уже есть запись клиента."
    if get_open_slot(book_date, slot_time):
        return False, "Это окно уже открыто."

    label = slot_label_for_visit_type(visit_type)
    now = datetime.now().isoformat()
    with _conn() as c:
        row = c.execute(
            """SELECT is_open FROM schedule_date_slots
               WHERE book_date=? AND slot_time=?""",
            (book_date, slot_time),
        ).fetchone()
        if row:
            c.execute(
                """UPDATE schedule_date_slots
                   SET is_open=1, slot_label=?, updated_at=?
                   WHERE book_date=? AND slot_time=?""",
                (label, now, book_date, slot_time),
            )
        else:
            c.execute(
                """INSERT INTO schedule_date_slots
                   (book_date, slot_time, is_open, slot_label, updated_at)
                   VALUES (?, ?, 1, ?, ?)""",
                (book_date, slot_time, label, now),
            )
    return True, ""


def get_schedule_summary() -> List[Dict]:
    """Сводка по дням: сколько открытых часов."""
    if uses_date_schedule():
        open_from = get_schedule_open_from()
        close_from = get_schedule_close_from()
        with _conn() as c:
            rows = c.execute(
                """SELECT book_date, slot_time FROM schedule_date_slots
                   WHERE is_open=1
                     AND (? IS NULL OR book_date >= ?)
                     AND (? IS NULL OR book_date < ?)
                   ORDER BY book_date, slot_time""",
                (open_from, open_from, close_from, close_from),
            ).fetchall()
        by_date: Dict[str, List[str]] = {}
        for r in rows:
            by_date.setdefault(r["book_date"], []).append(r["slot_time"])
        result = []
        for book_date in sorted(by_date):
            d = date.fromisoformat(book_date)
            name = d.strftime("%d.%m")
            times = ", ".join(by_date[book_date])
            result.append({"weekday": d.weekday(), "name": name, "text": times})
        return result

    names = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
    result = []
    with _conn() as c:
        for wd in range(7):
            rows = c.execute(
                """SELECT slot_time, slot_label FROM schedule_slots
                   WHERE weekday=? AND is_open=1 ORDER BY slot_time""",
                (wd,),
            ).fetchall()
            if not rows:
                result.append({"weekday": wd, "name": names[wd], "text": "закрыто"})
            else:
                times = ", ".join(r["slot_time"] for r in rows)
                result.append({"weekday": wd, "name": names[wd], "text": times})
    return result


def get_bookable_dates_by_visit_type() -> Dict[str, List[str]]:
    """ISO-даты с открытыми слотами по формату приёма."""
    if uses_date_schedule():
        open_from = get_schedule_open_from()
        close_from = get_schedule_close_from()
        with _conn() as c:
            rows = c.execute(
                """SELECT DISTINCT book_date FROM schedule_date_slots
                   WHERE is_open=1
                     AND (? IS NULL OR book_date >= ?)
                     AND (? IS NULL OR book_date < ?)
                   ORDER BY book_date""",
                (open_from, open_from, close_from, close_from),
            ).fetchall()
        online: List[str] = []
        in_person: List[str] = []
        for r in rows:
            bd = r["book_date"]
            if get_open_times_for_date(bd, "online"):
                online.append(bd)
            if get_open_times_for_date(bd, "in_person"):
                in_person.append(bd)
        return {"online": online, "in_person": in_person}

    online: List[str] = []
    in_person: List[str] = []
    for wd in range(7):
        if get_open_times_for_weekday(wd, "online"):
            online.append(str(wd))
        if get_open_times_for_weekday(wd, "in_person"):
            in_person.append(str(wd))
    return {"online": online, "in_person": in_person}


def _phone_skipped(user_id: int) -> bool:
    import user_prefs

    user_prefs.migrate_user_profile_columns()
    with _conn() as c:
        row = c.execute(
            "SELECT phone_skipped FROM user_profiles WHERE user_id=?", (user_id,)
        ).fetchone()
    return bool(row and row["phone_skipped"])


def should_ask_registration_phone(user_id: int) -> bool:
    if not has_user_timezone(user_id):
        return False
    if get_user_phone(user_id):
        return False
    return not _phone_skipped(user_id)


def mark_phone_registration_skipped(user_id: int) -> None:
    import user_prefs

    user_prefs.ensure_profile(user_id)
    with _conn() as c:
        c.execute(
            "UPDATE user_profiles SET phone_skipped=1 WHERE user_id=?",
            (user_id,),
        )


def is_registration_complete(user_id: int) -> bool:
    if not has_user_timezone(user_id):
        return False
    if get_user_phone(user_id) or _phone_skipped(user_id):
        return True
    return False


def wipe_all_data() -> None:
    """Полное обнуление данных бота: записи, профили, ДЗ, расписание."""
    with _conn() as c:
        c.executescript(
            """
            DELETE FROM homework_program_entries;
            DELETE FROM homework_programs;
            DELETE FROM homework_sent_items;
            DELETE FROM homework_sent;
            DELETE FROM homework_declines;
            DELETE FROM literature_sent;
            DELETE FROM clients;
            DELETE FROM bookings;
            DELETE FROM user_profiles;
            DELETE FROM schedule_date_slots;
            DELETE FROM schedule_slots;
            DELETE FROM bot_settings;
            DELETE FROM homework_templates;
            DELETE FROM literature_catalog;
            """
        )


def visit_type_label(visit_type: str) -> str:
    return "Онлайн" if visit_type == "online" else "Очно"


def create_booking(
    user_id: int,
    user_name: str,
    book_date: str,
    book_time: str,
    visit_type: str = "in_person",
) -> int:
    """Создать или повторно активировать запись (после отмены того же слота)."""
    now = datetime.now().isoformat()
    with _conn() as c:
        row = c.execute(
            """SELECT id, status FROM bookings
               WHERE user_id=? AND book_date=? AND book_time=?""",
            (user_id, book_date, book_time),
        ).fetchone()
        if row:
            if row["status"] in ("booked", "confirmed"):
                return int(row["id"])
            c.execute(
                """UPDATE bookings SET user_name=?, visit_type=?, status='booked',
                   evening_confirmed=NULL, created_at=?, google_event_id=NULL
                   WHERE id=?""",
                (user_name, visit_type, now, row["id"]),
            )
            return int(row["id"])
        cur = c.execute(
            """INSERT INTO bookings (user_id, user_name, book_date, book_time, visit_type, status, created_at)
               VALUES (?, ?, ?, ?, ?, 'booked', ?)""",
            (user_id, user_name, book_date, book_time, visit_type, now),
        )
        return int(cur.lastrowid)


def slot_taken(book_date: str, book_time: str) -> bool:
    with _conn() as c:
        row = c.execute(
            "SELECT 1 FROM bookings WHERE book_date=? AND book_time=? AND status IN ('booked','confirmed')",
            (book_date, book_time),
        ).fetchone()
    return row is not None


def get_active_booking_slots() -> List[Dict[str, Any]]:
    """Активные записи (дата, время, формат) — для сохранения при импорте расписания."""
    with _conn() as c:
        rows = c.execute(
            """SELECT book_date, book_time, visit_type FROM bookings
               WHERE status IN ('booked', 'confirmed')"""
        ).fetchall()
    return [dict(r) for r in rows]


def get_bookings_on(d: str) -> List[Dict]:
    with _conn() as c:
        rows = c.execute(
            """SELECT * FROM bookings
               WHERE book_date=? AND status IN ('booked','confirmed')
               ORDER BY book_time""",
            (d,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_bookings_tomorrow_for_confirm(tomorrow: str) -> List[Dict]:
    with _conn() as c:
        rows = c.execute(
            """SELECT * FROM bookings
               WHERE book_date=? AND status='booked' AND evening_confirmed IS NULL
               AND evening_confirm_sent_at IS NULL""",
            (tomorrow,),
        ).fetchall()
    return [dict(r) for r in rows]


def claim_evening_confirm_send(booking_id: int) -> bool:
    """Атомарно помечает, что запрос подтверждения отправлен (один процесс — одно сообщение)."""
    now = datetime.now().isoformat()
    with _conn() as c:
        cur = c.execute(
            """UPDATE bookings SET evening_confirm_sent_at=?
               WHERE id=? AND status='booked' AND evening_confirmed IS NULL
               AND evening_confirm_sent_at IS NULL""",
            (now, booking_id),
        )
    return cur.rowcount > 0


def claim_morning_reminder_send(booking_id: int, book_date: str) -> bool:
    """Атомарно помечает утреннее напоминание за сегодня."""
    with _conn() as c:
        cur = c.execute(
            """UPDATE bookings SET morning_reminder_sent_date=?
               WHERE id=? AND book_date=? AND status IN ('booked','confirmed')
               AND (morning_reminder_sent_date IS NULL OR morning_reminder_sent_date != ?)""",
            (book_date, booking_id, book_date, book_date),
        )
    return cur.rowcount > 0


def set_evening_confirmed(booking_id: int, confirmed: bool):
    with _conn() as c:
        status = "confirmed" if confirmed else "cancelled"
        c.execute(
            "UPDATE bookings SET evening_confirmed=?, status=? WHERE id=?",
            (1 if confirmed else 0, status, booking_id),
        )


def get_booking_by_id(booking_id: int) -> Optional[Dict]:
    with _conn() as c:
        row = c.execute("SELECT * FROM bookings WHERE id=?", (booking_id,)).fetchone()
    return dict(row) if row else None


def get_user_timezone(user_id: int) -> Optional[str]:
    with _conn() as c:
        row = c.execute(
            "SELECT timezone FROM user_profiles WHERE user_id=?", (user_id,)
        ).fetchone()
    if row and row["timezone"]:
        tz = str(row["timezone"]).strip()
        return tz if tz else None
    return None


def set_user_timezone(user_id: int, tz_name: str, full_name: str | None = None):
    with _conn() as c:
        row = c.execute(
            "SELECT user_id FROM user_profiles WHERE user_id=?", (user_id,)
        ).fetchone()
        if row:
            if full_name:
                c.execute(
                    """UPDATE user_profiles SET timezone=?, full_name=?
                       WHERE user_id=?""",
                    (tz_name, full_name, user_id),
                )
            else:
                c.execute(
                    "UPDATE user_profiles SET timezone=? WHERE user_id=?",
                    (tz_name, user_id),
                )
        else:
            c.execute(
                """INSERT INTO user_profiles (user_id, full_name, phone, timezone)
                   VALUES (?, ?, '', ?)""",
                (user_id, full_name or "", tz_name),
            )


def has_user_timezone(user_id: int) -> bool:
    return bool(get_user_timezone(user_id))


def get_user_phone(user_id: int) -> Optional[str]:
    with _conn() as c:
        row = c.execute(
            "SELECT phone FROM user_profiles WHERE user_id=?", (user_id,)
        ).fetchone()
    if row and row["phone"]:
        p = str(row["phone"]).strip()
        return p if p else None
    return None


def set_user_phone(user_id: int, phone: str, full_name: str | None = None):
    with _conn() as c:
        row = c.execute(
            "SELECT user_id FROM user_profiles WHERE user_id=?", (user_id,)
        ).fetchone()
        if row:
            if full_name:
                c.execute(
                    """UPDATE user_profiles SET phone=?, full_name=?, phone_skipped=0
                       WHERE user_id=?""",
                    (phone, full_name, user_id),
                )
            else:
                c.execute(
                    "UPDATE user_profiles SET phone=?, phone_skipped=0 WHERE user_id=?",
                    (phone, user_id),
                )
        else:
            c.execute(
                """INSERT INTO user_profiles (user_id, full_name, phone)
                   VALUES (?, ?, ?)""",
                (user_id, full_name or "", phone),
            )


def get_user_upcoming_bookings(user_id: int, from_date: str) -> List[Dict]:
    with _conn() as c:
        rows = c.execute(
            """SELECT * FROM bookings
               WHERE user_id=? AND book_date>=? AND status IN ('booked','confirmed')
               ORDER BY book_date, book_time""",
            (user_id, from_date),
        ).fetchall()
    return [dict(r) for r in rows]


def get_user_active_booking(user_id: int, from_date: str) -> Optional[Dict]:
    """Первая предстоящая активная запись или None."""
    bookings = get_user_upcoming_bookings(user_id, from_date)
    return bookings[0] if bookings else None


def set_google_event_id(booking_id: int, event_id: str):
    with _conn() as c:
        c.execute(
            "UPDATE bookings SET google_event_id=? WHERE id=?",
            (event_id, booking_id),
        )


def clear_google_event_id(booking_id: int):
    with _conn() as c:
        c.execute(
            "UPDATE bookings SET google_event_id=NULL WHERE id=?",
            (booking_id,),
        )


def get_upcoming_without_google(from_date: str) -> List[Dict]:
    with _conn() as c:
        rows = c.execute(
            """SELECT * FROM bookings
               WHERE book_date>=? AND status IN ('booked','confirmed')
                 AND (google_event_id IS NULL OR google_event_id='')
               ORDER BY book_date, book_time""",
            (from_date,),
        ).fetchall()
    return [dict(r) for r in rows]
