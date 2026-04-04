import { defineConfig } from "vite";

/** Для GitHub Pages: сайт в подкаталоге /tests1/ */
const BASE = "/tests1/";

export default defineConfig(({ command }) => ({
  base: command === "build" ? BASE : "/",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        bdi: "bdi.html",
        bai: "bai.html",
      },
    },
  },
}));
