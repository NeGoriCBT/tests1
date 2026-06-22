import asyncio
import logging
import tempfile
from datetime import date, timedelta

from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
)
from telegram.ext import ContextTypes

import config
import db
import slots
import ui_text
from admin_week import booking_status_dot, FREE, BUSY, CONFIRMED
import admin_handlers as adm
from calendar_kb import build_calendar, shift_month, time_slots_keyboard
from schedule_excel import parse_schedule_xlsx, import_schedule_from_xlsx
import homework_handlers as hw_handlers
import homework_db as hwdb
import literature_handlers as lit_handlers
import booking_card
import db_booking_cancel
import gcal_async
import phone_util
import tzutil
import client_settings as csettings
import bot_ui
from telegram_util import safe_answer, safe_edit_message_text

logger = logging.getLogger(__name__)

AWAIT_PHONE_BID = "await_phone_bid"
AWAIT_PHONE_TEXT = "await_phone_text"
AWAIT_REG_PHONE = "await_reg_phone"

VISIT_ONLINE = "online"
VISIT_IN_PERSON = "in_person"


def is_admin(user_id: int) -> bool:
    return user_id in config.ADMIN_USER_IDS


def _clear_booking_state(context: ContextTypes.DEFAULT_TYPE):
    context.user_data.pop("book_date", None)
    context.user_data.pop("visit_type", None)


def _main_menu_text(uid: int) -> str:
    lines = [
        "🏠 *Главное меню*",
        "",
        "• *Записаться* — выбрать дату и время",
        "• *Мои записи* — ближайший визит",
        "• *Домашнее задание* — задания от Помощника",
        "• *Настройки* — часовой пояс, уведомления, телефон",
        "",
        ui_text.schedule_availability_lines(),
    ]
    if is_admin(uid):
        lines.append("")
        lines.append("Ниже — кнопка *Админ-панель* для управления расписанием и клиентами.")
    return "\n".join(lines)


def _main_keyboard(uid: int | None = None) -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton("📅 Записаться", callback_data="book_start")],
        [InlineKeyboardButton("📋 Мои записи", callback_data="my_bookings")],
        [InlineKeyboardButton("📝 Домашнее задание", callback_data="hw_my_list")],
        [InlineKeyboardButton("⚙️ Настройки", callback_data="menu_settings")],
    ]
    if uid is not None and is_admin(uid):
        rows.append(
            [InlineKeyboardButton("🛠 Админ-панель", callback_data="menu_admin")]
        )
    return InlineKeyboardMarkup(rows)


def _phone_ask_inline(bid: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("📱 Отправить контакт", callback_data=f"phone_share_{bid}")],
        [InlineKeyboardButton("✏️ Написать номер", callback_data=f"phone_type_{bid}")],
        [InlineKeyboardButton("Пропустить", callback_data=f"phone_skip_{bid}")],
    ])


def _reg_phone_keyboard() -> InlineKeyboardMarkup:
    return _phone_ask_inline(0)


def _phone_contact_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [[KeyboardButton("📱 Отправить мой номер", request_contact=True)]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def _active_booking_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("📋 Мои записи", callback_data="my_bookings")],
        [InlineKeyboardButton("🏠 В меню", callback_data="menu_main")],
    ])


def _user_tz(uid: int) -> str:
    if is_admin(uid):
        return config.ADMIN_TZ
    return db.get_user_timezone(uid) or tzutil.DEFAULT_USER_TZ


async def _ensure_user_timezone(query, uid: int) -> bool:
    if is_admin(uid) or db.has_user_timezone(uid):
        return True
    await safe_edit_message_text(query,
        "🕐 *Регистрация · шаг 1 из 2*\n\n"
        "Укажите ваш *часовой пояс* — это обязательно, "
        "чтобы показывать свободное время в вашем городе.\n\n"
        "Расписание кабинета ведётся по времени *Уфы*.",
        reply_markup=tzutil.timezone_picker_keyboard(),
        parse_mode="Markdown",
    )
    return False


async def _ensure_registration_complete(
    query, uid: int, context: ContextTypes.DEFAULT_TYPE
) -> bool:
    if is_admin(uid) or db.is_registration_complete(uid):
        return True
    if not db.has_user_timezone(uid):
        return not await _ensure_user_timezone(query, uid)
    await _send_registration_phone_step(query, uid, context, edit=True)
    return False


async def _send_registration_phone_step(
    target,
    uid: int,
    context: ContextTypes.DEFAULT_TYPE,
    *,
    edit: bool = False,
):
    context.user_data[AWAIT_REG_PHONE] = True
    text = (
        "🕐 *Регистрация · шаг 2 из 2*\n\n"
        + ui_text.registration_phone_prompt()
    )
    kb = _reg_phone_keyboard()
    if edit and hasattr(target, "edit_message_text"):
        await safe_edit_message_text(target,text, reply_markup=kb, parse_mode="Markdown")
    elif hasattr(target, "reply_text"):
        await target.reply_text(text, reply_markup=kb, parse_mode="Markdown")
    else:
        await context.bot.send_message(
            target, text, reply_markup=kb, parse_mode="Markdown"
        )


