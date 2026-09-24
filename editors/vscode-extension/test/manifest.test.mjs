import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const root = new URL("..", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const languageConfig = JSON.parse(readFileSync(new URL("language-configuration.json", root), "utf8"));

describe("extension manifest", () => {
  it("declares the LSP activation surface", () => {
    assert.ok(manifest.main.endsWith("out/extension.js"));
    assert.ok(manifest.activationEvents.includes("onLanguage:jinja"));
    const ids = manifest.contributes.languages.map((l) => l.id);
    assert.ok(ids.includes("jinja"));
    const extensions = manifest.contributes.languages.flatMap((l) => l.extensions);
    for (const ext of [".j2", ".jinja", ".jinja2"]) {
      assert.ok(extensions.includes(ext), `missing ${ext}`);
    }
  });

  it("mirrors the server configuration surface", () => {
    const props = manifest.contributes.configuration.properties;
    assert.deepEqual(props["jinjaIntelligence.templateDirectories"].default, []);
    assert.deepEqual(props["jinjaIntelligence.templateExtensions"].default, [".jinja", ".jinja2", ".j2"]);
    assert.equal(props["jinjaIntelligence.maxLogLines"].default, 500);
  });

  it("configures Jinja brackets and comments", () => {
    assert.deepEqual(languageConfig.comments.blockComment, ["{#", "#}"]);
    assert.ok(
      languageConfig.brackets.some((b) => b[0] === "{%" && b[1] === "%}"),
      "statement brackets",
    );
  });
});
