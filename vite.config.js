import { defineConfig } from "vite";

/** Относительные пути — работают и на GitHub Pages (/repo/...), и локально. */
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        bdi: "bdi.html",
        bai: "bai.html",
        scl90: "scl90.html",
        fficd: "fficd.html",
        sifs: "sifs.html",
        mentalHelp: "mental-help.html",
        mentalHelpV2: "mental-help-v2.html",
        mentalHelpLifeOnly: "mental-help-life-only.html",
        mentalHelpDisease: "mental-help-disease.html",
        mentalHelpUnified: "mental-help-unified.html",
        mentalHelpUnifiedItog: "mental-help-unified-itog.html",
      },
    },
  },
});
