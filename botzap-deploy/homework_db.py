"""База: клиенты, пул ДЗ (КПТ), отправленные задания."""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

import config
import homework_programs as hp
from db_conn import DB_PATH, connect as _conn


def _diary_bot_link() -> str:
    """Markdown-ссылка на бота дневников (КПТ)."""
    username = getattr(config, "DIARY_BOT_USERNAME", "TDCBT_bot").lstrip("@")
    return f"https://t.me/{username}"


def thought_diary_body() -> str:
    link = _diary_bot_link()
    return (
        "*Дневник автоматических мыслей*\n\n"
        "Когда замечаете сильную эмоцию, запишите:\n"
        "1️⃣ *Ситуация* — что произошло (факты)\n"
        "2️⃣ *Мысль* — что пронеслось в голове\n"
        "3️⃣ *Эмоция* — что почувствовали (0–10)\n"
        "4️⃣ *Доказательства «за» и «против»* этой мысли\n"
        "5️⃣ *Более сбалансированная мысль*\n"
        "6️⃣ *Эмоция сейчас* (0–10)\n\n"
        "Минимум 1 запись в день, лучше в моменте или вечером.\n\n"
        f"📲 Заполняйте в боте: [Дневник мыслей]({link})"
    )


def exposure_diary_body() -> str:
    link = _diary_bot_link()
    return (
        "*Дневник экспозиции*\n\n"
        "После каждого упражнения или столкновения со страхом запишите:\n"
        "1️⃣ *Ситуация* — что делали (шаг по лестнице)\n"
        "2️⃣ *Страх до* (0–10) и *страх после* (0–10)\n"
        "3️⃣ *Что заметили в теле и мыслях* во время экспозиции\n"
        "4️⃣ *Что помогло выдержать* (дыхание, опора на факты, поддержка)\n"
        "5️⃣ *Вывод* — что нового узнали о страхе\n\n"
        "Записывайте сразу после шага, пока свежи ощущения. "
        "Если делали несколько попыток за день — отдельная запись на каждую.\n\n"
        f"📲 Заполняйте в боте: [Дневник экспозиции]({link})"
    )


CBT_SEED: List[Dict[str, str]] = [
    {
        "title": "Дневник мыслей",
        "body": "",  # подставляется в seed/sync
    },
    {
        "title": "Дневник экспозиции",
        "body": "",
    },
    {
        "title": "Стоп-мысль",
        "body": (
            "*Техника «Стоп-мысль»*\n\n"
            "1. Заметьте негативную мысль.\n"
            "2. Мысленно скажите: *«Стоп»*.\n"
            "3. Спросите: *«Какие есть факты? Что я предполагаю?»*\n"
            "4. Сформулируйте более реалистичную альтернативу.\n"
            "5. Оцените эмоцию до и после (0–10).\n\n"
            "Практикуйте 3–5 раз в течение дня при тревоге или самокритике."
        ),
    },
    {
        "title": "Приятные действия",
        "body": (
            "*Поведенческая активация*\n\n"
            "Составьте список из 5–7 небольших приятных или полезных дел "
            "(прогулка 15 мин, звонок близкому, душ, чтение, готовка).\n\n"
            "На этой неделе выполните *минимум 3* пункта из списка, "
            "даже если «не хочется». Отметьте настроение до и после (0–10).\n\n"
            "Цель — не «заслужить отдых», а дать мозгу опыт удовольствия и контроля."
        ),
    },
    {
        "title": "Иерархия тревоги",
        "body": (
            "*Постепенная экспозиция (лестница тревоги)*\n\n"
            "1. Выберите одну ситуацию, которой избегаете.\n"
            "2. Составьте список шагов от самого лёгкого к сложному (8–10 пунктов).\n"
            "3. Начните с шага на уровне тревоги 4–5/10.\n"
            "4. Оставайтесь в ситуации, пока тревога не снизится хотя бы на 2 балла.\n"
            "5. Переходите к следующему шагу не раньше чем через 1–2 дня.\n\n"
            "Записывайте: шаг, тревога до/после, что помогло выдержать."
        ),
    },
    {
        "title": hp.TITLE_POSITIVE,
        "body": "",
    },
    {
        "title": hp.TITLE_ANXIETY,
        "body": "",
    },
    {
        "title": "Заземление 5-4-3-2-1",
        "body": (
            "*Упражнение «5-4-3-2-1» (заземление)*\n\n"
            "При накате тревоги или паники назовите:\n"
            "• *5* вещей, которые видите\n"
            "• *4* — которые слышите\n"
            "• *3* — которые чувствуете телом (опора, температура)\n"
            "• *2* запаха\n"
            "• *1* вкус (или глоток воды)\n\n"
            "Дышите медленно: вдох 4 сек, выдох 6 сек. Повторите 2–3 цикла.\n"
            "Используйте 1–2 раза в день или по необходимости."
        ),
    },
]


