"""
Подключение к SQLite для botzap (запись на приём).

Важно: файл appointments.db и ключ BOTZAP_DB_ENCRYPTION_KEY относятся только к этому боту.
Бот дневника (cognitive-diary-bot) использует cognitive_diary.db и свой DB_ENCRYPTION_KEY —
общих файлов и ключей нет.
"""
from __future__ import annotations

import logging
import shutil
import sqlite3 as std_sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent / "appointments.db"
# Только каталог botzap — никогда не трогаем cognitive_diary.db и др.
_ALLOWED_DB_DIR = DB_PATH.parent.resolve()


def encryption_key() -> str:
    import os
    import config

    # Ключ бота дневника (cognitive-diary-bot) — другая переменная и другой файл БД
    if os.getenv("DB_ENCRYPTION_KEY", "").strip() and not os.getenv(
        "BOTZAP_DB_ENCRYPTION_KEY", ""
    ).strip():
        raise SystemExit(
            "В .env botzap указан DB_ENCRYPTION_KEY — это ключ бота дневника "
            "(cognitive_diary.db). Для записи на приём задайте отдельно "
            "BOTZAP_DB_ENCRYPTION_KEY (своё значение, не копируйте из другого бота)."
        )
    return config.BOTZAP_DB_ENCRYPTION_KEY


def _esc_key(key: str) -> str:
    return key.replace("'", "''")


def _sqlcipher():
    import sqlcipher3.dbapi2 as sqlite3  # type: ignore

    return sqlite3


def _assert_db_path_safe():
    if DB_PATH.resolve().parent != _ALLOWED_DB_DIR:
        raise RuntimeError(f"Недопустимый путь к БД: {DB_PATH}")


def _plain_readable(path: Path) -> bool:
    if not path.is_file():
        return False
    try:
        conn = std_sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        conn.execute("SELECT name FROM sqlite_master LIMIT 1")
        conn.close()
        return True
    except std_sqlite3.DatabaseError:
        return False


def _encrypted_readable(path: Path, key: str) -> bool:
    if not path.is_file():
        return False
    try:
        sqlite3 = _sqlcipher()
        conn = sqlite3.connect(str(path))
        conn.execute(f"PRAGMA key = '{_esc_key(key)}'")
        conn.execute("SELECT name FROM sqlite_master LIMIT 1")
        conn.close()
        return True
    except Exception:
        return False


def migrate_plain_to_encrypted(key: str) -> None:
    """Однократно: plain appointments.db → SQLCipher (резервная копия рядом)."""
    _assert_db_path_safe()
    if DB_PATH.name != "appointments.db":
        raise RuntimeError("Миграция только для appointments.db в каталоге botzap")
    if not _plain_readable(DB_PATH):
        return
    if _encrypted_readable(DB_PATH, key):
        return

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = DB_PATH.with_name(f"{DB_PATH.name}.plain-backup-{ts}")
    shutil.copy2(DB_PATH, backup)
    logger.info("Резервная копия открытой БД: %s", backup.name)

    sqlite3 = _sqlcipher()
    tmp = DB_PATH.with_suffix(".db.encrypting")
    if tmp.exists():
        tmp.unlink()

    plain = std_sqlite3.connect(str(DB_PATH))
    dump = "\n".join(plain.iterdump())
    plain.close()

    enc = sqlite3.connect(str(tmp))
    enc.execute(f"PRAGMA key = '{_esc_key(key)}'")
    enc.executescript(dump)
    enc.commit()
    enc.close()

    DB_PATH.unlink()
    tmp.rename(DB_PATH)
    try:
        DB_PATH.chmod(0o600)
    except OSError:
        pass
    logger.info("appointments.db переведена на SQLCipher (botzap)")


def ensure_encrypted_database() -> None:
    key = encryption_key()
    if not key:
        raise SystemExit(
            "Задайте BOTZAP_DB_ENCRYPTION_KEY в .env (отдельный ключ только для botzap, "
            "не от бота дневника)."
        )
    if len(key) < 16:
        raise SystemExit("BOTZAP_DB_ENCRYPTION_KEY слишком короткий (минимум 16 символов).")

    _assert_db_path_safe()

    if not DB_PATH.exists():
        return

    if _encrypted_readable(DB_PATH, key):
        return

    if _plain_readable(DB_PATH):
        migrate_plain_to_encrypted(key)
        return

    raise SystemExit(
        "appointments.db не читается: неверный BOTZAP_DB_ENCRYPTION_KEY или повреждённый файл."
    )


_conn_local = threading.local()


def connect() -> Any:
    """Соединение с зашифрованной БД botzap (одно на поток)."""
    key = encryption_key()
    if not key:
        raise RuntimeError("BOTZAP_DB_ENCRYPTION_KEY не задан")

    _assert_db_path_safe()
    conn = getattr(_conn_local, "conn", None)
    if conn is not None:
        return conn

    sqlite3 = _sqlcipher()
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute(f"PRAGMA key = '{_esc_key(key)}'")
    _conn_local.conn = conn
    return conn
