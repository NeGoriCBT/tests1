/**
 * Структурированный анамнез заболевания (Mental Help v2).
 */

import {
  allDiseaseDrugIds,
  drugIdToLabel,
  drugIdToMolecule,
  drugIdToPickerLabel,
  drugLabelToId,
  filterDrugPickerSuggestions,
  getDrugPickerEntries,
} from "./mental-help-disease-drugs.js";
import {
  PSYCH_SPEC_CODES,
  defaultEpisode,
  ensureEpisodesFromState,
  formatEpisodesForWord,
  normalizeEpisode,
} from "./mental-help-disease-episodes.js";
import { appendDiseaseEpisodeBlock } from "./mental-help-disease-episode-append.js";
import { createDrugChipPicker } from "./mental-help-disease-pickers.js";
import { enhanceItogDiseaseStep, isItogMode } from "./mental-help-itog-ui.js";

const DRUG_MOLECULE = { get: (/** @type {string} */ id) => drugIdToMolecule(id) };
import {
  filterEarlySymptomSuggestions,
  formatEarlySymptomsForWord,
  getAllEarlySymptomLabels,
} from "./mental-help-disease-early-symptoms-data.js";
import {
  STRESSOR_NONE_LABEL,
  filterStressorSuggestions,
  getAllStressorLabels,
  normalizeStressorsList,
  stressorLabelToGenitive,
} from "./mental-help-disease-stressors-data.js";
import {
  filterSomaticSpecialtySuggestions,
  getAllSomaticSpecialtyLabels,
} from "./mental-help-disease-somatic-specialties-data.js";

export const DISEASE_STRUCTURED_ID = "disease-structured";

const SOMATIC_FREQUENCY_LABELS = /** @type {const} */ ({
  once: "однократно",
  several: "несколько раз",
  many: "многократно",
});

const SOMATIC_FINDING_LABELS = /** @type {const} */ ({
  none_found: "соматической патологии не выявлено",
  found: "была выявлена соматическая патология",
});

const SOMATIC_TREATMENT_LABELS = /** @type {const} */ ({
  better: "назначено лечение, отмечено улучшение",
  no_effect: "улучшение не наступило",
  partial: "частичное улучшение",
  not_prescribed: "лечение не назначено",
  not_taken: "лечение не принимал(а)",
});

const PRIOR_SPEC_OPTIONS = [
  ["psychiatrist", "Психиатр"],
  ["psychotherapist", "Психотерапевт"],
  ["psychiatrist_narcologist", "Врач-психиатр-нарколог"],
  ["psychologist", "Психолог"],
];

/** @deprecated коды старых анкет */
const LEGACY_PRIOR_SPEC_CODES = new Set(["neurologist", "therapist", "other"]);

const MONTH_NAMES_RU = [
  "",
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

/** Предложный падеж после «в … месяце» */
const MONTH_NAMES_PREP_RU = [
  "",
  "январе",
  "феврале",
  "марте",
  "апреле",
  "мае",
  "июне",
  "июле",
  "августе",
  "сентябре",
  "октябре",
  "ноябре",
  "декабре",
];

function listWithAnd(parts) {
  const p = parts.filter(Boolean);
  if (!p.length) return "";
  if (p.length === 1) return p[0];
  if (p.length === 2) return `${p[0]} и ${p[1]}`;
  return `${p.slice(0, -1).join(", ")} и ${p[p.length - 1]}`;
}

/** Длинные однородные члены (препараты) — в анамнезе удобнее точка с запятой, чем «и» между абзацами. */
function listWithSemicolons(parts) {
  const p = parts.filter(Boolean);
  if (!p.length) return "";
  return p.join("; ");
}

/** @returns {Record<string, unknown>} */
export function emptyDiseaseStructuredState() {
  return {
    debutMode: "",
    debutMonth: "",
    debutYear: "",
    debutAge: "",
    onset: "",
    earlySymptoms: "",
    stressors: [],
    stressorsIllnessDetail: "",
    stressorsTraumaDetail: "",
    stressorsOther: "",
    /** yes | no | unknown */
    somaticConsult: "",
    /** @type {string[]} */
    somaticSpecialists: [],
    /** once | several | many */
    somaticFrequency: "",
    /** none_found | found */
    somaticFinding: "",
    /** better | no_effect | partial | not_prescribed | not_taken */
    somaticTreatment: "",
    priorDoctor: "",
    /** @type {Array<Record<string, unknown>>} эпизоды ухудшения */
    episodes: [],
    /** @deprecated */
    priorVisits: [],
    /** @deprecated глобальный вопрос 6; заполняется при чтении старых анкет и агрегате */
    priorMeds: "",
    /** @type {Record<string, { months: string; maxDose: string; effect: string; sides: string; trade: string }>} */
    medEntries: {},
    /** Наступало ли ухудшение после описанного периода: yes | no | "" */
    relapseOccurred: "",
    /** @type {Array<Record<string, unknown>>} эпизод: дата/темп + priorVisits */
    relapseEpisodes: [],
    /** @type {{ debutMode: string; debutMonth: string; debutYear: string; debutAge: string; onset: string } | null} */
    currentWorseningWhen: null,
    /** Обращение к специалисту по поводу текущего ухудшения: yes | no | "" */
    currentEpisodeDoctor: "",
    /** @type {Array<Record<string, unknown>>} */
    currentEpisodeVisits: [],
  };
}

/** @param {unknown} raw */
function normalizeSchemeDrug(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const drugId = typeof o.drugId === "string" ? o.drugId : "";
  if (!drugId) {
    return {
      drugId: "",
      maxDose: typeof o.maxDose === "string" ? o.maxDose : "",
      doseUnknown: o.doseUnknown === true,
      durationMonths: typeof o.durationMonths === "string" ? o.durationMonths : "",
    };
  }
  if (!allDiseaseDrugIds().includes(drugId)) return null;
  return {
    drugId,
    maxDose: typeof o.maxDose === "string" ? o.maxDose : "",
    doseUnknown: o.doseUnknown === true,
    durationMonths: typeof o.durationMonths === "string" ? o.durationMonths : "",
  };
}

/** @param {unknown} raw */
function normalizePriorScheme(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const drugsRaw = Array.isArray(o.drugs) ? o.drugs : [];
  const drugs = drugsRaw.map(normalizeSchemeDrug).filter(Boolean);
  return {
    durationMonths: typeof o.durationMonths === "string" ? o.durationMonths : "",
    outcome: typeof o.outcome === "string" ? o.outcome : "",
    stopReason: typeof o.stopReason === "string" ? o.stopReason : "",
    remissionDuration: typeof o.remissionDuration === "string" ? o.remissionDuration : "",
    drugs,
  };
}

/** @param {unknown} raw @param {Record<string, unknown>} base */
function normalizePriorVisit(raw, base) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const specialist = typeof o.specialist === "string" ? o.specialist : "";
  const ok =
    PRIOR_SPEC_OPTIONS.some(([c]) => c === specialist) || LEGACY_PRIOR_SPEC_CODES.has(specialist);
  if (!ok && specialist !== "") return null;
  const mp = typeof o.medsPrescribed === "string" ? o.medsPrescribed : "";
  const medsPrescribed = mp === "yes" || mp === "no" ? mp : "";
  const schemesRaw = Array.isArray(o.schemes) ? o.schemes : [];
  const schemes = schemesRaw.map(normalizePriorScheme).filter(Boolean);
  return {
    specialist: ok ? specialist : "",
    customOther: typeof o.customOther === "string" ? o.customOther : "",
    reason: typeof o.reason === "string" ? o.reason : "",
    reasonUnknown: o.reasonUnknown === true,
    medsPrescribed,
    schemes,
  };
}

