import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Relative base so the same build works on GitHub project pages
// (https://<user>.github.io/lifemanager/) and on a local preview.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    assetsDir: "assets",
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        english: fileURLToPath(new URL("./english/index.html", import.meta.url)),
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
});
