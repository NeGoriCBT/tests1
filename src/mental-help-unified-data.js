/**
 * Полная анкета Mental Help: жалобы → анамнез жизни → анамнез заболевания → один документ Word.
 */
import { MH_STEPS } from "./mental-help-data.js";
import { DISEASE_STRUCTURED_ID } from "./mental-help-v2-disease.js";
import { LIFE_STRUCTURED_ID } from "./mental-help-v2-life.js";

const complaintsStep = MH_STEPS.find((s) => s.id === "complaints");
const lifeLead = MH_STEPS.find((s) => s.id === "life-v1")?.blockLead;

if (!complaintsStep) {
  throw new Error("MH_STEPS: шаг «complaints» не найден");
}

/** @type {typeof MH_STEPS} */
export const MH_STEPS_UNIFIED = [
  complaintsStep,
  {
    id: LIFE_STRUCTURED_ID,
    wordKey: "life",
    codeLabel: "Анамнез жизни",
    blockLead: lifeLead
      ? {
          title: "2 блок. Анамнез жизни",
          intro: lifeLead.intro,
        }
      : {
          title: "2 блок. Анамнез жизни",
          intro:
            "Эта информация поможет врачу составить более полную картину. Здесь нет «правильных» или «неправильных» ответов — важна любая деталь, которую вы готовы сообщить.",
        },
    prompt: "",
  },
  {
    id: DISEASE_STRUCTURED_ID,
    wordKey: "disease",
    codeLabel: "Анамнез заболевания",
    blockLead: {
      title: "3 блок. Анамнез заболевания",
      intro:
        "История заболевания по эпизодам: даты, симптомы, стрессоры, обращения к врачам и назначенное лечение. В конце текущего эпизода — причина обращения в клинику Mental Help.",
    },
    prompt: "",
  },
];
