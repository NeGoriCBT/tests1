"""Асинхронные обёртки для синхронизации календаря (не блокируют Telegram)."""
from __future__ import annotations

import asyncio
import logging

import google_calendar as gcal

logger = logging.getLogger(__name__)

_GCAL_SEM = asyncio.Semaphore(1)
_GCAL_OP_TIMEOUT = 10.0
_GCAL_SYNC_TIMEOUT = 25.0


async def _run_gcal(fn, *args, timeout: float = _GCAL_OP_TIMEOUT):
    async with _GCAL_SEM:
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(fn, *args),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            logger.warning("gcal timeout %s(%s)", getattr(fn, "__name__", fn), args)
            return None
        except Exception as e:
            logger.warning("gcal %s: %s", getattr(fn, "__name__", fn), e)
            return None


def spawn(coro) -> asyncio.Task:
    return asyncio.create_task(coro)


async def on_booking_created(booking_id: int) -> None:
    if not gcal.is_enabled():
        return
    await _run_gcal(gcal.create_for_booking, booking_id)


async def on_booking_cancelled(booking_id: int) -> None:
    if not gcal.is_configured():
        return
    await _run_gcal(gcal.delete_for_booking, booking_id)


async def on_booking_updated(booking_id: int) -> None:
    if not gcal.is_enabled():
        return
    await _run_gcal(gcal.update_for_booking, booking_id)


def on_booking_created_bg(booking_id: int) -> None:
    spawn(on_booking_created(booking_id))


def on_booking_cancelled_bg(booking_id: int) -> None:
    spawn(on_booking_cancelled(booking_id))


def on_booking_updated_bg(booking_id: int) -> None:
    spawn(on_booking_updated(booking_id))


async def sync_upcoming() -> tuple[int, int]:
    if not gcal.is_enabled():
        return 0, 0
    result = await _run_gcal(gcal.sync_upcoming, timeout=_GCAL_SYNC_TIMEOUT)
    return result if result is not None else (0, 0)


async def refresh_user_bookings(user_id: int) -> None:
    if not gcal.is_enabled():
        return
    from datetime import date

    import tzutil

    today = tzutil.admin_today().isoformat()
    import db

    for b in db.get_user_upcoming_bookings(user_id, today):
        await on_booking_updated(b["id"])


def refresh_user_bookings_bg(user_id: int) -> None:
    spawn(refresh_user_bookings(user_id))
