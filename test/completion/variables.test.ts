import { CompletionItemKind } from "vscode-languageserver/node.js";
import { describe, expect, it } from "vitest";
import { complete, detectContext } from "../../src/features/completion/completion.js";

function labelsAt(text: string, offset: number): string[] {
  return complete(text, offset).map((i) => i.label);
}

function itemAt(text: string, offset: number, label: string) {
  const found = complete(text, offset).find((i) => i.label === label);
  expect(found).toBeDefined();
  return found!;
}

describe("variable completion", () => {
  it("offers loop variables inside their loop only", () => {
    const template = "{% for user in users %}{{ }} {{ }} {% endfor %}{{ }}";
    const inside = 24;
    const outside = template.length - 3;
    expect(detectContext(template, inside)).toBe("variable");
    const names = labelsAt(template, inside);
    expect(names).toContain("user");
    expect(names).toContain("loop");
    expect(names).toContain("users");
    expect(labelsAt(template, outside)).not.toContain("user");
    // `loop` remains as a global builtin outside, but not as a loop variable.
    expect(itemAt(template, outside, "loop")).toMatchObject({ detail: "builtin" });
    expect(itemAt(template, inside, "user")).toMatchObject({ detail: "loop variable" });
  });

  it("offers set variables, macros, imports, and builtins", () => {
    const template = '{% set title = "x" %}{% import "m.html" as m %}{% macro btn() %}{% endmacro %}{{ }}';
    const at = template.length - 3;
    expect(itemAt(template, at, "title")).toMatchObject({ detail: "set variable" });
    expect(itemAt(template, at, "m")).toMatchObject({ detail: "import" });
    expect(itemAt(template, at, "btn")).toMatchObject({ detail: "macro" });
    expect(itemAt(template, at, "range")).toMatchObject({ detail: "builtin" });
  });

  it("keeps macro params fenced inside their macro", () => {
    const template = "{% macro m(v) %}{{ }}{{ }}{% endmacro %}{{ }}";
    const inside = template.indexOf("{{ }}") + 3;
    const outside = template.length - 3;
    expect(itemAt(template, inside, "v")).toMatchObject({ detail: "macro parameter" });
    expect(labelsAt(template, outside)).not.toContain("v");
  });

  it("dedupes shadowed names innermost-first", () => {
    const template = "{% set x = 1 %}{% for x in items %}{{ }}{% endfor %}";
    const at = template.indexOf("{{ }}") + 3;
    const found = complete(template, at).filter((i) => i.label === "x");
    expect(found.length).toBe(1);
    expect(found[0]).toMatchObject({ detail: "loop variable" });
  });

  it("offers file-context names with provenance", () => {
    const at = "{{ products }} {{ }}".length - 3;
    expect(itemAt("{{ products }} {{ }}", at, "products")).toMatchObject({ detail: "context" });
  });
});

describe("property completion", () => {
  it("offers loop attributes on the loop variable", () => {
    const template = "{% for u in us %}{{ loop. }}{% endfor %}";
    const at = template.indexOf("loop.") + "loop.".length;
    expect(detectContext(template, at)).toBe("property");
    const names = labelsAt(template, at);
    for (const attr of ["index", "first", "last", "length"]) {
      expect(names).toContain(attr);
    }
    expect(itemAt(template, at, "index")).toMatchObject({ kind: CompletionItemKind.Field });
  });

  it("offers nothing for unknown bases", () => {
    expect(labelsAt("{{ user. }}", 8)).toEqual([]);
    expect(labelsAt("{{ unknown. }}", 11)).toEqual([]);
    expect(labelsAt('{% extends "base|" %}', 16)).toEqual([]);
  });
});

describe("variable context detection", () => {
  it("covers expression positions", () => {
    expect(detectContext("{{ }}", 3)).toBe("variable");
    expect(detectContext("{{ us }}", 4)).toBe("variable");
    expect(detectContext("{% set x = }}", 11)).toBe("variable");
    expect(detectContext("{% if }}", 6)).toBe("variable");
    expect(detectContext("{% for x in }}", 12)).toBe("variable");
    expect(detectContext("{{ f( }}", 6)).toBe("variable");
  });
});
