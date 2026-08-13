import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import path from "node:path";

const pkg = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "../package.json"), "utf8"),
) as { version?: string };

// Standalone offline SPA build used by the Electron desktop app.
// MICROFLUOR_BUILD_TARGET=desktop: always the full analyzer, never the
// pre-publication shell used by the public web build.
export default defineConfig({
  root: path.resolve(import.meta.dirname, "."),
  base: "./",
  plugins: [react(), tailwindcss()],
  define: {
    __MICROFLUOR_PKG_VERSION__: JSON.stringify(pkg.version ?? "0.0.0"),
    __MICROFLUOR_PREPUBLICATION__: "false",
    __MICROFLUOR_DESKTOP__: "true",
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "../src") },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "../dist-desktop"),
    emptyOutDir: true,
  },
});
