"""Обработка админ-панели и календаря."""
from __future__ import annotations

import asyncio
import logging
from datetime import date, timedelta

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

import config
import db
import db_booking_cancel
import homework_db as hwdb
import homework_handlers as hw_handlers
import ui_text
import admin_calendar as ac
import booking_card
import google_calendar as gcal
import gcal_async
import admin_messages as amsg
from telegram_util import (
    safe_answer,
    safe_bot_edit_message_text,
    safe_edit_message_text,
)

logger = logging.getLogger(__name__)

NOTE_KEY = "adm_note_client"
BACK_KEY = "adm_nav_back"
FILTER_KEY = "admin_cal_filter"
ADMIN_VIEW_KEY = "admin_view"
DAY_ISO_KEY = "admin_day_iso"
MONTH_YM_KEY = "admin_month_ym"


def is_admin(user_id: int) -> bool:
    return user_id in config.ADMIN_USER_IDS


def _get_filter(context: ContextTypes.DEFAULT_TYPE) -> str:
    return context.user_data.get(FILTER_KEY, ac.FILTER_ALL)


def _set_filter(context: ContextTypes.DEFAULT_TYPE, flt: str):
    context.user_data[FILTER_KEY] = flt


def _set_back(context: ContextTypes.DEFAULT_TYPE, callback_data: str):
    context.user_data[BACK_KEY] = callback_data


def profile_back_button(context: ContextTypes.DEFAULT_TYPE) -> InlineKeyboardButton:
    back = context.user_data.get(BACK_KEY, "menu_admin")
    return ac.back_button(back)


def panel_reply_markup() -> InlineKeyboardMarkup:
    return ac.panel_keyboard()


ADMIN_PANEL_MSG_KEY = "admin_panel_msg_id"


async def send_admin_panel(
    target,
    context: ContextTypes.DEFAULT_TYPE | None = None,
    *,
    edit: bool = False,
):
    text = ac.panel_text()
    kb = ac.panel_keyboard()
    chat_id = getattr(target, "chat_id", None) or getattr(
        getattr(target, "chat", None), "id", None
    )
    if edit and hasattr(target, "edit_message_text"):
        await safe_edit_message_text(
            target, text, reply_markup=kb, parse_mode="Markdown"
        )
        if context is not None and hasattr(target, "message"):
            context.user_data[ADMIN_PANEL_MSG_KEY] = target.message.message_id
        return
    if context is not None and chat_id:
        mid = context.user_data.get(ADMIN_PANEL_MSG_KEY)
        if mid:
            try:
                await safe_bot_edit_message_text(
                    context.bot,
                    chat_id=chat_id,
                    message_id=mid,
                    text=text,
                    reply_markup=kb,
                    parse_mode="Markdown",
                )
                return
            except Exception:
                context.user_data.pop(ADMIN_PANEL_MSG_KEY, None)
    if hasattr(target, "reply_text"):
        msg = await target.reply_text(text, reply_markup=kb, parse_mode="Markdown")
    else:
        msg = await target.message.reply_text(
            text, reply_markup=kb, parse_mode="Markdown"
        )
    if context is not None and msg:
        context.user_data[ADMIN_PANEL_MSG_KEY] = msg.message_id


async def _show_settings(query, context: ContextTypes.DEFAULT_TYPE):
    context.user_data[ADMIN_VIEW_KEY] = "settings"
    await safe_edit_message_text(
        query,
        ac.settings_text(),
        reply_markup=ac.settings_keyboard(),
        parse_mode="Markdown",
    )


async def _show_calendar(query, context: ContextTypes.DEFAULT_TYPE):
    import tzutil

    context.user_data[ADMIN_VIEW_KEY] = "calendar"
    context.user_data.pop(DAY_ISO_KEY, None)
    flt = _get_filter(context)
    y, m = context.user_data.get(MONTH_YM_KEY) or (
        tzutil.admin_today().year,
        tzutil.admin_today().month,
    )
    await safe_edit_message_text(
        query,
        ac.calendar_month_text(y, m, flt),
        reply_markup=ac.build_admin_month_calendar(y, m, flt),
        parse_mode="Markdown",
    )


