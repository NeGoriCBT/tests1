/** Общий «шапочный» блок отчёта Word: дата, линия для ФИО, специалист. */

const PATIENT_LINE = "________________________________________________________________";

/**
 * @param {typeof import("docx").Paragraph} Paragraph
 * @param {typeof import("docx").TextRun} TextRun
 * @param {{ dateStr: string; specialistName: string }} opts
 */
export function buildWordReportHeader(Paragraph, TextRun, { dateStr, specialistName }) {
  return [
    new Paragraph({
      children: [
        new TextRun({ text: "Дата: ", bold: true }),
        new TextRun(dateStr),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "ФИО пациента: ", bold: true }),
        new TextRun(PATIENT_LINE),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Специалист: ", bold: true }),
        new TextRun(specialistName),
      ],
    }),
    new Paragraph({ text: "" }),
  ];
}
