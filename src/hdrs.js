import { saveAs } from "file-saver";
import { HDRS_ITEMS, interpretHdrs } from "./hdrs-data.js";
import { getSelectedSpecialistName } from "./specialists.js";
import { buildWordReportHeader } from "./word-report-header.js";
import { initSpecialistModal } from "./specialist-modal.js";

function buildItemParagraphsForDocx(row, Paragraph, TextRun, HighlightColor) {
  const item = HDRS_ITEMS.find((i) => i.id === row.id);
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

const form = document.getElementById("hdrs-form");
const resultsEl = document.getElementById("results");

function renderForm() {
  HDRS_ITEMS.forEach((item) => {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "bdi-item";
    fieldset.dataset.itemId = String(item.id);

    const numEl = document.createElement("div");
    numEl.className = "bdi-item__number";
    numEl.id = `hdrs-heading-${item.id}`;
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
      const id = `hdrs-${item.id}-${idx}`;
      const wrap = document.createElement("label");
      wrap.className = "bdi-option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `hdrs-${item.id}`;
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

  HDRS_ITEMS.forEach((item) => {
    const sel = form.querySelector(`input[name="hdrs-${item.id}"]:checked`);
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
    alert(`Отметьте ответ по каждому номеру 1–17. Не заполнено: ${missing.join(", ")}`);
    return;
  }

  const total = perItem.reduce((a, r) => a + r.score, 0);

  document.getElementById("score-total").textContent = String(total);
  document.getElementById("interpret-total").textContent = interpretHdrs(total);

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
    alert("Выберите специалиста кнопкой «Специалист» вверху страницы.");
    return;
  }
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, HighlightColor } = await import("docx");
  const { perItem, total } = JSON.parse(raw);
  const dateStr = new Date().toLocaleString("ru-RU");

  const children = [
    ...buildWordReportHeader(Paragraph, TextRun, { dateStr, specialistName }),
    new Paragraph({
      text: "Шкала Гамильтона (HDRS / HAM-D-17)",
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
        new TextRun({ text: "Суммарный балл (0–52): ", bold: true }),
        new TextRun(String(total)),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Интерпретация (ориентировочно): ", bold: true }),
        new TextRun(interpretHdrs(total)),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: "Ориентировочная шкала интерпретации суммы баллов",
      heading: HeadingLevel.HEADING_2,
    }),
    new Paragraph("0–7 — в пределах нормы / ремиссия (условно)."),
    new Paragraph("8–16 — лёгкая депрессия (условно)."),
    new Paragraph("17–23 — умеренная депрессия (условно)."),
    new Paragraph("24–52 — тяжёлая депрессия (условно)."),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: "Ответы (1–17)",
      heading: HeadingLevel.HEADING_2,
    }),
  ];

  perItem.forEach((row) => {
    const blocks = buildItemParagraphsForDocx(row, Paragraph, TextRun, HighlightColor);
    blocks.forEach((p) => children.push(p));
  });

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `HDRS_${new Date().toISOString().slice(0, 10)}.docx`);
});

renderForm();
initSpecialistModal();
