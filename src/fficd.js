import { saveAs } from "file-saver";
import {
  FFICD_ITEM_TEXTS,
  FFICD_N,
  FFICD_SCALE,
  computeFficdProfile,
  formatFficdMean,
} from "./fficd-data.js";
import { getSelectedSpecialistName } from "./specialists.js";
import { buildWordReportHeader } from "./word-report-header.js";
import { initSpecialistModal } from "./specialist-modal.js";
import { scrollToQuestionThenAlert } from "./validation-helpers.js";
import { initQuestionNavRail } from "./question-nav-rail.js";

const MOBILE_QUERY = "(max-width: 900px)";

function isMobileLayout() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function formatDurationMs(ms) {
  if (ms == null || Number.isNaN(ms) || ms < 0) return "—";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (m === 0) return `${sec} с`;
  return `${m} мин ${String(sec).padStart(2, "0")} с`;
}

function buildItemParagraphsForDocx(row, Paragraph, TextRun, HighlightColor) {
  const text = FFICD_ITEM_TEXTS[row.id - 1];
  if (!text) return [];

  const out = [];
  out.push(
    new Paragraph({
      children: [new TextRun({ text: String(row.id), bold: true })],
    }),
  );
  out.push(new Paragraph({ children: [new TextRun({ text, bold: true })] }));

  const selected = row.score;
  FFICD_SCALE.forEach((opt) => {
    const isSelected = selected === opt.score;
    const line = `${opt.score} — ${opt.text}`;
    out.push(
      new Paragraph({
        children: [
          new TextRun({
            text: line,
            ...(isSelected ? { bold: true, highlight: HighlightColor.YELLOW } : {}),
          }),
        ],
      }),
    );
  });
  out.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Балл: ", italics: true }),
        new TextRun(String(selected ?? "—")),
      ],
    }),
  );
  out.push(new Paragraph({ text: "" }));
  return out;
}

const form = document.getElementById("fficd-form");
const resultsEl = document.getElementById("results");
const introEl = document.getElementById("fficd-intro");
const specialistStepEl = document.getElementById("fficd-step-specialist");
const testShellEl = document.getElementById("fficd-test-shell");
const railEl = document.getElementById("fficd-rail");
const mobileStripEl = document.getElementById("fficd-mobile-strip");

let testStartTimeMs = null;
let mobileIndex = 1;

/** @type {HTMLButtonElement[]} */
let stripButtons = [];

function itemAnswered(i) {
  const sel = form.querySelector(`input[name="fficd-${i}"]:checked`);
  return Boolean(sel);
}

function updateProgressUI() {
  for (let i = 1; i <= FFICD_N; i += 1) {
    const ok = itemAnswered(i);
    const sb = stripButtons[i - 1];
    if (sb) {
      sb.classList.toggle("question-rail__btn--answered", ok);
      sb.classList.toggle("question-rail__btn--empty", !ok);
      sb.classList.toggle("question-rail__btn--current", isMobileLayout() && i === mobileIndex);
    }
  }
}

function setMobileActiveIndex(n) {
  mobileIndex = Math.max(1, Math.min(FFICD_N, n));
  const items = form.querySelectorAll(".scl90-item");
  items.forEach((fs, idx) => {
    fs.classList.toggle("fficd-item--active", idx + 1 === mobileIndex);
  });
  updateProgressUI();
  updateMobileNavButtons();
  const curBtn = stripButtons[mobileIndex - 1];
  if (curBtn && isMobileLayout()) {
    curBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }
}

function updateMobileNavButtons() {
  const prev = document.getElementById("fficd-btn-prev");
  const next = document.getElementById("fficd-btn-next");
  if (!prev || !next) return;
  if (!isMobileLayout()) {
    prev.disabled = false;
    next.disabled = false;
    return;
  }
  prev.disabled = mobileIndex <= 1;
  next.disabled = mobileIndex >= FFICD_N;
}

