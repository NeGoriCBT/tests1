"""Домашние задания: админ (профиль, пул КПТ) и клиент (чтение)."""
from __future__ import annotations

import logging
from datetime import date, datetime

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

import config
import db
import homework_db as hwdb
import ui_text
import literature_db as litdb
import literature_handlers as lit_handlers
import admin_calendar as adm_cal
import homework_program_handlers as hph
import homework_programs as hp
import client_settings as csettings
import gcal_async
from db_conn import connect as db_conn
import bot_ui
from telegram_util import safe_edit_message_text

logger = logging.getLogger(__name__)


def is_admin(user_id: int) -> bool:
    return user_id in config.ADMIN_USER_IDS

DEFAULT_INTRO = (
    "Добрый вечер! После сегодняшней сессии ваши задания на межсессионный период:"
)


def _sel_key(user_id: int) -> str:
    return f"hw_selected_{user_id}"


def _get_selected(context: ContextTypes.DEFAULT_TYPE, user_id: int) -> set[int]:
    return set(context.user_data.get(_sel_key(user_id), []))


def _set_selected(context: ContextTypes.DEFAULT_TYPE, user_id: int, ids: set[int]):
    context.user_data[_sel_key(user_id)] = list(ids)


def _clear_hw_flow(context: ContextTypes.DEFAULT_TYPE, user_id: int):
    context.user_data.pop(_sel_key(user_id), None)
    context.user_data.pop(f"hw_booking_{user_id}", None)


def is_homework_callback(data: str) -> bool:
    return data.startswith(
        (
            "hw_",
            "adm_hw_",
            "adm_profile_",
            "adm_today_user_",
        )
    ) or hph.is_program_callback(data)


