import { saveAs } from "file-saver";
import { getSelectedSpecialistName } from "./specialists.js";
import { formatDurationMs } from "./test-duration.js";
import { buildWordReportHeader } from "./word-report-header.js";
import { initSpecialistModal } from "./specialist-modal.js";
import { scrollToQuestionThenAlert } from "./validation-helpers.js";
import { initQuestionNavRail } from "./question-nav-rail.js";
import {
  SIFS_ITEMS,
  SIFS_SCALE,
  SIFS_SUBSCALE_LABELS,
  adjustedScore,
  computeSifsScores,
  formatCoeff,
  interpretSifsSeverity,
} from "./sifs-data.js";

function buildItemParagraphsForDocx(row, Paragraph, TextRun, HighlightColor) {
  const item = SIFS_ITEMS.find((i) => i.id === row.id);
  if (!item) return [];

  const raw = row.score;
  const adj = adjustedScore(raw, item.reverse);

  const out = [];
  out.push(
    new Paragraph({
      children: [
        new TextRun({ text: String(row.id), bold: true }),
        new TextRun({ text: item.reverse ? " (обратный пункт)" : "", italics: true }),
      ],
    }),
  );
  out.push(
    new Paragraph({
      children: [new TextRun({ text: item.text, italics: true })],
    }),
  );

  SIFS_SCALE.forEach((opt) => {
    const isSelected = raw === opt.score;
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
        new TextRun({ text: "Сырой балл: ", italics: true }),
        new TextRun(String(raw ?? "—")),
        new TextRun({ text: ". Балл с учётом обращения: ", italics: true }),
        new TextRun(String(adj ?? "—")),
      ],
    }),
  );
  out.push(new Paragraph({ text: "" }));
  return out;
}

const form = document.getElementById("sifs-form");
const resultsEl = document.getElementById("results");
const introEl = document.getElementById("test-intro");
const specialistStepEl = document.getElementById("test-step-specialist");
const testShellEl = document.getElementById("test-shell");
let testStartTimeMs = null;

