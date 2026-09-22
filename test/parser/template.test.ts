import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseTemplate } from "../../src/jinja/parser/parser.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("template", () => {
  it("interleaves text, outputs, and comments", () => {
    const result = parseTemplate("Hello {{ name }}!{# note #} Bye");
    expect(result.errors).toEqual([]);
    expect(result.root.children.map((c) => c.kind)).toEqual(["Text", "Output", "Text", "Comment", "Text"]);
    expect(result.root.start).toBe(0);
    expect(result.root.end).toBe("Hello {{ name }}!{# note #} Bye".length);
  });

  it("parses block tags as statements and preserves unknown tags as raw", () => {
    const result = parseTemplate("{% if user %}x{% endif %}");
    expect(result.errors).toEqual([]);
    expect(result.root.children.map((c) => c.kind)).toEqual(["If"]);
    const first = result.root.children[0];
    if (first?.kind !== "If") {
      throw new Error("Expected If node.");
    }
    expect(first.body.map((c) => c.kind)).toEqual(["Text"]);
    expect(first.elseBody).toBeNull();

    const unknown = parseTemplate("{% something %}");
    expect(unknown.errors).toEqual([]);
    expect(unknown.root.children.map((c) => c.kind)).toEqual(["RawStatement"]);
    const raw = unknown.root.children[0];
    if (raw?.kind === "RawStatement") {
      expect(raw.value).toBe("{% something %}");
    } else {
      throw new Error("Expected RawStatement.");
    }
  });

  it("tracks multiline positions", () => {
    const result = parseTemplate("a\n{{ x }}\n");
    const child = result.root.children[1];
    expect(child?.kind).toBe("Output");
    expect(child?.range.start).toEqual({ line: 1, character: 0 });
  });

  it("recovers from unterminated tags", () => {
    const result = parseTemplate("Hello {{ user");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.root.children.map((c) => c.kind)).toEqual(["Text", "Output"]);
  });

  it("parses the expression fixture and fuzz-survives truncation", () => {
    const fixture = readFileSync(join(here, "../fixtures/parser/expressions.j2"), "utf8");
    const result = parseTemplate(fixture);
    expect(result.errors).toEqual([]);
    expect(result.root.children.length).toBeGreaterThan(0);
    // Every truncation prefix must still produce a template without throwing.
    for (let n = 1; n < fixture.length; n += 7) {
      const partial = parseTemplate(fixture.slice(0, n));
      expect(partial.root.kind).toBe("Template");
    }
  });
});
