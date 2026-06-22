"""Рекомендуемая литература: админ отправляет, клиент читает."""
from __future__ import annotations

import logging
from datetime import date
from pathlib import Path

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

import config
import db
import homework_db as hwdb
import literature_db as litdb
import ui_text
from telegram_util import safe_edit_message_text

logger = logging.getLogger(__name__)


def is_admin(user_id: int) -> bool:
    return user_id in config.ADMIN_USER_IDS


def is_literature_callback(data: str) -> bool:
    return data.startswith(("lit_", "adm_lit_"))


async def on_literature_callback(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> bool:
    query = update.callback_query
    data = query.data
    if not is_literature_callback(data):
        return False

    await query.answer()
    uid = query.from_user.id

    if data == "lit_my_list":
        await _client_list(query, uid)
        return True

    if data.startswith("lit_view_"):
        sent_id = int(data.replace("lit_view_", ""))
        await _client_view(query, uid, sent_id)
        return True

    if data.startswith("lit_forgot_"):
        sent_id = int(data.replace("lit_forgot_", ""))
        await _client_forgot_reminder(query, uid, sent_id)
        return True

    if not is_admin(uid):
        return True

    if data == "adm_lit_library":
        await _admin_library(query)
        return True

    if data.startswith("adm_lit_book_"):
        book_id = int(data.replace("adm_lit_book_", ""))
        await _admin_book_view(query, book_id)
        return True

    if data.startswith("adm_lit_pick_"):
        client_id = int(data.replace("adm_lit_pick_", ""))
        await _admin_pick_book(query, client_id)
        return True

    if data.startswith("adm_lit_send_"):
        # adm_lit_send_{book_id}_{client_id}
        parts = data.split("_")
        book_id = int(parts[3])
        client_id = int(parts[4])
        await _admin_send_book(query, context, book_id, client_id, uid)
        return True

    return True


def _book_client_keyboard(
    sent_id: int | None = None, *, include_forgot: bool = False
) -> InlineKeyboardMarkup:
    rows = []
    if include_forgot and sent_id is not None:
        rows.append([
            InlineKeyboardButton(
                "🔔 Забыл(а) про это",
                callback_data=f"lit_forgot_{sent_id}",
            )
        ])
    rows.append([
        InlineKeyboardButton("📝 Домашнее задание", callback_data="hw_my_list"),
    ])
    rows.append([
        InlineKeyboardButton("🏠 Главное меню", callback_data="menu_main"),
    ])
    return InlineKeyboardMarkup(rows)


async def _push_book_photo(
    bot,
    chat_id: int,
    book: dict,
    *,
    sent_id: int | None = None,
    header: str = "📚 *Рекомендуемая литература*",
    include_forgot: bool = False,
) -> bool:
    path = litdb.image_path(book["image_file"])
    if not path.is_file():
        return False
    assistant = getattr(config, "ASSISTANT_NAME", "Помощник")
    caption = litdb.format_book_caption(book, header=header)
    caption += f"\n\n_Рекомендация от {assistant}_"
    await bot.send_photo(
        chat_id=chat_id,
        photo=str(path),
        caption=caption,
        reply_markup=_book_client_keyboard(sent_id, include_forgot=include_forgot),
        parse_mode="Markdown",
    )
    return True


    await safe_edit_message_text(query,
        "📚 Книги — в разделе «Домашнее задание».",
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("📝 Домашнее задание", callback_data="hw_my_list")],
            [InlineKeyboardButton("🏠 Главное меню", callback_data="menu_main")],
        ]),
    )


async def _client_view(query, uid: int, sent_id: int):
    item = litdb.get_sent(sent_id, uid)
    if not item:
        await query.answer("Не найдено", show_alert=True)
        return
    litdb.mark_read(sent_id, uid)
    path = litdb.image_path(item["image_file"])
    if not path.is_file():
        await safe_edit_message_text(query,
            "Обложка не найдена на сервере. Сообщите администратору.",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("◀️ Назад", callback_data="hw_my_list")]]
            ),
        )
        return
    book = {
        "title": item["title"],
        "subtitle": item.get("subtitle") or "",
        "authors": item["authors"],
    }
    caption = litdb.format_book_caption(book)
    assistant = getattr(config, "ASSISTANT_NAME", "Помощник")
    caption += f"\n\n_Рекомендация от {assistant}_"
    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("◀️ К списку", callback_data="hw_my_list")],
        [InlineKeyboardButton("🏠 Главное меню", callback_data="menu_main")],
    ])
    await query.message.delete()
    await query.message.chat.send_photo(
        photo=str(path),
        caption=caption,
        reply_markup=kb,
        parse_mode="Markdown",
    )