async def _send_welcome_after_registration(
    target,
    uid: int,
    first_name: str | None,
    *,
    edit: bool = False,
):
    text = ui_text.welcome_text(first_name, is_admin(uid))
    kb = _main_keyboard(uid)
    if edit and hasattr(target, "edit_message_text"):
        await safe_edit_message_text(target,text, reply_markup=kb, parse_mode="Markdown")
    elif hasattr(target, "reply_text"):
        await target.reply_text(text, reply_markup=kb, parse_mode="Markdown")
    else:
        await target.message.reply_text(text, reply_markup=kb, parse_mode="Markdown")


async def _reject_if_has_active_booking(query, uid: int) -> bool:
    """True — запись уже есть, новую оформить нельзя."""
    if is_admin(uid):
        return False
    active = db.get_user_active_booking(uid, tzutil.admin_today().isoformat())
    if not active:
        return False
    await safe_edit_message_text(query,
        ui_text.already_has_booking_text(active, uid),
        reply_markup=_active_booking_keyboard(),
        parse_mode="Markdown",
    )
    return True


async def _send_booking_confirmation(
    query,
    context: ContextTypes.DEFAULT_TYPE,
    visit_type: str,
    book_date: str,
    book_time: str,
    bid: int,
):
    uid = query.from_user.id
    text = ui_text.booking_confirmed_text(
        visit_type, book_date, book_time, bid, uid
    )
    kb = _main_keyboard(uid)
    if visit_type == VISIT_IN_PERSON and ui_text.has_in_person_route_image():
        await safe_edit_message_text(query,"✅ *Запись оформлена*", parse_mode="Markdown")
        with open(ui_text.IN_PERSON_ROUTE_IMAGE, "rb") as photo:
            await context.bot.send_photo(
                chat_id=query.message.chat_id,
                photo=photo,
                caption=text,
                parse_mode="Markdown",
                reply_markup=kb,
            )
    else:
        await safe_edit_message_text(query,
            text, reply_markup=kb, parse_mode="Markdown"
        )



async def _save_user_phone(
    context: ContextTypes.DEFAULT_TYPE, uid: int, phone: str, bid: int | None
):
    db.set_user_phone(uid, phone)
    hwdb.ensure_client(uid)
    was_reg = context.user_data.pop(AWAIT_REG_PHONE, False)
    context.user_data.pop(AWAIT_PHONE_BID, None)
    context.user_data.pop(AWAIT_PHONE_TEXT, None)
    if bid:
        gcal_async.on_booking_updated_bg(bid)
    else:
        gcal_async.refresh_user_bookings_bg(uid)
    await context.bot.send_message(
        uid,
        f"✅ Номер сохранён: `{phone}`",
        reply_markup=ReplyKeyboardRemove(),
        parse_mode="Markdown",
    )
    if was_reg:
        first_name = context.user_data.pop("reg_first_name", None)
        await context.bot.send_message(
            uid,
            ui_text.welcome_text(first_name, is_admin(uid)),
            reply_markup=_main_keyboard(uid),
            parse_mode="Markdown",
        )
        return


def _mode_keyboard() -> InlineKeyboardMarkup:
    rows = []
    if db.has_schedule_for_type(VISIT_IN_PERSON):
        rows.append([InlineKeyboardButton("🏥 Очно", callback_data="book_mode_in_person")])
    if db.has_schedule_for_type(VISIT_ONLINE):
        rows.append([InlineKeyboardButton("💻 Онлайн", callback_data="book_mode_online")])
    rows.append([InlineKeyboardButton("🔙 Назад", callback_data="menu_main")])
    return InlineKeyboardMarkup(rows)


def _mode_title(visit_type: str) -> str:
    return "💻 Онлайн" if visit_type == VISIT_ONLINE else "🏥 Очно"


def _day_available_fn(context: ContextTypes.DEFAULT_TYPE, uid: int):
    visit_type = context.user_data.get("visit_type")
    if not visit_type:
        return None

    def _ok(d: date) -> bool:
        return slots.day_has_self_book_slots(d, visit_type)

    return _ok


def _calendar_markup(
    context: ContextTypes.DEFAULT_TYPE, year: int, month: int, uid: int
):
    utz = _user_tz(uid)
    return build_calendar(
        year,
        month,
        day_available=_day_available_fn(context, uid),
        today=tzutil.user_today(utz),
    )


def _nav_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🏠 В меню", callback_data="menu_main")],
    ])


