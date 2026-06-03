/**
 * Структурированный «Анамнез жизни» для второй версии анкеты (Mental Help v2).
 */
import { enhanceItogLifeStep, isItogMode } from "./mental-help-itog-ui.js";

export const LIFE_STRUCTURED_ID = "life-structured";

export const HEREDITY_NO_PHRASE = "Наследственность по психическим расстройствам не отягощена.";
export const HEREDITY_UNKNOWN_PHRASE = "Нет объективных данных о наследственности.";

/** @typedef {{ who: string; siblingDegree?: string; line?: string; pathology: string[]; pathologyOther?: string }} HeredityCase */

/** @typedef {{ specialist: string; customOther: string; reason: string; reasonUnknown: boolean }} ChildhoodVisit */

const CHILDHOOD_SPECIALIST_CODES = new Set(["neuro", "psych", "endo", "custom"]);
const SECTION2_DISEASE_CODES = new Set([
  "a_meningitis",
  "a_encephalitis",
  "a_neurosyphilis",
  "a_hiv",
  "a_toxoplasmosis_cns",
  "a_lyme",
  "a_covid_long",
  "b_sle_cns",
  "b_ms",
  "b_anti_nmda",
  "b_hashimoto_encephalopathy",
  "v_hypothyroidism",
  "v_thyrotoxicosis",
  "v_diabetes",
  "v_hyperparathyroidism",
  "v_cushing",
  "g_ra",
  "g_fibromyalgia",
  "g_copd",
  "g_hf_ihd",
  "g_hepatitis_cirrhosis",
  "d_b12_deficit",
  "d_d_deficit",
  "d_iron_def_anemia",
  "d_folate_deficit",
  "d_celiac_untreated",
  "e_other",
]);

const SECTION2_DISEASE_LABELS = {
  a_meningitis: "менингит",
  a_encephalitis: "энцефалит",
  a_neurosyphilis: "нейросифилис",
  a_hiv: "ВИЧ-инфекция",
  a_toxoplasmosis_cns: "токсоплазмоз с поражением нервной системы",
  a_lyme: "болезнь Лайма (нейроборрелиоз)",
  a_covid_long: "COVID-19 с длительными последствиями",
  b_sle_cns: "системная красная волчанка с поражением нервной системы",
  b_ms: "рассеянный склероз",
  b_anti_nmda: "анти-NMDA-рецепторный энцефалит",
  b_hashimoto_encephalopathy: "тиреоидит Хашимото с энцефалопатией",
  v_hypothyroidism: "гипотиреоз",
  v_thyrotoxicosis: "тиреотоксикоз/гипертиреоз",
  v_diabetes: "сахарный диабет",
  v_hyperparathyroidism: "гиперпаратиреоз",
  v_cushing: "болезнь Иценко-Кушинга",
  g_ra: "ревматоидный артрит",
  g_fibromyalgia: "фибромиалгия",
  g_copd: "ХОБЛ",
  g_hf_ihd: "тяжелая сердечная недостаточность/ИБС с приступами",
  g_hepatitis_cirrhosis: "тяжелый гепатит/цирроз печени",
  d_b12_deficit: "подтвержденный дефицит витамина B12",
  d_d_deficit: "дефицит витамина D",
  d_iron_def_anemia: "железодефицитная анемия средней/тяжелой степени",
  d_folate_deficit: "дефицит фолиевой кислоты",
  d_celiac_untreated: "нелеченная целиакия",
};

const SECTION2_SYMPTOM_CODES = new Set([
  "mood_change",
  "anxiety_panic",
  "hallucinations_delusions",
  "confusion",
  "memory_attention_decline",
]);

const SECTION2_SYMPTOM_LABELS = {
  mood_change: "изменение настроения",
  anxiety_panic: "тревога, панические атаки",
  hallucinations_delusions: "галлюцинации или бред",
  confusion: "спутанность сознания",
  memory_attention_decline: "значительное ухудшение памяти/внимания",
};

/** @typedef {{ name: string; age: string; ageUnknown?: boolean; anesthesia: "" | "yes" | "no" | "unknown" }} OperationEntry */
/** @typedef {{ age: string; ageUnknown?: boolean; cause: string }} SyncopeEntry */
/** @typedef {{ age: string; ageUnknown?: boolean; circumstance: "" | "dtp" | "head_hit" | "fall" | "fight" | "unknown"; lossDuration: "" | "seconds" | "minutes" | "over_hour" | "unknown"; exam: "" | "ct" | "mri" | "no" | "unknown" }} TbiEntry */
/** @typedef {{ trigger: string; reactions: string[] }} AllergyEntry */
/** @typedef {{ substance: string; lastUse: string; frequency: "" | "once_or_twice" | "episodic" | "regular_period"; treatment: "" | "yes" | "no" }} PavEntry */

const WHO_OPTIONS = [
  ["mother", "Мама"],
  ["father", "Папа"],
  ["brother", "Брат"],
  ["sister", "Сестра"],
  ["grandfather", "Дедушка"],
  ["grandmother", "Бабушка"],
  ["aunt", "Тётя"],
  ["uncle", "Дядя"],
  ["nephew", "Племянник"],
  ["niece", "Племянница"],
];

const WHO_CODES = new Set(WHO_OPTIONS.map(([v]) => v));

/** Род в грамматике формулировки «наблюдался/наблюдалась» (по полу родственника). */
function isRelativeFeminine(who) {
  return (
    who === "mother" ||
    who === "sister" ||
    who === "grandmother" ||
    who === "aunt" ||
    who === "niece"
  );
}

const SIBLING_DEG_FEM = [
  ["rod_f", "родная"],
  ["dv_f", "двоюродная"],
  ["tr_f", "троюродная"],
  ["dal_f", "дальняя"],
];

const SIBLING_DEG_MASC = [
  ["rod_m", "родной"],
  ["dv_m", "двоюродный"],
  ["tr_m", "троюродный"],
  ["dal_m", "дальний"],
];

const ALL_SIBLING_DEGS = new Set([...SIBLING_DEG_FEM.map(([c]) => c), ...SIBLING_DEG_MASC.map(([c]) => c)]);

const LINE_DEGS_FEM = new Set(["dv_f", "tr_f", "dal_f"]);
const LINE_DEGS_MASC = new Set(["dv_m", "tr_m", "dal_m"]);

function needsSiblingDegree(who) {
  return who === "brother" || who === "sister" || who === "nephew" || who === "niece";
}

/** @param {string} who @param {string | undefined} siblingDegree */
function needsLine(who, siblingDegree) {
  if (who === "grandmother" || who === "grandfather" || who === "aunt" || who === "uncle") return true;
  if (!needsSiblingDegree(who) || !siblingDegree) return false;
  if ((who === "sister" || who === "niece") && LINE_DEGS_FEM.has(siblingDegree)) return true;
  if ((who === "brother" || who === "nephew") && LINE_DEGS_MASC.has(siblingDegree)) return true;
  return false;
}

function linePhraseForWord(line) {
  if (line === "maternal") return "по маминой линии";
  if (line === "paternal") return "по папиной линии";
  return "";
}

/** @param {string} who @param {string | undefined} deg @param {string | undefined} line */
function describeRelativeForWord(who, deg, line) {
  const lp = line && needsLine(who, deg) ? ` ${linePhraseForWord(line)}` : "";
  if (who === "mother") return "мама";
  if (who === "father") return "папа";
  if (who === "grandmother") return `бабушка${lp}`;
  if (who === "grandfather") return `дедушка${lp}`;
  if (who === "aunt") return `тётя${lp}`;
  if (who === "uncle") return `дядя${lp}`;
  if (who === "sister") {
    const adj = deg ? SIBLING_DEG_FEM.find(([c]) => c === deg)?.[1] : "";
    const core = adj ? `${adj} сестра` : "сестра";
    return needsLine(who, deg) ? `${core}${lp}` : core;
  }
  if (who === "brother") {
    const adj = deg ? SIBLING_DEG_MASC.find(([c]) => c === deg)?.[1] : "";
    const core = adj ? `${adj} брат` : "брат";
    return needsLine(who, deg) ? `${core}${lp}` : core;
  }
  if (who === "niece") {
    const adj = deg ? SIBLING_DEG_FEM.find(([c]) => c === deg)?.[1] : "";
    const core = adj ? `${adj} племянница` : "племянница";
    return needsLine(who, deg) ? `${core}${lp}` : core;
  }
  if (who === "nephew") {
    const adj = deg ? SIBLING_DEG_MASC.find(([c]) => c === deg)?.[1] : "";
    const core = adj ? `${adj} племянник` : "племянник";
    return needsLine(who, deg) ? `${core}${lp}` : core;
  }
  return "";
}

/** @param {HeredityCase} c */
function formatOneHeredityCaseForWord(c) {
  const rel = describeRelativeForWord(c.who, c.siblingDegree, c.line);
  const path = Array.isArray(c.pathology) ? c.pathology : [];
  const bits = path.map((code) => pathologyLabelForWord(code, c.who)).filter(Boolean);
  const o = String(c.pathologyOther ?? "").trim();
  if (o) bits.push(o);
  const p = bits.join(", ");
  if (!rel && !p) return "";
  if (!rel) return p;
  if (!p) return rel;
  return `${rel} ${p}`;
}

/** @param {HeredityCase[]} cases */
function formatHeredityCasesLineForWord(cases) {
  const parts = (cases || []).map(formatOneHeredityCaseForWord).filter(Boolean);
  return parts.join(", ");
}

/** @returns {Record<string, unknown>} */
export function emptyLifeStructuredState() {
  return {
    heredity: "",
    heredityCases: [],
    /** Если true при ответе «Да» — форма черновика скрыта, виден только список и «Добавить ещё». */
    heredityCloseDraft: false,
    birthFamily: "",
    birthOrder: "",
    birthChildrenTotal: "",
    birthTerm: "",
    birthDelivery: "",
    birthCourse: "",
    birthCourseDetails: "",
    birthTrauma: "",
    birthTraumaDetails: "",
    earlyNoIssues: false,
    earlySpeechLate: false,
    earlySpeechAge: "",
    earlySpeechAgeUnknown: false,
    earlyWalkLate: false,
    earlyWalkAge: "",
    earlyWalkAgeUnknown: false,
    earlyDontKnow: false,
    devFirstYear: "",
    devFirstYearDelayDetails: "",
    enuresisAfter5: "",
    parasomnia: "",
    parasomniaNightFears: false,
    parasomniaNightmares: false,
    parasomniaSleepwalk: false,
    parasomniaSleeptalk: false,
    parasomniaOther: "",
    kindergartenAttend: "",
    kindergartenAdapt: "",
    kindergartenAdaptDetails: "",
    childhoodCharacter: "",
    childhoodCharacterUnknown: false,
    /** @type {"" | "yes" | "no"} */
    childhoodSpecialists: "",
    /** @type {ChildhoodVisit[]} */
    childhoodVisits: [],
    childhoodVisitsCloseDraft: false,
    schoolTypeGeneral: false,
    schoolTypeGymnasium: false,
    schoolTypeLyceum: false,
    schoolTypeCorrectional: false,
    schoolTypeCorrectionalDetails: "",
    schoolTypeHome: false,
    schoolTypeHomeFromClass: "",
    schoolTypeHomeToClass: "",
    schoolTypeHomeReason: "",
    schoolTypeUnknown: false,
    schoolChanged: "",
    schoolChangeFrequency: "",
    schoolChangeMove: false,
    schoolChangeConflictsPeers: false,
    schoolChangeConflictsTeachers: false,
    schoolChangePoorPerformance: false,
    schoolChangeProfile: false,
    schoolChangeStronger: false,
    schoolChangeWeaker: false,
    schoolChangeExpelled: false,
    schoolChangeOther: false,
    schoolChangeOtherText: "",
    schoolAdaptation: "",
    schoolAdaptationDetails: "",
    schoolPeerEasyFriends: false,
    schoolPeerFewFriends: false,
    schoolPeerCommunicationDifficulties: false,
    schoolPeerOutcast: false,
    schoolPeerBullied: false,
    schoolPeerAggression: false,
    schoolPeerNeutral: false,
    schoolTeacherEven: false,
    schoolTeacherOneConflict: false,
    schoolTeacherManyConflicts: false,
    schoolTeacherFavorite: false,
    schoolTeacherCriticized: false,
    schoolTeacherNeutral: false,
    schoolFinished: "",
    schoolStartAge: "",
    schoolPerformance: "",
    schoolClasses: null,
    /** @type {"" | "yes" | "no"} */
    socWorkNow: "",
    socWorkPosition: "",
    socWorkPastPositions: "",
    /** @type {"" | "in_relationship" | "not_in_relationship" | "cohabitation" | "married" | "divorced" | "widowed"} */
    socMarital: "",
    /** Число браков (Б1а); строка из поля ввода */
    socMarriagesCount: "",
    /** @type {"" | "yes" | "no"} */
    socChildren: "",
    socChildrenTotal: "",
    socChildrenCurrent: "",
    socChildrenPrevious: "",
    /** @type {"" | "alone" | "family" | "relatives" | "roommates" | "other"} */
    socLivingWith: "",
    socLivingOther: "",
    /** @type {"" | "own_apt" | "house" | "rent" | "relatives_provided" | "service" | "other"} */
    socHousing: "",
    socHousingOther: "",
    army: "",
    eduSecDone: false,
    eduSecUndone: false,
    eduSecNone: false,
    eduSecSpec: "",
    eduHiDone: false,
    eduHiUndone: false,
    eduHiNone: false,
    eduHiSpec: "",
    /** @type {"" | "yes" | "no"} */
    eduAfterSchool: "",
    eduNoAfterSchool: false,
    /** @type {string[]} */
    section2Diseases: [],
    section2OtherDisease: "",
    /** @type {string[]} */
    section2PsychSymptoms: [],
    section2PsychNone: false,
    operationsHad: "",
    /** @type {OperationEntry[]} */
    operationsList: [],
    syncopeNoTbiHad: "",
    /** @type {SyncopeEntry[]} */
    syncopeNoTbiList: [],
    tbiWithLossHad: "",
    /** @type {TbiEntry[]} */
    tbiWithLossList: [],
    epilepsyStatus: "",
    epilepsyFirstSeizureType: "",
    epilepsyFirstSeizureAge: "",
    epilepsyMedsStatus: "",
    /** @type {string[]} */
    epilepsyMeds: [],
    chronicHad: "",
    chronicDiseasesText: "",
    chronicMedsRegular: "",
    chronicMedsText: "",
    allergyHad: "",
    /** @type {AllergyEntry[]} */
    allergyList: [],
    smokingStatus: "",
    smokingPastYears: "",
    smokingCurrentYears: "",
    smokingCurrentCigs: "",
    smokingUsesVape: "",
    alcoholStatus: "",
    alcoholRareDrink: "",
    alcoholRareAmount: "",
    alcoholRegularPref: "",
    alcoholRegularAmount: "",
    alcoholRegularConsequencesHangover: false,
    alcoholRegularConsequencesMemoryBlackouts: false,
    alcoholRegularConsequencesConflicts: false,
    alcoholRegularConsequencesLaw: false,
    alcoholRegularConsequencesNarcologist: false,
    pavHad: "",
    /** @type {string[]} */
    pavGroups: [],
    pavGroupsUnknown: false,
    pavExperience: "",
    pavLastUse: "",
    /** @type {"" | "once_or_twice" | "episodic" | "regular_period"} */
    pavFrequency: "",
    /** @type {"" | "yes" | "no"} */
    pavTreatment: "",
    /** @type {PavEntry[]} */
    pavList: [],
  };
}

/**
 * @param {string | undefined} jsonStr
 * @returns {Record<string, unknown>}
 */
/** @param {unknown} raw @returns {HeredityCase | null} */
function normalizeHeredityCase(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const who = typeof o.who === "string" ? o.who : "";
  if (!WHO_CODES.has(who)) return null;
  const pathology = Array.isArray(o.pathology) ? o.pathology.filter((x) => typeof x === "string") : [];
  /** @type {HeredityCase} */
  const c = { who, pathology, pathologyOther: typeof o.pathologyOther === "string" ? o.pathologyOther : "" };
  const sd = typeof o.siblingDegree === "string" ? o.siblingDegree : "";
  if (needsSiblingDegree(who)) {
    if (!ALL_SIBLING_DEGS.has(sd)) return null;
    c.siblingDegree = sd;
  }
  const ln = o.line === "maternal" || o.line === "paternal" ? o.line : "";
  if (needsLine(who, c.siblingDegree) && ln) c.line = ln;
  return c;
}

function migrateLegacyHeredity(base, raw) {
  if (base.heredity !== "yes") return;
  const cases = Array.isArray(raw.heredityCases) ? raw.heredityCases : [];
  if (cases.length) return;
  const person = typeof raw.kinshipPerson === "string" ? raw.kinshipPerson : "";
  const line = raw.kinshipLine === "maternal" || raw.kinshipLine === "paternal" ? raw.kinshipLine : undefined;
  const pathology = Array.isArray(raw.pathology) ? raw.pathology.filter((x) => typeof x === "string") : [];
  const pathologyOther = typeof raw.pathologyOther === "string" ? raw.pathologyOther : "";
  const mappedPath = [];
  for (const code of pathology) {
    if (code === "dep_addiction") {
      mappedPath.push("dep_alcohol", "dep_narcotic");
    } else mappedPath.push(code);
  }
  /** @type {HeredityCase | null} */
  let c = null;
  const direct = ["mother", "father", "brother", "sister", "grandmother", "grandfather", "aunt", "uncle"].includes(person);
  if (direct && person) {
    c = { who: person, pathology: mappedPath, pathologyOther };
    if (person === "brother") c.siblingDegree = "rod_m";
    if (person === "sister") c.siblingDegree = "rod_f";
    if (line && needsLine(person, c.siblingDegree)) c.line = line;
  } else if (person === "sibling_full") {
    c = { who: "sister", siblingDegree: "rod_f", pathology: mappedPath, pathologyOther };
  } else if (person === "cousin2") {
    c = { who: "sister", siblingDegree: "dv_f", pathology: mappedPath, pathologyOther };
    if (line) c.line = line;
  } else if (person === "cousin3") {
    c = { who: "sister", siblingDegree: "tr_f", pathology: mappedPath, pathologyOther };
    if (line) c.line = line;
  } else if (person === "cousin_far") {
    c = { who: "sister", siblingDegree: "dal_f", pathology: mappedPath, pathologyOther };
    if (line) c.line = line;
  }
  if (c) base.heredityCases = [c];
}

/** @param {unknown} raw @returns {ChildhoodVisit | null} */
function normalizeChildhoodVisit(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const sp = typeof o.specialist === "string" && CHILDHOOD_SPECIALIST_CODES.has(o.specialist) ? o.specialist : "neuro";
  return {
    specialist: sp,
    customOther: typeof o.customOther === "string" ? o.customOther : "",
    reason: typeof o.reason === "string" ? o.reason : "",
    reasonUnknown: o.reasonUnknown === true,
  };
}

/** @param {unknown} arr @returns {ChildhoodVisit[]} */
function normalizeChildhoodVisits(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(normalizeChildhoodVisit).filter(Boolean);
}

/**
 * Старый формат: чекбоксы по специалистам и «Не наблюдался».
 * @param {Record<string, unknown>} base
 * @param {Record<string, unknown>} raw
 */
function migrateLegacyChildhood(base, raw) {
  const hasNew =
    raw.childhoodSpecialists === "yes" ||
    raw.childhoodSpecialists === "no" ||
    Object.prototype.hasOwnProperty.call(raw, "childhoodVisits");
  if (hasNew) return;
  const none = raw.childhoodNone === true;
  const neuro = raw.childhoodNeuro === true;
  const psych = raw.childhoodPsych === true;
  const endo = raw.childhoodEndo === true;
  const any = neuro || psych || endo;
  if (none && !any) {
    base.childhoodSpecialists = "no";
    base.childhoodVisits = [];
    return;
  }
  if (any) {
    base.childhoodSpecialists = "yes";
    /** @type {ChildhoodVisit[]} */
    const v = [];
    if (neuro) v.push({ specialist: "neuro", customOther: "", reason: "", reasonUnknown: false });
    if (psych) v.push({ specialist: "psych", customOther: "", reason: "", reasonUnknown: false });
    if (endo) v.push({ specialist: "endo", customOther: "", reason: "", reasonUnknown: false });
    base.childhoodVisits = v;
  }
}

export function parseLifeStructuredString(jsonStr) {
  const base = emptyLifeStructuredState();
  let raw = {};
  try {
    const p = JSON.parse(jsonStr || "{}");
    if (p && typeof p === "object") raw = p;
  } catch {
    raw = {};
  }
  for (const k of Object.keys(base)) {
    if (k === "heredityCases") {
      if (Array.isArray(raw.heredityCases)) {
        base.heredityCases = raw.heredityCases.map(normalizeHeredityCase).filter(Boolean);
      }
    } else if (k === "heredityCloseDraft") {
      base.heredityCloseDraft = raw.heredityCloseDraft === true;
    } else if (k === "earlySpeechAgeUnknown" || k === "earlyWalkAgeUnknown" || k === "earlyDontKnow") {
      base[k] = raw[k] === true;
    } else if (k === "childhoodVisits") {
      if (Object.prototype.hasOwnProperty.call(raw, "childhoodVisits")) {
        base.childhoodVisits = normalizeChildhoodVisits(raw.childhoodVisits);
      }
    } else if (k === "childhoodVisitsCloseDraft") {
      base.childhoodVisitsCloseDraft = raw.childhoodVisitsCloseDraft === true;
    } else if (k === "childhoodSpecialists") {
      const v = raw.childhoodSpecialists;
      base.childhoodSpecialists = v === "yes" || v === "no" ? v : "";
    } else if (k in raw) {
      base[k] = raw[k];
    }
  }
  migrateLegacyHeredity(base, raw);
  migrateLegacyChildhood(base, raw);
  migrateLegacySocial(base);
  return base;
}

/** Старые коды семейного статуса и проживания. */
function migrateLegacySocial(base) {
  if (base.socMarital === "never") base.socMarital = "not_in_relationship";
  if (base.socLivingWith === "dorm") base.socLivingWith = "";
}

function pathologyLabel(code) {
  const m = {
    dep_alcohol: "алкогольная зависимость",
    dep_narcotic: "наркотическая зависимость",
    dep_depression: "депрессивные расстройства",
    dep_anxiety: "тревожные расстройства",
    dep_suicide_done: "суицид (реализованный)",
    dep_suicide_attempt: "суицидальные попытки",
    dep_psychiatrist: "наблюдался(ась) у психиатра",
    dep_dementia: "деменция",
    dep_addiction: "алкогольная зависимость, наркотическая зависимость",
  };
  return m[code] ?? code;
}

/** @param {string} who — код родственника из WHO_OPTIONS */
function psychWordPhraseForWord(who) {
  if (!who) return "наблюдался(ась) у психиатра";
  return isRelativeFeminine(who) ? "наблюдалась у психиатра" : "наблюдался у психиатра";
}

/** Подпись пункта в форме (с заглавной буквы). */
function psychiatristOptionUiLabel(who) {
  if (!who) return "Наблюдение у психиатра";
  return isRelativeFeminine(who) ? "Наблюдалась у психиатра" : "Наблюдался у психиатра";
}

/** @param {string} code @param {string} [who] */
function pathologyLabelForWord(code, who) {
  if (code === "dep_psychiatrist") return psychWordPhraseForWord(who);
  return pathologyLabel(code);
}

/** Успеваемость в тексте Word — согласование с полом (муж./жен.). При неизвестном поле — мужские формы. */
function schoolPerfLabelForWord(gender, v) {
  const fem = gender === "female";
  const m = {
    excellent: fem ? "отличница" : "отличник",
    good4and5: fem ? "ударница" : "ударник",
    mostly4: fem ? "хорошистка" : "хорошист",
    mostly3: fem ? "троечница" : "троечник",
    weakWithDebts: "слабо, были двойки и задолженности",
  };
  return m[v] ?? v;
}

/** Глагол для блока «Рождение и семья» по полу пациента. @param {"male" | "female" | null} gender */
function verbBornPastForBirthBlock(gender) {
  if (gender === "male") return "Родился";
  if (gender === "female") return "Родилась";
  return "Родился(лась)";
}

/** @param {"male" | "female" | null} gender */
function verbTransferredPast(gender) {
  if (gender === "male") return "Перенес";
  if (gender === "female") return "Перенесла";
  return "Перенес(ла)";
}

function childOrderInstrumentalWord(n) {
  const m = {
    1: "первым",
    2: "вторым",
    3: "третьим",
    4: "четвертым",
    5: "пятым",
    6: "шестым",
    7: "седьмым",
    8: "восьмым",
    9: "девятым",
    10: "десятым",
  };
  return m[n] ?? `${n}-м`;
}

function upperFirst(s) {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** @param {Record<string, unknown>} state */
function birthOrderPhraseForWord(state) {
  const order = Number(state.birthOrder);
  const total = Number(state.birthChildrenTotal);
  if (!Number.isInteger(order) || !Number.isInteger(total) || order < 1 || total < 1 || order > 10 || total > 10 || order > total) {
    return "";
  }
  if (order === 1 && total === 1) return "единственным ребенком";
  if (order === total && total > 1) return "младшим ребенком";
  return `${childOrderInstrumentalWord(order)} ребенком`;
}

/** @param {Record<string, unknown>} state */
function birth345LineForWord(state) {
  const bits = [];
  if (state.birthTerm === "term") bits.push("Роды в срок");
  if (state.birthTerm === "preterm") bits.push("Роды преждевременные");
  if (state.birthTerm === "postterm") bits.push("Роды запоздалые");
  if (state.birthTerm === "unknown") bits.push("срок родов не известен");

  if (state.birthDelivery === "self") bits.push("самостоятельные");
  if (state.birthDelivery === "cesarean") bits.push("путем кесарева сечения");
  if (state.birthDelivery === "unknown") bits.push("способ родоразрешения не известен");

  if (state.birthCourse === "normal") bits.push("без осложнений");
  if (state.birthCourse === "complicated") {
    const d = String(state.birthCourseDetails ?? "").trim();
    bits.push(d ? `протекали с осложнениями (со слов: "${d}")` : "протекали с осложнениями");
  }
  if (state.birthCourse === "unknown") bits.push("характер родов не известен");

  if (!bits.length) return "";
  bits[0] = upperFirst(bits[0]);
  return `${bits.join(", ")}.`;
}

/** @param {Record<string, unknown>} state @param {"male" | "female" | null} gender */
function parasomniaListForWord(state) {
  const items = [];
  if (state.parasomniaNightFears) items.push("ночные страхи");
  if (state.parasomniaNightmares) items.push("кошмары");
  if (state.parasomniaSleepwalk) items.push("снохождения");
  if (state.parasomniaSleeptalk) items.push("сноговорения");
  if (!items.length) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} и ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} и ${items[items.length - 1]}`;
}

function listWithAnd(parts) {
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} и ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} и ${parts[parts.length - 1]}`;
}

/** @param {"male" | "female" | null} gender */
function verbAttendPast(gender) {
  if (gender === "male") return "посещал";
  if (gender === "female") return "посещала";
  return "посещал(а)";
}

/** @param {"male" | "female" | null} gender */
function verbStudiedPast(gender) {
  if (gender === "male") return "обучался";
  if (gender === "female") return "обучалась";
  return "обучался(ась)";
}

/** @param {"male" | "female" | null} gender */
function verbChangedSchoolOnce(gender) {
  if (gender === "male") return "однократно сменил школу";
  if (gender === "female") return "однократно сменила школу";
  return "однократно сменил(а) школу";
}

/** @param {"male" | "female" | null} gender */
function verbChangedSchoolMany(gender) {
  if (gender === "male") return "многократно менял школу";
  if (gender === "female") return "многократно меняла школу";
  return "многократно менял(а) школу";
}

/** @param {"male" | "female" | null} gender */
function wasExpelledPhrase(gender) {
  if (gender === "male") return "был отчислен из школы";
  if (gender === "female") return "была отчислена из школы";
  return "был(а) отчислен(а) из школы";
}

/** @param {"male" | "female" | null} gender */
function verbGoToSchoolPast(gender) {
  if (gender === "male") return "пошёл";
  if (gender === "female") return "пошла";
  return "пошёл(ла)";
}

/** @param {"male" | "female" | null} gender */
function phraseOutcast(gender) {
  if (gender === "male") return "был изгоем в классе";
  if (gender === "female") return "была изгоем в классе";
  return "был(а) изгоем в классе";
}

/** @param {"male" | "female" | null} gender */
function phraseBullied(gender) {
  if (gender === "male") return "подвергался травле (буллингу) со стороны одноклассников";
  if (gender === "female") return "подвергалась травле (буллингу) со стороны одноклассников";
  return "подвергался(ась) травле (буллингу) со стороны одноклассников";
}

/** @param {"male" | "female" | null} gender */
function phraseAggression(gender) {
  if (gender === "male") return "сам проявлял агрессию к одноклассникам";
  if (gender === "female") return "сама проявляла агрессию к одноклассникам";
  return "сам(а) проявлял(а) агрессию к одноклассникам";
}

/** @param {"male" | "female" | null} gender */
function phraseTeacherFavorite(gender) {
  if (gender === "male") return "был любимчиком у учителей";
  if (gender === "female") return "была любимицей у учителей";
  return "был(а) любимчиком(цей) у учителей";
}

