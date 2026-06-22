#!/usr/bin/env python3
"""Бот записи на приём — локальный запуск."""
import logging
import os
import re
from pathlib import Path

import fcntl
from telegram import BotCommand, BotCommandScopeChat, MenuButtonCommands
from telegram.error import BadRequest, NetworkError, TimedOut
from telegram.ext import Application, ContextTypes
from telegram.request import HTTPXRequest
from telegram.ext import (
    CommandHandler,
    CallbackQueryHandler,
    MessageHandler,
    filters,
)
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from zoneinfo import ZoneInfo

import config
import db
from handlers import (
    cmd_start,
    cmd_menu,
    cmd_admin,
    cmd_today,
    cmd_schedule,
    on_callback,
    on_document,
    on_client_message,
)
from reminders import (
    morning_admin_digest,
    morning_patient_reminders,
    morning_homework_digest,
    evening_confirm_requests,
    evening_homework_program_reminders,
)

logger = logging.getLogger(__name__)

_LOCK_PATH = Path(__file__).resolve().parent / ".botzap.lock"
_lock_fp = None


def _acquire_singleton_lock() -> None:
    global _lock_fp
    _lock_fp = open(_LOCK_PATH, "w")
    try:
        fcntl.flock(_lock_fp.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit(
            "Уже запущен другой экземпляр botzap (файл .botzap.lock). "
            "Остановите лишние процессы: ~/botzap/scripts/start_bots.sh"
        )
    _lock_fp.write(str(os.getpid()))
    _lock_fp.flush()

class RedactSecretsFilter(logging.Filter):
    """Маскирует токен бота и bot-token URL в логах."""

    def __init__(self, token: str = ""):
        super().__init__()
        self.token = token or ""
        self.bot_url_re = re.compile(r"/bot\d+:[A-Za-z0-9_-]+")

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
            if self.token:
                msg = msg.replace(self.token, "***REDACTED***")
            msg = self.bot_url_re.sub("/bot***REDACTED***", msg)
            record.msg = msg
            record.args = ()
        except Exception:
            pass
        return True


def _configure_logging(token: str = "") -> None:
    logging.basicConfig(
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        level=logging.INFO,
    )
    secret_filter = RedactSecretsFilter(token)
    for name in ("httpx", "httpcore", "telegram", "apscheduler"):
        log = logging.getLogger(name)
        log.addFilter(secret_filter)
    root = logging.getLogger()
    root.addFilter(secret_filter)


def main():
    if not config.BOT_TOKEN:
        raise SystemExit("Задайте BOT_TOKEN в файле .env")

    _acquire_singleton_lock()
    _configure_logging(config.BOT_TOKEN)
    import db_conn

    db_conn.ensure_encrypted_database()
    db.init_db()
    import user_prefs

    user_prefs.migrate_user_profile_columns()
    user_prefs.init_declines_table()
    import homework_db
    homework_db.init_homework_tables()
    import literature_db
    literature_db.init_literature_tables()

    tz = ZoneInfo(config.TZ)
    scheduler = AsyncIOScheduler(timezone=tz)

    async def post_init(application: Application):
        client_commands = [
            BotCommand("start", "Запустить бота"),
            BotCommand("menu", "Главное меню"),
        ]
        admin_commands = client_commands + [
            BotCommand("admin", "Управление расписанием"),
        ]
        try:
            await application.bot.set_my_commands(client_commands)
            for admin_id in config.ADMIN_USER_IDS:
                await application.bot.set_my_commands(
                    admin_commands,
                    scope=BotCommandScopeChat(chat_id=admin_id),
                )
            await application.bot.set_chat_menu_button(
                menu_button=MenuButtonCommands()
            )
        except (NetworkError, TimedOut) as e:
            logger.warning(
                "Меню команд Telegram не обновлено (сеть/VPN): %s", e
            )
        scheduler.start()
        logger.info("Планировщик напоминаний (%s)", config.TZ)
        logger.info("Команды: /start, /menu; админ: /admin")

    request = HTTPXRequest(
        connect_timeout=config.CONNECT_TIMEOUT,
        read_timeout=config.READ_TIMEOUT,
        write_timeout=config.READ_TIMEOUT,
        proxy=config.TELEGRAM_PROXY,
        connection_pool_size=config.TELEGRAM_POOL_SIZE,
        pool_timeout=config.TELEGRAM_POOL_TIMEOUT,
    )
    updates_request = HTTPXRequest(
        connect_timeout=config.CONNECT_TIMEOUT,
        read_timeout=config.GET_UPDATES_READ_TIMEOUT,
        write_timeout=config.READ_TIMEOUT,
        proxy=config.TELEGRAM_PROXY,
        connection_pool_size=1,
    )
    if config.TELEGRAM_PROXY:
        logger.info(
            "Прокси Telegram: %s (pool=%s, pool_timeout=%ss)",
            config.TELEGRAM_PROXY,
            config.TELEGRAM_POOL_SIZE,
            config.TELEGRAM_POOL_TIMEOUT,
        )

    app = (
        Application.builder()
        .token(config.BOT_TOKEN)
        .request(request)
        .get_updates_request(updates_request)
        .concurrent_updates(1)
        .post_init(post_init)
        .build()
    )
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("menu", cmd_menu))
    app.add_handler(CommandHandler("admin", cmd_admin))
    app.add_handler(CommandHandler("today", cmd_today))
    app.add_handler(CommandHandler("schedule", cmd_schedule))
    app.add_handler(CallbackQueryHandler(on_callback))
    app.add_handler(MessageHandler(filters.Document.ALL, on_document))
    app.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, on_client_message)
    )
    app.add_handler(MessageHandler(filters.CONTACT, on_client_message))

    async def on_error(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
        err = context.error
        if isinstance(err, BadRequest):
            msg = str(err).lower()
            if (
                "query is too old" in msg
                or "message is not modified" in msg
                or "no text" in msg
                or "message to edit not found" in msg
            ):
                logger.debug("Telegram BadRequest (ignored): %s", err)
                return
        if isinstance(err, (NetworkError, TimedOut)):
            logger.warning("Telegram network (ignored): %s", err)
            return
        logger.exception("Необработанная ошибка", exc_info=err)

    app.add_error_handler(on_error)

    scheduler.add_job(
        morning_admin_digest,
        CronTrigger(hour=config.MORNING_HOUR, minute=config.MORNING_MINUTE, timezone=tz),
        args=[app],
        id="admin_morning",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        morning_homework_digest,
        CronTrigger(hour=config.MORNING_HOUR, minute=config.MORNING_MINUTE, timezone=tz),
        args=[app],
        id="patient_morning_hw",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        morning_patient_reminders,
        CronTrigger(hour=config.MORNING_HOUR, minute=config.MORNING_MINUTE, timezone=tz),
        args=[app],
        id="patient_morning",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        evening_confirm_requests,
        CronTrigger(
            hour=config.EVENING_CONFIRM_HOUR,
            minute=config.EVENING_CONFIRM_MINUTE,
            timezone=tz,
        ),
        args=[app],
        id="evening_confirm",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        evening_homework_program_reminders,
        CronTrigger(minute="*/15", timezone=tz),
        args=[app],
        id="evening_homework_programs",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    logger.info("Бот запущен")
    app.run_polling(allowed_updates=["message", "callback_query"])


if __name__ == "__main__":
    main()