/** @param {unknown} raw */
function normalizeRelapseEpisode(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const visitsRaw = Array.isArray(o.priorVisits) ? o.priorVisits : [];
  const priorVisits = visitsRaw.map((v) => normalizePriorVisit(v, {})).filter(Boolean);
  return {
    debutMode: typeof o.debutMode === "string" ? o.debutMode : "",
    debutMonth: typeof o.debutMonth === "string" ? o.debutMonth : "",
    debutYear: typeof o.debutYear === "string" ? o.debutYear : "",
    debutAge: typeof o.debutAge === "string" ? o.debutAge : "",
    onset: typeof o.onset === "string" ? o.onset : "",
    priorVisits,
  };
}

/** @param {unknown} raw */
function normalizeCurrentWorseningWhen(raw) {
  const e = normalizeRelapseEpisode(raw);
  return e && (e.debutMode || e.onset) ? e : null;
}

/** @param {unknown} raw */
export function parseDiseaseStructuredString(jsonStr) {
  const base = emptyDiseaseStructuredState();
  let raw = {};
  try {
    const p = JSON.parse(jsonStr || "{}");
    if (p && typeof p === "object") raw = p;
  } catch {
    raw = {};
  }
  for (const k of Object.keys(base)) {
    if (k === "stressors" && Array.isArray(raw.stressors)) {
      base.stressors = normalizeStressorsList(raw.stressors);
    } else if (k === "somaticSpecialists" && Array.isArray(raw.somaticSpecialists)) {
      base.somaticSpecialists = raw.somaticSpecialists.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean);
    } else if (k === "priorVisits" && Array.isArray(raw.priorVisits)) {
      base.priorVisits = raw.priorVisits.map((v) => normalizePriorVisit(v, base)).filter(Boolean);
    } else if (k === "relapseEpisodes" && Array.isArray(raw.relapseEpisodes)) {
      base.relapseEpisodes = raw.relapseEpisodes.map((e) => normalizeRelapseEpisode(e)).filter(Boolean);
    } else if (k === "currentEpisodeVisits" && Array.isArray(raw.currentEpisodeVisits)) {
      base.currentEpisodeVisits = raw.currentEpisodeVisits.map((v) => normalizePriorVisit(v, base)).filter(Boolean);
    } else if (k === "currentWorseningWhen" && raw.currentWorseningWhen) {
      base.currentWorseningWhen = normalizeCurrentWorseningWhen(raw.currentWorseningWhen);
    } else if (k === "episodes" && Array.isArray(raw.episodes)) {
      base.episodes = raw.episodes.map((e) => normalizeEpisode(e)).filter(Boolean);
    } else if (k === "medEntries" && raw.medEntries && typeof raw.medEntries === "object") {
      const me = /** @type {Record<string, unknown>} */ (raw.medEntries);
      for (const id of allDiseaseDrugIds()) {
        const e = me[id];
        if (e && typeof e === "object") {
          const o = /** @type {Record<string, unknown>} */ (e);
          base.medEntries[id] = {
            months: String(o.months ?? ""),
            maxDose: String(o.maxDose ?? ""),
            effect: String(o.effect ?? ""),
            sides: String(o.sides ?? ""),
            trade: String(o.trade ?? ""),
          };
        }
      }
    } else if (k === "stressorsIllnessDetail" || k === "stressorsTraumaDetail" || k === "stressorsOther") {
      base[k] = String(raw[k] ?? "").trim();
    } else if (k in raw) base[k] = raw[k];
  }
  if (!Array.isArray(base.episodes) || !base.episodes.length) {
    base.episodes = ensureEpisodesFromState(raw);
  }
  return base;
}

/** @param {"male" | "female" | null} gender */
function verbAppealedPast(gender) {
  if (gender === "female") return "обращалась";
  if (gender === "male") return "обращался";
  return "обращался(лась)";
}

/** @param {"male" | "female" | null} gender */
function verbNegAppealedPast(gender) {
  if (gender === "female") return "не обращалась";
  if (gender === "male") return "не обращался";
  return "не обращался(лась)";
}

/** @param {"male" | "female" | null} gender */
function verbTookMedPast(gender) {
  if (gender === "female") return "Принимала";
  if (gender === "male") return "Принимал";
  return "Принимал(а)";
}

/** @param {"male" | "female" | null} gender */
function verbNotedSidesPast(gender) {
  if (gender === "female") return "не отмечала";
  if (gender === "male") return "не отмечал";
  return "не отмечал(а)";
}

function specialistPhraseForWord(spec, customOther) {
  if (spec === "psychiatrist") return "врачу-психиатру";
  if (spec === "psychotherapist") return "врачу-психотерапевту";
  if (spec === "psychiatrist_narcologist") return "врачу-психиатру-наркологу";
  if (spec === "neurologist") return "врачу-неврологу";
  if (spec === "psychologist") return "психологу";
  if (spec === "therapist") return "терапевту / семейному врачу";
  if (spec === "other") {
    const o = String(customOther ?? "").trim();
    return o ? `специалисту (${o})` : "другому специалисту";
  }
  return "";
}

/** Только «к кому» + хвост причины — глагол «обращался» ставится один раз на всё перечисление. */
function onePriorVisitDestinationForWord(v) {
  const sp = specialistPhraseForWord(String(v.specialist ?? ""), v.customOther);
  if (!sp) return "";
  let tail = "";
  if (v.reasonUnknown) tail = ", причину не помнит";
  else {
    const r = String(v.reason ?? "").trim();
    if (r) tail = ` по поводу «${r}»`;
  }
  return `к ${sp}${tail}`;
}

function effectWord(e) {
  if (e === "yes") return "лучше";
  if (e === "partial") return "частично";
  if (e === "no") return "нет";
  return "не указано";
}

const EPISODE_INTRO = {
  debut: {
    my: "Заболевание дебютировало в",
    y: "Заболевание дебютировало в",
    age: "Начало заболевания с",
    unk: "Не помнит дату начала заболевания",
  },
  relapse: {
    my: "Повторное ухудшение наступило в",
    y: "Повторное ухудшение наступило в",
    age: "Повторное ухудшение с",
    unk: "Не помнит дату повторного ухудшения",
  },
  current: {
    my: "Текущее ухудшение наступило в",
    y: "Текущее ухудшение наступило в",
    age: "Текущее ухудшение с",
    unk: "Не помнит дату текущего ухудшения",
  },
};

/**
 * Дебют / повторное / текущее ухудшение: дата + темп (без стрессоров).
 * @param {Record<string, unknown>} ep
 * @param {"debut" | "relapse" | "current"} kind
 */
function sentenceEpisodeDebutOnsetOnly(ep, kind) {
  const I = EPISODE_INTRO[kind];
  /** @type {string[]} */
  const parts = [];
  const dm = String(ep.debutMode ?? "");
  if (dm === "monthYear") {
    const m = Number(ep.debutMonth);
    const y = String(ep.debutYear ?? "").trim();
    const mnPrep = m >= 1 && m <= 12 ? MONTH_NAMES_PREP_RU[m] : "";
    const mnNom = m >= 1 && m <= 12 ? MONTH_NAMES_RU[m] : "";
    if (mnPrep && y) parts.push(`${I.my} ${mnPrep} ${y} года`);
    else if (y) parts.push(`${I.y} ${y} году`);
    else if (mnNom) parts.push(`${I.my} ${mnNom} (год пациентом не указан)`);
  } else if (dm === "age") {
    const a = String(ep.debutAge ?? "").trim();
    if (a) parts.push(`${I.age} ${a} лет`);
  } else if (dm === "unknown") {
    parts.push(I.unk);
  }
  const on = String(ep.onset ?? "");
  if (on === "gradual") parts.push("постепенно");
  else if (on === "acute") parts.push("быстро");
  else if (on === "unknown") parts.push("темп нарастания симптомов не помнит");
  if (!parts.length) return "";
  return `${parts.join(", ")}.`;
}

