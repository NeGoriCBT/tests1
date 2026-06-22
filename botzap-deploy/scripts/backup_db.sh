#!/bin/bash
# Ежедневный бэкап appointments.db (SQLCipher)
set -euo pipefail
DIR="/home/macd/botzap/backups"
DB="/home/macd/botzap/appointments.db"
mkdir -p "$DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
cp "$DB" "$DIR/appointments_${STAMP}.db"
find "$DIR" -name 'appointments_*.db' -mtime +14 -delete
