import { saveAs } from "file-saver";
import { BDI_ITEMS, interpretTotal } from "./bdi-data.js";
import { getSelectedSpecialistName } from "./specialists.js";
import { buildWordReportHeader } from "./word-report-header.js";
import { initSpecialistModal } from "./specialist-modal.js";
import { scrollToQuestionThenAlert } from "./validation-helpers.js";
import { initScrollNavButton } from "./scroll-nav.js";

function buildItemParagraphsForDocx(row, Paragraph, TextRun, HighlightColor) {
  const item = BDI_ITEMS.find((i) => i.id === row.id);
  if (!item) return [];

  const out = [];
  out.push(
    new Paragraph({
      children: [new TextRun({ text: String(row.id), bold: true })],
    }),
  );

  const selectedScores = new Set(row.selectedTexts.map((st) => st.score));
  const maxS =
    row.selectedTexts.length > 0 ? Math.max(...row.selectedTexts.map((x) => x.score)) : null;

  item.options.forEach((opt) => {
    const isSelected = selectedScores.has(opt.score);
    const line = `${opt.score} — ${opt.text}`;
    out.push(
      new Paragraph({
        children: [
          new TextRun({
            text: line,
            ...(isSelected
              ? { bold: true, highlight: HighlightColor.YELLOW }
              : {}),
          }),
        ],
      }),
    );
  });

  if (row.id === 19) {
    const wl = row.weightIntention;
    const wlShort = wl === "yes" ? "Да" : wl === "no" ? "Нет" : "не указано";
    out.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Балл (0–3): ", bold: true }),
          new TextRun(String(maxS ?? "—")),
          new TextRun({ text: ". Намеренное похудение: ", bold: true }),
          new TextRun(wlShort),
          new TextRun({
            text:
              wl === "yes"
                ? ". Учтено: при целенаправленном похудении снижение веса по вопросу 19 может не отражать депрессивные симптомы."
                : ".",
          }),
        ],
      }),
    );
  } else if (maxS !== null) {
    out.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Балл: ", italics: true }),
          new TextRun(String(maxS)),
        ],
      }),
    );
  }

  out.push(new Paragraph({ text: "" }));
  return out;
}

const form = document.getElementById("bdi-form");
const resultsEl = document.getElementById("results");

function renderForm() {
  BDI_ITEMS.forEach((item) => {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "bdi-item";
    fieldset.dataset.itemId = String(item.id);

    const numEl = document.createElement("div");
    numEl.className = "bdi-item__number";
    numEl.id = `bdi-heading-${item.id}`;
    numEl.textContent = String(item.id);
    fieldset.setAttribute("aria-labelledby", numEl.id);
    fieldset.appendChild(numEl);

    item.options.forEach((opt, idx) => {
      const id = `bdi-${item.id}-${idx}`;
      const wrap = document.createElement("label");
      wrap.className = "bdi-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = `item-${item.id}`;
      input.value = String(opt.score);
      input.dataset.score = String(opt.score);
      input.id = id;
      const span = document.createElement("span");
      span.textContent = `${opt.score} — ${opt.text}`;
      wrap.appendChild(input);
      wrap.appendChild(span);
      fieldset.appendChild(wrap);
    });

    if (item.extraWeightLossIntention) {
      const extra = document.createElement("div");
      extra.className = "bdi-extra";
      extra.innerHTML =
        '<p class="bdi-extra__title">Дополнительно к 19: «Я намеренно стараюсь похудеть и ем меньше»</p>';
      const row = document.createElement("div");
      row.className = "bdi-extra__row";
      ["yes", "no"].forEach((v) => {
        const lab = document.createElement("label");
        lab.className = "bdi-option bdi-option--inline";
        const inp = document.createElement("input");
        inp.type = "radio";
        inp.name = "weight-loss-intention";
        inp.value = v;
        inp.id = `wl-${v}`;
        const s = document.createElement("span");
        s.textContent = v === "yes" ? "Да" : "Нет";
        lab.appendChild(inp);
        lab.appendChild(s);
        row.appendChild(lab);
      });
      extra.appendChild(row);
      fieldset.appendChild(extra);
    }

    form.appendChild(fieldset);
  });

  const actions = document.createElement("div");
  actions.className = "form-actions";
  actions.innerHTML =
    '<button type="submit" class="btn btn--primary">Подсчитать результат</button>';
  form.appendChild(actions);
}

