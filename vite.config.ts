// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { readFileSync } from "node:fs";
import path from "node:path";

import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// package.json is the single authoritative source of the MicroFluor version.
const pkg = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "package.json"), "utf8"),
) as { version?: string };

/**
 * Build target for the browser-facing bundle.
 *
 *   web-prepublication (default) — the public entry point is the reviewer gate:
 *     unauthorized visitors get only the pre-publication notice + access-key
 *     field, and the analyzer is a lazily loaded chunk requested solely after
 *     the server validated a signed anonymous reviewer token. Backend/API
 *     routes and /auth stay untouched.
 *   web-full — public MicroFluor web analyzer with no pre-publication framing.
 *
 * The desktop/Electron bundle uses desktop/vite.config.ts and is unaffected.
 */
const BUILD_TARGET = process.env["MICROFLUOR_BUILD_TARGET"] ?? "web-prepublication";
const PREPUBLICATION = BUILD_TARGET !== "web-full" && BUILD_TARGET !== "desktop";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: {
      __MICROFLUOR_PKG_VERSION__: JSON.stringify(pkg.version ?? "0.0.0"),
      __MICROFLUOR_PREPUBLICATION__: JSON.stringify(PREPUBLICATION),
      __MICROFLUOR_DESKTOP__: "false",
    },
    build: { sourcemap: false },
  },
});
