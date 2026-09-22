import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SERVER_NAME, SERVER_VERSION } from "../src/index.js";

describe("bootstrap", () => {
  it("exposes server name", () => {
    expect(SERVER_NAME).toBe("jinja-intelligence");
  });

  it("keeps the version in sync with package.json", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
    expect(SERVER_VERSION).toBe(manifest.version);
  });
});