/**
 * Первое предложение анамнеза: дебют (месяц/год или возраст или «не помнит») + постепенно/быстро +
 * на фоне перечисления либо «ни с чем конкретным не связывает».
 * @param {Record<string, unknown>} state
 */
function sentenceDebutOnsetStressors(state) {
  const head = sentenceEpisodeDebutOnsetOnly(state, "debut");
  if (!head) return "";
  /** @type {string[]} */
  const parts = [head.replace(/\.$/, "")];

  const stressSel = normalizeStressorsList(state.stressors);
  const otherT = String(state.stressorsOther ?? "").trim();
  if (stressSel.includes(STRESSOR_NONE_LABEL)) {
    parts.push("ни с чем конкретным не связывает");
  } else {
    const strBits = [];
    for (const lab of stressSel) {
      const g = stressorLabelToGenitive(lab, state);
      if (g) strBits.push(g);
    }
    if (otherT) strBits.push(`иного обстоятельства (со слов: ${otherT})`);
    if (strBits.length) parts.push(`на фоне ${listWithAnd(strBits)}`);
  }

  return `${parts.join(", ")}.`;
}

function schemeOutcomeWord(code) {
  if (code === "remission") return "полная редукция симптомов";
  if (code === "improvement") return "улучшение";
  if (code === "none") return "без эффекта";
  if (code === "worse") return "ухудшение";
  return "не указано";
}

/** @param {Record<string, unknown>} drug */
function formatDrugBitForWord(drug) {
  const o = /** @type {Record<string, unknown>} */ (drug);
  const id = String(o.drugId ?? "").trim();
  if (!id) return "";
  const mol = DRUG_MOLECULE.get(id) || id;
  const dose = String(o.maxDose ?? "").trim();
  const dur = String(o.durationMonths ?? "").trim();
  const dosePart =
    o.doseUnknown === true ? "максимальная доза не помнится" : dose ? `максимальная доза ${dose}` : "";
  const durPart = dur ? `приём ${dur} мес.` : "";
  return [mol, dosePart, durPart].filter(Boolean).join(", ");
}

/** @param {string[]} outcomes @param {"male" | "female" | null} gender */
function visitOutcomeClauseForWord(outcomes, gender) {
  const list = outcomes.filter(Boolean);
  if (list.some((o) => o === "improvement" || o === "remission")) {
    if (gender === "female") return "отмечает улучшение";
    if (gender === "male") return "отмечает улучшение";
    return "отмечает улучшение";
  }
  if (list.some((o) => o === "none")) {
    if (gender === "female") return "улучшения не отмечает";
    if (gender === "male") return "улучшения не отмечает";
    return "улучшения не отмечает";
  }
  if (list.some((o) => o === "worse")) {
    if (gender === "female") return "отмечает ухудшение";
    if (gender === "male") return "отмечает ухудшение";
    return "отмечает ухудшение";
  }
  return "";
}

/**
 * «Было назначено лечение: …, отмечает улучшение.» или фраза об отсутствии назначения.
 * @param {Record<string, unknown>} v
 * @param {"male" | "female" | null} gender
 */
function formatVisitTreatmentSentence(v, gender) {
  const mp = String(v.medsPrescribed ?? "");
  if (mp === "no") {
    return "Медикаментозное лечение психотропными препаратами (антидепрессанты, транквилизаторы, нормотимики, нейролептики) не назначалось.";
  }
  if (mp !== "yes") return "";
  /** @type {string[]} */
  const drugBits = [];
  /** @type {string[]} */
  const outcomes = [];
  const schemes = Array.isArray(v.schemes) ? v.schemes : [];
  for (const sch of schemes) {
    const s = /** @type {Record<string, unknown>} */ (sch);
    const oc = String(s.outcome ?? "").trim();
    if (oc) outcomes.push(oc);
    const drugs = Array.isArray(s.drugs) ? s.drugs : [];
    for (const d of drugs) {
      const bit = formatDrugBitForWord(d);
      if (bit) drugBits.push(bit);
    }
  }
  if (!drugBits.length) return "";
  let line = `Было назначено лечение: ${drugBits.join("; ")}`;
  const outClause = visitOutcomeClauseForWord(outcomes, gender);
  if (outClause) line += `, ${outClause}`;
  return `${line}.`;
}

/**
 * @param {Record<string, unknown>} state
 * @param {"male" | "female" | null} gender
 */
function formatSomaticConsultForWord(state, gender) {
  const sc = String(state.somaticConsult ?? "");
  if (sc === "no") {
    return `К врачам соматического профиля по поводу данного состояния ${verbNegAppealedPast(gender)}.`;
  }
  if (sc === "unknown") {
    return "Обращение к врачам соматического профиля по поводу данного состояния пациент не помнит.";
  }
  if (sc !== "yes") return "";
  const specs = Array.isArray(state.somaticSpecialists) ? state.somaticSpecialists.filter(Boolean) : [];
  const freq = SOMATIC_FREQUENCY_LABELS[/** @type {keyof typeof SOMATIC_FREQUENCY_LABELS} */ (String(state.somaticFrequency ?? ""))] ?? "";
  const finding = SOMATIC_FINDING_LABELS[/** @type {keyof typeof SOMATIC_FINDING_LABELS} */ (String(state.somaticFinding ?? ""))] ?? "";
  const treat =
    SOMATIC_TREATMENT_LABELS[/** @type {keyof typeof SOMATIC_TREATMENT_LABELS} */ (String(state.somaticTreatment ?? ""))] ?? "";
  /** @type {string[]} */
  const parts = [];
  if (specs.length) parts.push(`обращался(лась) к ${listWithAnd(specs.map((s) => s.toLowerCase()))}`);
  else parts.push("обращался(лась) к врачам соматического профиля");
  if (freq) parts.push(`консультации были ${freq}`);
  if (finding) parts.push(finding);
  if (String(state.somaticFinding) === "found" && treat) parts.push(treat);
  return parts.length ? `${parts[0].charAt(0).toUpperCase()}${parts[0].slice(1)}${parts.length > 1 ? `, ${parts.slice(1).join(", ")}` : ""}.` : "";
}

function schemeStopWord(code) {
  if (code === "doctor") return "отмена по решению врача";
  if (code === "self") return "самостоятельная отмена";
  return "не указано";
}

/**
 * @param {Record<string, unknown>} state
 * @param {"male" | "female" | null} gender
 */
function specialistNomForWord(spec, customOther) {
  if (spec === "psychiatrist") return "психиатра";
  if (spec === "psychotherapist") return "психотерапевта";
  if (spec === "psychiatrist_narcologist") return "врача-психиатра-нарколога";
  if (spec === "psychologist") return "психолога";
  if (spec === "neurologist") return "врача-невролога";
  if (spec === "therapist") return "терапевта / семейного врача";
  if (spec === "other") {
    const o = String(customOther ?? "").trim();
    return o ? `специалиста (${o})` : "другого специалиста";
  }
  return "";
}

/**
 * @param {Record<string, unknown>} state
 * @param {"male" | "female" | null} gender
 */