async def _apply_filter(query, context: ContextTypes.DEFAULT_TYPE, flt: str):
    _set_filter(context, flt)
    if context.user_data.get(ADMIN_VIEW_KEY) == "day":
        iso = context.user_data.get(DAY_ISO_KEY)
        if iso:
            await _show_day(query, iso, context)
            return
    await _show_calendar(query, context)


def is_admin_extra_callback(data: str) -> bool:
    if data in (
        "menu_admin",
        "admin_settings",
        "admin_gcal",
        "admin_gcal_sync",
    ):
        return True
    return ac.is_admin_calendar_callback(data) or data.startswith(
        ("adm_note_", "adm_cancel_", "adm_msg_")
    )


async def on_admin_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    query = update.callback_query
    data = query.data
    if not is_admin_extra_callback(data):
        return False

    uid = query.from_user.id
    if not is_admin(uid):
        await safe_answer(query, "Только для администратора", show_alert=True)
        return True

    if data == "admin_settings":
        await _show_settings(query, context)
        return True

    if data == "admin_gcal":
        kb_rows = []
        if gcal.is_enabled():
            kb_rows.append(
                [
                    InlineKeyboardButton(
                        "🔄 Синхронизировать записи",
                        callback_data="admin_gcal_sync",
                    )
                ]
            )
        kb_rows.append(
            [InlineKeyboardButton("◀️ Настройка", callback_data="admin_settings")]
        )
        await safe_edit_message_text(query,
            gcal.status_text(),
            reply_markup=InlineKeyboardMarkup(kb_rows),
            parse_mode="Markdown",
        )
        return True

    if data == "admin_gcal_sync":
        if not gcal.is_enabled():
            await query.answer("Google Calendar не настроен", show_alert=True)
            return True
        await safe_edit_message_text(query,"🔄 Синхронизация с Google Calendar…")
        gcal_back = InlineKeyboardMarkup([
            [InlineKeyboardButton("◀️ Настройка", callback_data="admin_settings")]
        ])
        try:
            ok, fail = await asyncio.wait_for(gcal_async.sync_upcoming(), timeout=30)
        except asyncio.TimeoutError:
            await safe_edit_message_text(query,
                "⚠️ Синхронизация заняла слишком много времени.\n"
                "Проверьте соединение с Google и попробуйте снова.",
                reply_markup=gcal_back,
            )
            return True
        except Exception as e:
            logger.warning("admin_gcal_sync failed: %s", e)
            await safe_edit_message_text(query,
                f"❌ Ошибка синхронизации: {e}",
                reply_markup=gcal_back,
            )
            return True
        await safe_edit_message_text(query,
            f"✅ Синхронизация завершена\n\n"
            f"Создано событий: *{ok}*\n"
            f"Ошибок: *{fail}*",
            reply_markup=gcal_back,
            parse_mode="Markdown",
        )
        return True

    if data.startswith("adm_msg_tpl_"):
        rest = data.replace("adm_msg_tpl_", "")
        key, _, cid_s = rest.rpartition("_")
        client_id = int(cid_s)
        text = amsg.render_template(key, client_id)
        if not text:
            await query.answer("Шаблон не найден", show_alert=True)
            return True
        try:
            await context.bot.send_message(client_id, text, parse_mode="Markdown")
            name = (hwdb.get_client(client_id) or {}).get("display_name") or str(client_id)
            await safe_edit_message_text(query,
                f"✅ Сообщение отправлено\n\n👤 {name}",
                reply_markup=InlineKeyboardMarkup([
                    [
                        InlineKeyboardButton(
                            "💬 Ещё сообщение",
                            callback_data=f"adm_msg_{client_id}",
                        )
                    ],
                    [
                        InlineKeyboardButton(
                            "◀️ Профиль",
                            callback_data=f"adm_profile_{client_id}",
                        )
                    ],
                    [InlineKeyboardButton("◀️ Панель", callback_data="menu_admin")],
                ]),
            )
        except Exception as e:
            logger.warning("adm_msg send %s: %s", client_id, e)
            await query.answer(f"Не удалось отправить: {e}", show_alert=True)
        return True

    if data.startswith("adm_msg_custom_"):
        client_id = int(data.replace("adm_msg_custom_", ""))
        context.user_data[amsg.MSG_CLIENT_KEY] = client_id
        await safe_edit_message_text(query,
            amsg.custom_prompt_text(client_id),
            reply_markup=amsg.custom_prompt_keyboard(client_id),
            parse_mode="Markdown",
        )
        return True

    if data.startswith("adm_msg_"):
        client_id = int(data.replace("adm_msg_", ""))
        hwdb.ensure_client(client_id)
        await safe_edit_message_text(query,
            amsg.message_menu_text(client_id),
            reply_markup=amsg.message_menu_keyboard(client_id),
            parse_mode="Markdown",
        )
        return True

    if data == "admin_materials":
        context.user_data[ADMIN_VIEW_KEY] = "materials"
        await safe_edit_message_text(query,
            ac.materials_text(),
            reply_markup=ac.materials_keyboard(),
            parse_mode="Markdown",
        )
        return True

    if data in (
        "admin_filter_all",
        "admin_filter_online",
        "admin_filter_in_person",
    ):
        flt_map = {
            "admin_filter_all": ac.FILTER_ALL,
            "admin_filter_online": ac.FILTER_ONLINE,
            "admin_filter_in_person": ac.FILTER_IN_PERSON,
        }
        await _apply_filter(query, context, flt_map[data])
        return True

    if data == "admin_month":
        import tzutil

        today = tzutil.admin_today()
        context.user_data[MONTH_YM_KEY] = (today.year, today.month)
        await _show_calendar(query, context)
        return True

    if data == "adm_cal_ignore":
        return True

    if data.startswith("adm_cal_prev_") or data.startswith("adm_cal_next_"):
        parts = data.split("_")
        y, m = int(parts[3]), int(parts[4])
        delta = -1 if "prev" in data else 1
        y, m = ac.shift_month(y, m, delta)
        if not ac.month_overlaps_schedule(y, m):
            await query.answer(ac.month_nav_blocked_alert(y, m), show_alert=True)
            return True
        context.user_data[MONTH_YM_KEY] = (y, m)
        await _show_calendar(query, context)
        return True

    if data.startswith("adm_cal_day_"):
        iso = data.replace("adm_cal_day_", "")
        _set_back(context, "admin_month")
        await _show_day(query, iso, context)
        return True

    if data.startswith("admin_day_prev_"):
        iso = data.replace("admin_day_prev_", "")
        d = date.fromisoformat(iso) - timedelta(days=1)
        await _show_day(query, d.isoformat(), context)
        return True

    if data.startswith("admin_day_next_"):
        iso = data.replace("admin_day_next_", "")
        d = date.fromisoformat(iso) + timedelta(days=1)
        await _show_day(query, d.isoformat(), context)
        return True

    if data.startswith("admin_day_"):
        iso = data.replace("admin_day_", "")
        if not context.user_data.get(BACK_KEY):
            _set_back(context, "admin_month")
        await _show_day(query, iso, context)
        return True

    if data.startswith("adm_add_slot_type_"):
        rest = data.replace("adm_add_slot_type_", "")
        if rest.startswith("online_"):
            visit_type = "online"
            slot_ref = rest[len("online_") :]
        elif rest.startswith("in_person_"):
            visit_type = "in_person"
            slot_ref = rest[len("in_person_") :]
        else:
            await query.answer("Неверный формат", show_alert=True)
            return True
        book_date, slot_time = ac._parse_slot_ref(slot_ref)
        ok, err = db.add_schedule_slot_for_date(book_date, slot_time, visit_type)
        if not ok:
            await query.answer(err, show_alert=True)
            return True
        mode = db.visit_type_label(visit_type)
        await query.answer(f"✅ {slot_time} ({mode})")
        await _show_day(query, book_date, context)
        return True

    if data.startswith("adm_add_slot_time_"):
        rest = data.replace("adm_add_slot_time_", "")
        book_date, slot_time = ac._parse_slot_ref(rest)
        await safe_edit_message_text(query,
            ac.add_slot_type_text(book_date, slot_time),
            reply_markup=ac.add_slot_type_keyboard(book_date, slot_time),
            parse_mode="Markdown",
        )
        return True

    if data.startswith("adm_add_slot_ask_"):
        iso = data.replace("adm_add_slot_ask_", "")
        if not db.uses_date_schedule():
            await query.answer(
                "Добавление по одному окну — только для расписания по датам. "
                "Загрузите Excel с датами.",
                show_alert=True,
            )
            return True
        if not db.is_date_bookable(iso):
            await query.answer("Дата вне периода записи", show_alert=True)
            return True
        times = db.list_addable_slot_times(iso)
        if not times:
            await query.answer("На этот день все часы уже открыты", show_alert=True)
            return True
        await safe_edit_message_text(query,
            ac.add_slot_ask_text(iso),
            reply_markup=ac.add_slot_times_keyboard(iso),
            parse_mode="Markdown",
        )
        return True

    if data.startswith("adm_slot_close_"):
        rest = data.replace("adm_slot_close_", "")
        book_date, slot_time = ac._parse_slot_ref(rest)
        if db.slot_taken(book_date, slot_time):
            await query.answer("Слот занят — закрыть нельзя", show_alert=True)
            return True
        if db.close_schedule_slot(book_date, slot_time):
            await query.answer("Окно закрыто")
        else:
            await query.answer("Уже закрыто", show_alert=True)
        await _show_day(query, book_date, context)
        return True

    if data.startswith("adm_slot_free_msg_"):
        rest = data.replace("adm_slot_free_msg_", "")
        book_date, slot_time = ac._parse_slot_ref(rest)
        _set_back(context, f"admin_day_{book_date}")
        await safe_edit_message_text(query,
            ac.free_slot_msg_text(book_date, slot_time),
            reply_markup=ac.free_slot_msg_keyboard(book_date, slot_time),
            parse_mode="Markdown",
        )
        return True

    if data.startswith("adm_slot_free_"):
        rest = data.replace("adm_slot_free_", "")
        book_date, slot_time = ac._parse_slot_ref(rest)
        await safe_edit_message_text(query,
            ac.free_slot_detail_text(book_date, slot_time),
            reply_markup=ac.free_slot_detail_keyboard(book_date, slot_time),
            parse_mode="Markdown",
        )
        return True

    if data.startswith("adm_slot_"):
        bid = int(data.replace("adm_slot_", ""))
        booking = db.get_booking_by_id(bid)
        if not booking:
            await query.answer("Запись не найдена", show_alert=True)
            return True
        iso = booking["book_date"]
        _set_back(context, f"admin_day_{iso}")
        context.user_data[f"hw_booking_{booking['user_id']}"] = bid
        context.user_data["adm_active_booking"] = bid
        hwdb.ensure_client(booking["user_id"], booking.get("user_name"))
        await hw_handlers.show_admin_client_profile(query, booking["user_id"], context)
        return True

    if data == "admin_today":
        _set_back(context, "admin_today")
        context.user_data[ADMIN_VIEW_KEY] = "today"
        import tzutil

        today = tzutil.admin_today().isoformat()
        bookings = db.get_bookings_on(today)
        await hw_handlers.enrich_today_bookings(bookings)
        text = ac.today_timeline_text(bookings)
        kb = ac.today_keyboard(bookings)
        await safe_edit_message_text(query,text, reply_markup=kb, parse_mode="Markdown")
        return True

    if data == "menu_admin":
        context.user_data.pop(BACK_KEY, None)
        context.user_data.pop(ADMIN_VIEW_KEY, None)
        context.user_data.pop(DAY_ISO_KEY, None)
        await send_admin_panel(query, context, edit=True)
        return True

    if data == "admin_recent":
        _set_back(context, "admin_recent")
        context.user_data[ADMIN_VIEW_KEY] = "clients"
        clients = hwdb.list_recent_clients(15)
        if not clients:
            text = "👥 *Клиенты*\n\nПока никого нет в базе."
            kb = InlineKeyboardMarkup(
                [[InlineKeyboardButton("◀️ Панель", callback_data="menu_admin")]]
            )
        else:
            lines = ["👥 *Клиенты*\n", "_Нажмите для профиля:_\n"]
            rows = []
            for c in clients:
                name = c.get("display_name") or f"id {c['user_id']}"
                lines.append(f"• {name}")
                rows.append(
                    [
                        InlineKeyboardButton(
                            f"👤 {name}",
                            callback_data=f"adm_profile_{c['user_id']}",
                        )
                    ]
                )
            text = "\n".join(lines)
            rows.append([InlineKeyboardButton("◀️ Панель", callback_data="menu_admin")])
            kb = InlineKeyboardMarkup(rows)
        await safe_edit_message_text(query,text, reply_markup=kb, parse_mode="Markdown")
        return True

    if data == "admin_excel_help":
        await safe_edit_message_text(query,
            "📤 *Загрузка Excel*\n\n"
            "Отправьте файл `.xlsx` *в этот чат* как документ "
            "(скрепка → файл, не сжимать в фото).\n\n"
            "Формат: строка с днями недели, столбец A — часы, "
            "ячейки: закрыто / открыто онлайн / открыто ментал хелп.\n\n"
            "_Активные записи клиентов сохраняются автоматически._",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("◀️ Настройка", callback_data="admin_settings")],
                [InlineKeyboardButton("◀️ Панель", callback_data="menu_admin")],
            ]),
            parse_mode="Markdown",
        )
        return True

    if data.startswith("adm_cancel_ask_"):
        bid = int(data.replace("adm_cancel_ask_", ""))
        booking = db.get_booking_by_id(bid)
        if not booking:
            await query.answer("Не найдено", show_alert=True)
            return True
        when = ui_text.format_booking_when(
            booking["book_date"], booking["book_time"], admin_view=True
        )
        mode = db.visit_type_label(booking.get("visit_type") or "in_person")
        name = booking.get("user_name") or booking["user_id"]
        await safe_edit_message_text(query,
            f"❌ *Отменить запись?*\n\n👤 {name}\n🗓 {when}\n{mode}",
            reply_markup=InlineKeyboardMarkup([
                [
                    InlineKeyboardButton(
                        "Да, отменить",
                        callback_data=f"adm_cancel_confirm_{bid}",
                    )
                ],
                [
                    InlineKeyboardButton(
                        "◀️ Профиль",
                        callback_data=f"adm_profile_{booking['user_id']}",
                    )
                ],
            ]),
            parse_mode="Markdown",
        )
        return True

    if data.startswith("adm_cancel_confirm_"):
        bid = int(data.replace("adm_cancel_confirm_", ""))
        booking = db.get_booking_by_id(bid)
        if not booking:
            await query.answer("Не найдено", show_alert=True)
            return True
        client_id = booking["user_id"]
        if db_booking_cancel.admin_cancel_booking(bid):
            gcal_async.on_booking_cancelled_bg(bid)
            when_admin = ui_text.format_booking_when(
                booking["book_date"], booking["book_time"], admin_view=True
            )
            when_client = ui_text.format_booking_when(
                booking["book_date"], booking["book_time"], client_id
            )
            mode = db.visit_type_label(booking.get("visit_type") or "in_person")
            try:
                await context.bot.send_message(
                    client_id,
                    f"❌ Ваша запись отменена администратором.\n\n🗓 {when_client} ({mode})",
                )
            except Exception as e:
                logger.warning("Клиент %s: %s", client_id, e)
            await booking_card.refresh_booking_card(context.bot, client_id)
            await safe_edit_message_text(query,
                f"✅ Запись отменена\n\n🗓 {when_admin}",
                reply_markup=InlineKeyboardMarkup([
                    [
                        InlineKeyboardButton(
                            "◀️ Профиль",
                            callback_data=f"adm_profile_{client_id}",
                        )
                    ],
                    [InlineKeyboardButton("◀️ Панель", callback_data="menu_admin")],
                ]),
                parse_mode="Markdown",
            )
        else:
            await query.answer("Не удалось отменить", show_alert=True)
        return True

    if data.startswith("adm_note_edit_"):
        client_id = int(data.replace("adm_note_edit_", ""))
        context.user_data[NOTE_KEY] = client_id
        client = hwdb.get_client(client_id) or {}
        name = client.get("display_name") or str(client_id)
        note = (client.get("admin_note") or "").strip()
        hint = f"\n\nТекущая заметка:\n_{note[:500]}_" if note else ""
        await safe_edit_message_text(query,
            f"✏️ *Заметка — {name}*\n\n"
            f"Отправьте *следующим сообщением* текст заметки.{hint}\n\n"
            "_Отправьте «-» чтобы очистить._",
            reply_markup=InlineKeyboardMarkup([
                [
                    InlineKeyboardButton(
                        "◀️ Отмена",
                        callback_data=f"adm_profile_{client_id}",
                    )
                ]
            ]),
            parse_mode="Markdown",
        )
        return True

    return False


