import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Standalone offline SPA build used by the Electron desktop app.
export default defineConfig({
  root: path.resolve(import.meta.dirname, "."),
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "../src") },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "../dist-desktop"),
    emptyOutDir: true,
  },
});