async def on_homework_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    """Обработка callback ДЗ. Возвращает True, если обработано."""
    query = update.callback_query
    data = query.data
    if not is_homework_callback(data):
        return False

    uid = query.from_user.id

    if hph.is_program_callback(data):
        return await hph.on_program_callback(update, context)

    await query.answer()

    # --- клиент ---
    if data == "hw_my_list":
        await _client_homework_hub(query, uid)
        return True

    if data.startswith("hw_prog_view_"):
        pid = int(data.replace("hw_prog_view_", ""))
        await _client_program_view(query, uid, pid)
        return True

    if data.startswith("hw_item_"):
        item_id = int(data.replace("hw_item_", ""))
        await _client_static_item(query, uid, item_id)
        return True

    if data.startswith("hw_decline_skip_"):
        pid = int(data.replace("hw_decline_skip_", ""))
        await _decline_program(query, context, uid, pid, "")
        return True

    if data.startswith("hw_decline_"):
        pid = int(data.replace("hw_decline_", ""))
        prog = hwdb.get_program(pid, uid)
        if not prog:
            await query.answer("Не найдено", show_alert=True)
            return True
        context.user_data[csettings.AWAIT_DECLINE_REASON] = pid
        title = hp.TITLE_POSITIVE if prog["program_type"] == hp.PROGRAM_POSITIVE_EMOTIONS else hp.TITLE_ANXIETY
        await bot_ui.edit_or_send(
            query,
            f"🚫 *Отказ от задания*\n\n*{title}*\n\n"
            "Напишите, пожалуйста, причину следующим сообщением.",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("⏭ Пропустить", callback_data=f"hw_decline_skip_{pid}")],
                [InlineKeyboardButton("◀️ Назад", callback_data=f"hw_prog_view_{pid}")],
            ]),
        )
        return True

    if data.startswith("hw_view_"):
        hw_id = int(data.replace("hw_view_", ""))
        await _client_homework_view(query, uid, hw_id)
        return True

    if not is_admin(uid):
        return True

    # --- админ: библиотека ---
    if data == "adm_hw_library":
        await _admin_library(query)
        return True

    if data.startswith("adm_hw_tpl_"):
        tpl_id = int(data.replace("adm_hw_tpl_", ""))
        await _admin_template_view(query, tpl_id)
        return True

    # --- профиль клиента ---
    if data.startswith("adm_profile_"):
        client_id = int(data.replace("adm_profile_", ""))
        if not context.user_data.get("adm_nav_back"):
            context.user_data["adm_nav_back"] = "admin_today"
        import tzutil

        today = tzutil.admin_today().isoformat()
        for b in db.get_bookings_on(today):
            if b["user_id"] == client_id:
                context.user_data[f"hw_booking_{client_id}"] = b["id"]
                context.user_data["adm_active_booking"] = b["id"]
                hwdb.ensure_client(client_id, b.get("user_name"))
                break
        await show_admin_client_profile(query, client_id, context)
        return True

    if data.startswith("adm_sess_plus_"):
        client_id = int(data.replace("adm_sess_plus_", ""))
        hwdb.add_manual_session(client_id)
        await query.answer("Сессия +1", show_alert=False)
        await show_admin_client_profile(query, client_id, context)
        return True

    if data.startswith("adm_hw_hist_"):
        client_id = int(data.replace("adm_hw_hist_", ""))
        await _admin_hw_history(query, client_id)
        return True

    if data.startswith("adm_hw_new_"):
        client_id = int(data.replace("adm_hw_new_", ""))
        _set_selected(context, client_id, set())
        context.user_data[f"hw_booking_{client_id}"] = None
        await _admin_pick_templates(query, context, client_id)
        return True

    if data.startswith("adm_hw_toggle_"):
        # adm_hw_toggle_{tpl_id}_{client_id}
        parts = data.split("_")
        tpl_id = int(parts[3])
        client_id = int(parts[4])
        selected = _get_selected(context, client_id)
        if tpl_id in selected:
            selected.discard(tpl_id)
        else:
            selected.add(tpl_id)
        _set_selected(context, client_id, selected)
        await _admin_pick_templates(query, context, client_id)
        return True

    if data.startswith("adm_hw_preview_"):
        client_id = int(data.replace("adm_hw_preview_", ""))
        selected = _get_selected(context, client_id)
        if not selected:
            await query.answer("Выберите хотя бы одно задание", show_alert=True)
            return True
        await _admin_preview(query, context, client_id)
        return True

    if data.startswith("adm_hw_confirm_"):
        client_id = int(data.replace("adm_hw_confirm_", ""))
        await _admin_send_homework(query, context, client_id, uid)
        return True

    if data.startswith("adm_hw_back_profile_"):
        client_id = int(data.replace("adm_hw_back_profile_", ""))
        _clear_hw_flow(context, client_id)
        await show_admin_client_profile(query, client_id, context)
        return True

    return True


async def _client_homework_hub(query, uid: int):
    progs = hwdb.list_active_programs(uid)
    static = hwdb.list_static_homework_items(uid)
    books = litdb.list_user_literature(uid)

    if not progs and not static and not books:
        text = (
            "📝 *Домашнее задание*\n\n"
            "Пока заданий нет. После сессии *Помощник* добавит их сюда."
        )
        kb = InlineKeyboardMarkup(
            [[InlineKeyboardButton("🏠 Главное меню", callback_data="menu_main")]]
        )
        await bot_ui.edit_or_send(query, text, reply_markup=kb)
        return

    lines = ["📝 *Домашнее задание*", ""]
    buttons = []

    for p in progs:
        day_idx = p.get("day_index") or hp.day_index_for_program(p["start_date"])
        title = hp.TITLE_POSITIVE if p["program_type"] == hp.PROGRAM_POSITIVE_EMOTIONS else hp.TITLE_ANXIETY
        entry = hwdb.get_program_entry(p["id"], day_idx) if day_idx else None
        done = "✅" if entry and entry.get("submitted_at") else "⏳"
        lines.append(f"{done} *{title}* — день {day_idx}/{p['days_total']}")
        if p["program_type"] == hp.PROGRAM_POSITIVE_EMOTIONS:
            lines.append("   _5 приятных моментов вечером_")
        else:
            lines.append("   _Ситуация → мысль → эмоция, в течение дня_")
        buttons.append([
            InlineKeyboardButton(
                f"📖 {title}",
                callback_data=f"hw_prog_view_{p['id']}",
            )
        ])
        lines.append("")

    for item in static[:8]:
        unread = " 🆕" if not item.get("read_at") else ""
        lines.append(f"• *{item['title']}*{unread}")
        buttons.append([
            InlineKeyboardButton(
                f"📄 {item['title'][:30]}",
                callback_data=f"hw_item_{item['item_id']}",
            )
        ])

    if books:
        lines.append("*Рекомендованные книги:*")
        for b in books[:5]:
            unread = " 🆕" if not b.get("read_at") else ""
            lines.append(f"• {b['title']}{unread}")
            buttons.append([
                InlineKeyboardButton(
                    f"📚 {b['title'][:28]}",
                    callback_data=f"lit_view_{b['id']}",
                )
            ])

    buttons.append([InlineKeyboardButton("🏠 Главное меню", callback_data="menu_main")])
    await bot_ui.edit_or_send(
        query, "\n".join(lines).strip(), reply_markup=InlineKeyboardMarkup(buttons)
    )