function renderForm() {
  const wrap = document.createElement("div");
  wrap.className = "bai-table-wrap";

  const table = document.createElement("table");
  table.className = "bai-table";
  table.setAttribute("role", "grid");

  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  const hSym = document.createElement("th");
  hSym.textContent = "Утверждение";
  hr.appendChild(hSym);
  SIFS_SCALE.forEach((col) => {
    const th = document.createElement("th");
    th.className = "sifs-th-score";
    th.textContent = String(col.score);
    th.title = col.text;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  SIFS_ITEMS.forEach((item) => {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.id = `sifs-heading-${item.id}`;
    const rev = item.reverse ? ' <span class="sifs-rev" title="Обратный пункт">(R)</span>' : "";
    th.innerHTML = `<span class="bai-num">${item.id}.</span>${rev} ${item.text}`;
    tr.appendChild(th);

    SIFS_SCALE.forEach((col) => {
      const td = document.createElement("td");
      const id = `sifs-${item.id}-${col.score}`;
      const lab = document.createElement("label");
      lab.setAttribute("for", id);
      const inp = document.createElement("input");
      inp.type = "radio";
      inp.name = `sifs-${item.id}`;
      inp.value = String(col.score);
      inp.id = id;
      inp.required = true;
      lab.appendChild(inp);
      td.appendChild(lab);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  form.appendChild(wrap);

  const actions = document.createElement("div");
  actions.className = "bai-form-actions";
  actions.innerHTML = '<button type="submit" class="btn btn--primary">Подсчитать результат</button>';
  form.appendChild(actions);
}

function collectAnswers() {
  const perItem = [];
  const missing = [];

  SIFS_ITEMS.forEach((item) => {
    const sel = form.querySelector(`input[name="sifs-${item.id}"]:checked`);
    if (!sel) {
      missing.push(item.id);
      perItem.push({ id: item.id, score: null, text: item.text });
    } else {
      const score = Number(sel.value);
      perItem.push({ id: item.id, score, text: item.text });
    }
  });

  return { perItem, missing };
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const { perItem, missing } = collectAnswers();

  if (missing.length > 0) {
    scrollToQuestionThenAlert(
      missing[0],
      "sifs",
      `Отметьте ответ по каждому номеру 1–24. Не заполнено: ${missing.join(", ")}`,
    );
    return;
  }

  const { means, totalScore, severityCoeff } = computeSifsScores(perItem);

  document.getElementById("score-total").textContent = formatCoeff(totalScore);
  document.getElementById("score-severity").textContent = formatCoeff(severityCoeff);
  document.getElementById("interpret-total").textContent = interpretSifsSeverity(severityCoeff);

  document.getElementById("mean-self-awareness").textContent = formatCoeff(means.selfAwareness);
  document.getElementById("mean-self-direction").textContent = formatCoeff(means.selfDirection);
  document.getElementById("mean-empathy").textContent = formatCoeff(means.empathy);
  document.getElementById("mean-trust").textContent = formatCoeff(means.trust);

  const elapsedMs = testStartTimeMs != null ? Date.now() - testStartTimeMs : null;
  if (introEl) introEl.hidden = true;
  if (specialistStepEl) specialistStepEl.hidden = true;
  if (testShellEl) testShellEl.hidden = true;

  resultsEl.hidden = false;
  resultsEl.dataset.payload = JSON.stringify({
    perItem,
    means,
    totalScore,
    severityCoeff,
    elapsedMs,
  });
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
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, HighlightColor } = await import("docx");
  const { perItem, means, totalScore, severityCoeff, elapsedMs } = JSON.parse(raw);
  const dateStr = new Date().toLocaleString("ru-RU");

  const children = [
    ...buildWordReportHeader(Paragraph, TextRun, { dateStr, specialistName }),
    new Paragraph({
      text: "SIFS — шкала личностного и межличностного функционирования",
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "The Self and Interpersonal Functioning Scale. Ориентировочная оценка тяжести расстройства личности не заменяет клиническую диагностику.",
          italics: true,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Конфиденциальность: ответы не передавались на сервер и не сохранялись в облаке; отчёт сформирован локально в браузере на устройстве пользователя.",
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
    new Paragraph({
      text: "Итог",
      heading: HeadingLevel.HEADING_2,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Общий балл (сумма средних по четырём подшкалам): ", bold: true }),
        new TextRun(formatCoeff(totalScore)),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Коэффициент тяжести (Общий балл / 4): ", bold: true }),
        new TextRun(formatCoeff(severityCoeff)),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Интерпретация (ориентировочно): ", bold: true }),
        new TextRun(interpretSifsSeverity(severityCoeff)),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: "Средние значения по подшкалам (после обращения обратных пунктов)",
      heading: HeadingLevel.HEADING_2,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `${SIFS_SUBSCALE_LABELS.selfAwareness}: `, bold: true }),
        new TextRun(formatCoeff(means.selfAwareness)),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `${SIFS_SUBSCALE_LABELS.selfDirection}: `, bold: true }),
        new TextRun(formatCoeff(means.selfDirection)),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `${SIFS_SUBSCALE_LABELS.empathy}: `, bold: true }),
        new TextRun(formatCoeff(means.empathy)),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `${SIFS_SUBSCALE_LABELS.trust}: `, bold: true }),
        new TextRun(formatCoeff(means.trust)),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: "Ориентировочная интерпретация коэффициента тяжести",
      heading: HeadingLevel.HEADING_2,
    }),
    new Paragraph("1,30–1,89 — лёгкая степень расстройства личности (условно)."),
    new Paragraph("1,90–2,49 — умеренная степень (условно)."),
    new Paragraph("Более 2,5 — тяжёлая степень (условно)."),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: "Ответы (1–24)",
      heading: HeadingLevel.HEADING_2,
    }),
  ];

  perItem.forEach((row) => {
    const blocks = buildItemParagraphsForDocx(row, Paragraph, TextRun, HighlightColor);
    blocks.forEach((p) => children.push(p));
  });

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `SIFS_${new Date().toISOString().slice(0, 10)}.docx`);
});

renderForm();
initQuestionNavRail({
  railEl: document.getElementById("sifs-rail"),
  form,
  count: SIFS_ITEMS.length,
  headingId: (i) => `sifs-heading-${i}`,
  isAnswered: (i) => Boolean(form.querySelector(`input[name="sifs-${i}"]:checked`)),
});
initSpecialistModal();

document.getElementById("btn-test-start")?.addEventListener("click", () => {
  testStartTimeMs = Date.now();
  if (introEl) introEl.hidden = true;
  if (specialistStepEl) specialistStepEl.hidden = false;
  specialistStepEl?.scrollIntoView({ behavior: "smooth", block: "start" });
});
document.getElementById("btn-test-to-questions")?.addEventListener("click", () => {
  if (!getSelectedSpecialistName()) {
    alert("Выберите специалиста кнопкой «Специалист».");
    return;
  }
  if (specialistStepEl) specialistStepEl.hidden = true;
  if (testShellEl) testShellEl.hidden = false;
  testShellEl?.scrollIntoView({ behavior: "smooth", block: "start" });
});
