#!/usr/bin/env bash
# Перезапуск botzap, если getUpdates не было дольше MAX_STALE секунд.
set -euo pipefail

LOG="${LOG:-$HOME/botzap/bot.log}"
MAX_STALE="${MAX_STALE:-180}"
SERVICE="${SERVICE:-botzap}"

# cron не наследует user systemd session
if [[ -z "${XDG_RUNTIME_DIR:-}" ]]; then
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"
fi
if [[ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ]]; then
  export DBUS_SESSION_BUS_ADDRESS="unix:path=${XDG_RUNTIME_DIR}/bus"
fi

restart_service() {
  if systemctl --user is-active --quiet "$SERVICE" 2>/dev/null; then
    systemctl --user restart "$SERVICE"
    echo "$(date -u -Iseconds) restarted $SERVICE (systemctl --user)"
    return 0
  fi
  if systemctl --user start "$SERVICE" 2>/dev/null; then
    echo "$(date -u -Iseconds) started $SERVICE (systemctl --user)"
    return 0
  fi
  echo "$(date -u -Iseconds) systemctl unavailable, killing stale process" >&2
  for pid in $(pgrep -f '/home/macd/botzap/venv/bin/python.*main\.py' 2>/dev/null || true); do
    kill "$pid" 2>/dev/null || true
  done
  rm -f "$HOME/botzap/.botzap.lock"
  sleep 2
  systemctl --user start "$SERVICE" 2>/dev/null \
    || echo "$(date -u -Iseconds) manual restart failed — check botzap service" >&2
}

last_line=$(
  grep -h 'getUpdates.*200 OK' "$LOG" "${LOG}.1" 2>/dev/null | tail -1 || true
)
if [[ -z "$last_line" ]]; then
  exit 0
fi

last_ts=$(echo "$last_line" | awk '{print $1" "$2}' | sed 's/,.*//')
last_epoch=$(date -u -d "$last_ts" +%s)
now=$(date -u +%s)
age=$((now - last_epoch))

if (( age > MAX_STALE )); then
  echo "$(date -u -Iseconds) stale polling ${age}s (last: $last_ts) -> restart $SERVICE"
  restart_service
fi