async def _client_program_view(query, uid: int, program_id: int):
    prog = hwdb.get_program(program_id, uid)
    if not prog or prog["status"] != "active":
        await query.answer("Задание недоступно", show_alert=True)
        return
    text = hph.program_detail_text(prog, uid)
    kb = hph.program_detail_keyboard(prog)
    await bot_ui.edit_or_send(query, text, reply_markup=kb)


async def _client_static_item(query, uid: int, item_id: int):
    with db_conn() as c:
        row = c.execute(
            "SELECT * FROM homework_sent_items WHERE id=?", (item_id,)
        ).fetchone()
    if not row:
        await query.answer("Не найдено", show_alert=True)
        return
    item = dict(row)
    hw = hwdb.get_homework(item["homework_id"], uid)
    if hw:
        hwdb.mark_homework_read(hw["id"], uid)
    text = f"📄 *{item['title']}*\n\n{item['body']}"
    if len(text) > 3900:
        text = text[:3890] + "…"
    await bot_ui.edit_or_send(
        query,
        text,
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("◀️ К списку", callback_data="hw_my_list")],
            [InlineKeyboardButton("🏠 Главное меню", callback_data="menu_main")],
        ]),
    )


async def handle_decline_reason_text(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> bool:
    pid = context.user_data.pop(csettings.AWAIT_DECLINE_REASON, None)
    if pid is None:
        return False
    uid = update.effective_user.id
    reason = (update.message.text or "").strip()
    prog = hwdb.get_program(pid, uid)
    if not prog:
        return True
    title = hp.TITLE_POSITIVE if prog["program_type"] == hp.PROGRAM_POSITIVE_EMOTIONS else hp.TITLE_ANXIETY
    hwdb.decline_program(uid, pid, title, reason, prog.get("homework_id"))
    await _sync_declines_to_gcal(uid)
    await update.message.reply_text(
        f"✅ Задание «{title}» отменено.\n"
        "Информация будет учтена при следующей записи.",
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("📝 Домашнее задание", callback_data="hw_my_list")],
            [InlineKeyboardButton("🏠 Главное меню", callback_data="menu_main")],
        ]),
    )
    return True


async def _decline_program(query, context, uid: int, pid: int, reason: str):
    context.user_data.pop(csettings.AWAIT_DECLINE_REASON, None)
    prog = hwdb.get_program(pid, uid)
    if not prog:
        await query.answer("Не найдено", show_alert=True)
        return
    title = hp.TITLE_POSITIVE if prog["program_type"] == hp.PROGRAM_POSITIVE_EMOTIONS else hp.TITLE_ANXIETY
    hwdb.decline_program(uid, pid, title, reason, prog.get("homework_id"))
    await _sync_declines_to_gcal(uid)
    await bot_ui.edit_or_send(
        query,
        f"✅ Задание «{title}» отменено.",
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("📝 Домашнее задание", callback_data="hw_my_list")],
            [InlineKeyboardButton("🏠 Главное меню", callback_data="menu_main")],
        ]),
    )


async def _sync_declines_to_gcal(uid: int):
    import tzutil

    today = tzutil.admin_today().isoformat()
    booking = db.get_user_active_booking(uid, today)
    if booking:
        gcal_async.on_booking_updated_bg(booking["id"])
        hwdb.mark_declines_gcal_synced(uid)


