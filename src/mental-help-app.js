import { saveAs } from "file-saver";
import { MH_STEPS as MH_STEPS_DEFAULT, MH_WORD_SECTIONS, buildWordBlockBody } from "./mental-help-data.js";
import {
  LIFE_STRUCTURED_ID,
  emptyLifeStructuredState,
  formatLifeStructuredForWord,
  parseLifeStructuredString,
  readLifeStructuredFromDom,
  renderLifeStructuredStep,
} from "./mental-help-v2-life.js";
import {
  DISEASE_STRUCTURED_ID,
  emptyDiseaseStructuredState,
  formatDiseaseStructuredForWord,
  formatDiseaseStructuredWithMeta,
  parseDiseaseStructuredString,
  readDiseaseStructuredFromDom,
  renderDiseaseStructuredStep,
} from "./mental-help-v2-disease.js";
import {
  emptyComplaintsState,
  formatComplaintsForWord,
  getVisibleComplaintBlocks,
  parseComplaintsString,
} from "./mental-help-complaints-data.js";
import { formatPatientGenderRu, getSelectedPatientGender } from "./patient-gender.js";
import { getSelectedSpecialistName } from "./specialists.js";
import { buildWordReportHeader } from "./word-report-header.js";
import { buildWordLogoBlock, fetchBrandLogoData } from "./word-branding.js";
import { initSpecialistModal } from "./specialist-modal.js";
import {
  enhanceItogComplaintsStep,
  isItogMode,
  mountItogCategoryNav,
  updateItogCategoryNav,
} from "./mental-help-itog-ui.js";

/**
 * @param {{
 *   wordFileBase?: string;
 *   wordSubtitle?: string | null;
 *   steps?: typeof MH_STEPS_DEFAULT;
 *   variant?: "itog";
 *   lifeWordPreviewRoot?: HTMLElement | null;
 *   diseaseWordPreviewRoot?: HTMLElement | null;
 *   unifiedWordPreviewRoot?: HTMLElement | null;
 *   unifiedWordPreviewResultsRoot?: HTMLElement | null;
 * }} opts
 */
