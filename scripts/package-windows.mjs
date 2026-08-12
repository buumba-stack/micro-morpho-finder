/**
 * Builds and packages the Windows x64 MicroFluor distribution.
 *
 * Produces: electron-release/MicroFluor-win32-x64/ and /mnt/documents/MicroFluor-Windows-x64.zip
 *
 * Licensing layout inside the distribution:
 *   MicroFluor.exe
 *   LICENSE.txt                                      (proprietary, Buumba Hampuwo)
 *   THIRD-PARTY-LICENSES/ELECTRON-LICENSE.txt         (Electron's own LICENSE, unmodified)
 *   THIRD-PARTY-LICENSES/LICENSES.chromium.html       (Chromium notices, unmodified)
 *   THIRD-PARTY-LICENSES/THIRD-PARTY-NOTICES.txt
 */
import { cp, mkdir, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { packager } from "@electron/packager";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "electron-release");

/** package.json is the single authoritative source of the MicroFluor version. */
const appVersion = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version;


const exists = (p) =>
  stat(p).then(
    () => true,
    () => false,
  );

const appPaths = await packager({
  dir: root,
  name: "MicroFluor",
  platform: "win32",
  arch: "x64",
  out: outDir,
  overwrite: true,
  asar: true,
  appVersion,
  appCopyright: "Copyright © 2026 Buumba Hampuwo. All Rights Reserved.",
  win32metadata: {
    CompanyName: "Buumba Hampuwo",
    ProductName: "MicroFluor",
    FileDescription: "MicroFluor",
    InternalName: "MicroFluor",
    OriginalFilename: "MicroFluor.exe",
  },
  // Ship only what the desktop app needs at runtime: the built SPA + the
  // Electron main process. Everything else is development-only.
  ignore: [
    /^\/src($|\/)/,
    /^\/public($|\/)/,
    /^\/desktop($|\/)/,
    /^\/scripts($|\/)/,
    /^\/dist($|\/)/,
    /^\/node_modules($|\/)/,
    /^\/electron-release($|\/)/,
    /^\/\.lovable($|\/)/,
    /^\/\.git($|\/)/,
    /^\/AGENTS\.md$/,
    /^\/README\.md$/,
    /^\/components\.json$/,
    /^\/eslint\.config\..*$/,
    /^\/tsconfig.*\.json$/,
    /^\/vite\.config\..*$/,
    /^\/bunfig\.toml$/,
    /^\/bun\.lock$/,
    /^\/package-lock\.json$/,
    /^\/\.prettier.*$/,
    /^\/\.tanstack($|\/)/,
    /^\/\.workspace($|\/)/,
    /^\/\.gitignore$/,
    /^\/tsconfig\.tsbuildinfo$/,
    /\.map$/,
  ],
});

const appDir = appPaths[0];
const tpl = path.join(appDir, "THIRD-PARTY-LICENSES");
await mkdir(tpl, { recursive: true });

// Preserve Electron's own LICENSE (never overwrite it with the proprietary one).
const electronLicense = path.join(appDir, "LICENSE");
if (await exists(electronLicense)) {
  await rename(electronLicense, path.join(tpl, "ELECTRON-LICENSE.txt"));
}
const chromium = path.join(appDir, "LICENSES.chromium.html");
if (await exists(chromium)) {
  await rename(chromium, path.join(tpl, "LICENSES.chromium.html"));
}

await cp(path.join(root, "LICENSE.txt"), path.join(appDir, "LICENSE.txt"));
await cp(
  path.join(root, "THIRD-PARTY-LICENSES", "THIRD-PARTY-NOTICES.txt"),
  path.join(tpl, "THIRD-PARTY-NOTICES.txt"),
);

await rm(path.join(appDir, "version"), { force: true });

console.log("packaged:", appDir);
console.log("top level:", (await readdir(appDir)).join(", "));
console.log("third-party:", (await readdir(tpl)).join(", "));
