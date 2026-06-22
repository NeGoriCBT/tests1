"""Каталог рекомендуемой литературы и история отправок."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from db_conn import DB_PATH, connect as _conn

LITERATURE_DIR = Path(__file__).parent / "literature"

SEED_BOOKS: List[Dict[str, str]] = [
    {
        "title": "Как мозг сводит нас с ума",
        "subtitle": "Проблемы психосоматики",
        "authors": "Лиза Удилова, Вадим Матюшин, Регина Габидуллина",
        "image_file": "liza_udilova_vadim_matyushin_regina_gabidullina_kak_mozg_svodit_nas_s_uma.jpg",
    },
    {
        "title": "Свобода от тревоги",
        "subtitle": "Справься с тревогой, пока она не расправилась с тобой",
        "authors": "Роберт Лихи",
        "image_file": "robert_lihi_svoboda_ot_trevogi.jpg",
    },
    {
        "title": "Ловушка счастья",
        "subtitle": "Перестаём переживать — начинаем жить",
        "authors": "Расс Хэррис",
        "image_file": "rass_harris_lovushka_schastya.jpg",
    },
]


def init_literature_tables():
    LITERATURE_DIR.mkdir(parents=True, exist_ok=True)
    with _conn() as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS literature_catalog (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                subtitle TEXT NOT NULL DEFAULT '',
                authors TEXT NOT NULL,
                image_file TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS literature_sent (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                catalog_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                subtitle TEXT NOT NULL DEFAULT '',
                authors TEXT NOT NULL,
                image_file TEXT NOT NULL,
                sent_at TEXT NOT NULL,
                read_at TEXT,
                sent_by INTEGER NOT NULL,
                FOREIGN KEY (catalog_id) REFERENCES literature_catalog(id)
            );
            """
        )
    seed_catalog_if_empty()


def seed_catalog_if_empty():
    with _conn() as c:
        n = c.execute("SELECT COUNT(*) FROM literature_catalog").fetchone()[0]
        if n > 0:
            return
        now = datetime.now().isoformat()
        for i, book in enumerate(SEED_BOOKS):
            c.execute(
                """INSERT INTO literature_catalog
                   (title, subtitle, authors, image_file, is_active, sort_order, created_at)
                   VALUES (?, ?, ?, ?, 1, ?, ?)""",
                (
                    book["title"],
                    book.get("subtitle", ""),
                    book["authors"],
                    book["image_file"],
                    i,
                    now,
                ),
            )


def image_path(image_file: str) -> Path:
    return LITERATURE_DIR / image_file


def list_catalog(active_only: bool = True) -> List[Dict[str, Any]]:
    with _conn() as c:
        if active_only:
            rows = c.execute(
                """SELECT * FROM literature_catalog WHERE is_active=1
                   ORDER BY sort_order, id"""
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT * FROM literature_catalog ORDER BY sort_order, id"
            ).fetchall()
    return [dict(r) for r in rows]


def get_book(book_id: int) -> Optional[Dict[str, Any]]:
    with _conn() as c:
        row = c.execute(
            "SELECT * FROM literature_catalog WHERE id=?", (book_id,)
        ).fetchone()
    return dict(row) if row else None


def format_book_caption(book: Dict[str, Any], header: str = "📚 *Рекомендуемая литература*") -> str:
    lines = [header, ""]
    title = book["title"]
    if book.get("subtitle"):
        lines.append(f"*{title}*")
        lines.append(f"_{book['subtitle']}_")
    else:
        lines.append(f"*{title}*")
    lines.append("")
    lines.append(f"Автор(ы): {book['authors']}")
    return "\n".join(lines)


def create_sent(
    user_id: int,
    sent_by: int,
    book: Dict[str, Any],
) -> int:
    now = datetime.now().isoformat()
    with _conn() as c:
        cur = c.execute(
            """INSERT INTO literature_sent
               (user_id, catalog_id, title, subtitle, authors, image_file, sent_at, sent_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                user_id,
                book["id"],
                book["title"],
                book.get("subtitle") or "",
                book["authors"],
                book["image_file"],
                now,
                sent_by,
            ),
        )
        return cur.lastrowid


def list_user_literature(user_id: int, limit: int = 20) -> List[Dict[str, Any]]:
    with _conn() as c:
        rows = c.execute(
            """SELECT * FROM literature_sent WHERE user_id=?
               ORDER BY sent_at DESC LIMIT ?""",
            (user_id, limit),
        ).fetchall()
    return [dict(r) for r in rows]


def get_sent(sent_id: int, user_id: int | None = None) -> Optional[Dict[str, Any]]:
    with _conn() as c:
        if user_id is not None:
            row = c.execute(
                "SELECT * FROM literature_sent WHERE id=? AND user_id=?",
                (sent_id, user_id),
            ).fetchone()
        else:
            row = c.execute(
                "SELECT * FROM literature_sent WHERE id=?", (sent_id,)
            ).fetchone()
    return dict(row) if row else None


def mark_read(sent_id: int, user_id: int) -> bool:
    now = datetime.now().isoformat()
    with _conn() as c:
        cur = c.execute(
            """UPDATE literature_sent SET read_at=?
               WHERE id=? AND user_id=? AND read_at IS NULL""",
            (now, sent_id, user_id),
        )
    return cur.rowcount > 0