def init_homework_tables():
    import user_prefs

    user_prefs.init_declines_table()
    user_prefs.migrate_user_profile_columns()
    with _conn() as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS clients (
                user_id INTEGER PRIMARY KEY,
                display_name TEXT,
                admin_note TEXT NOT NULL DEFAULT '',
                sessions_manual INTEGER NOT NULL DEFAULT 0,
                pin_message_id INTEGER,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS homework_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'КПТ',
                is_active INTEGER NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS homework_sent (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                booking_id INTEGER,
                intro TEXT NOT NULL,
                sent_at TEXT NOT NULL,
                read_at TEXT,
                sent_by INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS homework_sent_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                homework_id INTEGER NOT NULL,
                template_id INTEGER,
                sort_order INTEGER NOT NULL,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                FOREIGN KEY (homework_id) REFERENCES homework_sent(id)
            );
            CREATE TABLE IF NOT EXISTS homework_programs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                homework_id INTEGER NOT NULL,
                sent_item_id INTEGER,
                program_type TEXT NOT NULL,
                start_date TEXT NOT NULL,
                days_total INTEGER NOT NULL DEFAULT 6,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS homework_program_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                program_id INTEGER NOT NULL,
                day_index INTEGER NOT NULL,
                day_date TEXT NOT NULL,
                reminded_at TEXT,
                submitted_at TEXT,
                payload TEXT NOT NULL DEFAULT '{}',
                UNIQUE(program_id, day_index),
                FOREIGN KEY (program_id) REFERENCES homework_programs(id)
            );
            """
        )
    seed_templates_if_empty()
    sync_diary_homework_templates()
    sync_program_homework_templates()
    _migrate_clients_columns()


def _template_bodies() -> Dict[str, str]:
    return {
        "Дневник мыслей": thought_diary_body(),
        "Дневник экспозиции": exposure_diary_body(),
        hp.TITLE_POSITIVE: hp.positive_emotions_body(),
        hp.TITLE_ANXIETY: hp.anxiety_thoughts_body(),
    }


def seed_templates_if_empty():
    bodies = _template_bodies()
    with _conn() as c:
        n = c.execute("SELECT COUNT(*) FROM homework_templates").fetchone()[0]
        if n > 0:
            return
        now = datetime.now().isoformat()
        order = 0
        for tpl in CBT_SEED:
            title = tpl["title"]
            body = bodies.get(title) or tpl.get("body") or ""
            c.execute(
                """INSERT INTO homework_templates
                   (title, body, category, is_active, sort_order, created_at)
                   VALUES (?, ?, 'КПТ', 1, ?, ?)""",
                (title, body, order, now),
            )
            order += 1


def sync_diary_homework_templates():
    """Обновить дневники в пуле и добавить «Дневник экспозиции», если нет."""
    bodies = _template_bodies()
    now = datetime.now().isoformat()
    with _conn() as c:
        for title, body in bodies.items():
            row = c.execute(
                "SELECT id FROM homework_templates WHERE title=?", (title,)
            ).fetchone()
            sort = 0 if title == "Дневник мыслей" else (1 if title == "Дневник экспозиции" else None)
            if row:
                if sort is not None:
                    c.execute(
                        "UPDATE homework_templates SET body=?, is_active=1, sort_order=? WHERE title=?",
                        (body, sort, title),
                    )
                else:
                    c.execute(
                        "UPDATE homework_templates SET body=?, is_active=1 WHERE title=?",
                        (body, title),
                    )
            else:
                max_order = c.execute(
                    "SELECT COALESCE(MAX(sort_order), -1) FROM homework_templates"
                ).fetchone()[0]
                order = sort if sort is not None else max_order + 1
                c.execute(
                    """INSERT INTO homework_templates
                       (title, body, category, is_active, sort_order, created_at)
                       VALUES (?, ?, 'КПТ', 1, ?, ?)""",
                    (title, body, order, now),
                )


def sync_program_homework_templates():
    """Добавить/обновить шаблоны 6-дневных программ в пуле."""
    bodies = _template_bodies()
    now = datetime.now().isoformat()
    with _conn() as c:
        for title in (hp.TITLE_POSITIVE, hp.TITLE_ANXIETY):
            body = bodies.get(title, "")
            row = c.execute(
                "SELECT id FROM homework_templates WHERE title=?", (title,)
            ).fetchone()
            if row:
                c.execute(
                    "UPDATE homework_templates SET body=?, is_active=1 WHERE title=?",
                    (body, title),
                )
            else:
                max_order = c.execute(
                    "SELECT COALESCE(MAX(sort_order), -1) FROM homework_templates"
                ).fetchone()[0]
                c.execute(
                    """INSERT INTO homework_templates
                       (title, body, category, is_active, sort_order, created_at)
                       VALUES (?, ?, 'КПТ', 1, ?, ?)""",
                    (title, body, max_order + 1, now),
                )


def _migrate_clients_columns():
    with _conn() as c:
        cols = [r[1] for r in c.execute("PRAGMA table_info(clients)").fetchall()]
        if "pin_message_id" not in cols:
            c.execute("ALTER TABLE clients ADD COLUMN pin_message_id INTEGER")


def set_pin_message_id(user_id: int, message_id: int):
    ensure_client(user_id)
    now = datetime.now().isoformat()
    with _conn() as c:
        c.execute(
            "UPDATE clients SET pin_message_id=?, updated_at=? WHERE user_id=?",
            (message_id, now, user_id),
        )


def ensure_client(user_id: int, display_name: str | None = None):
    now = datetime.now().isoformat()
    with _conn() as c:
        row = c.execute(
            "SELECT user_id FROM clients WHERE user_id=?", (user_id,)
        ).fetchone()
        if row:
            if display_name:
                c.execute(
                    "UPDATE clients SET display_name=?, updated_at=? WHERE user_id=?",
                    (display_name, now, user_id),
                )
        else:
            c.execute(
                """INSERT INTO clients (user_id, display_name, admin_note, sessions_manual, updated_at)
                   VALUES (?, ?, '', 0, ?)""",
                (user_id, display_name or "", now),
            )


def get_client(user_id: int) -> Optional[Dict[str, Any]]:
    with _conn() as c:
        row = c.execute("SELECT * FROM clients WHERE user_id=?", (user_id,)).fetchone()
    return dict(row) if row else None


def list_recent_clients(limit: int = 15) -> List[Dict[str, Any]]:
    with _conn() as c:
        rows = c.execute(
            """SELECT user_id, display_name, updated_at FROM clients
               ORDER BY updated_at DESC LIMIT ?""",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def set_admin_note(user_id: int, note: str):
    ensure_client(user_id)
    now = datetime.now().isoformat()
    with _conn() as c:
        c.execute(
            "UPDATE clients SET admin_note=?, updated_at=? WHERE user_id=?",
            (note, now, user_id),
        )


def add_manual_session(user_id: int):
    ensure_client(user_id)
    now = datetime.now().isoformat()
    with _conn() as c:
        c.execute(
            """UPDATE clients SET sessions_manual = sessions_manual + 1, updated_at=?
               WHERE user_id=?""",
            (now, user_id),
        )


def count_sessions_auto(user_id: int) -> int:
    today = date.today().isoformat()
    with _conn() as c:
        row = c.execute(
            """SELECT COUNT(*) FROM bookings
               WHERE user_id=? AND book_date<? AND status IN ('booked','confirmed')""",
            (user_id, today),
        ).fetchone()
    return int(row[0])


def total_sessions(user_id: int) -> int:
    client = get_client(user_id)
    manual = client["sessions_manual"] if client else 0
    return count_sessions_auto(user_id) + manual


def get_last_booking(user_id: int) -> Optional[Dict[str, Any]]:
    today = date.today().isoformat()
    with _conn() as c:
        row = c.execute(
            """SELECT * FROM bookings
               WHERE user_id=? AND book_date<? AND status IN ('booked','confirmed')
               ORDER BY book_date DESC, book_time DESC LIMIT 1""",
            (user_id, today),
        ).fetchone()
    return dict(row) if row else None


def get_next_booking(user_id: int) -> Optional[Dict[str, Any]]:
    today = date.today().isoformat()
    with _conn() as c:
        row = c.execute(
            """SELECT * FROM bookings
               WHERE user_id=? AND book_date>=? AND status IN ('booked','confirmed')
               ORDER BY book_date, book_time LIMIT 1""",
            (user_id, today),
        ).fetchone()
    return dict(row) if row else None


def list_templates(active_only: bool = True) -> List[Dict[str, Any]]:
    with _conn() as c:
        if active_only:
            rows = c.execute(
                """SELECT * FROM homework_templates WHERE is_active=1
                   ORDER BY sort_order, id"""
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT * FROM homework_templates ORDER BY sort_order, id"
            ).fetchall()
    return [dict(r) for r in rows]


def get_template(template_id: int) -> Optional[Dict[str, Any]]:
    with _conn() as c:
        row = c.execute(
            "SELECT * FROM homework_templates WHERE id=?", (template_id,)
        ).fetchone()
    return dict(row) if row else None


def get_latest_homework(user_id: int) -> Optional[Dict[str, Any]]:
    with _conn() as c:
        row = c.execute(
            """SELECT * FROM homework_sent WHERE user_id=?
               ORDER BY sent_at DESC LIMIT 1""",
            (user_id,),
        ).fetchone()
    if not row:
        return None
    hw = dict(row)
    hw["items"] = get_homework_items(hw["id"])
    return hw


def get_homework_items(homework_id: int) -> List[Dict[str, Any]]:
    with _conn() as c:
        rows = c.execute(
            """SELECT * FROM homework_sent_items WHERE homework_id=?
               ORDER BY sort_order, id""",
            (homework_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def list_homework_history(user_id: int, limit: int = 10) -> List[Dict[str, Any]]:
    with _conn() as c:
        rows = c.execute(
            """SELECT * FROM homework_sent WHERE user_id=?
               ORDER BY sent_at DESC LIMIT ?""",
            (user_id, limit),
        ).fetchall()
    result = []
    for r in rows:
        hw = dict(r)
        hw["items"] = get_homework_items(hw["id"])
        result.append(hw)
    return result


def list_user_homework(user_id: int, limit: int = 20) -> List[Dict[str, Any]]:
    return list_homework_history(user_id, limit)


def get_homework(homework_id: int, user_id: int | None = None) -> Optional[Dict[str, Any]]:
    with _conn() as c:
        if user_id is not None:
            row = c.execute(
                "SELECT * FROM homework_sent WHERE id=? AND user_id=?",
                (homework_id, user_id),
            ).fetchone()
        else:
            row = c.execute(
                "SELECT * FROM homework_sent WHERE id=?", (homework_id,)
            ).fetchone()
    if not row:
        return None
    hw = dict(row)
    hw["items"] = get_homework_items(hw["id"])
    return hw


def create_homework(
    user_id: int,
    sent_by: int,
    intro: str,
    items: List[Dict[str, Any]],
    booking_id: int | None = None,
) -> int:
    now = datetime.now().isoformat()
    with _conn() as c:
        cur = c.execute(
            """INSERT INTO homework_sent (user_id, booking_id, intro, sent_at, sent_by)
               VALUES (?, ?, ?, ?, ?)""",
            (user_id, booking_id, intro, now, sent_by),
        )
        hw_id = cur.lastrowid
        item_ids: List[int] = []
        for i, item in enumerate(items):
            cur = c.execute(
                """INSERT INTO homework_sent_items
                   (homework_id, template_id, sort_order, title, body)
                   VALUES (?, ?, ?, ?, ?)""",
                (
                    hw_id,
                    item.get("template_id"),
                    i,
                    item["title"],
                    item["body"],
                ),
            )
            item_ids.append(int(cur.lastrowid))
    # Привязка id пунктов для программ
    items_with_ids = []
    for i, item in enumerate(items):
        item = dict(item)
        item["id"] = item_ids[i]
        items_with_ids.append(item)
    with _conn() as c:
        for item in items_with_ids:
            ptype = hp.program_type_for_title(item["title"])
            if not ptype:
                continue
            start = date.today().isoformat()
            days = hp.program_days_total()
            c.execute(
                """INSERT INTO homework_programs
                   (user_id, homework_id, sent_item_id, program_type,
                    start_date, days_total, status, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, 'active', ?)""",
                (
                    user_id,
                    hw_id,
                    item["id"],
                    ptype,
                    start,
                    days,
                    now,
                ),
            )
    return hw_id


def get_program(program_id: int, user_id: int | None = None) -> Optional[Dict[str, Any]]:
    with _conn() as c:
        if user_id is not None:
            row = c.execute(
                "SELECT * FROM homework_programs WHERE id=? AND user_id=?",
                (program_id, user_id),
            ).fetchone()
        else:
            row = c.execute(
                "SELECT * FROM homework_programs WHERE id=?", (program_id,)
            ).fetchone()
    return dict(row) if row else None


def list_active_programs(user_id: int) -> List[Dict[str, Any]]:
    today = date.today().isoformat()
    with _conn() as c:
        rows = c.execute(
            """SELECT * FROM homework_programs
               WHERE user_id=? AND status='active'
               ORDER BY id DESC""",
            (user_id,),
        ).fetchall()
    out = []
    for r in rows:
        p = dict(r)
        if hp.is_program_day_active(p["start_date"]):
            p["day_index"] = hp.day_index_for_program(p["start_date"])
            out.append(p)
    return out


def list_programs_for_evening_reminder() -> List[Dict[str, Any]]:
    """Активные программы, которым сегодня нужно вечернее напоминание."""
    today_d = date.today()
    today = today_d.isoformat()
    result: List[Dict[str, Any]] = []
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM homework_programs WHERE status='active'"
        ).fetchall()
    for row in rows:
        p = dict(row)
        day_idx = hp.day_index_for_program(p["start_date"], today_d)
        if day_idx is None or day_idx > p["days_total"]:
            if day_idx is not None and day_idx > p["days_total"]:
                complete_program(p["id"])
            continue
        entry = get_program_entry(p["id"], day_idx)
        if entry and entry.get("submitted_at"):
            continue
        if entry and entry.get("reminded_at"):
            reminded = entry["reminded_at"][:10]
            if reminded == today:
                continue
        p["day_index"] = day_idx
        p["day_date"] = today
        result.append(p)
    return result


def get_program_entry(program_id: int, day_index: int) -> Optional[Dict[str, Any]]:
    with _conn() as c:
        row = c.execute(
            """SELECT * FROM homework_program_entries
               WHERE program_id=? AND day_index=?""",
            (program_id, day_index),
        ).fetchone()
    if not row:
        return None
    d = dict(row)
    try:
        d["payload"] = json.loads(d.get("payload") or "{}")
    except json.JSONDecodeError:
        d["payload"] = {}
    return d


def mark_program_reminded(program_id: int, day_index: int, day_date: str) -> None:
    now = datetime.now().isoformat()
    with _conn() as c:
        row = c.execute(
            "SELECT id FROM homework_program_entries WHERE program_id=? AND day_index=?",
            (program_id, day_index),
        ).fetchone()
        if row:
            c.execute(
                "UPDATE homework_program_entries SET reminded_at=? WHERE id=?",
                (now, row["id"]),
            )
        else:
            c.execute(
                """INSERT INTO homework_program_entries
                   (program_id, day_index, day_date, reminded_at, payload)
                   VALUES (?, ?, ?, ?, '{}')""",
                (program_id, day_index, day_date, now),
            )


def save_program_entry(
    program_id: int,
    day_index: int,
    day_date: str,
    payload: Dict[str, Any],
) -> None:
    now = datetime.now().isoformat()
    payload_s = json.dumps(payload, ensure_ascii=False)
    with _conn() as c:
        row = c.execute(
            "SELECT id FROM homework_program_entries WHERE program_id=? AND day_index=?",
            (program_id, day_index),
        ).fetchone()
        if row:
            c.execute(
                """UPDATE homework_program_entries
                   SET day_date=?, submitted_at=?, payload=?
                   WHERE id=?""",
                (day_date, now, payload_s, row["id"]),
            )
        else:
            c.execute(
                """INSERT INTO homework_program_entries
                   (program_id, day_index, day_date, submitted_at, payload)
                   VALUES (?, ?, ?, ?, ?)""",
                (program_id, day_index, day_date, now, payload_s),
            )
    prog = get_program(program_id)
    if prog and day_index >= prog["days_total"]:
        complete_program(program_id)


def complete_program(program_id: int) -> None:
    with _conn() as c:
        c.execute(
            "UPDATE homework_programs SET status='completed' WHERE id=?",
            (program_id,),
        )


def program_progress_line(program: Dict[str, Any]) -> str:
    with _conn() as c:
        n = c.execute(
            """SELECT COUNT(*) FROM homework_program_entries
               WHERE program_id=? AND submitted_at IS NOT NULL""",
            (program["id"],),
        ).fetchone()[0]
    total = program["days_total"]
    title = hp.TITLE_POSITIVE if program["program_type"] == hp.PROGRAM_POSITIVE_EMOTIONS else hp.TITLE_ANXIETY
    return f"📊 {title}: {int(n)}/{total} вечеров"


def mark_homework_read(homework_id: int, user_id: int) -> bool:
    now = datetime.now().isoformat()
    with _conn() as c:
        cur = c.execute(
            """UPDATE homework_sent SET read_at=?
               WHERE id=? AND user_id=? AND read_at IS NULL""",
            (now, homework_id, user_id),
        )
    return cur.rowcount > 0


def format_homework_message(intro: str, items: List[Dict[str, Any]], assistant_name: str) -> str:
    lines = [f"📝 *{assistant_name}*", "", intro.strip(), ""]
    for i, item in enumerate(items, 1):
        lines.append(f"*{i}️⃣ {item['title']}*")
        lines.append(item["body"].strip())
        lines.append("")
    lines.append("_Все задания — в «Домашнее задание» в меню бота._")
    return "\n".join(lines).strip()


def decline_program(
    user_id: int,
    program_id: int,
    title: str,
    reason: str = "",
    homework_id: int | None = None,
) -> None:
    now = datetime.now().isoformat()
    with _conn() as c:
        c.execute(
            "UPDATE homework_programs SET status='declined' WHERE id=? AND user_id=?",
            (program_id, user_id),
        )
        c.execute(
            """INSERT INTO homework_declines
               (user_id, program_id, homework_id, title, reason, declined_at, gcal_synced)
               VALUES (?, ?, ?, ?, ?, ?, 0)""",
            (user_id, program_id, homework_id, title, reason, now),
        )


def list_pending_gcal_declines(user_id: int) -> List[Dict[str, Any]]:
    with _conn() as c:
        rows = c.execute(
            """SELECT * FROM homework_declines
               WHERE user_id=? AND gcal_synced=0
               ORDER BY declined_at""",
            (user_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def mark_declines_gcal_synced(user_id: int) -> None:
    with _conn() as c:
        c.execute(
            "UPDATE homework_declines SET gcal_synced=1 WHERE user_id=? AND gcal_synced=0",
            (user_id,),
        )


def get_yesterday_positive_events(user_id: int) -> Optional[List[Dict[str, Any]]]:
    """5 приятных моментов за вчера (дневник эмоций)."""
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    with _conn() as c:
        rows = c.execute(
            """SELECT e.payload FROM homework_program_entries e
               JOIN homework_programs p ON p.id = e.program_id
               WHERE p.user_id=? AND p.program_type=?
                 AND e.day_date=? AND e.submitted_at IS NOT NULL
               ORDER BY e.submitted_at DESC LIMIT 1""",
            (user_id, hp.PROGRAM_POSITIVE_EMOTIONS, yesterday),
        ).fetchall()
    if not rows:
        return None
    try:
        payload = json.loads(rows[0][0] or "{}")
    except json.JSONDecodeError:
        return None
    events = payload.get("events") or []
    return events if events else None


def anxiety_entries_today(program_id: int, day_idx: int) -> List[Dict[str, Any]]:
    entry = get_program_entry(program_id, day_idx)
    if not entry:
        return []
    payload = entry.get("payload") or {}
    return list(payload.get("entries") or payload.get("thoughts") or [])


def append_anxiety_entry(
    program_id: int,
    day_idx: int,
    day_date: str,
    entry: Dict[str, Any],
) -> None:
    existing = get_program_entry(program_id, day_idx)
    entries: List[Dict[str, Any]] = []
    if existing:
        payload = existing.get("payload") or {}
        entries = list(payload.get("entries") or [])
    entries.append(entry)
    payload_s = json.dumps({"entries": entries}, ensure_ascii=False)
    with _conn() as c:
        if existing:
            c.execute(
                """UPDATE homework_program_entries
                   SET day_date=?, payload=?
                   WHERE program_id=? AND day_index=?""",
                (day_date, payload_s, program_id, day_idx),
            )
        else:
            c.execute(
                """INSERT INTO homework_program_entries
                   (program_id, day_index, day_date, payload)
                   VALUES (?, ?, ?, ?)""",
                (program_id, day_idx, day_date, payload_s),
            )


def list_static_homework_items(user_id: int) -> List[Dict[str, Any]]:
    """Пункты ДЗ без 6-дневной программы из последних отправок."""
    program_titles = {hp.TITLE_POSITIVE, hp.TITLE_ANXIETY}
    items_out: List[Dict[str, Any]] = []
    for hw in list_user_homework(user_id, limit=5):
        for item in hw.get("items") or []:
            title = (item.get("title") or "").strip()
            if title in program_titles or hp.program_type_for_title(title):
                continue
            items_out.append(
                {
                    "homework_id": hw["id"],
                    "item_id": item["id"],
                    "title": title,
                    "body": item.get("body") or "",
                    "sent_at": hw.get("sent_at"),
                    "read_at": hw.get("read_at"),
                }
            )
    return items_out