function syncMobileMode() {
  if (!form) return;
  if (isMobileLayout()) {
    form.classList.add("fficd-mode-mobile");
    setMobileActiveIndex(mobileIndex);
  } else {
    form.classList.remove("fficd-mode-mobile");
    form.querySelectorAll(".scl90-item").forEach((el) => el.classList.remove("fficd-item--active"));
    updateProgressUI();
    updateMobileNavButtons();
  }
}

function renderForm() {
  const head = document.createElement("div");
  head.className = "scl90-matrix-head";
  head.innerHTML = `
    <span>№</span>
    <span>Утверждение</span>
    <span>1</span>
    <span>2</span>
    <span>3</span>
    <span>4</span>
    <span>5</span>
  `;
  form.appendChild(head);

  stripButtons = [];
  mobileStripEl.replaceChildren();

  for (let i = 1; i <= FFICD_N; i += 1) {
    const sb = document.createElement("button");
    sb.type = "button";
    sb.className = "question-rail__btn question-rail__btn--empty";
    sb.textContent = String(i);
    sb.setAttribute("aria-label", `Вопрос ${i}`);
    sb.dataset.n = String(i);
    sb.addEventListener("click", () => {
      if (!isMobileLayout()) return;
      setMobileActiveIndex(i);
    });
    mobileStripEl.appendChild(sb);
    stripButtons.push(sb);
  }

  for (let i = 1; i <= FFICD_N; i += 1) {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "scl90-item";
    fieldset.id = `fficd-fieldset-${i}`;

    const num = document.createElement("div");
    num.className = "scl90-item__number";
    num.id = `fficd-h-${i}`;
    num.textContent = String(i);
    fieldset.setAttribute("aria-labelledby", num.id);

    const textP = document.createElement("p");
    textP.className = "scl90-item__text";
    textP.textContent = FFICD_ITEM_TEXTS[i - 1];

    const optsWrap = document.createElement("div");
    optsWrap.className = "scl90-item__opts";

    FFICD_SCALE.forEach((opt, idx) => {
      const id = `fficd-${i}-${idx}`;
      const label = document.createElement("label");
      label.className = "scl90-opt";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `fficd-${i}`;
      input.value = String(opt.score);
      input.id = id;
      const span = document.createElement("span");
      span.innerHTML = `<span class="scl90-opt__n">${opt.score}</span> <span class="scl90-opt__t">${opt.text}</span>`;
      label.appendChild(input);
      label.appendChild(span);
      optsWrap.appendChild(label);
    });

    fieldset.appendChild(num);
    fieldset.appendChild(textP);
    fieldset.appendChild(optsWrap);
    form.appendChild(fieldset);
  }

  initQuestionNavRail({
    railEl,
    form,
    count: FFICD_N,
    headingId: (i) => `fficd-h-${i}`,
    isAnswered: itemAnswered,
  });

  form.addEventListener("change", () => {
    updateProgressUI();
  });
  form.addEventListener("input", () => {
    updateProgressUI();
  });

  const actionsDesktop = document.createElement("div");
  actionsDesktop.className = "form-actions fficd-form-actions--desktop";
  actionsDesktop.innerHTML =
    '<button type="submit" class="btn btn--primary">Подсчитать результат</button>';
  form.appendChild(actionsDesktop);
}

