/**
 * Полная анкета — итог: те же шаги и Word, что unified; отдельные подписи для UI.
 */
import { MH_STEPS_UNIFIED } from "./mental-help-unified-data.js";
import { LIFE_STRUCTURED_ID } from "./mental-help-v2-life.js";
import { DISEASE_STRUCTURED_ID } from "./mental-help-v2-disease.js";

/** @type {typeof MH_STEPS_UNIFIED} */
export const MH_STEPS_UNIFIED_ITOG = MH_STEPS_UNIFIED.map((step) => {
  if (step.id === "complaints") {
    return {
      ...step,
      blockLead: {
        title: "1. Жалобы",
        intro: "Отметьте, что беспокоит вас сейчас. У каждого блока есть кнопка «?» с пояснением.",
      },
    };
  }
  if (step.id === LIFE_STRUCTURED_ID) {
    return {
      ...step,
      blockLead: {
        title: "2. Анамнез жизни",
        intro:
          "Биография и здоровье: семья, детство, школа, работа, болезни. Наведите на «?», если непонятно, зачем вопрос.",
      },
    };
  }
  if (step.id === DISEASE_STRUCTURED_ID) {
    return {
      ...step,
      blockLead: {
        title: "3. Анамнез заболевания",
        intro:
          "История по эпизодам: когда началось, симптомы, стрессоры, врачи и лечение. Текст для Word собирается автоматически.",
      },
    };
  }
  return step;
});