async def _client_homework_list(query, uid: int):
    await _client_homework_hub(query, uid)


async def _client_homework_view(query, uid: int, hw_id: int):
    hw = hwdb.get_homework(hw_id, uid)
    if not hw:
        await query.answer("Задание не найдено", show_alert=True)
        return
    hwdb.mark_homework_read(hw_id, uid)
    assistant = getattr(config, "ASSISTANT_NAME", "Помощник")
    text = hwdb.format_homework_message(hw["intro"], hw["items"], assistant)
    kb = InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("🔙 К списку", callback_data="hw_my_list")],
            [InlineKeyboardButton("🏠 В меню", callback_data="menu_main")],
        ]
    )
    await bot_ui.edit_or_send(query, text, reply_markup=kb)


async def _admin_library(query):
    templates = hwdb.list_templates()
    lines = ["📚 *Библиотека заданий (КПТ)*\n"]
    buttons = []
    for t in templates:
        lines.append(f"• {t['title']}")
        buttons.append(
            [
                InlineKeyboardButton(
                    f"📖 {t['title']}", callback_data=f"adm_hw_tpl_{t['id']}"
                )
            ]
        )
    buttons.append([InlineKeyboardButton("◀️ Материалы", callback_data="admin_materials")])
    buttons.append([InlineKeyboardButton("◀️ Панель", callback_data="menu_admin")])
    await safe_edit_message_text(query,
        "\n".join(lines),
        reply_markup=InlineKeyboardMarkup(buttons),
        parse_mode="Markdown",
    )


async def _admin_template_view(query, tpl_id: int):
    tpl = hwdb.get_template(tpl_id)
    if not tpl:
        await query.answer("Не найдено", show_alert=True)
        return
    text = f"📖 *{tpl['title']}* ({tpl['category']})\n\n{tpl['body']}"
    kb = InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("◀️ Библиотека", callback_data="adm_hw_library")],
            [InlineKeyboardButton("◀️ Материалы", callback_data="admin_materials")],
            [InlineKeyboardButton("◀️ Панель", callback_data="menu_admin")],
        ]
    )
    await bot_ui.edit_or_send(query, text, reply_markup=kb)


async def show_admin_client_profile(query, client_id: int, context: ContextTypes.DEFAULT_TYPE):
    hwdb.ensure_client(client_id)
    client = hwdb.get_client(client_id) or {}
    name = client.get("display_name") or f"id {client_id}"
    sessions = hwdb.total_sessions(client_id)
    auto = hwdb.count_sessions_auto(client_id)
    manual = client.get("sessions_manual") or 0

    phone = db.get_user_phone(client_id)
    lines = [
        f"👤 *{name}*",
        f"`{client_id}`",
    ]
    if phone:
        lines.append(f"📱 `{phone}`")
    lines.extend([
        "",
        f"📊 *Сессий:* {sessions}",
        f"   └ в боте: {auto}",
    ])
    if manual:
        lines.append(f"   └ вручную: +{manual}")

    last_b = hwdb.get_last_booking(client_id)
    if last_b:
        mode = db.visit_type_label(last_b.get("visit_type") or "in_person")
        lines.append(
            f"   └ последняя: {ui_text.format_date_iso(last_b['book_date'])} "
            f"{last_b['book_time']} ({mode})"
        )
    next_b = hwdb.get_next_booking(client_id)
    if next_b:
        mode = db.visit_type_label(next_b.get("visit_type") or "in_person")
        lines.append(
            f"   └ следующая: {ui_text.format_date_iso(next_b['book_date'])} "
            f"{next_b['book_time']} ({mode})"
        )

    latest = hwdb.get_latest_homework(client_id)
    lines.append("")
    lines.append("📝 *Текущее ДЗ*")
    if latest:
        sent = latest["sent_at"][:10]
        titles = ", ".join(i["title"] for i in latest.get("items", [])[:3])
        read = "✅ прочитано" if latest.get("read_at") else "🆕 не прочитано"
        lines.append(f"   {sent}: {titles}")
        lines.append(f"   {read}")
    else:
        lines.append("   ещё не отправлялось")

    note = (client.get("admin_note") or "").strip()
    if note:
        lines.extend(["", "🗒 *Заметка:*", note[:400]])

    rows = [
        [
            InlineKeyboardButton("➕ Новое ДЗ", callback_data=f"adm_hw_new_{client_id}"),
            lit_handlers.profile_literature_button(client_id),
        ],
        [
            InlineKeyboardButton(
                "📋 История ДЗ", callback_data=f"adm_hw_hist_{client_id}"
            ),
            InlineKeyboardButton(
                "➕1 сессия", callback_data=f"adm_sess_plus_{client_id}"
            ),
        ],
        [
            InlineKeyboardButton(
                "✏️ Заметка", callback_data=f"adm_note_edit_{client_id}"
            ),
            InlineKeyboardButton(
                "💬 Написать", callback_data=f"adm_msg_{client_id}"
            ),
        ],
    ]

    cancel_bid = context.user_data.get("adm_active_booking")
    if cancel_bid:
        booking = db.get_booking_by_id(cancel_bid)
        if not booking or booking["user_id"] != client_id:
            cancel_bid = None
            context.user_data.pop("adm_active_booking", None)
    if not cancel_bid and next_b:
        cancel_bid = next_b["id"]
    if cancel_bid:
        rows.append(
            [
                InlineKeyboardButton(
                    "❌ Отменить запись",
                    callback_data=f"adm_cancel_ask_{cancel_bid}",
                )
            ]
        )

    back = context.user_data.get("adm_nav_back", "menu_admin")
    rows.append([adm_cal.back_button(back)])
    rows.append([InlineKeyboardButton("◀️ Панель", callback_data="menu_admin")])

    await safe_edit_message_text(query,
        "\n".join(lines),
        reply_markup=InlineKeyboardMarkup(rows),
        parse_mode="Markdown",
    )


