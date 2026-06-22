#!/usr/bin/env python3
"""Полное обнуление данных botzap и повторная инициализация шаблонов."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import db
import homework_db as hwdb
import literature_db as litdb
from schedule_excel import import_schedule_from_xlsx


def main() -> None:
    db.init_db()
    db.wipe_all_data()
    hwdb.init_homework_tables()
    litdb.init_literature_tables()
    print("OK: all user data wiped, templates re-seeded")

    if len(sys.argv) > 1:
        xlsx = Path(sys.argv[1])
        if not xlsx.is_file():
            raise SystemExit(f"Schedule file not found: {xlsx}")
        imported = import_schedule_from_xlsx(str(xlsx))
        if imported["mode"] == "date":
            db.save_schedule_by_date(
                imported["slots"],
                open_from=imported["open_from"],
                close_from=imported["close_from"],
            )
        else:
            db.save_schedule(
                imported["slots"],
                close_from=imported["close_from"],
            )
        n = sum(1 for s in imported["slots"] if s.get("is_open"))
        print(
            f"OK: schedule imported — {n} open slots, "
            f"{imported.get('open_from')} .. {imported.get('close_from')}"
        )


if __name__ == "__main__":
    main()
