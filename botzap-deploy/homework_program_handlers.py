"""Вечерние 6-дневные ДЗ: напоминания, ввод записей клиентом."""
from __future__ import annotations

import logging
import re
from datetime import date

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

import homework_db as hwdb
import homework_programs as hp
import bot_ui

logger = logging.getLogger(__name__)

AWAIT_PE = "hw_pe_wizard"
AWAIT_AX = "hw_ax_wizard"


def is_program_callback(data: str) -> bool:
    return data.startswith(
        (
            "hw_prog_fill_",
            "hw_ax_done_",
            "hw_ax_add_",
            "hw_pe_abort_",
            "hw_pe_start_",
        )
    )


def _program_title(program_type: str) -> str:
    if program_type == hp.PROGRAM_POSITIVE_EMOTIONS:
        return hp.TITLE_POSITIVE
    return hp.TITLE_ANXIETY


def _hub_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("📝 Домашнее задание", callback_data="hw_my_list")],
        [InlineKeyboardButton("🏠 Главное меню", callback_data="menu_main")],
    ])


async def on_program_callback(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> bool:
    query = update.callback_query
    data = query.data or ""
    if not is_program_callback(data):
        return False

    uid = query.from_user.id

    if data.startswith("hw_pe_abort_"):
        await query.answer()
        context.user_data.pop(AWAIT_PE, None)
        context.user_data.pop(AWAIT_AX, None)
        await bot_ui.edit_or_send(
            query,
            "Заполнение отменено. Продолжить можно в «Домашнее задание».",
            reply_markup=_hub_kb(),
        )
        return True

    if data.startswith("hw_pe_start_"):
        pid = int(data.replace("hw_pe_start_", ""))
        prog = hwdb.get_program(pid, uid)
        if not prog or prog["status"] != "active":
            await query.answer("Задание недоступно", show_alert=True)
            return True
        day_idx = hp.day_index_for_program(prog["start_date"])
        if not day_idx:
            await query.answer("Программа не активна", show_alert=True)
            return True
        entry = hwdb.get_program_entry(pid, day_idx)
        if entry and entry.get("submitted_at"):
            payload = entry.get("payload") or {}
            if prog["program_type"] == hp.PROGRAM_POSITIVE_EMOTIONS:
                await query.answer("Уже выполнено на сегодня", show_alert=True)
                return True
        await query.answer()
        if prog["program_type"] == hp.PROGRAM_POSITIVE_EMOTIONS:
            await _start_positive_wizard(query, context, prog, day_idx)
        else:
            await _start_anxiety_wizard(query, context, prog, day_idx)
        return True

    if data.startswith("hw_ax_add_"):
        pid = int(data.replace("hw_ax_add_", ""))
        prog = hwdb.get_program(pid, uid)
        if not prog or prog["status"] != "active":
            await query.answer("Недоступно", show_alert=True)
            return True
        day_idx = hp.day_index_for_program(prog["start_date"]) or 1
        await query.answer()
        await _start_anxiety_wizard(query, context, prog, day_idx)
        return True

    if data.startswith("hw_ax_done_"):
        pid = int(data.replace("hw_ax_done_", ""))
        await query.answer()
        await _finish_anxiety_day(query, context, uid, pid)
        return True

    if data.startswith("hw_prog_fill_"):
        pid = int(data.replace("hw_prog_fill_", ""))
        query.data = f"hw_pe_start_{pid}"
        return await on_program_callback(update, context)

    return False


async def _start_positive_wizard(
    query, context: ContextTypes.DEFAULT_TYPE, prog: dict, day_idx: int
):
    context.user_data.pop(AWAIT_AX, None)
    context.user_data[AWAIT_PE] = {
        "program_id": prog["id"],
        "day_index": day_idx,
        "index": 1,
        "phase": "event",
        "events": [],
    }
    total = prog["days_total"]
    title = _program_title(prog["program_type"])
    await bot_ui.edit_or_send(
        query,
        f"🌟 *{title}*\n"
        f"_День {day_idx} из {total}_\n\n"
        f"*Шаг 1 из {hp.POSITIVE_EVENTS_COUNT}*\n"
        "Кратко: что произошло или что вы заметили?\n\n"
        "_Пример: «Утренний кофе на балконе»_",
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("✖️ Отмена", callback_data="hw_pe_abort_0")],
        ]),
    )


async def _start_anxiety_wizard(
    query, context: ContextTypes.DEFAULT_TYPE, prog: dict, day_idx: int
):
    context.user_data.pop(AWAIT_PE, None)
    context.user_data[AWAIT_AX] = {
        "program_id": prog["id"],
        "day_index": day_idx,
        "phase": "situation",
        "draft": {},
    }
    total = prog["days_total"]
    title = _program_title(prog["program_type"])
    n = len(hwdb.anxiety_entries_today(prog["id"], day_idx))
    extra = f"\n\nЗаписей сегодня: *{n}*" if n else ""
    await bot_ui.edit_or_send(
        query,
        f"📝 *{title}*\n"
        f"_День {day_idx} из {total}_\n\n"
        "*Шаг 1 из 3 — Ситуация*\n"
        "Что происходило? Опишите факты, без оценок.\n\n"
        f"_Пример: «Перед важной встречей»_{extra}",
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("✖️ Отмена", callback_data="hw_pe_abort_0")],
        ]),
    )