async def _send_menu(target, uid: int, *, edit: bool = False):
    text = _main_menu_text(uid)
    kb = _main_keyboard(uid)
    if edit and hasattr(target, "edit_message_text"):
        await bot_ui.edit_or_send(target, text, reply_markup=kb)
    else:
        await target.reply_text(text, reply_markup=kb, parse_mode="Markdown")


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    first_name = update.effective_user.first_name
    if not is_admin(uid) and not db.has_user_timezone(uid):
        await update.message.reply_text(
            "👋 *Добро пожаловать!*\n\n"
            "🕐 *Регистрация · шаг 1 из 2*\n\n"
            "Укажите ваш *часовой пояс* — это обязательно, "
            "чтобы показывать свободное время в вашем городе.\n\n"
            "Расписание кабинета ведётся по времени *Уфы*.",
            reply_markup=tzutil.timezone_picker_keyboard(),
            parse_mode="Markdown",
        )
        return
    if not is_admin(uid) and db.should_ask_registration_phone(uid):
        context.user_data["reg_first_name"] = first_name
        await _send_registration_phone_step(
            update.message, uid, context, edit=False
        )
        return
    text = ui_text.welcome_text(first_name, is_admin(uid))
    await update.message.reply_text(
        text, reply_markup=_main_keyboard(update.effective_user.id), parse_mode="Markdown"
    )


async def cmd_menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    _clear_booking_state(context)
    await _send_menu(update.message, update.effective_user.id)


async def cmd_admin(update: Update, context: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    if not is_admin(uid):
        await update.message.reply_text("Команда только для администратора.")
        return
    await adm.send_admin_panel(update.message, context)


def _bookings_manage_keyboard(bookings: list) -> InlineKeyboardMarkup:
    rows = []
    for b in bookings:
        when = ui_text.format_booking_when(
            b["book_date"], b["book_time"], b["user_id"]
        )
        rows.append(
            [
                InlineKeyboardButton(
                    f"❌ Отменить: {when}",
                    callback_data=f"cancel_ask_{b['id']}",
                )
            ]
        )
    if len(bookings) > 1:
        rows.append(
            [InlineKeyboardButton("❌ Отменить все записи", callback_data="cancel_all_ask")]
        )
    rows.append([InlineKeyboardButton("📅 Записаться", callback_data="book_start")])
    rows.append([InlineKeyboardButton("🏠 В меню", callback_data="menu_main")])
    return InlineKeyboardMarkup(rows)


async def _show_my_bookings(query, uid: int):
    today = tzutil.admin_today().isoformat()
    booking = db.get_user_active_booking(uid, today)
    if not booking:
        text = (
            "📋 *Мои записи*\n\n"
            "У вас нет предстоящей записи."
        )
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton("📅 Записаться", callback_data="book_start")],
            [InlineKeyboardButton("🏠 Главное меню", callback_data="menu_main")],
        ])
        await safe_edit_message_text(query, text, reply_markup=kb, parse_mode="Markdown")
        return

    visit_type = booking.get("visit_type") or VISIT_IN_PERSON
    text = ui_text.my_booking_detail_text(booking, uid)
    kb = InlineKeyboardMarkup([
        [
            InlineKeyboardButton(
                "❌ Отменить запись",
                callback_data=f"cancel_ask_{booking['id']}",
            )
        ],
        [InlineKeyboardButton("🏠 Главное меню", callback_data="menu_main")],
    ])

    if visit_type == VISIT_IN_PERSON and ui_text.has_in_person_route_image():
        bot = query.get_bot()
        chat_id = query.message.chat_id
        try:
            await query.message.delete()
        except Exception:
            pass
        with open(ui_text.IN_PERSON_ROUTE_IMAGE, "rb") as photo:
            await bot.send_photo(
                chat_id=chat_id,
                photo=photo,
                caption=text,
                parse_mode="Markdown",
                reply_markup=kb,
            )
        return

    await safe_edit_message_text(query, text, reply_markup=kb, parse_mode="Markdown")


async def _show_calendar(
    query, context: ContextTypes.DEFAULT_TYPE, uid: int
):
    visit_type = context.user_data.get("visit_type")
    if not visit_type:
        await safe_edit_message_text(query,
            ui_text.step_header(1, 3, "Запись на приём", ui_text.mode_choice_hint()),
            reply_markup=_mode_keyboard(),
            parse_mode="Markdown",
        )
        return
    utz = _user_tz(uid)
    today = tzutil.user_today(utz)
    hint = (
        f"Формат: *{_mode_title(visit_type)}*\n"
        "Активные дни — цифры, • — сегодня.\n"
        + ui_text.booking_time_rules_hint()
    )
    if utz != config.ADMIN_TZ:
        hint += f"\n_Свободное время — в вашем поясе ({tzutil.tz_label(utz)})._"
    await safe_edit_message_text(query,
        ui_text.step_header(2, 3, "Выбор даты", hint),
        reply_markup=_calendar_markup(context, today.year, today.month, uid),
        parse_mode="Markdown",
    )