/** @param {"male" | "female" | null} gender */
function phraseTeacherCriticized(gender) {
  if (gender === "male") return "часто подвергался критике со стороны учителей";
  if (gender === "female") return "часто подвергалась критике со стороны учителей";
  return "часто подвергался(ась) критике со стороны учителей";
}

/** @param {"male" | "female" | null} gender */
function phraseDidNotFinishSchool(gender) {
  if (gender === "male") return "Школу не окончил.";
  if (gender === "female") return "Школу не окончила.";
  return "Школу не окончил(а).";
}

/** @param {"male" | "female" | null} gender */
function phraseFinishedClasses(gender, n) {
  if (gender === "male") return `Окончил ${n} классов.`;
  if (gender === "female") return `Окончила ${n} классов.`;
  return `Окончил(а) ${n} классов.`;
}

/** @param {"male" | "female" | null} gender */
function phraseSmokedPast(gender, years) {
  if (gender === "male") return years ? `Курение: Курил в прошлом (стаж ${years} лет), бросил.` : "Курение: Курил в прошлом, бросил.";
  if (gender === "female") return years ? `Курение: Курила в прошлом (стаж ${years} лет), бросила.` : "Курение: Курила в прошлом, бросила.";
  return years ? `Курение: Курил(а) в прошлом (стаж ${years} лет), бросил(а).` : "Курение: Курил(а) в прошлом, бросил(а).";
}

/** @param {"male" | "female" | null} gender */
function phrasePavFrequency(gender, freq) {
  if (freq === "once_or_twice") {
    if (gender === "male") return "употреблял 1–2 раза в жизни";
    if (gender === "female") return "употребляла 1–2 раза в жизни";
    return "употреблял(а) 1–2 раза в жизни";
  }
  if (freq === "episodic") {
    if (gender === "male") return "употреблял эпизодически";
    if (gender === "female") return "употребляла эпизодически";
    return "употреблял(а) эпизодически";
  }
  if (freq === "regular_period") return "был период регулярного употребления";
  return "";
}

/** @param {"male" | "female" | null} gender */
function phrasePavTreatment(gender, treatment) {
  if (treatment === "yes") {
    if (gender === "male") return "лечение от зависимости проходил";
    if (gender === "female") return "лечение от зависимости проходила";
    return "лечение от зависимости проходил(а)";
  }
  if (treatment === "no") {
    if (gender === "male") return "лечение от зависимости не проходил";
    if (gender === "female") return "лечение от зависимости не проходила";
    return "лечение от зависимости не проходил(а)";
  }
  return "";
}

/** «Не получал» / «не получала» — фразы про образование после школы. */
/** @param {"male" | "female" | null} gender */
function phraseEduNotReceivedPast(gender) {
  if (gender === "female") return "не получала";
  if (gender === "male") return "не получал";
  return "не получал(а)";
}

/** Подписи пункта успеваемости в форме (школа), по полу. */
/** @param {"male" | "female" | null} gender @param {string} v */
function schoolPerfUiOptionLabel(gender, v) {
  const fem = gender === "female";
  const neu = gender !== "male" && gender !== "female";
  const m = {
    excellent: fem ? "Отличница (почти одни пятёрки)" : neu ? "Отличник/отличница (почти одни пятёрки)" : "Отличник (почти одни пятёрки)",
    good4and5: fem ? "Ударница (одни четвёрки и пятёрки)" : neu ? "Ударник/ударница (одни четвёрки и пятёрки)" : "Ударник (одни четвёрки и пятёрки)",
    mostly4: fem ? "Хорошистка (преимущественно четвёрки с редкими тройками)" : neu ? "Хорошист/хорошистка (преимущественно четвёрки с редкими тройками)" : "Хорошист (преимущественно четвёрки с редкими тройками)",
    mostly3: fem ? "Троечница (преимущественно тройки)" : neu ? "Троечник/троечница (преимущественно тройки)" : "Троечник (преимущественно тройки)",
    weakWithDebts: "Были двойки и академические задолженности",
  };
  return m[v] ?? v;
}

/** @param {Record<string, unknown>} state @param {"male" | "female" | null} gender */
function block3WordLines(state, gender) {
  const lines = [];

  if (state.devFirstYear === "timely") lines.push("Психомоторное развитие в первый год жизни своевременное.");
  if (state.devFirstYear === "delay") {
    const d = String(state.devFirstYearDelayDetails ?? "").trim();
    lines.push(
      d
        ? `В первый год жизни отмечалась задержка психомоторного развития (со слов: "${d}").`
        : "В первый год жизни отмечалась задержка психомоторного развития."
    );
  }
  if (state.devFirstYear === "unknown") lines.push("Данные о психомоторном развитии в первый год жизни отсутствуют.");

  const enNo = state.enuresisAfter5 === "no";
  const parNo = state.parasomnia === "no";
  if (enNo && parNo) {
    lines.push("Энуреза после 5 лет, ночных страхов, кошмаров, снохождений и сноговорений в детстве не было.");
  } else {
    if (state.enuresisAfter5 === "yes") lines.push("В детстве отмечался энурез после 5 лет.");
    if (state.enuresisAfter5 === "no") lines.push("Энуреза после 5 лет не было.");
    if (state.enuresisAfter5 === "unknown") lines.push("Сведения об энурезе отсутствуют.");

    if (state.parasomnia === "no") {
      lines.push("Ночных страхов, кошмаров, снохождений и сноговорений в детстве не было.");
    } else if (state.parasomnia === "yes") {
      const base = parasomniaListForWord(state);
      const other = String(state.parasomniaOther ?? "").trim();
      if (base || other) {
        const list = base || "парасомнии";
        lines.push(other ? `В детстве отмечались ${list} (со слов: "${other}").` : `В детстве отмечались ${list}.`);
      }
    } else if (state.parasomnia === "unknown") {
      lines.push("Сведения о парасомниях в детстве отсутствуют.");
    }
  }

  const kdgVisit =
    gender === "female" ? "посещала" : gender === "male" ? "посещал" : "посещал(а)";
  const kdgVisitNeg =
    gender === "female" ? "не посещала" : gender === "male" ? "не посещал" : "не посещал(а)";
  const kdgAdaptEasy =
    gender === "female" ? "адаптировалась" : gender === "male" ? "адаптировался" : "адаптировался(ась)";
  const raisedHome =
    gender === "female" ? "воспитывалась" : gender === "male" ? "воспитывался" : "воспитывался(ась)";

  if (state.kindergartenAttend === "yes") {
    if (state.kindergartenAdapt === "easy") {
      lines.push(`Детский сад ${kdgVisit}, ${kdgAdaptEasy} без особенностей.`);
    } else if (state.kindergartenAdapt === "difficult") {
      const d = String(state.kindergartenAdaptDetails ?? "").trim();
      lines.push(
        d
          ? `Детский сад ${kdgVisit}, отмечались трудности адаптации (со слов: "${d}").`
          : `Детский сад ${kdgVisit}, отмечались трудности адаптации.`
      );
    } else if (state.kindergartenAdapt === "unknown") {
      lines.push(`Детский сад ${kdgVisit}, сведения об адаптации отсутствуют.`);
    } else {
      lines.push(`Детский сад ${kdgVisit}.`);
    }
  } else if (state.kindergartenAttend === "no") {
    lines.push(`Детский сад ${kdgVisitNeg}, ${raisedHome} дома.`);
  } else if (state.kindergartenAttend === "unknown") {
    lines.push("Данные о посещении детского сада отсутствуют.");
  }

  const ch = String(state.childhoodCharacter ?? "").trim();
  if (!state.childhoodCharacterUnknown && ch) {
    lines.push(`В детстве характеризует себя как «${ch}».`);
  }

  return lines;
}

/** @param {Record<string, unknown>} state @param {"male" | "female" | null} gender */
function block6WordLines(state, gender) {
  const lines = [];
  const s1 = [];
  const sa = String(state.schoolStartAge ?? "").trim();
  if (sa) s1.push(`В школу ${verbGoToSchoolPast(gender)} с ${sa} лет`);

  const types = [];
  if (state.schoolTypeGeneral) types.push("школу общеобразовательного типа");
  if (state.schoolTypeGymnasium) types.push("гимназию");
  if (state.schoolTypeLyceum) types.push("лицей");
  if (state.schoolTypeCorrectional) {
    const d = String(state.schoolTypeCorrectionalDetails ?? "").trim();
    types.push(d ? `коррекционную школу (со слов: «${d}»)` : "коррекционную школу");
  }
  if (types.length === 1) s1.push(`${verbAttendPast(gender)} ${types[0]}`);
  else if (types.length > 1) s1.push(`${verbAttendPast(gender)} разные типы школ: ${types.join(", ")}`);
  else if (state.schoolTypeUnknown) s1.push("тип школы не помнит");
  if (s1.length) lines.push(`${s1.join(", ")}.`);

  if (state.schoolTypeHome) {
    const from = String(state.schoolTypeHomeFromClass ?? "").trim();
    const to = String(state.schoolTypeHomeToClass ?? "").trim();
    const reason = String(state.schoolTypeHomeReason ?? "").trim();
    let home = `${verbStudiedPast(gender)} на дому`;
    if (from) home += ` с ${from} класса`;
    if (to) home += ` по ${to} класс`;
    if (reason) home += ` по причине ${reason}`;
    lines.push(`${home}.`);
  }

  if (state.schoolChanged === "yes") {
    const reasons = [];
    if (state.schoolChangeMove) reasons.push("в связи с переездом");
    if (state.schoolChangeConflictsPeers) reasons.push("из-за конфликтов с одноклассниками");
    if (state.schoolChangeConflictsTeachers) reasons.push("из-за конфликтов с учителями");
    if (state.schoolChangePoorPerformance) reasons.push("по причине неуспеваемости");
    if (state.schoolChangeProfile) reasons.push("для смены профиля обучения");
    if (state.schoolChangeStronger) reasons.push("переход в более сильную школу");
    if (state.schoolChangeWeaker) reasons.push("переход в более слабую школу");
    if (state.schoolChangeExpelled) reasons.push(wasExpelledPhrase(gender));
    if (state.schoolChangeOther) {
      const other = String(state.schoolChangeOtherText ?? "").trim();
      if (other) reasons.push(`по причине: ${other}`);
    }
    const freq =
      state.schoolChangeFrequency === "once"
        ? verbChangedSchoolOnce(gender)
        : state.schoolChangeFrequency === "many"
          ? verbChangedSchoolMany(gender)
          : gender === "male"
            ? "менял школу"
            : gender === "female"
              ? "меняла школу"
              : "менял(а) школу";
    if (reasons.length) lines.push(`${upperFirst(freq)} ${listWithAnd(reasons)}.`);
    else lines.push(`${upperFirst(freq)}.`);
  }

  if (state.schoolAdaptation === "no") lines.push("Проблем адаптации не возникало.");
  if (state.schoolAdaptation === "yes") {
    const d = String(state.schoolAdaptationDetails ?? "").trim();
    lines.push(d ? `Наблюдались проблемы адаптации (со слов: «${d}»).` : "Наблюдались проблемы адаптации.");
  }
  if (state.schoolAdaptation === "unknown") lines.push("Проблем адаптации не помнит.");

  const perf = schoolPerfLabelForWord(gender, String(state.schoolPerformance ?? ""));
  const studiedAtSchool =
    gender === "male" ? "Учился" : gender === "female" ? "Училась" : "Учился(лась)";
  if (state.schoolPerformance) {
    if (state.schoolPerformance === "weakWithDebts") lines.push(`${studiedAtSchool} ${perf}.`);
    else lines.push(`${studiedAtSchool} как ${perf}.`);
  }

  const peer = [];
  if (state.schoolPeerEasyFriends) peer.push("отношения с одноклассниками хорошие");
  if (state.schoolPeerFewFriends) peer.push("друзей было мало");
  if (state.schoolPeerCommunicationDifficulties) peer.push("были трудности в общении с одноклассниками");
  if (state.schoolPeerOutcast) peer.push(phraseOutcast(gender));
  if (state.schoolPeerBullied) peer.push(phraseBullied(gender));
  if (state.schoolPeerAggression) peer.push(phraseAggression(gender));
  if (state.schoolPeerNeutral) peer.push("отношения с одноклассниками нейтральные");
  const teacher = [];
  if (state.schoolTeacherOneConflict) teacher.push("были конфликты с учителем");
  if (state.schoolTeacherManyConflicts) teacher.push("были конфликты с несколькими учителями");
  if (state.schoolTeacherFavorite) teacher.push(phraseTeacherFavorite(gender));
  if (state.schoolTeacherCriticized) teacher.push(phraseTeacherCriticized(gender));
  if (peer.length || teacher.length) {
    const p = peer.length ? `Отношения с одноклассниками: ${peer.join(", ")}` : "";
    const t = teacher.length ? `с учителями: ${teacher.join(", ")}` : "";
    const both = [p, t].filter(Boolean).join("; ");
    lines.push(`${both}.`);
  }

  if (state.schoolFinished === "no") lines.push(phraseDidNotFinishSchool(gender));
  else {
    const cl = state.schoolClasses;
    if (cl != null && cl >= 1 && cl <= 11) lines.push(phraseFinishedClasses(gender, cl));
  }
  return lines;
}

/** Склонение «N раз / раза» для целого неотрицательного числа. */
function pluralTimesRu(n) {
  const abs = Math.floor(Number(n));
  if (!Number.isFinite(abs) || abs < 0) return "раз";
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return "раз";
  if (mod10 === 1) return "раз";
  if (mod10 >= 2 && mod10 <= 4) return "раза";
  return "раз";
}

/** @param {"male" | "female" | null} gender */
function maritalWidowPhraseForWord(gender) {
  if (gender === "female") return "Вдова.";
  if (gender === "male") return "Вдовец.";
  return "Вдовец/вдова.";
}

/** @param {"male" | "female" | null} gender */
function marriagesCountPhraseForWord(gender, n) {
  const verb =
    gender === "female" ? "Состояла" : gender === "male" ? "Состоял" : "Состоял(а)";
  return `${verb} в зарегистрированном браке ${n} ${pluralTimesRu(n)}.`;
}

/**
 * Социальный анамнез в Word: блоки 6–8 (труд, семья, жильё).
 * @param {Record<string, unknown>} state
 * @param {"male" | "female" | null} gender
 */
function socialAnamnesisWordLines(state, gender) {
  const lines = [];

  const workParts = [];
  if (state.socWorkNow === "yes") {
    let w = "Работает в настоящее время.";
    const pos = String(state.socWorkPosition ?? "").trim();
    if (pos) w += ` Должность: ${pos}.`;
    workParts.push(w);
  } else if (state.socWorkNow === "no") {
    workParts.push("В настоящее время не работает.");
  }
  const pastPos = String(state.socWorkPastPositions ?? "").trim();
  if (pastPos) workParts.push(`Основные должности за последние 5 лет/за всю жизнь: ${pastPos}.`);
  if (workParts.length) lines.push(workParts.join(" "));

  const mar = String(state.socMarital ?? "");
  /** @type {string[]} */
  const familyParts = [];
  if (mar === "in_relationship") familyParts.push("Состоит в отношениях.");
  else if (mar === "not_in_relationship") familyParts.push("В отношениях не состоит.");
  else if (mar === "cohabitation") familyParts.push("Состоит в незарегистрированном браке (сожительство).");
  else if (mar === "married") familyParts.push("Состоит в зарегистрированном браке.");
  else if (mar === "divorced") familyParts.push("В разводе.");
  else if (mar === "widowed") familyParts.push(maritalWidowPhraseForWord(gender));

  if (mar === "divorced" || mar === "widowed") {
    const rawMc = String(state.socMarriagesCount ?? "").trim();
    const mc = rawMc === "" ? NaN : Number.parseInt(rawMc, 10);
    if (Number.isFinite(mc) && mc > 0) familyParts.push(marriagesCountPhraseForWord(gender, mc));
  }

  if (state.socChildren === "no") familyParts.push("Детей нет.");
  else if (state.socChildren === "yes") {
    const tRaw = String(state.socChildrenTotal ?? "").trim();
    const cRaw = String(state.socChildrenCurrent ?? "").trim();
    const pRaw = String(state.socChildrenPrevious ?? "").trim();
    const total = tRaw === "" ? NaN : Number.parseInt(tRaw, 10);
    const cur = cRaw === "" ? NaN : Number.parseInt(cRaw, 10);
    const prev = pRaw === "" ? NaN : Number.parseInt(pRaw, 10);
    const bits = [];
    if (Number.isFinite(total) && total >= 0) bits.push(`Всего детей: ${total}`);
    if (Number.isFinite(cur) && cur > 0) bits.push(`из них от текущего/последнего брака: ${cur}`);
    if (Number.isFinite(prev) && prev > 0) bits.push(`из них от предыдущих браков/отношений: ${prev}`);
    if (bits.length) familyParts.push(`${bits.join(", ")}.`);
  }

  if (familyParts.length) lines.push(familyParts.join(" "));

  const liv = String(state.socLivingWith ?? "");
  /** @type {string} */
  let livingBit = "";
  if (liv === "alone") {
    livingBit =
      gender === "female"
        ? "Проживает одна"
        : gender === "male"
          ? "Проживает один"
          : "Проживает один(на)";
  } else if (liv === "family") livingBit = "Проживает с семьёй";
  else if (liv === "relatives") livingBit = "Проживает с родственниками";
  else if (liv === "roommates") livingBit = "Проживает с соседями (не родственниками)";
  else if (liv === "other") {
    const o = String(state.socLivingOther ?? "").trim();
    if (o) livingBit = `Проживает: ${o}`;
  }

  const hou = String(state.socHousing ?? "");
  /** @type {string} */
  let housingBit = "";
  if (hou === "own_apt") housingBit = "жильё: собственная квартира";
  else if (hou === "house") housingBit = "жильё: частный дом в собственности";
  else if (hou === "rent") housingBit = "жильё: арендованное";
  else if (hou === "relatives_provided") housingBit = "жильё: предоставлено родственниками";
  else if (hou === "service") housingBit = "жильё: служебное";
  else if (hou === "other") {
    const o = String(state.socHousingOther ?? "").trim();
    if (o) housingBit = `жильё: ${o}`;
  }

  if (livingBit && housingBit) lines.push(`${livingBit}, ${housingBit}.`);
  else if (livingBit) lines.push(`${livingBit}.`);
  else if (housingBit) lines.push(`${upperFirst(housingBit)}.`);

  return lines;
}

/** @param {Record<string, unknown>} state */
function section2WordLines(state) {
  const lines = [];
  const diseaseCodesRaw = Array.isArray(state.section2Diseases) ? state.section2Diseases : [];
  const diseaseCodes = diseaseCodesRaw.filter((x) => typeof x === "string" && SECTION2_DISEASE_CODES.has(x));
  const diseaseBits = diseaseCodes
    .map((code) => {
      if (code === "e_other") return "";
      return SECTION2_DISEASE_LABELS[code] ?? "";
    })
    .filter(Boolean);
  if (diseaseCodes.includes("e_other")) {
    const other = String(state.section2OtherDisease ?? "").trim();
    if (other) diseaseBits.push(other);
  }
  if (!diseaseBits.length) {
    lines.push("По перечисленным перенесенным заболеваниям отметок нет.");
    return lines;
  }
  lines.push(`Перенесенные заболевания: ${listWithAnd(diseaseBits)}.`);

  if (state.section2PsychNone === true) {
    lines.push("Психических симптомов после заболеваний не отмечалось.");
    return lines;
  }
  const symRaw = Array.isArray(state.section2PsychSymptoms) ? state.section2PsychSymptoms : [];
  const symCodes = symRaw.filter((x) => typeof x === "string" && SECTION2_SYMPTOM_CODES.has(x));
  const symBits = symCodes.map((code) => SECTION2_SYMPTOM_LABELS[code]).filter(Boolean);
  if (symBits.length) lines.push(`На фоне/после заболеваний отмечались: ${listWithAnd(symBits)}.`);
  return lines;
}

/** @param {Record<string, unknown>} state */
function section3WordLines(state) {
  if (state.operationsHad === "no") return ["Операций не было."];
  if (state.operationsHad !== "yes") return [];
  const raw = Array.isArray(state.operationsList) ? state.operationsList : [];
  const items = raw
    .map((it) => {
      const name = String(it?.name ?? "").trim();
      const age = String(it?.age ?? "").trim();
      const ageUnknown = it?.ageUnknown === true;
      const an = it?.anesthesia;
      if (!name || (!age && !ageUnknown)) return "";
      const anText =
        an === "yes" ? "с наркозом" : an === "no" ? "без наркоза" : an === "unknown" ? "наличие наркоза неизвестно" : "";
      const ageText = ageUnknown ? "возраст не помнит" : `в возрасте ${age} лет`;
      return anText ? `${name} (${ageText}, ${anText})` : `${name} (${ageText})`;
    })
    .filter(Boolean);
  if (!items.length) return [];
  return [`Перенесенные операции: ${listWithAnd(items)}.`];
}

/** @param {Record<string, unknown>} state */
function section4WordLines(state) {
  if (state.syncopeNoTbiHad === "no") return ["Потерь сознания без ЧМТ не было."];
  if (state.syncopeNoTbiHad !== "yes") return [];
  const raw = Array.isArray(state.syncopeNoTbiList) ? state.syncopeNoTbiList : [];
  const items = raw
    .map((it) => {
      const age = String(it?.age ?? "").trim();
      const ageUnknown = it?.ageUnknown === true;
      const cause = String(it?.cause ?? "").trim();
      if (!age && !ageUnknown) return "";
      const ageText = ageUnknown ? "обморок, возраст не помнит" : `обморок в возрасте ${age} лет`;
      return cause ? `${ageText} (${cause})` : ageText;
    })
    .filter(Boolean);
  if (!items.length) return [];
  return [`Потери сознания (без ЧМТ): ${items.join(", ")}.`];
}

/** @param {Record<string, unknown>} state */
function section5WordLines(state) {
  if (state.tbiWithLossHad === "no") return ["ЧМТ с потерей сознания в анамнезе не отмечалось."];
  if (state.tbiWithLossHad !== "yes") return [];
  const raw = Array.isArray(state.tbiWithLossList) ? state.tbiWithLossList : [];
  const cMap = {
    dtp: "при ДТП",
    head_hit: "при ударе головой",
    fall: "при падении",
    fight: "в драке",
    unknown: "обстоятельства неизвестны",
  };
  const dMap = {
    seconds: "потеря сознания на секунды",
    minutes: "потеря сознания на минуты",
    over_hour: "потеря сознания более чем на час",
    unknown: "длительность потери сознания неизвестна",
  };
  const eMap = {
    ct: "проводилась КТ",
    mri: "проводилась МРТ",
    no: "обследование не проводилось",
    unknown: "проводилось ли обследование — не помнит",
  };
  const items = raw
    .map((it) => {
      const age = String(it?.age ?? "").trim();
      const ageUnknown = it?.ageUnknown === true;
      if (!age && !ageUnknown) return "";
      const parts = [];
      if (it?.circumstance && cMap[it.circumstance]) parts.push(cMap[it.circumstance]);
      if (it?.lossDuration && dMap[it.lossDuration]) parts.push(dMap[it.lossDuration]);
      if (it?.exam && eMap[it.exam]) parts.push(eMap[it.exam]);
      const ageText = ageUnknown ? "ЧМТ, возраст не помнит" : `ЧМТ в возрасте ${age} лет`;
      return parts.length ? `${ageText} (${parts.join(", ")})` : ageText;
    })
    .filter(Boolean);
  if (!items.length) return [];
  return [`ЧМТ с потерей сознания: ${listWithAnd(items)}.`];
}

/** @param {Record<string, unknown>} state */
function section6WordLines(state) {
  if (state.epilepsyStatus === "no") return ["Эпилепсия отрицается."];
  if (state.epilepsyStatus === "unknown") return ["Данные об эпилепсии отсутствуют или не подтверждены."];
  if (state.epilepsyStatus !== "yes") return [];
  const first =
    state.epilepsyFirstSeizureType === "birth"
      ? "первые приступы с рождения"
      : state.epilepsyFirstSeizureType === "age" && String(state.epilepsyFirstSeizureAge ?? "").trim()
        ? `первые приступы в возрасте ${String(state.epilepsyFirstSeizureAge).trim()} лет`
        : "возраст первых приступов не помнит";
  if (state.epilepsyMedsStatus === "no") return [`Эпилепсия: ${first}. Лекарства не принимает.`];
  if (state.epilepsyMedsStatus === "unknown") return [`Эпилепсия: ${first}. Приём противосудорожных препаратов не помнит.`];
  if (state.epilepsyMedsStatus === "yes") {
    const meds = Array.isArray(state.epilepsyMeds) ? state.epilepsyMeds.filter((x) => typeof x === "string" && x.trim()) : [];
    if (meds.length) return [`Эпилепсия: ${first}. Принимает противосудорожные препараты: ${listWithAnd(meds)}.`];
    return [`Эпилепсия: ${first}. Принимает противосудорожные препараты.`];
  }
  return [`Эпилепсия: ${first}.`];
}

/** @param {Record<string, unknown>} state */
function section7WordLines(state) {
  if (state.chronicHad === "no") return ["Хронических заболеваний нет."];
  if (state.chronicHad !== "yes") return [];
  const d = String(state.chronicDiseasesText ?? "").trim();
  if (!d) return [];
  if (state.chronicMedsRegular === "yes") {
    const m = String(state.chronicMedsText ?? "").trim();
    return [m ? `Хронические заболевания: ${d}. Регулярно принимает: ${m}.` : `Хронические заболевания: ${d}.`];
  }
  if (state.chronicMedsRegular === "no") return [`Хронические заболевания: ${d}. Лекарства регулярно не принимает.`];
  if (state.chronicMedsRegular === "unknown") return [`Хронические заболевания: ${d}. Регулярный приём лекарств не помнит.`];
  return [`Хронические заболевания: ${d}.`];
}

/** @param {Record<string, unknown>} state */
function section8WordLines(state) {
  if (state.allergyHad === "no") return ["Аллергических реакций не отмечено."];
  if (state.allergyHad !== "yes") return [];
  const arr = Array.isArray(state.allergyList) ? state.allergyList : [];
  const items = arr
    .map((it) => {
      const trig = String(it?.trigger ?? "").trim();
      const reactions = Array.isArray(it?.reactions) ? it.reactions.filter((x) => typeof x === "string" && x.trim()) : [];
      if (!trig) return "";
      const rtxt = reactions.length ? listWithAnd(reactions) : "тип реакции не уточнен";
      return `аллергия на ${trig} — ${rtxt}`;
    })
    .filter(Boolean);
  if (!items.length) return [];
  return [`Аллергические реакции: ${items.join("; ")}.`];
}

/** @param {Record<string, unknown>} state @param {"male" | "female" | null} gender */
function section9WordLines(state, gender) {
  if (state.smokingStatus === "no") return ["Курения нет."];
  if (state.smokingStatus === "past") {
    const y = String(state.smokingPastYears ?? "").trim();
    return [phraseSmokedPast(gender, y)];
  }
  if (state.smokingStatus !== "yes") return [];
  const bits = ["Курит"];
  const y = String(state.smokingCurrentYears ?? "").trim();
  if (y) bits.push(`стаж ${y} лет`);
  const c = String(state.smokingCurrentCigs ?? "").trim();
  if (c) bits.push(c);
  if (state.smokingUsesVape === "yes") bits.push("также использует электронные сигареты/вейп/IQOS");
  return [`${bits.join(", ")}.`];
}

/** @param {Record<string, unknown>} state */
function section10WordLines(state) {
  const normalizeAlcoholPreference = (v) => {
    const t = String(v ?? "").trim().toLowerCase();
    if (t === "все вышеперечисленное") return "все виды алкоголя";
    return String(v ?? "").trim();
  };
  const formatAlcoholAmount = (v) => {
    const raw = String(v ?? "").trim();
    if (!/^\d+(\.\d+)?$/.test(raw)) return raw;
    let liters = Number(raw);
    if (!Number.isFinite(liters) || liters < 0) return raw;
    // Backward compatibility: old scale 0..10 where 1 step = 0.5L.
    if (liters > 5 && liters <= 10) liters = liters * 0.5;
    if (liters > 5) return raw;
    if (liters >= 5) return "5 литров и более";
    if (liters === 0) return "0 мл";
    const ml = liters * 1000;
    if (ml < 1000) return `${ml} мл`;
    if (Number.isInteger(liters)) return `${liters} л`;
    return `${String(liters).replace(".", ",")} л`;
  };
  if (state.alcoholStatus === "none") return ["Алкогольные напитки не употребляет."];
  if (state.alcoholStatus === "rare") {
    const d = normalizeAlcoholPreference(state.alcoholRareDrink);
    const a = formatAlcoholAmount(state.alcoholRareAmount);
    const bits = ["Употребляет редко (1–2 раза в месяц и реже)"];
    if (d) bits.push(`обычно ${d}`);
    if (a) bits.push(`в количестве ${a}`);
    return [`Алкоголь: ${bits.join(", ")}.`];
  }
  if (state.alcoholStatus !== "regular") return [];
  const pref = normalizeAlcoholPreference(state.alcoholRegularPref);
  const amount = String(state.alcoholRegularAmount ?? "").trim();
  const bits = ["Употребляет регулярно (1–2 раза в неделю и чаще)"];
  if (pref) bits.push(`предпочитает ${pref}`);
  if (amount) bits.push(`в количестве ${amount}`);
  const consequences = [];
  if (state.alcoholRegularConsequencesHangover) consequences.push("тяжелое похмелье");
  if (state.alcoholRegularConsequencesMemoryBlackouts) consequences.push("провалы в памяти");
  if (state.alcoholRegularConsequencesConflicts) consequences.push("конфликты из-за алкоголя");
  if (state.alcoholRegularConsequencesLaw) consequences.push("проблемы с законом");
  if (state.alcoholRegularConsequencesNarcologist) consequences.push("обращение за помощью к наркологу");
  const tail = consequences.length ? ` Отмечались последствия: ${listWithAnd(consequences)}.` : ".";
  return [`Алкоголь: ${bits.join(", ")}${tail}`];
}

