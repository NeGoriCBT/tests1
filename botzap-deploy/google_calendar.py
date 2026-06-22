"""Синхронизация записей бота → Google Calendar (односторонняя)."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

import config
import db

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/calendar.events"]


def is_configured() -> bool:
    return bool(
        config.GOOGLE_CLIENT_ID
        and config.GOOGLE_CLIENT_SECRET
        and config.GOOGLE_REFRESH_TOKEN
        and config.GOOGLE_CALENDAR_ID
    )


def is_enabled() -> bool:
    return config.GOOGLE_CALENDAR_ENABLED and is_configured()


def _tz() -> ZoneInfo:
    return ZoneInfo(config.ADMIN_TZ)


def _event_minutes() -> int:
    return int(getattr(config, "GOOGLE_EVENT_MINUTES", 60) or 60)


def _credentials():
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    creds = Credentials(
        token=None,
        refresh_token=config.GOOGLE_REFRESH_TOKEN,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=config.GOOGLE_CLIENT_ID,
        client_secret=config.GOOGLE_CLIENT_SECRET,
        scopes=SCOPES,
    )
    if not creds.valid and creds.refresh_token:
        creds.refresh(Request())
    return creds


def _service():
    import httplib2
    from google_auth_httplib2 import AuthorizedHttp
    from googleapiclient.discovery import build

    http = httplib2.Http(timeout=8)
    creds = _credentials()
    return build(
        "calendar",
        "v3",
        http=AuthorizedHttp(creds, http=http),
        cache_discovery=False,
    )


def _slot_bounds(book_date: str, book_time: str) -> tuple[datetime, datetime]:
    y, m, d = (int(x) for x in book_date.split("-"))
    hh, mm = (int(x) for x in book_time.split(":"))
    start = datetime(y, m, d, hh, mm, tzinfo=_tz())
    end = start + timedelta(minutes=_event_minutes())
    return start, end


def _gcal_datetime(dt: datetime) -> str:
    """Локальное время без offset — часовой пояс задаётся полем timeZone."""
    local = dt.astimezone(_tz())
    return local.strftime("%Y-%m-%dT%H:%M:%S")


def _phone_line(user_id: int) -> str:
    phone = db.get_user_phone(user_id)
    return phone or ""


def _declines_block(user_id: int) -> str:
    import homework_db as hwdb

    declines = hwdb.list_pending_gcal_declines(user_id)
    if not declines:
        return ""
    lines = ["", "⚠️ *Отказы от ДЗ:*"]
    for d in declines:
        reason = (d.get("reason") or "").strip()
        r = f" — {reason}" if reason else ""
        lines.append(f"• {d['title']}{r}")
    return "\n".join(lines)


def _event_body(booking: dict, *, confirmed: bool = False) -> dict:
    name = (booking.get("user_name") or f"id {booking['user_id']}").strip()
    mode = db.visit_type_label(booking.get("visit_type") or "in_person")
    prefix = "✅ " if confirmed else ""
    phone = _phone_line(booking["user_id"])
    start, end = _slot_bounds(booking["book_date"], booking["book_time"])
    bid = booking["id"]
    if phone:
        summary = f"{prefix}{phone} · {name} — {mode}"
    else:
        summary = f"{prefix}{name} — {mode}"
    desc_lines = [
        f"Запись в боте #{bid}",
        f"Telegram ID: {booking['user_id']}",
    ]
    if phone:
        desc_lines.append(f"Телефон: {phone}")
    desc_lines.append(f"Статус: {booking.get('status', 'booked')}")
    decline_text = _declines_block(booking["user_id"])
    if decline_text:
        desc_lines.append(decline_text)
    return {
        "summary": summary,
        "description": "\n".join(desc_lines),
        "start": {"dateTime": _gcal_datetime(start), "timeZone": config.ADMIN_TZ},
        "end": {"dateTime": _gcal_datetime(end), "timeZone": config.ADMIN_TZ},
    }


def create_for_booking(booking_id: int) -> bool:
    if not is_enabled():
        return False
    booking = db.get_booking_by_id(booking_id)
    if not booking or booking.get("status") not in ("booked", "confirmed"):
        return False
    if booking.get("google_event_id"):
        return update_for_booking(booking_id)

    try:
        service = _service()
        event = (
            service.events()
            .insert(
                calendarId=config.GOOGLE_CALENDAR_ID,
                body=_event_body(booking),
            )
            .execute()
        )
        db.set_google_event_id(booking_id, event["id"])
        import homework_db as hwdb
        hwdb.mark_declines_gcal_synced(booking["user_id"])
        logger.info("Google Calendar: создано событие %s для #%s", event["id"], booking_id)
        return True
    except Exception as e:
        logger.warning("Google Calendar create #%s: %s", booking_id, e)
        return False


def update_for_booking(booking_id: int) -> bool:
    if not is_enabled():
        return False
    booking = db.get_booking_by_id(booking_id)
    if not booking or not booking.get("google_event_id"):
        return create_for_booking(booking_id)
    if booking.get("status") not in ("booked", "confirmed"):
        return delete_for_booking(booking_id)

    confirmed = booking.get("status") == "confirmed"
    try:
        service = _service()
        service.events().patch(
            calendarId=config.GOOGLE_CALENDAR_ID,
            eventId=booking["google_event_id"],
            body=_event_body(booking, confirmed=confirmed),
        ).execute()
        import homework_db as hwdb
        hwdb.mark_declines_gcal_synced(booking["user_id"])
        return True
    except Exception as e:
        logger.warning("Google Calendar update #%s: %s", booking_id, e)
        return False


def delete_for_booking(booking_id: int) -> bool:
    if not is_configured():
        return False
    booking = db.get_booking_by_id(booking_id)
    if not booking:
        return False
    event_id = booking.get("google_event_id")
    if not event_id:
        return True

    try:
        if is_enabled():
            service = _service()
            service.events().delete(
                calendarId=config.GOOGLE_CALENDAR_ID,
                eventId=event_id,
            ).execute()
        db.clear_google_event_id(booking_id)
        logger.info("Google Calendar: удалено событие %s (#%s)", event_id, booking_id)
        return True
    except Exception as e:
        err = str(e).lower()
        if "404" in err or "not found" in err:
            db.clear_google_event_id(booking_id)
            return True
        logger.warning("Google Calendar delete #%s: %s", booking_id, e)
        return False


def sync_upcoming() -> tuple[int, int]:
    """Создать события для предстоящих записей без google_event_id."""
    if not is_enabled():
        return 0, 0
    today = datetime.now(_tz()).date().isoformat()
    bookings = db.get_upcoming_without_google(today)
    ok = fail = 0
    for b in bookings:
        if create_for_booking(b["id"]):
            ok += 1
        else:
            fail += 1
    return ok, fail


def status_text() -> str:
    if not is_configured():
        return (
            "📅 *Google Calendar*\n\n"
            "Не настроен. Нужны в `.env`:\n"
            "`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,\n"
            "`GOOGLE_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID`\n\n"
            "Один раз: `python scripts/google_calendar_auth.py` "
            "(файл `credentials.json` из Google Cloud)."
        )
    state = "включена" if is_enabled() else "выключена (`GOOGLE_CALENDAR_ENABLED=0`)"
    return (
        f"📅 *Google Calendar*\n\n"
        f"Синхронизация: *{state}*\n"
        f"Календарь: `{config.GOOGLE_CALENDAR_ID}`\n"
        f"Длительность слота: {_event_minutes()} мин\n"
        f"Часовой пояс: {config.TZ}\n\n"
        "Новые записи и отмены в боте → события в Google."
    )