async def _admin_hw_history(query, client_id: int):
    history = hwdb.list_homework_history(client_id, 8)
    name = (hwdb.get_client(client_id) or {}).get("display_name") or str(client_id)
    if not history:
        text = f"📚 *История ДЗ — {name}*\n\nПусто."
    else:
        lines = [f"📚 *История ДЗ — {name}*\n"]
        for hw in history:
            sent = hw["sent_at"][:10]
            titles = ", ".join(i["title"] for i in hw.get("items", []))
            read = "✓" if hw.get("read_at") else "·"
            lines.append(f"{read} {sent}: {titles}")
        text = "\n".join(lines)
    kb = InlineKeyboardMarkup(
        [[InlineKeyboardButton("◀️ Профиль", callback_data=f"adm_profile_{client_id}")]]
    )
    await bot_ui.edit_or_send(query, text, reply_markup=kb)


async def _admin_pick_templates(query, context, client_id: int):
    templates = hwdb.list_templates()
    selected = _get_selected(context, client_id)
    name = (hwdb.get_client(client_id) or {}).get("display_name") or str(client_id)
    lines = [
        f"➕ *Новое ДЗ для {name}*",
        "",
        "_Шаг 1: отметьте задания из пула_",
        "",
    ]
    buttons = []
    for t in templates:
        mark = "✅" if t["id"] in selected else "⬜"
        buttons.append(
            [
                InlineKeyboardButton(
                    f"{mark} {t['title']}",
                    callback_data=f"adm_hw_toggle_{t['id']}_{client_id}",
                )
            ]
        )
    buttons.append(
        [InlineKeyboardButton("Далее →", callback_data=f"adm_hw_preview_{client_id}")]
    )
    buttons.append(
        [InlineKeyboardButton("◀️ Профиль", callback_data=f"adm_hw_back_profile_{client_id}")]
    )
    await safe_edit_message_text(query,
        "\n".join(lines),
        reply_markup=InlineKeyboardMarkup(buttons),
        parse_mode="Markdown",
    )


