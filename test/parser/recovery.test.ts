import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseTemplate } from "../../src/jinja/parser/parser.js";

const here = dirname(fileURLToPath(import.meta.url));

function codes(source: string): string[] {
  return parseTemplate(source).errors.map((e) => e.code);
}

describe("recovery", () => {
  it("reports missing end tags but keeps partial trees", () => {
    const missing = parseTemplate("{% if a %}x");
    expect(codes("{% if a %}x")).toContain("missing-end-tag");
    expect(missing.root.children[0]?.kind).toBe("If");

    expect(codes("{% for x in y %}{{ x }}")).toContain("missing-end-tag");
    expect(codes("{% block content %}x")).toContain("missing-end-tag");
    expect(codes("{% macro btn() %}x")).toContain("missing-end-tag");
  });

  it("reports mismatched ends and continues", () => {
    const result = parseTemplate("{% if a %}{% endfor %}");
    expect(codes("{% if a %}{% endfor %}")).toContain("mismatched-end-tag");
    // The stray endfor is consumed; the if still terminates at EOF.
    expect(codes("{% if a %}{% endfor %}")).toContain("missing-end-tag");
    expect(result.root.children[0]?.kind).toBe("If");
  });

  it("treats stray ends and dangling elif/else as raw with errors", () => {
    expect(codes("{% endif %}")).toContain("mismatched-end-tag");
    expect(parseTemplate("{% endif %}").root.children[0]?.kind).toBe("RawStatement");
    expect(codes("{% else %}")).toContain("mismatched-end-tag");
    expect(codes("{% elif a %}")).toContain("mismatched-end-tag");
  });

  it("keeps unknown tags silent and exact", () => {
    const result = parseTemplate("{% fro x %}");
    expect(result.errors).toEqual([]);
    const child = result.root.children[0];
    if (child?.kind !== "RawStatement") {
      throw new Error("Expected RawStatement.");
    }
    expect(child.value).toBe("{% fro x %}");
  });

  it("handles truncated headers", () => {
    expect(codes("{% set %}")).toContain("expected-statement");
    expect(codes("{% set x = %}")).toContain("expected-expression");
    expect(codes("{% block %}x{% endblock %}")).toContain("expected-block-name");
    expect(codes("{% for %}")).toContain("expected-statement");
    expect(codes("{% macro %}x{% endmacro %}")).toContain("expected-block-name");
  });

  it("recovers through the recovery fixture and fuzz truncation", () => {
    const fixture = readFileSync(join(here, "../fixtures/parser/recovery.j2"), "utf8");
    const result = parseTemplate(fixture);
    expect(result.root.kind).toBe("Template");
    expect(result.errors.length).toBeGreaterThan(0);
    for (let n = 1; n < fixture.length; n += 11) {
      const partial = parseTemplate(fixture.slice(0, n));
      expect(partial.root.kind).toBe("Template");
    }
  });

  it("parses statement and block fixtures cleanly", () => {
    for (const name of ["statements.j2", "blocks.j2"]) {
      const source = readFileSync(join(here, `../fixtures/parser/${name}`), "utf8");
      const result = parseTemplate(source);
      expect(result.errors).toEqual([]);
      expect(result.root.children.length).toBeGreaterThan(0);
    }
  });
});