/** @param {Record<string, unknown>} state @param {"male" | "female" | null} gender */
function section11WordLines(state, gender) {
  const formatPavLastUse = (v) => {
    const raw = String(v ?? "").trim();
    if (!raw) return "";
    const ym = raw.match(/^(\d{4})-(\d{2})$/);
    if (ym) return `${ym[2]}.${ym[1]}`;
    const my = raw.match(/^(\d{2})\.(\d{4})$/);
    if (my) return `${my[1]}.${my[2]}`;
    return raw;
  };
  if (state.pavHad === "no") return ["Употребление ПАВ отрицает."];
  if (state.pavHad !== "yes") return [];
  const groupsRaw = Array.isArray(state.pavGroups) ? state.pavGroups : [];
  const groups = groupsRaw
    .filter((x) => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean);
  const items = groups.length ? groups : [];
  const head = state.pavGroupsUnknown === true ? "группы ПАВ не знает" : items.length ? listWithAnd(items) : "группы ПАВ не указаны";
  const details = [];
  const exp = String(state.pavExperience ?? "").trim();
  if (exp) details.push(`стаж: ${exp}`);
  const last = formatPavLastUse(state.pavLastUse);
  if (last) details.push(`последнее употребление: ${last}`);
  const freq = phrasePavFrequency(gender, state.pavFrequency);
  if (freq) details.push(`частота: ${freq}`);
  const treatment = phrasePavTreatment(gender, state.pavTreatment);
  if (treatment) details.push(`лечение: ${treatment}`);
  return [`Употребление ПАВ: ${head}${details.length ? ` (${details.join(", ")})` : ""}.`];
}

/** @param {"male" | "female" | null} gender */
function childhoodObservedVerbPast(gender) {
  if (gender === "male") return "наблюдался";
  if (gender === "female") return "наблюдалась";
  return "наблюдался(ась)";
}

/** @param {"male" | "female" | null} gender */
function childhoodNegativeVerbPast(gender) {
  if (gender === "male") return "не наблюдался";
  if (gender === "female") return "не наблюдалась";
  return "не наблюдался(ась)";
}

/** @param {ChildhoodVisit} v */
function childhoodVisitSpecialistPhraseForWord(v) {
  const co = String(v.customOther ?? "").trim();
  if (v.specialist === "custom") {
    if (co) return `врача ${co}`;
    return "врача (специализация не указана)";
  }
  if (v.specialist === "neuro") return "врача невролога";
  if (v.specialist === "psych") return "врача психиатра";
  if (v.specialist === "endo") return "врача эндокринолога";
  return "врача невролога";
}

/** @param {ChildhoodVisit} v */
function childhoodVisitClauseForWord(v) {
  if (v.specialist === "custom" && !String(v.customOther ?? "").trim()) return "";
  const head = `у ${childhoodVisitSpecialistPhraseForWord(v)}`;
  if (v.reasonUnknown === true) return `${head}, причину не знает`;
  const r = String(v.reason ?? "").trim();
  if (r) return `${head} по причине «${r}»`;
  return "";
}

/**
 * @param {Record<string, unknown>} state
 * @param {"male" | "female" | null} gender
 */
function formatChildhoodSpecialistsLineForWord(state, gender) {
  const y = state.childhoodSpecialists;
  if (y === "no") return `В детстве у специалистов ${childhoodNegativeVerbPast(gender)}.`;
  if (y !== "yes") return "";
  const list = Array.isArray(state.childhoodVisits) ? /** @type {ChildhoodVisit[]} */ (state.childhoodVisits) : [];
  const clauses = list.map(childhoodVisitClauseForWord).filter(Boolean);
  if (!clauses.length) return "";
  if (clauses.length === 1) return `В детстве ${childhoodObservedVerbPast(gender)} ${clauses[0]}.`;
  if (clauses.length === 2) return `В детстве ${childhoodObservedVerbPast(gender)} ${clauses[0]} и ${clauses[1]}.`;
  return `В детстве ${childhoodObservedVerbPast(gender)} ${clauses.slice(0, -1).join(", ")} и ${clauses[clauses.length - 1]}.`;
}

/**
 * @param {Record<string, unknown>} state
 * @param {"male" | "female" | null} gender
 */
export function formatLifeStructuredForWord(state, gender) {
  const lines = [];
  const h = state.heredity;
  if (h === "no") lines.push(HEREDITY_NO_PHRASE);
  else if (h === "unknown") lines.push(HEREDITY_UNKNOWN_PHRASE);
  else if (h === "yes") {
    const cases = Array.isArray(state.heredityCases) ? /** @type {HeredityCase[]} */ (state.heredityCases) : [];
    const line = formatHeredityCasesLineForWord(cases);
    if (line) lines.push(`Наследственность: ${line}.`);
    else lines.push("В семье отмечались психические расстройства (родственники и характер патологии не указаны).");
  }

  const born = verbBornPastForBirthBlock(gender);
  const birthFamilyPart =
    state.birthFamily === "full"
      ? `${born} в полной семье`
      : state.birthFamily === "incomplete"
        ? `${born} в неполной семье`
        : "";
  const birthOrderPart = birthOrderPhraseForWord(state);
  if (birthFamilyPart && birthOrderPart) lines.push(`${birthFamilyPart}, ${birthOrderPart}.`);
  else if (birthFamilyPart) lines.push(`${birthFamilyPart}.`);
  else if (birthOrderPart) lines.push(`${upperFirst(birthOrderPart)}.`);

  const birth345Line = birth345LineForWord(state);
  if (birth345Line) lines.push(birth345Line);

  if (state.birthTrauma === "no") lines.push("Родовой травмы не было.");
  if (state.birthTrauma === "yes") {
    const details = String(state.birthTraumaDetails ?? "").trim();
    // Фраза фиксированная: «травма» женского рода, согласуем по слову «травма»
    lines.push(details ? `Была родовая травма (со слов: "${details}").` : `Была родовая травма.`);
  }
  if (state.birthTrauma === "unknown") lines.push("Объективных данных о наличии родовой травмы нет.");

  lines.push(...block3WordLines(state, gender));

  const chLine = formatChildhoodSpecialistsLineForWord(state, gender);
  if (chLine) lines.push(chLine);
  lines.push(...block6WordLines(state, gender));

  if (gender === "male") {
    if (state.army === "served") lines.push("Армия: служил.");
    if (state.army === "not") lines.push("Армия: не служил.");
  }

  if (state.eduAfterSchool === "no" || state.eduNoAfterSchool) {
    lines.push(
      gender === "female"
        ? "После школы образование не получала."
        : gender === "male"
          ? "После школы образование не получал."
          : "После школы образование не получал(а)."
    );
  } else {
    const edu = [];
    const negr = phraseEduNotReceivedPast(gender);
    if (state.eduSecNone) edu.push(`среднее профессиональное образование — ${negr}`);
    if (state.eduSecDone) edu.push(`среднее профессиональное образование — законченное${state.eduSecSpec ? ` (${String(state.eduSecSpec).trim()})` : ""}`);
    if (state.eduSecUndone) edu.push(`среднее профессиональное образование — незаконченное${state.eduSecSpec ? ` (${String(state.eduSecSpec).trim()})` : ""}`);
    if (state.eduHiNone) edu.push(`высшее образование — ${negr}`);
    if (state.eduHiDone) edu.push(`высшее образование — законченное${state.eduHiSpec ? ` (${String(state.eduHiSpec).trim()})` : ""}`);
    if (state.eduHiUndone) edu.push(`высшее образование — незаконченное${state.eduHiSpec ? ` (${String(state.eduHiSpec).trim()})` : ""}`);
    if (edu.length) lines.push(`Образование: ${edu.join("; ")}.`);
  }
  lines.push(...socialAnamnesisWordLines(state, gender));
  lines.push(...section2WordLines(state));
  lines.push(...section3WordLines(state));
  lines.push(...section4WordLines(state));
  lines.push(...section5WordLines(state));
  lines.push(...section6WordLines(state));
  lines.push(...section7WordLines(state));
  lines.push(...section8WordLines(state));
  lines.push(...section9WordLines(state, gender));
  lines.push(...section10WordLines(state));
  lines.push(...section11WordLines(state, gender));

  return lines.join("\n").trim();
}

const PATHOLOGY_OPTIONS = [
  ["dep_alcohol", "Алкогольная зависимость"],
  ["dep_narcotic", "Наркотическая зависимость"],
  ["dep_depression", "Депрессивные расстройства"],
  ["dep_anxiety", "Тревожные расстройства"],
  ["dep_suicide_done", "Суицид (реализованный)"],
  ["dep_suicide_attempt", "Суицидальные попытки"],
  ["dep_psychiatrist", "Наблюдение у психиатра"],
  ["dep_dementia", "Деменция"],
];

/** @param {HTMLElement} root */
function readHeredityDraftFromDom(root) {
  const whoSel = root.querySelector("#mh-life-who");
  const who = whoSel instanceof HTMLSelectElement ? whoSel.value.trim() : "";
  const sibSel = root.querySelector("#mh-life-sibling-deg");
  const siblingDegree = sibSel instanceof HTMLSelectElement && sibSel.value ? sibSel.value : undefined;
  const lineEl = root.querySelector('input[name="mh-life-draft-line"]:checked');
  const line = lineEl instanceof HTMLInputElement && lineEl.value ? lineEl.value : undefined;
  const pathology = [];
  root.querySelectorAll("input[data-h-path-draft]").forEach((el) => {
    if (el instanceof HTMLInputElement && el.checked && el.dataset.hPathDraft) pathology.push(el.dataset.hPathDraft);
  });
  const otherInp = root.querySelector("#mh-life-draft-pathology-other");
  const pathologyOther = otherInp instanceof HTMLInputElement ? otherInp.value : "";
  /** @type {HeredityCase} */
  const c = { who, pathology, pathologyOther };
  if (siblingDegree) c.siblingDegree = siblingDegree;
  if (line === "maternal" || line === "paternal") c.line = line;
  return c;
}

/** @param {HeredityCase} draft */
function validateHeredityDraft(draft) {
  if (!draft.who || !WHO_CODES.has(draft.who)) return "Выберите родственника.";
  if (needsSiblingDegree(draft.who)) {
    if (!draft.siblingDegree || !ALL_SIBLING_DEGS.has(draft.siblingDegree)) return "Укажите степень родства (родной / двоюродный и т.д.).";
  }
  if (needsLine(draft.who, draft.siblingDegree)) {
    if (draft.line !== "maternal" && draft.line !== "paternal") return "Укажите линию (по маминой или по папиной).";
  }
  const o = String(draft.pathologyOther ?? "").trim();
  if (!draft.pathology.length && !o) return "Отметьте характер патологии или укажите своё.";
  return "";
}

/** @param {HeredityCase} c */
function summarizeCaseForUi(c) {
  return formatOneHeredityCaseForWord(c) || JSON.stringify(c);
}

/** @param {ChildhoodVisit} v */
function childhoodSpecialistUiLabel(v) {
  const co = String(v.customOther ?? "").trim();
  if (v.specialist === "custom") return co || "специалист (не указан)";
  if (v.specialist === "psych") return "психиатр";
  if (v.specialist === "endo") return "эндокринолог";
  return "невролог";
}

/** @param {ChildhoodVisit} v */
function summarizeChildhoodVisitForUi(v) {
  const spec = childhoodSpecialistUiLabel(v);
  if (v.reasonUnknown) return `${spec}, причина неизвестна`;
  const r = String(v.reason ?? "").trim();
  return r ? `${spec}: ${r}` : spec;
}

/** @param {HTMLElement} root @returns {ChildhoodVisit} */
function readChildhoodDraftFromDom(root) {
  const specSel = root.querySelector("#mh-life-ch-draft-specialist");
  const specialist =
    specSel instanceof HTMLSelectElement && CHILDHOOD_SPECIALIST_CODES.has(specSel.value) ? specSel.value : "";
  const customInp = root.querySelector("#mh-life-ch-draft-custom");
  const customOther = customInp instanceof HTMLInputElement ? customInp.value.trim() : "";
  const reasonInp = root.querySelector("#mh-life-ch-draft-reason");
  const reason = reasonInp instanceof HTMLInputElement ? reasonInp.value.trim() : "";
  const un = root.querySelector("#mh-life-ch-draft-reason-unknown");
  const reasonUnknown = un instanceof HTMLInputElement && un.checked;
  return {
    specialist: specialist || "neuro",
    customOther: specialist === "custom" ? customOther : "",
    reason: reasonUnknown ? "" : reason,
    reasonUnknown,
  };
}

/** @param {ChildhoodVisit} draft */
function validateChildhoodDraft(draft) {
  if (!draft.specialist || !CHILDHOOD_SPECIALIST_CODES.has(draft.specialist)) {
    return "Выберите специалиста из списка.";
  }
  if (draft.specialist === "custom" && !String(draft.customOther ?? "").trim()) {
    return "Укажите специалиста (свой вариант).";
  }
  if (!draft.reasonUnknown && !String(draft.reason ?? "").trim()) {
    return "Укажите причину наблюдения или отметьте «Не знаю причину».";
  }
  return "";
}

/** @param {ChildhoodVisit} draft */
function isChildhoodDraftEmpty(draft) {
  return (
    (draft.specialist === "neuro" || !draft.specialist) &&
    !String(draft.customOther ?? "").trim() &&
    !String(draft.reason ?? "").trim() &&
    !draft.reasonUnknown
  );
}

/**
 * @param {HTMLElement} contentEl
 * @param {Record<string, string>} answers
 * @param {number} qIndex
 * @param {number} stepsLen
 * @param {"male" | "female" | null} gender
 * @param {HTMLButtonElement | null} nextWizardBtn
 */
/**
 * @param {HTMLElement} contentEl
 * @param {Record<string, string>} answers
 * @param {number} qIndex
 * @param {number} stepsLen
 * @param {"male" | "female" | null} gender
 * @param {HTMLButtonElement | null} nextWizardBtn
 * @param {{ title: string; intro: string } | null} [blockLeadOverride]
 */