function collectScores() {
  const scores = [];
  const missing = [];
  for (let i = 1; i <= FFICD_N; i += 1) {
    const sel = form.querySelector(`input[name="fficd-${i}"]:checked`);
    if (!sel) {
      missing.push(i);
      scores.push(null);
    } else {
      scores.push(Number(sel.value));
    }
  }
  return { scores, missing };
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const { scores, missing } = collectScores();
  if (missing.length > 0) {
    if (isMobileLayout()) {
      setMobileActiveIndex(missing[0]);
    }
    scrollToQuestionThenAlert(
      missing[0],
      "fficd",
      `Отметьте ответ по каждому пункту 1–121. Не заполнено: ${missing.slice(0, 12).join(", ")}${missing.length > 12 ? "…" : ""}`,
    );
    return;
  }

  const elapsedMs = testStartTimeMs != null ? Date.now() - testStartTimeMs : null;
  const profile = computeFficdProfile(scores);

  document.getElementById("fficd-sum").textContent = String(profile.totalSum);
  document.getElementById("fficd-mean-all").textContent = formatFficdMean(profile.overallMean);

  const domWrap = document.getElementById("fficd-domains-grid");
  domWrap.replaceChildren();
  profile.domains.forEach((d) => {
    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `
      <span class="result-card__label">${d.code} · ${d.name}</span>
      <span class="result-card__value">${formatFficdMean(d.mean)}</span>
      <span class="result-card__hint">n = ${d.n}</span>
    `;
    domWrap.appendChild(card);
  });

  const subTbody = document.getElementById("fficd-sub-tbody");
  subTbody.replaceChildren();
  profile.subdomains.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.domainCode}</td>
      <td>${row.name}</td>
      <td>${row.n}</td>
      <td>${formatFficdMean(row.mean)}</td>
    `;
    subTbody.appendChild(tr);
  });

  const nuTbody = document.getElementById("fficd-nu-tbody");
  nuTbody.replaceChildren();
  profile.nuances.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.domainCode}</td>
      <td>${row.name}</td>
      <td>${row.n}</td>
      <td>${formatFficdMean(row.mean)}</td>
    `;
    nuTbody.appendChild(tr);
  });

  introEl.hidden = true;
  specialistStepEl.hidden = true;
  testShellEl.hidden = true;
  resultsEl.hidden = false;
  resultsEl.dataset.payload = JSON.stringify({ scores, profile, elapsedMs });
  resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
});

