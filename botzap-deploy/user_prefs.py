"""Настройки пользователя: уведомления, удаление профиля."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from db_conn import connect as _conn

DEFAULTS = {
    "morning_notify_from": "08:00",
    "morning_notify_to": "10:00",
    "evening_notify_from": "18:00",
    "evening_notify_to": "21:00",
    "hw_notify_enabled": 1,
    "morning_hw_sent_date": "",
    "evening_hw_sent_date": "",
}


def migrate_user_profile_columns():
    with _conn() as c:
        cols = {r[1] for r in c.execute("PRAGMA table_info(user_profiles)").fetchall()}
        additions = [
            ("morning_notify_from", "TEXT NOT NULL DEFAULT '08:00'"),
            ("morning_notify_to", "TEXT NOT NULL DEFAULT '10:00'"),
            ("evening_notify_from", "TEXT NOT NULL DEFAULT '18:00'"),
            ("evening_notify_to", "TEXT NOT NULL DEFAULT '21:00'"),
            ("hw_notify_enabled", "INTEGER NOT NULL DEFAULT 1"),
            ("morning_hw_sent_date", "TEXT NOT NULL DEFAULT ''"),
            ("evening_hw_sent_date", "TEXT NOT NULL DEFAULT ''"),
            ("phone_skipped", "INTEGER NOT NULL DEFAULT 0"),
        ]
        for name, ddl in additions:
            if name not in cols:
                c.execute(f"ALTER TABLE user_profiles ADD COLUMN {name} {ddl}")


def init_declines_table():
    with _conn() as c:
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS homework_declines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                program_id INTEGER,
                homework_id INTEGER,
                title TEXT NOT NULL,
                reason TEXT NOT NULL DEFAULT '',
                declined_at TEXT NOT NULL,
                gcal_synced INTEGER NOT NULL DEFAULT 0
            )
            """
        )


def ensure_profile(user_id: int, full_name: str | None = None):
    migrate_user_profile_columns()
    with _conn() as c:
        row = c.execute(
            "SELECT user_id FROM user_profiles WHERE user_id=?", (user_id,)
        ).fetchone()
        if row:
            if full_name:
                c.execute(
                    "UPDATE user_profiles SET full_name=? WHERE user_id=?",
                    (full_name, user_id),
                )
            return
        c.execute(
            """INSERT INTO user_profiles
               (user_id, full_name, phone, timezone,
                morning_notify_from, morning_notify_to,
                evening_notify_from, evening_notify_to,
                hw_notify_enabled, morning_hw_sent_date, evening_hw_sent_date)
               VALUES (?, ?, '', '', ?, ?, ?, ?, 1, '', '')""",
            (
                user_id,
                full_name or "",
                DEFAULTS["morning_notify_from"],
                DEFAULTS["morning_notify_to"],
                DEFAULTS["evening_notify_from"],
                DEFAULTS["evening_notify_to"],
            ),
        )


def get_prefs(user_id: int) -> Dict[str, Any]:
    ensure_profile(user_id)
    with _conn() as c:
        row = c.execute(
            "SELECT * FROM user_profiles WHERE user_id=?", (user_id,)
        ).fetchone()
    if not row:
        return dict(DEFAULTS)
    d = dict(row)
    for k, v in DEFAULTS.items():
        if k not in d or d[k] is None:
            d[k] = v
    return d


def set_hw_notify_enabled(user_id: int, enabled: bool):
    ensure_profile(user_id)
    with _conn() as c:
        c.execute(
            "UPDATE user_profiles SET hw_notify_enabled=? WHERE user_id=?",
            (1 if enabled else 0, user_id),
        )


def set_notify_window(user_id: int, kind: str, time_from: str, time_to: str):
    ensure_profile(user_id)
    if kind == "morning":
        col_f, col_t = "morning_notify_from", "morning_notify_to"
    else:
        col_f, col_t = "evening_notify_from", "evening_notify_to"
    with _conn() as c:
        c.execute(
            f"UPDATE user_profiles SET {col_f}=?, {col_t}=? WHERE user_id=?",
            (time_from, time_to, user_id),
        )


def preset_windows() -> Dict[str, tuple[str, str]]:
    return {
        "morning_early": ("07:00", "09:00"),
        "morning_mid": ("08:00", "10:00"),
        "morning_late": ("09:00", "11:00"),
        "evening_early": ("17:00", "19:00"),
        "evening_mid": ("18:00", "21:00"),
        "evening_late": ("19:00", "22:00"),
    }


def apply_preset(user_id: int, preset: str):
    p = preset_windows().get(preset)
    if not p:
        return
    kind = "morning" if preset.startswith("morning_") else "evening"
    set_notify_window(user_id, kind, p[0], p[1])


def _parse_hm(s: str) -> tuple[int, int]:
    hh, mm = s.split(":")
    return int(hh), int(mm)


def in_notify_window(prefs: Dict[str, Any], kind: str, now: datetime) -> bool:
    if not prefs.get("hw_notify_enabled", 1):
        return False
    if kind == "morning":
        t_from, t_to = prefs.get("morning_notify_from"), prefs.get("morning_notify_to")
        sent_key = "morning_hw_sent_date"
    else:
        t_from, t_to = prefs.get("evening_notify_from"), prefs.get("evening_notify_to")
        sent_key = "evening_hw_sent_date"
    fh, fm = _parse_hm(t_from or "08:00")
    th, tm = _parse_hm(t_to or "10:00")
    cur = now.hour * 60 + now.minute
    start = fh * 60 + fm
    end = th * 60 + tm
    if cur < start or cur > end:
        return False
    today = now.date().isoformat()
    if (prefs.get(sent_key) or "")[:10] == today:
        return False
    return True


def mark_hw_sent_today(user_id: int, kind: str):
    today = datetime.now().date().isoformat()
    col = "morning_hw_sent_date" if kind == "morning" else "evening_hw_sent_date"
    ensure_profile(user_id)
    with _conn() as c:
        c.execute(
            f"UPDATE user_profiles SET {col}=? WHERE user_id=?",
            (today, user_id),
        )


def delete_user_data(user_id: int) -> None:
    """Полное удаление данных пользователя из botzap."""
    import homework_db as hwdb

    hwdb.ensure_client(user_id)
    with _conn() as c:
        prog_ids = [
            r[0]
            for r in c.execute(
                "SELECT id FROM homework_programs WHERE user_id=?", (user_id,)
            ).fetchall()
        ]
        for pid in prog_ids:
            c.execute(
                "DELETE FROM homework_program_entries WHERE program_id=?", (pid,)
            )
        c.execute("DELETE FROM homework_programs WHERE user_id=?", (user_id,))
        hw_ids = [
            r[0]
            for r in c.execute(
                "SELECT id FROM homework_sent WHERE user_id=?", (user_id,)
            ).fetchall()
        ]
        for hid in hw_ids:
            c.execute(
                "DELETE FROM homework_sent_items WHERE homework_id=?", (hid,)
            )
        c.execute("DELETE FROM homework_sent WHERE user_id=?", (user_id,))
        c.execute("DELETE FROM homework_declines WHERE user_id=?", (user_id,))
        c.execute("DELETE FROM literature_sent WHERE user_id=?", (user_id,))
        c.execute("DELETE FROM clients WHERE user_id=?", (user_id,))
        c.execute("DELETE FROM user_profiles WHERE user_id=?", (user_id,))
        c.execute(
            """UPDATE bookings SET status='cancelled', evening_confirmed=0
               WHERE user_id=? AND status IN ('booked','confirmed')""",
            (user_id,),
        )