export function renderLifeStructuredStep(contentEl, answers, qIndex, stepsLen, gender, nextWizardBtn, blockLeadOverride) {
  const step = {
    blockLead: blockLeadOverride ?? { title: "Анамнез жизни", intro: "Заполните поля ниже." },
    codeLabel: "Анамнез жизни",
    prompt: "",
  };
  const state = parseLifeStructuredString(answers[LIFE_STRUCTURED_ID]);

  contentEl.replaceChildren();
  delete contentEl.dataset.itogEnhanced;
  if (blockLeadOverride) {
    try {
      contentEl.dataset.mhBlockLead = JSON.stringify(blockLeadOverride);
    } catch {
      delete contentEl.dataset.mhBlockLead;
    }
  }
  /** @type {{ title: string; intro: string } | undefined} */
  let resolvedLead = blockLeadOverride ?? undefined;
  if (!resolvedLead && contentEl.dataset.mhBlockLead) {
    try {
      resolvedLead = JSON.parse(contentEl.dataset.mhBlockLead);
    } catch {
      resolvedLead = undefined;
    }
  }
  if (resolvedLead) {
    step.blockLead = resolvedLead;
  }

  const progressEl = contentEl.closest(".mh-step")?.querySelector(".mh-progress");
  if (progressEl) progressEl.textContent = `Шаг опросника: ${qIndex + 1} из ${stepsLen}`;

  if (step.blockLead) {
    const h2 = document.createElement("h2");
    h2.className = "mh-block-title";
    h2.textContent = step.blockLead.title;
    contentEl.appendChild(h2);
    const intro = document.createElement("p");
    intro.className = "mh-prompt";
    intro.textContent = step.blockLead.intro;
    contentEl.appendChild(intro);
  }
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

  const uiEnuresisYes = gender === "female" ? "Да, была" : gender === "male" ? "Да, был" : "Да, был(а)";
  const uiKdgYes = gender === "female" ? "Да, посещала" : gender === "male" ? "Да, посещал" : "Да, посещал(а)";
  const uiKdgNo =
    gender === "female"
      ? "Нет, не посещала (воспитывалась дома)"
      : gender === "male"
        ? "Нет, не посещал (воспитывался дома)"
        : "Нет, не посещал(а) (воспитывался(ась) дома)";
  const uiAdapted =
    gender === "female"
      ? "Адаптировалась без особенностей"
      : gender === "male"
        ? "Адаптировался без особенностей"
        : "Адаптировался(ась) без особенностей";
  const uiCharacterQ =
    gender === "female"
      ? "Вопрос 7. Какой Вы были по характеру в детстве?"
      : gender === "male"
        ? "Вопрос 7. Каким Вы были по характеру в детстве?"
        : "Вопрос 7. Каким(ой) Вы были по характеру в детстве?";
  const uiSchoolFinishedYes = gender === "female" ? "Окончила школу" : gender === "male" ? "Окончил школу" : "Окончил(а) школу";
  const uiSchoolFinishedNo =
    gender === "female" ? "Не окончила школу" : gender === "male" ? "Не окончил школу" : "Не окончил(а) школу";
  const uiSmokingPast = gender === "female" ? "Бросила" : gender === "male" ? "Бросил" : "Бросил(а)";
  const uiSchoolHome =
    gender === "female" ? "Обучалась на дому" : gender === "male" ? "Обучался на дому" : "Обучался(ась) на дому";
  const uiPeerEasy =
    gender === "female"
      ? "Легко находила друзей"
      : gender === "male"
        ? "Легко находил друзей"
        : "Легко находил(а) друзей";
  const uiPeerOutcast =
    gender === "female"
      ? "Была изгоем / отвергаемой"
      : gender === "male"
        ? "Был изгоем / отвергаемым"
        : "Был(а) изгоем / отвергаемым";
  const uiPeerBullied =
    gender === "female"
      ? "Подвергалась буллингу (травле)"
      : gender === "male"
        ? "Подвергался буллингу (травле)"
        : "Подвергался(ась) буллингу (травле)";
  const uiPeerAggr =
    gender === "female"
      ? "Сама проявляла агрессию к другим"
      : gender === "male"
        ? "Сам проявлял агрессию к другим"
        : "Сам(а) проявлял(а) агрессию к другим";
  const uiTeacherFav =
    gender === "female"
      ? "Была любимицей"
      : gender === "male"
        ? "Был любимчиком"
        : "Был(а) любимчиком / любимицей";
  const uiTeacherCrit =
    gender === "female"
      ? "Была объектом критики / придирок"
      : gender === "male"
        ? "Был объектом критики / придирок"
        : "Был(а) объектом критики / придирок";
  const uiSchoolClassesRowPrefix =
    gender === "female"
      ? "Сколько классов окончила: "
      : gender === "male"
        ? "Сколько классов окончил: "
        : "Сколько классов окончил(а): ";

  const fs0 = fieldset("");
  fs0.classList.add("mh-life-fieldset--plain");
  fs0.appendChild(radioRow("mh-life-heredity", "yes", "Да", state.heredity === "yes"));
  fs0.appendChild(radioRow("mh-life-heredity", "no", "Нет", state.heredity === "no"));
  fs0.appendChild(radioRow("mh-life-heredity", "unknown", "Не знаю", state.heredity === "unknown"));

  const cases = Array.isArray(state.heredityCases) ? /** @type {HeredityCase[]} */ (state.heredityCases) : [];
  const draftClosed = state.heredity === "yes" && state.heredityCloseDraft === true;

  const listPanel = document.createElement("div");
  listPanel.className = "mh-life-heredity-list-panel";
  listPanel.hidden = state.heredity !== "yes";

  const fsList = fieldset("Добавленные родственники");
  const listIntro = document.createElement("p");
  listIntro.className = "mh-life-hint";
  if (draftClosed) {
    listIntro.textContent =
      cases.length > 0
        ? "Перечисление завершено. Нажмите «Добавить ещё одного родственника», если нужно указать ещё одного."
        : "Перечисление завершено. Можно добавить родственника кнопкой ниже или оставить список пустым.";
  } else if (cases.length) {
    listIntro.textContent =
      "Ниже — форма для следующего родственника. Уже добавленные остаются в списке.";
  } else {
    listIntro.textContent =
      "Заполните форму ниже и нажмите «Сохранить и добавить ещё одного» или «Сохранить и закончить».";
  }
  fsList.appendChild(listIntro);
  const ul = document.createElement("ul");
  ul.className = "mh-life-heredity-list";
  cases.forEach((c, idx) => {
    const li = document.createElement("li");
    li.className = "mh-life-heredity-item";
    const span = document.createElement("span");
    span.textContent = summarizeCaseForUi(c);
    li.appendChild(span);
    const del = document.createElement("button");
    del.type = "button";
    del.className = "mh-life-heredity-remove";
    del.textContent = "Удалить";
    del.addEventListener("click", () => {
      readLifeStructuredFromDom(contentEl, answers);
      const st = parseLifeStructuredString(answers[LIFE_STRUCTURED_ID]);
      const arr = Array.isArray(st.heredityCases) ? /** @type {HeredityCase[]} */ (st.heredityCases) : [];
      arr.splice(idx, 1);
      st.heredityCases = arr;
      answers[LIFE_STRUCTURED_ID] = JSON.stringify(st);
      renderLifeStructuredStep(contentEl, answers, qIndex, stepsLen, gender, nextWizardBtn);
    });
    li.appendChild(del);
    ul.appendChild(li);
  });
  fsList.appendChild(ul);
  listPanel.appendChild(fsList);

  const casesJson = document.createElement("textarea");
  casesJson.id = "mh-life-heredity-cases-json";
  casesJson.hidden = true;
  casesJson.setAttribute("aria-hidden", "true");
  casesJson.textContent = JSON.stringify(cases);
  listPanel.appendChild(casesJson);

  const listActions = document.createElement("div");
  listActions.className = "mh-life-heredity-list-actions";
  const btnReopenDraft = document.createElement("button");
  btnReopenDraft.type = "button";
  btnReopenDraft.className = "mh-life-add-case";
  btnReopenDraft.textContent = "Добавить ещё одного родственника";
  btnReopenDraft.className = "mh-life-btn mh-life-btn--secondary";
  btnReopenDraft.hidden = !draftClosed;
  listActions.appendChild(btnReopenDraft);
  listPanel.appendChild(listActions);


  const yesBlock = document.createElement("div");
  yesBlock.id = "mh-life-yes-block";
  yesBlock.className = "mh-life-yes-block";
  yesBlock.hidden = state.heredity !== "yes" || draftClosed;

  const draftWrap = document.createElement("div");
  draftWrap.className = "mh-life-heredity-draft-wrap";
  const draftTitle = document.createElement("p");
  draftTitle.className = "mh-life-heredity-draft-title";
  draftTitle.textContent = "Следующий родственник";
  draftWrap.appendChild(draftTitle);

  const fsWho = fieldset("1.1. Кто именно");
  const whoSel = document.createElement("select");
  whoSel.id = "mh-life-who";
  whoSel.className = "mh-life-select";
  const w0 = document.createElement("option");
  w0.value = "";
  w0.textContent = "— выберите —";
  whoSel.appendChild(w0);
  WHO_OPTIONS.forEach(([v, lab]) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = lab;
    whoSel.appendChild(o);
  });
  fsWho.appendChild(whoSel);
  draftWrap.appendChild(fsWho);

  const fsSib = fieldset("1.2. Степень родства");
  const sibRow = document.createElement("div");
  sibRow.id = "mh-life-sibling-row";
  sibRow.className = "mh-life-row";
  const sibSel = document.createElement("select");
  sibSel.id = "mh-life-sibling-deg";
  sibSel.className = "mh-life-select";
  sibSel.disabled = true;
  const sx = document.createElement("option");
  sx.value = "";
  sx.textContent = "—";
  sibSel.appendChild(sx);
  sibRow.appendChild(sibSel);
  fsSib.appendChild(sibRow);
  fsSib.hidden = true;
  draftWrap.appendChild(fsSib);

  const fsLine = fieldset("1.3. Линия");
  const lineRow = document.createElement("div");
  lineRow.id = "mh-life-draft-line-row";
  lineRow.className = "mh-life-line-row";
  lineRow.appendChild(document.createTextNode("Линия: "));
  lineRow.appendChild(radioRow("mh-life-draft-line", "maternal", "По маминой линии", false));
  lineRow.appendChild(radioRow("mh-life-draft-line", "paternal", "По папиной линии", false));
  fsLine.appendChild(lineRow);
  fsLine.hidden = true;
  draftWrap.appendChild(fsLine);

  const fsPath = fieldset("1.4. Характер патологии (можно несколько)");
  PATHOLOGY_OPTIONS.forEach(([code, lab]) => {
    const labEl = document.createElement("label");
    labEl.className = "mh-life-check";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.hPathDraft = code;
    labEl.appendChild(cb);
    if (code === "dep_psychiatrist") {
      const span = document.createElement("span");
      span.id = "mh-life-psychiatrist-option-text";
      span.textContent = ` ${psychiatristOptionUiLabel("")}`;
      labEl.appendChild(span);
    } else {
      labEl.appendChild(document.createTextNode(` ${lab}`));
    }
    fsPath.appendChild(labEl);
  });
  const otherL = document.createElement("label");
  otherL.className = "mh-life-custom-wrap";
  otherL.textContent = "Своё (другие расстройства): ";
  const otherInp = document.createElement("input");
  otherInp.type = "text";
  otherInp.id = "mh-life-draft-pathology-other";
  otherInp.className = "mh-life-text";
  otherL.appendChild(otherInp);
  fsPath.appendChild(otherL);
  draftWrap.appendChild(fsPath);

  const addRow = document.createElement("div");
  addRow.className = "mh-life-heredity-actions";
  const btnAdd = document.createElement("button");
  btnAdd.type = "button";
  btnAdd.className = "mh-life-btn mh-life-btn--primary";
  btnAdd.textContent = "Сохранить и добавить ещё одного";
  const btnFinish = document.createElement("button");
  btnFinish.type = "button";
  btnFinish.className = "mh-life-btn mh-life-btn--secondary";
  btnFinish.textContent = "Сохранить и закончить";
  const btnClearDraft = document.createElement("button");
  btnClearDraft.type = "button";
  btnClearDraft.className = "mh-life-btn mh-life-btn--ghost";
  btnClearDraft.textContent = "Очистить форму";
  addRow.appendChild(btnAdd);
  addRow.appendChild(btnFinish);
  addRow.appendChild(btnClearDraft);
  draftWrap.appendChild(addRow);

  yesBlock.appendChild(draftWrap);

  function setHeredityCloseDraft(flag) {
    readLifeStructuredFromDom(contentEl, answers);
    const st = parseLifeStructuredString(answers[LIFE_STRUCTURED_ID]);
    st.heredityCloseDraft = flag;
    answers[LIFE_STRUCTURED_ID] = JSON.stringify(st);
    renderLifeStructuredStep(contentEl, answers, qIndex, stepsLen, gender, nextWizardBtn);
  }

  function resetHeredityDraftForm() {
    if (whoSel instanceof HTMLSelectElement) whoSel.value = "";
    syncHeredityDraftUi();
    yesBlock.querySelectorAll("input[data-h-path-draft]").forEach((el) => {
      if (el instanceof HTMLInputElement) el.checked = false;
    });
    yesBlock.querySelectorAll('input[name="mh-life-draft-line"]').forEach((el) => {
      if (el instanceof HTMLInputElement) el.checked = false;
    });
    const oi = yesBlock.querySelector("#mh-life-draft-pathology-other");
    if (oi instanceof HTMLInputElement) oi.value = "";
  }

  btnClearDraft.addEventListener("click", () => resetHeredityDraftForm());
  btnReopenDraft.addEventListener("click", () => setHeredityCloseDraft(false));

  const fsB2 = fieldset("Блок 1. Рождение и семья");
  const qH = document.createElement("p");
  qH.className = "mh-life-edu-title";
  qH.textContent = "Были ли у Ваших родственников установленные расстройства психики?";
  fsB2.appendChild(qH);
  fsB2.appendChild(fs0);
  fsB2.appendChild(listPanel);
  fsB2.appendChild(yesBlock);

  const q2a = document.createElement("p");
  q2a.className = "mh-life-edu-title";
  q2a.textContent = "Вопрос 1. Вы родились в полной семье?";
  fsB2.appendChild(q2a);
  fsB2.appendChild(radioRow("mh-life-birth", "full", "Да", state.birthFamily === "full"));
  fsB2.appendChild(radioRow("mh-life-birth", "incomplete", "Нет", state.birthFamily === "incomplete"));

  const q2b = document.createElement("p");
  q2b.className = "mh-life-edu-title";
  q2b.textContent = "Вопрос 2. Каким по счету ребенком Вы родились?";
  fsB2.appendChild(q2b);
  const ordRow = document.createElement("div");
  ordRow.className = "mh-life-row";
  const ordSel = document.createElement("select");
  ordSel.id = "mh-life-birth-order";
  ordSel.className = "mh-life-select";
  const ordEmpty = document.createElement("option");
  ordEmpty.value = "";
  ordEmpty.textContent = "—";
  ordSel.appendChild(ordEmpty);
  for (let n = 1; n <= 10; n += 1) {
    const o = document.createElement("option");
    o.value = String(n);
    o.textContent = String(n);
    if (String(state.birthOrder ?? "") === String(n)) o.selected = true;
    ordSel.appendChild(o);
  }
  ordRow.appendChild(document.createTextNode("По счету: "));
  ordRow.appendChild(ordSel);
  fsB2.appendChild(ordRow);

  const totalRow = document.createElement("div");
  totalRow.className = "mh-life-row";
  const totalSel = document.createElement("select");
  totalSel.id = "mh-life-birth-total";
  totalSel.className = "mh-life-select";
  const totalEmpty = document.createElement("option");
  totalEmpty.value = "";
  totalEmpty.textContent = "—";
  totalSel.appendChild(totalEmpty);
  for (let n = 1; n <= 10; n += 1) {
    const o = document.createElement("option");
    o.value = String(n);
    o.textContent = String(n);
    if (String(state.birthChildrenTotal ?? "") === String(n)) o.selected = true;
    totalSel.appendChild(o);
  }
  totalRow.appendChild(document.createTextNode("Из скольких детей: "));
  totalRow.appendChild(totalSel);
  fsB2.appendChild(totalRow);

  const q3 = document.createElement("p");
  q3.className = "mh-life-edu-title";
  q3.textContent = "Вопрос 3. В какой срок Вы родились?";
  fsB2.appendChild(q3);
  fsB2.appendChild(radioRow("mh-life-birth-term", "term", "в срок (37-42 недели)", state.birthTerm === "term"));
  fsB2.appendChild(
    radioRow("mh-life-birth-term", "preterm", "раньше положенного срока (до 37 недель)", state.birthTerm === "preterm")
  );
  fsB2.appendChild(
    radioRow("mh-life-birth-term", "postterm", "позже положенного срока (после 42 недель)", state.birthTerm === "postterm")
  );
  fsB2.appendChild(radioRow("mh-life-birth-term", "unknown", "не знаю", state.birthTerm === "unknown"));

  const q4 = document.createElement("p");
  q4.className = "mh-life-edu-title";
  q4.textContent = "Вопрос 4. Как протекали роды?";
  fsB2.appendChild(q4);
  fsB2.appendChild(radioRow("mh-life-birth-delivery", "self", "Самостоятельные", state.birthDelivery === "self"));
  fsB2.appendChild(radioRow("mh-life-birth-delivery", "cesarean", "Кесарево сечение", state.birthDelivery === "cesarean"));
  fsB2.appendChild(radioRow("mh-life-birth-delivery", "unknown", "Не знаю", state.birthDelivery === "unknown"));

  const q5 = document.createElement("p");
  q5.className = "mh-life-edu-title";
  q5.textContent = "Вопрос 5. Течение родов:";
  fsB2.appendChild(q5);
  fsB2.appendChild(radioRow("mh-life-birth-course", "normal", "Без осложнений", state.birthCourse === "normal"));
  fsB2.appendChild(radioRow("mh-life-birth-course", "complicated", "С осложнениями", state.birthCourse === "complicated"));
  fsB2.appendChild(radioRow("mh-life-birth-course", "unknown", "Не знаю", state.birthCourse === "unknown"));
  const courseDetailsRow = document.createElement("div");
  courseDetailsRow.className = "mh-life-row";
  courseDetailsRow.hidden = state.birthCourse !== "complicated";
  courseDetailsRow.appendChild(document.createTextNode("Уточнение осложнений: "));
  const courseDetailsInp = document.createElement("input");
  courseDetailsInp.type = "text";
  courseDetailsInp.id = "mh-life-birth-course-details";
  courseDetailsInp.className = "mh-life-text";
  courseDetailsInp.value = String(state.birthCourseDetails ?? "");
  courseDetailsRow.appendChild(courseDetailsInp);
  fsB2.appendChild(courseDetailsRow);
  fsB2.querySelectorAll('input[name="mh-life-birth-course"]').forEach((el) => {
    el.addEventListener("change", () => {
      const cr = fsB2.querySelector('input[name="mh-life-birth-course"]:checked');
      const isComp = cr instanceof HTMLInputElement && cr.value === "complicated";
      courseDetailsRow.hidden = !isComp;
      if (!isComp) courseDetailsInp.value = "";
    });
  });

  const q6 = document.createElement("p");
  q6.className = "mh-life-edu-title";
  q6.textContent = "Вопрос 6. Была ли родовая травма?";
  fsB2.appendChild(q6);
  fsB2.appendChild(radioRow("mh-life-birth-trauma", "yes", "Да", state.birthTrauma === "yes"));
  fsB2.appendChild(radioRow("mh-life-birth-trauma", "no", "Нет", state.birthTrauma === "no"));
  fsB2.appendChild(radioRow("mh-life-birth-trauma", "unknown", "Не знаю", state.birthTrauma === "unknown"));
  const traumaDetailsRow = document.createElement("div");
  traumaDetailsRow.className = "mh-life-row";
  traumaDetailsRow.hidden = state.birthTrauma !== "yes";
  traumaDetailsRow.appendChild(document.createTextNode("Со слов пациента: "));
  const traumaDetailsInp = document.createElement("input");
  traumaDetailsInp.type = "text";
  traumaDetailsInp.id = "mh-life-birth-trauma-details";
  traumaDetailsInp.className = "mh-life-text";
  traumaDetailsInp.value = String(state.birthTraumaDetails ?? "");
  traumaDetailsRow.appendChild(traumaDetailsInp);
  fsB2.appendChild(traumaDetailsRow);
  fsB2.querySelectorAll('input[name="mh-life-birth-trauma"]').forEach((el) => {
    el.addEventListener("change", () => {
      const tr = fsB2.querySelector('input[name="mh-life-birth-trauma"]:checked');
      const isYes = tr instanceof HTMLInputElement && tr.value === "yes";
      traumaDetailsRow.hidden = !isYes;
      if (!isYes) traumaDetailsInp.value = "";
    });
  });

  contentEl.appendChild(fsB2);

  const fsB3 = fieldset("Блок 2. Раннее развитие");

  const q31 = document.createElement("p");
  q31.className = "mh-life-edu-title";
  q31.textContent = "Вопрос 1. Как протекало Ваше развитие в первый год жизни?";
  fsB3.appendChild(q31);
  fsB3.appendChild(radioRow("mh-life-dev-year", "timely", "Без задержек, своевременно", state.devFirstYear === "timely"));
  fsB3.appendChild(radioRow("mh-life-dev-year", "delay", "С задержками", state.devFirstYear === "delay"));
  fsB3.appendChild(radioRow("mh-life-dev-year", "unknown", "Не знаю", state.devFirstYear === "unknown"));
  const devDelayRow = document.createElement("div");
  devDelayRow.className = "mh-life-row";
  devDelayRow.hidden = state.devFirstYear !== "delay";
  devDelayRow.appendChild(document.createTextNode("Какие именно задержки (через запятую): "));
  const devDelayInp = document.createElement("input");
  devDelayInp.type = "text";
  devDelayInp.id = "mh-life-dev-year-delay-details";
  devDelayInp.className = "mh-life-text";
  devDelayInp.value = String(state.devFirstYearDelayDetails ?? "");
  devDelayRow.appendChild(devDelayInp);
  fsB3.appendChild(devDelayRow);
  fsB3.querySelectorAll('input[name="mh-life-dev-year"]').forEach((el) => {
    el.addEventListener("change", () => {
      const dv = fsB3.querySelector('input[name="mh-life-dev-year"]:checked');
      const show = dv instanceof HTMLInputElement && dv.value === "delay";
      devDelayRow.hidden = !show;
      if (!show) devDelayInp.value = "";
    });
  });

  const q32 = document.createElement("p");
  q32.className = "mh-life-edu-title";
  q32.textContent = "Вопрос 2. Был ли энурез (недержание мочи) после 5 лет?";
  fsB3.appendChild(q32);
  fsB3.appendChild(radioRow("mh-life-enuresis", "yes", uiEnuresisYes, state.enuresisAfter5 === "yes"));
  fsB3.appendChild(radioRow("mh-life-enuresis", "no", "Нет", state.enuresisAfter5 === "no"));
  fsB3.appendChild(radioRow("mh-life-enuresis", "unknown", "Не знаю", state.enuresisAfter5 === "unknown"));

  const q33 = document.createElement("p");
  q33.className = "mh-life-edu-title";
  q33.textContent = "Вопрос 3. Были ли ночные страхи, кошмары, снохождения, сноговорения в детстве?";
  fsB3.appendChild(q33);
  fsB3.appendChild(radioRow("mh-life-parasomnia", "yes", "Да, отмечались", state.parasomnia === "yes"));
  fsB3.appendChild(radioRow("mh-life-parasomnia", "no", "Нет", state.parasomnia === "no"));
  fsB3.appendChild(radioRow("mh-life-parasomnia", "unknown", "Не знаю", state.parasomnia === "unknown"));
  const paraSub = document.createElement("div");
  paraSub.className = "mh-life-early-sub";
  paraSub.hidden = state.parasomnia !== "yes";
  paraSub.appendChild(mkCheck("mh-life-para-fears", "Ночные страхи", state.parasomniaNightFears));
  paraSub.appendChild(mkCheck("mh-life-para-nightmares", "Кошмары", state.parasomniaNightmares));
  paraSub.appendChild(mkCheck("mh-life-para-sleepwalk", "Снохождения (лунатизм)", state.parasomniaSleepwalk));
  paraSub.appendChild(mkCheck("mh-life-para-sleeptalk", "Сноговорения (разговоры во сне)", state.parasomniaSleeptalk));
  const paraOtherRow = document.createElement("div");
  paraOtherRow.className = "mh-life-row";
  paraOtherRow.appendChild(document.createTextNode("Свой вариант: "));
  const paraOtherInp = document.createElement("input");
  paraOtherInp.type = "text";
  paraOtherInp.id = "mh-life-para-other";
  paraOtherInp.className = "mh-life-text";
  paraOtherInp.value = String(state.parasomniaOther ?? "");
  paraOtherRow.appendChild(paraOtherInp);
  paraSub.appendChild(paraOtherRow);
  fsB3.appendChild(paraSub);
  fsB3.querySelectorAll('input[name="mh-life-parasomnia"]').forEach((el) => {
    el.addEventListener("change", () => {
      const p = fsB3.querySelector('input[name="mh-life-parasomnia"]:checked');
      const show = p instanceof HTMLInputElement && p.value === "yes";
      paraSub.hidden = !show;
      if (!show) {
        paraOtherInp.value = "";
        paraSub.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
          if (cb instanceof HTMLInputElement) cb.checked = false;
        });
      }
    });
  });

  const q34 = document.createElement("p");
  q34.className = "mh-life-edu-title";
  q34.textContent = "Вопрос 4. Посещали ли Вы детский сад?";
  fsB3.appendChild(q34);
  fsB3.appendChild(radioRow("mh-life-kdg", "yes", uiKdgYes, state.kindergartenAttend === "yes"));
  fsB3.appendChild(radioRow("mh-life-kdg", "no", uiKdgNo, state.kindergartenAttend === "no"));
  fsB3.appendChild(radioRow("mh-life-kdg", "unknown", "Не знаю", state.kindergartenAttend === "unknown"));

  const q35Wrap = document.createElement("div");
  q35Wrap.className = "mh-life-early-sub";
  q35Wrap.hidden = state.kindergartenAttend !== "yes";
  const q35 = document.createElement("p");
  q35.className = "mh-life-edu-title";
  q35.textContent = "Вопрос 5. Как Вы адаптировались к детскому саду?";
  q35Wrap.appendChild(q35);
  q35Wrap.appendChild(
    radioRow("mh-life-kdg-adapt", "easy", uiAdapted, state.kindergartenAdapt === "easy")
  );
  q35Wrap.appendChild(
    radioRow(
      "mh-life-kdg-adapt",
      "difficult",
      "Были трудности адаптации",
      state.kindergartenAdapt === "difficult"
    )
  );
  q35Wrap.appendChild(radioRow("mh-life-kdg-adapt", "unknown", "Не знаю", state.kindergartenAdapt === "unknown"));
  const adaptDetailsRow = document.createElement("div");
  adaptDetailsRow.className = "mh-life-row";
  adaptDetailsRow.hidden = state.kindergartenAdapt !== "difficult";
  adaptDetailsRow.appendChild(document.createTextNode("Уточнение: "));
  const adaptDetailsInp = document.createElement("input");
  adaptDetailsInp.type = "text";
  adaptDetailsInp.id = "mh-life-kdg-adapt-details";
  adaptDetailsInp.className = "mh-life-text";
  adaptDetailsInp.value = String(state.kindergartenAdaptDetails ?? "");
  adaptDetailsRow.appendChild(adaptDetailsInp);
  q35Wrap.appendChild(adaptDetailsRow);
  q35Wrap.querySelectorAll('input[name="mh-life-kdg-adapt"]').forEach((el) => {
    el.addEventListener("change", () => {
      const a = q35Wrap.querySelector('input[name="mh-life-kdg-adapt"]:checked');
      const show = a instanceof HTMLInputElement && a.value === "difficult";
      adaptDetailsRow.hidden = !show;
      if (!show) adaptDetailsInp.value = "";
    });
  });
  fsB3.appendChild(q35Wrap);
  fsB3.querySelectorAll('input[name="mh-life-kdg"]').forEach((el) => {
    el.addEventListener("change", () => {
      const k = fsB3.querySelector('input[name="mh-life-kdg"]:checked');
      const show = k instanceof HTMLInputElement && k.value === "yes";
      q35Wrap.hidden = !show;
      if (!show) {
        q35Wrap.querySelectorAll('input[name="mh-life-kdg-adapt"]').forEach((r) => {
          if (r instanceof HTMLInputElement) r.checked = false;
        });
        adaptDetailsInp.value = "";
      }
    });
  });

  const q37 = document.createElement("p");
  q37.className = "mh-life-edu-title";
  q37.textContent = uiCharacterQ;
  fsB3.appendChild(q37);
  const charRow = document.createElement("div");
  charRow.className = "mh-life-row";
  charRow.appendChild(document.createTextNode("Поле ввода: "));
  const charInp = document.createElement("input");
  charInp.type = "text";
  charInp.id = "mh-life-child-character";
  charInp.className = "mh-life-text";
  charInp.placeholder = "например: спокойным, общительным, тревожным";
  charInp.value = state.childhoodCharacterUnknown ? "" : String(state.childhoodCharacter ?? "");
  charInp.disabled = Boolean(state.childhoodCharacterUnknown);
  charRow.appendChild(charInp);
  fsB3.appendChild(charRow);
  const charUnLab = document.createElement("label");
  charUnLab.className = "mh-life-check";
  const charUn = document.createElement("input");
  charUn.type = "checkbox";
  charUn.id = "mh-life-child-character-unknown";
  charUn.checked = Boolean(state.childhoodCharacterUnknown);
  charUnLab.appendChild(charUn);
  charUnLab.appendChild(document.createTextNode(" Затрудняюсь ответить"));
  fsB3.appendChild(charUnLab);
  charUn.addEventListener("change", () => {
    charInp.disabled = charUn.checked;
    if (charUn.checked) charInp.value = "";
  });

  const q36 = document.createElement("p");
  q36.className = "mh-life-edu-title";
  q36.textContent = "Вопрос 6. Наблюдались ли Вы у специалистов в детстве?";
  fsB3.appendChild(q36);
  fsB3.appendChild(radioRow("mh-life-childhood", "yes", "Да", state.childhoodSpecialists === "yes"));
  fsB3.appendChild(radioRow("mh-life-childhood", "no", "Нет", state.childhoodSpecialists === "no"));

  const chYesWrap = document.createElement("div");
  chYesWrap.id = "mh-life-childhood-yes-wrap";
  chYesWrap.className = "mh-life-childhood-yes-wrap";
  chYesWrap.hidden = state.childhoodSpecialists !== "yes";
  const childhoodDraftClosed = state.childhoodSpecialists === "yes" && state.childhoodVisitsCloseDraft === true;

  const chCases = /** @type {ChildhoodVisit[]} */ (
    state.childhoodSpecialists === "yes" && Array.isArray(state.childhoodVisits) ? state.childhoodVisits : []
  );

  function reflowChildhood(mutator) {
    const prevScrollY = window.scrollY;
    readLifeStructuredFromDom(contentEl, answers);
    const st = parseLifeStructuredString(answers[LIFE_STRUCTURED_ID]);
    mutator(st);
    answers[LIFE_STRUCTURED_ID] = JSON.stringify(st);
    renderLifeStructuredStep(contentEl, answers, qIndex, stepsLen, gender, nextWizardBtn);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: prevScrollY });
    });
  }

  const chListPanel = document.createElement("div");
  chListPanel.className = "mh-life-childhood-list-panel";

  const fsChList = fieldset("Добавленные специалисты");
  const chListIntro = document.createElement("p");
  chListIntro.className = "mh-life-hint";
  if (childhoodDraftClosed) {
    chListIntro.textContent =
      chCases.length > 0
        ? "Перечисление завершено. Нажмите «Добавить ещё одного специалиста», если нужно указать ещё одного."
        : "Перечисление завершено. Можно добавить специалиста кнопкой ниже или оставить список пустым.";
  } else if (chCases.length) {
    chListIntro.textContent = "Ниже — форма для следующего специалиста. Уже добавленные остаются в списке.";
  } else {
    chListIntro.textContent =
      "Заполните форму ниже и нажмите «Сохранить и добавить ещё одного» или «Сохранить и закончить».";
  }
  fsChList.appendChild(chListIntro);
  const chUl = document.createElement("ul");
  chUl.className = "mh-life-heredity-list";
  chCases.forEach((v, idx) => {
    const li = document.createElement("li");
    li.className = "mh-life-heredity-item";
    const span = document.createElement("span");
    span.textContent = summarizeChildhoodVisitForUi(v);
    li.appendChild(span);
    const del = document.createElement("button");
    del.type = "button";
    del.className = "mh-life-heredity-remove";
    del.textContent = "Удалить";
    del.addEventListener("click", () => {
      reflowChildhood((st) => {
        const arr = normalizeChildhoodVisits(st.childhoodVisits);
        arr.splice(idx, 1);
        st.childhoodVisits = arr;
      });
    });
    li.appendChild(del);
    chUl.appendChild(li);
  });
  fsChList.appendChild(chUl);
  chListPanel.appendChild(fsChList);

  const chCasesJson = document.createElement("textarea");
  chCasesJson.id = "mh-life-childhood-visits-json";
  chCasesJson.hidden = true;
  chCasesJson.setAttribute("aria-hidden", "true");
  chCasesJson.textContent = JSON.stringify(chCases);
  chListPanel.appendChild(chCasesJson);

  const chListActions = document.createElement("div");
  chListActions.className = "mh-life-heredity-list-actions";
  const btnReopenChildhood = document.createElement("button");
  btnReopenChildhood.type = "button";
  btnReopenChildhood.className = "mh-life-btn mh-life-btn--secondary";
  btnReopenChildhood.textContent = "Добавить ещё одного специалиста";
  btnReopenChildhood.hidden = !childhoodDraftClosed;
  btnReopenChildhood.addEventListener("click", () => {
    reflowChildhood((st) => {
      st.childhoodVisitsCloseDraft = false;
    });
  });
  chListActions.appendChild(btnReopenChildhood);
  chListPanel.appendChild(chListActions);
  chYesWrap.appendChild(chListPanel);

  const chDraftBlock = document.createElement("div");
  chDraftBlock.id = "mh-life-childhood-draft-block";
  chDraftBlock.className = "mh-life-yes-block";
  chDraftBlock.hidden = childhoodDraftClosed;

  const chDraftWrap = document.createElement("div");
  chDraftWrap.className = "mh-life-heredity-draft-wrap";
  const chDraftTitle = document.createElement("p");
  chDraftTitle.className = "mh-life-heredity-draft-title";
  chDraftTitle.textContent = "Следующий специалист";
  chDraftWrap.appendChild(chDraftTitle);

  const chSpecRow = document.createElement("div");
  chSpecRow.className = "mh-life-row";
  chSpecRow.appendChild(document.createTextNode("Врач: "));
  const chSpecSel = document.createElement("select");
  chSpecSel.id = "mh-life-ch-draft-specialist";
  chSpecSel.className = "mh-life-select";
  [
    ["", "— выберите —"],
    ["neuro", "Врач невролог"],
    ["psych", "Врач психиатр"],
    ["endo", "Врач эндокринолог"],
    ["custom", "Свой вариант"],
  ].forEach(([val, lab]) => {
    const o = document.createElement("option");
    o.value = val;
    o.textContent = lab;
    chSpecSel.appendChild(o);
  });
  chSpecRow.appendChild(chSpecSel);
  chDraftWrap.appendChild(chSpecRow);

  const chCustomWrap = document.createElement("div");
  chCustomWrap.id = "mh-life-ch-draft-custom-wrap";
  chCustomWrap.className = "mh-life-childhood-custom-wrap";
  chCustomWrap.hidden = true;
  const chCustomLab = document.createElement("label");
  chCustomLab.className = "mh-life-row";
  chCustomLab.appendChild(document.createTextNode("Укажите врача (родительный падеж): "));
  const chCustomInp = document.createElement("input");
  chCustomInp.type = "text";
  chCustomInp.id = "mh-life-ch-draft-custom";
  chCustomInp.className = "mh-life-text";
  chCustomInp.placeholder = "например: ортопеда, логопеда";
  chCustomLab.appendChild(chCustomInp);
  chCustomWrap.appendChild(chCustomLab);
  chDraftWrap.appendChild(chCustomWrap);

  chSpecSel.addEventListener("change", () => {
    chCustomWrap.hidden = chSpecSel.value !== "custom";
    if (chSpecSel.value !== "custom") chCustomInp.value = "";
  });

  const chReasonRow = document.createElement("div");
  chReasonRow.className = "mh-life-childhood-reason-row";
  const chReasonLab = document.createElement("label");
  chReasonLab.appendChild(document.createTextNode("По какой причине: "));
  const chReasonInp = document.createElement("input");
  chReasonInp.type = "text";
  chReasonInp.id = "mh-life-ch-draft-reason";
  chReasonInp.className = "mh-life-text";
  chReasonLab.appendChild(chReasonInp);
  chReasonRow.appendChild(chReasonLab);
  chDraftWrap.appendChild(chReasonRow);

  const chUnLab = document.createElement("label");
  chUnLab.className = "mh-life-check mh-life-early-unknown-lab";
  const chUnCb = document.createElement("input");
  chUnCb.type = "checkbox";
  chUnCb.id = "mh-life-ch-draft-reason-unknown";
  chUnLab.appendChild(chUnCb);
  chUnLab.appendChild(document.createTextNode(" Не знаю причину"));
  chDraftWrap.appendChild(chUnLab);
  chUnCb.addEventListener("change", () => {
    chReasonInp.disabled = chUnCb.checked;
    if (chUnCb.checked) chReasonInp.value = "";
  });

  const chAddRow = document.createElement("div");
  chAddRow.className = "mh-life-heredity-actions";
  const btnAddCh = document.createElement("button");
  btnAddCh.type = "button";
  btnAddCh.className = "mh-life-btn mh-life-btn--primary";
  btnAddCh.textContent = "Сохранить и добавить ещё одного";
  const btnFinishCh = document.createElement("button");
  btnFinishCh.type = "button";
  btnFinishCh.className = "mh-life-btn mh-life-btn--secondary";
  btnFinishCh.textContent = "Сохранить и закончить";
  const btnClearCh = document.createElement("button");
  btnClearCh.type = "button";
  btnClearCh.className = "mh-life-btn mh-life-btn--ghost";
  btnClearCh.textContent = "Очистить форму";
  chAddRow.appendChild(btnAddCh);
  chAddRow.appendChild(btnFinishCh);
  chAddRow.appendChild(btnClearCh);
  chDraftWrap.appendChild(chAddRow);
  chDraftBlock.appendChild(chDraftWrap);
  chYesWrap.appendChild(chDraftBlock);

  function resetChildhoodDraftForm() {
    if (chSpecSel instanceof HTMLSelectElement) chSpecSel.value = "";
    chCustomWrap.hidden = true;
    chCustomInp.value = "";
    chReasonInp.value = "";
    chReasonInp.disabled = false;
    chUnCb.checked = false;
  }

  /** @param {ChildhoodVisit} draft @returns {{ err: string | null; record: ChildhoodVisit | null }} */
  function childhoodDraftToRecordOrError(draft) {
    const err = validateChildhoodDraft(draft);
    if (err) return { err, record: null };
    return { err: null, record: { ...draft } };
  }

  btnClearCh.addEventListener("click", () => resetChildhoodDraftForm());

  btnAddCh.addEventListener("click", () => {
    readLifeStructuredFromDom(contentEl, answers);
    const draft = readChildhoodDraftFromDom(chDraftBlock);
    const { err, record } = childhoodDraftToRecordOrError(draft);
    if (err || !record) {
      window.alert(err || "Не удалось сохранить.");
      return;
    }
    reflowChildhood((st) => {
      if (!Array.isArray(st.childhoodVisits)) st.childhoodVisits = [];
      st.childhoodVisits.push(record);
      st.childhoodVisitsCloseDraft = false;
    });
  });

  btnFinishCh.addEventListener("click", () => {
    readLifeStructuredFromDom(contentEl, answers);
    const draft = readChildhoodDraftFromDom(chDraftBlock);
    const { err, record } = childhoodDraftToRecordOrError(draft);
    if (err && !isChildhoodDraftEmpty(draft)) {
      window.alert(err);
      return;
    }
    reflowChildhood((st) => {
      if (!Array.isArray(st.childhoodVisits)) st.childhoodVisits = [];
      if (record) st.childhoodVisits.push(record);
      st.childhoodVisitsCloseDraft = true;
    });
  });

  fsB3.appendChild(chYesWrap);

  fsB3.querySelectorAll('input[name="mh-life-childhood"]').forEach((el) => {
    el.addEventListener("change", () => {
      const inp = contentEl.querySelector('input[name="mh-life-childhood"]:checked');
      const yes = inp instanceof HTMLInputElement && inp.value === "yes";
      chYesWrap.hidden = !yes;
      if (yes) {
        reflowChildhood((st) => {
          if (!Array.isArray(st.childhoodVisits)) st.childhoodVisits = [];
          st.childhoodVisitsCloseDraft = false;
        });
      }
    });
  });

  contentEl.appendChild(fsB3);

  const fsB6 = fieldset("Блок 3. Школа");
  const q61 = document.createElement("p");
  q61.className = "mh-life-edu-title";
  q61.textContent = "Вопрос 1. Со скольки лет пошли в первый класс?";
  fsB6.appendChild(q61);
  const rowAge = document.createElement("div");
  rowAge.className = "mh-life-row";
  const labAge = document.createElement("label");
  labAge.appendChild(document.createTextNode("В школу пошёл(ла) с "));
  const ageInp = document.createElement("input");
  ageInp.type = "text";
  ageInp.inputMode = "numeric";
  ageInp.className = "mh-life-text mh-life-text--narrow";
  ageInp.id = "mh-life-school-age";
  ageInp.value = String(state.schoolStartAge ?? "");
  labAge.appendChild(ageInp);
  labAge.appendChild(document.createTextNode(" лет"));
  rowAge.appendChild(labAge);
  fsB6.appendChild(rowAge);

  const q62 = document.createElement("p");
  q62.className = "mh-life-edu-title";
  q62.textContent = "Вопрос 2. Какой тип школы Вы посещали?";
  fsB6.appendChild(q62);
  fsB6.appendChild(mkCheck("mh-life-school-type-general", "Общеобразовательная", state.schoolTypeGeneral));
  fsB6.appendChild(mkCheck("mh-life-school-type-gym", "Гимназия", state.schoolTypeGymnasium));
  fsB6.appendChild(mkCheck("mh-life-school-type-lyceum", "Лицей", state.schoolTypeLyceum));
  fsB6.appendChild(mkCheck("mh-life-school-type-corr", "Коррекционная", state.schoolTypeCorrectional));
  const corrRow = document.createElement("div");
  corrRow.className = "mh-life-row";
  corrRow.hidden = !state.schoolTypeCorrectional;
  corrRow.appendChild(document.createTextNode("Уточните тип коррекционной школы: "));
  const corrInp = document.createElement("input");
  corrInp.type = "text";
  corrInp.id = "mh-life-school-corr-details";
  corrInp.className = "mh-life-text";
  corrInp.value = String(state.schoolTypeCorrectionalDetails ?? "");
  corrRow.appendChild(corrInp);
  fsB6.appendChild(corrRow);
  const corrCb = fsB6.querySelector("#mh-life-school-type-corr");
  if (corrCb instanceof HTMLInputElement) {
    corrCb.addEventListener("change", () => {
      corrRow.hidden = !corrCb.checked;
      if (!corrCb.checked) corrInp.value = "";
    });
  }

  fsB6.appendChild(mkCheck("mh-life-school-type-home", uiSchoolHome, state.schoolTypeHome));
  const homeWrap = document.createElement("div");
  homeWrap.className = "mh-life-early-sub";
  homeWrap.hidden = !state.schoolTypeHome;
  const homeFrom = document.createElement("input");
  homeFrom.type = "text";
  homeFrom.inputMode = "numeric";
  homeFrom.className = "mh-life-text mh-life-text--narrow";
  homeFrom.id = "mh-life-school-home-from";
  homeFrom.value = String(state.schoolTypeHomeFromClass ?? "");
  const homeTo = document.createElement("input");
  homeTo.type = "text";
  homeTo.inputMode = "numeric";
  homeTo.className = "mh-life-text mh-life-text--narrow";
  homeTo.id = "mh-life-school-home-to";
  homeTo.value = String(state.schoolTypeHomeToClass ?? "");
  const homeReason = document.createElement("input");
  homeReason.type = "text";
  homeReason.className = "mh-life-text";
  homeReason.id = "mh-life-school-home-reason";
  homeReason.value = String(state.schoolTypeHomeReason ?? "");
  const homeRow1 = document.createElement("div");
  homeRow1.className = "mh-life-row";
  homeRow1.appendChild(document.createTextNode("С какого класса: "));
  homeRow1.appendChild(homeFrom);
  homeWrap.appendChild(homeRow1);
  const homeRow2 = document.createElement("div");
  homeRow2.className = "mh-life-row";
  homeRow2.appendChild(document.createTextNode("По какой класс: "));
  homeRow2.appendChild(homeTo);
  homeWrap.appendChild(homeRow2);
  const homeRow3 = document.createElement("div");
  homeRow3.className = "mh-life-row";
  homeRow3.appendChild(document.createTextNode("По какой причине: "));
  homeRow3.appendChild(homeReason);
  homeWrap.appendChild(homeRow3);
  fsB6.appendChild(homeWrap);
  const homeCb = fsB6.querySelector("#mh-life-school-type-home");
  if (homeCb instanceof HTMLInputElement) {
    homeCb.addEventListener("change", () => {
      homeWrap.hidden = !homeCb.checked;
      if (!homeCb.checked) {
        homeFrom.value = "";
        homeTo.value = "";
        homeReason.value = "";
      }
    });
  }
  fsB6.appendChild(mkCheck("mh-life-school-type-unknown", "Не знаю", state.schoolTypeUnknown));

  const q63 = document.createElement("p");
  q63.className = "mh-life-edu-title";
  q63.textContent = "Вопрос 3. Была ли у Вас смена школы в процессе обучения?";
  fsB6.appendChild(q63);
  fsB6.appendChild(radioRow("mh-life-school-change", "yes", "Да", state.schoolChanged === "yes"));
  fsB6.appendChild(radioRow("mh-life-school-change", "no", "Нет", state.schoolChanged === "no"));
  const changeWrap = document.createElement("div");
  changeWrap.className = "mh-life-early-sub";
  changeWrap.hidden = state.schoolChanged !== "yes";
  const freqTitle = document.createElement("p");
  freqTitle.className = "mh-life-substep-title";
  freqTitle.textContent = "Как часто меняли школу?";
  changeWrap.appendChild(freqTitle);
  changeWrap.appendChild(radioRow("mh-life-school-change-freq", "once", "Однократно", state.schoolChangeFrequency === "once"));
  changeWrap.appendChild(
    radioRow("mh-life-school-change-freq", "many", "Неоднократно", state.schoolChangeFrequency === "many")
  );
  const reasonsTitle = document.createElement("p");
  reasonsTitle.className = "mh-life-substep-title";
  reasonsTitle.textContent = "Причины смены школы (можно несколько):";
  changeWrap.appendChild(reasonsTitle);
  changeWrap.appendChild(mkCheck("mh-life-school-change-move", "Переезд семьи", state.schoolChangeMove));
  changeWrap.appendChild(
    mkCheck("mh-life-school-change-conf-peers", "Конфликты с одноклассниками", state.schoolChangeConflictsPeers)
  );
  changeWrap.appendChild(
    mkCheck("mh-life-school-change-conf-teachers", "Конфликты с учителями", state.schoolChangeConflictsTeachers)
  );
  changeWrap.appendChild(mkCheck("mh-life-school-change-poor", "Неуспеваемость", state.schoolChangePoorPerformance));
  changeWrap.appendChild(mkCheck("mh-life-school-change-profile", "Смена профиля обучения", state.schoolChangeProfile));
  changeWrap.appendChild(
    mkCheck("mh-life-school-change-stronger", "Переход в более сильную школу", state.schoolChangeStronger)
  );
  changeWrap.appendChild(mkCheck("mh-life-school-change-weaker", "Переход в более слабую школу", state.schoolChangeWeaker));
  changeWrap.appendChild(mkCheck("mh-life-school-change-expelled", "Отчисление", state.schoolChangeExpelled));
  changeWrap.appendChild(mkCheck("mh-life-school-change-other", "Другое", state.schoolChangeOther));
  const changeOtherRow = document.createElement("div");
  changeOtherRow.className = "mh-life-row";
  changeOtherRow.hidden = !state.schoolChangeOther;
  changeOtherRow.appendChild(document.createTextNode("Уточнение (другое): "));
  const changeOtherInp = document.createElement("input");
  changeOtherInp.type = "text";
  changeOtherInp.id = "mh-life-school-change-other-text";
  changeOtherInp.className = "mh-life-text";
  changeOtherInp.value = String(state.schoolChangeOtherText ?? "");
  changeOtherRow.appendChild(changeOtherInp);
  changeWrap.appendChild(changeOtherRow);
  const changeOtherCb = changeWrap.querySelector("#mh-life-school-change-other");
  if (changeOtherCb instanceof HTMLInputElement) {
    changeOtherCb.addEventListener("change", () => {
      changeOtherRow.hidden = !changeOtherCb.checked;
      if (!changeOtherCb.checked) changeOtherInp.value = "";
    });
  }
  fsB6.appendChild(changeWrap);
  fsB6.querySelectorAll('input[name="mh-life-school-change"]').forEach((el) => {
    el.addEventListener("change", () => {
      const chSel = fsB6.querySelector('input[name="mh-life-school-change"]:checked');
      const show = chSel instanceof HTMLInputElement && chSel.value === "yes";
      changeWrap.hidden = !show;
      if (!show) {
        changeWrap.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
          if (cb instanceof HTMLInputElement) cb.checked = false;
        });
        changeWrap.querySelectorAll('input[name="mh-life-school-change-freq"]').forEach((r) => {
          if (r instanceof HTMLInputElement) r.checked = false;
        });
        changeOtherInp.value = "";
      }
    });
  });

  const q65 = document.createElement("p");
  q65.className = "mh-life-edu-title";
  q65.textContent = "Вопрос 5. Были ли у Вас проблемы адаптации при поступлении или при переходе в другую школу?";
  fsB6.appendChild(q65);
  fsB6.appendChild(radioRow("mh-life-school-adapt", "yes", "Да, были трудности", state.schoolAdaptation === "yes"));
  fsB6.appendChild(radioRow("mh-life-school-adapt", "no", "Нет", state.schoolAdaptation === "no"));
  fsB6.appendChild(radioRow("mh-life-school-adapt", "unknown", "Не помню", state.schoolAdaptation === "unknown"));
  const adaptSchoolRow = document.createElement("div");
  adaptSchoolRow.className = "mh-life-row";
  adaptSchoolRow.hidden = state.schoolAdaptation !== "yes";
  adaptSchoolRow.appendChild(document.createTextNode("Со слов пациента: "));
  const adaptSchoolInp = document.createElement("input");
  adaptSchoolInp.type = "text";
  adaptSchoolInp.id = "mh-life-school-adapt-details";
  adaptSchoolInp.className = "mh-life-text";
  adaptSchoolInp.value = String(state.schoolAdaptationDetails ?? "");
  adaptSchoolRow.appendChild(adaptSchoolInp);
  fsB6.appendChild(adaptSchoolRow);
  fsB6.querySelectorAll('input[name="mh-life-school-adapt"]').forEach((el) => {
    el.addEventListener("change", () => {
      const a = fsB6.querySelector('input[name="mh-life-school-adapt"]:checked');
      const show = a instanceof HTMLInputElement && a.value === "yes";
      adaptSchoolRow.hidden = !show;
      if (!show) adaptSchoolInp.value = "";
    });
  });

  const q66 = document.createElement("p");
  q66.className = "mh-life-edu-title";
  q66.textContent = "Вопрос 6. Как Вы учились в школе (средняя успеваемость за весь период)?";
  fsB6.appendChild(q66);
  const perfSel = document.createElement("select");
  perfSel.id = "mh-life-school-perf";
  perfSel.className = "mh-life-select";
  [
    ["", "—"],
    ["excellent", schoolPerfUiOptionLabel(gender, "excellent")],
    ["good4and5", schoolPerfUiOptionLabel(gender, "good4and5")],
    ["mostly4", schoolPerfUiOptionLabel(gender, "mostly4")],
    ["mostly3", schoolPerfUiOptionLabel(gender, "mostly3")],
    ["weakWithDebts", schoolPerfUiOptionLabel(gender, "weakWithDebts")],
  ].forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = t;
    if (state.schoolPerformance === v) o.selected = true;
    perfSel.appendChild(o);
  });
  fsB6.appendChild(perfSel);

  const q67 = document.createElement("p");
  q67.className = "mh-life-edu-title";
  q67.textContent = "Вопрос 7. Как складывались Ваши социальные отношения в школе?";
  fsB6.appendChild(q67);
  const p71 = document.createElement("p");
  p71.className = "mh-life-hint";
  p71.textContent = "7.1. С одноклассниками (можно выбрать несколько):";
  fsB6.appendChild(p71);
  fsB6.appendChild(mkCheck("mh-life-peer-easy", uiPeerEasy, state.schoolPeerEasyFriends));
  fsB6.appendChild(mkCheck("mh-life-peer-few", "Друзей было мало", state.schoolPeerFewFriends));
  fsB6.appendChild(
    mkCheck("mh-life-peer-diff", "Были трудности в общении", state.schoolPeerCommunicationDifficulties)
  );
  fsB6.appendChild(mkCheck("mh-life-peer-outcast", uiPeerOutcast, state.schoolPeerOutcast));
  fsB6.appendChild(mkCheck("mh-life-peer-bullied", uiPeerBullied, state.schoolPeerBullied));
  fsB6.appendChild(mkCheck("mh-life-peer-aggr", uiPeerAggr, state.schoolPeerAggression));
  fsB6.appendChild(mkCheck("mh-life-peer-neutral", "Отношения нейтральные", state.schoolPeerNeutral));
  const p72 = document.createElement("p");
  p72.className = "mh-life-hint";
  p72.textContent = "7.2. С учителями (можно выбрать несколько):";
  fsB6.appendChild(p72);
  fsB6.appendChild(mkCheck("mh-life-teacher-even", "Отношения были ровными", state.schoolTeacherEven));
  fsB6.appendChild(
    mkCheck("mh-life-teacher-one-conf", "Были конфликты с конкретным учителем", state.schoolTeacherOneConflict)
  );
  fsB6.appendChild(
    mkCheck("mh-life-teacher-many-conf", "Конфликты с несколькими учителями", state.schoolTeacherManyConflicts)
  );
  fsB6.appendChild(mkCheck("mh-life-teacher-fav", uiTeacherFav, state.schoolTeacherFavorite));
  fsB6.appendChild(mkCheck("mh-life-teacher-crit", uiTeacherCrit, state.schoolTeacherCriticized));
  fsB6.appendChild(mkCheck("mh-life-teacher-neutral", "Отношения нейтральные", state.schoolTeacherNeutral));

  const q68 = document.createElement("p");
  q68.className = "mh-life-edu-title";
  q68.textContent = "Сколько классов школы Вы окончили?";
  fsB6.appendChild(q68);
  fsB6.appendChild(radioRow("mh-life-school-finished", "yes", uiSchoolFinishedYes, state.schoolFinished === "yes"));
  fsB6.appendChild(radioRow("mh-life-school-finished", "no", uiSchoolFinishedNo, state.schoolFinished === "no"));
  const rowCl = document.createElement("div");
  rowCl.className = "mh-life-row";
  rowCl.hidden = state.schoolFinished === "no";
  rowCl.appendChild(document.createTextNode(uiSchoolClassesRowPrefix));
  const clSel = document.createElement("select");
  clSel.id = "mh-life-school-classes";
  clSel.className = "mh-life-select";
  const oEmpty = document.createElement("option");
  oEmpty.value = "";
  oEmpty.textContent = "—";
  clSel.appendChild(oEmpty);
  for (let n = 1; n <= 11; n += 1) {
    const o = document.createElement("option");
    o.value = String(n);
    o.textContent = String(n);
    if (state.schoolClasses === n) o.selected = true;
    clSel.appendChild(o);
  }
  rowCl.appendChild(clSel);
  fsB6.appendChild(rowCl);
  fsB6.querySelectorAll('input[name="mh-life-school-finished"]').forEach((el) => {
    el.addEventListener("change", () => {
      const sf = fsB6.querySelector('input[name="mh-life-school-finished"]:checked');
      const finishedNo = sf instanceof HTMLInputElement && sf.value === "no";
      rowCl.hidden = finishedNo;
      if (finishedNo) clSel.value = "";
    });
  });
  contentEl.appendChild(fsB6);

  if (gender === "male") {
    const fsB7 = fieldset("Блок 4. Армия");
    fsB7.appendChild(radioRow("mh-life-army", "served", "Служил", state.army === "served"));
    fsB7.appendChild(radioRow("mh-life-army", "not", "Не служил", state.army === "not"));
    contentEl.appendChild(fsB7);
  }

  const fsB8 = fieldset("Блок 5. Образование");
  const qEdu = document.createElement("p");
  qEdu.className = "mh-life-edu-title";
  qEdu.textContent = "Вопрос 1. Получали ли Вы образование после школы?";
  fsB8.appendChild(qEdu);
  const hasAnyEdu = Boolean(
    state.eduSecDone || state.eduSecUndone || state.eduSecNone || state.eduHiDone || state.eduHiUndone || state.eduHiNone
  );
  const eduAfterSchoolVal =
    state.eduAfterSchool === "yes" || state.eduAfterSchool === "no"
      ? state.eduAfterSchool
      : state.eduNoAfterSchool
        ? "no"
        : hasAnyEdu
          ? "yes"
          : "";
  fsB8.appendChild(radioRow("mh-life-edu-after-school", "yes", "Да", eduAfterSchoolVal === "yes"));
  fsB8.appendChild(radioRow("mh-life-edu-after-school", "no", "Нет", eduAfterSchoolVal === "no"));
  const eduWrap = document.createElement("div");
  eduWrap.id = "mh-life-edu-wrap";
  eduWrap.hidden = eduAfterSchoolVal !== "yes";
  const eduHint = document.createElement("p");
  eduHint.className = "mh-life-edu-hint";
  eduHint.textContent =
    "Укажите отдельно среднее профессиональное (колледж, техникум) и высшее (вуз, институт, академия). Для каждого — закончили или нет и специальность.";
  eduWrap.appendChild(eduHint);
  eduWrap.appendChild(subEdu("Среднее профессиональное образование (колледж, техникум)", "sec", state, gender));
  eduWrap.appendChild(subEdu("Высшее образование (вуз, институт)", "hi", state, gender));
  fsB8.appendChild(eduWrap);
  fsB8.querySelectorAll('input[name="mh-life-edu-after-school"]').forEach((el) => {
    el.addEventListener("change", () => {
      const sel = fsB8.querySelector('input[name="mh-life-edu-after-school"]:checked');
      const isYes = sel instanceof HTMLInputElement && sel.value === "yes";
      eduWrap.hidden = !isYes;
      if (!isYes) {
        eduWrap.querySelectorAll('input[type="radio"]').forEach((r) => {
          if (r instanceof HTMLInputElement) r.checked = false;
        });
        eduWrap.querySelectorAll('input[type="text"]').forEach((t) => {
          if (t instanceof HTMLInputElement) t.value = "";
        });
      }
    });
  });
  contentEl.appendChild(fsB8);

  const fsSocA = fieldset("Блок 6. Трудовая деятельность");
  const qa1 = document.createElement("p");
  qa1.className = "mh-life-edu-title";
  qa1.textContent = "Вопрос А1. Работаете ли Вы в настоящее время?";
  fsSocA.appendChild(qa1);
  fsSocA.appendChild(radioRow("mh-life-soc-work-now", "yes", "Да", state.socWorkNow === "yes"));
  fsSocA.appendChild(radioRow("mh-life-soc-work-now", "no", "Нет", state.socWorkNow === "no"));
  const workPosWrap = document.createElement("div");
  workPosWrap.id = "mh-life-soc-work-pos-wrap";
  workPosWrap.className = "mh-life-custom-wrap";
  const workPosLab = document.createElement("label");
  workPosLab.className = "mh-life-field-label";
  workPosLab.textContent = "Какая у Вас текущая должность?";
  const workPosInp = document.createElement("input");
  workPosInp.type = "text";
  workPosInp.id = "mh-life-soc-work-position";
  workPosInp.className = "mh-life-text";
  workPosInp.value = String(state.socWorkPosition ?? "");
  workPosLab.appendChild(workPosInp);
  workPosWrap.appendChild(workPosLab);
  fsSocA.appendChild(workPosWrap);
  const qa2 = document.createElement("p");
  qa2.className = "mh-life-edu-title";
  qa2.textContent =
    "Вопрос А2. Какие должности Вы занимали за последние 5 лет (или основные за всю жизнь)?";
  fsSocA.appendChild(qa2);
  const pastInp = document.createElement("input");
  pastInp.type = "text";
  pastInp.id = "mh-life-soc-work-past";
  pastInp.className = "mh-life-text";
  pastInp.value = String(state.socWorkPastPositions ?? "");
  fsSocA.appendChild(pastInp);
  workPosWrap.hidden = state.socWorkNow !== "yes";
  fsSocA.querySelectorAll('input[name="mh-life-soc-work-now"]').forEach((el) => {
    el.addEventListener("change", () => {
      const y = fsSocA.querySelector('input[name="mh-life-soc-work-now"]:checked');
      const isYes = y instanceof HTMLInputElement && y.value === "yes";
      workPosWrap.hidden = !isYes;
      if (!isYes && workPosInp instanceof HTMLInputElement) workPosInp.value = "";
    });
  });
  contentEl.appendChild(fsSocA);

  const fsSocB = fieldset("Блок 7. Семейное положение и отношения");
  const qb1 = document.createElement("p");
  qb1.className = "mh-life-edu-title";
  qb1.textContent = "Вопрос Б1. Каков Ваш текущий семейный статус?";
  fsSocB.appendChild(qb1);
  fsSocB.appendChild(
    radioRow("mh-life-soc-marital", "in_relationship", "Состою в отношениях", state.socMarital === "in_relationship")
  );
  fsSocB.appendChild(
    radioRow(
      "mh-life-soc-marital",
      "not_in_relationship",
      "В отношениях не состою",
      state.socMarital === "not_in_relationship"
    )
  );
  fsSocB.appendChild(
    radioRow(
      "mh-life-soc-marital",
      "cohabitation",
      "Сожительство (незарегистрированный брак, живём вместе)",
      state.socMarital === "cohabitation"
    )
  );
  fsSocB.appendChild(radioRow("mh-life-soc-marital", "married", "Зарегистрированный брак", state.socMarital === "married"));
  fsSocB.appendChild(radioRow("mh-life-soc-marital", "divorced", "В разводе", state.socMarital === "divorced"));
  fsSocB.appendChild(radioRow("mh-life-soc-marital", "widowed", "Вдовец/вдова", state.socMarital === "widowed"));

  const b1aWrap = document.createElement("div");
  b1aWrap.id = "mh-life-soc-b1a-wrap";
  b1aWrap.className = "mh-life-custom-wrap";
  const b1aLab = document.createElement("label");
  b1aLab.className = "mh-life-field-label";
  b1aLab.textContent = "Вопрос Б1а. Сколько всего раз Вы состояли в зарегистрированном браке?";
  const b1aInp = document.createElement("input");
  b1aInp.type = "number";
  b1aInp.min = "0";
  b1aInp.step = "1";
  b1aInp.id = "mh-life-soc-marriages-count";
  b1aInp.className = "mh-life-text";
  const mcStored = String(state.socMarriagesCount ?? "").trim();
  b1aInp.value = mcStored === "" ? "0" : mcStored;
  b1aLab.appendChild(b1aInp);
  b1aWrap.appendChild(b1aLab);
  fsSocB.appendChild(b1aWrap);
  b1aWrap.hidden = state.socMarital !== "divorced" && state.socMarital !== "widowed";

  const qb2 = document.createElement("p");
  qb2.className = "mh-life-edu-title";
  qb2.textContent = "Вопрос Б2. Есть ли у Вас дети?";
  fsSocB.appendChild(qb2);
  fsSocB.appendChild(radioRow("mh-life-soc-children", "no", "Нет", state.socChildren === "no"));
  fsSocB.appendChild(radioRow("mh-life-soc-children", "yes", "Да", state.socChildren === "yes"));

  const socChildrenFieldsWrap = document.createElement("div");
  socChildrenFieldsWrap.id = "mh-life-soc-children-wrap";
  socChildrenFieldsWrap.className = "mh-life-custom-wrap";
  const mkNumRow = (id, label, val) => {
    const row = document.createElement("div");
    row.className = "mh-life-row";
    const lab = document.createElement("label");
    lab.className = "mh-life-field-label";
    lab.textContent = label;
    const inp = document.createElement("input");
    inp.type = "number";
    inp.min = "0";
    inp.step = "1";
    inp.id = id;
    inp.className = "mh-life-text";
    inp.value = String(val ?? "");
    lab.appendChild(inp);
    row.appendChild(lab);
    return row;
  };
  socChildrenFieldsWrap.appendChild(mkNumRow("mh-life-soc-children-total", "Общее количество детей", state.socChildrenTotal));
  socChildrenFieldsWrap.appendChild(
    mkNumRow("mh-life-soc-children-current", "Из них от текущего/последнего брака", state.socChildrenCurrent)
  );
  socChildrenFieldsWrap.appendChild(
    mkNumRow("mh-life-soc-children-prev", "Из них от предыдущих браков/отношений", state.socChildrenPrevious)
  );
  fsSocB.appendChild(socChildrenFieldsWrap);
  /* Поля счёта детей всегда видны; в Word учитываются только при ответе «Да» на Б2. */

  fsSocB.querySelectorAll('input[name="mh-life-soc-marital"]').forEach((el) => {
    el.addEventListener("change", () => {
      const m = fsSocB.querySelector('input[name="mh-life-soc-marital"]:checked');
      const v = m instanceof HTMLInputElement ? m.value : "";
      b1aWrap.hidden = v !== "divorced" && v !== "widowed";
      if (b1aWrap.hidden && b1aInp instanceof HTMLInputElement) b1aInp.value = "0";
    });
  });
  fsSocB.querySelectorAll('input[name="mh-life-soc-children"]').forEach((el) => {
    el.addEventListener("change", () => {
      const c = fsSocB.querySelector('input[name="mh-life-soc-children"]:checked');
      const yes = c instanceof HTMLInputElement && c.value === "yes";
      if (!yes) {
        socChildrenFieldsWrap.querySelectorAll('input[type="number"]').forEach((inp) => {
          if (inp instanceof HTMLInputElement) inp.value = "";
        });
      }
    });
  });
  contentEl.appendChild(fsSocB);

  const fsSocV = fieldset("Блок 8. Жилищные условия");
  const qv1 = document.createElement("p");
  qv1.className = "mh-life-edu-title";
  qv1.textContent = "Вопрос В1. С кем Вы проживаете в настоящее время?";
  fsSocV.appendChild(qv1);
  fsSocV.appendChild(radioRow("mh-life-soc-live", "alone", "Один/одна", state.socLivingWith === "alone"));
  fsSocV.appendChild(
    radioRow(
      "mh-life-soc-live",
      "family",
      "С семьёй (супруг/супруга, дети, родители)",
      state.socLivingWith === "family"
    )
  );
  fsSocV.appendChild(
    radioRow(
      "mh-life-soc-live",
      "relatives",
      "С родственниками (не считая родителей/детей)",
      state.socLivingWith === "relatives"
    )
  );
  fsSocV.appendChild(
    radioRow(
      "mh-life-soc-live",
      "roommates",
      "С соседями по квартире/комнате (не родственники)",
      state.socLivingWith === "roommates"
    )
  );
  fsSocV.appendChild(radioRow("mh-life-soc-live", "other", "Другое", state.socLivingWith === "other"));
  const liveOtherWrap = document.createElement("div");
  liveOtherWrap.id = "mh-life-soc-live-other-wrap";
  liveOtherWrap.className = "mh-life-custom-wrap";
  const liveOtherLab = document.createElement("label");
  liveOtherLab.className = "mh-life-field-label";
  liveOtherLab.textContent = "Уточнение (с кем проживает)";
  const liveOtherInp = document.createElement("input");
  liveOtherInp.type = "text";
  liveOtherInp.id = "mh-life-soc-live-other";
  liveOtherInp.className = "mh-life-text";
  liveOtherInp.value = String(state.socLivingOther ?? "");
  liveOtherLab.appendChild(liveOtherInp);
  liveOtherWrap.appendChild(liveOtherLab);
  fsSocV.appendChild(liveOtherWrap);
  liveOtherWrap.hidden = state.socLivingWith !== "other";

  const qv2 = document.createElement("p");
  qv2.className = "mh-life-edu-title";
  qv2.textContent = "Вопрос В2. Каков тип Вашего жилья?";
  fsSocV.appendChild(qv2);
  fsSocV.appendChild(
    radioRow(
      "mh-life-soc-house",
      "own_apt",
      "Собственная квартира (в собственности или ипотека/залога нет)",
      state.socHousing === "own_apt"
    )
  );
  fsSocV.appendChild(radioRow("mh-life-soc-house", "house", "Частный дом (в собственности)", state.socHousing === "house"));
  fsSocV.appendChild(
    radioRow("mh-life-soc-house", "rent", "Арендую жильё (снимаю квартиру/комнату/дом)", state.socHousing === "rent")
  );
  fsSocV.appendChild(
    radioRow(
      "mh-life-soc-house",
      "relatives_provided",
      "Жильё предоставлено родственниками (без аренды)",
      state.socHousing === "relatives_provided"
    )
  );
  fsSocV.appendChild(radioRow("mh-life-soc-house", "service", "Служебное жильё", state.socHousing === "service"));
  fsSocV.appendChild(radioRow("mh-life-soc-house", "other", "Другое", state.socHousing === "other"));
  const houseOtherWrap = document.createElement("div");
  houseOtherWrap.id = "mh-life-soc-house-other-wrap";
  houseOtherWrap.className = "mh-life-custom-wrap";
  const houseOtherLab = document.createElement("label");
  houseOtherLab.className = "mh-life-field-label";
  houseOtherLab.textContent = "Уточнение типа жилья";
  const houseOtherInp = document.createElement("input");
  houseOtherInp.type = "text";
  houseOtherInp.id = "mh-life-soc-house-other";
  houseOtherInp.className = "mh-life-text";
  houseOtherInp.value = String(state.socHousingOther ?? "");
  houseOtherLab.appendChild(houseOtherInp);
  houseOtherWrap.appendChild(houseOtherLab);
  fsSocV.appendChild(houseOtherWrap);
  houseOtherWrap.hidden = state.socHousing !== "other";

  fsSocV.querySelectorAll('input[name="mh-life-soc-live"]').forEach((el) => {
    el.addEventListener("change", () => {
      const x = fsSocV.querySelector('input[name="mh-life-soc-live"]:checked');
      const v = x instanceof HTMLInputElement ? x.value : "";
      liveOtherWrap.hidden = v !== "other";
      if (v !== "other" && liveOtherInp instanceof HTMLInputElement) liveOtherInp.value = "";
    });
  });
  fsSocV.querySelectorAll('input[name="mh-life-soc-house"]').forEach((el) => {
    el.addEventListener("change", () => {
      const x = fsSocV.querySelector('input[name="mh-life-soc-house"]:checked');
      const v = x instanceof HTMLInputElement ? x.value : "";
      houseOtherWrap.hidden = v !== "other";
      if (v !== "other" && houseOtherInp instanceof HTMLInputElement) houseOtherInp.value = "";
    });
  });
  contentEl.appendChild(fsSocV);

  const fsB9 = fieldset("Блок 9. Перенесенные заболевания");
  const q21 = document.createElement("p");
  q21.className = "mh-life-edu-title";
  q21.textContent = "Вопрос 1. Переносили ли Вы какие-либо из перечисленных заболеваний или состояний?";
  fsB9.appendChild(q21);
  const mkDisease = (id, label, checked) => {
    const lab = mkCheck(id, label, checked);
    fsB9.appendChild(lab);
    return lab;
  };
  const hA = document.createElement("p");
  hA.className = "mh-life-hint";
  hA.textContent = "Нейроинфекции и поражения ЦНС";
  fsB9.appendChild(hA);
  mkDisease("mh-life-s2-a-meningitis", "Менингит", Array.isArray(state.section2Diseases) && state.section2Diseases.includes("a_meningitis"));
  mkDisease("mh-life-s2-a-encephalitis", "Энцефалит", Array.isArray(state.section2Diseases) && state.section2Diseases.includes("a_encephalitis"));
  mkDisease("mh-life-s2-a-neurosyphilis", "Нейросифилис", Array.isArray(state.section2Diseases) && state.section2Diseases.includes("a_neurosyphilis"));
  mkDisease("mh-life-s2-a-hiv", "ВИЧ-инфекция", Array.isArray(state.section2Diseases) && state.section2Diseases.includes("a_hiv"));
  mkDisease(
    "mh-life-s2-a-toxo",
    "Токсоплазмоз (с поражением нервной системы)",
    Array.isArray(state.section2Diseases) && state.section2Diseases.includes("a_toxoplasmosis_cns")
  );
  mkDisease("mh-life-s2-a-lyme", "Болезнь Лайма (нейроборрелиоз)", Array.isArray(state.section2Diseases) && state.section2Diseases.includes("a_lyme"));
  mkDisease(
    "mh-life-s2-a-covid",
    "COVID-19 с длительными последствиями",
    Array.isArray(state.section2Diseases) && state.section2Diseases.includes("a_covid_long")
  );

  const hB = document.createElement("p");
  hB.className = "mh-life-hint";
  hB.textContent = "Аутоиммунные и воспалительные";
  fsB9.appendChild(hB);
  mkDisease(
    "mh-life-s2-b-sle",
    "Системная красная волчанка (с поражением нервной системы)",
    Array.isArray(state.section2Diseases) && state.section2Diseases.includes("b_sle_cns")
  );
  mkDisease("mh-life-s2-b-ms", "Рассеянный склероз", Array.isArray(state.section2Diseases) && state.section2Diseases.includes("b_ms"));
  mkDisease(
    "mh-life-s2-b-nmda",
    "Анти-NMDA-рецепторный энцефалит",
    Array.isArray(state.section2Diseases) && state.section2Diseases.includes("b_anti_nmda")
  );
  mkDisease(
    "mh-life-s2-b-hashimoto",
    "Тиреоидит Хашимото (с энцефалопатией)",
    Array.isArray(state.section2Diseases) && state.section2Diseases.includes("b_hashimoto_encephalopathy")
  );

  const hV = document.createElement("p");
  hV.className = "mh-life-hint";
  hV.textContent = "Эндокринные";
  fsB9.appendChild(hV);
  mkDisease("mh-life-s2-v-hypo", "Гипотиреоз", Array.isArray(state.section2Diseases) && state.section2Diseases.includes("v_hypothyroidism"));
  mkDisease(
    "mh-life-s2-v-hyper",
    "Тиреотоксикоз / гипертиреоз",
    Array.isArray(state.section2Diseases) && state.section2Diseases.includes("v_thyrotoxicosis")
  );
  mkDisease("mh-life-s2-v-diabetes", "Сахарный диабет", Array.isArray(state.section2Diseases) && state.section2Diseases.includes("v_diabetes"));
  mkDisease(
    "mh-life-s2-v-parathy",
    "Гиперпаратиреоз",
    Array.isArray(state.section2Diseases) && state.section2Diseases.includes("v_hyperparathyroidism")
  );
  mkDisease(
    "mh-life-s2-v-cushing",
    "Болезнь Иценко-Кушинга",
    Array.isArray(state.section2Diseases) && state.section2Diseases.includes("v_cushing")
  );

  const hG = document.createElement("p");
  hG.className = "mh-life-hint";
  hG.textContent = "Хронические инвалидизирующие";
  fsB9.appendChild(hG);
  mkDisease("mh-life-s2-g-ra", "Ревматоидный артрит", Array.isArray(state.section2Diseases) && state.section2Diseases.includes("g_ra"));
  mkDisease("mh-life-s2-g-fibro", "Фибромиалгия", Array.isArray(state.section2Diseases) && state.section2Diseases.includes("g_fibromyalgia"));
  mkDisease("mh-life-s2-g-copd", "ХОБЛ", Array.isArray(state.section2Diseases) && state.section2Diseases.includes("g_copd"));
  mkDisease(
    "mh-life-s2-g-heart",
    "Тяжелая сердечная недостаточность / ИБС с приступами",
    Array.isArray(state.section2Diseases) && state.section2Diseases.includes("g_hf_ihd")
  );
  mkDisease(
    "mh-life-s2-g-hep",
    "Тяжелый гепатит / цирроз печени",
    Array.isArray(state.section2Diseases) && state.section2Diseases.includes("g_hepatitis_cirrhosis")
  );

  const hD = document.createElement("p");
  hD.className = "mh-life-hint";
  hD.textContent = "Дефицитные состояния";
  fsB9.appendChild(hD);
  mkDisease(
    "mh-life-s2-d-b12",
    "Дефицит витамина B12 (подтвержденный)",
    Array.isArray(state.section2Diseases) && state.section2Diseases.includes("d_b12_deficit")
  );
  mkDisease("mh-life-s2-d-dvit", "Дефицит витамина D", Array.isArray(state.section2Diseases) && state.section2Diseases.includes("d_d_deficit"));
  mkDisease(
    "mh-life-s2-d-iron",
    "Железодефицитная анемия средней и тяжелой степени",
    Array.isArray(state.section2Diseases) && state.section2Diseases.includes("d_iron_def_anemia")
  );
  mkDisease(
    "mh-life-s2-d-folate",
    "Дефицит фолиевой кислоты",
    Array.isArray(state.section2Diseases) && state.section2Diseases.includes("d_folate_deficit")
  );
  mkDisease("mh-life-s2-d-celiac", "Целиакия (нелеченная)", Array.isArray(state.section2Diseases) && state.section2Diseases.includes("d_celiac_untreated"));

  const hE = document.createElement("p");
  hE.className = "mh-life-hint";
  hE.textContent = "Другое";
  fsB9.appendChild(hE);
  mkDisease("mh-life-s2-e-other", "Другое серьезное заболевание", Array.isArray(state.section2Diseases) && state.section2Diseases.includes("e_other"));
  const s2OtherRow = document.createElement("div");
  s2OtherRow.className = "mh-life-row";
  s2OtherRow.hidden = !(Array.isArray(state.section2Diseases) && state.section2Diseases.includes("e_other"));
  s2OtherRow.appendChild(document.createTextNode("Уточнение: "));
  const s2OtherInp = document.createElement("input");
  s2OtherInp.type = "text";
  s2OtherInp.id = "mh-life-s2-other-text";
  s2OtherInp.className = "mh-life-text";
  s2OtherInp.value = String(state.section2OtherDisease ?? "");
  s2OtherRow.appendChild(s2OtherInp);
  fsB9.appendChild(s2OtherRow);
  const s2OtherCb = fsB9.querySelector("#mh-life-s2-e-other");
  if (s2OtherCb instanceof HTMLInputElement) {
    s2OtherCb.addEventListener("change", () => {
      s2OtherRow.hidden = !s2OtherCb.checked;
      if (!s2OtherCb.checked) s2OtherInp.value = "";
      updateS2PsychVisibility();
    });
  }

  const q22Wrap = document.createElement("div");
  q22Wrap.className = "mh-life-early-sub";
  const q22 = document.createElement("p");
  q22.className = "mh-life-edu-title";
  q22.textContent = "Вопрос 2. Отмечались ли у Вас после этих заболеваний какие-либо из следующих состояний?";
  q22Wrap.appendChild(q22);
  q22Wrap.appendChild(
    mkCheck(
      "mh-life-s2-psych-mood",
      "Изменение настроения (длительная грусть, раздражительность, апатия)",
      Array.isArray(state.section2PsychSymptoms) && state.section2PsychSymptoms.includes("mood_change")
    )
  );
  q22Wrap.appendChild(
    mkCheck(
      "mh-life-s2-psych-anxiety",
      "Тревога, панические атаки",
      Array.isArray(state.section2PsychSymptoms) && state.section2PsychSymptoms.includes("anxiety_panic")
    )
  );
  q22Wrap.appendChild(
    mkCheck(
      "mh-life-s2-psych-hall",
      "Галлюцинации (зрительные, слуховые) или бредовые идеи",
      Array.isArray(state.section2PsychSymptoms) && state.section2PsychSymptoms.includes("hallucinations_delusions")
    )
  );
  q22Wrap.appendChild(
    mkCheck(
      "mh-life-s2-psych-conf",
      "Спутанность сознания («отключки», дезориентация)",
      Array.isArray(state.section2PsychSymptoms) && state.section2PsychSymptoms.includes("confusion")
    )
  );
  q22Wrap.appendChild(
    mkCheck(
      "mh-life-s2-psych-memory",
      "Значительное ухудшение памяти или внимания",
      Array.isArray(state.section2PsychSymptoms) && state.section2PsychSymptoms.includes("memory_attention_decline")
    )
  );
  q22Wrap.appendChild(
    mkCheck("mh-life-s2-psych-none", "Ничего из перечисленного", state.section2PsychNone === true)
  );
  fsB9.appendChild(q22Wrap);

  function updateS2PsychVisibility() {
    const hasDisease =
      [
        "#mh-life-s2-a-meningitis",
        "#mh-life-s2-a-encephalitis",
        "#mh-life-s2-a-neurosyphilis",
        "#mh-life-s2-a-hiv",
        "#mh-life-s2-a-toxo",
        "#mh-life-s2-a-lyme",
        "#mh-life-s2-a-covid",
        "#mh-life-s2-b-sle",
        "#mh-life-s2-b-ms",
        "#mh-life-s2-b-nmda",
        "#mh-life-s2-b-hashimoto",
        "#mh-life-s2-v-hypo",
        "#mh-life-s2-v-hyper",
        "#mh-life-s2-v-diabetes",
        "#mh-life-s2-v-parathy",
        "#mh-life-s2-v-cushing",
        "#mh-life-s2-g-ra",
        "#mh-life-s2-g-fibro",
        "#mh-life-s2-g-copd",
        "#mh-life-s2-g-heart",
        "#mh-life-s2-g-hep",
        "#mh-life-s2-d-b12",
        "#mh-life-s2-d-dvit",
        "#mh-life-s2-d-iron",
        "#mh-life-s2-d-folate",
        "#mh-life-s2-d-celiac",
        "#mh-life-s2-e-other",
      ].some((sel) => chk(fsB9, sel));
    q22Wrap.hidden = !hasDisease;
    if (!hasDisease) {
      q22Wrap.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        if (cb instanceof HTMLInputElement) cb.checked = false;
      });
    }
  }
  fsB9.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    if (!(cb instanceof HTMLInputElement)) return;
    if (cb.id.startsWith("mh-life-s2-psych-")) {
      cb.addEventListener("change", () => {
        const noneCb = q22Wrap.querySelector("#mh-life-s2-psych-none");
        if (cb.id === "mh-life-s2-psych-none" && cb.checked) {
          q22Wrap.querySelectorAll('input[type="checkbox"]').forEach((el) => {
            if (el instanceof HTMLInputElement && el.id !== "mh-life-s2-psych-none") el.checked = false;
          });
        } else if (cb.id !== "mh-life-s2-psych-none" && cb.checked && noneCb instanceof HTMLInputElement) {
          noneCb.checked = false;
        }
      });
    } else {
      cb.addEventListener("change", () => updateS2PsychVisibility());
    }
  });
  updateS2PsychVisibility();
  contentEl.appendChild(fsB9);

  const fsB10 = fieldset("Блок 10. Операции");
  const q101 = document.createElement("p");
  q101.className = "mh-life-edu-title";
  q101.textContent = "Вопрос 1. Были ли у Вас хирургические операции?";
  fsB10.appendChild(q101);
  fsB10.appendChild(radioRow("mh-life-op-had", "yes", "Да", state.operationsHad === "yes"));
  fsB10.appendChild(radioRow("mh-life-op-had", "no", "Нет", state.operationsHad === "no"));
  const opWrap = document.createElement("div");
  opWrap.className = "mh-life-early-sub";
  opWrap.hidden = state.operationsHad !== "yes";
  const opList = document.createElement("div");
  opList.className = "mh-life-childhood-visits-list";
  opWrap.appendChild(opList);
  const opStates =
    Array.isArray(state.operationsList) && state.operationsList.length
      ? state.operationsList
      : [{ name: "", age: "", ageUnknown: false, anesthesia: "" }];
  function reflowOps(mutator) {
    const y = window.scrollY;
    readLifeStructuredFromDom(contentEl, answers);
    const st = parseLifeStructuredString(answers[LIFE_STRUCTURED_ID]);
    mutator(st);
    answers[LIFE_STRUCTURED_ID] = JSON.stringify(st);
    renderLifeStructuredStep(contentEl, answers, qIndex, stepsLen, gender, nextWizardBtn);
    window.requestAnimationFrame(() => window.scrollTo({ top: y }));
  }
  opStates.forEach((it, idx) => {
    const row = document.createElement("div");
    row.className = "mh-life-childhood-visit";
    const t = document.createElement("p");
    t.className = "mh-life-childhood-visit-title";
    t.textContent = `Операция ${idx + 1}`;
    row.appendChild(t);
    const name = document.createElement("input");
    name.type = "text";
    name.className = "mh-life-text mh-life-op-name";
    name.value = String(it.name ?? "");
    name.placeholder = "Название операции";
    row.appendChild(name);
    const age = document.createElement("input");
    age.type = "text";
    age.inputMode = "numeric";
    age.className = "mh-life-text mh-life-text--narrow mh-life-op-age";
    age.value = String(it.age ?? "");
    age.placeholder = "Возраст";
    age.disabled = it.ageUnknown === true;
    row.appendChild(age);
    const ageUnknownWrap = document.createElement("label");
    ageUnknownWrap.className = "mh-life-row";
    const ageUnknown = document.createElement("input");
    ageUnknown.type = "checkbox";
    ageUnknown.className = "mh-life-op-age-unknown";
    ageUnknown.checked = it.ageUnknown === true;
    ageUnknown.addEventListener("change", () => {
      age.disabled = ageUnknown.checked;
      if (ageUnknown.checked) age.value = "";
    });
    ageUnknownWrap.appendChild(ageUnknown);
    ageUnknownWrap.appendChild(document.createTextNode(" Не помню возраст"));
    row.appendChild(ageUnknownWrap);
    const anWrap = document.createElement("div");
    anWrap.className = "mh-life-row";
    anWrap.appendChild(radioRowStatic(`mh-life-op-an-${idx}`, "yes", "С наркозом", it.anesthesia === "yes"));
    anWrap.appendChild(radioRowStatic(`mh-life-op-an-${idx}`, "no", "Без наркоза", it.anesthesia === "no"));
    anWrap.appendChild(radioRowStatic(`mh-life-op-an-${idx}`, "unknown", "Не знаю", it.anesthesia === "unknown"));
    row.appendChild(anWrap);
    const del = document.createElement("button");
    del.type = "button";
    del.className = "mh-life-heredity-remove";
    del.textContent = "Удалить";
    del.hidden = opStates.length <= 1;
    del.addEventListener("click", () => {
      reflowOps((st) => {
        const arr = Array.isArray(st.operationsList) ? st.operationsList : [];
        arr.splice(idx, 1);
        st.operationsList = arr.length ? arr : [{ name: "", age: "", ageUnknown: false, anesthesia: "" }];
      });
    });
    row.appendChild(del);
    opList.appendChild(row);
  });
  const opAdd = document.createElement("button");
  opAdd.type = "button";
  opAdd.className = "mh-life-add-case";
  opAdd.textContent = "Добавить операцию";
  opAdd.addEventListener("click", () => {
    reflowOps((st) => {
      const arr = Array.isArray(st.operationsList) ? st.operationsList : [];
      arr.push({ name: "", age: "", ageUnknown: false, anesthesia: "" });
      st.operationsList = arr;
    });
  });
  opWrap.appendChild(opAdd);
  fsB10.appendChild(opWrap);
  fsB10.querySelectorAll('input[name="mh-life-op-had"]').forEach((el) => {
    el.addEventListener("change", () => {
      const sel = fsB10.querySelector('input[name="mh-life-op-had"]:checked');
      opWrap.hidden = !(sel instanceof HTMLInputElement && sel.value === "yes");
    });
  });
  contentEl.appendChild(fsB10);

  const fsB11 = fieldset("Блок 11. Потери сознания (без ЧМТ)");
  const q41 = document.createElement("p");
  q41.className = "mh-life-edu-title";
  q41.textContent = "Вопрос 1. Были ли потери сознания (обмороки) без ЧМТ?";
  fsB11.appendChild(q41);
  fsB11.appendChild(radioRow("mh-life-sync-had", "yes", "Да", state.syncopeNoTbiHad === "yes"));
  fsB11.appendChild(radioRow("mh-life-sync-had", "no", "Нет", state.syncopeNoTbiHad === "no"));
  const syncWrap = document.createElement("div");
  syncWrap.className = "mh-life-early-sub";
  syncWrap.hidden = state.syncopeNoTbiHad !== "yes";
  const syncList = document.createElement("div");
  syncList.className = "mh-life-childhood-visits-list";
  syncWrap.appendChild(syncList);
  const syncStates =
    Array.isArray(state.syncopeNoTbiList) && state.syncopeNoTbiList.length
      ? state.syncopeNoTbiList
      : [{ age: "", ageUnknown: false, cause: "" }];
  function reflowSync(mutator) {
    const y = window.scrollY;
    readLifeStructuredFromDom(contentEl, answers);
    const st = parseLifeStructuredString(answers[LIFE_STRUCTURED_ID]);
    mutator(st);
    answers[LIFE_STRUCTURED_ID] = JSON.stringify(st);
    renderLifeStructuredStep(contentEl, answers, qIndex, stepsLen, gender, nextWizardBtn);
    window.requestAnimationFrame(() => window.scrollTo({ top: y }));
  }
  syncStates.forEach((it, idx) => {
    const row = document.createElement("div");
    row.className = "mh-life-childhood-visit";
    const age = document.createElement("input");
    age.type = "text";
    age.inputMode = "numeric";
    age.className = "mh-life-text mh-life-text--narrow mh-life-sync-age";
    age.value = String(it.age ?? "");
    age.placeholder = "Возраст";
    age.disabled = it.ageUnknown === true;
    row.appendChild(age);
    const ageUnknownWrap = document.createElement("label");
    ageUnknownWrap.className = "mh-life-row";
    const ageUnknown = document.createElement("input");
    ageUnknown.type = "checkbox";
    ageUnknown.className = "mh-life-sync-age-unknown";
    ageUnknown.checked = it.ageUnknown === true;
    ageUnknown.addEventListener("change", () => {
      age.disabled = ageUnknown.checked;
      if (ageUnknown.checked) age.value = "";
    });
    ageUnknownWrap.appendChild(ageUnknown);
    ageUnknownWrap.appendChild(document.createTextNode(" Не помню возраст"));
    row.appendChild(ageUnknownWrap);
    const cause = document.createElement("input");
    cause.type = "text";
    cause.className = "mh-life-text mh-life-sync-cause";
    cause.value = String(it.cause ?? "");
    cause.placeholder = "Предполагаемая причина";
    row.appendChild(cause);
    const del = document.createElement("button");
    del.type = "button";
    del.className = "mh-life-heredity-remove";
    del.textContent = "Удалить";
    del.hidden = syncStates.length <= 1;
    del.addEventListener("click", () => {
      reflowSync((st) => {
        const arr = Array.isArray(st.syncopeNoTbiList) ? st.syncopeNoTbiList : [];
        arr.splice(idx, 1);
        st.syncopeNoTbiList = arr.length ? arr : [{ age: "", ageUnknown: false, cause: "" }];
      });
    });
    row.appendChild(del);
    syncList.appendChild(row);
  });
  const syncAdd = document.createElement("button");
  syncAdd.type = "button";
  syncAdd.className = "mh-life-add-case";
  syncAdd.textContent = "Добавить обморок";
  syncAdd.addEventListener("click", () => {
    reflowSync((st) => {
      const arr = Array.isArray(st.syncopeNoTbiList) ? st.syncopeNoTbiList : [];
      arr.push({ age: "", ageUnknown: false, cause: "" });
      st.syncopeNoTbiList = arr;
    });
  });
  syncWrap.appendChild(syncAdd);
  fsB11.appendChild(syncWrap);
  fsB11.querySelectorAll('input[name="mh-life-sync-had"]').forEach((el) => {
    el.addEventListener("change", () => {
      const sel = fsB11.querySelector('input[name="mh-life-sync-had"]:checked');
      syncWrap.hidden = !(sel instanceof HTMLInputElement && sel.value === "yes");
    });
  });
  contentEl.appendChild(fsB11);

  const fsB12 = fieldset("Блок 12. ЧМТ с потерей сознания");
  const q51 = document.createElement("p");
  q51.className = "mh-life-edu-title";
  q51.textContent = "Вопрос 1. Были ли ЧМТ, сопровождавшиеся потерей сознания?";
  fsB12.appendChild(q51);
  fsB12.appendChild(radioRow("mh-life-tbi-had", "yes", "Да", state.tbiWithLossHad === "yes"));
  fsB12.appendChild(radioRow("mh-life-tbi-had", "no", "Нет", state.tbiWithLossHad === "no"));
  const tbiWrap = document.createElement("div");
  tbiWrap.className = "mh-life-early-sub";
  tbiWrap.hidden = state.tbiWithLossHad !== "yes";
  const tbiList = document.createElement("div");
  tbiList.className = "mh-life-childhood-visits-list";
  tbiWrap.appendChild(tbiList);
  const tbiStates =
    Array.isArray(state.tbiWithLossList) && state.tbiWithLossList.length
      ? state.tbiWithLossList
      : [{ age: "", ageUnknown: false, circumstance: "", lossDuration: "", exam: "" }];
  function reflowTbi(mutator) {
    const y = window.scrollY;
    readLifeStructuredFromDom(contentEl, answers);
    const st = parseLifeStructuredString(answers[LIFE_STRUCTURED_ID]);
    mutator(st);
    answers[LIFE_STRUCTURED_ID] = JSON.stringify(st);
    renderLifeStructuredStep(contentEl, answers, qIndex, stepsLen, gender, nextWizardBtn);
    window.requestAnimationFrame(() => window.scrollTo({ top: y }));
  }
  tbiStates.forEach((it, idx) => {
    const row = document.createElement("div");
    row.className = "mh-life-childhood-visit";
    const age = document.createElement("input");
    age.type = "text";
    age.inputMode = "numeric";
    age.className = "mh-life-text mh-life-text--narrow mh-life-tbi-age";
    age.value = String(it.age ?? "");
    age.placeholder = "Возраст";
    age.disabled = it.ageUnknown === true;
    row.appendChild(age);
    const ageUnknownWrap = document.createElement("label");
    ageUnknownWrap.className = "mh-life-row";
    const ageUnknown = document.createElement("input");
    ageUnknown.type = "checkbox";
    ageUnknown.className = "mh-life-tbi-age-unknown";
    ageUnknown.checked = it.ageUnknown === true;
    ageUnknown.addEventListener("change", () => {
      age.disabled = ageUnknown.checked;
      if (ageUnknown.checked) age.value = "";
    });
    ageUnknownWrap.appendChild(ageUnknown);
    ageUnknownWrap.appendChild(document.createTextNode(" Не помню возраст"));
    row.appendChild(ageUnknownWrap);
    const cSel = document.createElement("select");
    cSel.className = "mh-life-select mh-life-tbi-circ";
    [
      ["", "Обстоятельства —"],
      ["dtp", "ДТП"],
      ["head_hit", "Удар головой"],
      ["fall", "Падение"],
      ["fight", "Драка"],
      ["unknown", "Не знаю"],
    ].forEach(([v, t]) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = t;
      if (it.circumstance === v) o.selected = true;
      cSel.appendChild(o);
    });
    row.appendChild(cSel);
    const dSel = document.createElement("select");
    dSel.className = "mh-life-select mh-life-tbi-dur";
    [
      ["", "Длительность —"],
      ["seconds", "Секунды"],
      ["minutes", "Минуты"],
      ["over_hour", "Более часа"],
      ["unknown", "Неизвестно"],
    ].forEach(([v, t]) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = t;
      if (it.lossDuration === v) o.selected = true;
      dSel.appendChild(o);
    });
    row.appendChild(dSel);
    const eSel = document.createElement("select");
    eSel.className = "mh-life-select mh-life-tbi-exam";
    [
      ["", "Обследование —"],
      ["ct", "КТ"],
      ["mri", "МРТ"],
      ["no", "Нет"],
      ["unknown", "Не помню"],
    ].forEach(([v, t]) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = t;
      if (it.exam === v) o.selected = true;
      eSel.appendChild(o);
    });
    row.appendChild(eSel);
    const del = document.createElement("button");
    del.type = "button";
    del.className = "mh-life-heredity-remove";
    del.textContent = "Удалить";
    del.hidden = tbiStates.length <= 1;
    del.addEventListener("click", () => {
      reflowTbi((st) => {
        const arr = Array.isArray(st.tbiWithLossList) ? st.tbiWithLossList : [];
        arr.splice(idx, 1);
        st.tbiWithLossList = arr.length ? arr : [{ age: "", ageUnknown: false, circumstance: "", lossDuration: "", exam: "" }];
      });
    });
    row.appendChild(del);
    tbiList.appendChild(row);
  });
  const tbiAdd = document.createElement("button");
  tbiAdd.type = "button";
  tbiAdd.className = "mh-life-add-case";
  tbiAdd.textContent = "Добавить ЧМТ";
  tbiAdd.addEventListener("click", () => {
    reflowTbi((st) => {
      const arr = Array.isArray(st.tbiWithLossList) ? st.tbiWithLossList : [];
      arr.push({ age: "", ageUnknown: false, circumstance: "", lossDuration: "", exam: "" });
      st.tbiWithLossList = arr;
    });
  });
  tbiWrap.appendChild(tbiAdd);
  fsB12.appendChild(tbiWrap);
  fsB12.querySelectorAll('input[name="mh-life-tbi-had"]').forEach((el) => {
    el.addEventListener("change", () => {
      const sel = fsB12.querySelector('input[name="mh-life-tbi-had"]:checked');
      tbiWrap.hidden = !(sel instanceof HTMLInputElement && sel.value === "yes");
    });
  });
  contentEl.appendChild(fsB12);

  const fsB13 = fieldset("Блок 13. Эпилепсия");
  const q131 = document.createElement("p");
  q131.className = "mh-life-edu-title";
  q131.textContent = "Вопрос 1. Установлен ли диагноз «эпилепсия» или «судорожное расстройство»?";
  fsB13.appendChild(q131);
  fsB13.appendChild(radioRow("mh-life-epi-status", "yes", "Да", state.epilepsyStatus === "yes"));
  fsB13.appendChild(radioRow("mh-life-epi-status", "no", "Нет", state.epilepsyStatus === "no"));
  fsB13.appendChild(radioRow("mh-life-epi-status", "unknown", "Не знаю / не уверен", state.epilepsyStatus === "unknown"));
  const epiWrap = document.createElement("div");
  epiWrap.className = "mh-life-early-sub";
  epiWrap.hidden = state.epilepsyStatus !== "yes";
  epiWrap.appendChild(radioRow("mh-life-epi-first", "age", "Первые приступы в возрасте", state.epilepsyFirstSeizureType === "age"));
  const epiAge = document.createElement("input");
  epiAge.type = "text";
  epiAge.inputMode = "numeric";
  epiAge.id = "mh-life-epi-first-age";
  epiAge.className = "mh-life-text mh-life-text--narrow";
  epiAge.value = String(state.epilepsyFirstSeizureAge ?? "");
  epiAge.disabled = state.epilepsyFirstSeizureType !== "age";
  epiWrap.appendChild(epiAge);
  epiWrap.appendChild(radioRow("mh-life-epi-first", "birth", "С рождения", state.epilepsyFirstSeizureType === "birth"));
  epiWrap.appendChild(radioRow("mh-life-epi-first", "unknown", "Не помню", state.epilepsyFirstSeizureType === "unknown"));
  epiWrap.querySelectorAll('input[name="mh-life-epi-first"]').forEach((el) => {
    el.addEventListener("change", () => {
      const sel = epiWrap.querySelector('input[name="mh-life-epi-first"]:checked');
      const isAge = sel instanceof HTMLInputElement && sel.value === "age";
      epiAge.disabled = !isAge;
      if (!isAge) epiAge.value = "";
    });
  });
  epiWrap.appendChild(
    radioRow("mh-life-epi-meds", "yes", "Принимаю противосудорожные препараты", state.epilepsyMedsStatus === "yes"),
  );
  epiWrap.appendChild(
    radioRow("mh-life-epi-meds", "no", "Лекарства не принимаю", state.epilepsyMedsStatus === "no"),
  );
  epiWrap.appendChild(radioRow("mh-life-epi-meds", "unknown", "Не помню", state.epilepsyMedsStatus === "unknown"));
  const medsWrap = document.createElement("div");
  medsWrap.className = "mh-life-early-sub";
  medsWrap.hidden = state.epilepsyMedsStatus !== "yes";
  [
    "вальпроаты (Депакин, Конвулекс)",
    "леветирацетам (Кеппра)",
    "карбамазепин (Тегретол, Финлепсин)",
    "ламотриджин",
    "топирамат",
    "другое",
  ].forEach((m, i) => {
    const checked = Array.isArray(state.epilepsyMeds) && state.epilepsyMeds.includes(m);
    medsWrap.appendChild(mkCheck(`mh-life-epi-med-${i}`, m, checked));
  });
  epiWrap.appendChild(medsWrap);
  epiWrap.querySelectorAll('input[name="mh-life-epi-meds"]').forEach((el) => {
    el.addEventListener("change", () => {
      const sel = epiWrap.querySelector('input[name="mh-life-epi-meds"]:checked');
      medsWrap.hidden = !(sel instanceof HTMLInputElement && sel.value === "yes");
      if (medsWrap.hidden) medsWrap.querySelectorAll('input[type="checkbox"]').forEach((cb) => cb instanceof HTMLInputElement && (cb.checked = false));
    });
  });
  fsB13.appendChild(epiWrap);
  fsB13.querySelectorAll('input[name="mh-life-epi-status"]').forEach((el) => {
    el.addEventListener("change", () => {
      const sel = fsB13.querySelector('input[name="mh-life-epi-status"]:checked');
      epiWrap.hidden = !(sel instanceof HTMLInputElement && sel.value === "yes");
    });
  });
  contentEl.appendChild(fsB13);

  const fsB14 = fieldset("Блок 14. Хронические заболевания");
  const q141 = document.createElement("p");
  q141.className = "mh-life-edu-title";
  q141.textContent = "Вопрос 1. Есть ли хронические заболевания, требующие регулярного наблюдения?";
  fsB14.appendChild(q141);
  fsB14.appendChild(radioRow("mh-life-chronic-had", "yes", "Да", state.chronicHad === "yes"));
  fsB14.appendChild(radioRow("mh-life-chronic-had", "no", "Нет", state.chronicHad === "no"));
  const chWrap = document.createElement("div");
  chWrap.className = "mh-life-early-sub";
  chWrap.hidden = state.chronicHad !== "yes";
  const chDis = document.createElement("input");
  chDis.type = "text";
  chDis.id = "mh-life-chronic-diseases";
  chDis.className = "mh-life-text";
  chDis.placeholder = "Какие заболевания";
  chDis.value = String(state.chronicDiseasesText ?? "");
  chWrap.appendChild(chDis);
  chWrap.appendChild(
    radioRow("mh-life-chronic-meds", "yes", "Принимаю лекарства регулярно", state.chronicMedsRegular === "yes"),
  );
  chWrap.appendChild(
    radioRow("mh-life-chronic-meds", "no", "Лекарства не принимаю регулярно", state.chronicMedsRegular === "no"),
  );
  chWrap.appendChild(radioRow("mh-life-chronic-meds", "unknown", "Не помню", state.chronicMedsRegular === "unknown"));
  const chMeds = document.createElement("input");
  chMeds.type = "text";
  chMeds.id = "mh-life-chronic-meds-text";
  chMeds.className = "mh-life-text";
  chMeds.placeholder = "Какие лекарства";
  chMeds.value = String(state.chronicMedsText ?? "");
  chMeds.hidden = state.chronicMedsRegular !== "yes";
  chWrap.appendChild(chMeds);
  chWrap.querySelectorAll('input[name="mh-life-chronic-meds"]').forEach((el) => {
    el.addEventListener("change", () => {
      const sel = chWrap.querySelector('input[name="mh-life-chronic-meds"]:checked');
      const show = sel instanceof HTMLInputElement && sel.value === "yes";
      chMeds.hidden = !show;
      if (!show) chMeds.value = "";
    });
  });
  fsB14.appendChild(chWrap);
  fsB14.querySelectorAll('input[name="mh-life-chronic-had"]').forEach((el) => {
    el.addEventListener("change", () => {
      const sel = fsB14.querySelector('input[name="mh-life-chronic-had"]:checked');
      chWrap.hidden = !(sel instanceof HTMLInputElement && sel.value === "yes");
    });
  });
  contentEl.appendChild(fsB14);

  const fsB15 = fieldset("Блок 15. Аллергические реакции");
  const q151 = document.createElement("p");
  q151.className = "mh-life-edu-title";
  q151.textContent = "Вопрос 1. Были ли аллергические реакции?";
  fsB15.appendChild(q151);
  fsB15.appendChild(radioRow("mh-life-allergy-had", "yes", "Да", state.allergyHad === "yes"));
  fsB15.appendChild(radioRow("mh-life-allergy-had", "no", "Нет", state.allergyHad === "no"));
  const alWrap = document.createElement("div");
  alWrap.className = "mh-life-early-sub";
  alWrap.hidden = state.allergyHad !== "yes";
  const alList = document.createElement("div");
  alList.className = "mh-life-childhood-visits-list";
  alWrap.appendChild(alList);
  const alStates = Array.isArray(state.allergyList) && state.allergyList.length ? state.allergyList : [{ trigger: "", reactions: [] }];
  function reflowAllergy(mutator) {
    const y = window.scrollY;
    readLifeStructuredFromDom(contentEl, answers);
    const st = parseLifeStructuredString(answers[LIFE_STRUCTURED_ID]);
    mutator(st);
    answers[LIFE_STRUCTURED_ID] = JSON.stringify(st);
    renderLifeStructuredStep(contentEl, answers, qIndex, stepsLen, gender, nextWizardBtn);
    window.requestAnimationFrame(() => window.scrollTo({ top: y }));
  }
  alStates.forEach((it, idx) => {
    const row = document.createElement("div");
    row.className = "mh-life-childhood-visit";
    const trig = document.createElement("input");
    trig.type = "text";
    trig.className = "mh-life-text mh-life-allergy-trigger";
    trig.placeholder = "На что аллергия";
    trig.value = String(it.trigger ?? "");
    row.appendChild(trig);
    const opts = ["сыпь", "отек", "зуд", "анафилаксия", "насморк", "другое", "не помню"];
    opts.forEach((opt, j) => {
      const lab = mkCheck(`mh-life-allergy-r-${idx}-${j}`, opt, Array.isArray(it.reactions) && it.reactions.includes(opt));
      lab.classList.add("mh-life-allergy-react");
      row.appendChild(lab);
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "mh-life-heredity-remove";
    del.textContent = "Удалить";
    del.hidden = alStates.length <= 1;
    del.addEventListener("click", () => {
      reflowAllergy((st) => {
        const arr = Array.isArray(st.allergyList) ? st.allergyList : [];
        arr.splice(idx, 1);
        st.allergyList = arr.length ? arr : [{ trigger: "", reactions: [] }];
      });
    });
    row.appendChild(del);
    alList.appendChild(row);
  });
  const alAdd = document.createElement("button");
  alAdd.type = "button";
  alAdd.className = "mh-life-add-case";
  alAdd.textContent = "Добавить аллергию";
  alAdd.addEventListener("click", () => {
    reflowAllergy((st) => {
      const arr = Array.isArray(st.allergyList) ? st.allergyList : [];
      arr.push({ trigger: "", reactions: [] });
      st.allergyList = arr;
    });
  });
  alWrap.appendChild(alAdd);
  fsB15.appendChild(alWrap);
  fsB15.querySelectorAll('input[name="mh-life-allergy-had"]').forEach((el) => {
    el.addEventListener("change", () => {
      const sel = fsB15.querySelector('input[name="mh-life-allergy-had"]:checked');
      alWrap.hidden = !(sel instanceof HTMLInputElement && sel.value === "yes");
    });
  });
  contentEl.appendChild(fsB15);

  const fsB16 = fieldset("Блок 16. Курение, алкоголь, ПАВ");
  const q91 = document.createElement("p");
  q91.className = "mh-life-edu-title";
  q91.textContent = "Вопрос 1. Курите ли Вы?";
  fsB16.appendChild(q91);
  fsB16.appendChild(radioRow("mh-life-smoking", "no", "Нет", state.smokingStatus === "no"));
  fsB16.appendChild(radioRow("mh-life-smoking", "past", uiSmokingPast, state.smokingStatus === "past"));
  fsB16.appendChild(radioRow("mh-life-smoking", "yes", "Да, курю", state.smokingStatus === "yes"));
  const smokingPastRow = document.createElement("div");
  smokingPastRow.className = "mh-life-row";
  smokingPastRow.hidden = state.smokingStatus !== "past";
  smokingPastRow.appendChild(document.createTextNode("Стаж курения до отказа (лет): "));
  const smokingPastInp = document.createElement("input");
  smokingPastInp.type = "text";
  smokingPastInp.inputMode = "numeric";
  smokingPastInp.className = "mh-life-text mh-life-text--narrow";
  smokingPastInp.id = "mh-life-smoking-past-years";
  smokingPastInp.value = String(state.smokingPastYears ?? "");
  smokingPastRow.appendChild(smokingPastInp);
  fsB16.appendChild(smokingPastRow);
  const smokingYesWrap = document.createElement("div");
  smokingYesWrap.className = "mh-life-early-sub";
  smokingYesWrap.hidden = state.smokingStatus !== "yes";
  const sy = document.createElement("input");
  sy.type = "text";
  sy.inputMode = "numeric";
  sy.className = "mh-life-text mh-life-text--narrow";
  sy.id = "mh-life-smoking-years";
  sy.value = String(state.smokingCurrentYears ?? "");
  const syRow = document.createElement("div");
  syRow.className = "mh-life-row";
  syRow.appendChild(document.createTextNode("Стаж курения (лет): "));
  syRow.appendChild(sy);
  smokingYesWrap.appendChild(syRow);
  const scSel = document.createElement("select");
  scSel.id = "mh-life-smoking-cigs";
  scSel.className = "mh-life-select";
  [
    ["", "Количество сигарет в день —"],
    ["менее 5 сигарет в день", "<5"],
    ["5–10 сигарет в день", "5–10"],
    ["11–20 сигарет в день", "11–20"],
    ["более 20 сигарет в день", ">20"],
  ].forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = t;
    if (state.smokingCurrentCigs === v) o.selected = true;
    scSel.appendChild(o);
  });
  smokingYesWrap.appendChild(scSel);
  smokingYesWrap.appendChild(radioRow("mh-life-smoking-vape", "yes", "Использует электронные сигареты/вейп/IQOS", state.smokingUsesVape === "yes"));
  smokingYesWrap.appendChild(radioRow("mh-life-smoking-vape", "no", "Не использует", state.smokingUsesVape === "no"));
  fsB16.appendChild(smokingYesWrap);
  fsB16.querySelectorAll('input[name="mh-life-smoking"]').forEach((el) => {
    el.addEventListener("change", () => {
      const sel = fsB16.querySelector('input[name="mh-life-smoking"]:checked');
      const v = sel instanceof HTMLInputElement ? sel.value : "";
      smokingPastRow.hidden = v !== "past";
      smokingYesWrap.hidden = v !== "yes";
      if (v !== "past") smokingPastInp.value = "";
      if (v !== "yes") {
        sy.value = "";
        scSel.value = "";
        fsB16.querySelectorAll('input[name="mh-life-smoking-vape"]').forEach((r) => r instanceof HTMLInputElement && (r.checked = false));
      }
    });
  });
  const q171 = document.createElement("p");
  q171.className = "mh-life-edu-title";
  q171.textContent = "Вопрос 2. Употребляете ли Вы алкогольные напитки?";
  fsB16.appendChild(q171);
  fsB16.appendChild(radioRow("mh-life-alcohol", "none", "Нет (никогда)", state.alcoholStatus === "none"));
  fsB16.appendChild(radioRow("mh-life-alcohol", "rare", "Редко (1–2 раза в месяц и реже)", state.alcoholStatus === "rare"));
  fsB16.appendChild(radioRow("mh-life-alcohol", "regular", "Регулярно (1–2 раза в неделю и чаще)", state.alcoholStatus === "regular"));
  const alcoholRare = document.createElement("div");
  alcoholRare.className = "mh-life-early-sub";
  alcoholRare.hidden = state.alcoholStatus !== "rare";
  const arDrink = document.createElement("select");
  arDrink.id = "mh-life-alcohol-rare-drink";
  arDrink.className = "mh-life-select";
  const rareDrinkValueRaw = String(state.alcoholRareDrink ?? "");
  const rareDrinkValue = rareDrinkValueRaw.toLowerCase() === "все вышеперечисленное" ? "все виды алкоголя" : rareDrinkValueRaw;
  [
    ["", "Типичный напиток —"],
    ["крепкие спиртные напитки (обычно 40–60% и выше)", "Крепкие спиртные напитки (обычно 40–60% и выше)"],
    ["средней крепости (8–20%)", "Средней крепости (8–20%)"],
    ["слабоалкогольные напитки (1–9%)", "Слабоалкогольные напитки (1–9%)"],
    ["все виды алкоголя", "Все вышеперечисленное"],
  ].forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = t;
    if (rareDrinkValue === v) o.selected = true;
    arDrink.appendChild(o);
  });
  alcoholRare.appendChild(arDrink);
  const arAmt = document.createElement("input");
  arAmt.type = "range";
  arAmt.id = "mh-life-alcohol-rare-amount";
  arAmt.className = "mh-life-range";
  arAmt.min = "0";
  arAmt.max = "5";
  arAmt.step = "0.25";
  const rareAmountRaw = String(state.alcoholRareAmount ?? "").trim();
  if (/^\d+(\.\d+)?$/.test(rareAmountRaw)) {
    let v = Number(rareAmountRaw);
    if (Number.isFinite(v)) {
      if (v > 5 && v <= 10) v = v * 0.5;
      arAmt.value = v >= 0 && v <= 5 ? String(v) : "0";
    } else arAmt.value = "0";
  } else arAmt.value = "0";
  alcoholRare.appendChild(arAmt);
  const arAmtLab = document.createElement("p");
  arAmtLab.className = "mh-life-hint";
  const renderRareAmountLabel = () => {
    const liters = Number(arAmt.value || "0");
    if (!Number.isFinite(liters) || liters <= 0) {
      arAmtLab.textContent = "Примерное количество за раз: 0 мл";
      return;
    }
    if (liters >= 5) {
      arAmtLab.textContent = "Примерное количество за раз: 5 литров и более";
      return;
    }
    const ml = liters * 1000;
    if (ml < 1000) {
      arAmtLab.textContent = `Примерное количество за раз: ${ml} мл`;
      return;
    }
    arAmtLab.textContent = `Примерное количество за раз: ${Number.isInteger(liters) ? liters : String(liters).replace(".", ",")} л`;
  };
  renderRareAmountLabel();
  arAmt.addEventListener("input", renderRareAmountLabel);
  alcoholRare.appendChild(arAmtLab);
  fsB16.appendChild(alcoholRare);
  const alcoholReg = document.createElement("div");
  alcoholReg.className = "mh-life-early-sub";
  alcoholReg.hidden = state.alcoholStatus !== "regular";
  const regPref = document.createElement("select");
  regPref.id = "mh-life-alcohol-reg-pref";
  regPref.className = "mh-life-select";
  const regularPrefRaw = String(state.alcoholRegularPref ?? "");
  const regularPrefValue = regularPrefRaw.toLowerCase() === "все вышеперечисленное" ? "все виды алкоголя" : regularPrefRaw;
  [
    ["", "Предпочтение —"],
    ["крепкие спиртные напитки (обычно 40–60% и выше)", "Крепкие спиртные напитки (обычно 40–60% и выше)"],
    ["средней крепости (8–20%)", "Средней крепости (8–20%)"],
    ["слабоалкогольные напитки (1–9%)", "Слабоалкогольные напитки (1–9%)"],
    ["все виды алкоголя", "Все вышеперечисленное"],
  ].forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = t;
    if (regularPrefValue === v) o.selected = true;
    regPref.appendChild(o);
  });
  alcoholReg.appendChild(regPref);
  const regAmt = document.createElement("input");
  regAmt.type = "text";
  regAmt.id = "mh-life-alcohol-reg-amount";
  regAmt.className = "mh-life-text";
  regAmt.placeholder = "Количество за раз";
  regAmt.value = String(state.alcoholRegularAmount ?? "");
  alcoholReg.appendChild(regAmt);
  alcoholReg.appendChild(mkCheck("mh-life-alcohol-conseq-hangover", "Тяжелое похмелье", state.alcoholRegularConsequencesHangover));
  alcoholReg.appendChild(mkCheck("mh-life-alcohol-conseq-memory", "Провалы в памяти", state.alcoholRegularConsequencesMemoryBlackouts));
  alcoholReg.appendChild(mkCheck("mh-life-alcohol-conseq-conflicts", "Конфликты из-за алкоголя", state.alcoholRegularConsequencesConflicts));
  alcoholReg.appendChild(mkCheck("mh-life-alcohol-conseq-law", "Проблемы с законом", state.alcoholRegularConsequencesLaw));
  alcoholReg.appendChild(mkCheck("mh-life-alcohol-conseq-narc", "Обращение к наркологу", state.alcoholRegularConsequencesNarcologist));
  fsB16.appendChild(alcoholReg);
  fsB16.querySelectorAll('input[name="mh-life-alcohol"]').forEach((el) => {
    el.addEventListener("change", () => {
      const sel = fsB16.querySelector('input[name="mh-life-alcohol"]:checked');
      const v = sel instanceof HTMLInputElement ? sel.value : "";
      alcoholRare.hidden = v !== "rare";
      alcoholReg.hidden = v !== "regular";
      if (v !== "rare") {
        arDrink.value = "";
        arAmt.value = "0";
        renderRareAmountLabel();
      }
      if (v !== "regular") {
        regPref.value = "";
        regAmt.value = "";
        alcoholReg.querySelectorAll('input[type="checkbox"]').forEach((cb) => cb instanceof HTMLInputElement && (cb.checked = false));
      }
    });
  });
  const q111 = document.createElement("p");
  q111.className = "mh-life-edu-title";
  q111.textContent = "Вопрос 3. Употребляли ли Вы когда-либо ПАВ?";
  fsB16.appendChild(q111);
  fsB16.appendChild(radioRow("mh-life-pav-had", "yes", "Да", state.pavHad === "yes"));
  fsB16.appendChild(radioRow("mh-life-pav-had", "no", "Нет", state.pavHad === "no"));
  const pavWrap = document.createElement("div");
  pavWrap.className = "mh-life-early-sub";
  pavWrap.hidden = state.pavHad !== "yes";
  const selectedPavGroups = Array.isArray(state.pavGroups) ? state.pavGroups : [];
  const pavOptions = [
    "Опиаты и опиоиды",
    "Каннабиноиды",
    "Психостимуляторы",
    "Галлюциногены",
    "Снотворно-седативные средства",
    "Синтетические наркотики",
  ];
  pavOptions.forEach((label, idx) => {
    pavWrap.appendChild(mkCheck(`mh-life-pav-group-${idx}`, label, selectedPavGroups.includes(label)));
  });
  const pavUnknownLab = mkCheck("mh-life-pav-group-unknown", "Не знаю", state.pavGroupsUnknown === true);
  pavWrap.appendChild(pavUnknownLab);
  const pavExtraWrap = document.createElement("div");
  pavExtraWrap.className = "mh-life-early-sub";
  const pavExp = document.createElement("input");
  pavExp.type = "text";
  pavExp.id = "mh-life-pav-experience";
  pavExp.className = "mh-life-text";
  pavExp.placeholder = "Стаж (например: 3 года)";
  pavExp.value = String(state.pavExperience ?? "");
  pavExtraWrap.appendChild(pavExp);
  const pavLastLab = document.createElement("label");
  pavLastLab.className = "mh-life-field-label";
  pavLastLab.htmlFor = "mh-life-pav-last";
  pavLastLab.textContent = "Последнее употребление (месяц и год)";
  pavExtraWrap.appendChild(pavLastLab);
  const pavLast = document.createElement("input");
  pavLast.type = "month";
  pavLast.id = "mh-life-pav-last";
  pavLast.className = "mh-life-text";
  pavLast.lang = "ru-RU";
  pavLast.title =
    "В Chrome и Edge обычно открывается календарь. В Safari или другом браузере введите месяц вручную в формате ГГГГ-ММ (например, 2024-03).";
  const pavLastRaw = String(state.pavLastUse ?? "").trim();
  const pavLastYm = pavLastRaw.match(/^(\d{4})-(\d{2})$/);
  const pavLastMy = pavLastRaw.match(/^(\d{2})\.(\d{4})$/);
  pavLast.value = pavLastYm ? pavLastRaw : pavLastMy ? `${pavLastMy[2]}-${pavLastMy[1]}` : "";
  pavExtraWrap.appendChild(pavLast);
  const pavLastHint = document.createElement("p");
  pavLastHint.className = "mh-life-hint";
  pavLastHint.textContent =
    "Если календарь не открывается: это ограничение браузера для поля «месяц». Введите дату вручную в формате ГГГГ-ММ или используйте Chrome / Edge на компьютере.";
  pavExtraWrap.appendChild(pavLastHint);
  const pavFreq = document.createElement("select");
  pavFreq.id = "mh-life-pav-freq";
  pavFreq.className = "mh-life-select";
  [
    ["", "Частота —"],
    ["once_or_twice", "1–2 раза в жизни"],
    ["episodic", "Эпизодически"],
    ["regular_period", "Был период регулярного употребления"],
  ].forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = t;
    if (String(state.pavFrequency ?? "") === v) o.selected = true;
    pavFreq.appendChild(o);
  });
  pavExtraWrap.appendChild(pavFreq);
  const pavTreatment = document.createElement("select");
  pavTreatment.id = "mh-life-pav-treatment";
  pavTreatment.className = "mh-life-select";
  [
    ["", "Лечение —"],
    ["yes", "Лечение от зависимости проходил(а)"],
    ["no", "Лечение от зависимости не проходил(а)"],
  ].forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = t;
    if (String(state.pavTreatment ?? "") === v) o.selected = true;
    pavTreatment.appendChild(o);
  });
  pavExtraWrap.appendChild(pavTreatment);
  pavWrap.appendChild(pavExtraWrap);
  const pavUnknownCb = pavUnknownLab.querySelector("input");
  const syncPavUnknown = () => {
    const isUnknown = pavUnknownCb instanceof HTMLInputElement && pavUnknownCb.checked;
    if (!isUnknown) return;
    pavOptions.forEach((_, idx) => {
      const cb = pavWrap.querySelector(`#mh-life-pav-group-${idx}`);
      if (cb instanceof HTMLInputElement) cb.checked = false;
    });
  };
  if (pavUnknownCb instanceof HTMLInputElement) {
    pavUnknownCb.addEventListener("change", syncPavUnknown);
  }
  pavOptions.forEach((_, idx) => {
    const cb = pavWrap.querySelector(`#mh-life-pav-group-${idx}`);
    if (cb instanceof HTMLInputElement) {
      cb.addEventListener("change", () => {
        if (cb.checked && pavUnknownCb instanceof HTMLInputElement) pavUnknownCb.checked = false;
      });
    }
  });
  fsB16.appendChild(pavWrap);
  fsB16.querySelectorAll('input[name="mh-life-pav-had"]').forEach((el) => {
    el.addEventListener("change", () => {
      const sel = fsB16.querySelector('input[name="mh-life-pav-had"]:checked');
      pavWrap.hidden = !(sel instanceof HTMLInputElement && sel.value === "yes");
    });
  });
  contentEl.appendChild(fsB16);

  contentEl.querySelectorAll('input[name="mh-life-heredity"]').forEach((el) => {
    el.addEventListener("change", () => syncYesBlock());
  });

  function repopulateSiblingDeg(who) {
    sibSel.innerHTML = "";
    const ox = document.createElement("option");
    ox.value = "";
    ox.textContent = "—";
    sibSel.appendChild(ox);
    if (!needsSiblingDegree(who)) {
      sibSel.disabled = true;
      return;
    }
    const fem = who === "sister" || who === "niece";
    const opts = fem ? SIBLING_DEG_FEM : SIBLING_DEG_MASC;
    opts.forEach(([code, lab]) => {
      const o = document.createElement("option");
      o.value = code;
      o.textContent = lab.charAt(0).toUpperCase() + lab.slice(1);
      sibSel.appendChild(o);
    });
    sibSel.disabled = false;
  }

  /** Только блок линии: не трогать селект степени (иначе при change на степени repopulate сбрасывает выбор). */
  function syncHeredityLineRowOnly() {
    const who = whoSel instanceof HTMLSelectElement ? whoSel.value.trim() : "";
    const sib = sibSel instanceof HTMLSelectElement ? sibSel.value : "";
    const showLine = needsLine(who, sib || undefined);
    fsLine.hidden = !showLine;
    if (!showLine) {
      yesBlock.querySelectorAll('input[name="mh-life-draft-line"]').forEach((el) => {
        if (el instanceof HTMLInputElement) el.checked = false;
      });
    }
  }

  function updatePsychiatristDraftLabel() {
    const span = draftWrap.querySelector("#mh-life-psychiatrist-option-text");
    if (!span) return;
    const who = whoSel instanceof HTMLSelectElement ? whoSel.value.trim() : "";
    span.textContent = ` ${psychiatristOptionUiLabel(who)}`;
  }

  function syncHeredityDraftUi() {
    const who = whoSel instanceof HTMLSelectElement ? whoSel.value.trim() : "";
    fsSib.hidden = !needsSiblingDegree(who);
    repopulateSiblingDeg(who);
    syncHeredityLineRowOnly();
    updatePsychiatristDraftLabel();
  }

  whoSel.addEventListener("change", () => {
    syncHeredityDraftUi();
  });
  sibSel.addEventListener("change", () => {
    syncHeredityLineRowOnly();
  });
  yesBlock.querySelectorAll('input[name="mh-life-draft-line"]').forEach((el) => {
    el.addEventListener("change", () => syncHeredityLineRowOnly());
  });

  /** @param {HeredityCase} draft @returns {{ err: string | null; record: HeredityCase | null }} */
  function draftToCaseOrError(draft) {
    const err = validateHeredityDraft(draft);
    if (err) return { err, record: null };
    /** @type {HeredityCase} */
    const record = {
      who: draft.who,
      pathology: [...draft.pathology],
      pathologyOther: String(draft.pathologyOther ?? "").trim(),
    };
    if (needsSiblingDegree(draft.who) && draft.siblingDegree) record.siblingDegree = draft.siblingDegree;
    if (needsLine(draft.who, record.siblingDegree) && (draft.line === "maternal" || draft.line === "paternal")) record.line = draft.line;
    return { err: null, record };
  }

  /** @param {HeredityCase} draft */
  function isHeredityDraftEmpty(draft) {
    return (
      !String(draft.who ?? "").trim() &&
      !(Array.isArray(draft.pathology) && draft.pathology.length) &&
      !String(draft.pathologyOther ?? "").trim()
    );
  }

  btnAdd.addEventListener("click", () => {
    readLifeStructuredFromDom(contentEl, answers);
    const draft = readHeredityDraftFromDom(yesBlock);
    const { err, record } = draftToCaseOrError(draft);
    if (err || !record) {
      window.alert(err || "Не удалось сохранить.");
      return;
    }
    const st = parseLifeStructuredString(answers[LIFE_STRUCTURED_ID]);
    if (!Array.isArray(st.heredityCases)) st.heredityCases = [];
    st.heredityCases.push(record);
    st.heredityCloseDraft = false;
    answers[LIFE_STRUCTURED_ID] = JSON.stringify(st);
    renderLifeStructuredStep(contentEl, answers, qIndex, stepsLen, gender, nextWizardBtn);
  });

  btnFinish.addEventListener("click", () => {
    readLifeStructuredFromDom(contentEl, answers);
    const draft = readHeredityDraftFromDom(yesBlock);
    const { err, record } = draftToCaseOrError(draft);
    const st = parseLifeStructuredString(answers[LIFE_STRUCTURED_ID]);
    if (!Array.isArray(st.heredityCases)) st.heredityCases = [];

    if (record) {
      st.heredityCases.push(record);
    } else if (err && !isHeredityDraftEmpty(draft)) {
      window.alert(err);
      return;
    }

    st.heredityCloseDraft = true;
    answers[LIFE_STRUCTURED_ID] = JSON.stringify(st);
    renderLifeStructuredStep(contentEl, answers, qIndex, stepsLen, gender, nextWizardBtn);
  });

  function syncYesBlock() {
    readLifeStructuredFromDom(contentEl, answers);
    const st = parseLifeStructuredString(answers[LIFE_STRUCTURED_ID]);
    const sel = contentEl.querySelector('input[name="mh-life-heredity"]:checked');
    const yes = sel && sel.value === "yes";
    listPanel.hidden = !yes;
    yesBlock.hidden = !yes || (yes && st.heredityCloseDraft === true);
  }

  syncHeredityDraftUi();

  if (nextWizardBtn) nextWizardBtn.textContent = qIndex >= stepsLen - 1 ? "Завершить" : "Далее";
  if (isItogMode()) enhanceItogLifeStep(contentEl);
}