function formatVisitSchemesForWord(/** @type {Record<string, unknown>} */ v, gender) {
  /** @type {string[]} */
  const blocks = [];
  const schemes = Array.isArray(v.schemes) ? v.schemes : [];
  schemes.forEach((sch, si) => {
    const s = /** @type {Record<string, unknown>} */ (sch);
    const months = String(s.durationMonths ?? "").trim();
    const drugs = Array.isArray(s.drugs) ? s.drugs : [];
    const drugBits = drugs
      .map((d) => {
        const o = /** @type {Record<string, unknown>} */ (d);
        const id = String(o.drugId ?? "");
        const mol = DRUG_MOLECULE.get(id) || id;
        if (o.doseUnknown === true) return `${mol}, максимальная доза не помнится`;
        const dose = String(o.maxDose ?? "").trim();
        const dur = String(o.durationMonths ?? "").trim();
        const dosePart = o.doseUnknown === true ? "максимальная доза не помнится" : dose ? `максимальная доза ${dose}` : "";
        const durPart = dur ? `приём ${dur} мес.` : "";
        return [mol, dosePart, durPart].filter(Boolean).join(", ");
      })
      .filter(Boolean);
    const outc = schemeOutcomeWord(String(s.outcome ?? ""));
    const stp = schemeStopWord(String(s.stopReason ?? ""));
    const rem = String(s.remissionDuration ?? "").trim();
    const remPart =
      (s.outcome === "remission" || s.outcome === "improvement") && rem
        ? `улучшение/ремиссия длилась (со слов): ${rem}`
        : "";
    const bits = [
      months ? `схема ${si + 1}, длительность ${months} мес.` : `схема ${si + 1}`,
      drugBits.length ? `препараты: ${drugBits.join("; ")}` : "",
      `результат: ${outc}`,
      `отмена схемы: ${stp}`,
      remPart,
    ].filter(Boolean);
    if (bits.length) blocks.push(bits.join(", "));
  });
  return blocks;
}

/**
 * @param {Record<string, unknown>} state
 * @param {"male" | "female" | null} gender
 */
/**
 * @param {unknown[]} visits
 * @param {"male" | "female" | null} gender
 * @returns {{ lines: string[]; anyNewScheme: boolean }}
 */
function formatVisitListMedParagraphs(visits, gender) {
  /** @type {string[]} */
  const lines = [];
  let anyNewScheme = false;
  for (const v of Array.isArray(visits) ? visits : []) {
    const vo = /** @type {Record<string, unknown>} */ (v);
    if (!specialistPhraseForWord(String(vo.specialist ?? ""), vo.customOther)) continue;
    const treat = formatVisitTreatmentSentence(vo, gender);
    if (treat) {
      if (String(vo.medsPrescribed ?? "") === "yes") anyNewScheme = true;
      lines.push(treat);
    }
  }
  return { lines, anyNewScheme };
}

function formatLegacyMedEntriesParagraph(state, gender) {
  const medLines = [];
  const entries = state.medEntries && typeof state.medEntries === "object" ? state.medEntries : {};
  for (const group of DISEASE_DRUG_CATALOG) {
    for (const drug of group.drugs) {
      const e = /** @type {Record<string, string> | undefined} */ (entries[drug.id]);
      if (!e) continue;
      const months = String(e.months ?? "").trim();
      const maxDose = String(e.maxDose ?? "").trim();
      const effect = String(e.effect ?? "").trim();
      const sides = String(e.sides ?? "").trim();
      const trade = String(e.trade ?? "").trim();
      const mol = drug.molecule;
      const tradePart = trade ? `, торговое наименование «${trade}»` : "";
      const effW = effectWord(effect);
      const sidesPart = sides ? sides : verbNotedSidesPast(gender);
      const parts = [
        `${mol}${tradePart}`,
        months ? `приём в течение ${months} мес.` : "",
        maxDose ? `максимальная суточная доза ${maxDose}` : "",
        `эффект ${effW}`,
        `побочные эффекты: ${sidesPart}`,
      ].filter(Boolean);
      if (parts.length) medLines.push(parts.join(", "));
    }
  }
  if (!medLines.length) return "Психотропное лечение назначалось; сведения о конкретных препаратах в анкете не указаны.";
  const body = medLines.length >= 2 ? listWithSemicolons(medLines) : medLines[0];
  return `Ранее отмечался приём психотропных препаратов: ${body}.`;
}

/**
 * @param {Record<string, unknown>} state
 * @param {"male" | "female" | null} gender
 */
/**
 * @param {Record<string, unknown>} state
 * @param {"male" | "female" | null} gender
 */
export function formatDiseaseStructuredWithMeta(state, gender) {
  const episodes = Array.isArray(state.episodes) ? state.episodes : ensureEpisodesFromState(state);
  const { paragraphs, warnings } = formatEpisodesForWord(
    episodes.map((e) => /** @type {Record<string, unknown>} */ (e)),
    state,
    gender,
  );
  return {
    text: paragraphs.join("\n\n").trim(),
    paragraphs,
    warnings,
  };
}

/**
 * @param {Record<string, unknown>} state
 * @param {"male" | "female" | null} gender
 */
export function formatDiseaseStructuredForWord(state, gender) {
  return formatDiseaseStructuredWithMeta(state, gender).text;
}

/**
 * @param {HTMLElement} root
 * @param {HTMLElement} row
 */
function readOnePriorVisitFromRow(root, row) {
  const idBase = row.dataset.idBase;
  if (!idBase) return null;
  const specRad = row.querySelector(`input[name="${idBase}-spec"]:checked`);
  const specialist = specRad instanceof HTMLInputElement ? specRad.value : "";
  const reason = row.querySelector(".mh-dis-prior-reason");
  const ru = row.querySelector(".mh-dis-prior-reason-unknown");
  const co = row.querySelector(".mh-dis-prior-custom");
  const rx = row.querySelector(`input[name="${idBase}-rx"]:checked`);
  const medsPrescribed = rx instanceof HTMLInputElement ? rx.value : "";
  /** @type {unknown[]} */
  const schemes = [];
  row.querySelectorAll(".mh-dis-prior-scheme").forEach((schRow) => {
    if (!(schRow instanceof HTMLElement)) return;
    const si = schRow.dataset.schemeIdx ?? "0";
    /** @type {unknown[]} */
    const drugs = [];
    schRow.querySelectorAll(".mh-dis-prior-scheme-drug").forEach((dr) => {
      if (!(dr instanceof HTMLElement)) return;
      const di = dr.dataset.drugLineIdx ?? "0";
      const ds = dr.querySelector(`#${idBase}-sch-${si}-drug-${di}-drug`);
      const drugId = ds instanceof HTMLInputElement ? ds.value.trim() : "";
      const doseEl = dr.querySelector(`#${idBase}-sch-${si}-drug-${di}-dose`);
      const durEl = dr.querySelector(`#${idBase}-sch-${si}-drug-${di}-dur`);
      const unk = dr.querySelector(`#${idBase}-sch-${si}-drug-${di}-unk`);
      drugs.push({
        drugId,
        maxDose: doseEl instanceof HTMLInputElement ? doseEl.value.trim() : "",
        doseUnknown: unk instanceof HTMLInputElement && unk.checked,
        durationMonths: durEl instanceof HTMLInputElement ? durEl.value.trim() : "",
      });
    });
    const outRad = schRow.querySelector(`input[name="${idBase}-sch-${si}-out"]:checked`);
    const stSel = schRow.querySelector(`#${idBase}-sch-${si}-stop`);
    const remInp = schRow.querySelector(`#${idBase}-sch-${si}-rem`);
    schemes.push({
      durationMonths: valOf(root, `#${idBase}-sch-${si}-months`),
      outcome: outRad instanceof HTMLInputElement ? outRad.value : "",
      stopReason: stSel instanceof HTMLInputElement ? stSel.value : "",
      remissionDuration: remInp instanceof HTMLInputElement ? remInp.value.trim() : "",
      drugs,
    });
  });
  return {
    specialist,
    customOther: co instanceof HTMLInputElement ? co.value : "",
    reason: reason instanceof HTMLInputElement ? reason.value : "",
    reasonUnknown: ru instanceof HTMLInputElement ? ru.checked : false,
    medsPrescribed,
    schemes,
  };
}

/**
 * @param {HTMLElement} root
 * @param {Record<string, string>} answers
 */