async def _admin_library(query):
    books = litdb.list_catalog()
    lines = ["📚 *Библиотека — рекомендуемая литература*\n"]
    buttons = []
    for b in books:
        lines.append(f"• *{b['title']}* — {b['authors']}")
        buttons.append(
            [
                InlineKeyboardButton(
                    f"📖 {b['title'][:28]}",
                    callback_data=f"adm_lit_book_{b['id']}",
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


async def _admin_book_view(query, book_id: int):
    book = litdb.get_book(book_id)
    if not book:
        await query.answer("Не найдено", show_alert=True)
        return
    path = litdb.image_path(book["image_file"])
    if not path.is_file():
        await safe_edit_message_text(query,
            f"Файл обложки не найден: `{book['image_file']}`",
            parse_mode="Markdown",
        )
        return
    caption = litdb.format_book_caption(book, header="📚 *Книга в каталоге*")
    kb = InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("◀️ Каталог", callback_data="adm_lit_library")],
            [InlineKeyboardButton("◀️ Материалы", callback_data="admin_materials")],
            [InlineKeyboardButton("◀️ Панель", callback_data="menu_admin")],
        ]
    )
    await query.message.delete()
    await query.message.chat.send_photo(
        photo=str(path),
        caption=caption,
        reply_markup=kb,
        parse_mode="Markdown",
    )


async def _admin_pick_book(query, client_id: int):
    hwdb.ensure_client(client_id)
    name = (hwdb.get_client(client_id) or {}).get("display_name") or str(client_id)
    books = litdb.list_catalog()
    lines = [
        f"📚 *Литература для {name}*",
        "",
        "Выберите книгу для отправки:",
    ]
    buttons = []
    for b in books:
        buttons.append(
            [
                InlineKeyboardButton(
                    f"📤 {b['title'][:30]}",
                    callback_data=f"adm_lit_send_{b['id']}_{client_id}",
                )
            ]
        )
    buttons.append(
        [InlineKeyboardButton("◀️ Профиль", callback_data=f"adm_profile_{client_id}")]
    )
    await safe_edit_message_text(query,
        "\n".join(lines),
        reply_markup=InlineKeyboardMarkup(buttons),
        parse_mode="Markdown",
    )


async def _client_forgot_reminder(query, uid: int, sent_id: int):
    item = litdb.get_sent(sent_id, uid)
    if not item:
        await query.answer("Не найдено", show_alert=True)
        return
    path = litdb.image_path(item["image_file"])
    if not path.is_file():
        await query.answer("Обложка не найдена", show_alert=True)
        return
    book = {
        "title": item["title"],
        "subtitle": item.get("subtitle") or "",
        "authors": item["authors"],
    }
    assistant = getattr(config, "ASSISTANT_NAME", "Помощник")
    caption = (
        litdb.format_book_caption(book, header="📚 *Напоминание о книге*")
        + f"\n\n_Рекомендация от {assistant}_"
    )
    await query.message.chat.send_photo(
        photo=str(path),
        caption=caption,
        reply_markup=_book_client_keyboard(sent_id, include_forgot=True),
        parse_mode="Markdown",
    )
    await query.answer("Напоминание отправлено")


async def _admin_send_book(
    query, context, book_id: int, client_id: int, admin_id: int
):
    book = litdb.get_book(book_id)
    if not book:
        await query.answer("Книга не найдена", show_alert=True)
        return
    path = litdb.image_path(book["image_file"])
    if not path.is_file():
        await query.answer("Нет файла обложки на сервере", show_alert=True)
        return

    sent_id = litdb.create_sent(client_id, admin_id, book)
    name = (hwdb.get_client(client_id) or {}).get("display_name") or str(client_id)
    assistant = getattr(config, "ASSISTANT_NAME", "Помощник")
    await safe_edit_message_text(query,
        f"✅ Книга *{book['title']}* отправлена {name}.\n\n"
        f"Клиент получит обложку и описание в чат.",
        reply_markup=InlineKeyboardMarkup(
            [
                [
                    InlineKeyboardButton(
                        "📚 Ещё книгу", callback_data=f"adm_lit_pick_{client_id}"
                    )
                ],
                [
                    InlineKeyboardButton(
                        "◀️ Профиль", callback_data=f"adm_profile_{client_id}"
                    )
                ],
            ]
        ),
        parse_mode="Markdown",
    )
    try:
        ok = await _push_book_photo(
            context.bot,
            client_id,
            book,
            sent_id=sent_id,
            header=f"📚 *{assistant} рекомендует книгу*",
            include_forgot=True,
        )
        if not ok:
            await context.bot.send_message(
                client_id,
                f"📚 *{assistant}* рекомендует книгу:\n*{book['title']}*\n\n"
                "Откройте «Домашнее задание» в меню бота.",
                parse_mode="Markdown",
            )
    except Exception as e:
        logger.warning("Уведомление о книге клиенту %s: %s", client_id, e)


def profile_literature_button(client_id: int) -> InlineKeyboardButton:
    return InlineKeyboardButton(
        "📚 Отправить литературу",
        callback_data=f"adm_lit_pick_{client_id}",
    )