function mkCheck(id, label, checked) {
  const lab = document.createElement("label");
  lab.className = "mh-life-check";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.id = id;
  cb.checked = Boolean(checked);
  lab.appendChild(cb);
  lab.appendChild(document.createTextNode(` ${label}`));
  return lab;
}

/** @param {"male" | "female" | null} gender */
function uiEduNoneLabel(gender) {
  if (gender === "female") return "Не получала";
  if (gender === "male") return "Не получал";
  return "Не получал(а)";
}

/** @param {"male" | "female" | null} gender */
function uiEduDoneLabel(gender) {
  if (gender === "female") return "Закончила";
  if (gender === "male") return "Закончил";
  return "Закончил(а)";
}

/** @param {"male" | "female" | null} gender */
function uiEduUndoneLabel(gender) {
  if (gender === "female") return "Не закончила";
  if (gender === "male") return "Не закончил";
  return "Не закончил(а)";
}

function subEdu(title, prefix, state, gender) {
  const div = document.createElement("div");
  div.className = "mh-life-edu-block";
  const p = document.createElement("p");
  p.className = "mh-life-edu-section-title";
  p.textContent = title;
  div.appendChild(p);
  const done = prefix === "sec" ? state.eduSecDone : state.eduHiDone;
  const undone = prefix === "sec" ? state.eduSecUndone : state.eduHiUndone;
  const none = prefix === "sec" ? state.eduSecNone : state.eduHiNone;
  const spec = prefix === "sec" ? state.eduSecSpec : state.eduHiSpec;
  const name = `mh-life-edu-${prefix}`;
  div.appendChild(radioRowStatic(name, "none", uiEduNoneLabel(gender), none));
  div.appendChild(radioRowStatic(name, "done", uiEduDoneLabel(gender), done));
  div.appendChild(radioRowStatic(name, "undone", uiEduUndoneLabel(gender), undone));
  const sp = document.createElement("input");
  sp.type = "text";
  sp.className = "mh-life-text";
  sp.id = `mh-life-edu-${prefix}-spec`;
  sp.placeholder = "Специальность";
  sp.value = String(spec ?? "");
  div.appendChild(sp);
  return div;
}

