import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Copies the built language server (repo-root dist/) into the extension
// package so `vsce package` ships a self-contained .vsix.
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const serverDist = join(root, "dist");
const target = join(here, "..", "dist");

if (!existsSync(join(serverDist, "server.js"))) {
  console.error("Server dist not found. Run `bun run build` from the repo root first.");
  process.exit(1);
}
mkdirSync(target, { recursive: true });
cpSync(serverDist, target, { recursive: true });
console.log(`Bundled server from ${serverDist}`);

// The extension package must be self-contained for `vsce package`.
for (const file of ["LICENSE"]) {
  cpSync(join(root, file), join(here, "..", file));
}
