/**
 * Резервная копия формата вывода в Word для блока «В начале заболевания беспокоило…» (до 2026-05-12).
 *
 * Раньше в `formatDiseaseStructuredForWord` использовались подписи чекбоксов как есть, склейка
 * через `listWithAnd` (союз «и» перед последним), без групп по категориям и без отдельной
 * таблицы прошедшего времени.
 *
 * Список пунктов (тот же, что в чекбоксах) теперь живёт в `mental-help-disease-early-symptoms-data.js`
 * как `EARLY_SYMPTOMS_SOURCE`. Полный откат — по истории git этого репозитория.
 */
export const V1_WORD_SNIPPET = `const items = earlyRaw.split("\\n").map((t) => t.trim()).filter(Boolean);
const early = items.length > 1 ? listWithAnd(items) : items[0];
lines.push(\`В начале заболевания беспокоило: \${early}.\`);`;
