import { saveAs } from "file-saver";
import {
  SCL90_ITEM_TEXTS,
  SCL90_OPTION_LABELS,
  SCL90_SCALES,
  computeScl90Profile,
  formatDelta,
  formatMean,
} from "./scl90-data.js";
import { getSelectedSpecialistName } from "./specialists.js";
import { formatDurationMs } from "./test-duration.js";
import { buildWordReportHeader } from "./word-report-header.js";
import { initSpecialistModal } from "./specialist-modal.js";
import { scrollToQuestionThenAlert } from "./validation-helpers.js";
import { initQuestionNavRail } from "./question-nav-rail.js";

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
const radarCanvasEl = document.getElementById("scl90-radar");
const introEl = document.getElementById("test-intro");
const specialistStepEl = document.getElementById("test-step-specialist");
const testShellEl = document.getElementById("test-shell");
let testStartTimeMs = null;
let railControls = null;

function drawScl90RadarChart(canvas, scaleResults, maxValue) {
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const cssSize = Math.min(canvas.clientWidth || 680, 680);
  const size = Math.round(cssSize * dpr);
  canvas.width = size;
  canvas.height = size;
  canvas.style.height = `${cssSize}px`;

  const center = size / 2;
  const radius = size * 0.34;
  const levels = [1, 2, 3, 4];
  const labels = scaleResults.map((x) => x.code);
  const userVals = scaleResults.map((x) => x.mean);
  const normVals = scaleResults.map((x) => x.norm?.mean ?? 0);
  const chartMax = maxValue ?? Math.max(2, Math.ceil(Math.max(...userVals, ...normVals)));

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 1;
  levels.forEach((lv) => {
    const r = (lv / chartMax) * radius;
    ctx.beginPath();
    labels.forEach((_, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / labels.length;
      const x = center + Math.cos(angle) * r;
      const y = center + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  });

  labels.forEach((_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / labels.length;
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#e5e7eb";
    ctx.stroke();
  });

  ctx.fillStyle = "#6b7280";
  ctx.font = `${Math.max(11, Math.round(size * 0.018))}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  levels.forEach((lv) => {
    const y = center - (lv / chartMax) * radius;
    ctx.fillText(String(lv).replace(".", ","), center + 16, y);
  });

  function drawPolygon(values, stroke, fill) {
    ctx.beginPath();
    values.forEach((v, i) => {
      const rr = (Math.min(v, chartMax) / chartMax) * radius;
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / labels.length;
      const x = center + Math.cos(angle) * rr;
      const y = center + Math.sin(angle) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  }

  drawPolygon(normVals, "rgb(22, 163, 74)", "rgba(34, 197, 94, 0.25)");
  drawPolygon(userVals, "rgb(37, 99, 235)", "rgba(37, 99, 235, 0.3)");

  ctx.fillStyle = "#111827";
  ctx.font = `600 ${Math.max(12, Math.round(size * 0.02))}px sans-serif`;
  labels.forEach((label, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / labels.length;
    const x = center + Math.cos(angle) * (radius + 24 * dpr);
    const y = center + Math.sin(angle) * (radius + 24 * dpr);
    ctx.fillText(label, x, y);
  });
}

async function canvasToPngUint8Array(canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return null;
  const arrBuf = await blob.arrayBuffer();
  return new Uint8Array(arrBuf);
}

function setAllAnswers(scoreOrRandom) {
  for (let i = 1; i <= N; i += 1) {
    const score =
      scoreOrRandom === "random" ? Math.floor(Math.random() * 5) : Number(scoreOrRandom);
    const input = form.querySelector(`input[name="scl90-${i}"][value="${score}"]`);
    if (input instanceof HTMLInputElement) input.checked = true;
  }
  railControls?.update?.();
}

function setScaleAnswers(scaleCode, score) {
  const scale = SCL90_SCALES.find((s) => s.code === scaleCode);
  if (!scale) return;
  scale.items.forEach((itemId) => {
    const input = form.querySelector(`input[name="scl90-${itemId}"][value="${score}"]`);
    if (input instanceof HTMLInputElement) input.checked = true;
  });
  railControls?.update?.();
}

function renderForm() {
  const quickFill = document.createElement("div");
  quickFill.className = "scl90-quickfill";
  quickFill.innerHTML = `
    <span class="scl90-quickfill__label">Проверка:</span>
    <button type="button" class="btn btn--ghost" data-fill="0">Все 0</button>
    <button type="button" class="btn btn--ghost" data-fill="1">Все 1</button>
    <button type="button" class="btn btn--ghost" data-fill="2">Все 2</button>
    <button type="button" class="btn btn--ghost" data-fill="3">Все 3</button>
    <button type="button" class="btn btn--ghost" data-fill="4">Все 4</button>
    <button type="button" class="btn btn--ghost" data-fill="random">Рандомно</button>
  `;
  quickFill.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const fill = target.dataset.fill;
    if (!fill) return;
    setAllAnswers(fill);
  });
  form.appendChild(quickFill);

  const quickFillByScale = document.createElement("div");
  quickFillByScale.className = "scl90-quickfill scl90-quickfill--scale";
  const scaleOptions = SCL90_SCALES.map((s) => `<option value="${s.code}">${s.code} — ${s.name}</option>`).join("");
  quickFillByScale.innerHTML = `
    <span class="scl90-quickfill__label">По шкале:</span>
    <select class="scl90-quickfill__select" id="scl90-scale-fill-select">
      ${scaleOptions}
    </select>
    <button type="button" class="btn btn--ghost" data-scale-fill="0">0</button>
    <button type="button" class="btn btn--ghost" data-scale-fill="1">1</button>
    <button type="button" class="btn btn--ghost" data-scale-fill="2">2</button>
    <button type="button" class="btn btn--ghost" data-scale-fill="3">3</button>
    <button type="button" class="btn btn--ghost" data-scale-fill="4">4</button>
  `;
  quickFillByScale.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const fill = target.dataset.scaleFill;
    if (!fill) return;
    const select = quickFillByScale.querySelector("#scl90-scale-fill-select");
    if (!(select instanceof HTMLSelectElement)) return;
    setScaleAnswers(select.value, Number(fill));
  });
  form.appendChild(quickFillByScale);

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

  railControls = initQuestionNavRail({
    railEl: document.getElementById("scl90-rail"),
    form,
    count: N,
    headingId: (i) => `scl90-h-${i}`,
    isAnswered: (i) => Boolean(form.querySelector(`input[name="scl90-${i}"]:checked`)),
  });
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
  const { gsi, psi, pdsi, scaleResults, totalSum, indexNorms, indexDeltas } = profile;

  document.getElementById("score-gsi").textContent = formatMean(gsi);
  document.getElementById("score-psi").textContent = String(psi);
  document.getElementById("score-pdsi").textContent =
    pdsi == null ? "—" : formatMean(pdsi);
  document.getElementById("score-raw").textContent = String(totalSum);
  document.getElementById("score-gsi-norm").textContent =
    `Норма РФ: ${formatMean(indexNorms.gsi.mean)} ± ${formatMean(indexNorms.gsi.err)} · Δ ${formatDelta(indexDeltas.gsi)}`;
  document.getElementById("score-psi-norm").textContent =
    `Норма РФ: ${formatMean(indexNorms.psi.mean)} ± ${formatMean(indexNorms.psi.err)} · Δ ${formatDelta(indexDeltas.psi)}`;
  document.getElementById("score-pdsi-norm").textContent =
    `Норма РФ: ${formatMean(indexNorms.pdsi.mean)} ± ${formatMean(indexNorms.pdsi.err)} · Δ ${formatDelta(indexDeltas.pdsi)}`;

  drawScl90RadarChart(radarCanvasEl, scaleResults);

  const idxNormEl = document.getElementById("scl90-index-norms");
  if (idxNormEl) {
    idxNormEl.textContent =
      `Норма РФ (M±m): GSI ${formatMean(indexNorms.gsi.mean)}±${formatMean(indexNorms.gsi.err)}, ` +
      `PSI ${formatMean(indexNorms.psi.mean)}±${formatMean(indexNorms.psi.err)}, ` +
      `PDSI ${formatMean(indexNorms.pdsi.mean)}±${formatMean(indexNorms.pdsi.err)}. ` +
      `Отклонение: GSI ${formatDelta(indexDeltas.gsi)}, PSI ${formatDelta(indexDeltas.psi)}, PDSI ${formatDelta(indexDeltas.pdsi)}.`;
  }

  const elapsedMs = testStartTimeMs != null ? Date.now() - testStartTimeMs : null;
  if (introEl) introEl.hidden = true;
  if (specialistStepEl) specialistStepEl.hidden = true;
  if (testShellEl) testShellEl.hidden = true;

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
    ImageRun,
    HeadingLevel,
    HighlightColor,
  } = await import("docx");

  const { scores, profile, elapsedMs } = JSON.parse(raw);
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
    new Paragraph({
      children: [
        new TextRun({ text: "Время прохождения теста: ", bold: true }),
        new TextRun(formatDurationMs(elapsedMs)),
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
    new Paragraph({
      children: [
        new TextRun({ text: "Норма РФ для GSI / PSI / PDSI (M±m): ", bold: true }),
        new TextRun(
          `${formatMean(profile.indexNorms.gsi.mean)}±${formatMean(profile.indexNorms.gsi.err)} / ` +
            `${formatMean(profile.indexNorms.psi.mean)}±${formatMean(profile.indexNorms.psi.err)} / ` +
            `${formatMean(profile.indexNorms.pdsi.mean)}±${formatMean(profile.indexNorms.pdsi.err)}`,
        ),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Отклонение от нормы (GSI / PSI / PDSI): ", bold: true }),
        new TextRun(
          `${formatDelta(profile.indexDeltas.gsi)} / ${formatDelta(profile.indexDeltas.psi)} / ${formatDelta(profile.indexDeltas.pdsi)}`,
        ),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({ text: "Лепестковая диаграмма по шкалам", heading: HeadingLevel.HEADING_2 }),
  ];

  const wordChartCanvas = document.createElement("canvas");
  wordChartCanvas.width = 1000;
  wordChartCanvas.height = 1000;
  drawScl90RadarChart(wordChartCanvas, profile.scaleResults, 4);
  const chartData = await canvasToPngUint8Array(wordChartCanvas);
  if (chartData) {
    children.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: chartData,
            transformation: { width: 500, height: 500 },
          }),
        ],
      }),
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Синий — ваш профиль; зелёный — норма РФ.", italics: true }),
        ],
      }),
    );
  }
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
