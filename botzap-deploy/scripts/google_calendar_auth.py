#!/usr/bin/env python3
"""
Один раз: получить GOOGLE_REFRESH_TOKEN для .env

1. Google Cloud Console → APIs → включить Google Calendar API
2. Credentials → OAuth client ID → Desktop app → скачать JSON
3. Сохранить как credentials.json в папке botzap (рядом с main.py)
4. Запустить: python scripts/google_calendar_auth.py
5. Скопировать вывод в .env на сервере
"""
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/calendar.events"]
ROOT = Path(__file__).resolve().parent.parent
CREDS = ROOT / "credentials.json"


def main():
    if not CREDS.exists():
        raise SystemExit(
            f"Положите credentials.json в {ROOT}\n"
            "(Google Cloud → APIs → Calendar API → OAuth Desktop)"
        )
    flow = InstalledAppFlow.from_client_secrets_file(str(CREDS), SCOPES)
    creds = flow.run_local_server(port=0)
    data = CREDS.read_text()
    import json

    meta = json.loads(data)
    client = meta.get("installed") or meta.get("web") or {}
    cid = client.get("client_id", "")
    secret = client.get("client_secret", "")
    print("\n# Добавьте в .env на сервере:\n")
    print(f"GOOGLE_CALENDAR_ENABLED=1")
    print(f"GOOGLE_CLIENT_ID={cid}")
    print(f"GOOGLE_CLIENT_SECRET={secret}")
    print(f"GOOGLE_REFRESH_TOKEN={creds.refresh_token}")
    print(f"GOOGLE_CALENDAR_ID=primary")
    print(f"GOOGLE_EVENT_MINUTES=60")
    print("\n# GOOGLE_CALENDAR_ID=primary — основной календарь")
    print("# или id календаря из настроек Google Calendar\n")


if __name__ == "__main__":
    main()
