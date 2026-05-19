import { PSYCH_SPEC_CODES } from "./mental-help-disease-episodes.js";
import {
  createDrugChipPicker,
  createEarlySymptomsChipPicker,
  createSomaticSpecialtyChipPicker,
  createStressorsChipPicker,
} from "./mental-help-disease-pickers.js";
import { normalizeStressorsList } from "./mental-help-disease-stressors-data.js";

const MONTH_NAMES_RU = ["", "январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

function defaultEpisodeMed() {
  return { drugId: "", maxDose: "", doseUnknown: false, durationMode: "", durationMonths: "", effect: "" };
}

/**
 * @param {HTMLElement} wrap
 * @param {Record<string, unknown>} ep
 * @param {number} ei
 * @param {number} totalCount
 * @param {(name: string, value: string, label: string, checked: boolean) => HTMLElement} radioRow
 * @param {() => Record<string, unknown>} readStateFromDom
 * @param {(st: Record<string, unknown>, focus?: { episodeIdx?: number }) => void} reflowEpisodes
 * @param {(title: string) => HTMLElement} fieldset
 */
export function appendDiseaseEpisodeBlock(wrap, ep, ei, totalCount, radioRow, readStateFromDom, reflowEpisodes, fieldset) {
  const id = `mh-dis-ep-${ei}`;
  const isFirst = ei === 0;
  const isLast = ei === totalCount - 1;
  wrap.className = "mh-dis-episode mh-life-fieldset mh-dis-timeline-event";
  wrap.dataset.episodeIdx = String(ei);

  const title = document.createElement("h3");
  title.className = "mh-block-subtitle";
  title.textContent = isFirst ? `Эпизод ${ei + 1} — дебют` : isLast && String(ep.durationEndMode ?? "") === "current" ? `Эпизод ${ei + 1} — текущее` : `Эпизод ${ei + 1} — повторное ухудшение`;
  wrap.appendChild(title);
  const fs1 = fieldset(isFirst ? "1. Первые симптомы и длительность эпизода" : "1. Начало и длительность эпизода");
  const q1Hint = document.createElement("p");
  q1Hint.className = "mh-prompt";
  q1Hint.textContent = "Укажите месяц и год начала симптомов или отметьте «Не помню».";
  fs1.appendChild(q1Hint);
  fs1.appendChild(radioRow(`${id}-start`, "monthYear", "Укажите месяц и год", String(ep.startMode ?? "") === "monthYear" || String(ep.startMode ?? "") === "age"));
  fs1.appendChild(radioRow(`${id}-start`, "unknown", "Не помню", String(ep.startMode ?? "") === "unknown"));
  const debutWrap = document.createElement("div");
  debutWrap.className = "mh-life-custom-wrap";
  const rowMy = document.createElement("div");
  rowMy.className = "mh-life-row";
  rowMy.appendChild(document.createTextNode("Месяц: "));
  const selM = document.createElement("select");
  selM.id = `${id}-start-month`;
  selM.className = "mh-life-select";
  const o0 = document.createElement("option");
  o0.value = "";
  o0.textContent = "—";
  selM.appendChild(o0);
  for (let m = 1; m <= 12; m += 1) {
    const o = document.createElement("option");
    o.value = String(m);
    o.textContent = MONTH_NAMES_RU[m];
    if (String(ep.startMonth ?? "") === String(m)) o.selected = true;
    selM.appendChild(o);
  }
  rowMy.appendChild(selM);
  rowMy.appendChild(document.createTextNode(" Год: "));
  const selY = document.createElement("select");
  selY.id = `${id}-start-year`;
  selY.className = "mh-life-select";
  const oy0 = document.createElement("option");
  oy0.value = "";
  oy0.textContent = "—";
  selY.appendChild(oy0);
  const yNow = new Date().getFullYear();
  for (let y = yNow; y >= 1950; y -= 1) {
    const o = document.createElement("option");
    o.value = String(y);
    o.textContent = String(y);
    if (String(ep.startYear ?? "") === String(y)) o.selected = true;
    selY.appendChild(o);
  }
  rowMy.appendChild(selY);
  debutWrap.appendChild(rowMy);
  fs1.appendChild(debutWrap);
  function syncDebut() {
    const r = fs1.querySelector(`input[name="${id}-start"]:checked`);
    const v = r instanceof HTMLInputElement ? r.value : "";
    rowMy.hidden = v !== "monthYear";
  }
  fs1.querySelectorAll(`input[name="${id}-start"]`).forEach((el) => el.addEventListener("change", syncDebut));
  syncDebut();

  const durHint = document.createElement("p");
  durHint.className = "mh-prompt";
  durHint.textContent = "Как долго длилось состояние:";
  fs1.appendChild(durHint);
  fs1.appendChild(radioRow(`${id}-dur`, "monthYear", "До месяца и года", String(ep.durationEndMode ?? "") === "monthYear"));
  fs1.appendChild(radioRow(`${id}-dur`, "current", "До текущего момента", String(ep.durationEndMode ?? "") === "current"));
  fs1.appendChild(radioRow(`${id}-dur`, "unknown", "Не помню", String(ep.durationEndMode ?? "") === "unknown"));
  const durWrap = document.createElement("div");
  durWrap.className = "mh-life-custom-wrap";
  const durRow = document.createElement("div");
  durRow.className = "mh-life-row";
  durRow.appendChild(document.createTextNode("Месяц: "));
  const selDm = document.createElement("select");
  selDm.id = `${id}-dur-month`;
  selDm.className = "mh-life-select";
  const od0 = document.createElement("option");
  od0.value = "";
  od0.textContent = "—";
  selDm.appendChild(od0);
  for (let m = 1; m <= 12; m += 1) {
    const o = document.createElement("option");
    o.value = String(m);
    o.textContent = MONTH_NAMES_RU[m];
    if (String(ep.durationEndMonth ?? "") === String(m)) o.selected = true;
    selDm.appendChild(o);
  }
  durRow.appendChild(selDm);
  durRow.appendChild(document.createTextNode(" Год: "));
  const selDy = document.createElement("select");
  selDy.id = `${id}-dur-year`;
  selDy.className = "mh-life-select";
  const ody0 = document.createElement("option");
  ody0.value = "";
  ody0.textContent = "—";
  selDy.appendChild(ody0);
  for (let y = new Date().getFullYear(); y >= 1950; y -= 1) {
    const o = document.createElement("option");
    o.value = String(y);
    o.textContent = String(y);
    if (String(ep.durationEndYear ?? "") === String(y)) o.selected = true;
    selDy.appendChild(o);
  }
  durRow.appendChild(selDy);
  durWrap.appendChild(durRow);
  fs1.appendChild(durWrap);
  function syncDur() {
    const r = fs1.querySelector(`input[name="${id}-dur"]:checked`);
    const v = r instanceof HTMLInputElement ? r.value : "";
    durRow.hidden = v !== "monthYear";
  }
  fs1.querySelectorAll(`input[name="${id}-dur"]`).forEach((el) => el.addEventListener("change", syncDur));
  syncDur();
  wrap.appendChild(fs1);

  const fs2 = fieldset("2. Как началось");
  fs2.appendChild(radioRow(`${id}-onset`, "gradual", "Постепенно", String(ep.onset ?? "") === "gradual"));
  fs2.appendChild(radioRow(`${id}-onset`, "acute", "Остро", String(ep.onset ?? "") === "acute"));
  fs2.appendChild(radioRow(`${id}-onset`, "unknown", "Не помню", String(ep.onset ?? "") === "unknown"));
  wrap.appendChild(fs2);

  const fs3 = fieldset("3. Что беспокоило");
  const earlyHint = document.createElement("p");
  earlyHint.className = "mh-prompt";
  earlyHint.textContent =
    "Введите текст — появится список подходящих вариантов. Выберите пункт или нажмите Enter; выбранное отображается блоками, их можно удалить.";
  fs3.appendChild(earlyHint);

  /** @type {string[]} */
  const earlySelected = String(ep.earlySymptoms ?? "")
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);
  const earlyPicker = createEarlySymptomsChipPicker(earlySelected, `${id}-early`);
  fs3.appendChild(earlyPicker.root);
  wrap.appendChild(fs3);

  const fs4 = fieldset("Вопрос 4. Что происходило в жизни незадолго до начала или перед ухудшением?");
  const stressHint = document.createElement("p");
  stressHint.className = "mh-prompt";
  stressHint.textContent =
    "Введите текст — появится список подходящих вариантов. Выберите пункт или нажмите Enter; выбранное отображается блоками, их можно удалить.";
  fs4.appendChild(stressHint);

  const stressLabelsInit = normalizeStressorsList(ep.stressors);

  const illWrap = document.createElement("div");
  illWrap.className = "mh-life-row mh-dis-stress-detail-wrap";
  illWrap.id = `${id}-illness-detail-wrap`;
  illWrap.hidden = !stressLabelsInit.includes("Физическая болезнь");
  illWrap.appendChild(document.createTextNode("Название болезни (со слов пациента): "));
  const illInp = document.createElement("input");
  illInp.type = "text";
  illInp.id = `${id}-illness-detail`;
  illInp.className = "mh-life-text";
  illInp.value = String(ep.stressorsIllnessDetail ?? "");
  illWrap.appendChild(illInp);

  const trWrap = document.createElement("div");
  trWrap.className = "mh-life-row mh-dis-stress-detail-wrap";
  trWrap.id = `${id}-trauma-detail-wrap`;
  trWrap.hidden = !stressLabelsInit.includes("Травма");
  trWrap.appendChild(document.createTextNode("Характер травмы (со слов пациента): "));
  const trInp = document.createElement("input");
  trInp.type = "text";
  trInp.id = `${id}-trauma-detail`;
  trInp.className = "mh-life-text";
  trInp.value = String(ep.stressorsTraumaDetail ?? "");
  trWrap.appendChild(trInp);

  const stressPicker = createStressorsChipPicker(stressLabelsInit, () => {
    const labels = stressPicker.getSelected();
    illWrap.hidden = !labels.includes("Физическая болезнь");
    trWrap.hidden = !labels.includes("Травма");
    if (!labels.includes("Физическая болезнь")) illInp.value = "";
    if (!labels.includes("Травма")) trInp.value = "";
  }, `${id}-stressors`);
  fs4.appendChild(stressPicker.root);
  fs4.appendChild(illWrap);
  fs4.appendChild(trWrap);
  illWrap.hidden = !stressLabelsInit.includes("Физическая болезнь");
  trWrap.hidden = !stressLabelsInit.includes("Травма");
  wrap.appendChild(fs4);

  const fs5 = fieldset("5. Обращение к врачам соматического профиля");
  fs5.appendChild(radioRow(`${id}-somatic`, "yes", "Да", String(ep.somaticConsult ?? "") === "yes"));
  fs5.appendChild(radioRow(`${id}-somatic`, "no", "Нет", String(ep.somaticConsult ?? "") === "no"));
  fs5.appendChild(radioRow(`${id}-somatic`, "unknown", "Не помню", String(ep.somaticConsult ?? "") === "unknown"));

  const somaticDetail = document.createElement("div");
  somaticDetail.id = `${id}-somatic-detail`;
  somaticDetail.className = "mh-life-early-sub";

  const somHint = document.createElement("p");
  somHint.className = "mh-prompt";
  somHint.textContent =
    "Укажите специальности врачей (введите текст — появятся подсказки). Можно выбрать несколько.";
  somaticDetail.appendChild(somHint);

  const somSpecsInit = Array.isArray(Array.isArray(ep.somaticSpecialists) ? ep.somaticSpecialists : []) ? Array.isArray(ep.somaticSpecialists) ? ep.somaticSpecialists : [] : [];
  const somSpecPicker = createSomaticSpecialtyChipPicker(somSpecsInit, `${id}-somatic-specs`);
  somaticDetail.appendChild(somSpecPicker.root);

  const freqP = document.createElement("p");
  freqP.className = "mh-prompt";
  freqP.textContent = "Сколько раз обращались?";
  somaticDetail.appendChild(freqP);
  somaticDetail.appendChild(radioRow(`${id}-somatic-freq`, "once", "Один раз", String(ep.somaticFrequency ?? "") === "once"));
  somaticDetail.appendChild(radioRow(`${id}-somatic-freq`, "several", "Несколько раз", String(ep.somaticFrequency ?? "") === "several"));
  somaticDetail.appendChild(radioRow(`${id}-somatic-freq`, "many", "Многократно", String(ep.somaticFrequency ?? "") === "many"));

  const findP = document.createElement("p");
  findP.className = "mh-prompt";
  findP.textContent = "Результат обследования:";
  somaticDetail.appendChild(findP);
  somaticDetail.appendChild(
    radioRow(`${id}-somatic-find`, "none_found", "Соматической патологии не выявлено", String(ep.somaticFinding ?? "") === "none_found"),
  );
  somaticDetail.appendChild(
    radioRow(`${id}-somatic-find`, "found", "Была выявлена соматическая патология", String(ep.somaticFinding ?? "") === "found"),
  );

  const treatWrap = document.createElement("div");
  treatWrap.id = `${id}-somatic-treat-wrap`;
  treatWrap.className = "mh-life-early-sub";
  const treatP = document.createElement("p");
  treatP.className = "mh-prompt";
  treatP.textContent = "Лечение:";
  treatWrap.appendChild(treatP);
  const st = String(ep.somaticTreatment ?? "");
  const isPrescribed = st === "better" || st === "no_effect" || st === "partial";
  treatWrap.appendChild(
    radioRow(`${id}-somatic-treat-top`, "prescribed", "Назначено лечение", isPrescribed),
  );
  const prescribedSub = document.createElement("div");
  prescribedSub.id = `${id}-somatic-treat-prescribed-sub`;
  prescribedSub.className = "mh-life-early-sub mh-dis-nested-radios";
  prescribedSub.appendChild(radioRow(`${id}-somatic-treat-sub`, "better", "стало лучше", st === "better"));
  prescribedSub.appendChild(
    radioRow(`${id}-somatic-treat-sub`, "no_effect", "улучшение не наступило", st === "no_effect"),
  );
  prescribedSub.appendChild(radioRow(`${id}-somatic-treat-sub`, "partial", "частичное улучшение", st === "partial"));
  treatWrap.appendChild(prescribedSub);
  treatWrap.appendChild(
    radioRow(`${id}-somatic-treat-top`, "not_prescribed", "Лечение не назначено", st === "not_prescribed"),
  );
  treatWrap.appendChild(
    radioRow(`${id}-somatic-treat-top`, "not_taken", "Лечение не принимал(а)", st === "not_taken"),
  );
  somaticDetail.appendChild(treatWrap);

  fs5.appendChild(somaticDetail);

  function syncSomaticDetail() {
    const r = fs5.querySelector(`input[name="${id}-somatic"]:checked`);
    const v = r instanceof HTMLInputElement ? r.value : "";
    somaticDetail.hidden = v !== "yes";
    const fr = fs5.querySelector(`input[name="${id}-somatic-find"]:checked`);
    const fv = fr instanceof HTMLInputElement ? fr.value : "";
    treatWrap.hidden = fv !== "found";
    const trTop = fs5.querySelector(`input[name="${id}-somatic-treat-top"]:checked`);
    const trv = trTop instanceof HTMLInputElement ? trTop.value : "";
    const subEl = fs5.querySelector(`#${id}-somatic-treat-prescribed-sub`);
    if (subEl) subEl.hidden = trv !== "prescribed";
  }
  fs5.querySelectorAll(`input[name="${id}-somatic"]`).forEach((el) => el.addEventListener("change", syncSomaticDetail));
  fs5.querySelectorAll(`input[name="${id}-somatic-find"]`).forEach((el) => el.addEventListener("change", syncSomaticDetail));
  fs5.querySelectorAll(`input[name="${id}-somatic-treat-top"]`).forEach((el) => el.addEventListener("change", syncSomaticDetail));
  syncSomaticDetail();
  wrap.appendChild(fs5);

  const fs6 = fieldset("6. Специалисты и медикаментозное лечение за эпизод");
  const specP = document.createElement("p");
  specP.className = "mh-prompt";
  specP.textContent = "К каким специалистам обращались (можно несколько):";
  fs6.appendChild(specP);
  const psychSel = new Set(Array.isArray(ep.psychSpecialists) ? ep.psychSpecialists : []);
  for (const [code, lab] of PSYCH_SPEC_CODES) {
    const labEl = document.createElement("label");
    labEl.className = "mh-life-check";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "mh-dis-ep-psych-check";
    cb.dataset.ep = String(ei);
    cb.value = code;
    cb.checked = psychSel.has(code);
    labEl.appendChild(cb);
    labEl.appendChild(document.createTextNode(` ${lab}`));
    fs6.appendChild(labEl);
  }
  const rxIntro = document.createElement("p");
  rxIntro.className = "mh-prompt";
  rxIntro.textContent =
    "Назначалось ли медикаментозное лечение психотропными препаратами (антидепрессанты, транквилизаторы, нормотимики, нейролептики)?";
  fs6.appendChild(rxIntro);
  const mpVal = String(ep.medsPrescribed ?? "");
  fs6.appendChild(radioRow(`${id}-rx`, "yes", "Да", mpVal === "yes"));
  fs6.appendChild(radioRow(`${id}-rx`, "no", "Нет", mpVal === "no"));
  const medsWrap = document.createElement("div");
  medsWrap.className = "mh-life-early-sub";
  medsWrap.hidden = mpVal !== "yes";
  const medLines =
    mpVal === "yes" && Array.isArray(ep.episodeMeds) && ep.episodeMeds.length
      ? ep.episodeMeds
      : mpVal === "yes"
        ? [defaultEpisodeMed()]
        : [];
  medLines.forEach((med, mi) => {
    const m = /** @type {Record<string, unknown>} */ (med);
    const line = document.createElement("div");
    line.className = "mh-dis-ep-med-line mh-dis-timeline-event";
    line.dataset.medIdx = String(mi);
    const mt = document.createElement("p");
    mt.className = "mh-prompt";
    mt.textContent = `Препарат ${mi + 1}`;
    line.appendChild(mt);
    line.appendChild(createDrugChipPicker(String(m.drugId ?? ""), `${id}-med-${mi}-drug`).root);
    const doseRow = document.createElement("div");

    doseRow.className = "mh-life-row";
    const dInp = document.createElement("input");
    dInp.type = "text";
    dInp.className = "mh-life-text";
    dInp.id = `${id}-med-${mi}-dose`;
    dInp.placeholder = "Максимальная доза";
    dInp.value = String(m.maxDose ?? "");
    dInp.disabled = m.doseUnknown === true;
    doseRow.appendChild(dInp);
    const unkLab = document.createElement("label");
    unkLab.className = "mh-life-check";
    const unk = document.createElement("input");
    unk.type = "checkbox";
    unk.id = `${id}-med-${mi}-unk`;
    unk.checked = m.doseUnknown === true;
    unk.addEventListener("change", () => {
      dInp.disabled = unk.checked;
      if (unk.checked) dInp.value = "";
    });
    unkLab.appendChild(unk);
    unkLab.appendChild(document.createTextNode(" дозу не помню"));
    doseRow.appendChild(unkLab);
    line.appendChild(doseRow);

    const durModeVal =
      String(m.durationMode ?? "") === "current"
        ? "current"
        : String(m.durationMode ?? "") === "months" || String(m.durationMonths ?? "").trim()
          ? "months"
          : "";
    const durBlock = document.createElement("div");
    durBlock.className = "mh-life-early-sub mh-dis-nested-radios";
    const durLab = document.createElement("p");
    durLab.className = "mh-prompt";
    durLab.textContent = "Длительность приёма:";
    durBlock.appendChild(durLab);
    durBlock.appendChild(
      radioRow(`${id}-med-${mi}-dur-mode`, "months", "Указать срок (мес.)", durModeVal === "months"),
    );
    durBlock.appendChild(
      radioRow(`${id}-med-${mi}-dur-mode`, "current", "По текущий момент", durModeVal === "current"),
    );
    const durMonthsRow = document.createElement("div");
    durMonthsRow.className = "mh-life-row";
    durMonthsRow.appendChild(document.createTextNode("Срок (мес.): "));
    const durInp = document.createElement("input");
    durInp.type = "number";
    durInp.min = "0";
    durInp.className = "mh-life-text mh-life-text--narrow";
    durInp.id = `${id}-med-${mi}-dur`;
    durInp.placeholder = "мес.";
    durInp.value = String(m.durationMonths ?? "");
    durMonthsRow.appendChild(durInp);
    durBlock.appendChild(durMonthsRow);
    function syncMedDur() {
      const r = line.querySelector(`input[name="${id}-med-${mi}-dur-mode"]:checked`);
      const v = r instanceof HTMLInputElement ? r.value : "";
      durMonthsRow.hidden = v !== "months";
    }
    line.querySelectorAll(`input[name="${id}-med-${mi}-dur-mode"]`).forEach((el) => {
      el.addEventListener("change", syncMedDur);
    });
    syncMedDur();
    line.appendChild(durBlock);

    const effP = document.createElement("p");
    effP.className = "mh-prompt";
    effP.textContent = "Эффект:";
    line.appendChild(effP);
    const eff = String(m.effect ?? "");
    line.appendChild(radioRow(`${id}-med-${mi}-eff`, "improvement", "Улучшение", eff === "improvement" || eff === "remission"));
    line.appendChild(radioRow(`${id}-med-${mi}-eff`, "none", "Без эффекта", eff === "none"));
    line.appendChild(radioRow(`${id}-med-${mi}-eff`, "worse", "Ухудшение", eff === "worse"));
    if (medLines.length > 1) {
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "btn btn--ghost";
      rm.textContent = "Удалить препарат";
      rm.addEventListener("click", () => {
        const st0 = readStateFromDom();
        const eps = [...(Array.isArray(st0.episodes) ? st0.episodes : [])];
        const cur = /** @type {Record<string, unknown>} */ ({ ...(eps[ei] || {}) });
        const arr = Array.isArray(cur.episodeMeds) ? [...cur.episodeMeds] : [];
        arr.splice(mi, 1);
        cur.episodeMeds = arr.length ? arr : [defaultEpisodeMed()];
        eps[ei] = cur;
        st0.episodes = eps;
        reflowEpisodes(st0, { episodeIdx: ei });
      });
      line.appendChild(rm);
    }
    medsWrap.appendChild(line);
  });

  function readMedsFromWrap() {
    /** @type {unknown[]} */
    const out = [];
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
      out.push({
        drugId: drugH instanceof HTMLInputElement ? drugH.value.trim() : "",
        maxDose: doseEl instanceof HTMLInputElement ? doseEl.value.trim() : "",
        doseUnknown: unk instanceof HTMLInputElement && unk.checked,
        durationMode,
        durationMonths:
          durationMode === "months" && durEl instanceof HTMLInputElement ? durEl.value.trim() : "",
        effect: effRad instanceof HTMLInputElement ? effRad.value : "",
      });
    });
    return out;
  }

  function persistEpisodeMeds(/** @type {string} */ rxValue) {
    const st0 = readStateFromDom();
    const eps = [...(Array.isArray(st0.episodes) ? st0.episodes : [])];
    const cur = /** @type {Record<string, unknown>} */ ({ ...(eps[ei] || {}) });
    cur.medsPrescribed = rxValue;
    if (rxValue === "yes") {
      const fromDom = readMedsFromWrap();
      cur.episodeMeds = fromDom.length ? fromDom : [defaultEpisodeMed()];
    } else {
      cur.episodeMeds = [];
    }
    eps[ei] = cur;
    st0.episodes = eps;
    return st0;
  }

  const addMed = document.createElement("button");
  addMed.type = "button";
  addMed.className = "btn btn--ghost";
  addMed.textContent = "Добавить препарат";
  addMed.addEventListener("click", () => {
    const st0 = persistEpisodeMeds("yes");
    const eps = [...(Array.isArray(st0.episodes) ? st0.episodes : [])];
    const cur = /** @type {Record<string, unknown>} */ ({ ...(eps[ei] || {}) });
    const arr = Array.isArray(cur.episodeMeds) ? [...cur.episodeMeds] : [];
    arr.push(defaultEpisodeMed());
    cur.episodeMeds = arr;
    cur.medsPrescribed = "yes";
    eps[ei] = cur;
    st0.episodes = eps;
    reflowEpisodes(st0, { episodeIdx: ei });
  });
  medsWrap.appendChild(addMed);
  const impRow = document.createElement("div");
  impRow.className = "mh-life-row";
  impRow.appendChild(document.createTextNode("Как долго длилось улучшение (мес.): "));
  const impInp = document.createElement("input");
  impInp.type = "number";
  impInp.min = "0";
  impInp.className = "mh-life-text mh-life-text--narrow";
  impInp.id = `${id}-imp-dur`;
  impInp.value = String(ep.improvementDurationMonths ?? "");
  impRow.appendChild(impInp);
  impRow.hidden = mpVal !== "yes";
  medsWrap.appendChild(impRow);
  fs6.appendChild(medsWrap);

  fs6.querySelectorAll(`input[name="${id}-rx"]`).forEach((el) => {
    el.addEventListener("change", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) return;
      const v = target.value;
      medsWrap.hidden = v !== "yes";
      impRow.hidden = v !== "yes";
      reflowEpisodes(persistEpisodeMeds(v), { episodeIdx: ei });
    });
  });
  wrap.appendChild(fs6);

  if (isLast) {
    const fs7 = fieldset("7. Обращение в клинику Mental Help");
    const mhHint = document.createElement("p");
    mhHint.className = "mh-prompt";
    mhHint.textContent =
      "С указанными жалобами принято решение обратиться в клинику Mental Help. Укажите причину обращения:";
    fs7.appendChild(mhHint);
    const mhReason = String(ep.mhClinicVisitReason ?? "");
    fs7.appendChild(radioRow(`${id}-mh-visit`, "own_wish", "По собственному желанию", mhReason === "own_wish"));
    fs7.appendChild(radioRow(`${id}-mh-visit`, "relatives", "По настоянию родственников", mhReason === "relatives"));
    const mhDetailP = document.createElement("p");
    mhDetailP.className = "mh-prompt";
    mhDetailP.textContent = "Дополнительно опишите обстоятельства обращения (необязательно):";
    fs7.appendChild(mhDetailP);
    const mhDetail = document.createElement("textarea");
    mhDetail.id = `${id}-mh-visit-detail`;
    mhDetail.className = "mh-life-text";
    mhDetail.rows = 3;
    mhDetail.placeholder = "Например: сохраняются жалобы на тревогу и нарушение сна";
    mhDetail.value = String(ep.mhClinicVisitDetail ?? "");
    fs7.appendChild(mhDetail);
    function syncMhVisitBlock() {
      const r = fs1.querySelector(`input[name="${id}-dur"]:checked`);
      const v = r instanceof HTMLInputElement ? r.value : "";
      fs7.hidden = v !== "current";
    }
    fs1.querySelectorAll(`input[name="${id}-dur"]`).forEach((el) => el.addEventListener("change", syncMhVisitBlock));
    syncMhVisitBlock();
    wrap.appendChild(fs7);
  }

  return wrap;
}
