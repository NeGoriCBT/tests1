"""Настройки клиента: часовой пояс, уведомления, телефон, удаление профиля."""
from __future__ import annotations

import logging

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

import config
import db
import gcal_async
import phone_util
import tzutil
import user_prefs as uprefs
from telegram_util import safe_edit_message_text

logger = logging.getLogger(__name__)

AWAIT_DELETE_CONFIRM = "settings_delete_confirm"
AWAIT_DECLINE_REASON = "hw_decline_reason"


def is_settings_callback(data: str) -> bool:
    return data.startswith(
        (
            "settings_",
            "menu_settings",
        )
    )


def _menu_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [[InlineKeyboardButton("🏠 Главное меню", callback_data="menu_main")]]
    )


def settings_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🕐 Часовой пояс", callback_data="settings_tz")],
        [InlineKeyboardButton("🔔 Уведомления", callback_data="settings_notify")],
        [InlineKeyboardButton("📱 Телефон", callback_data="settings_phone")],
        [InlineKeyboardButton("🗑 Удалить профиль", callback_data="settings_delete_ask")],
        [InlineKeyboardButton("🏠 Главное меню", callback_data="menu_main")],
    ])


def settings_text(uid: int) -> str:
    prefs = uprefs.get_prefs(uid)
    tz = db.get_user_timezone(uid)
    tz_line = tzutil.tz_label(tz) if tz else "не указан"
    hw = "включены" if prefs.get("hw_notify_enabled", 1) else "выключены"
    return (
        "⚙️ *Настройки*\n\n"
        f"🕐 Часовой пояс: *{tz_line}*\n"
        f"🔔 Уведомления о ДЗ: *{hw}*\n"
        f"   Утро: {prefs.get('morning_notify_from')}–{prefs.get('morning_notify_to')}\n"
        f"   Вечер: {prefs.get('evening_notify_from')}–{prefs.get('evening_notify_to')}\n\n"
        "ℹ️ Напоминания о предстоящей записи отключить нельзя."
    )


async def show_settings(target, uid: int, *, edit: bool = False):
    text = settings_text(uid)
    kb = settings_keyboard()
    if edit and hasattr(target, "edit_message_text"):
        await safe_edit_message_text(target,text, reply_markup=kb, parse_mode="Markdown")
    else:
        await target.reply_text(text, reply_markup=kb, parse_mode="Markdown")


async def on_settings_callback(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> bool:
    query = update.callback_query
    data = query.data or ""
    if not is_settings_callback(data):
        return False

    uid = query.from_user.id
    await query.answer()

    if data == "menu_settings":
        await show_settings(query, uid, edit=True)
        return True

    if data == "settings_tz":
        context.user_data["tz_from_settings"] = True
        cur = db.get_user_timezone(uid)
        extra = f"\n\nСейчас: *{tzutil.tz_label(cur)}*" if cur else ""
        await safe_edit_message_text(query,
            f"🕐 *Часовой пояс*{extra}\n\nВыберите ваш город:",
            reply_markup=tzutil.timezone_picker_keyboard(back_callback="menu_settings"),
            parse_mode="Markdown",
        )
        return True

    if data.startswith("tz_pick_"):
        idx = int(data.replace("tz_pick_", ""))
        tz_name = tzutil.timezone_by_index(idx)
        if not tz_name:
            await query.answer("Неверный выбор", show_alert=True)
            return True
        db.set_user_timezone(uid, tz_name)
        label = tzutil.tz_label(tz_name)
        await safe_edit_message_text(query,
            f"✅ Часовой пояс: *{label}*",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("◀️ Настройки", callback_data="menu_settings")],
                [InlineKeyboardButton("🏠 Главное меню", callback_data="menu_main")],
            ]),
            parse_mode="Markdown",
        )
        return True

    if data == "settings_notify":
        await _show_notify_menu(query, uid)
        return True

    if data == "settings_notify_toggle":
        prefs = uprefs.get_prefs(uid)
        uprefs.set_hw_notify_enabled(uid, not prefs.get("hw_notify_enabled", 1))
        await _show_notify_menu(query, uid)
        return True

    if data == "settings_notify_morning":
        await safe_edit_message_text(query,
            "🌅 *Утренние уведомления (ДЗ)*\n\nВыберите удобное окно:",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("07:00–09:00", callback_data="settings_morning_early")],
                [InlineKeyboardButton("08:00–10:00", callback_data="settings_morning_mid")],
                [InlineKeyboardButton("09:00–11:00", callback_data="settings_morning_late")],
                [InlineKeyboardButton("◀️ Назад", callback_data="settings_notify")],
            ]),
            parse_mode="Markdown",
        )
        return True

    if data == "settings_notify_evening":
        await safe_edit_message_text(query,
            "🌙 *Вечерние уведомления (ДЗ)*\n\nВыберите удобное окно:",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("17:00–19:00", callback_data="settings_evening_early")],
                [InlineKeyboardButton("18:00–21:00", callback_data="settings_evening_mid")],
                [InlineKeyboardButton("19:00–22:00", callback_data="settings_evening_late")],
                [InlineKeyboardButton("◀️ Назад", callback_data="settings_notify")],
            ]),
            parse_mode="Markdown",
        )
        return True

    if data.startswith("settings_morning_"):
        uprefs.apply_preset(uid, data.replace("settings_", ""))
        await query.answer("Сохранено")
        await _show_notify_menu(query, uid)
        return True

    if data.startswith("settings_evening_"):
        uprefs.apply_preset(uid, data.replace("settings_", ""))
        await query.answer("Сохранено")
        await _show_notify_menu(query, uid)
        return True

    if data == "settings_phone":
        await _show_phone(query, uid, context)
        return True

    if data == "settings_phone_change":
        context.user_data["settings_phone_await"] = True
        await safe_edit_message_text(query,
            "📱 *Телефон*\n\nНапишите номер сообщением или отправьте контакт.",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("📱 Отправить контакт", callback_data="settings_phone_share")],
                [InlineKeyboardButton("◀️ Назад", callback_data="settings_phone")],
            ]),
            parse_mode="Markdown",
        )
        return True

    if data == "settings_phone_share":
        from handlers import _phone_contact_keyboard

        context.user_data["settings_phone_await"] = True
        await query.answer()
        await context.bot.send_message(
            query.message.chat_id,
            "Нажмите «📱 Отправить мой номер» ниже.",
            reply_markup=_phone_contact_keyboard(),
        )
        return True

    if data == "settings_phone_remove":
        db.set_user_phone(uid, "")
        await query.answer("Удалено")
        await _show_phone(query, uid, context)
        return True

    if data == "settings_delete_ask":
        context.user_data[AWAIT_DELETE_CONFIRM] = True
        await safe_edit_message_text(query,
            "⚠️ *Удалить профиль?*\n\n"
            "Будут удалены:\n"
            "• телефон, часовой пояс, настройки\n"
            "• домашние задания и рекомендации\n"
            "• активные записи будут *отменены*\n\n"
            "Это действие необратимо.",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("❌ Да, удалить всё", callback_data="settings_delete_confirm")],
                [InlineKeyboardButton("◀️ Отмена", callback_data="menu_settings")],
            ]),
            parse_mode="Markdown",
        )
        return True

    if data == "settings_delete_confirm":
        context.user_data.pop(AWAIT_DELETE_CONFIRM, None)
        today = __import__("tzutil").admin_today().isoformat()
        bookings = db.get_user_upcoming_bookings(uid, today)
        for b in bookings:
            gcal_async.on_booking_cancelled_bg(b["id"])
        uprefs.delete_user_data(uid)
        await safe_edit_message_text(query,
            "✅ Профиль удалён. Данные стёрты.\n\n"
            "Чтобы снова пользоваться ботом — /start",
            reply_markup=_menu_kb(),
        )
        return True

    return True


