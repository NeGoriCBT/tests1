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
        hdrs: "hdrs.html",
        hars: "hars.html",
        scl90: "scl90.html",
      },
    },
  },
});