async def _admin_preview(query, context, client_id: int):
    selected = _get_selected(context, client_id)
    items = []
    for tpl_id in sorted(selected):
        tpl = hwdb.get_template(tpl_id)
        if tpl:
            items.append(
                {
                    "template_id": tpl_id,
                    "title": tpl["title"],
                    "body": tpl["body"],
                }
            )
    assistant = getattr(config, "ASSISTANT_NAME", "Помощник")
    preview = hwdb.format_homework_message(DEFAULT_INTRO, items, assistant)
    name = (hwdb.get_client(client_id) or {}).get("display_name") or str(client_id)
    header = f"*Предпросмотр для {name}*\n\n"
    if len(preview) > 3500:
        preview = preview[:3490] + "\n…"
    kb = InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton(
                    "📤 Отправить", callback_data=f"adm_hw_confirm_{client_id}"
                )
            ],
            [
                InlineKeyboardButton(
                    "◀️ Выбор", callback_data=f"adm_hw_new_{client_id}"
                )
            ],
        ]
    )
    await safe_edit_message_text(query,
        header + preview, reply_markup=kb, parse_mode="Markdown"
    )


async def _admin_send_homework(query, context, client_id: int, admin_id: int):
    selected = _get_selected(context, client_id)
    if not selected:
        await query.answer("Ничего не выбрано", show_alert=True)
        return
    items = []
    for tpl_id in sorted(selected):
        tpl = hwdb.get_template(tpl_id)
        if tpl:
            items.append(
                {
                    "template_id": tpl_id,
                    "title": tpl["title"],
                    "body": tpl["body"],
                }
            )
    booking_id = context.user_data.get(f"hw_booking_{client_id}")
    hw_id = hwdb.create_homework(
        client_id, admin_id, DEFAULT_INTRO, items, booking_id=booking_id
    )
    hw = hwdb.get_homework(hw_id)
    assistant = getattr(config, "ASSISTANT_NAME", "Помощник")
    titles = ", ".join(i["title"] for i in items[:3])
    notify = (
        f"📝 *{assistant}* назначил(а) домашнее задание:\n"
        f"_{titles}_\n\n"
        "Откройте «Домашнее задание» в меню бота."
    )
    try:
        await context.bot.send_message(client_id, notify, parse_mode="Markdown")
    except Exception as e:
        logger.warning("Не отправлено клиенту %s: %s", client_id, e)
        await safe_edit_message_text(query,
            f"❌ Не удалось уведомить в Telegram: {e}\n"
            "ДЗ сохранено — клиент может открыть в «Домашнее задание».",
            parse_mode="Markdown",
        )
        return
    _clear_hw_flow(context, client_id)
    name = (hwdb.get_client(client_id) or {}).get("display_name") or str(client_id)
    started = hwdb.list_active_programs(client_id)
    extra = ""
    if started:
        names = ", ".join(
            hph._program_title(p["program_type"]) for p in started
        )
        extra = (
            f"\n\n🌙 Запущены вечерние программы (6 дней): {names}.\n"
            "Напоминания — каждый вечер."
        )
    await safe_edit_message_text(query,
        f"✅ ДЗ отправлено: *{name}*\n\nКлиенту пришло сообщение от *{assistant}*.{extra}",
        reply_markup=InlineKeyboardMarkup(
            [[InlineKeyboardButton("◀️ Профиль", callback_data=f"adm_profile_{client_id}")]]
        ),
        parse_mode="Markdown",
    )


def today_clients_keyboard(bookings: list) -> InlineKeyboardMarkup:
    """Кнопки профилей для списка записей на сегодня."""
    rows = []
    for b in bookings:
        name = b.get("user_name") or str(b["user_id"])
        mode = db.visit_type_label(b.get("visit_type") or "in_person")
        label = f"👤 {b['book_time']} {name} ({mode})"
        rows.append(
            [
                InlineKeyboardButton(
                    label, callback_data=f"adm_profile_{b['user_id']}"
                )
            ]
        )
    rows.append(
        [
            InlineKeyboardButton("📋 Сегодня", callback_data="admin_today"),
            InlineKeyboardButton("◀️ Панель", callback_data="menu_admin"),
        ]
    )
    return InlineKeyboardMarkup(rows)


async def enrich_today_bookings(bookings: list) -> None:
    for b in bookings:
        hwdb.ensure_client(b["user_id"], b.get("user_name"))
