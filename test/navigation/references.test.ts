import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { references } from "../../src/features/references/references.js";

const URI = "file:///refs.j2";

function fixture(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, "../fixtures/navigation/refs.j2"), "utf8");
}

function linesAt(text: string, locations: { range: { start: { line: number } } }[]): number[] {
  void text;
  return locations.map((l) => l.range.start.line);
}

describe("references", () => {
  it("finds loop variable uses, not the iterable", () => {
    const text = fixture();
    const at = text.indexOf("{{ user.name }}") + 3;
    const found = references(text, URI, at, false);
    // Two `user` uses (user.name base, plus none other) — never `users`.
    expect(found.length).toBe(1);
    expect(linesAt(text, found)).toEqual([2]);
  });

  it("isolates shadowed scopes", () => {
    const text = "{% set x = 1 %}{% for x in items %}{{ x }}{% endfor %}{{ x }}";
    const inner = references(text, URI, text.indexOf("{{ x }}") + 3, false);
    expect(inner.length).toBe(1);
    const outer = references(text, URI, text.length - 3, false);
    expect(outer.length).toBe(1);
    expect(inner[0]?.range).not.toEqual(outer[0]?.range);
  });

  it("finds macro call sites and import uses", () => {
    const text = fixture();
    const call = text.indexOf('{{ badge("hi") }}') + 3;
    const found = references(text, URI, call, false);
    expect(found.length).toBe(1);
    const alias = text.indexOf("{{ forms }}") + 3;
    expect(references(text, URI, alias, false).length).toBe(1);
  });

  it("includes the declaration only on request", () => {
    const text = "{% set title = 1 %}{{ title }}";
    const at = text.indexOf("{{ title }}") + 3;
    expect(references(text, URI, at, false).length).toBe(1);
    const withDecl = references(text, URI, at, true);
    expect(withDecl.length).toBe(2);
    expect(withDecl[0]?.range.start.line).toBe(0);
  });

  it("returns nothing for externals, segments, and keywords", () => {
    const text = fixture();
    expect(references(text, URI, text.indexOf("{{ missing }}") + 3, true)).toEqual([]);
    expect(references(text, URI, text.indexOf("user.name") + 5, true)).toEqual([]);
    expect(references(text, URI, text.indexOf("{% for") + 3, true)).toEqual([]);
    expect(references(text, URI, 0, true)).toEqual([]);
  });

  it("never throws on hostile input", () => {
    for (const text of ["{{", "{% for", ""]) {
      expect(references(text, URI, text.length, true)).toEqual([]);
    }
  });
});