async def on_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    data = query.data
    uid = query.from_user.id

    if hw_handlers.is_homework_callback(data):
        await hw_handlers.on_homework_callback(update, context)
        return

    if csettings.is_settings_callback(data) or data == "menu_settings":
        await csettings.on_settings_callback(update, context)
        return

    if lit_handlers.is_literature_callback(data):
        await lit_handlers.on_literature_callback(update, context)
        return

    # Сразу снять «часики» (в т.ч. админка — иначе просроченный callback рвёт обработчик).
    await safe_answer(query)

    if await adm.on_admin_callback(update, context):
        return

    if data == "menu_main":
        _clear_booking_state(context)
        context.user_data.pop(AWAIT_PHONE_BID, None)
        context.user_data.pop(AWAIT_PHONE_TEXT, None)
        await _send_menu(query, uid, edit=True)
        return

    if data == "client_phone":
        phone = db.get_user_phone(uid)
        if phone:
            text = f"📱 *Ваш телефон:* `{phone}`\n\nМожно обновить или удалить."
            kb = InlineKeyboardMarkup([
                [InlineKeyboardButton("✏️ Изменить", callback_data="phone_change")],
                [InlineKeyboardButton("🗑 Удалить", callback_data="phone_remove")],
                [InlineKeyboardButton("🏠 В меню", callback_data="menu_main")],
            ])
        else:
            text = (
                "📱 *Телефон не указан*\n\n"
                "Можно добавить для связи — это необязательно."
            )
            kb = InlineKeyboardMarkup([
                [InlineKeyboardButton("📱 Отправить контакт", callback_data="phone_share_0")],
                [InlineKeyboardButton("✏️ Написать номер", callback_data="phone_type_0")],
                [InlineKeyboardButton("🏠 В меню", callback_data="menu_main")],
            ])
        await safe_edit_message_text(query,text, reply_markup=kb, parse_mode="Markdown")
        return

    if data == "phone_change":
        context.user_data[AWAIT_PHONE_TEXT] = True
        context.user_data[AWAIT_PHONE_BID] = None
        await safe_edit_message_text(query,
            ui_text.phone_optional_prompt() + "\n\n_Напишите новый номер или отправьте контакт._",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("📱 Отправить контакт", callback_data="phone_share_0")],
                [InlineKeyboardButton("◀️ Отмена", callback_data="client_phone")],
            ]),
            parse_mode="Markdown",
        )
        return

    if data == "phone_remove":
        db.set_user_phone(uid, "")
        await safe_edit_message_text(query,
            "Телефон удалён.",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("🏠 В меню", callback_data="menu_main")]
            ]),
        )
        return

    if data.startswith("phone_share_"):
        bid_s = data.replace("phone_share_", "")
        bid = int(bid_s) if bid_s.isdigit() and int(bid_s) > 0 else None
        if bid is None:
            context.user_data[AWAIT_REG_PHONE] = True
        context.user_data[AWAIT_PHONE_BID] = bid
        context.user_data.pop(AWAIT_PHONE_TEXT, None)
        await query.answer()
        await context.bot.send_message(
            query.message.chat_id,
            "Нажмите кнопку «📱 Отправить мой номер» ниже.",
            reply_markup=_phone_contact_keyboard(),
        )
        return

    if data.startswith("phone_type_"):
        bid_s = data.replace("phone_type_", "")
        bid = int(bid_s) if bid_s.isdigit() and int(bid_s) > 0 else None
        if bid is None:
            context.user_data[AWAIT_REG_PHONE] = True
        context.user_data[AWAIT_PHONE_BID] = bid
        context.user_data[AWAIT_PHONE_TEXT] = True
        prompt = (
            ui_text.registration_phone_prompt()
            if context.user_data.get(AWAIT_REG_PHONE)
            else ui_text.phone_optional_prompt()
        )
        await safe_edit_message_text(query,
            prompt + "\n\n_Напишите номер сообщением, например +79001234567_",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("Пропустить", callback_data=f"phone_skip_{bid_s}")],
            ]),
            parse_mode="Markdown",
        )
        return

    if data.startswith("phone_skip_"):
        bid_s = data.replace("phone_skip_", "")
        bid = int(bid_s) if bid_s.isdigit() and int(bid_s) > 0 else None
        was_reg = context.user_data.pop(AWAIT_REG_PHONE, False)
        context.user_data.pop(AWAIT_PHONE_BID, None)
        context.user_data.pop(AWAIT_PHONE_TEXT, None)
        if was_reg or (bid is None and db.should_ask_registration_phone(uid)):
            db.mark_phone_registration_skipped(uid)
            first_name = context.user_data.pop("reg_first_name", None)
            await safe_edit_message_text(query,
                ui_text.welcome_text(
                    first_name or query.from_user.first_name, is_admin(uid)
                ),
                reply_markup=_main_keyboard(uid),
                parse_mode="Markdown",
            )
            try:
                await context.bot.send_message(
                    query.message.chat_id,
                    "✓",
                    reply_markup=ReplyKeyboardRemove(),
                )
            except Exception:
                pass
            return
        await safe_edit_message_text(query,
            "Хорошо. Номер можно добавить позже в меню «⚙️ Настройки».",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("🏠 В меню", callback_data="menu_main")]
            ]),
        )
        try:
            await context.bot.send_message(
                query.message.chat_id,
                "✓",
                reply_markup=ReplyKeyboardRemove(),
            )
        except Exception:
            pass
        return

    if data.startswith("tz_pick_"):
        if context.user_data.pop("tz_from_settings", False):
            await csettings.on_settings_callback(update, context)
            return
        idx = int(data.replace("tz_pick_", ""))
        tz_name = tzutil.timezone_by_index(idx)
        if not tz_name:
            await query.answer("Неверный выбор", show_alert=True)
            return
        db.set_user_timezone(uid, tz_name, query.from_user.full_name)
        label = tzutil.tz_label(tz_name)
        context.user_data["reg_first_name"] = query.from_user.first_name
        if not is_admin(uid) and db.should_ask_registration_phone(uid):
            await safe_edit_message_text(query,
                f"✅ Часовой пояс: *{label}*\n\n"
                "🕐 *Регистрация · шаг 2 из 2*\n\n"
                + ui_text.registration_phone_prompt(),
                reply_markup=_reg_phone_keyboard(),
                parse_mode="Markdown",
            )
            context.user_data[AWAIT_REG_PHONE] = True
            return
        await safe_edit_message_text(query,
            f"✅ Часовой пояс: *{label}*\n\n"
            "Свободные окна показываются в вашем времени. "
            "В кабинете приём ведётся по времени Уфы.",
            reply_markup=_main_keyboard(uid),
            parse_mode="Markdown",
        )
        return

    if data == "client_tz":
        cur = db.get_user_timezone(uid)
        extra = f"\n\nСейчас: *{tzutil.tz_label(cur)}*" if cur else ""
        await safe_edit_message_text(query,
            f"🕐 *Часовой пояс*{extra}\n\nВыберите ваш город:",
            reply_markup=tzutil.timezone_picker_keyboard(),
            parse_mode="Markdown",
        )
        return

    if data == "help_info":
        await safe_edit_message_text(query,
            ui_text.help_text(),
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("📅 Записаться", callback_data="book_start")],
                [InlineKeyboardButton("🏠 В меню", callback_data="menu_main")],
            ]),
            parse_mode="Markdown",
        )
        return

    if data == "my_bookings":
        await _show_my_bookings(query, uid)
        return

    if data.startswith("cancel_ask_"):
        bid = int(data.replace("cancel_ask_", ""))
        booking = db.get_booking_by_id(bid)
        if not booking or booking["user_id"] != uid:
            await query.answer("Запись не найдена", show_alert=True)
            return
        if booking.get("status") not in ("booked", "confirmed"):
            await query.answer("Уже отменена", show_alert=True)
            return
        when = ui_text.format_booking_when(
            booking["book_date"], booking["book_time"], uid
        )
        mode = db.visit_type_label(booking.get("visit_type") or VISIT_IN_PERSON)
        await safe_edit_message_text(query,
            f"❌ *Отменить запись?*\n\n🗓 {when}\n{mode}",
            reply_markup=InlineKeyboardMarkup([
                [
                    InlineKeyboardButton(
                        "Да, отменить", callback_data=f"cancel_confirm_{bid}"
                    )
                ],
                [InlineKeyboardButton("◀️ Назад", callback_data="my_bookings")],
            ]),
            parse_mode="Markdown",
        )
        return

    if data.startswith("cancel_confirm_"):
        bid = int(data.replace("cancel_confirm_", ""))
        booking = db.get_booking_by_id(bid)
        if not booking or booking["user_id"] != uid:
            await query.answer("Запись не найдена", show_alert=True)
            return
        if db_booking_cancel.cancel_booking(bid, uid):
            when = ui_text.format_booking_when(
                booking["book_date"], booking["book_time"], uid
            )
            await safe_edit_message_text(query,
                f"✅ Запись отменена\n\n🗓 {when}",
                reply_markup=_nav_keyboard(),
                parse_mode="Markdown",
            )

            async def _post_cancel():
                gcal_async.on_booking_cancelled_bg(bid)
                await _notify_admins_cancel(context, uid, [booking])
                await booking_card.refresh_booking_card(context.bot, uid)

            asyncio.create_task(_post_cancel())
        else:
            await query.answer("Не удалось отменить", show_alert=True)
        return

    if data == "cancel_all_ask":
        today = tzutil.admin_today().isoformat()
        bookings = db.get_user_upcoming_bookings(uid, today)
        if not bookings:
            await query.answer("Нет записей для отмены", show_alert=True)
            return
        n = len(bookings)
        await safe_edit_message_text(query,
            f"❌ *Отменить все записи?* ({n})\n\nЭто действие нельзя отменить.",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("Да, отменить все", callback_data="cancel_all_confirm")],
                [InlineKeyboardButton("◀️ Назад", callback_data="my_bookings")],
            ]),
            parse_mode="Markdown",
        )
        return

    if data == "cancel_all_confirm":
        today = tzutil.admin_today().isoformat()
        bookings = db.get_user_upcoming_bookings(uid, today)
        if not bookings:
            await query.answer("Нет записей", show_alert=True)
            return
        count = db_booking_cancel.cancel_all_bookings(uid, today)
        await safe_edit_message_text(query,
            f"✅ Отменено записей: {count}",
            reply_markup=_nav_keyboard(),
            parse_mode="Markdown",
        )

        async def _post_cancel_all():
            for b in bookings:
                gcal_async.on_booking_cancelled_bg(b["id"])
            await _notify_admins_cancel(context, uid, bookings)
            await booking_card.refresh_booking_card(context.bot, uid)

        asyncio.create_task(_post_cancel_all())
        return

    if data == "book_cancel":
        _clear_booking_state(context)
        await _send_menu(query, uid, edit=True)
        return

    if data == "book_start":
        if not db.has_schedule():
            await safe_edit_message_text(query,
                "⏳ Расписание ещё не загружено.\nПопробуйте позже или напишите администратору.",
                reply_markup=_main_keyboard(uid),
            )
            return
        if not await _ensure_registration_complete(query, uid, context):
            return
        if await _reject_if_has_active_booking(query, uid):
            return
        _clear_booking_state(context)
        await safe_edit_message_text(query,
            ui_text.step_header(1, 3, "Запись на приём", ui_text.mode_choice_hint()),
            reply_markup=_mode_keyboard(),
            parse_mode="Markdown",
        )
        return

    if data == "book_mode_online":
        if not db.has_schedule_for_type(VISIT_ONLINE):
            await query.answer("Нет слотов для онлайн-записи", show_alert=True)
            return
        if not await _ensure_registration_complete(query, uid, context):
            return
        context.user_data["visit_type"] = VISIT_ONLINE
        await _show_calendar(query, context, uid)
        return

    if data == "book_mode_in_person":
        if not db.has_schedule_for_type(VISIT_IN_PERSON):
            await query.answer("Нет слотов для очной записи", show_alert=True)
            return
        if not await _ensure_registration_complete(query, uid, context):
            return
        context.user_data["visit_type"] = VISIT_IN_PERSON
        await _show_calendar(query, context, uid)
        return

    if data == "book_back_mode":
        context.user_data.pop("book_date", None)
        await safe_edit_message_text(query,
            ui_text.step_header(1, 3, "Запись на приём", ui_text.mode_choice_hint()),
            reply_markup=_mode_keyboard(),
            parse_mode="Markdown",
        )
        return

    if data.startswith("cal_prev_") or data.startswith("cal_next_"):
        parts = data.split("_")
        y, m = int(parts[2]), int(parts[3])
        y, m = shift_month(y, m, -1 if "prev" in data else 1)
        vt = context.user_data.get("visit_type", "")
        hint = (
            f"Формат: *{_mode_title(vt)}*\n"
            "Активные дни — цифры, • — сегодня.\n"
            + ui_text.booking_time_rules_hint()
        )
        await safe_edit_message_text(query,
            ui_text.step_header(2, 3, "Выбор даты", hint),
            reply_markup=_calendar_markup(context, y, m, uid),
            parse_mode="Markdown",
        )
        return

    if data.startswith("cal_day_"):
        visit_type = context.user_data.get("visit_type")
        if not visit_type:
            await safe_edit_message_text(query,
                ui_text.step_header(1, 3, "Запись на приём", ui_text.mode_choice_hint()),
                reply_markup=_mode_keyboard(),
                parse_mode="Markdown",
            )
            return
        iso = data.replace("cal_day_", "")
        d = date.fromisoformat(iso)
        admin_booking = is_admin(uid)
        times = slots.self_book_times_for_date(d, visit_type)
        if not times:
            extra = ""
            if slots.available_times_for_date(d, visit_type):
                extra = (
                    "\n\n_Есть слоты раньше чем через 6 ч — только по согласованию "
                    "с администратором._"
                )
            no_slots_msg = (
                f"На {ui_text.format_date_iso(iso)} нет слотов для самостоятельной записи "
                f"(нужно ≥ {slots.self_book_hours()} ч до приёма).{extra}"
            )
            await safe_edit_message_text(query,
                ui_text.step_header(
                    2,
                    3,
                    "Выбор даты",
                    f"{no_slots_msg}\n"
                    "Выберите другую дату.",
                ),
                reply_markup=InlineKeyboardMarkup([
                    [InlineKeyboardButton("🔙 К календарю", callback_data="book_back_calendar")],
                    [InlineKeyboardButton("🏠 В меню", callback_data="menu_main")],
                ]),
                parse_mode="Markdown",
            )
            return
        context.user_data["book_date"] = iso
        utz = _user_tz(uid)
        labeled = tzutil.display_time_buttons(iso, times, utz)
        time_hint = f"Формат: *{_mode_title(visit_type)}*"
        if visit_type == VISIT_IN_PERSON and slots.uses_in_person_waves(
            db.get_open_times_for_date(iso, visit_type)
        ):
            time_hint += (
                "\n_На этот день сначала открыты ближайшие окна; "
                "остальные — по мере заполнения._"
            )
        if admin_booking:
            time_hint += "\n_Тест: как у клиента, но можно оформить несколько записей._"
        if utz != config.ADMIN_TZ:
            time_hint += f"\n_Время — по вашему поясу ({tzutil.tz_label(utz)})._"
        await safe_edit_message_text(query,
            ui_text.step_header(
                3,
                3,
                "Выбор времени",
                f"📅 {ui_text.format_date_iso(iso)}\n{time_hint}",
            ),
            reply_markup=time_slots_keyboard(
                times, iso, labeled_slots=labeled
            ),
            parse_mode="Markdown",
        )
        return

    if data == "book_back_calendar":
        await _show_calendar(query, context, uid)
        return

    if data.startswith("book_time_"):
        visit_type = context.user_data.get("visit_type", VISIT_IN_PERSON)
        rest = data[len("book_time_") :]
        book_date, book_time = rest.rsplit("_", 1)
        admin_booking = is_admin(uid)
        if not admin_booking:
            active = db.get_user_active_booking(uid, tzutil.admin_today().isoformat())
            if active:
                if active["book_date"] == book_date and active["book_time"] == book_time:
                    await query.answer("Вы уже записаны на это время", show_alert=True)
                else:
                    await query.answer(
                        "У вас уже есть запись. Сначала отмените её в «Мои записи».",
                        show_alert=True,
                    )
                return
        if db.slot_taken(book_date, book_time):
            await query.answer("Это время уже занято", show_alert=True)
            return
        d = date.fromisoformat(book_date)
        if book_time not in db.get_open_times_for_date(book_date, visit_type):
            await query.answer("Слот недоступен", show_alert=True)
            return
        if book_time not in slots.client_visible_times_for_date(d, visit_type):
            await query.answer(
                "Это время пока недоступно для записи. Выберите другое из списка.",
                show_alert=True,
            )
            return
        if not slots.can_self_book(book_date, book_time):
            await query.answer(
                f"Запись менее чем за {slots.self_book_hours()} ч — согласуйте с администратором",
                show_alert=True,
            )
            return
        name = query.from_user.full_name or str(uid)
        try:
            bid = db.create_booking(uid, name, book_date, book_time, visit_type)
        except Exception as e:
            logger.exception("create_booking failed: %s", e)
            await query.answer(
                "Не удалось оформить запись. Попробуйте другое время или /menu",
                show_alert=True,
            )
            return
        hwdb.ensure_client(uid, name)
        _clear_booking_state(context)
        await _send_booking_confirmation(
            query, context, visit_type, book_date, book_time, bid
        )

        async def _post_booking():
            gcal_async.on_booking_created_bg(bid)
            await _notify_admins_new_booking(
                context, name, uid, book_date, book_time, visit_type
            )
            await booking_card.refresh_booking_card(context.bot, uid)

        asyncio.create_task(_post_booking())
        return

    if data.startswith("confirm_yes_") or data.startswith("confirm_no_"):
        bid = int(data.split("_")[-1])
        booking = db.get_booking_by_id(bid)
        if not booking or booking["user_id"] != uid:
            await query.answer("Запись не найдена", show_alert=True)
            return
        yes = data.startswith("confirm_yes_")
        db.set_evening_confirmed(bid, yes)
        if yes:
            gcal_async.on_booking_updated_bg(bid)
        else:
            gcal_async.on_booking_cancelled_bg(bid)
        mode = db.visit_type_label(booking.get("visit_type") or VISIT_IN_PERSON)
        when_user = ui_text.format_booking_when(
            booking["book_date"], booking["book_time"], uid
        )
        when_admin = ui_text.format_booking_when(
            booking["book_date"], booking["book_time"], admin_view=True
        )
        msg = (
            f"✅ Вы подтвердили визит ({mode})\n🗓 {when_user}"
            if yes
            else f"❌ Запись отменена ({mode})\n🗓 {when_user}"
        )
        await safe_edit_message_text(query,
            msg,
            reply_markup=_nav_keyboard(),
            parse_mode="Markdown",
        )
        for admin_id in config.ADMIN_USER_IDS:
            try:
                status = "подтвердил" if yes else "отменил"
                await context.bot.send_message(
                    admin_id,
                    f"Пациент {booking.get('user_name') or uid} {status} "
                    f"({mode}) — {when_admin}.",
                )
            except Exception:
                pass
        await booking_card.refresh_booking_card(context.bot, uid)
        return