async def _show_day(query, iso: str, context: ContextTypes.DEFAULT_TYPE):
    context.user_data[ADMIN_VIEW_KEY] = "day"
    context.user_data[DAY_ISO_KEY] = iso
    flt = _get_filter(context)
    await safe_edit_message_text(
        query,
        ac.day_view_text(iso, flt),
        reply_markup=ac.day_view_keyboard(iso, flt),
        parse_mode="Markdown",
    )


async def open_calendar_for_message(
    message, context: ContextTypes.DEFAULT_TYPE
) -> None:
    """Команда /schedule — календарь новым сообщением."""
    import tzutil

    today = tzutil.admin_today()
    context.user_data[MONTH_YM_KEY] = (today.year, today.month)
    context.user_data[ADMIN_VIEW_KEY] = "calendar"
    flt = _get_filter(context)
    await message.reply_text(
        ac.calendar_month_text(today.year, today.month, flt),
        reply_markup=ac.build_admin_month_calendar(today.year, today.month, flt),
        parse_mode="Markdown",
    )


async def on_admin_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    if not is_admin(update.effective_user.id):
        return False

    msg_client = context.user_data.pop(amsg.MSG_CLIENT_KEY, None)
    if msg_client is not None:
        text = (update.message.text or "").strip()
        if not text:
            await update.message.reply_text("Пустое сообщение не отправлено.")
            return True
        try:
            await context.bot.send_message(msg_client, text)
            name = (hwdb.get_client(msg_client) or {}).get("display_name") or str(msg_client)
            await update.message.reply_text(
                f"✅ Сообщение отправлено клиенту *{name}*.",
                reply_markup=InlineKeyboardMarkup([
                    [
                        InlineKeyboardButton(
                            "💬 Ещё",
                            callback_data=f"adm_msg_{msg_client}",
                        )
                    ],
                    [
                        InlineKeyboardButton(
                            "◀️ Профиль",
                            callback_data=f"adm_profile_{msg_client}",
                        )
                    ],
                    [InlineKeyboardButton("◀️ Панель", callback_data="menu_admin")],
                ]),
                parse_mode="Markdown",
            )
        except Exception as e:
            logger.warning("adm_msg custom %s: %s", msg_client, e)
            await update.message.reply_text(f"❌ Не удалось отправить: {e}")
        return True

    client_id = context.user_data.pop(NOTE_KEY, None)
    if client_id is None:
        return False
    text = (update.message.text or "").strip()
    if text == "-":
        text = ""
    hwdb.set_admin_note(client_id, text)
    name = (hwdb.get_client(client_id) or {}).get("display_name") or str(client_id)
    await update.message.reply_text(
        f"✅ Заметка сохранена для *{name}*.",
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("◀️ Профиль", callback_data=f"adm_profile_{client_id}")],
            [InlineKeyboardButton("◀️ Панель", callback_data="menu_admin")],
        ]),
        parse_mode="Markdown",
    )
    return True
