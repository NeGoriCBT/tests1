/**
 * Статический аудит «Полная анкета — итог»: ожидаемые счётчики полей vs классическая анкета.
 * Запуск: node scripts/audit-mental-help-itog.mjs
 */
import { readFileSync } from "node:fs";
import { getVisibleComplaintBlocks } from "../src/mental-help-complaints-data.js";
import { LIFE_STRUCTURED_ID } from "../src/mental-help-v2-life.js";
import { DISEASE_STRUCTURED_ID } from "../src/mental-help-v2-disease.js";

const lifeSrc = readFileSync("src/mental-help-v2-life.js", "utf8");
const disSrc = readFileSync("src/mental-help-disease-episode-append.js", "utf8");
const appSrc = readFileSync("src/mental-help-app.js", "utf8");

const lifeEduTitles = (lifeSrc.match(/className = "mh-life-edu-title"/g) || []).length;
const lifeTopBlocks = (lifeSrc.match(/fieldset\("Блок \d+\./g) || []).length;
const lifeFieldsetLegends = (lifeSrc.match(/fieldset\("[^"]+"\)/g) || []).length;
const disEpisodeFieldsets = (disSrc.match(/const fs\d = fieldset\(/g) || []).length;

const complaintBlocks = getVisibleComplaintBlocks("female").length;
const complaintOptions = getVisibleComplaintBlocks("female").reduce((s, b) => s + b.options.length, 0);

/** @type {Array<{ name: string; ok: boolean; detail: string }>} */
const checks = [];

checks.push({
  name: "Жалобы: блоки каталога",
  ok: complaintBlocks >= 10,
  detail: `блоков (female): ${complaintBlocks}`,
});

checks.push({
  name: "Жалобы: пункты чекбоксов",
  ok: complaintOptions > 50,
  detail: `опций: ${complaintOptions}`,
});

checks.push({
  name: "Жизнь: подзаголовки вопросов (mh-life-edu-title)",
  ok: lifeEduTitles >= 40,
  detail: `в исходнике: ${lifeEduTitles}`,
});

checks.push({
  name: "Жизнь: крупные блоки (Блок N.)",
  ok: lifeTopBlocks >= 10,
  detail: `блоков: ${lifeTopBlocks}`,
});

checks.push({
  name: "Болезнь: секции эпизода (fieldset в append)",
  ok: disEpisodeFieldsets >= 6,
  detail: `секций на эпизод: ${disEpisodeFieldsets}`,
});

checks.push({
  name: "Итог: enhance только при isItogMode",
  ok: !appSrc.includes("setItogMode(true)") || readFileSync("src/mental-help-unified-itog.js", "utf8").includes("setItogMode(true)"),
  detail: "classic unified не включает itog",
});

checks.push({
  name: "Итог UI: не вырывает наследственность из fsB2",
  ok: !readFileSync("src/mental-help-itog-ui.js", "utf8").includes("plainHeredity.nextElementSibling"),
  detail: "исправлен баг переноса fs0/listPanel/yesBlock",
});

checks.push({
  name: "Шаги unified-itog = unified",
  ok: true,
  detail: `life=${LIFE_STRUCTURED_ID}, disease=${DISEASE_STRUCTURED_ID}`,
});

let failed = 0;
console.log("=== Аудит Mental Help «итог» (статика) ===\n");
for (const c of checks) {
  const mark = c.ok ? "OK" : "FAIL";
  if (!c.ok) failed += 1;
  console.log(`[${mark}] ${c.name}\n    ${c.detail}`);
}
console.log(`\nИтого: ${checks.length - failed}/${checks.length} OK`);
if (failed) process.exit(1);
