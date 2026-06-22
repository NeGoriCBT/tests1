"""Нормализация номера телефона."""
from __future__ import annotations

import re


def normalize_phone(raw: str) -> str | None:
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw.strip())
    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    elif len(digits) == 10:
        digits = "7" + digits
    if len(digits) == 11 and digits.startswith("7"):
        return f"+{digits}"
    if 10 <= len(digits) <= 15:
        return f"+{digits}"
    return None


def phone_from_contact(contact) -> str | None:
    if not contact or not contact.phone_number:
        return None
    return normalize_phone(contact.phone_number)