function getMaxScoreForItem(itemId) {
  const checked = form.querySelectorAll(`input[name="item-${itemId}"]:checked`);
  if (checked.length === 0) return null;
  let max = -1;
  checked.forEach((el) => {
    const s = Number(el.dataset.score);
    if (s > max) max = s;
  });
  return max;
}

function collectAnswers() {
  const perItem = [];
  const missing = [];

  BDI_ITEMS.forEach((item) => {
    const score = getMaxScoreForItem(item.id);
    if (score === null) missing.push(item.id);

    const checked = [...form.querySelectorAll(`input[name="item-${item.id}"]:checked`)];
    const selectedTexts = checked.map((inp) => {
      const idx = inp.id.split("-").pop();
      const opt = item.options[Number(idx)];
      return { score: opt.score, text: opt.text };
    });

    let weightIntention = null;
    if (item.extraWeightLossIntention) {
      const sel = form.querySelector('input[name="weight-loss-intention"]:checked');
      weightIntention = sel ? sel.value : null;
    }

    perItem.push({
      id: item.id,
      score,
      selectedTexts,
      weightIntention,
    });
  });

  return { perItem, missing };
}

function computeSubscales(perItem) {
  let cog = 0;
  let som = 0;
  perItem.forEach((row) => {
    const s = row.score ?? 0;
    if (row.id >= 1 && row.id <= 13) cog += s;
    if (row.id >= 14 && row.id <= 21) som += s;
  });
  return { cog, som };
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const { perItem, missing } = collectAnswers();

  if (missing.length > 0) {
    scrollToQuestionThenAlert(
      missing[0],
      "bdi",
      `Отметьте хотя бы один вариант для каждого номера 1–21. Не заполнено: ${missing.join(", ")}`,
    );
    return;
  }

  const total = perItem.reduce((a, r) => a + (r.score ?? 0), 0);
  const { cog, som } = computeSubscales(perItem);

  document.getElementById("score-total").textContent = String(total);
  document.getElementById("interpret-total").textContent = interpretTotal(total);
  document.getElementById("score-cog").textContent = String(cog);
  document.getElementById("score-som").textContent = String(som);

  resultsEl.hidden = false;
  resultsEl.dataset.payload = JSON.stringify({ perItem, total, cog, som });
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
  const { perItem, total, cog, som } = JSON.parse(raw);
  const dateStr = new Date().toLocaleString("ru-RU");

  const children = [
    ...buildWordReportHeader(Paragraph, TextRun, { dateStr, specialistName }),
    new Paragraph({
      text: "Шкала депрессии Бека (BDI)",
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
        new TextRun({ text: "Суммарный балл: ", bold: true }),
        new TextRun(String(total)),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Интерпретация: ", bold: true }),
        new TextRun(interpretTotal(total)),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Когнитивно-аффективная субшкала (1–13): ", bold: true }),
        new TextRun(String(cog)),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Соматическая субшкала (14–21): ", bold: true }),
        new TextRun(String(som)),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: "Шкала интерпретации суммарного балла",
      heading: HeadingLevel.HEADING_2,
    }),
    new Paragraph("0–9 — отсутствие депрессивных симптомов."),
    new Paragraph("10–15 — лёгкая депрессия (субдепрессия)."),
    new Paragraph("16–19 — умеренная депрессия."),
    new Paragraph("20–29 — выраженная депрессия (средней тяжести)."),
    new Paragraph("30–62 — тяжёлая депрессия."),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: "Ответы (1–21)",
      heading: HeadingLevel.HEADING_2,
    }),
  ];

  perItem.forEach((row) => {
    const blocks = buildItemParagraphsForDocx(row, Paragraph, TextRun, HighlightColor);
    blocks.forEach((p) => children.push(p));
  });

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `BDI_${new Date().toISOString().slice(0, 10)}.docx`);
});

renderForm();
initSpecialistModal();
initScrollNavButton();
