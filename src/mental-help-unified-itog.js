import { initMentalHelpApp } from "./mental-help-app.js";
import { MH_STEPS_UNIFIED_ITOG } from "./mental-help-unified-itog-data.js";
import { mountItogCategoryNav, setItogMode } from "./mental-help-itog-ui.js";

setItogMode(true);

initMentalHelpApp({
  variant: "itog",
  wordFileBase: "MentalHelp_polnaia_anketa_itog",
  wordSubtitle: "Полная анкета — итог (жалобы, анамнез жизни, анамнез заболевания)",
  steps: MH_STEPS_UNIFIED_ITOG,
  unifiedWordPreviewRoot: document.getElementById("mh-unified-word-preview-wrap"),
  unifiedWordPreviewResultsRoot: document.getElementById("mh-unified-word-preview-wrap-results"),
});

const wizardEl = document.getElementById("mh-step-wizard");
if (wizardEl) mountItogCategoryNav(wizardEl);
