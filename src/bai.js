import { saveAs } from "file-saver";
import { BAI_ITEMS, BAI_SCALE, interpretBai } from "./bai-data.js";

function buildItemParagraphsForDocx(row, Paragraph, TextRun, HighlightColor) {
  const item = BAI_ITEMS.find((i) => i.id === row.id);
  if (!item) return [];

  const out = [];
  out.push(
    new Paragraph({
      children: [new TextRun({ text: String(row.id), bold: true })],
    }),
  );
  out.push(
    new Paragraph({
      children: [new TextRun({ text: item.text, italics: true })],
    }),
  );

  const selected = row.score;

  BAI_SCALE.forEach((opt) => {
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

const form = document.getElementById("bai-form");
const resultsEl = document.getElementById("results");

function renderForm() {
  const wrap = document.createElement("div");
  wrap.className = "bai-table-wrap";

  const table = document.createElement("table");
  table.className = "bai-table";
  table.setAttribute("role", "grid");

  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  const hSym = document.createElement("th");
  hSym.textContent = "Симптом";
  hr.appendChild(hSym);
  BAI_SCALE.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col.text;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  BAI_ITEMS.forEach((item) => {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.innerHTML = `<span class="bai-num">${item.id}.</span> ${item.text}`;
    tr.appendChild(th);

    BAI_SCALE.forEach((col) => {
      const td = document.createElement("td");
      const id = `bai-${item.id}-${col.score}`;
      const lab = document.createElement("label");
      lab.setAttribute("for", id);
      const inp = document.createElement("input");
      inp.type = "radio";
      inp.name = `bai-${item.id}`;
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

  BAI_ITEMS.forEach((item) => {
    const sel = form.querySelector(`input[name="bai-${item.id}"]:checked`);
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
    alert(`Отметьте ответ по каждому номеру 1–21. Не заполнено: ${missing.join(", ")}`);
    return;
  }

  const total = perItem.reduce((a, r) => a + r.score, 0);

  document.getElementById("score-total").textContent = String(total);
  document.getElementById("interpret-total").textContent = interpretBai(total);

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
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, HighlightColor } = await import("docx");
  const { perItem, total } = JSON.parse(raw);
  const dateStr = new Date().toLocaleString("ru-RU");

  const children = [
    new Paragraph({
      text: "Шкала тревоги Бека (BAI)",
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [new TextRun({ text: `Дата: ${dateStr}`, italics: true })],
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
        new TextRun({ text: "Суммарный балл (0–63): ", bold: true }),
        new TextRun(String(total)),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Интерпретация: ", bold: true }),
        new TextRun(interpretBai(total)),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      text: "Шкала интерпретации",
      heading: HeadingLevel.HEADING_2,
    }),
    new Paragraph(
      "Подсчёт производится простым суммированием баллов по всей шкале (1–21).",
    ),
    new Paragraph("До 21 балла включительно — незначительный уровень тревоги."),
    new Paragraph("От 22 до 35 баллов — средняя выраженность тревоги."),
    new Paragraph("36 баллов и выше (при максимуме 63 балла) — очень высокая тревога."),
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
  saveAs(blob, `BAI_${new Date().toISOString().slice(0, 10)}.docx`);
});

renderForm();
