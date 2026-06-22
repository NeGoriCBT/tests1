# Google Calendar — настройка (бесплатно)

Синхронизация **бот → Google**: запись в боте создаёт событие, отмена — удаляет.

## 1. Google Cloud (5–10 мин)

1. Откройте https://console.cloud.google.com/
2. Создайте проект (или выберите существующий)
3. **APIs & Services → Library** → найдите **Google Calendar API** → **Enable**
4. **APIs & Services → OAuth consent screen**
   - User Type: **External** (для личного Gmail) или Internal (Workspace)
   - Заполните название приложения, email
   - Scopes: добавьте `.../auth/calendar.events`
   - Test users: добавьте **ваш Gmail** (для External в режиме теста)
5. **Credentials → Create Credentials → OAuth client ID**
   - Application type: **Desktop app**
   - Скачайте JSON → сохраните как `credentials.json` в папку `botzap`

## 2. Получить refresh token (на Mac)

```bash
cd botzap-deploy   # или папка с ботом
pip install google-api-python-client google-auth-oauthlib google-auth-httplib2
python scripts/google_calendar_auth.py
```

Откроется браузер → войдите в Google → разрешите доступ.  
В терминале появятся строки для `.env`.

## 3. Сервер

Добавьте в `/home/macd/botzap/.env`:

```env
GOOGLE_CALENDAR_ENABLED=1
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
GOOGLE_CALENDAR_ID=primary
GOOGLE_EVENT_MINUTES=60
```

Перезапустите бота. В `/admin` → **Google Calendar** → **Синхронизировать** (старые записи).

## Календарь не primary?

В Google Calendar → настройки нужного календаря → **Integrate calendar** → скопируйте **Calendar ID** в `GOOGLE_CALENDAR_ID`.

## Отключить

`GOOGLE_CALENDAR_ENABLED=0` — бот работает без Google.
