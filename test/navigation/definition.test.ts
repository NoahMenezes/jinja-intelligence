import { describe, expect, it } from "vitest";
import { definition, type DefinitionContext } from "../../src/features/definition/definition.js";

const FILES: Record<string, string> = {
  "file:///proj/base.j2": "<title>x</title>",
  "file:///proj/macros.j2": '{% macro button(label, type="primary") %}x{% endmacro %}',
};

const CTX: DefinitionContext = {
  roots: ["file:///proj"],
  templateDirs: [],
  readFile: (uri: string) => FILES[uri] ?? null,
};

const CHILD = "file:///proj/child.j2";

describe("definition", () => {
  it("jumps template strings to files", () => {
    const text = '{% extends "base.j2" %}';
    const found = definition(text, CHILD, 14, CTX);
    expect(found?.uri).toBe("file:///proj/base.j2");
    expect(found?.range).toEqual({ start: { line: 0, character: 0 }, end: { line: 0, character: 0 } });
  });

  it("returns null for missing files and dynamic parents", () => {
    expect(definition('{% extends "nope.j2" %}', CHILD, 14, CTX)).toBeNull();
    expect(definition("{% extends name %}", CHILD, 12, CTX)).toBeNull();
    expect(definition("plain text", CHILD, 3, CTX)).toBeNull();
  });

  it("jumps local names to same-file definitions", () => {
    const text = "{% for user in users %}{{ user.name }}{% endfor %}";
    const found = definition(text, CHILD, 30, CTX);
    expect(found?.uri).toBe(CHILD);
    expect(found?.range.start).toBeDefined();
  });

  it("jumps imported macros to the macro in the target file", () => {
    const text = '{% from "macros.j2" import button %}{{ button("Go") }}';
    // On the import binding itself.
    const binding = definition(text, CHILD, 30, CTX);
    expect(binding?.uri).toBe("file:///proj/macros.j2");
    // On the call site.
    const use = definition(text, CHILD, 42, CTX);
    expect(use?.uri).toBe("file:///proj/macros.j2");
    expect(use?.range.start.line).toBe(0);
  });

  it("jumps alias segments through imports", () => {
    const text = '{% import "macros.j2" as m %}{{ m.button() }}';
    // Over `button` (property segment).
    const found = definition(text, CHILD, 37, CTX);
    expect(found?.uri).toBe("file:///proj/macros.j2");
  });

  it("never throws on hostile input", () => {
    for (const text of ["{{", "{% extends", "{% from", "{% import", ""]) {
      expect(definition(text, CHILD, text.length, CTX)).toBeDefined();
    }
    expect(definition("{{ x }}", "untitled:y", 4, CTX)).toBeDefined();
  });
});
