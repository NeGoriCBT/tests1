#!/bin/bash
# Единый перезапуск обоих ботов без дубликатов
set -euo pipefail

BOTZAP_DIR="/home/macd/botzap"
DIARY_DIR="/home/macd/cognitive-diary-bot"

kill_bot_by_cwd() {
  local target_dir="$1"
  for pid in $(pgrep -f 'python.*main\.py' 2>/dev/null || true); do
    cwd="$(readlink -f "/proc/${pid}/cwd" 2>/dev/null || true)"
    if [[ "$cwd" == "$target_dir" ]]; then
      kill "$pid" 2>/dev/null || true
    fi
  done
}

kill_all_bot_processes() {
  kill_bot_by_cwd "$BOTZAP_DIR"
  kill_bot_by_cwd "$DIARY_DIR"
  # На всякий случай — по полному пути в командной строке
  pkill -f '/home/macd/botzap/venv/bin/python' 2>/dev/null || true
  pkill -f '/home/macd/cognitive-diary-bot/venv/bin/python' 2>/dev/null || true
  sleep 3
  kill_bot_by_cwd "$BOTZAP_DIR"
  kill_bot_by_cwd "$DIARY_DIR"
  for pid in $(pgrep -f 'python.*main\.py' 2>/dev/null || true); do
    cwd="$(readlink -f "/proc/${pid}/cwd" 2>/dev/null || true)"
    if [[ "$cwd" == "$BOTZAP_DIR" || "$cwd" == "$DIARY_DIR" ]]; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
  rm -f "$BOTZAP_DIR/.botzap.lock"
  sleep 1
}

kill_all_bot_processes

if command -v systemctl >/dev/null && systemctl --user is-system-running >/dev/null 2>&1; then
  systemctl --user restart botzap cognitive-diary-bot
else
  cd "$BOTZAP_DIR" && nohup ./venv/bin/python main.py >> bot.log 2>&1 &
  cd "$DIARY_DIR" && nohup ./venv/bin/python main.py >> bot.log 2>&1 &
fi

sleep 4
echo "Running:"
pgrep -af '/home/macd/botzap/venv/bin/python|/home/macd/cognitive-diary-bot/venv/bin/python|botzap.*main\.py|cognitive-diary.*main\.py' || true
echo "By cwd:"
for pid in $(pgrep -f 'python.*main\.py' 2>/dev/null || true); do
  cwd="$(readlink -f "/proc/${pid}/cwd" 2>/dev/null || echo "?")"
  echo "  pid=$pid cwd=$cwd"
done
