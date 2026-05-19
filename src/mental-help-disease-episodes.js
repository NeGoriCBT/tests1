/**
 * Эпизоды ухудшения в структурированном анамнезе заболевания.
 */
import { drugIdToMolecule } from "./mental-help-disease-drugs.js";
import { allDiseaseDrugIds } from "./mental-help-disease-drugs.js";
import { formatEarlySymptomsForWord } from "./mental-help-disease-early-symptoms-data.js";
import {
  STRESSOR_NONE_LABEL,
  normalizeStressorsList,
  stressorLabelToGenitive,
} from "./mental-help-disease-stressors-data.js";

export const PSYCH_SPEC_CODES = [
  ["psychiatrist", "Психиатр"],
  ["psychotherapist", "Психотерапевт"],
  ["psychiatrist_narcologist", "Врач-психиатр-нарколог"],
  ["psychologist", "Психолог"],
];

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

const MONTH_NAMES_GEN_RU = [
  "",
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

const SOMATIC_FREQUENCY_LABELS = {
  once: "однократно",
  several: "несколько раз",
  many: "многократно",
};

const SOMATIC_FINDING_LABELS = {
  none_found: "соматической патологии не выявлено",
  found: "была выявлена соматическая патология",
};

const SOMATIC_TREATMENT_BASE = {
  better: "назначено лечение, отмечено улучшение",
  no_effect: "улучшение не наступило",
  partial: "частичное улучшение",
  not_prescribed: "лечение не назначено",
  not_taken: "лечение не принимал(а)",
};

const SPEC_WORD = {
  psychiatrist: "врачу-психиатру",
  psychotherapist: "врачу-психотерапевту",
  psychiatrist_narcologist: "врачу-психиатру-наркологу",
  psychologist: "психологу",
};

const SPEC_LABEL = Object.fromEntries(PSYCH_SPEC_CODES);

export const MH_CLINIC_VISIT_REASON_LABELS = {
  own_wish: "по собственному желанию",
  relatives: "по настоянию родственников",
};

function listWithAnd(parts) {
  const p = parts.filter(Boolean);
  if (!p.length) return "";
  if (p.length === 1) return p[0];
  if (p.length === 2) return `${p[0]} и ${p[1]}`;
  return `${p.slice(0, -1).join(", ")} и ${p[p.length - 1]}`;
}

/** @param {"male" | "female" | null} gender @param {string} male @param {string} female @param {string} neutral */
function genderPhrase(gender, male, female, neutral) {
  if (gender === "female") return female;
  if (gender === "male") return male;
  return neutral;
}

/** @param {string[]} a @param {string[]} b */
function arraysEqualSorted(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

/** @param {string} stem */
function professionStemToDative(stem) {
  const low = stem.trim().charAt(0).toLowerCase() + stem.trim().slice(1);
  if (!low) return "";
  if (low.endsWith("олог")) return `${low.slice(0, -4)}ологу`;
  if (low.endsWith("иатр")) return `${low.slice(0, -4)}иатру`;
  if (low.endsWith("евт")) return `${low.slice(0, -3)}евту`;
  if (low.endsWith("ург")) return `${low.slice(0, -3)}ургу`;
  if (low.endsWith("ист")) return `${low.slice(0, -3)}исту`;
  if (low.endsWith("лог")) return `${low.slice(0, -3)}логу`;
  if (low.endsWith("ь")) return `${low.slice(0, -1)}ю`;
  return `${low}у`;
}

/** @param {string} label */
function somaticSpecialtyToDative(label) {
  const t = String(label ?? "").trim();
  if (!t) return "";
  const m = t.match(/^врач[-\s]+(.+)$/i);
  if (m) {
    const d = professionStemToDative(m[1]);
    return d ? `врачу-${d}` : `врачу (${m[1].toLowerCase()})`;
  }
  const d = professionStemToDative(t);
  return d || t.toLowerCase();
}

/** @param {Record<string, unknown>} ep */
function episodeHasTimeline(ep) {
  return Boolean(
    ep.startMode ||
      ep.durationEndMode ||
      ep.onset === "gradual" ||
      ep.onset === "acute" ||
      ep.onset === "unknown",
  );
}

/** @param {Record<string, unknown>} ep */
function episodeHasClinicalContent(ep) {
  return Boolean(
    String(ep.somaticConsult ?? "") ||
      (Array.isArray(ep.psychSpecialists) && ep.psychSpecialists.length) ||
      String(ep.medsPrescribed ?? "") === "yes" ||
      String(ep.medsPrescribed ?? "") === "no" ||
      String(ep.earlySymptoms ?? "").trim(),
  );
}

/** @param {"male" | "female" | null} gender @param {string} code */
function somaticTreatmentLabel(code, gender) {
  if (code === "not_taken") {
    return genderPhrase(gender, "лечение не принимал", "лечение не принимала", "лечение не принимал(а)");
  }
  return SOMATIC_TREATMENT_BASE[/** @type {keyof typeof SOMATIC_TREATMENT_BASE} */ (code)] ?? "";
}

/** @returns {Record<string, unknown>} */
export function defaultEpisode() {
  return {
    startMode: "",
    startMonth: "",
    startYear: "",
    durationEndMode: "",
    durationEndMonth: "",
    durationEndYear: "",
    onset: "",
    earlySymptoms: "",
    stressors: [],
    stressorsIllnessDetail: "",
    stressorsTraumaDetail: "",
    stressorsOther: "",
    somaticConsult: "",
    somaticSpecialists: [],
    somaticFrequency: "",
    somaticFinding: "",
    somaticTreatment: "",
    psychSpecialists: [],
    medsPrescribed: "",
    episodeMeds: [],
    improvementDurationMonths: "",
    mhClinicVisitReason: "",
    mhClinicVisitDetail: "",
  };
}

/** @param {unknown} raw */
function normalizeEpisodeMed(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const drugId = typeof o.drugId === "string" ? o.drugId.trim() : "";
  if (drugId && !allDiseaseDrugIds().includes(drugId)) return null;
  const effect = typeof o.effect === "string" ? o.effect : "";
  const okEffect = ["improvement", "remission", "none", "worse", ""].includes(effect);
  const durationModeRaw = typeof o.durationMode === "string" ? o.durationMode : "";
  const durationMode =
    durationModeRaw === "months" || durationModeRaw === "current" ? durationModeRaw : "";
  const durationMonths = typeof o.durationMonths === "string" ? o.durationMonths : "";
  const resolvedMode =
    durationMode || (durationMonths ? "months" : o.durationCurrent === true ? "current" : "");
  return {
    drugId,
    maxDose: typeof o.maxDose === "string" ? o.maxDose : "",
    doseUnknown: o.doseUnknown === true,
    durationMode: resolvedMode,
    durationMonths: resolvedMode === "months" ? durationMonths : "",
    effect: okEffect ? effect : "",
  };
}

/** @param {unknown} raw */
export function normalizeEpisode(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const medsRaw = Array.isArray(o.episodeMeds) ? o.episodeMeds : [];
  let episodeMeds = medsRaw.map(normalizeEpisodeMed).filter(Boolean);
  const psychRaw = Array.isArray(o.psychSpecialists) ? o.psychSpecialists : [];
  const psychSpecialists = psychRaw.filter((c) => PSYCH_SPEC_CODES.some(([code]) => code === c));
  const mp = typeof o.medsPrescribed === "string" ? o.medsPrescribed : "";
  if (mp === "yes" && !episodeMeds.length) {
    episodeMeds = [{ drugId: "", maxDose: "", doseUnknown: false, durationMode: "", durationMonths: "", effect: "" }];
  } else if (mp !== "yes") {
    episodeMeds = [];
  }
  const durationEndMode = typeof o.durationEndMode === "string" ? o.durationEndMode : "";
  const mhReasonRaw = typeof o.mhClinicVisitReason === "string" ? o.mhClinicVisitReason : "";
  const mhClinicVisitReason =
    durationEndMode === "current" && (mhReasonRaw === "own_wish" || mhReasonRaw === "relatives")
      ? mhReasonRaw
      : "";
  const mhClinicVisitDetail =
    durationEndMode === "current" && mhClinicVisitReason
      ? typeof o.mhClinicVisitDetail === "string"
        ? o.mhClinicVisitDetail.trim()
        : ""
      : "";
  return {
    startMode: typeof o.startMode === "string" ? o.startMode : "",
    startMonth: typeof o.startMonth === "string" ? o.startMonth : "",
    startYear: typeof o.startYear === "string" ? o.startYear : "",
    durationEndMode: typeof o.durationEndMode === "string" ? o.durationEndMode : "",
    durationEndMonth: typeof o.durationEndMonth === "string" ? o.durationEndMonth : "",
    durationEndYear: typeof o.durationEndYear === "string" ? o.durationEndYear : "",
    onset: typeof o.onset === "string" ? o.onset : "",
    earlySymptoms: typeof o.earlySymptoms === "string" ? o.earlySymptoms : "",
    stressors: normalizeStressorsList(o.stressors),
    stressorsIllnessDetail: typeof o.stressorsIllnessDetail === "string" ? o.stressorsIllnessDetail : "",
    stressorsTraumaDetail: typeof o.stressorsTraumaDetail === "string" ? o.stressorsTraumaDetail : "",
    stressorsOther: typeof o.stressorsOther === "string" ? o.stressorsOther : "",
    somaticConsult: typeof o.somaticConsult === "string" ? o.somaticConsult : "",
    somaticSpecialists: Array.isArray(o.somaticSpecialists)
      ? o.somaticSpecialists.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean)
      : [],
    somaticFrequency: typeof o.somaticFrequency === "string" ? o.somaticFrequency : "",
    somaticFinding: typeof o.somaticFinding === "string" ? o.somaticFinding : "",
    somaticTreatment: typeof o.somaticTreatment === "string" ? o.somaticTreatment : "",
    psychSpecialists,
    medsPrescribed: mp === "yes" || mp === "no" ? mp : "",
    episodeMeds,
    improvementDurationMonths: typeof o.improvementDurationMonths === "string" ? o.improvementDurationMonths : "",
    mhClinicVisitReason,
    mhClinicVisitDetail,
  };
}

/** @param {Record<string, unknown>} ep @param {"male" | "female" | null} gender */
function formatMhClinicVisitSentence(ep, gender) {
  if (String(ep.durationEndMode ?? "") !== "current") return "";
  const reason = String(ep.mhClinicVisitReason ?? "");
  const reasonLabel =
    MH_CLINIC_VISIT_REASON_LABELS[/** @type {keyof typeof MH_CLINIC_VISIT_REASON_LABELS} */ (reason)] ?? "";
  if (!reasonLabel) return "";
  const decided = genderPhrase(
    gender,
    "решил обратиться",
    "решила обратиться",
    "принято решение обратиться",
  );
  const detail = String(ep.mhClinicVisitDetail ?? "").trim();
  let line = `С указанными жалобами ${decided} в клинику Mental Help ${reasonLabel}`;
  if (detail) line += ` (${detail})`;
  return `${line}.`;
}

/**
 * @param {string | number} month
 * @param {string | number} year
 * @param {"prep" | "gen" | "nom"} caseType
 */
function monthYearPhrase(month, year, caseType = "prep") {
  const m = Number(month);
  const y = String(year ?? "").trim();
  let mn = "";
  if (m >= 1 && m <= 12) {
    if (caseType === "gen") mn = MONTH_NAMES_GEN_RU[m];
    else if (caseType === "prep") mn = MONTH_NAMES_PREP_RU[m];
    else mn = MONTH_NAMES_RU[m];
  }
  if (mn && y) return `${mn} ${y} года`;
  if (y) return `${y} год`;
  if (mn) return mn;
  return "";
}

/**
 * @param {string | number} month
 * @param {string | number} year
 * @returns {number | null}
 */
function monthYearSortKey(month, year) {
  const m = Number(month);
  const y = Number(String(year ?? "").trim());
  if (m >= 1 && m <= 12 && y > 0) return y * 12 + m;
  return null;
}

/** @param {Record<string, unknown>} ep */
function episodeStartSortKey(ep) {
  if (String(ep.startMode ?? "") !== "monthYear") return null;
  return monthYearSortKey(ep.startMonth, ep.startYear);
}

/**
 * @param {Record<string, unknown>} ep
 * @returns {number | null | "current"}
 */
function episodeEndSortKey(ep) {
  const dem = String(ep.durationEndMode ?? "");
  if (dem === "current") return "current";
  if (dem !== "monthYear") return null;
  return monthYearSortKey(ep.durationEndMonth, ep.durationEndYear);
}

/** @param {Record<string, unknown>} ep */
function episodeOnsetAdverb(ep) {
  const on = String(ep.onset ?? "");
  if (on === "gradual") return "постепенно";
  if (on === "acute") return "остро";
  return "";
}

/** @param {Record<string, unknown>} ep @param {Record<string, unknown>} stateForStress */
function episodeStressorsClause(ep, stateForStress) {
  const stressSel = normalizeStressorsList(ep.stressors);
  const otherT = String(ep.stressorsOther ?? "").trim();
  if (stressSel.includes(STRESSOR_NONE_LABEL)) {
    return "ни с чем конкретным не связывает";
  }
  const strBits = [];
  for (const lab of stressSel) {
    const g = stressorLabelToGenitive(lab, { ...stateForStress, ...ep });
    if (g) strBits.push(g);
  }
  if (otherT) strBits.push(`иного обстоятельства (со слов: ${otherT})`);
  if (!strBits.length) return "";
  return `на фоне ${listWithAnd(strBits)}`;
}

/**
 * @param {Record<string, unknown>} ep
 * @param {boolean} isFirst
 * @param {boolean} isLast
 * @param {Record<string, unknown>} state
 */
function buildEpisodeTimelineSentence(ep, isFirst, isLast, state) {
  const sm = String(ep.startMode ?? "");
  const onset = episodeOnsetAdverb(ep);
  const onUnknown = String(ep.onset ?? "") === "unknown";
  const isCurrent = String(ep.durationEndMode ?? "") === "current";

  // Эпизод ухудшения (не дебют) до текущего момента
  if (!isFirst && isCurrent) {
    /** @type {string[]} */
    const parts = [];
    if (sm === "monthYear") {
      const ph = monthYearPhrase(ep.startMonth, ep.startYear, "gen");
      if (ph) parts.push(`Текущее ухудшение с ${ph}${onset ? ` ${onset}` : ""}`);
      else parts.push("Текущее ухудшение");
    } else if (sm === "unknown") {
      parts.push("Текущее ухудшение, дату начала не помнит");
    } else {
      parts.push("Текущее ухудшение");
    }
    if (onUnknown && !onset) parts.push("темп нарастания симптомов не помнит");
    const stress = episodeStressorsClause(ep, state);
    if (stress) parts.push(stress);
    if (!parts.length) return "";
    return `${parts.join(", ")}.`;
  }

  let head = "";
  if (isFirst) {
    if (sm === "monthYear") {
      const ph = monthYearPhrase(ep.startMonth, ep.startYear, "prep");
      if (ph) head = `Заболевание дебютировало в ${ph}${onset ? ` ${onset}` : ""}`;
    } else if (sm === "unknown") {
      head = "Не помнит дату начала симптомов";
    }
  } else if (sm === "monthYear") {
    const ph = monthYearPhrase(ep.startMonth, ep.startYear, "prep");
    if (ph) head = `Повторное ухудшение наступило в ${ph}${onset ? ` ${onset}` : ""}`;
  } else if (sm === "unknown") {
    head = "Не помнит дату повторного ухудшения";
  }

  /** @type {string[]} */
  const tail = [];
  if (onUnknown && !onset) {
    tail.push("темп нарастания симптомов не помнит");
  }

  if (isFirst && isCurrent) {
    tail.push("состояние продолжается по настоящее время");
  } else if (!isCurrent) {
    const dem = String(ep.durationEndMode ?? "");
    if (dem === "monthYear") {
      const ph = monthYearPhrase(ep.durationEndMonth, ep.durationEndYear, "gen");
      if (ph) tail.push(`состояние длилось до ${ph}`);
    } else if (dem === "unknown") {
      tail.push("длительность эпизода не помнит");
    }
  }

  const stress = episodeStressorsClause(ep, state);
  if (stress) tail.push(stress);

  if (!head && !tail.length) return "";
  if (head && tail.length) return `${head}, ${tail.join(", ")}.`;
  if (head) return `${head}.`;
  return `${tail.join(", ")}.`;
}

/** @param {Record<string, unknown>} drug @param {"male" | "female" | null} gender */
function formatDrugBitCompact(drug, gender) {
  const id = String(drug.drugId ?? "").trim();
  if (!id) return "";
  const mol = drugIdToMolecule(id);
  const dose = String(drug.maxDose ?? "").trim();
  const durMode = String(drug.durationMode ?? "");
  const dur = String(drug.durationMonths ?? "").trim();
  const eff = String(drug.effect ?? "");
  /** @type {string[]} */
  const inner = [];
  if (drug.doseUnknown === true) inner.push("доза не уточняется");
  else if (dose) inner.push(`макс. ${dose} мг`);
  if (durMode === "current") {
    inner.push(genderPhrase(gender, "по настоящее время", "по настоящее время", "по настоящее время"));
  } else if (dur) inner.push(`${dur} мес`);
  let bit = inner.length ? `${mol} (${inner.join(", ")})` : mol;
  if (eff === "none") bit += " — без эффекта";
  else if (eff === "worse") bit += " — ухудшение";
  return bit;
}

/** @param {Record<string, unknown>} ep @param {"male" | "female" | null} gender */
function formatEpisodeMedsSentence(ep, gender) {
  const meds = (Array.isArray(ep.episodeMeds) ? ep.episodeMeds : [])
    .map((d) => formatDrugBitCompact(/** @type {Record<string, unknown>} */ (d), gender))
    .filter(Boolean);
  if (!meds.length) return "";
  const assigned = genderPhrase(gender, "Назначались", "Назначались", "Назначалось лечение");
  let line = `${assigned} ${listWithAnd(meds)}`;
  const rawMeds = Array.isArray(ep.episodeMeds) ? ep.episodeMeds : [];
  const hasImprovement = rawMeds.some((d) => {
    const e = String(/** @type {Record<string, unknown>} */ (d).effect ?? "");
    return e === "improvement" || e === "remission";
  });
  if (hasImprovement) {
    line += `, ${genderPhrase(gender, "отмечает улучшение", "отмечает улучшение", "отмечает улучшение")}`;
    const impDur = String(ep.improvementDurationMonths ?? "").trim();
    if (impDur) line += ` в течение ${impDur} мес`;
  }
  return `${line}.`;
}

/**
 * @param {Record<string, unknown>} ep
 * @param {"male" | "female" | null} gender
 * @param {string[]} prevPsychSpecs
 * @returns {string[]}
 */
function formatEpisodePsychSentences(ep, gender, prevPsychSpecs) {
  const specs = Array.isArray(ep.psychSpecialists) ? ep.psychSpecialists : [];
  const dests = specs.map((c) => SPEC_WORD[/** @type {keyof typeof SPEC_WORD} */ (c)]).filter(Boolean);
  const mp = String(ep.medsPrescribed ?? "");
  /** @type {string[]} */
  const lines = [];
  if (!specs.length && mp !== "yes" && mp !== "no") return lines;

  const appealed = genderPhrase(gender, "обращался", "обращалась", "обращался(лась)");
  const sameSpecs = prevPsychSpecs.length > 0 && arraysEqualSorted(specs, prevPsychSpecs);

  if (specs.length) {
    if (sameSpecs) {
      lines.push(`К тем же специалистам, что и при предыдущем эпизоде (${listWithAnd(dests)}).`);
    } else {
      lines.push(`${appealed.charAt(0).toUpperCase() + appealed.slice(1)} к ${listWithAnd(dests)}.`);
    }
  }

  if (mp === "no") {
    lines.push("Медикаментозное лечение психотропными препаратами не назначалось.");
    return lines;
  }
  if (mp === "yes") {
    const medLine = formatEpisodeMedsSentence(ep, gender);
    if (medLine) lines.push(medLine);
  }
  return lines;
}

/** @param {Record<string, unknown>} ep @param {"male" | "female" | null} gender */
function formatEpisodeSomaticSentence(ep, gender) {
  const sc = String(ep.somaticConsult ?? "");
  if (sc === "no") {
    const neg = genderPhrase(gender, "не обращался", "не обращалась", "не обращался(лась)");
    return `К врачам соматического профиля по поводу этого эпизода ${neg}.`;
  }
  if (sc === "unknown") return "Обращение к врачам соматического профиля по этому эпизоду не помнит.";
  if (sc !== "yes") return "";

  const specs = Array.isArray(ep.somaticSpecialists) ? ep.somaticSpecialists.filter(Boolean) : [];
  const freq = SOMATIC_FREQUENCY_LABELS[/** @type {keyof typeof SOMATIC_FREQUENCY_LABELS} */ (String(ep.somaticFrequency ?? ""))] ?? "";
  const finding = SOMATIC_FINDING_LABELS[/** @type {keyof typeof SOMATIC_FINDING_LABELS} */ (String(ep.somaticFinding ?? ""))] ?? "";
  const treatCode = String(ep.somaticTreatment ?? "");
  const treat = somaticTreatmentLabel(treatCode, gender);

  const appealed = genderPhrase(gender, "обращался", "обращалась", "обращался(лась)");
  const datives = specs.map(somaticSpecialtyToDative).filter(Boolean);
  const toWhom = datives.length ? listWithAnd(datives) : "врачам соматического профиля";

  let sentence = freq
    ? `${freq.charAt(0).toUpperCase() + freq.slice(1)} ${appealed} к ${toWhom}`
    : `${appealed.charAt(0).toUpperCase() + appealed.slice(1)} к ${toWhom}`;

  const tail = [finding, treat].filter(Boolean);
  if (tail.length) sentence += `; ${tail.join(", ")}`;
  return `${sentence}.`;
}

/**
 * @param {Record<string, unknown>} ep
 * @param {{
 *   gender: "male" | "female" | null;
 *   state: Record<string, unknown>;
 *   isFirst: boolean;
 *   isLast: boolean;
 *   index: number;
 *   episodeCount: number;
 *   prevEarlySymptoms: string;
 *   prevPsychSpecs: string[];
 * }} ctx
 */
function formatSingleEpisodeParagraph(ep, ctx) {
  /** @type {string[]} */
  const sentences = [];

  const timeline = buildEpisodeTimelineSentence(ep, ctx.isFirst, ctx.isLast, ctx.state);
  if (timeline) sentences.push(timeline);
  else if (episodeHasClinicalContent(ep)) {
    sentences.push(
      genderPhrase(ctx.gender, "Даты эпизода не уточняет.", "Даты эпизода не уточняет.", "Даты эпизода не уточняет."),
    );
  }

  const earlyRaw = String(ep.earlySymptoms ?? "").trim();
  if (earlyRaw) {
    const early = formatEarlySymptomsForWord(earlyRaw, {
      isRelapse: !ctx.isFirst,
      sameAsPrevious: Boolean(ctx.prevEarlySymptoms && earlyRaw === ctx.prevEarlySymptoms),
    });
    if (early) sentences.push(early);
  }

  const som = formatEpisodeSomaticSentence(ep, ctx.gender);
  if (som) sentences.push(som);

  for (const ln of formatEpisodePsychSentences(ep, ctx.gender, ctx.prevPsychSpecs)) {
    sentences.push(ln);
  }

  if (ctx.isLast && String(ep.durationEndMode ?? "") === "current") {
    const mh = formatMhClinicVisitSentence(ep, ctx.gender);
    if (mh) sentences.push(mh);
  }

  const body = sentences.filter(Boolean).join(" ");
  if (!body) return "";

  if (ctx.episodeCount > 1) {
    const label = ctx.isFirst ? "Эпизод 1 (дебют)." : `Эпизод ${ctx.index + 1}.`;
    return `${label} ${body}`;
  }
  return body;
}

/**
 * @param {Array<Record<string, unknown>>} episodes
 * @param {"male" | "female" | null} gender
 */
/**
 * Проверка хронологии дат эпизодов.
 * @param {Array<Record<string, unknown>>} episodes
 */
export function collectDiseaseDateWarnings(episodes) {
  /** @type {string[]} */
  const warnings = [];
  const eps = episodes.length ? episodes : [defaultEpisode()];

  if (eps.length >= 1) {
    const ep1 = eps[0];
    const start1 = episodeStartSortKey(ep1);
    const end1 = episodeEndSortKey(ep1);
    if (start1 != null && typeof end1 === "number" && start1 > end1) {
      const endPh = monthYearPhrase(ep1.durationEndMonth, ep1.durationEndYear, "gen");
      warnings.push(
        `Дебют: дата начала не может быть позже окончания первого эпизода${endPh ? ` (до ${endPh})` : ""}.`,
      );
    }
    if (end1 === "current" && eps.length > 1) {
      warnings.push(
        "Дебют указан «по текущий момент» — повторное ухудшение возможно только после даты окончания дебюта.",
      );
    }
  }

  for (let i = 1; i < eps.length; i++) {
    const prev = eps[i - 1];
    const cur = eps[i];
    const prevStart = episodeStartSortKey(prev);
    const prevEnd = episodeEndSortKey(prev);
    const curStart = episodeStartSortKey(cur);

    if (typeof prevEnd === "number" && curStart != null && curStart <= prevEnd) {
      const prevEndPh = monthYearPhrase(prev.durationEndMonth, prev.durationEndYear, "gen");
      const curStartPh = monthYearPhrase(cur.startMonth, cur.startYear, "prep");
      warnings.push(
        `Эпизод ${i + 1}: начало${curStartPh ? ` (${curStartPh})` : ""} попадает в период дебюта/лечения (первый эпизод до ${prevEndPh || "указанной даты"}). Укажите дату после окончания предыдущего эпизода.`,
      );
    }

    if (prevStart != null && curStart != null && curStart < prevStart) {
      warnings.push(`Эпизод ${i + 1}: дата начала раньше начала предыдущего эпизода.`);
    }

    const curEnd = episodeEndSortKey(cur);
    const curStartKey = episodeStartSortKey(cur);
    if (typeof curEnd === "number" && curStartKey != null && curStartKey > curEnd) {
      warnings.push(`Эпизод ${i + 1}: дата начала позже даты окончания этого эпизода.`);
    }
  }

  return warnings;
}

/**
 * @param {Array<Record<string, unknown>>} episodes
 * @param {"male" | "female" | null} gender
 */
export function collectDiseaseFormatWarnings(episodes, gender) {
  /** @type {string[]} */
  const warnings = [...collectDiseaseDateWarnings(episodes)];
  const eps = episodes.length ? episodes : [defaultEpisode()];

  eps.forEach((ep, i) => {
    const n = i + 1;
    const hasTimeline = episodeHasTimeline(ep);
    const hasClinical = episodeHasClinicalContent(ep);
    if (hasClinical && !hasTimeline) {
      warnings.push(`Эпизод ${n}: указаны врачи или лечение без дат эпизода.`);
    }
    const specs = Array.isArray(ep.psychSpecialists) ? ep.psychSpecialists : [];
    if (String(ep.medsPrescribed ?? "") === "yes" && !specs.length) {
      warnings.push(`Эпизод ${n}: препараты указаны без выбора специалиста.`);
    }
    const meds = Array.isArray(ep.episodeMeds) ? ep.episodeMeds : [];
    const hasImp = meds.some((d) => {
      const e = String(/** @type {Record<string, unknown>} */ (d).effect ?? "");
      return e === "improvement" || e === "remission";
    });
    if (hasImp && !String(ep.improvementDurationMonths ?? "").trim()) {
      warnings.push(`Эпизод ${n}: отмечено улучшение без длительности remission.`);
    }
    if (String(ep.durationEndMode ?? "") === "current" && i === eps.length - 1) {
      const r = String(ep.mhClinicVisitReason ?? "");
      if (r !== "own_wish" && r !== "relatives") {
        warnings.push(`Эпизод ${n}: укажите причину обращения в клинику Mental Help.`);
      }
    }
  });

  const last = eps[eps.length - 1];
  if (eps.length > 1 && last && String(last.durationEndMode ?? "") !== "current") {
    warnings.push("Последний эпизод не завершён «по текущий момент» — проверьте длительность.");
  }

  if (!gender) {
    warnings.push("Пол пациента не указан — в тексте остаются нейтральные формулировки.");
  }

  return warnings;
}

/**
 * @param {unknown} rawState
 * @returns {Array<Record<string, unknown>>}
 */
export function ensureEpisodesFromState(rawState) {
  const o = rawState && typeof rawState === "object" ? /** @type {Record<string, unknown>} */ (rawState) : {};
  if (Array.isArray(o.episodes) && o.episodes.length) {
    return o.episodes.map(normalizeEpisode).filter(Boolean);
  }
  return migrateLegacyToEpisodes(o);
}

/** @param {Record<string, unknown>} o */
function migrateLegacyToEpisodes(o) {
  /** @type {Array<Record<string, unknown>>} */
  const episodes = [];

  /** @param {Record<string, unknown>} src */
  function baseFromDebut(src) {
    const ep = defaultEpisode();
    ep.startMode = src.debutMode === "age" ? "monthYear" : src.debutMode || "";
    ep.startMonth = String(src.debutMonth ?? "");
    ep.startYear = String(src.debutYear ?? "");
    ep.onset = String(src.onset ?? "");
    ep.earlySymptoms = String(src.earlySymptoms ?? "");
    ep.stressors = normalizeStressorsList(src.stressors);
    ep.stressorsIllnessDetail = String(src.stressorsIllnessDetail ?? "");
    ep.stressorsTraumaDetail = String(src.stressorsTraumaDetail ?? "");
    ep.stressorsOther = String(src.stressorsOther ?? "");
    ep.somaticConsult = String(src.somaticConsult ?? "");
    ep.somaticSpecialists = Array.isArray(src.somaticSpecialists) ? [...src.somaticSpecialists] : [];
    ep.somaticFrequency = String(src.somaticFrequency ?? "");
    ep.somaticFinding = String(src.somaticFinding ?? "");
    ep.somaticTreatment = String(src.somaticTreatment ?? "");
    return ep;
  }

  /** @param {unknown[]} visits */
  function applyVisitsToEpisode(ep, visits) {
    const specs = new Set();
    /** @type {unknown[]} */
    const meds = [];
    for (const v of visits) {
      if (!v || typeof v !== "object") continue;
      const vo = /** @type {Record<string, unknown>} */ (v);
      const sp = String(vo.specialist ?? "");
      if (PSYCH_SPEC_CODES.some(([c]) => c === sp)) specs.add(sp);
      if (String(vo.medsPrescribed ?? "") !== "yes") continue;
      ep.medsPrescribed = "yes";
      for (const sch of Array.isArray(vo.schemes) ? vo.schemes : []) {
        const s = /** @type {Record<string, unknown>} */ (sch);
        const outcome = String(s.outcome ?? "");
        for (const d of Array.isArray(s.drugs) ? s.drugs : []) {
          const dr = /** @type {Record<string, unknown>} */ (d);
          if (!String(dr.drugId ?? "").trim()) continue;
          const durM = String(dr.durationMonths ?? "").trim();
          meds.push({
            drugId: dr.drugId,
            maxDose: dr.maxDose,
            doseUnknown: dr.doseUnknown,
            durationMode: durM ? "months" : "",
            durationMonths: durM,
            effect: outcome,
          });
        }
        const rem = String(s.remissionDuration ?? "").trim();
        if (rem && !ep.improvementDurationMonths) ep.improvementDurationMonths = rem;
      }
    }
    ep.psychSpecialists = [...specs];
    if (meds.length) ep.episodeMeds = meds;
    else if (ep.medsPrescribed === "yes")
      ep.episodeMeds = [{ drugId: "", maxDose: "", doseUnknown: false, durationMode: "", durationMonths: "", effect: "" }];
    if (String(o.priorDoctor ?? "") === "no") ep.medsPrescribed = "no";
  }

  const ep1 = baseFromDebut(o);
  const relEps = Array.isArray(o.relapseEpisodes) ? o.relapseEpisodes : [];
  if (relEps.length && relEps[0] && typeof relEps[0] === "object") {
    const r0 = /** @type {Record<string, unknown>} */ (relEps[0]);
    ep1.durationEndMode = "monthYear";
    ep1.durationEndMonth = String(r0.debutMonth ?? "");
    ep1.durationEndYear = String(r0.debutYear ?? "");
  } else if (o.currentWorseningWhen && typeof o.currentWorseningWhen === "object") {
    const cw = /** @type {Record<string, unknown>} */ (o.currentWorseningWhen);
    if (cw.debutMode === "monthYear") {
      ep1.durationEndMode = "monthYear";
      ep1.durationEndMonth = String(cw.debutMonth ?? "");
      ep1.durationEndYear = String(cw.debutYear ?? "");
    } else {
      ep1.durationEndMode = "current";
    }
  } else if (String(o.relapseOccurred ?? "") === "no") {
    ep1.durationEndMode = "current";
  }
  if (String(o.priorDoctor ?? "") === "yes" && Array.isArray(o.priorVisits)) {
    applyVisitsToEpisode(ep1, o.priorVisits);
  }
  episodes.push(normalizeEpisode(ep1));

  relEps.forEach((rel, i) => {
    if (!rel || typeof rel !== "object") return;
    const r = /** @type {Record<string, unknown>} */ (rel);
    const ep = defaultEpisode();
    ep.startMode = r.debutMode === "age" ? "monthYear" : r.debutMode || "";
    ep.startMonth = String(r.debutMonth ?? "");
    ep.startYear = String(r.debutYear ?? "");
    ep.onset = String(r.onset ?? "");
    const next = relEps[i + 1];
    if (next && typeof next === "object") {
      const n = /** @type {Record<string, unknown>} */ (next);
      ep.durationEndMode = "monthYear";
      ep.durationEndMonth = String(n.debutMonth ?? "");
      ep.durationEndYear = String(n.debutYear ?? "");
    } else if (o.currentWorseningWhen && typeof o.currentWorseningWhen === "object") {
      const cw = /** @type {Record<string, unknown>} */ (o.currentWorseningWhen);
      if (cw.debutMode === "monthYear") {
        ep.durationEndMode = "monthYear";
        ep.durationEndMonth = String(cw.debutMonth ?? "");
        ep.durationEndYear = String(cw.debutYear ?? "");
      } else {
        ep.durationEndMode = "current";
      }
    } else {
      ep.durationEndMode = "current";
    }
    if (Array.isArray(r.priorVisits)) applyVisitsToEpisode(ep, r.priorVisits);
    episodes.push(normalizeEpisode(ep));
  });

  const hasCurrent =
    (o.currentWorseningWhen && typeof o.currentWorseningWhen === "object") ||
    String(o.currentEpisodeDoctor ?? "") === "yes";
  if (hasCurrent) {
    const last = episodes[episodes.length - 1];
    if (last && String(last.durationEndMode) === "current") {
      if (String(o.currentEpisodeDoctor ?? "") === "yes" && Array.isArray(o.currentEpisodeVisits)) {
        applyVisitsToEpisode(last, o.currentEpisodeVisits);
      }
    } else {
      const ep = defaultEpisode();
      ep.durationEndMode = "current";
      if (o.currentWorseningWhen && typeof o.currentWorseningWhen === "object") {
        const cw = /** @type {Record<string, unknown>} */ (o.currentWorseningWhen);
        ep.startMode = cw.debutMode === "age" ? "monthYear" : cw.debutMode || "";
        ep.startMonth = String(cw.debutMonth ?? "");
        ep.startYear = String(cw.debutYear ?? "");
        ep.onset = String(cw.onset ?? "");
      }
      if (String(o.currentEpisodeDoctor ?? "") === "yes" && Array.isArray(o.currentEpisodeVisits)) {
        applyVisitsToEpisode(ep, o.currentEpisodeVisits);
      }
      episodes.push(normalizeEpisode(ep));
    }
  }

  const normalized = episodes.map(normalizeEpisode).filter(Boolean);
  return normalized.length ? normalized : [normalizeEpisode(defaultEpisode())];
}

/**
 * @param {Array<Record<string, unknown>>} episodes
 * @param {Record<string, unknown>} state
 * @param {"male" | "female" | null} gender
 * @returns {{ paragraphs: string[]; warnings: string[] }}
 */
export function formatEpisodesForWord(episodes, state, gender) {
  const eps = episodes.length ? episodes : [defaultEpisode()];
  /** @type {string[]} */
  const paragraphs = [];
  let prevEarly = "";
  /** @type {string[]} */
  let prevPsych = [];

  eps.forEach((ep, i) => {
    const para = formatSingleEpisodeParagraph(ep, {
      gender,
      state,
      isFirst: i === 0,
      isLast: i === eps.length - 1,
      index: i,
      episodeCount: eps.length,
      prevEarlySymptoms: prevEarly,
      prevPsychSpecs: prevPsych,
    });
    if (para) paragraphs.push(para);

    const earlyRaw = String(ep.earlySymptoms ?? "").trim();
    if (earlyRaw) prevEarly = earlyRaw;
    prevPsych = Array.isArray(ep.psychSpecialists) ? [...ep.psychSpecialists] : [];
  });

  return { paragraphs, warnings: collectDiseaseFormatWarnings(eps, gender) };
}

export { SPEC_LABEL };
