import { describe, expect, it } from "vitest";
import { findMacro, templateReferences, unquote } from "../../src/jinja/ast/query.js";
import { parseTemplate } from "../../src/jinja/parser/parser.js";

describe("query", () => {
  it("collects template references and ignores other strings", () => {
    const root = parseTemplate(
      '{% extends "base.j2" %}{% include "a.j2" ignore missing %}{% import "m.j2" as m %}{% from "n.j2" import x %}{{ y | default("d") }}',
    ).root;
    const refs = templateReferences(root);
    expect(refs.map((r) => r.expr.value)).toEqual(['"base.j2"', '"a.j2"', '"m.j2"', '"n.j2"']);
  });

  it("finds macros by name, nested included", () => {
    const root = parseTemplate("{% if a %}{% macro btn() %}x{% endmacro %}{% endif %}").root;
    expect(findMacro(root, "btn")?.kind).toBe("Macro");
    expect(findMacro(root, "missing")).toBeNull();
  });

  it("unquotes string literals", () => {
    const root = parseTemplate('{% extends "base.j2" %}').root;
    const ref = templateReferences(root)[0];
    expect(ref).toBeDefined();
    expect(unquote(ref!.expr)).toBe("base.j2");
    expect(unquote(null)).toBeNull();
  });
});
