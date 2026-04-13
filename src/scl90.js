import { saveAs } from "file-saver";
import {
  SCL90_ITEM_TEXTS,
  SCL90_OPTION_LABELS,
  SCL90_SCALES,
  computeScl90Profile,
  formatMean,
} from "./scl90-data.js";
import { getSelectedSpecialistName } from "./specialists.js";
import { buildWordReportHeader } from "./word-report-header.js";
import { initSpecialistModal } from "./specialist-modal.js";
import { scrollToQuestionThenAlert } from "./validation-helpers.js";
import { initScrollNavButton } from "./scroll-nav.js";

const N = 90;

function buildItemParagraphsForDocx(row, Paragraph, TextRun, HighlightColor) {
  const text = SCL90_ITEM_TEXTS[row.id - 1];
  if (!text) return [];

  const out = [];
  out.push(
    new Paragraph({
      children: [new TextRun({ text: String(row.id), bold: true })],
    }),
  );
  out.push(new Paragraph({ children: [new TextRun({ text, bold: true })] }));

  const selected = row.score;
  SCL90_OPTION_LABELS.forEach((opt) => {
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

const form = document.getElementById("scl90-form");
const resultsEl = document.getElementById("results");

function renderForm() {
  const head = document.createElement("div");
  head.className = "scl90-matrix-head";
  head.innerHTML = `
    <span>№</span>
    <span>Утверждение</span>
    <span>Совсем<br/>нет</span>
    <span>Немного</span>
    <span>Умеренно</span>
    <span>Сильно</span>
    <span>Очень<br/>сильно</span>
  `;
  form.appendChild(head);

  for (let i = 1; i <= N; i += 1) {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "scl90-item";

    const num = document.createElement("div");
    num.className = "scl90-item__number";
    num.id = `scl90-h-${i}`;
    num.textContent = String(i);
    fieldset.setAttribute("aria-labelledby", num.id);

    const textP = document.createElement("p");
    textP.className = "scl90-item__text";
    textP.textContent = SCL90_ITEM_TEXTS[i - 1];

    const optsWrap = document.createElement("div");
    optsWrap.className = "scl90-item__opts";

    SCL90_OPTION_LABELS.forEach((opt, idx) => {
      const id = `scl90-${i}-${idx}`;
      const label = document.createElement("label");
      label.className = "scl90-opt";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `scl90-${i}`;
      input.value = String(opt.score);
      input.id = id;
      input.required = true;
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

  const actions = document.createElement("div");
  actions.className = "form-actions";
  actions.innerHTML =
    '<button type="submit" class="btn btn--primary">Подсчитать результат</button>';
  form.appendChild(actions);
}

function collectScores() {
  const scores = [];
  const missing = [];
  for (let i = 1; i <= N; i += 1) {
    const sel = form.querySelector(`input[name="scl90-${i}"]:checked`);
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
    scrollToQuestionThenAlert(
      missing[0],
      "scl90",
      `Отметьте ответ по каждому пункту 1–90. Не заполнено: ${missing.slice(0, 15).join(", ")}${missing.length > 15 ? "…" : ""}`,
    );
    return;
  }

  const profile = computeScl90Profile(scores);
  const { gsi, psi, pdsi, scaleResults, totalSum } = profile;

  document.getElementById("score-gsi").textContent = formatMean(gsi);
  document.getElementById("score-psi").textContent = String(psi);
  document.getElementById("score-pdsi").textContent =
    pdsi == null ? "—" : formatMean(pdsi);
  document.getElementById("score-raw").textContent = String(totalSum);

  const tbody = document.getElementById("scl90-scale-tbody");
  tbody.replaceChildren();
  scaleResults.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.code}</td>
      <td>${row.name}</td>
      <td>${row.n}</td>
      <td>${formatMean(row.mean)}</td>
    `;
    tbody.appendChild(tr);
  });

  resultsEl.hidden = false;
  resultsEl.dataset.payload = JSON.stringify({ scores, profile });
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
    alert("Выберите специалиста кнопкой «Специалист» (блок под инструкцией).");
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

  const { scores, profile } = JSON.parse(raw);
  const dateStr = new Date().toLocaleString("ru-RU");

  const children = [
    ...buildWordReportHeader(Paragraph, TextRun, { dateStr, specialistName }),
    new Paragraph({
      text: "Опросник выраженности психопатологической симптоматики (SCL-90-R)",
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Symptom Checklist-90-Revised (Derogatis L.R. et al., 1974). Адаптация Н.В. Тарабриной и др.",
          italics: true,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Важно: опросник не ставит диагноз и не является основанием для самолечения. Результаты носят информационный характер и не заменяют очную консультацию специалиста.",
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
    new Paragraph({ text: "Итоговые индексы", heading: HeadingLevel.HEADING_2 }),
    new Paragraph({
      children: [
        new TextRun({ text: "Сумма баллов (0–360): ", bold: true }),
        new TextRun(String(profile.totalSum)),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "GSI (General Symptomatic Index): ", bold: true }),
        new TextRun(formatMean(profile.gsi)),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "PSI (количество пунктов с оценкой 1–4): ", bold: true }),
        new TextRun(String(profile.psi)),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "PDSI (Positive Distress Symptomatic Index): ", bold: true }),
        new TextRun(profile.pdsi == null ? "—" : formatMean(profile.pdsi)),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({ text: "Средние по шкалам", heading: HeadingLevel.HEADING_2 }),
  ];

  const tableRows = [
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph("Шкала")] }),
        new TableCell({ children: [new Paragraph("Название")] }),
        new TableCell({ children: [new Paragraph("n")] }),
        new TableCell({ children: [new Paragraph("Среднее")] }),
      ],
    }),
    ...profile.scaleResults.map(
      (row) =>
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph(row.code)] }),
            new TableCell({ children: [new Paragraph(row.name)] }),
            new TableCell({ children: [new Paragraph(String(row.n))] }),
            new TableCell({ children: [new Paragraph(formatMean(row.mean))] }),
          ],
        }),
    ),
  ];

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: tableRows,
    }),
  );
  children.push(new Paragraph({ text: "" }));
  children.push(
    new Paragraph({
      text: "Ответы по пунктам (1–90)",
      heading: HeadingLevel.HEADING_2,
    }),
  );

  for (let id = 1; id <= N; id += 1) {
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
  saveAs(blob, `SCL90-R_${new Date().toISOString().slice(0, 10)}.docx`);
});

renderForm();
initSpecialistModal();
initScrollNavButton();