async def _finish_anxiety_day(
    query, context: ContextTypes.DEFAULT_TYPE, uid: int, program_id: int
):
    prog = hwdb.get_program(program_id, uid)
    if not prog:
        return
    day_idx = hp.day_index_for_program(prog["start_date"]) or 1
    context.user_data.pop(AWAIT_AX, None)
    entries = hwdb.anxiety_entries_today(program_id, day_idx)
    if not entries:
        await bot_ui.edit_or_send(
            query,
            "Пока нет записей. Добавьте хотя бы одну мысль.",
            reply_markup=InlineKeyboardMarkup([
                [
                    InlineKeyboardButton(
                        "➕ Добавить запись",
                        callback_data=f"hw_ax_add_{program_id}",
                    )
                ],
                [
                    InlineKeyboardButton(
                        "◀️ К заданию",
                        callback_data=f"hw_prog_view_{program_id}",
                    )
                ],
            ]),
        )
        return
    today = date.today().isoformat()
    hwdb.save_program_entry(
        program_id,
        day_idx,
        today,
        {"entries": entries},
    )
    n = len(entries)
    await bot_ui.edit_or_send(
        query,
        f"✅ *День {day_idx} завершён*\n\n"
        f"Записей: *{n}*. Завтра утром придёт напоминание.",
        reply_markup=_hub_kb(),
    )


def _parse_intensity(text: str) -> tuple[str, int | None]:
    m = re.search(r"(\d{1,2})", text)
    if m:
        val = int(m.group(1))
        if 0 <= val <= 10:
            emo = re.sub(r"\d{1,2}", "", text).strip(" -–—,")
            return emo or text, val
    return text, None


async def _save_positive_and_confirm(
    target, context: ContextTypes.DEFAULT_TYPE, uid: int, st: dict
):
    events = st.get("events") or []
    pid = st["program_id"]
    day_idx = st["day_index"]
    today = date.today().isoformat()
    hwdb.save_program_entry(pid, day_idx, today, {"events": events})
    context.user_data.pop(AWAIT_PE, None)
    lines = [
        f"✅ *День {day_idx} выполнен*",
        "",
        f"Записано *{len(events)}* приятных моментов:",
    ]
    for i, ev in enumerate(events, 1):
        t = (ev.get("title") or "").strip()
        d = (ev.get("description") or "").strip()
        lines.append(f"{i}. *{t}* — {d}")
    lines.append("\nЗавтра утром пришлём ваш список.")
    text = "\n".join(lines)
    if hasattr(target, "edit_message_text"):
        await bot_ui.edit_or_send(target, text, reply_markup=_hub_kb())
    else:
        await target.reply_text(text, reply_markup=_hub_kb(), parse_mode="Markdown")


async def on_homework_message(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> bool:
    if not update.message or not update.message.text:
        return False
    text = update.message.text.strip()
    if not text:
        return False

    st_pe = context.user_data.get(AWAIT_PE)
    if st_pe:
        await _handle_positive_text(update, context, st_pe, text)
        return True

    st_ax = context.user_data.get(AWAIT_AX)
    if st_ax:
        await _handle_anxiety_text(update, context, st_ax, text)
        return True

    return False


async def _handle_positive_text(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    st: dict,
    text: str,
):
    idx = int(st["index"])
    phase = st["phase"]
    events: list = st.setdefault("events", [])

    if phase == "event":
        events.append({"title": text, "description": ""})
        st["phase"] = "desc"
        await update.message.reply_text(
            f"*{idx}/{hp.POSITIVE_EVENTS_COUNT} — описание*\n"
            "Что именно принесло приятные эмоции?",
            parse_mode="Markdown",
        )
        return

    if phase == "desc" and events:
        events[-1]["description"] = text
        if idx >= hp.POSITIVE_EVENTS_COUNT:
            await _save_positive_and_confirm(
                update.message, context, update.effective_user.id, st
            )
            return
        st["index"] = idx + 1
        st["phase"] = "event"
        await update.message.reply_text(
            f"*{idx + 1}/{hp.POSITIVE_EVENTS_COUNT} — момент*\n"
            "Кратко: что произошло или что заметили?",
            parse_mode="Markdown",
        )


async def _handle_anxiety_text(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    st: dict,
    text: str,
):
    phase = st.get("phase", "situation")
    draft = st.setdefault("draft", {})
    pid = st["program_id"]
    day_idx = st["day_index"]
    uid = update.effective_user.id

    if phase == "situation":
        draft["situation"] = text
        st["phase"] = "thought"
        await update.message.reply_text(
            "*Шаг 2 из 3 — Мысль*\n"
            "Какая мысль появилась в этой ситуации?",
            parse_mode="Markdown",
        )
        return

    if phase == "thought":
        draft["thought"] = text
        st["phase"] = "emotion"
        await update.message.reply_text(
            "*Шаг 3 из 3 — Эмоция*\n"
            "Название и интенсивность 0–10.\n"
            "_Пример: «Тревога 7» или «Страх 8»_",
            parse_mode="Markdown",
        )
        return

    if phase == "emotion":
        emotion, intensity = _parse_intensity(text)
        entry = {
            "situation": draft.get("situation", ""),
            "thought": draft.get("thought", ""),
            "emotion": emotion,
            "intensity": intensity,
        }
        today = date.today().isoformat()
        hwdb.append_anxiety_entry(pid, day_idx, today, entry)
        st["phase"] = "situation"
        st["draft"] = {}
        n = len(hwdb.anxiety_entries_today(pid, day_idx))
        await update.message.reply_text(
            f"✅ Запись сохранена. Всего сегодня: *{n}*.\n\n"
            "Можно добавить ещё или завершить день.",
            reply_markup=InlineKeyboardMarkup([
                [
                    InlineKeyboardButton(
                        "➕ Ещё запись",
                        callback_data=f"hw_ax_add_{pid}",
                    )
                ],
                [
                    InlineKeyboardButton(
                        "✅ Закончить на сегодня",
                        callback_data=f"hw_ax_done_{pid}",
                    )
                ],
                [
                    InlineKeyboardButton(
                        "📝 Домашнее задание",
                        callback_data="hw_my_list",
                    )
                ],
            ]),
            parse_mode="Markdown",
        )


def reminder_keyboard(program_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [
            InlineKeyboardButton(
                "▶️ Выполнить",
                callback_data=f"hw_pe_start_{program_id}",
            )
        ],
        [InlineKeyboardButton("📝 Домашнее задание", callback_data="hw_my_list")],
    ])


