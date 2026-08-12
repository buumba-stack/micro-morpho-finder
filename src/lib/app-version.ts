/**
 * Single authoritative source for the MicroFluor version.
 *
 * The value comes from `package.json` at build time (injected by vite.config.ts
 * as __MICROFLUOR_PKG_VERSION__). Nothing else in the codebase hard-codes it.
 */

declare const __MICROFLUOR_PKG_VERSION__: string | undefined;

function pkgVersion(): string {
  try {
    return typeof __MICROFLUOR_PKG_VERSION__ === "string" ? __MICROFLUOR_PKG_VERSION__ : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Full semver from package.json, e.g. "2.5.0". */
export const MICROFLUOR_SEMVER = pkgVersion();

/** Product version shown to users and written to exports, e.g. "2.5". */
export const MICROFLUOR_VERSION = MICROFLUOR_SEMVER.split(".").slice(0, 2).join(".");

/** Minimum client version allowed to use the AI endpoints. */
export const MIN_AI_CLIENT_VERSION = "2.5";

/** Header used by clients to declare their own version to the AI endpoints. */
export const CLIENT_VERSION_HEADER = "X-MicroFluor-Client-Version";