async def _notify_admins_cancel(context, uid, bookings: list):
    for b in bookings:
        when = ui_text.format_booking_when(
            b["book_date"], b["book_time"], admin_view=True
        )
        mode = db.visit_type_label(b.get("visit_type") or VISIT_IN_PERSON)
        msg = (
            f"❌ Клиент отменил запись\n"
            f"{b.get('user_name') or uid}\n🗓 {when} ({mode})"
        )
        for admin_id in config.ADMIN_USER_IDS:
            try:
                await context.bot.send_message(admin_id, msg)
            except Exception as e:
                logger.warning("Админ %s: %s", admin_id, e)


async def _notify_admins_new_booking(context, name, uid, book_date, book_time, visit_type):
    mode = db.visit_type_label(visit_type)
    when = ui_text.format_booking_when(book_date, book_time, admin_view=True)
    msg = f"🆕 Новая запись ({mode})\n{name} (id {uid})\n🗓 {when}"
    phone = db.get_user_phone(uid)
    if phone:
        msg += f"\n📱 {phone}"
    for admin_id in config.ADMIN_USER_IDS:
        try:
            await context.bot.send_message(admin_id, msg)
        except Exception as e:
            logger.warning("Админ %s: %s", admin_id, e)


async def cmd_today(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update.effective_user.id):
        return
    import admin_calendar as ac

    today = tzutil.admin_today().isoformat()
    bookings = db.get_bookings_on(today)
    await hw_handlers.enrich_today_bookings(bookings)
    await update.message.reply_text(
        ac.today_timeline_text(bookings),
        reply_markup=ac.today_keyboard(bookings),
        parse_mode="Markdown",
    )