/**
 * @param {HTMLElement} root
 * @param {HTMLElement} wrap
 */
function readOneEpisodeFromBlock(root, wrap) {
  const ei = wrap.dataset.episodeIdx ?? "0";
  const id = `mh-dis-ep-${ei}`;
  const startRad = wrap.querySelector(`input[name="${id}-start"]:checked`);
  const durRad = wrap.querySelector(`input[name="${id}-dur"]:checked`);
  const onsetRad = wrap.querySelector(`input[name="${id}-onset"]:checked`);
  let rxVal = "";
  wrap.querySelectorAll(`input[name="${id}-rx"]`).forEach((el) => {
    if (el instanceof HTMLInputElement && el.checked) rxVal = el.value;
  });
  /** @type {string[]} */
  const psychSpecialists = [];
  wrap.querySelectorAll(`input.mh-dis-ep-psych-check[data-ep="${ei}"]:checked`).forEach((el) => {
    if (el instanceof HTMLInputElement && el.value) psychSpecialists.push(el.value);
  });
  /** @type {unknown[]} */
  const episodeMeds = [];
  wrap.querySelectorAll(".mh-dis-ep-med-line").forEach((line) => {
    if (!(line instanceof HTMLElement)) return;
    const mi = line.dataset.medIdx ?? "0";
    const drugH =
      line.querySelector(`#${id}-med-${mi}-drug`) ||
      line.querySelector(`input[id="${id}-med-${mi}-drug"]`);
    const doseEl = line.querySelector(`#${id}-med-${mi}-dose`);
    const durEl = line.querySelector(`#${id}-med-${mi}-dur`);
    const unk = line.querySelector(`#${id}-med-${mi}-unk`);
    const effRad = line.querySelector(`input[name="${id}-med-${mi}-eff"]:checked`);
    let durationMode = "";
    line.querySelectorAll(`input[name="${id}-med-${mi}-dur-mode"]`).forEach((el) => {
      if (el instanceof HTMLInputElement && el.checked) durationMode = el.value;
    });
    episodeMeds.push({
      drugId: drugH instanceof HTMLInputElement ? drugH.value.trim() : "",
      maxDose: doseEl instanceof HTMLInputElement ? doseEl.value.trim() : "",
      doseUnknown: unk instanceof HTMLInputElement && unk.checked,
      durationMode,
      durationMonths:
        durationMode === "months" && durEl instanceof HTMLInputElement ? durEl.value.trim() : "",
      effect: effRad instanceof HTMLInputElement ? effRad.value : "",
    });
  });
  const somTreatTop = wrap.querySelector(`input[name="${id}-somatic-treat-top"]:checked`);
  const topVal = somTreatTop instanceof HTMLInputElement ? somTreatTop.value : "";
  let somaticTreatment = topVal;
  if (topVal === "prescribed") {
    const sub = wrap.querySelector(`input[name="${id}-somatic-treat-sub"]:checked`);
    somaticTreatment = sub instanceof HTMLInputElement ? sub.value : "";
  }
  return {
    startMode: startRad instanceof HTMLInputElement ? startRad.value : "",
    startMonth: valOf(root, `#${id}-start-month`),
    startYear: valOf(root, `#${id}-start-year`),
    durationEndMode: durRad instanceof HTMLInputElement ? durRad.value : "",
    durationEndMonth: valOf(root, `#${id}-dur-month`),
    durationEndYear: valOf(root, `#${id}-dur-year`),
    onset: onsetRad instanceof HTMLInputElement ? onsetRad.value : "",
    earlySymptoms: valOf(root, `#${id}-early`),
    stressors: normalizeStressorsList(
      valOf(root, `#${id}-stressors`)
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean),
    ),
    stressorsIllnessDetail: valOf(root, `#${id}-illness-detail`),
    stressorsTraumaDetail: valOf(root, `#${id}-trauma-detail`),
    stressorsOther: "",
    somaticConsult: (() => {
      const r = wrap.querySelector(`input[name="${id}-somatic"]:checked`);
      return r instanceof HTMLInputElement ? r.value : "";
    })(),
    somaticSpecialists: valOf(root, `#${id}-somatic-specs`)
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean),
    somaticFrequency: (() => {
      const r = wrap.querySelector(`input[name="${id}-somatic-freq"]:checked`);
      return r instanceof HTMLInputElement ? r.value : "";
    })(),
    somaticFinding: (() => {
      const r = wrap.querySelector(`input[name="${id}-somatic-find"]:checked`);
      return r instanceof HTMLInputElement ? r.value : "";
    })(),
    somaticTreatment,
    psychSpecialists,
    medsPrescribed: rxVal,
    episodeMeds,
    improvementDurationMonths: valOf(root, `#${id}-imp-dur`),
    mhClinicVisitReason: (() => {
      const r = wrap.querySelector(`input[name="${id}-mh-visit"]:checked`);
      return r instanceof HTMLInputElement ? r.value : "";
    })(),
    mhClinicVisitDetail: valOf(root, `#${id}-mh-visit-detail`),
  };
}

export function readDiseaseStructuredFromDom(root, answers) {
  const s = /** @type {Record<string, unknown>} */ (emptyDiseaseStructuredState());
  /** @type {unknown[]} */
  const episodes = [];
  root.querySelectorAll(".mh-dis-episode").forEach((wrap) => {
    if (!(wrap instanceof HTMLElement)) return;
    const ep = readOneEpisodeFromBlock(root, wrap);
    const norm = normalizeEpisode(ep);
    if (norm) episodes.push(norm);
  });
  s.episodes = episodes.length ? episodes : [defaultEpisode()];
  answers[DISEASE_STRUCTURED_ID] = JSON.stringify(s);
}

function valOf(root, sel) {
  const el = root.querySelector(sel);
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
    ? el.value.trim()
    : "";
}

function defaultVisit() {
  return {
    specialist: "psychiatrist",
    customOther: "",
    reason: "",
    reasonUnknown: false,
    medsPrescribed: "",
    schemes: [],
  };
}

function defaultScheme() {
  return {
    durationMonths: "",
    outcome: "",
    stopReason: "",
    remissionDuration: "",
    drugs: [{ drugId: "", maxDose: "", doseUnknown: false, durationMonths: "" }],
  };
}

function defaultRelapseEpisode() {
  return {
    debutMode: "",
    debutMonth: "",
    debutYear: "",
    debutAge: "",
    onset: "",
    priorVisits: [defaultVisit()],
  };
}

/**
 * @typedef {{
 *   idBase: string;
 *   scopeClass: string;
 *   getVisits: (st: Record<string, unknown>) => unknown[];
 *   setVisits: (st: Record<string, unknown>, arr: unknown[]) => void;
 * }} VisitRowBind
 */

/** @param {number} idx */
function visitRowBindPrior(idx) {
  return {
    idBase: `mh-dis-vis-${idx}`,
    scopeClass: "mh-dis-prior-visit-initial",
    getVisits(st) {
      return Array.isArray(st.priorVisits) ? [...st.priorVisits] : [];
    },
    setVisits(st, arr) {
      st.priorVisits = arr;
    },
  };
}

/** @param {number} ei @param {number} vi */
function visitRowBindRelapse(ei, vi) {
  return {
    idBase: `mh-dis-rel-${ei}-vis-${vi}`,
    scopeClass: "mh-dis-prior-visit-relapse",
    getVisits(st) {
      const eps = Array.isArray(st.relapseEpisodes) ? st.relapseEpisodes : [];
      const ep = eps[ei] && typeof eps[ei] === "object" ? /** @type {Record<string, unknown>} */ (eps[ei]) : {};
      return Array.isArray(ep.priorVisits) ? [...ep.priorVisits] : [];
    },
    setVisits(st, arr) {
      const eps = [...(Array.isArray(st.relapseEpisodes) ? st.relapseEpisodes : [])];
      const prev = eps[ei] && typeof eps[ei] === "object" ? /** @type {Record<string, unknown>} */ (eps[ei]) : defaultRelapseEpisode();
      eps[ei] = { ...prev, priorVisits: arr };
      st.relapseEpisodes = eps;
    },
  };
}

