# Add to config.py after ADMIN_USER_IDS:
DIARY_BOT_USERNAME = os.getenv("DIARY_BOT_USERNAME", "TDCBT_bot").strip().lstrip("@")
