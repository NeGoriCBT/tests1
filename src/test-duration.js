/** Форматирование длительности для отчёта Word (мс → «X мин YY с» или «—»). */

export function formatDurationMs(ms) {
  if (ms == null || Number.isNaN(ms) || ms < 0) return "—";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (m === 0) return `${sec} с`;
  return `${m} мин ${String(sec).padStart(2, "0")} с`;
}
