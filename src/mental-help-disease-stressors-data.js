/**
 * Стрессоры (вопрос 4): каталог v2, автодополнение, родительный падеж для Word.
 */
import { STRESSORS_CATALOG } from "./mental-help-disease-stressors-catalog.js";
import { STRESSOR_GENITIVE_BY_LABEL } from "./mental-help-disease-stressors-genitive.js";

export const STRESSOR_NONE_LABEL = "Ничего из перечисленного";

/** Старые коды чекбоксов → подписи каталога v2. */
export const LEGACY_STRESSOR_CODE_TO_LABEL = /** @type {const} */ ({
  stress: "Стресс",
  burnout: "Психологическая перегрузка",
  breakup: "Расставание с партнёром",
  death: "Смерть близкого человека",
  jobloss: "Потеря работы",
  conflict: "Конфликт в семье",
  somatic: "Физическая болезнь",
  somatic_illness: "Физическая болезнь",
  somatic_trauma: "Травма",
  pregnancy: "Беременность плановая",
  finance: "Финансовые трудности",
  move: "Смена места жительства",
  legal: "Юридические проблемы",
  none: STRESSOR_NONE_LABEL,
  other: null,
});

/** Старые длинные подписи → каталог v2. */
const LEGACY_LABEL_ALIASES = /** @type {Record<string, string>} */ ({
  "Стресс (без уточнения)": "Стресс",
  "Психологическая перегрузка / выгорание": "Психологическая перегрузка",
  "Расставание с партнёром / развод": "Расставание с партнёром",
  "Потеря работы / увольнение": "Потеря работы",
  "Конфликт в семье или на работе": "Конфликт в семье",
  "Беременность / роды": "Беременность плановая",
  "Смена места жительства / переезд": "Смена места жительства",
  "Юридические проблемы / суд / тюрьма": "Юридические проблемы",
});

/** @type {Set<string>} */
let allLabelsSet = null;

/** @type {string[] | null} */
let allLabelsCache = null;

function buildLabelIndex() {
  if (allLabelsSet) return;
  allLabelsSet = new Set();
  allLabelsCache = [];
  for (const g of STRESSORS_CATALOG) {
    for (const lab of g.items) {
      if (!allLabelsSet.has(lab)) {
        allLabelsSet.add(lab);
        allLabelsCache.push(lab);
      }
    }
  }
}

export function getAllStressorLabels() {
  buildLabelIndex();
  return /** @type {string[]} */ (allLabelsCache);
}

/**
 * @param {string} raw
 * @returns {string | null}
 */
export function normalizeStressorLabel(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  if (t === "none") return STRESSOR_NONE_LABEL;
  const fromCode = LEGACY_STRESSOR_CODE_TO_LABEL[/** @type {keyof typeof LEGACY_STRESSOR_CODE_TO_LABEL} */ (t)];
  if (fromCode) return fromCode;
  if (LEGACY_LABEL_ALIASES[t]) return LEGACY_LABEL_ALIASES[t];
  buildLabelIndex();
  if (allLabelsSet?.has(t)) return t;
  return t;
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeStressorsList(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    if (typeof item !== "string") continue;
    const lab = normalizeStressorLabel(item);
    if (!lab || seen.has(lab)) continue;
    seen.add(lab);
    out.push(lab);
  }
  if (out.includes(STRESSOR_NONE_LABEL)) return [STRESSOR_NONE_LABEL];
  return out;
}

/**
 * @param {string} query
 * @param {Set<string>} exclude
 * @param {number} [limit]
 */
export function filterStressorSuggestions(query, exclude, limit = 20) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return [];
  return getAllStressorLabels()
    .filter((lab) => !exclude.has(lab) && lab.toLowerCase().includes(q))
    .slice(0, limit);
}

/**
 * @param {string} label
 * @param {Record<string, unknown>} state
 */
export function stressorLabelToGenitive(label, state) {
  const lab = normalizeStressorLabel(label);
  if (!lab || lab === STRESSOR_NONE_LABEL) return "";
  const ill = String(state.stressorsIllnessDetail ?? "").trim();
  const tr = String(state.stressorsTraumaDetail ?? "").trim();
  if (lab === "Физическая болезнь") {
    return ill ? `болезни (со слов: ${ill})` : STRESSOR_GENITIVE_BY_LABEL[lab] ?? "болезни";
  }
  if (lab === "Травма") {
    return tr ? `травмы (со слов: ${tr})` : STRESSOR_GENITIVE_BY_LABEL[lab] ?? "травмы";
  }
  const mapped = STRESSOR_GENITIVE_BY_LABEL[lab];
  if (mapped !== undefined) return mapped;
  return lab.charAt(0).toLowerCase() + lab.slice(1);
}