/** @param {number} vi */
function visitRowBindCurrent(vi) {
  return {
    idBase: `mh-dis-cur-vis-${vi}`,
    scopeClass: "mh-dis-prior-visit-current",
    getVisits(st) {
      return Array.isArray(st.currentEpisodeVisits) ? [...st.currentEpisodeVisits] : [];
    },
    setVisits(st, arr) {
      st.currentEpisodeVisits = arr;
    },
  };
}

/**
 * @param {Record<string, unknown>} v
 * @param {number} idx
 * @param {() => Record<string, unknown>} readStateFromDom
 * @param {(st: Record<string, unknown>) => void} reflowVisits
 * @param {(name: string, value: string, label: string, checked: boolean) => HTMLElement} radioRow
 * @param {VisitRowBind} [bind]
 */
function createPriorVisitRow(v, idx, readStateFromDom, reflowVisits, radioRow, bind) {
  const ctx = bind ?? visitRowBindPrior(idx);
  const row = document.createElement("div");
  row.className = `mh-dis-prior-visit mh-dis-timeline-event mh-life-childhood-visit ${ctx.scopeClass}`;
  row.dataset.visitIdx = String(idx);
  row.dataset.idBase = ctx.idBase;
  const t = document.createElement("p");
  t.className = "mh-life-childhood-visit-title";
  t.textContent = `${idx + 1} обращение`;
  row.appendChild(t);
  const specP = document.createElement("p");
  specP.className = "mh-prompt";
  specP.textContent = "К какому специалисту вы обращались?";
  row.appendChild(specP);
  const specVal = String(v.specialist ?? "");
  PRIOR_SPEC_OPTIONS.forEach(([val, lab]) => {
    row.appendChild(radioRow(`${ctx.idBase}-spec`, val, lab, specVal === val));
  });
  const cust = document.createElement("input");
  cust.type = "hidden";
  cust.className = "mh-life-text mh-dis-prior-custom";
  cust.value = String(v.customOther ?? "");
  row.appendChild(cust);
  const rInp = document.createElement("input");
  rInp.type = "hidden";
  rInp.className = "mh-life-text mh-dis-prior-reason";
  rInp.value = String(v.reason ?? "");
  row.appendChild(rInp);
  const rUn = document.createElement("input");
  rUn.type = "hidden";
  rUn.className = "mh-dis-prior-reason-unknown";
  row.appendChild(rUn);

  const rxIntro = document.createElement("p");
  rxIntro.className = "mh-prompt";
  rxIntro.textContent =
    "Было ли назначено медикаментозное лечение психотропными препаратами (антидепрессанты, транквилизаторы, нормотимики, нейролептики)?";
  row.appendChild(rxIntro);
  const mp = String(v.medsPrescribed ?? "");
  row.appendChild(radioRow(`${ctx.idBase}-rx`, "yes", "Да", mp === "yes"));
  row.appendChild(radioRow(`${ctx.idBase}-rx`, "no", "Нет", mp === "no"));

  const schemesWrap = document.createElement("div");
  schemesWrap.className = "mh-life-early-sub";
  schemesWrap.hidden = mp !== "yes";
  const schemes =
    mp === "yes" && Array.isArray(v.schemes) && v.schemes.length ? v.schemes : mp === "yes" ? [defaultScheme()] : [];

  schemes.forEach((sch, si) => {
    const s = /** @type {Record<string, unknown>} */ (sch);
    const schEl = document.createElement("div");
    schEl.className = "mh-dis-prior-scheme mh-life-custom-wrap";
    schEl.dataset.schemeIdx = String(si);

    const st = document.createElement("p");
    st.className = "mh-life-childhood-visit-title";
    st.textContent = `Схема ${si + 1}`;
    schEl.appendChild(st);

    const drugsBox = document.createElement("div");
    drugsBox.className = "mh-dis-prior-scheme-drugs mh-dis-timeline";
    const drugLines =
      Array.isArray(s.drugs) && s.drugs.length
        ? s.drugs
        : [{ drugId: "", maxDose: "", doseUnknown: false, durationMonths: "" }];
    drugLines.forEach((d, di) => {
      const dr = /** @type {Record<string, unknown>} */ (d);
      const line = document.createElement("div");
      line.className = "mh-dis-prior-scheme-drug mh-dis-timeline-event";
      line.dataset.drugLineIdx = String(di);

      const drugTitle = document.createElement("p");
      drugTitle.className = "mh-prompt";
      drugTitle.textContent = `Препарат ${di + 1}`;
      line.appendChild(drugTitle);

      const drugPicker = createDrugChipPicker(String(dr.drugId ?? ""), `${ctx.idBase}-sch-${si}-drug-${di}-drug`);
      line.appendChild(drugPicker.root);

      const doseRow = document.createElement("div");
      doseRow.className = "mh-life-row";
      const dInp = document.createElement("input");
      dInp.type = "text";
      dInp.className = "mh-life-text";
      dInp.id = `${ctx.idBase}-sch-${si}-drug-${di}-dose`;
      dInp.placeholder = "Максимальная доза";
      dInp.value = String(dr.maxDose ?? "");
      dInp.disabled = dr.doseUnknown === true;
      doseRow.appendChild(dInp);
      const durInp = document.createElement("input");
      durInp.type = "number";
      durInp.min = "0";
      durInp.className = "mh-life-text mh-life-text--narrow";
      durInp.id = `${ctx.idBase}-sch-${si}-drug-${di}-dur`;
      durInp.placeholder = "Срок (мес.)";
      durInp.title = "Сколько месяцев принимал(а)";
      durInp.value = String(dr.durationMonths ?? "");
      doseRow.appendChild(durInp);
      const unkLab = document.createElement("label");
      unkLab.className = "mh-life-check";
      const unk = document.createElement("input");
      unk.type = "checkbox";
      unk.id = `${ctx.idBase}-sch-${si}-drug-${di}-unk`;
      unk.checked = dr.doseUnknown === true;
      unk.addEventListener("change", () => {
        dInp.disabled = unk.checked;
        if (unk.checked) dInp.value = "";
      });
      unkLab.appendChild(unk);
      unkLab.appendChild(document.createTextNode(" дозу не помню"));
      doseRow.appendChild(unkLab);
      line.appendChild(doseRow);

      if (drugLines.length > 1) {
        const rmDrug = document.createElement("button");
        rmDrug.type = "button";
        rmDrug.className = "btn btn--ghost";
        rmDrug.textContent = "Удалить препарат";
        rmDrug.addEventListener("click", () => {
          const st0 = readStateFromDom();
          const arr = ctx.getVisits(st0);
          const vis = /** @type {Record<string, unknown>} */ (arr[idx] || {});
          const schs = Array.isArray(vis.schemes) ? [...vis.schemes] : [];
          const cur = /** @type {Record<string, unknown>} */ (schs[si] || defaultScheme());
          const dgs = Array.isArray(cur.drugs) ? [...cur.drugs] : [];
          dgs.splice(di, 1);
          cur.drugs = dgs.length ? dgs : [{ drugId: "", maxDose: "", doseUnknown: false, durationMonths: "" }];
          schs[si] = cur;
          vis.schemes = schs;
          arr[idx] = vis;
          ctx.setVisits(st0, arr);
          reflowVisits(st0, { visitIdx: idx });
        });
        line.appendChild(rmDrug);
      }

      drugsBox.appendChild(line);
    });
    schEl.appendChild(drugsBox);

    const addDrug = document.createElement("button");
    addDrug.type = "button";
    addDrug.className = "btn btn--ghost";
    addDrug.textContent = "Добавить препарат";
    addDrug.addEventListener("click", () => {
      const st0 = readStateFromDom();
      const arr = ctx.getVisits(st0);
      const vis = /** @type {Record<string, unknown>} */ (arr[idx] || defaultVisit());
      const schs = Array.isArray(vis.schemes) ? [...vis.schemes] : [];
      const cur = /** @type {Record<string, unknown>} */ (schs[si] || defaultScheme());
      const dgs = Array.isArray(cur.drugs) ? [...cur.drugs] : [];
      dgs.push({ drugId: "", maxDose: "", doseUnknown: false, durationMonths: "" });
      cur.drugs = dgs;
      schs[si] = cur;
      vis.schemes = schs;
      arr[idx] = vis;
      ctx.setVisits(st0, arr);
      reflowVisits(st0, { visitIdx: idx });
    });
    schEl.appendChild(addDrug);

    const outP = document.createElement("p");
    outP.className = "mh-prompt";
    outP.textContent = "Результат схемы:";
    schEl.appendChild(outP);
    const outVal = String(s.outcome ?? "");
    schEl.appendChild(radioRow(`${ctx.idBase}-sch-${si}-out`, "improvement", "Улучшение", outVal === "improvement" || outVal === "remission"));
    schEl.appendChild(radioRow(`${ctx.idBase}-sch-${si}-out`, "none", "Без эффекта", outVal === "none" || outVal === "worse"));

    const stopH = document.createElement("input");
    stopH.type = "hidden";
    stopH.id = `${ctx.idBase}-sch-${si}-stop`;
    stopH.value = String(s.stopReason ?? "");
    schEl.appendChild(stopH);
    const remH = document.createElement("input");
    remH.type = "hidden";
    remH.id = `${ctx.idBase}-sch-${si}-rem`;
    remH.value = String(s.remissionDuration ?? "");
    schEl.appendChild(remH);
    const monthsH = document.createElement("input");
    monthsH.type = "hidden";
    monthsH.id = `${ctx.idBase}-sch-${si}-months`;
    monthsH.value = String(s.durationMonths ?? "");
    schEl.appendChild(monthsH);


    const delSch = document.createElement("button");
    delSch.type = "button";
    delSch.className = "btn btn--ghost";
    delSch.textContent = "Удалить схему";
    delSch.addEventListener("click", () => {
      const st0 = readStateFromDom();
      const arr = ctx.getVisits(st0);
      const vis = /** @type {Record<string, unknown>} */ (arr[idx] || {});
      const schs = Array.isArray(vis.schemes) ? [...vis.schemes] : [];
      schs.splice(si, 1);
      vis.schemes = schs.length ? schs : [defaultScheme()];
      arr[idx] = vis;
      ctx.setVisits(st0, arr);
      reflowVisits(st0, { visitIdx: idx });
    });
    schEl.appendChild(delSch);

    schemesWrap.appendChild(schEl);
  });

  const addSch = document.createElement("button");
  addSch.type = "button";
  addSch.className = "btn btn--ghost";
  addSch.textContent = "Добавить схему";
  addSch.hidden = mp !== "yes";
  addSch.addEventListener("click", () => {
    const st0 = readStateFromDom();
    const arr = ctx.getVisits(st0);
    const vis = /** @type {Record<string, unknown>} */ (arr[idx] || defaultVisit());
    const schs = Array.isArray(vis.schemes) ? [...vis.schemes] : [];
    schs.push(defaultScheme());
    vis.schemes = schs;
    arr[idx] = vis;
    ctx.setVisits(st0, arr);
    reflowVisits(st0, { visitIdx: idx });
  });
  schemesWrap.appendChild(addSch);
  row.appendChild(schemesWrap);

  row.querySelectorAll(`input[name="${ctx.idBase}-rx"]`).forEach((el) => {
    el.addEventListener("change", () => {
      const st0 = readStateFromDom();
      const arr = ctx.getVisits(st0);
      const vis = /** @type {Record<string, unknown>} */ (arr[idx] || defaultVisit());
      const r = row.querySelector(`input[name="${ctx.idBase}-rx"]:checked`);
      vis.medsPrescribed = r instanceof HTMLInputElement ? r.value : "";
      if (vis.medsPrescribed === "yes" && (!Array.isArray(vis.schemes) || !vis.schemes.length)) {
        vis.schemes = [defaultScheme()];
      }
      if (vis.medsPrescribed === "no") vis.schemes = [];
      arr[idx] = vis;
      ctx.setVisits(st0, arr);
      reflowVisits(st0, { visitIdx: idx });
    });
  });

  const del = document.createElement("button");
  del.type = "button";
  del.className = "btn btn--ghost";
  del.textContent = "Удалить визит";
  del.addEventListener("click", () => {
    const st0 = readStateFromDom();
    const arr = ctx.getVisits(st0);
    arr.splice(idx, 1);
    ctx.setVisits(st0, arr.length ? arr : [defaultVisit()]);
    reflowVisits(st0, { visitIdx: Math.min(idx, arr.length - 1) });
  });
  row.appendChild(del);
  return row;
}

