import logging
from datetime import date, datetime, timedelta

from telegram import InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application
from zoneinfo import ZoneInfo

import config
import db
import homework_db as hwdb
import homework_program_handlers as hph
import homework_programs as hp
import user_prefs as uprefs
from admin_week import booking_status_dot

logger = logging.getLogger(__name__)


def _user_now(user_id: int) -> datetime:
    tz_name = db.get_user_timezone(user_id) or config.ADMIN_TZ
    return datetime.now(ZoneInfo(tz_name))


async def morning_admin_digest(app: Application):
    """Утром админу: сколько записей сегодня и на какое время."""
    today = date.today().isoformat()
    bookings = db.get_bookings_on(today)
    if not bookings:
        text = f"📅 Сегодня ({today}) записей нет."
    else:
        lines = []
        for b in bookings:
            mode = db.visit_type_label(b.get("visit_type") or "in_person")
            dot = booking_status_dot(b)
            lines.append(
                f"• {dot} {b['book_time']} ({mode}) — {b.get('user_name') or b['user_id']}"
            )
        text = f"📅 Сегодня записей: {len(bookings)}\n\n" + "\n".join(lines)
    for admin_id in config.ADMIN_USER_IDS:
        try:
            await app.bot.send_message(admin_id, text)
        except Exception as e:
            logger.warning("Не отправлено админу %s: %s", admin_id, e)


async def morning_patient_reminders(app: Application):
    """Утром пациенту с записью на сегодня (не отключается)."""
    today = date.today().isoformat()
    from db_conn import connect as db_conn

    with db_conn() as c:
        rows = c.execute(
            """SELECT id, user_id, book_time, visit_type FROM bookings
               WHERE book_date=? AND status IN ('booked','confirmed')
               AND (morning_reminder_sent_date IS NULL OR morning_reminder_sent_date != ?)""",
            (today, today),
        ).fetchall()
    for row in rows:
        bid = row["id"]
        if not db.claim_morning_reminder_send(bid, today):
            continue
        uid, t = row["user_id"], row["book_time"]
        mode = db.visit_type_label(row["visit_type"] or "in_person")
        try:
            await app.bot.send_message(
                uid,
                f"🌅 Доброе утро! Сегодня запись ({mode}) в {t}.",
            )
        except Exception as e:
            logger.warning("Напоминание %s: %s", uid, e)


async def morning_homework_digest(app: Application):
    """Утренние уведомления по ДЗ (настраиваемые)."""
    from db_conn import connect as db_conn

    with db_conn() as c:
        user_ids = [
            r[0]
            for r in c.execute(
                """SELECT DISTINCT user_id FROM homework_programs
                   WHERE status='active'"""
            ).fetchall()
        ]
    for uid in user_ids:
        prefs = uprefs.get_prefs(uid)
        now = _user_now(uid)
        if not uprefs.in_notify_window(prefs, "morning", now):
            continue
        await _send_morning_hw(app, uid)
        uprefs.mark_hw_sent_today(uid, "morning")


async def _send_morning_hw(app: Application, uid: int):
    progs = hwdb.list_active_programs(uid)
    if not progs:
        return
    lines = ["🌅 *Доброе утро!*", "", "*Домашнее задание на сегодня:*", ""]
    for p in progs:
        title = (
            hp.TITLE_POSITIVE
            if p["program_type"] == hp.PROGRAM_POSITIVE_EMOTIONS
            else hp.TITLE_ANXIETY
        )
        day_idx = p.get("day_index") or hp.day_index_for_program(p["start_date"])
        lines.append(f"• *{title}* — день {day_idx}/{p['days_total']}")
        if p["program_type"] == hp.PROGRAM_POSITIVE_EMOTIONS:
            events = hwdb.get_yesterday_positive_events(uid)
            if events:
                lines.append("")
                lines.append("*Вчера вы записали:*")
                for i, ev in enumerate(events[:5], 1):
                    t = (ev.get("title") or "").strip()
                    d = (ev.get("description") or "").strip()
                    lines.append(f"{i}. {t} — {d}")
                lines.append("")
                lines.append(
                    "Сегодня вечером запишите 5 новых. "
                    "Можно начать раньше — в «Домашнее задание»."
                )
            else:
                lines.append(
                    "   _Вечером — 5 приятных моментов. "
                    "Откройте «Домашнее задание»._"
                )
        else:
            lines.append(
                "   _Наблюдайте тревожные мысли: ситуация → мысль → эмоция._"
            )
        lines.append("")
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("📝 Домашнее задание", callback_data="hw_my_list")],
        [InlineKeyboardButton("🏠 Главное меню", callback_data="menu_main")],
    ])
    try:
        await app.bot.send_message(
            uid, "\n".join(lines).strip(), reply_markup=kb, parse_mode="Markdown"
        )
    except Exception as e:
        logger.warning("Утреннее ДЗ %s: %s", uid, e)


async def evening_confirm_requests(app: Application):
    """В 18:00 накануне — уточнение, сможет ли пациент прийти завтра."""
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    bookings = db.get_bookings_tomorrow_for_confirm(tomorrow)
    for b in bookings:
        if not db.claim_evening_confirm_send(b["id"]):
            continue
        kb = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("✅ Да, приду", callback_data=f"confirm_yes_{b['id']}"),
                InlineKeyboardButton("❌ Не смогу", callback_data=f"confirm_no_{b['id']}"),
            ]
        ])
        try:
            await app.bot.send_message(
                b["user_id"],
                f"📋 Завтра ({tomorrow}) запись ({db.visit_type_label(b.get('visit_type') or 'in_person')}) "
                f"в {b['book_time']}.\n"
                "Подтвердите, пожалуйста, сможете ли вы прийти?",
                reply_markup=kb,
            )
        except Exception as e:
            logger.warning("Вечерний опрос %s: %s", b["user_id"], e)


async def evening_homework_program_reminders(app: Application):
    """Вечерние напоминания по ДЗ (с учётом окон пользователя)."""
    for prog in hwdb.list_programs_for_evening_reminder():
        uid = prog["user_id"]
        prefs = uprefs.get_prefs(uid)
        now = _user_now(uid)
        if not uprefs.in_notify_window(prefs, "evening", now):
            continue
        text = hph.format_evening_reminder(prog)
        kb = hph.reminder_keyboard(prog["id"])
        try:
            await app.bot.send_message(
                uid,
                text,
                reply_markup=kb,
                parse_mode="Markdown",
            )
            hwdb.mark_program_reminded(prog["id"], prog["day_index"], prog["day_date"])
        except Exception as e:
            logger.warning("Вечернее ДЗ %s prog %s: %s", uid, prog["id"], e)
    # Помечаем вечернее окно отправленным для пользователей, кому пришло
    sent_users = set()
    for prog in hwdb.list_programs_for_evening_reminder():
        uid = prog["user_id"]
        prefs = uprefs.get_prefs(uid)
        now = _user_now(uid)
        if uprefs.in_notify_window(prefs, "evening", now):
            sent_users.add(uid)
    for uid in sent_users:
        uprefs.mark_hw_sent_today(uid, "evening")
