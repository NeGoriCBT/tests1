/**
 * Парсит reference/stressors-v2-raw.txt → src/mental-help-disease-stressors-catalog.js
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const RAW = path.join(ROOT, "reference/stressors-v2-raw.txt");
const OUT = path.join(ROOT, "src/mental-help-disease-stressors-catalog.js");

const SECTION_RE = /^\d+\.\s+(.+?)\s*\(ок\.\s*\d+\s*пунктов?\)\s*$/i;

/** @type {Array<{ title: string; items: string[] }>} */
const groups = [];
/** @type {string[]} */
let currentItems = [];
let currentTitle = "";

for (const rawLine of fs.readFileSync(RAW, "utf8").split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line) continue;
  const sec = line.match(SECTION_RE);
  if (sec) {
    if (currentTitle && currentItems.length) {
      groups.push({ title: currentTitle, items: currentItems });
    }
    currentTitle = sec[1].trim();
    currentItems = [];
    continue;
  }
  if (!currentTitle) continue;
  currentItems.push(line);
}
if (currentTitle && currentItems.length) {
  groups.push({ title: currentTitle, items: currentItems });
}

const deduped = groups.map((g) => {
  const seen = new Set();
  const items = [];
  for (const it of g.items) {
    const t = it.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    items.push(t);
  }
  return { title: g.title, items };
});

let total = 0;
for (const g of deduped) total += g.items.length;

const body =
  `/**\n * Автогенерация: node scripts/build-stressors-v2-catalog.mjs\n * Источник: reference/stressors-v2-raw.txt\n * Всего пунктов: ${total}\n */\n` +
  `/** @type {ReadonlyArray<{ title: string; items: readonly string[] }>} */\n` +
  `export const STRESSORS_CATALOG = ${JSON.stringify(deduped, null, 2)};\n`;

fs.writeFileSync(OUT, body, "utf8");
console.log(`Wrote ${OUT}: ${deduped.length} sections, ${total} items`);
console.log("Run: npm run build:stressors-genitive");