def format_evening_reminder(prog: dict) -> str:
    day_idx = prog["day_index"]
    total = prog["days_total"]
    title = _program_title(prog["program_type"])
    if prog["program_type"] == hp.PROGRAM_POSITIVE_EMOTIONS:
        task = (
            f"Запишите *{hp.POSITIVE_EVENTS_COUNT}* приятных моментов "
            "с описанием к каждому."
        )
    else:
        task = (
            "Добавьте записи: *ситуация → мысль → эмоция*. "
            "Сколько угодно за день."
        )
    return (
        f"🌙 *Вечернее задание*\n\n"
        f"*{title}*\n"
        f"День *{day_idx}* из *{total}*\n\n"
        f"{task}"
    )


def program_detail_text(prog: dict, uid: int) -> str:
    day_idx = prog.get("day_index") or hp.day_index_for_program(prog["start_date"])
    title = _program_title(prog["program_type"])
    entry = hwdb.get_program_entry(prog["id"], day_idx) if day_idx else None
    done = entry and entry.get("submitted_at")
    if prog["program_type"] == hp.PROGRAM_POSITIVE_EMOTIONS:
        body = hp.positive_emotions_body()
        action = "▶️ *Выполнить* — 5 приятных моментов за вечер."
        status = "✅ выполнено сегодня" if done else "⏳ ещё не выполнено"
    else:
        body = hp.anxiety_thoughts_body()
        n = len(hwdb.anxiety_entries_today(prog["id"], day_idx or 1))
        action = "➕ *Добавить запись* — ситуация, мысль, эмоция."
        status = f"✅ день завершён ({n} записей)" if done else f"⏳ записей сегодня: {n}"
    return (
        f"📝 *{title}*\n"
        f"_День {day_idx} из {prog['days_total']}_ · {status}\n\n"
        f"{body.split('📲')[0].strip()}\n\n"
        f"{action}"
    )


def program_detail_keyboard(prog: dict) -> InlineKeyboardMarkup:
    day_idx = prog.get("day_index") or hp.day_index_for_program(prog["start_date"])
    entry = hwdb.get_program_entry(prog["id"], day_idx) if day_idx else None
    done = entry and entry.get("submitted_at")
    rows = []
    if prog["program_type"] == hp.PROGRAM_POSITIVE_EMOTIONS:
        if not done:
            rows.append([
                InlineKeyboardButton(
                    "▶️ Выполнить",
                    callback_data=f"hw_pe_start_{prog['id']}",
                )
            ])
    else:
        rows.append([
            InlineKeyboardButton(
                "➕ Добавить запись",
                callback_data=f"hw_ax_add_{prog['id']}",
            )
        ])
        if not done:
            rows.append([
                InlineKeyboardButton(
                    "✅ Закончить на сегодня",
                    callback_data=f"hw_ax_done_{prog['id']}",
                )
            ])
    rows.append([
        InlineKeyboardButton(
            "🚫 Отказаться от задания",
            callback_data=f"hw_decline_{prog['id']}",
        )
    ])
    rows.append([InlineKeyboardButton("◀️ К списку", callback_data="hw_my_list")])
    rows.append([InlineKeyboardButton("🏠 Главное меню", callback_data="menu_main")])
    return InlineKeyboardMarkup(rows)
