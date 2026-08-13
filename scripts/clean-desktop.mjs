import { rm } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

await Promise.all([
  rm(path.join(root, "dist-desktop"), { recursive: true, force: true }),
  rm(path.join(root, "electron-release"), { recursive: true, force: true }),
]);

console.log("removed previous desktop renderer and package output");