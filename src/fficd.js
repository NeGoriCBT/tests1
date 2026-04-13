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
import { initScrollNavButton } from "./scroll-nav.js";

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

  for (let i = 1; i <= FFICD_N; i += 1) {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "scl90-item";

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
    scrollToQuestionThenAlert(
      missing[0],
      "fficd",
      `Отметьте ответ по каждому пункту 1–121. Не заполнено: ${missing.slice(0, 12).join(", ")}${missing.length > 12 ? "…" : ""}`,
    );
    return;
  }

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

  const { scores, profile } = JSON.parse(raw);
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

renderForm();
initSpecialistModal();
initScrollNavButton();
