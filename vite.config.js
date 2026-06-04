import { defineConfig } from "vite";

/** Относительные пути — работают и на GitHub Pages (/repo/...), и локально. */
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        /** Старые закладки на mental-help-unified-itog.html */
        mentalHelpUnifiedItog: "mental-help-unified-itog.html",
      },
    },
  },
});