export function initMentalHelpApp(opts = {}) {
  const wordFileBase = opts.wordFileBase ?? "MentalHelp_anketa";
  const wordSubtitle = opts.wordSubtitle ?? null;
  const steps = opts.steps ?? MH_STEPS_DEFAULT;
  const variantItog = opts.variant === "itog" || isItogMode();
  const lifeWordPreviewRoot = opts.lifeWordPreviewRoot ?? null;
  const diseaseWordPreviewRoot = opts.diseaseWordPreviewRoot ?? null;
  const unifiedWordPreviewRoot = opts.unifiedWordPreviewRoot ?? null;
  const unifiedWordPreviewResultsRoot = opts.unifiedWordPreviewResultsRoot ?? null;

  const welcomeEl = document.getElementById("mh-step-welcome");
const doctorEl = document.getElementById("mh-step-doctor");
const genderEl = document.getElementById("mh-step-gender");
const wizardEl = document.getElementById("mh-step-wizard");
const resultsEl = document.getElementById("results");
const progressEl = document.getElementById("mh-progress");
const contentEl = document.getElementById("mh-wizard-content");
const nextWizardBtn = document.getElementById("mh-btn-wizard-next");

/** @type {Record<string, string>} */
const answers = {};
/** Снимки ответов по шагам (жалобы / жизнь / болезнь), чтобы не терять данные при смене экрана. */
/** @type {Record<string, string>} */
const stepSnapshots = {};
let qIndex = 0;

/** @param {{ id: string }} step */
function saveStepSnapshot(step) {
  if (step.id === "complaints") {
    stepSnapshots.complaints = answers.complaints ?? "";
  } else {
    stepSnapshots[step.id] = answers[step.id] ?? "";
  }
}

function restoreAllStepSnapshots() {
  for (const step of steps) {
    const snap = stepSnapshots[step.id];
    if (typeof snap !== "string") continue;
    if (step.id === "complaints") answers.complaints = snap;
    else answers[step.id] = snap;
  }
}

/** Считать текущий шаг из DOM и подставить сохранённые ответы всех пройденных шагов. */
function persistAllAnswersForWord() {
  readCurrentStep();
  restoreAllStepSnapshots();
}

function syncLifeWordPreview() {
  if (!lifeWordPreviewRoot || !contentEl) return;
  const pre = lifeWordPreviewRoot.querySelector("#mh-life-word-preview");
  if (!(pre instanceof HTMLElement)) return;
  const step = steps[qIndex];
  const onLife = step?.id === LIFE_STRUCTURED_ID;
  const wizardShown = wizardEl && !wizardEl.hidden;
  if (!onLife || !wizardShown) {
    lifeWordPreviewRoot.hidden = true;
    return;
  }
  lifeWordPreviewRoot.hidden = false;
  readLifeStructuredFromDom(contentEl, answers);
  saveStepSnapshot({ id: LIFE_STRUCTURED_ID });
  const state = parseLifeStructuredString(answers[LIFE_STRUCTURED_ID]);
  const text = formatLifeStructuredForWord(state, getSelectedPatientGender()).trim();
  pre.textContent = text || "—";
}

function syncDiseaseWordPreview() {
  if (!diseaseWordPreviewRoot || !contentEl) return;
  const pre = diseaseWordPreviewRoot.querySelector("#mh-disease-word-preview");
  if (!(pre instanceof HTMLElement)) return;
  const step = steps[qIndex];
  const onDisease = step?.id === DISEASE_STRUCTURED_ID;
  const wizardShown = wizardEl && !wizardEl.hidden;
  if (!onDisease || !wizardShown) {
    diseaseWordPreviewRoot.hidden = true;
    return;
  }
  diseaseWordPreviewRoot.hidden = false;
  readDiseaseStructuredFromDom(contentEl, answers);
  saveStepSnapshot({ id: DISEASE_STRUCTURED_ID });
  const state = parseDiseaseStructuredString(answers[DISEASE_STRUCTURED_ID]);
  const { text, warnings } = formatDiseaseStructuredWithMeta(state, getSelectedPatientGender());
  const warnBlock =
    warnings.length > 0 ? `\n\n⚠ Проверьте:\n${warnings.map((w) => `• ${w}`).join("\n")}` : "";
  pre.textContent = (text || "—") + warnBlock;
}

function readAllAnswersFromDomForPreview() {
  persistAllAnswersForWord();
}

function syncUnifiedWordPreview() {
  if (!unifiedWordPreviewRoot && !unifiedWordPreviewResultsRoot) return;
  const wizardShown = wizardEl && !wizardEl.hidden;
  const resultsShown = resultsEl && !resultsEl.hidden;
  if (unifiedWordPreviewRoot) unifiedWordPreviewRoot.hidden = !wizardShown;
  if (unifiedWordPreviewResultsRoot) unifiedWordPreviewResultsRoot.hidden = !resultsShown;
  if (!wizardShown && !resultsShown) return;

  persistAllAnswersForWord();
  const gender = getSelectedPatientGender();
  const bodies = buildWordBlockBody(answers, gender, steps);
  const text = MH_WORD_SECTIONS.map(({ wordKey, heading }) => {
    const body = bodies[wordKey] || "—";
    return `${heading}\n${body}`;
  }).join("\n\n");

  const preWizard = unifiedWordPreviewRoot?.querySelector("#mh-unified-word-preview");
  if (preWizard instanceof HTMLElement) preWizard.textContent = text || "—";
  const preResults = unifiedWordPreviewResultsRoot?.querySelector("#mh-unified-word-preview-results");
  if (preResults instanceof HTMLElement) preResults.textContent = text || "—";
}

if (wizardEl && (lifeWordPreviewRoot || diseaseWordPreviewRoot || unifiedWordPreviewRoot)) {
  wizardEl.addEventListener("input", () => {
    if (steps[qIndex]?.id === LIFE_STRUCTURED_ID) syncLifeWordPreview();
    if (steps[qIndex]?.id === DISEASE_STRUCTURED_ID) syncDiseaseWordPreview();
    syncUnifiedWordPreview();
  });
  wizardEl.addEventListener("change", () => {
    if (steps[qIndex]?.id === LIFE_STRUCTURED_ID) syncLifeWordPreview();
    if (steps[qIndex]?.id === DISEASE_STRUCTURED_ID) syncDiseaseWordPreview();
    syncUnifiedWordPreview();
  });
  wizardEl.addEventListener("click", () => {
    if (steps[qIndex]?.id === LIFE_STRUCTURED_ID) syncLifeWordPreview();
    if (steps[qIndex]?.id === DISEASE_STRUCTURED_ID) syncDiseaseWordPreview();
    syncUnifiedWordPreview();
  });
}

function show(el, visible) {
  if (el) el.hidden = !visible;
}

function hideAllSteps() {
  show(welcomeEl, false);
  show(doctorEl, false);
  show(genderEl, false);
  show(wizardEl, false);
  show(resultsEl, false);
}

function readCurrentStep() {
  const step = steps[qIndex];
  if (!step) return;
  if (step.id === "complaints") {
    readComplaintsFromDom();
    saveStepSnapshot(step);
    return;
  }
  if (step.id === LIFE_STRUCTURED_ID) {
    readLifeStructuredFromDom(contentEl, answers);
    saveStepSnapshot(step);
    return;
  }
  if (step.id === DISEASE_STRUCTURED_ID) {
    readDiseaseStructuredFromDom(contentEl, answers);
    saveStepSnapshot(step);
    return;
  }
  const ta = contentEl.querySelector("textarea.mh-textarea");
  if (ta) answers[step.id] = ta.value;
  saveStepSnapshot(step);
}

function readComplaintsFromDom() {
  const gender = getSelectedPatientGender();
  const state = parseComplaintsString(answers.complaints);
  getVisibleComplaintBlocks(gender).forEach((block) => {
    const selected = [];
    block.options.forEach((_, idx) => {
      const el = contentEl.querySelector(`#mh-cb-${block.id}-${idx}`);
      if (el instanceof HTMLInputElement && el.checked) selected.push(idx);
    });
    const ce = contentEl.querySelector(`#mh-custom-${block.id}`);
    state[block.id] = {
      selected,
      custom: ce instanceof HTMLInputElement ? ce.value : "",
    };
  });
  answers.complaints = JSON.stringify(state);
}

function renderComplaintsStep() {
  const step = steps[qIndex];
  if (!step) return;

  contentEl.replaceChildren();
  progressEl.textContent = `Шаг опросника: ${qIndex + 1} из ${steps.length}`;

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

  const h3 = document.createElement("h3");
  h3.className = "mh-question-title";
  h3.textContent = step.codeLabel;
  contentEl.appendChild(h3);

  const prompt = document.createElement("p");
  prompt.className = "mh-prompt";
  prompt.textContent = step.prompt;
  contentEl.appendChild(prompt);

  const gender = getSelectedPatientGender();
  const state = parseComplaintsString(answers.complaints);
  const blocks = getVisibleComplaintBlocks(gender);

  blocks.forEach((block) => {
    const section = document.createElement("section");
    section.className = "mh-complaints-block";
    const bt = document.createElement("h4");
    bt.className = "mh-complaints-block-title";
    bt.textContent = block.title;
    section.appendChild(bt);

    // В «итог» пояснение показывается на карточке (enhanceItogComplaintsStep), не дублируем здесь.
    if (!isItogMode()) {
      const blockPrompt = document.createElement("p");
      blockPrompt.className = "mh-complaints-block-prompt";
      const label = document.createElement("span");
      label.className = "mh-instruction-label";
      label.textContent = "Инструкция. ";
      blockPrompt.appendChild(label);
      blockPrompt.appendChild(document.createTextNode(block.instruction));
      section.appendChild(blockPrompt);
    }

    const row = state[block.id] ?? { selected: [], custom: "" };
    const grid = document.createElement("div");
    grid.className = "mh-complaints-options";
    block.options.forEach((label, idx) => {
      const id = `mh-cb-${block.id}-${idx}`;
      const lab = document.createElement("label");
      lab.className = "mh-complaints-option";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = id;
      cb.checked = row.selected.includes(idx);
      const span = document.createElement("span");
      span.textContent = label;
      lab.appendChild(cb);
      lab.appendChild(span);
      grid.appendChild(lab);
    });
    section.appendChild(grid);

    const customWrap = document.createElement("div");
    customWrap.className = "mh-complaints-custom-wrap";
    const customLab = document.createElement("label");
    customLab.className = "mh-complaints-custom-label";
    customLab.htmlFor = `mh-custom-${block.id}`;
    customLab.textContent = "Свой вариант (если нужного пункта нет в списке)";
    const customInp = document.createElement("input");
    customInp.type = "text";
    customInp.className = "mh-complaints-custom";
    customInp.id = `mh-custom-${block.id}`;
    customInp.value = row.custom;
    customInp.placeholder = "Опишите своими словами — необязательно";
    customInp.autocomplete = "off";
    customWrap.appendChild(customLab);
    customWrap.appendChild(customInp);
    section.appendChild(customWrap);
    contentEl.appendChild(section);
  });

  const testWrap = document.createElement("div");
  testWrap.className = "mh-complaints-test";
  const testHint = document.createElement("p");
  testHint.className = "mh-complaints-test-hint";
  testHint.textContent =
    "Для проверки: случайные отметки и строка «Жалобы на: …» (только формулировки через запятую, как в Word).";
  const testBtn = document.createElement("button");
  testBtn.type = "button";
  testBtn.className = "btn btn--ghost";
  testBtn.textContent = "Сформировать тестовый результат";
  const testOut = document.createElement("pre");
  testOut.className = "mh-complaints-test-out";
  testOut.hidden = true;
  testBtn.addEventListener("click", () => {
    const g = getSelectedPatientGender();
    const st = emptyComplaintsState();
    getVisibleComplaintBlocks(g).forEach((block) => {
      const n = block.options.length;
      const picks = Math.min(n, Math.floor(Math.random() * 4));
      const sel = new Set();
      for (let t = 0; t < 30 && sel.size < picks; t += 1) {
        sel.add(Math.floor(Math.random() * n));
      }
      st[block.id] = {
        selected: [...sel],
        custom: picks ? "Тест: пример своего варианта" : "",
      };
    });
    answers.complaints = JSON.stringify(st);
    renderComplaintsStep();
    const freshOut = contentEl.querySelector(".mh-complaints-test-out");
    if (freshOut) {
      freshOut.textContent = formatComplaintsForWord(parseComplaintsString(answers.complaints), g);
      freshOut.hidden = false;
      freshOut.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });
  testWrap.appendChild(testHint);
  testWrap.appendChild(testBtn);
  testWrap.appendChild(testOut);
  contentEl.appendChild(testWrap);

  if (variantItog) enhanceItogComplaintsStep(contentEl);

  nextWizardBtn.textContent = qIndex >= steps.length - 1 ? "Завершить" : "Далее";
  syncLifeWordPreview();
  syncDiseaseWordPreview();
  syncUnifiedWordPreview();
  if (variantItog) updateItogCategoryNav(steps, qIndex);
}

function renderWizardStep() {
  const step = steps[qIndex];
  if (!step) return;

  if (step.id === "complaints") {
    renderComplaintsStep();
    return;
  }
  if (step.id === LIFE_STRUCTURED_ID) {
    renderLifeStructuredStep(
      contentEl,
      answers,
      qIndex,
      steps.length,
      getSelectedPatientGender(),
      nextWizardBtn,
      step.blockLead ?? null,
    );
    syncLifeWordPreview();
    syncDiseaseWordPreview();
    syncUnifiedWordPreview();
    if (variantItog) updateItogCategoryNav(steps, qIndex);
    return;
  }
  if (step.id === DISEASE_STRUCTURED_ID) {
    renderDiseaseStructuredStep(
      contentEl,
      answers,
      qIndex,
      steps.length,
      getSelectedPatientGender(),
      nextWizardBtn,
      step.blockLead ?? null,
    );
    syncDiseaseWordPreview();
    syncLifeWordPreview();
    syncUnifiedWordPreview();
    if (variantItog) updateItogCategoryNav(steps, qIndex);
    return;
  }

  contentEl.replaceChildren();
  progressEl.textContent = `Шаг опросника: ${qIndex + 1} из ${steps.length}`;

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

  const h3 = document.createElement("h3");
  h3.className = "mh-question-title";
  h3.textContent = step.codeLabel;
  contentEl.appendChild(h3);

  const prompt = document.createElement("p");
  prompt.className = "mh-prompt";
  prompt.textContent = step.prompt;
  contentEl.appendChild(prompt);

  if (step.example) {
    const ex = document.createElement("div");
    ex.className = "mh-example";
    ex.textContent = `Пример:\n${step.example}`;
    contentEl.appendChild(ex);
  }

  const ta = document.createElement("textarea");
  ta.className = "mh-textarea";
  ta.setAttribute("aria-label", `${step.codeLabel} ${step.prompt}`);
  ta.value = answers[step.id] ?? "";
  ta.addEventListener("input", () => {
    answers[step.id] = ta.value;
  });
  contentEl.appendChild(ta);
  window.setTimeout(() => ta.focus(), 50);

  nextWizardBtn.textContent = qIndex >= steps.length - 1 ? "Завершить" : "Далее";
  syncLifeWordPreview();
  syncDiseaseWordPreview();
  syncUnifiedWordPreview();
}

function goWelcome() {
  hideAllSteps();
  show(welcomeEl, true);
}

function goDoctor() {
  hideAllSteps();
  show(doctorEl, true);
}

function goGender() {
  hideAllSteps();
  show(genderEl, true);
  genderEl?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function goWizard(index) {
  readCurrentStep();
  qIndex = Math.max(0, Math.min(steps.length - 1, index));
  hideAllSteps();
  show(wizardEl, true);
  if (variantItog) mountItogCategoryNav(/** @type {HTMLElement} */ (wizardEl));
  renderWizardStep();
}

function goResults() {
  persistAllAnswersForWord();
  hideAllSteps();
  show(resultsEl, true);
  syncUnifiedWordPreview();
  resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

document.getElementById("mh-btn-welcome-next")?.addEventListener("click", () => {
  goDoctor();
});

document.getElementById("mh-btn-doctor-back")?.addEventListener("click", () => {
  goWelcome();
});

document.getElementById("mh-btn-doctor-next")?.addEventListener("click", () => {
  if (!getSelectedSpecialistName()) {
    alert("Выберите врача кнопкой «Врач».");
    return;
  }
  goGender();
});

document.getElementById("mh-btn-gender-back")?.addEventListener("click", () => {
  goDoctor();
});

document.getElementById("mh-btn-gender-next")?.addEventListener("click", () => {
  if (!getSelectedPatientGender()) {
    alert("Выберите пол: мужской или женский.");
    return;
  }
  if (steps.some((s) => s.id === "complaints") && !answers.complaints) {
    answers.complaints = JSON.stringify(emptyComplaintsState());
  }
  if (steps.some((s) => s.id === LIFE_STRUCTURED_ID) && !answers[LIFE_STRUCTURED_ID]) {
    answers[LIFE_STRUCTURED_ID] = JSON.stringify(emptyLifeStructuredState());
  }
  if (steps.some((s) => s.id === DISEASE_STRUCTURED_ID) && !answers[DISEASE_STRUCTURED_ID]) {
    answers[DISEASE_STRUCTURED_ID] = JSON.stringify(emptyDiseaseStructuredState());
  }
  qIndex = 0;
  goWizard(0);
});

document.getElementById("mh-btn-wizard-back")?.addEventListener("click", () => {
  readCurrentStep();
  if (qIndex <= 0) {
    goGender();
    return;
  }
  goWizard(qIndex - 1);
});

document.getElementById("mh-btn-wizard-next")?.addEventListener("click", () => {
  readCurrentStep();
  if (qIndex >= steps.length - 1) {
    goResults();
    return;
  }
  goWizard(qIndex + 1);
});

document.getElementById("btn-download")?.addEventListener("click", async () => {
  const doctorName = getSelectedSpecialistName();
  if (!doctorName) {
    alert("Врач не выбран. Вернитесь назад и выберите врача.");
    return;
  }
  const genderVal = getSelectedPatientGender();
  if (!genderVal) {
    alert("Пол не указан. Вернитесь к шагу «Пол» и выберите «Мужской» или «Женский».");
    return;
  }
  persistAllAnswersForWord();
  const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel } = await import("docx");
  const dateStr = new Date().toLocaleString("ru-RU");
  const bodies = buildWordBlockBody(answers, genderVal, steps);
  const logoData = await fetchBrandLogoData();

  const children = [
    ...buildWordLogoBlock(Paragraph, ImageRun, logoData),
    ...buildWordReportHeader(Paragraph, TextRun, {
      dateStr,
      specialistName: doctorName,
      personnelLabel: "Врач",
      patientGenderRu: formatPatientGenderRu(genderVal),
    }),
    new Paragraph({ text: "" }),
  ];
  if (wordSubtitle) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: wordSubtitle, bold: true })],
      }),
    );
    children.push(new Paragraph({ text: "" }));
  }

  MH_WORD_SECTIONS.forEach(({ wordKey, heading }) => {
    children.push(new Paragraph({ text: heading, heading: HeadingLevel.HEADING_2 }));
    const bodyText = bodies[wordKey] || "—";
    const paras = bodyText === "—" ? ["—"] : bodyText.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
    for (const para of paras) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: para })],
        }),
      );
    }
    children.push(new Paragraph({ text: "" }));
  });

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${wordFileBase}_${new Date().toISOString().slice(0, 10)}.docx`);
});

initSpecialistModal();
goWelcome();
}
