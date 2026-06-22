"""Отмена записей клиентом."""
from __future__ import annotations

from typing import List

import db


def cancel_booking(booking_id: int, user_id: int) -> bool:
    with db._conn() as c:
        cur = c.execute(
            """UPDATE bookings SET status='cancelled', evening_confirmed=0
               WHERE id=? AND user_id=? AND status IN ('booked','confirmed')""",
            (booking_id, user_id),
        )
    return cur.rowcount > 0


def admin_cancel_booking(booking_id: int) -> bool:
    with db._conn() as c:
        cur = c.execute(
            """UPDATE bookings SET status='cancelled', evening_confirmed=0
               WHERE id=? AND status IN ('booked','confirmed')""",
            (booking_id,),
        )
    return cur.rowcount > 0


def cancel_all_bookings(user_id: int, from_date: str) -> int:
    with db._conn() as c:
        cur = c.execute(
            """UPDATE bookings SET status='cancelled', evening_confirmed=0
               WHERE user_id=? AND book_date>=? AND status IN ('booked','confirmed')""",
            (user_id, from_date),
        )
    return cur.rowcount