/**
 * @param {Record<string, unknown>} ep
 * @param {number} ei
 * @param {(name: string, value: string, label: string, checked: boolean) => HTMLElement} radioRow
 * @param {() => Record<string, unknown>} readStateFromDom
 * @param {(st: Record<string, unknown>) => void} reflowVisits
 */
function createRelapseEpisodeBlock(ep, ei, radioRow, readStateFromDom, reflowVisits) {
  const wrap = document.createElement("div");
  wrap.className = "mh-dis-relapse-ep mh-life-custom-wrap";
  wrap.dataset.relIdx = String(ei);
  const t = document.createElement("p");
  t.className = "mh-life-childhood-visit-title";
  t.textContent = `Повторное ухудшение ${ei + 1}`;
  wrap.appendChild(t);
  const whenP = document.createElement("p");
  whenP.className = "mh-prompt";
  whenP.textContent = "Когда наступило это повторное ухудшение?";
  wrap.appendChild(whenP);
  wrap.appendChild(radioRow(`mh-dis-rel-${ei}-debut`, "monthYear", "Месяц и год", ep.debutMode === "monthYear"));
  wrap.appendChild(radioRow(`mh-dis-rel-${ei}-debut`, "age", "Возраст (полных лет)", ep.debutMode === "age"));
  wrap.appendChild(radioRow(`mh-dis-rel-${ei}-debut`, "unknown", "Не помню", ep.debutMode === "unknown"));
  const rowMy = document.createElement("div");
  rowMy.className = "mh-life-row";
  rowMy.appendChild(document.createTextNode("Месяц: "));
  const sm = document.createElement("select");
  sm.id = `mh-dis-rel-${ei}-debut-month`;
  sm.className = "mh-life-select";
  const o0 = document.createElement("option");
  o0.value = "";
  o0.textContent = "—";
  sm.appendChild(o0);
  for (let m = 1; m <= 12; m += 1) {
    const o = document.createElement("option");
    o.value = String(m);
    o.textContent = MONTH_NAMES_RU[m];
    if (String(ep.debutMonth) === String(m)) o.selected = true;
    sm.appendChild(o);
  }
  rowMy.appendChild(sm);
  rowMy.appendChild(document.createTextNode(" Год: "));
  const sy = document.createElement("input");
  sy.type = "number";
  sy.className = "mh-life-text mh-life-text--narrow";
  sy.id = `mh-dis-rel-${ei}-debut-year`;
  sy.value = String(ep.debutYear ?? "");
  rowMy.appendChild(sy);
  wrap.appendChild(rowMy);
  const rowAge = document.createElement("div");
  rowAge.className = "mh-life-row";
  rowAge.appendChild(document.createTextNode("Возраст (полных лет): "));
  const ag = document.createElement("input");
  ag.type = "number";
  ag.className = "mh-life-text mh-life-text--narrow";
  ag.id = `mh-dis-rel-${ei}-debut-age`;
  ag.value = String(ep.debutAge ?? "");
  rowAge.appendChild(ag);
  wrap.appendChild(rowAge);
  wrap.appendChild(radioRow(`mh-dis-rel-${ei}-onset`, "gradual", "Постепенно", ep.onset === "gradual"));
  wrap.appendChild(radioRow(`mh-dis-rel-${ei}-onset`, "acute", "Быстро", ep.onset === "acute"));
  wrap.appendChild(radioRow(`mh-dis-rel-${ei}-onset`, "unknown", "Не помню", ep.onset === "unknown"));

  const afterP = document.createElement("p");
  afterP.className = "mh-prompt";
  afterP.textContent =
    "Обращения к специалистам и медикаментозное лечение (психотропы) после этого повторного ухудшения — по той же схеме, что и для раннего периода:";
  wrap.appendChild(afterP);

  const visWrap = document.createElement("div");
  visWrap.className = "mh-life-early-sub";
  const visList = document.createElement("div");
  visList.id = `mh-dis-rel-${ei}-vis-list`;
  const rep = /** @type {Record<string, unknown>} */ (ep);
  const rpVis =
    Array.isArray(rep.priorVisits) && rep.priorVisits.length ? rep.priorVisits : [defaultVisit()];
  rpVis.forEach((v, vi) => {
    visList.appendChild(
      createPriorVisitRow(
        /** @type {Record<string, unknown>} */ (v),
        vi,
        readStateFromDom,
        reflowVisits,
        radioRow,
        visitRowBindRelapse(ei, vi),
      ),
    );
  });
  const addEpVis = document.createElement("button");
  addEpVis.type = "button";
  addEpVis.className = "btn btn--ghost";
  addEpVis.textContent = "Добавить визит в этот эпизод";
  addEpVis.addEventListener("click", () => {
    const st = readStateFromDom();
    const eps = [...(Array.isArray(st.relapseEpisodes) ? st.relapseEpisodes : [])];
    const curEp = {
      ...(eps[ei] && typeof eps[ei] === "object" ? /** @type {Record<string, unknown>} */ (eps[ei]) : defaultRelapseEpisode()),
    };
    const arr = Array.isArray(curEp.priorVisits) ? [...curEp.priorVisits] : [];
    arr.push(defaultVisit());
    curEp.priorVisits = arr;
    eps[ei] = curEp;
    st.relapseEpisodes = eps;
    reflowVisits(st);
  });
  visWrap.appendChild(visList);
  visWrap.appendChild(addEpVis);
  wrap.appendChild(visWrap);
  return wrap;
}