async def cmd_schedule(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update.effective_user.id):
        return
    await adm.open_calendar_for_message(update.message, context)


async def on_document(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not is_admin(update.effective_user.id):
        return
    doc = update.message.document
    if not doc.file_name.lower().endswith((".xlsx", ".xlsm")):
        await update.message.reply_text("Нужен файл Excel (.xlsx)")
        return
    file = await doc.get_file()
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        await file.download_to_drive(tmp.name)
        try:
            from schedule_excel import apply_schedule_preserving_bookings

            result = apply_schedule_preserving_bookings(tmp.name)
        except Exception as e:
            await update.message.reply_text(f"❌ Ошибка чтения Excel:\n{e}")
            return
    extra = ""
    open_from = result.get("open_from")
    close_from = result.get("close_from")
    if open_from or close_from:
        parts = []
        if open_from:
            parts.append(f"с {ui_text.format_date_iso(open_from)}")
        if close_from:
            parts.append(
                f"до {ui_text.format_date_iso((date.fromisoformat(close_from) - timedelta(days=1)).isoformat())}"
            )
        extra = "\n\n_Запись " + " ".join(parts) + "._"
    preserved = result.get("preserved_bookings") or []
    preserved_txt = ""
    if preserved:
        preserved_txt = (
            "\n\n_Сохранены окна с активными записями:_ "
            + ", ".join(preserved[:8])
            + ("…" if len(preserved) > 8 else "")
        )
    await update.message.reply_text(
        f"✅ Расписание обновлено.\n"
        f"Открытых слотов: *{result.get('open_slots', 0)}*\n"
        f"Активных записей: *{result.get('active_bookings', 0)}*"
        f"{preserved_txt}\n\n"
        "Откройте /admin → «⚙️ Настройка»." + extra,
        reply_markup=adm.panel_reply_markup(),
        parse_mode="Markdown",
    )


async def on_client_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if await adm.on_admin_text(update, context):
        return

    if await csettings.on_settings_message(update, context):
        return

    import homework_program_handlers as hph

    if await hph.on_homework_message(update, context):
        return

    uid = update.effective_user.id
    bid = context.user_data.get(AWAIT_PHONE_BID)
    awaiting_text = context.user_data.get(AWAIT_PHONE_TEXT)

    if update.message and update.message.contact:
        phone = phone_util.phone_from_contact(update.message.contact)
        if not phone:
            await update.message.reply_text(
                "Не удалось распознать номер. Напишите вручную, например +79001234567."
            )
            return
        await _save_user_phone(context, uid, phone, bid)
        return

    if awaiting_text and update.message and update.message.text:
        phone = phone_util.normalize_phone(update.message.text)
        if not phone:
            await update.message.reply_text(
                "Не похоже на номер. Пример: +79001234567\n"
                "Или нажмите «Пропустить» / «📱 Телефон» в меню."
            )
            return
        await _save_user_phone(context, uid, phone, bid)
        return


async def on_admin_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await on_client_message(update, context)