function radioRowStatic(name, value, label, checked) {
  const lab = document.createElement("label");
  lab.className = "mh-life-radio";
  const inp = document.createElement("input");
  inp.type = "radio";
  inp.name = name;
  inp.value = value;
  inp.checked = Boolean(checked);
  lab.appendChild(inp);
  lab.appendChild(document.createTextNode(` ${label}`));
  return lab;
}

/** @param {HTMLElement} root @returns {ChildhoodVisit[]} */
function readChildhoodVisitsFromDom(root) {
  const ta = root.querySelector("#mh-life-childhood-visits-json");
  if (!(ta instanceof HTMLTextAreaElement)) return [];
  try {
    const parsed = JSON.parse(ta.value || "[]");
    return normalizeChildhoodVisits(parsed);
  } catch {
    return [];
  }
}

/**
 * @param {HTMLElement} contentEl
 * @param {Record<string, string>} answers
 */
export function readLifeStructuredFromDom(contentEl, answers) {
  const prev = parseLifeStructuredString(answers[LIFE_STRUCTURED_ID]);
  const s = emptyLifeStructuredState();
  const h = contentEl.querySelector('input[name="mh-life-heredity"]:checked');
  s.heredity = h && "value" in h ? h.value : "";

  const hj = contentEl.querySelector("#mh-life-heredity-cases-json");
  if (hj instanceof HTMLTextAreaElement || hj instanceof HTMLInputElement) {
    try {
      const parsed = JSON.parse(hj.value || "[]");
      if (Array.isArray(parsed)) s.heredityCases = parsed.map(normalizeHeredityCase).filter(Boolean);
    } catch {
      s.heredityCases = [];
    }
  }

  const b = contentEl.querySelector('input[name="mh-life-birth"]:checked');
  s.birthFamily = b && "value" in b ? b.value : "";
  s.birthOrder = valOf(contentEl, "#mh-life-birth-order");
  s.birthChildrenTotal = valOf(contentEl, "#mh-life-birth-total");
  const bt = contentEl.querySelector('input[name="mh-life-birth-term"]:checked');
  s.birthTerm = bt && "value" in bt ? bt.value : "";
  const bd = contentEl.querySelector('input[name="mh-life-birth-delivery"]:checked');
  s.birthDelivery = bd && "value" in bd ? bd.value : "";
  const bcourse = contentEl.querySelector('input[name="mh-life-birth-course"]:checked');
  s.birthCourse = bcourse && "value" in bcourse ? bcourse.value : "";
  s.birthCourseDetails = s.birthCourse === "complicated" ? valOf(contentEl, "#mh-life-birth-course-details") : "";
  const btr = contentEl.querySelector('input[name="mh-life-birth-trauma"]:checked');
  s.birthTrauma = btr && "value" in btr ? btr.value : "";
  s.birthTraumaDetails = s.birthTrauma === "yes" ? valOf(contentEl, "#mh-life-birth-trauma-details") : "";
  const dev = contentEl.querySelector('input[name="mh-life-dev-year"]:checked');
  s.devFirstYear = dev && "value" in dev ? dev.value : "";
  s.devFirstYearDelayDetails = s.devFirstYear === "delay" ? valOf(contentEl, "#mh-life-dev-year-delay-details") : "";

  const en = contentEl.querySelector('input[name="mh-life-enuresis"]:checked');
  s.enuresisAfter5 = en && "value" in en ? en.value : "";

  const pa = contentEl.querySelector('input[name="mh-life-parasomnia"]:checked');
  s.parasomnia = pa && "value" in pa ? pa.value : "";
  s.parasomniaNightFears = s.parasomnia === "yes" && chk(contentEl, "#mh-life-para-fears");
  s.parasomniaNightmares = s.parasomnia === "yes" && chk(contentEl, "#mh-life-para-nightmares");
  s.parasomniaSleepwalk = s.parasomnia === "yes" && chk(contentEl, "#mh-life-para-sleepwalk");
  s.parasomniaSleeptalk = s.parasomnia === "yes" && chk(contentEl, "#mh-life-para-sleeptalk");
  s.parasomniaOther = s.parasomnia === "yes" ? valOf(contentEl, "#mh-life-para-other") : "";

  const k = contentEl.querySelector('input[name="mh-life-kdg"]:checked');
  s.kindergartenAttend = k && "value" in k ? k.value : "";
  const ka = contentEl.querySelector('input[name="mh-life-kdg-adapt"]:checked');
  s.kindergartenAdapt = s.kindergartenAttend === "yes" && ka && "value" in ka ? ka.value : "";
  s.kindergartenAdaptDetails =
    s.kindergartenAttend === "yes" && s.kindergartenAdapt === "difficult" ? valOf(contentEl, "#mh-life-kdg-adapt-details") : "";
  s.childhoodCharacterUnknown = chk(contentEl, "#mh-life-child-character-unknown");
  s.childhoodCharacter = s.childhoodCharacterUnknown ? "" : valOf(contentEl, "#mh-life-child-character");

  const ch = contentEl.querySelector('input[name="mh-life-childhood"]:checked');
  s.childhoodSpecialists =
    ch instanceof HTMLInputElement && (ch.value === "yes" || ch.value === "no")
      ? ch.value
      : typeof prev.childhoodSpecialists === "string" && (prev.childhoodSpecialists === "yes" || prev.childhoodSpecialists === "no")
        ? prev.childhoodSpecialists
        : "";
  if (s.childhoodSpecialists === "yes") {
    s.childhoodVisits = readChildhoodVisitsFromDom(contentEl);
  } else if (s.childhoodSpecialists === "no") {
    s.childhoodVisits = [];
  } else {
    s.childhoodVisits = normalizeChildhoodVisits(prev.childhoodVisits);
  }
  if (s.childhoodSpecialists === "yes") {
    s.childhoodVisitsCloseDraft = prev.childhoodVisitsCloseDraft === true;
  } else {
    s.childhoodVisitsCloseDraft = false;
  }

  s.schoolStartAge = valOf(contentEl, "#mh-life-school-age");
  s.schoolTypeGeneral = chk(contentEl, "#mh-life-school-type-general");
  s.schoolTypeGymnasium = chk(contentEl, "#mh-life-school-type-gym");
  s.schoolTypeLyceum = chk(contentEl, "#mh-life-school-type-lyceum");
  s.schoolTypeCorrectional = chk(contentEl, "#mh-life-school-type-corr");
  s.schoolTypeCorrectionalDetails = s.schoolTypeCorrectional ? valOf(contentEl, "#mh-life-school-corr-details") : "";
  s.schoolTypeHome = chk(contentEl, "#mh-life-school-type-home");
  s.schoolTypeHomeFromClass = s.schoolTypeHome ? valOf(contentEl, "#mh-life-school-home-from") : "";
  s.schoolTypeHomeToClass = s.schoolTypeHome ? valOf(contentEl, "#mh-life-school-home-to") : "";
  s.schoolTypeHomeReason = s.schoolTypeHome ? valOf(contentEl, "#mh-life-school-home-reason") : "";
  s.schoolTypeUnknown = chk(contentEl, "#mh-life-school-type-unknown");

  const schCh = contentEl.querySelector('input[name="mh-life-school-change"]:checked');
  s.schoolChanged = schCh && "value" in schCh ? schCh.value : "";
  const schFreq = contentEl.querySelector('input[name="mh-life-school-change-freq"]:checked');
  s.schoolChangeFrequency = s.schoolChanged === "yes" && schFreq && "value" in schFreq ? schFreq.value : "";
  s.schoolChangeMove = s.schoolChanged === "yes" && chk(contentEl, "#mh-life-school-change-move");
  s.schoolChangeConflictsPeers = s.schoolChanged === "yes" && chk(contentEl, "#mh-life-school-change-conf-peers");
  s.schoolChangeConflictsTeachers = s.schoolChanged === "yes" && chk(contentEl, "#mh-life-school-change-conf-teachers");
  s.schoolChangePoorPerformance = s.schoolChanged === "yes" && chk(contentEl, "#mh-life-school-change-poor");
  s.schoolChangeProfile = s.schoolChanged === "yes" && chk(contentEl, "#mh-life-school-change-profile");
  s.schoolChangeStronger = s.schoolChanged === "yes" && chk(contentEl, "#mh-life-school-change-stronger");
  s.schoolChangeWeaker = s.schoolChanged === "yes" && chk(contentEl, "#mh-life-school-change-weaker");
  s.schoolChangeExpelled = s.schoolChanged === "yes" && chk(contentEl, "#mh-life-school-change-expelled");
  s.schoolChangeOther = s.schoolChanged === "yes" && chk(contentEl, "#mh-life-school-change-other");
  s.schoolChangeOtherText =
    s.schoolChanged === "yes" && s.schoolChangeOther ? valOf(contentEl, "#mh-life-school-change-other-text") : "";

  const sAdapt = contentEl.querySelector('input[name="mh-life-school-adapt"]:checked');
  s.schoolAdaptation = sAdapt && "value" in sAdapt ? sAdapt.value : "";
  s.schoolAdaptationDetails = s.schoolAdaptation === "yes" ? valOf(contentEl, "#mh-life-school-adapt-details") : "";

  s.schoolPerformance = valOf(contentEl, "#mh-life-school-perf");
  s.schoolPeerEasyFriends = chk(contentEl, "#mh-life-peer-easy");
  s.schoolPeerFewFriends = chk(contentEl, "#mh-life-peer-few");
  s.schoolPeerCommunicationDifficulties = chk(contentEl, "#mh-life-peer-diff");
  s.schoolPeerOutcast = chk(contentEl, "#mh-life-peer-outcast");
  s.schoolPeerBullied = chk(contentEl, "#mh-life-peer-bullied");
  s.schoolPeerAggression = chk(contentEl, "#mh-life-peer-aggr");
  s.schoolPeerNeutral = chk(contentEl, "#mh-life-peer-neutral");
  s.schoolTeacherEven = chk(contentEl, "#mh-life-teacher-even");
  s.schoolTeacherOneConflict = chk(contentEl, "#mh-life-teacher-one-conf");
  s.schoolTeacherManyConflicts = chk(contentEl, "#mh-life-teacher-many-conf");
  s.schoolTeacherFavorite = chk(contentEl, "#mh-life-teacher-fav");
  s.schoolTeacherCriticized = chk(contentEl, "#mh-life-teacher-crit");
  s.schoolTeacherNeutral = chk(contentEl, "#mh-life-teacher-neutral");
  const sf = contentEl.querySelector('input[name="mh-life-school-finished"]:checked');
  s.schoolFinished = sf && "value" in sf ? sf.value : "";
  const cl = valOf(contentEl, "#mh-life-school-classes");
  if (s.schoolFinished === "no" || cl === "") s.schoolClasses = null;
  else {
    const n = Number(cl);
    s.schoolClasses = Number.isFinite(n) && n >= 1 && n <= 11 ? n : null;
  }

  const ar = contentEl.querySelector('input[name="mh-life-army"]:checked');
  s.army = ar && "value" in ar ? ar.value : "";

  const eduAfter = contentEl.querySelector('input[name="mh-life-edu-after-school"]:checked');
  s.eduAfterSchool = eduAfter && "value" in eduAfter ? eduAfter.value : "";
  s.eduNoAfterSchool = s.eduAfterSchool === "no";
  const sec = contentEl.querySelector('input[name="mh-life-edu-sec"]:checked');
  s.eduSecNone = s.eduAfterSchool === "yes" && sec?.value === "none";
  s.eduSecDone = s.eduAfterSchool === "yes" && sec?.value === "done";
  s.eduSecUndone = s.eduAfterSchool === "yes" && sec?.value === "undone";
  s.eduSecSpec = s.eduAfterSchool === "yes" && !s.eduSecNone ? valOf(contentEl, "#mh-life-edu-sec-spec") : "";

  const hi = contentEl.querySelector('input[name="mh-life-edu-hi"]:checked');
  s.eduHiNone = s.eduAfterSchool === "yes" && hi?.value === "none";
  s.eduHiDone = s.eduAfterSchool === "yes" && hi?.value === "done";
  s.eduHiUndone = s.eduAfterSchool === "yes" && hi?.value === "undone";
  s.eduHiSpec = s.eduAfterSchool === "yes" && !s.eduHiNone ? valOf(contentEl, "#mh-life-edu-hi-spec") : "";

  const wnow = contentEl.querySelector('input[name="mh-life-soc-work-now"]:checked');
  s.socWorkNow = wnow && "value" in wnow ? /** @type {"" | "yes" | "no"} */ (wnow.value) : "";
  s.socWorkPosition = s.socWorkNow === "yes" ? valOf(contentEl, "#mh-life-soc-work-position") : "";
  s.socWorkPastPositions = valOf(contentEl, "#mh-life-soc-work-past");

  const socMaritalRad = contentEl.querySelector('input[name="mh-life-soc-marital"]:checked');
  s.socMarital =
    socMaritalRad && "value" in socMaritalRad
      ? /** @type {"" | "in_relationship" | "not_in_relationship" | "cohabitation" | "married" | "divorced" | "widowed"} */ (
          socMaritalRad.value
        )
      : "";
  if (s.socMarital === "divorced" || s.socMarital === "widowed") {
    s.socMarriagesCount = valOf(contentEl, "#mh-life-soc-marriages-count");
  } else s.socMarriagesCount = "";

  const sch = contentEl.querySelector('input[name="mh-life-soc-children"]:checked');
  s.socChildren = sch && "value" in sch ? /** @type {"" | "yes" | "no"} */ (sch.value) : "";
  if (s.socChildren === "yes") {
    s.socChildrenTotal = valOf(contentEl, "#mh-life-soc-children-total");
    s.socChildrenCurrent = valOf(contentEl, "#mh-life-soc-children-current");
    s.socChildrenPrevious = valOf(contentEl, "#mh-life-soc-children-prev");
  } else {
    s.socChildrenTotal = "";
    s.socChildrenCurrent = "";
    s.socChildrenPrevious = "";
  }

  const lv = contentEl.querySelector('input[name="mh-life-soc-live"]:checked');
  s.socLivingWith =
    lv && "value" in lv
      ? /** @type {"" | "alone" | "family" | "relatives" | "roommates" | "other"} */ (lv.value)
      : "";
  s.socLivingOther = s.socLivingWith === "other" ? valOf(contentEl, "#mh-life-soc-live-other") : "";

  const hh = contentEl.querySelector('input[name="mh-life-soc-house"]:checked');
  s.socHousing =
    hh && "value" in hh
      ? /** @type {"" | "own_apt" | "house" | "rent" | "relatives_provided" | "service" | "other"} */ (hh.value)
      : "";
  s.socHousingOther = s.socHousing === "other" ? valOf(contentEl, "#mh-life-soc-house-other") : "";

  /** @type {string[]} */
  const s2dis = [];
  if (chk(contentEl, "#mh-life-s2-a-meningitis")) s2dis.push("a_meningitis");
  if (chk(contentEl, "#mh-life-s2-a-encephalitis")) s2dis.push("a_encephalitis");
  if (chk(contentEl, "#mh-life-s2-a-neurosyphilis")) s2dis.push("a_neurosyphilis");
  if (chk(contentEl, "#mh-life-s2-a-hiv")) s2dis.push("a_hiv");
  if (chk(contentEl, "#mh-life-s2-a-toxo")) s2dis.push("a_toxoplasmosis_cns");
  if (chk(contentEl, "#mh-life-s2-a-lyme")) s2dis.push("a_lyme");
  if (chk(contentEl, "#mh-life-s2-a-covid")) s2dis.push("a_covid_long");
  if (chk(contentEl, "#mh-life-s2-b-sle")) s2dis.push("b_sle_cns");
  if (chk(contentEl, "#mh-life-s2-b-ms")) s2dis.push("b_ms");
  if (chk(contentEl, "#mh-life-s2-b-nmda")) s2dis.push("b_anti_nmda");
  if (chk(contentEl, "#mh-life-s2-b-hashimoto")) s2dis.push("b_hashimoto_encephalopathy");
  if (chk(contentEl, "#mh-life-s2-v-hypo")) s2dis.push("v_hypothyroidism");
  if (chk(contentEl, "#mh-life-s2-v-hyper")) s2dis.push("v_thyrotoxicosis");
  if (chk(contentEl, "#mh-life-s2-v-diabetes")) s2dis.push("v_diabetes");
  if (chk(contentEl, "#mh-life-s2-v-parathy")) s2dis.push("v_hyperparathyroidism");
  if (chk(contentEl, "#mh-life-s2-v-cushing")) s2dis.push("v_cushing");
  if (chk(contentEl, "#mh-life-s2-g-ra")) s2dis.push("g_ra");
  if (chk(contentEl, "#mh-life-s2-g-fibro")) s2dis.push("g_fibromyalgia");
  if (chk(contentEl, "#mh-life-s2-g-copd")) s2dis.push("g_copd");
  if (chk(contentEl, "#mh-life-s2-g-heart")) s2dis.push("g_hf_ihd");
  if (chk(contentEl, "#mh-life-s2-g-hep")) s2dis.push("g_hepatitis_cirrhosis");
  if (chk(contentEl, "#mh-life-s2-d-b12")) s2dis.push("d_b12_deficit");
  if (chk(contentEl, "#mh-life-s2-d-dvit")) s2dis.push("d_d_deficit");
  if (chk(contentEl, "#mh-life-s2-d-iron")) s2dis.push("d_iron_def_anemia");
  if (chk(contentEl, "#mh-life-s2-d-folate")) s2dis.push("d_folate_deficit");
  if (chk(contentEl, "#mh-life-s2-d-celiac")) s2dis.push("d_celiac_untreated");
  if (chk(contentEl, "#mh-life-s2-e-other")) s2dis.push("e_other");
  s.section2Diseases = s2dis;
  s.section2OtherDisease = s2dis.includes("e_other") ? valOf(contentEl, "#mh-life-s2-other-text") : "";

  const hasS2 = s2dis.length > 0;
  s.section2PsychNone = hasS2 && chk(contentEl, "#mh-life-s2-psych-none");
  /** @type {string[]} */
  const s2psy = [];
  if (hasS2 && !s.section2PsychNone) {
    if (chk(contentEl, "#mh-life-s2-psych-mood")) s2psy.push("mood_change");
    if (chk(contentEl, "#mh-life-s2-psych-anxiety")) s2psy.push("anxiety_panic");
    if (chk(contentEl, "#mh-life-s2-psych-hall")) s2psy.push("hallucinations_delusions");
    if (chk(contentEl, "#mh-life-s2-psych-conf")) s2psy.push("confusion");
    if (chk(contentEl, "#mh-life-s2-psych-memory")) s2psy.push("memory_attention_decline");
  }
  s.section2PsychSymptoms = s2psy;

  const oph = contentEl.querySelector('input[name="mh-life-op-had"]:checked');
  s.operationsHad = oph && "value" in oph ? oph.value : "";
  if (s.operationsHad === "yes") {
    /** @type {OperationEntry[]} */
    const ops = [];
    contentEl.querySelectorAll(".mh-life-op-name").forEach((el, idx) => {
      if (!(el instanceof HTMLInputElement)) return;
      const name = el.value.trim();
      const ageEl = contentEl.querySelectorAll(".mh-life-op-age")[idx];
      const age = ageEl instanceof HTMLInputElement ? ageEl.value.trim() : "";
      const ageUnknownEl = contentEl.querySelectorAll(".mh-life-op-age-unknown")[idx];
      const ageUnknown = ageUnknownEl instanceof HTMLInputElement ? ageUnknownEl.checked : false;
      const anEl = contentEl.querySelector(`input[name="mh-life-op-an-${idx}"]:checked`);
      const anesthesia = anEl instanceof HTMLInputElement ? anEl.value : "";
      ops.push({ name, age: ageUnknown ? "" : age, ageUnknown, anesthesia });
    });
    s.operationsList = ops;
  } else s.operationsList = [];

  const synh = contentEl.querySelector('input[name="mh-life-sync-had"]:checked');
  s.syncopeNoTbiHad = synh && "value" in synh ? synh.value : "";
  if (s.syncopeNoTbiHad === "yes") {
    /** @type {SyncopeEntry[]} */
    const arr = [];
    contentEl.querySelectorAll(".mh-life-sync-age").forEach((el, idx) => {
      if (!(el instanceof HTMLInputElement)) return;
      const age = el.value.trim();
      const ageUnknownEl = contentEl.querySelectorAll(".mh-life-sync-age-unknown")[idx];
      const ageUnknown = ageUnknownEl instanceof HTMLInputElement ? ageUnknownEl.checked : false;
      const causeEl = contentEl.querySelectorAll(".mh-life-sync-cause")[idx];
      const cause = causeEl instanceof HTMLInputElement ? causeEl.value.trim() : "";
      arr.push({ age: ageUnknown ? "" : age, ageUnknown, cause });
    });
    s.syncopeNoTbiList = arr;
  } else s.syncopeNoTbiList = [];

  const tbih = contentEl.querySelector('input[name="mh-life-tbi-had"]:checked');
  s.tbiWithLossHad = tbih && "value" in tbih ? tbih.value : "";
  if (s.tbiWithLossHad === "yes") {
    /** @type {TbiEntry[]} */
    const arr = [];
    contentEl.querySelectorAll(".mh-life-tbi-age").forEach((el, idx) => {
      if (!(el instanceof HTMLInputElement)) return;
      const age = el.value.trim();
      const ageUnknownEl = contentEl.querySelectorAll(".mh-life-tbi-age-unknown")[idx];
      const ageUnknown = ageUnknownEl instanceof HTMLInputElement ? ageUnknownEl.checked : false;
      const cEl = contentEl.querySelectorAll(".mh-life-tbi-circ")[idx];
      const dEl = contentEl.querySelectorAll(".mh-life-tbi-dur")[idx];
      const eEl = contentEl.querySelectorAll(".mh-life-tbi-exam")[idx];
      arr.push({
        age: ageUnknown ? "" : age,
        ageUnknown,
        circumstance: cEl instanceof HTMLSelectElement ? cEl.value : "",
        lossDuration: dEl instanceof HTMLSelectElement ? dEl.value : "",
        exam: eEl instanceof HTMLSelectElement ? eEl.value : "",
      });
    });
    s.tbiWithLossList = arr;
  } else s.tbiWithLossList = [];

  const epi = contentEl.querySelector('input[name="mh-life-epi-status"]:checked');
  s.epilepsyStatus = epi && "value" in epi ? epi.value : "";
  const epiFirst = contentEl.querySelector('input[name="mh-life-epi-first"]:checked');
  s.epilepsyFirstSeizureType = s.epilepsyStatus === "yes" && epiFirst && "value" in epiFirst ? epiFirst.value : "";
  s.epilepsyFirstSeizureAge =
    s.epilepsyStatus === "yes" && s.epilepsyFirstSeizureType === "age" ? valOf(contentEl, "#mh-life-epi-first-age") : "";
  const epiM = contentEl.querySelector('input[name="mh-life-epi-meds"]:checked');
  s.epilepsyMedsStatus = s.epilepsyStatus === "yes" && epiM && "value" in epiM ? epiM.value : "";
  /** @type {string[]} */
  const epiMeds = [];
  if (s.epilepsyStatus === "yes" && s.epilepsyMedsStatus === "yes") {
    contentEl.querySelectorAll('[id^="mh-life-epi-med-"]').forEach((el) => {
      if (el instanceof HTMLInputElement && el.checked) {
        const t = el.parentElement?.textContent?.trim() ?? "";
        if (t) epiMeds.push(t);
      }
    });
  }
  s.epilepsyMeds = epiMeds;

  const chh = contentEl.querySelector('input[name="mh-life-chronic-had"]:checked');
  s.chronicHad = chh && "value" in chh ? chh.value : "";
  s.chronicDiseasesText = s.chronicHad === "yes" ? valOf(contentEl, "#mh-life-chronic-diseases") : "";
  const chm = contentEl.querySelector('input[name="mh-life-chronic-meds"]:checked');
  s.chronicMedsRegular = s.chronicHad === "yes" && chm && "value" in chm ? chm.value : "";
  s.chronicMedsText = s.chronicHad === "yes" && s.chronicMedsRegular === "yes" ? valOf(contentEl, "#mh-life-chronic-meds-text") : "";

  const alh = contentEl.querySelector('input[name="mh-life-allergy-had"]:checked');
  s.allergyHad = alh && "value" in alh ? alh.value : "";
  if (s.allergyHad === "yes") {
    /** @type {AllergyEntry[]} */
    const arr = [];
    contentEl.querySelectorAll(".mh-life-allergy-trigger").forEach((el, idx) => {
      if (!(el instanceof HTMLInputElement)) return;
      const trigger = el.value.trim();
      const reactions = [];
      contentEl.querySelectorAll(`[id^="mh-life-allergy-r-${idx}-"]`).forEach((r) => {
        if (r instanceof HTMLInputElement && r.checked) {
          const t = r.parentElement?.textContent?.trim() ?? "";
          if (t) reactions.push(t);
        }
      });
      arr.push({ trigger, reactions });
    });
    s.allergyList = arr;
  } else s.allergyList = [];

  const sm = contentEl.querySelector('input[name="mh-life-smoking"]:checked');
  s.smokingStatus = sm && "value" in sm ? sm.value : "";
  s.smokingPastYears = s.smokingStatus === "past" ? valOf(contentEl, "#mh-life-smoking-past-years") : "";
  s.smokingCurrentYears = s.smokingStatus === "yes" ? valOf(contentEl, "#mh-life-smoking-years") : "";
  s.smokingCurrentCigs = s.smokingStatus === "yes" ? valOf(contentEl, "#mh-life-smoking-cigs") : "";
  const smv = contentEl.querySelector('input[name="mh-life-smoking-vape"]:checked');
  s.smokingUsesVape = s.smokingStatus === "yes" && smv && "value" in smv ? smv.value : "";

  const alc = contentEl.querySelector('input[name="mh-life-alcohol"]:checked');
  s.alcoholStatus = alc && "value" in alc ? alc.value : "";
  s.alcoholRareDrink = s.alcoholStatus === "rare" ? valOf(contentEl, "#mh-life-alcohol-rare-drink") : "";
  s.alcoholRareAmount = s.alcoholStatus === "rare" ? valOf(contentEl, "#mh-life-alcohol-rare-amount") : "";
  s.alcoholRegularPref = s.alcoholStatus === "regular" ? valOf(contentEl, "#mh-life-alcohol-reg-pref") : "";
  s.alcoholRegularAmount = s.alcoholStatus === "regular" ? valOf(contentEl, "#mh-life-alcohol-reg-amount") : "";
  s.alcoholRegularConsequencesHangover = s.alcoholStatus === "regular" && chk(contentEl, "#mh-life-alcohol-conseq-hangover");
  s.alcoholRegularConsequencesMemoryBlackouts =
    s.alcoholStatus === "regular" && chk(contentEl, "#mh-life-alcohol-conseq-memory");
  s.alcoholRegularConsequencesConflicts = s.alcoholStatus === "regular" && chk(contentEl, "#mh-life-alcohol-conseq-conflicts");
  s.alcoholRegularConsequencesLaw = s.alcoholStatus === "regular" && chk(contentEl, "#mh-life-alcohol-conseq-law");
  s.alcoholRegularConsequencesNarcologist = s.alcoholStatus === "regular" && chk(contentEl, "#mh-life-alcohol-conseq-narc");

  const pavh = contentEl.querySelector('input[name="mh-life-pav-had"]:checked');
  s.pavHad = pavh && "value" in pavh ? pavh.value : "";
  if (s.pavHad === "yes") {
    /** @type {string[]} */
    const groups = [];
    [
      "Опиаты и опиоиды",
      "Каннабиноиды",
      "Психостимуляторы",
      "Галлюциногены",
      "Снотворно-седативные средства",
      "Синтетические наркотики",
    ].forEach((label, idx) => {
      if (chk(contentEl, `#mh-life-pav-group-${idx}`)) groups.push(label);
    });
    s.pavGroupsUnknown = chk(contentEl, "#mh-life-pav-group-unknown");
    s.pavGroups = groups;
    s.pavExperience = valOf(contentEl, "#mh-life-pav-experience");
    s.pavLastUse = valOf(contentEl, "#mh-life-pav-last");
    s.pavFrequency = valOf(contentEl, "#mh-life-pav-freq");
    s.pavTreatment = valOf(contentEl, "#mh-life-pav-treatment");
    s.pavList = [];
  } else {
    s.pavGroups = [];
    s.pavGroupsUnknown = false;
    s.pavExperience = "";
    s.pavLastUse = "";
    s.pavFrequency = "";
    s.pavTreatment = "";
    s.pavList = [];
  }

  if (s.heredity === "yes") {
    s.heredityCloseDraft = prev.heredityCloseDraft === true;
  } else {
    s.heredityCloseDraft = false;
  }

  answers[LIFE_STRUCTURED_ID] = JSON.stringify(s);
}

function valOf(root, sel) {
  const el = root.querySelector(sel);
  return el instanceof HTMLInputElement || el instanceof HTMLSelectElement ? el.value : "";
}

function chk(root, sel) {
  const el = root.querySelector(sel);
  return el instanceof HTMLInputElement && el.checked;
}
