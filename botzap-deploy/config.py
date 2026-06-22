import os
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
# Прокси для Telegram (gluetun HTTP на сервере): http://127.0.0.1:10808
TELEGRAM_PROXY = os.getenv("TELEGRAM_PROXY", "").strip() or None
CONNECT_TIMEOUT = float(os.getenv("CONNECT_TIMEOUT", "60"))
READ_TIMEOUT = float(os.getenv("READ_TIMEOUT", "60"))
# getUpdates — long poll; через VPN нужен запас больше poll timeout (10 с)
GET_UPDATES_READ_TIMEOUT = float(os.getenv("GET_UPDATES_READ_TIMEOUT", "90"))
# httpx: по умолчанию pool=1 — при VPN и кнопках «Pool timeout»
TELEGRAM_POOL_SIZE = int(os.getenv("TELEGRAM_POOL_SIZE", "32"))
TELEGRAM_POOL_TIMEOUT = float(os.getenv("TELEGRAM_POOL_TIMEOUT", "30"))
# Часовой пояс кабинета (расписание Excel, Google Calendar, админка)
ADMIN_TZ = os.getenv("ADMIN_TZ", "Asia/Yekaterinburg").strip()
TZ = os.getenv("TZ", ADMIN_TZ).strip() or ADMIN_TZ
SLOT_MINUTES = int(os.getenv("SLOT_MINUTES", "30"))
MORNING_HOUR = int(os.getenv("MORNING_HOUR", "8"))
MORNING_MINUTE = int(os.getenv("MORNING_MINUTE", "0"))
EVENING_CONFIRM_HOUR = int(os.getenv("EVENING_CONFIRM_HOUR", "18"))
EVENING_CONFIRM_MINUTE = int(os.getenv("EVENING_CONFIRM_MINUTE", "0"))
# Вечерние напоминания по 6-дневным ДЗ (дневник эмоций, тревожные мысли)
HOMEWORK_PROGRAM_DAYS = int(os.getenv("HOMEWORK_PROGRAM_DAYS", "6"))
HOMEWORK_EVENING_HOUR = int(os.getenv("HOMEWORK_EVENING_HOUR", str(EVENING_CONFIRM_HOUR)))
HOMEWORK_EVENING_MINUTE = int(
    os.getenv("HOMEWORK_EVENING_MINUTE", str(EVENING_CONFIRM_MINUTE))
)


def _parse_admin_ids() -> set[int]:
    raw = os.getenv("ADMIN_USER_IDS", "").strip()
    ids: set[int] = set()
    for part in raw.split(","):
        part = part.strip()
        if part.isdigit():
            ids.add(int(part))
    return ids


ADMIN_USER_IDS = _parse_admin_ids()
ASSISTANT_NAME = os.getenv("ASSISTANT_NAME", "Помощник").strip() or "Помощник"
DIARY_BOT_USERNAME = os.getenv("DIARY_BOT_USERNAME", "TDCBT_bot").strip().lstrip("@")

MIN_BOOKING_HOURS = int(os.getenv("MIN_BOOKING_HOURS", "5"))
SELF_BOOKING_HOURS = int(os.getenv("SELF_BOOKING_HOURS", "6"))
# Очные «большие» дни (≥ N слотов): волновая запись для клиентов
IN_PERSON_WAVE_MIN_SLOTS = int(os.getenv("IN_PERSON_WAVE_MIN_SLOTS", "5"))

# Шифрование appointments.db (только botzap; не путать с DB_ENCRYPTION_KEY бота дневника)
BOTZAP_DB_ENCRYPTION_KEY = os.getenv("BOTZAP_DB_ENCRYPTION_KEY", "").strip()

# Google Calendar (бот → Google)
GOOGLE_CALENDAR_ENABLED = os.getenv("GOOGLE_CALENDAR_ENABLED", "0").strip() in (
    "1",
    "true",
    "yes",
)
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
GOOGLE_REFRESH_TOKEN = os.getenv("GOOGLE_REFRESH_TOKEN", "").strip()
GOOGLE_CALENDAR_ID = os.getenv("GOOGLE_CALENDAR_ID", "primary").strip() or "primary"
GOOGLE_EVENT_MINUTES = int(os.getenv("GOOGLE_EVENT_MINUTES", "60"))

IN_PERSON_CONTACT_PHONE = os.getenv(
    "IN_PERSON_CONTACT_PHONE", "8-906-840-07-12"
).strip()