document.getElementById("btn-download").addEventListener("click", async () => {
  const raw = resultsEl.dataset.payload;
  if (!raw) {
    alert("Сначала заполните опросник и нажмите «Подсчитать результат».");
    return;
  }
  const specialistName = getSelectedSpecialistName();
  if (!specialistName) {
    alert("Сначала выберите специалиста в блоке «ВЫБЕРИТЕ СПЕЦИАЛИСТА» (кнопка «Специалист»).");
    return;
  }

  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    HeadingLevel,
    HighlightColor,
  } = await import("docx");

  const { scores, profile, elapsedMs } = JSON.parse(raw);
  const dateStr = new Date().toLocaleString("ru-RU");
  const fm = formatFficdMean;

  const children = [
    ...buildWordReportHeader(Paragraph, TextRun, { dateStr, specialistName }),
    new Paragraph({
      text: "Пятифакторный личностный опросник для МКБ-11 (FFiCD)",
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "The Five-Factor Personality Inventory for ICD-11. Русская версия (figshare и др.).",
          italics: true,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Важно: опросник не ставит диагноз; интерпретация — в клиническом контексте специалиста.",
          italics: true,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Конфиденциальность: ответы не передавались на сервер; отчёт сформирован локально в браузере.",
          italics: true,
        }),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun({ text: "Время прохождения теста: ", bold: true }),
        new TextRun(formatDurationMs(elapsedMs)),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({ text: "Сводка", heading: HeadingLevel.HEADING_2 }),
    new Paragraph({
      children: [
        new TextRun({ text: "Сумма баллов (121–605): ", bold: true }),
        new TextRun(String(profile.totalSum)),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Среднее по всем пунктам: ", bold: true }),
        new TextRun(fm(profile.overallMean)),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({ text: "Домены", heading: HeadingLevel.HEADING_2 }),
  ];

  const domainRows = [
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph("Код")] }),
        new TableCell({ children: [new Paragraph("Домен")] }),
        new TableCell({ children: [new Paragraph("n")] }),
        new TableCell({ children: [new Paragraph("Среднее")] }),
      ],
    }),
    ...profile.domains.map(
      (row) =>
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph(row.code)] }),
            new TableCell({ children: [new Paragraph(row.name)] }),
            new TableCell({ children: [new Paragraph(String(row.n))] }),
            new TableCell({ children: [new Paragraph(fm(row.mean))] }),
          ],
        }),
    ),
  ];
  children.push(
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: domainRows }),
  );
  children.push(new Paragraph({ text: "" }));
  children.push(new Paragraph({ text: "Субдомены", heading: HeadingLevel.HEADING_2 }));

  const subRows = [
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph("Домен")] }),
        new TableCell({ children: [new Paragraph("Субдомен")] }),
        new TableCell({ children: [new Paragraph("n")] }),
        new TableCell({ children: [new Paragraph("Среднее")] }),
      ],
    }),
    ...profile.subdomains.map(
      (row) =>
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph(row.domainCode)] }),
            new TableCell({ children: [new Paragraph(row.name)] }),
            new TableCell({ children: [new Paragraph(String(row.n))] }),
            new TableCell({ children: [new Paragraph(fm(row.mean))] }),
          ],
        }),
    ),
  ];
  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: subRows }));
  children.push(new Paragraph({ text: "" }));
  children.push(new Paragraph({ text: "Нюансы", heading: HeadingLevel.HEADING_2 }));

  const nuRows = [
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph("Домен")] }),
        new TableCell({ children: [new Paragraph("Нюанс")] }),
        new TableCell({ children: [new Paragraph("n")] }),
        new TableCell({ children: [new Paragraph("Среднее")] }),
      ],
    }),
    ...profile.nuances.map(
      (row) =>
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph(row.domainCode)] }),
            new TableCell({ children: [new Paragraph(row.name)] }),
            new TableCell({ children: [new Paragraph(String(row.n))] }),
            new TableCell({ children: [new Paragraph(fm(row.mean))] }),
          ],
        }),
    ),
  ];
  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: nuRows }));
  children.push(new Paragraph({ text: "" }));
  children.push(
    new Paragraph({
      text: "Ответы по пунктам (1–121)",
      heading: HeadingLevel.HEADING_2,
    }),
  );

  for (let id = 1; id <= FFICD_N; id += 1) {
    const blocks = buildItemParagraphsForDocx(
      { id, score: scores[id - 1] },
      Paragraph,
      TextRun,
      HighlightColor,
    );
    blocks.forEach((p) => children.push(p));
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `FFiCD_${new Date().toISOString().slice(0, 10)}.docx`);
});

document.getElementById("btn-fficd-start").addEventListener("click", () => {
  testStartTimeMs = Date.now();
  introEl.hidden = true;
  specialistStepEl.hidden = false;
  specialistStepEl.scrollIntoView({ behavior: "smooth", block: "start" });
});

document.getElementById("btn-fficd-to-questions").addEventListener("click", () => {
  if (!getSelectedSpecialistName()) {
    alert("Выберите специалиста кнопкой «Специалист».");
    return;
  }
  specialistStepEl.hidden = true;
  testShellEl.hidden = false;
  mobileIndex = 1;
  syncMobileMode();
  testShellEl.scrollIntoView({ behavior: "smooth", block: "start" });
});

document.getElementById("fficd-btn-prev").addEventListener("click", () => {
  if (!isMobileLayout()) return;
  setMobileActiveIndex(mobileIndex - 1);
});

document.getElementById("fficd-btn-next").addEventListener("click", () => {
  if (!isMobileLayout()) return;
  setMobileActiveIndex(mobileIndex + 1);
});

const mq = window.matchMedia(MOBILE_QUERY);
function onLayoutChange() {
  if (testShellEl.hidden) return;
  syncMobileMode();
}
if (typeof mq.addEventListener === "function") {
  mq.addEventListener("change", onLayoutChange);
} else if (typeof mq.addListener === "function") {
  mq.addListener(onLayoutChange);
}

renderForm();
initSpecialistModal();
updateProgressUI();