/**
 * @param {{ title: string; intro: string } | null} [blockLeadOverride]
 */
export function renderDiseaseStructuredStep(contentEl, answers, qIndex, stepsLen, gender, nextWizardBtn, blockLeadOverride) {
  const state = parseDiseaseStructuredString(answers[DISEASE_STRUCTURED_ID]);
  contentEl.replaceChildren();
  delete contentEl.dataset.itogEnhanced;
  if (blockLeadOverride) {
    try {
      contentEl.dataset.mhBlockLead = JSON.stringify(blockLeadOverride);
    } catch {
      delete contentEl.dataset.mhBlockLead;
    }
  }

  const progressEl = contentEl.closest(".mh-step")?.querySelector(".mh-progress");
  if (progressEl) progressEl.textContent = `Шаг опросника: ${qIndex + 1} из ${stepsLen}`;

  /** @type {{ title: string; intro: string } | undefined} */
  let parsedLead = blockLeadOverride ?? undefined;
  if (!parsedLead && contentEl.dataset.mhBlockLead) {
    try {
      parsedLead = JSON.parse(contentEl.dataset.mhBlockLead);
    } catch {
      parsedLead = undefined;
    }
  }
  const lead = parsedLead ?? {
    title: "Анамнез заболевания",
    intro: "Заполните поля ниже — текст для Word формируется по правилам блока.",
  };
  const h2 = document.createElement("h2");
  h2.className = "mh-block-title";
  h2.textContent = lead.title;
  contentEl.appendChild(h2);
  const intro = document.createElement("p");
  intro.className = "mh-prompt";
  intro.textContent = lead.intro;
  contentEl.appendChild(intro);

  function fieldset(title) {
    const fs = document.createElement("fieldset");
    fs.className = "mh-life-fieldset";
    if (title) {
      const leg = document.createElement("legend");
      leg.className = "mh-life-legend";
      leg.textContent = title;
      fs.appendChild(leg);
    }
    return fs;
  }

  function radioRow(name, value, label, checked) {
    const lab = document.createElement("label");
    lab.className = "mh-life-radio";
    const inp = document.createElement("input");
    inp.type = "radio";
    inp.name = name;
    inp.value = value;
    inp.checked = checked;
    lab.appendChild(inp);
    lab.appendChild(document.createTextNode(` ${label}`));
    return lab;
  }

  const episodes0 = Array.isArray(state.episodes) && state.episodes.length ? state.episodes : [defaultEpisode()];

  function readStateFromDom() {
    readDiseaseStructuredFromDom(contentEl, answers);
    return parseDiseaseStructuredString(answers[DISEASE_STRUCTURED_ID]);
  }

  function reflowEpisodes(st, focus) {
    const scrollY = window.scrollY;
    answers[DISEASE_STRUCTURED_ID] = JSON.stringify(st);
    renderDiseaseStructuredStep(contentEl, answers, qIndex, stepsLen, gender, nextWizardBtn);
    requestAnimationFrame(() => {
      if (focus?.episodeIdx != null) {
        const row = contentEl.querySelector(
          `#mh-dis-episodes-list .mh-dis-episode[data-episode-idx="${focus.episodeIdx}"]`,
        );
        row?.scrollIntoView({ block: "nearest", behavior: "instant" });
      } else {
        window.scrollTo(0, scrollY);
      }
    });
  }

  const epList = document.createElement("div");
  epList.id = "mh-dis-episodes-list";
  epList.className = "mh-dis-timeline";
  episodes0.forEach((ep, ei) => {
    const wrap = document.createElement("div");
    appendDiseaseEpisodeBlock(
      wrap,
      /** @type {Record<string, unknown>} */ (ep),
      ei,
      episodes0.length,
      radioRow,
      readStateFromDom,
      reflowEpisodes,
      fieldset,
    );
    epList.appendChild(wrap);
  });
  contentEl.appendChild(epList);

  const lastEp = /** @type {Record<string, unknown>} */ (episodes0[episodes0.length - 1] || {});
  const addEp = document.createElement("button");
  addEp.type = "button";
  addEp.className = "btn btn--ghost";
  addEp.textContent = "Добавить эпизод ухудшения";
  addEp.hidden = String(lastEp.durationEndMode ?? "") === "current";
  addEp.addEventListener("click", () => {
    const st = readStateFromDom();
    const arr = Array.isArray(st.episodes) ? [...st.episodes] : [];
    const prev = /** @type {Record<string, unknown>} */ (arr[arr.length - 1] || defaultEpisode());
    if (String(prev.durationEndMode ?? "") === "current") return;
    arr.push(defaultEpisode());
    st.episodes = arr;
    reflowEpisodes(st, { episodeIdx: arr.length - 1 });
  });
  contentEl.appendChild(addEp);

  if (nextWizardBtn) nextWizardBtn.textContent = qIndex >= stepsLen - 1 ? "Завершить" : "Далее";
  if (isItogMode()) enhanceItogDiseaseStep(contentEl);
}