async def _show_notify_menu(query, uid: int):
    prefs = uprefs.get_prefs(uid)
    on = prefs.get("hw_notify_enabled", 1)
    toggle_label = "🔕 Выключить ДЗ-уведомления" if on else "🔔 Включить ДЗ-уведомления"
    text = (
        "🔔 *Уведомления*\n\n"
        f"Утренние (ДЗ): {prefs.get('morning_notify_from')}–{prefs.get('morning_notify_to')}\n"
        f"Вечерние (ДЗ): {prefs.get('evening_notify_from')}–{prefs.get('evening_notify_to')}\n\n"
        "ℹ️ Подтверждение записи накануне визита — всегда включено."
    )
    await safe_edit_message_text(query,
        text,
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton(toggle_label, callback_data="settings_notify_toggle")],
            [InlineKeyboardButton("🌅 Утреннее окно", callback_data="settings_notify_morning")],
            [InlineKeyboardButton("🌙 Вечернее окно", callback_data="settings_notify_evening")],
            [InlineKeyboardButton("◀️ Настройки", callback_data="menu_settings")],
        ]),
        parse_mode="Markdown",
    )


async def _show_phone(query, uid: int, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.pop("settings_phone_await", None)
    phone = db.get_user_phone(uid)
    if phone:
        text = f"📱 *Ваш телефон:* `{phone}`"
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton("✏️ Изменить", callback_data="settings_phone_change")],
            [InlineKeyboardButton("🗑 Удалить", callback_data="settings_phone_remove")],
            [InlineKeyboardButton("◀️ Настройки", callback_data="menu_settings")],
        ])
    else:
        text = "📱 *Телефон не указан*\n\nМожно добавить для связи."
        kb = InlineKeyboardMarkup([
            [InlineKeyboardButton("✏️ Добавить", callback_data="settings_phone_change")],
            [InlineKeyboardButton("◀️ Настройки", callback_data="menu_settings")],
        ])
    await safe_edit_message_text(query,text, reply_markup=kb, parse_mode="Markdown")


async def on_settings_message(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> bool:
    uid = update.effective_user.id

    if context.user_data.get(AWAIT_DECLINE_REASON):
        from homework_handlers import handle_decline_reason_text

        return await handle_decline_reason_text(update, context)

    if context.user_data.get("settings_phone_await"):
        if update.message and update.message.contact:
            phone = phone_util.phone_from_contact(update.message.contact)
        elif update.message and update.message.text:
            phone = phone_util.normalize_phone(update.message.text)
        else:
            return False
        if not phone:
            await update.message.reply_text(
                "Не похоже на номер. Пример: +79001234567"
            )
            return True
        db.set_user_phone(uid, phone)
        context.user_data.pop("settings_phone_await", None)
        await update.message.reply_text(
            f"✅ Номер сохранён: `{phone}`",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("◀️ Настройки", callback_data="menu_settings")],
            ]),
            parse_mode="Markdown",
        )
        return True

    return False
