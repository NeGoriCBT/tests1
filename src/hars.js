import { saveAs } from "file-saver";
import { HARS_ITEMS, interpretHars } from "./hars-data.js";
import { getSelectedSpecialistName } from "./specialists.js";
import { buildWordReportHeader } from "./word-report-header.js";
import { initSpecialistModal } from "./specialist-modal.js";
import { scrollToQuestionThenAlert } from "./validation-helpers.js";
import { initScrollNavButton } from "./scroll-nav.js";

function buildItemParagraphsForDocx(row, Paragraph, TextRun, HighlightColor) {
  const item = HARS_ITEMS.find((i) => i.id === row.id);
  if (!item) return [];

  const out = [];
  out.push(
    new Paragraph({
      children: [new TextRun({ text: String(row.id), bold: true })],
    }),
  );
  out.push(
    new Paragraph({
      children: [new TextRun({ text: item.title, bold: true })],
    }),
  );
  if (item.hint) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: item.hint, italics: true })],
      }),
    );
  }

  const selected = row.score;

  item.options.forEach((opt) => {
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

const form = document.getElementById("hars-form");
const resultsEl = document.getElementById("results");

function renderForm() {
  HARS_ITEMS.forEach((item) => {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "bdi-item";
    fieldset.dataset.itemId = String(item.id);

    const numEl = document.createElement("div");
    numEl.className = "bdi-item__number";
    numEl.id = `hars-heading-${item.id}`;
    numEl.textContent = String(item.id);
    fieldset.setAttribute("aria-labelledby", numEl.id);
    fieldset.appendChild(numEl);

    const titleEl = document.createElement("div");
    titleEl.className = "hdrs-item-title";
    titleEl.textContent = item.title;
    fieldset.appendChild(titleEl);

    if (item.hint) {
      const hp = document.createElement("p");
      hp.className = "hdrs-item-hint";
      hp.textContent = item.hint;
      fieldset.appendChild(hp);
    }

    item.options.forEach((opt, idx) => {
      const id = `hars-${item.id}-${idx}`;
      const wrap = document.createElement("label");
      wrap.className = "bdi-option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `hars-${item.id}`;
      input.value = String(opt.score);
      input.id = id;
      input.required = true;
      const span = document.createElement("span");
      span.textContent = `${opt.score} — ${opt.text}`;
      wrap.appendChild(input);
      wrap.appendChild(span);
      fieldset.appendChild(wrap);
    });

    form.appendChild(fieldset);
  });

  const actions = document.createElement("div");
  actions.className = "form-actions";
  actions.innerHTML = '<button type="submit" class="btn btn--primary">Подсчитать результат</button>';
  form.appendChild(actions);
}

function collectAnswers() {
  const perItem = [];
  const missing = [];

  HARS_ITEMS.forEach((item) => {
    const sel = form.querySelector(`input[name="hars-${item.id}"]:checked`);
    if (!sel) {
      missing.push(item.id);
      perItem.push({ id: item.id, score: null, title: item.title });
    } else {
      perItem.push({
        id: item.id,
        score: Number(sel.value),
        title: item.title,
      });
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
      "hars",
      `Отметьте ответ по каждому номеру 1–14. Не заполнено: ${missing.join(", ")}`,
    );
    return;
  }

  const total = perItem.reduce((a, r) => a + r.score, 0);

  document.getElementById("score-total").textContent = String(total);
  document.getElementById("interpret-total").textContent = interpretHars(total);

  resultsEl.hidden = false;
  resultsEl.dataset.payload = JSON.stringify({ perItem, total });
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
  const { perItem, total } = JSON.parse(raw);
  const dateStr = new Date().toLocaleString("ru-RU");

  const children = [
    ...buildWordReportHeader(Paragraph, TextRun, { dateStr, specialistName }),
    new Paragraph({
      text: "Шкала Гамильтона для оценки тревоги (HARS / HAM-A)",
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Важно: опросник не ставит диагноз и не является основанием для самолечения. Результаты носят информационный характер и не заменяют очную консультацию врача или психолога.",
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
      text: "Итог",
      heading: HeadingLevel.HEADING_2,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Суммарный балл (0–56): ", bold: true }),
        new TextRun(String(total)),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Интерпретация (ориентировочно): ", bold: true }),
        new TextRun(interpretHars(total)),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: "Ориентировочная шкала интерпретации суммы баллов",
      heading: HeadingLevel.HEADING_2,
    }),
    new Paragraph("0–6 — минимальная выраженность тревоги (условно)."),
    new Paragraph("7–17 — лёгкая тревога (условно)."),
    new Paragraph("18–24 — лёгкая — умеренная тревога (условно)."),
    new Paragraph("25–30 — умеренная — выраженная тревога (условно)."),
    new Paragraph("31–56 — тяжёлая тревога (условно)."),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: "Ответы (1–14)",
      heading: HeadingLevel.HEADING_2,
    }),
  ];

  perItem.forEach((row) => {
    const blocks = buildItemParagraphsForDocx(row, Paragraph, TextRun, HighlightColor);
    blocks.forEach((p) => children.push(p));
  });

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `HARS_${new Date().toISOString().slice(0, 10)}.docx`);
});

renderForm();
initSpecialistModal();
initScrollNavButton();
