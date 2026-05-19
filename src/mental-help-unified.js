import { initMentalHelpApp } from "./mental-help-app.js";
import { MH_STEPS_UNIFIED } from "./mental-help-unified-data.js";

initMentalHelpApp({
  wordFileBase: "MentalHelp_polnaia_anketa",
  wordSubtitle: "Полная анкета Mental Help (жалобы, анамнез жизни, анамнез заболевания)",
  steps: MH_STEPS_UNIFIED,
  unifiedWordPreviewRoot: document.getElementById("mh-unified-word-preview-wrap"),
  unifiedWordPreviewResultsRoot: document.getElementById("mh-unified-word-preview-wrap-results"),
});
