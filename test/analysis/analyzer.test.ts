import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lookup, scopeAt } from "../../src/jinja/analysis/scope.js";
import { LOOP_ATTRIBUTES, type Symbol } from "../../src/jinja/analysis/symbols.js";
import { parseTemplate } from "../../src/jinja/parser/parser.js";
import { analyzeTemplate, resolveAt } from "../../src/jinja/analysis/analyzer.js";

function analyze(source: string) {
  return analyzeTemplate(parseTemplate(source).root);
}

function kinds(analysis: ReturnType<typeof analyzeTemplate>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const symbol of analysis.symbols) {
    out[symbol.name] = symbol.kind;
  }
  return out;
}

describe("symbols", () => {
  it("exposes loop attributes documentation", () => {
    for (const attr of ["index", "first", "last", "length"]) {
      expect(LOOP_ATTRIBUTES).toContain(attr);
    }
  });

  it("classifies loop-local versus external names", () => {
    const analysis = analyze("{% for user in users %}{{ user.name }}{% endfor %}");
    expect(kinds(analysis)).toMatchObject({ user: "Loop", loop: "Loop" });
    expect(analysis.externals).toContain("users");
    expect(analysis.externals).not.toContain("user");
  });

  it("treats set targets as Set symbols", () => {
    const analysis = analyze("{% set username = user.name %}{{ username }}");
    expect(kinds(analysis)).toMatchObject({ username: "Set" });
    expect(analysis.externals).toContain("user");
  });
});

describe("scope", () => {
  it("resolves innermost shadowing first", () => {
    const analysis = analyze("{% set x = 1 %}{% for x in items %}{{ x }}{% endfor %}");
    const use = analysis.occurrences.find((o) => o.name === "x" && o.start > 30);
    expect(use).toBeDefined();
    if (use === undefined) {
      throw new Error("Expected an occurrence.");
    }
    const resolved = lookup(use.scope, "x");
    expect(resolved?.kind).toBe("Loop");
  });

  it("keeps macro params isolated from outer scope", () => {
    const analysis = analyze("{% set v = 1 %}{% macro m(v) %}{{ v }}{% endmacro %}{{ v }}");
    const inner = analysis.occurrences.find((o) => o.name === "v" && o.start > 30 && o.start < 45);
    const outer = analysis.occurrences.filter((o) => o.name === "v").pop();
    expect(inner).toBeDefined();
    expect(outer).toBeDefined();
    if (inner === undefined || outer === undefined) {
      throw new Error("Expected occurrences.");
    }
    expect(lookup(inner.scope, "v")?.kind).toBe("MacroParam");
    expect(lookup(outer.scope, "v")?.kind).toBe("Set");
  });

  it("finds the deepest scope at an offset", () => {
    const analysis = analyze("{% for u in us %}{{ u }}{% endfor %}");
    const use = analysis.occurrences.find((o) => o.name === "u");
    expect(use).toBeDefined();
    if (use === undefined) {
      throw new Error("Expected an occurrence.");
    }
    const scope = scopeAt(analysis.root, use.start);
    expect(scope?.kind).toBe("For");
    expect(scopeAt(analysis.root, -1)).toBeNull();
  });
});

describe("analyzer", () => {
  it("resolves property bases but not segments", () => {
    const analysis = analyze("{% for user in users %}{{ user.name }}{% endfor %}");
    const text = "{% for user in users %}{{ user.name }}{% endfor %}";
    const base = text.indexOf("user.name");
    const resolved = resolveAt(analysis, base);
    expect(resolved?.kind).toBe("Loop");
    expect(resolveAt(analysis, base + "user.".length)).toBeNull();
  });

  it("resolves imports, macros, blocks, and with-names", () => {
    const analysis = analyze(
      '{% import "m.html" as m %}{% from "n.html" import b as c %}{% macro k() %}{% endmacro %}{% block t %}x{% endblock %}{% with w=1 %}{{ m }}{{ c }}{{ k }}{{ w }}{% endwith %}',
    );
    expect(kinds(analysis)).toMatchObject({ m: "Import", c: "Import", k: "Macro", t: "Block", w: "With" });
    for (const name of ["m", "c", "k", "w"]) {
      const use = analysis.occurrences.find((o) => o.name === name);
      expect(use).toBeDefined();
      if (use === undefined) {
        throw new Error(`Expected occurrence of ${name}.`);
      }
      expect(lookup(use.scope, name)).not.toBeNull();
    }
  });

  it("ignores call kwargs, filter names, and literals", () => {
    const analysis = analyze('{{ greet(user, greeting="hi") | upper }}');
    expect(analysis.occurrences.map((o) => o.name).sort()).toEqual(["greet", "user"]);
    expect(analysis.externals).toContain("greet");
    expect(analysis.externals).toContain("user");
    expect(analysis.externals).not.toContain("greeting");
    expect(analysis.externals).not.toContain("upper");
  });

  it("survives truncated templates and resolves nothing out of bounds", () => {
    for (const source of ["{% for user in users %}{{ user.", "{% set x =", "{% macro", "{{"]) {
      const analysis = analyze(source);
      expect(analysis.root.kind).toBe("Template");
      expect(resolveAt(analysis, 9999)).toBeNull();
    }
  });

  it("analyzes the scopes fixture and survives truncation", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const fixture = readFileSync(join(here, "../fixtures/analysis/scopes.j2"), "utf8");
    expect(parseTemplate(fixture).errors).toEqual([]);
    const analysis = analyze(fixture);
    expect(kinds(analysis)).toMatchObject({
      user: "Loop",
      label: "Set",
      site: "Set",
      badge: "Macro",
      text: "MacroParam",
      forms: "Import",
      btn: "Import",
      content: "Block",
      mode: "With",
    });
    expect(analysis.externals).toEqual(
      expect.arrayContaining(["users", "config", "missing_var"]),
    );
    expect(analysis.externals).not.toContain("user");
    for (let n = 1; n < fixture.length; n += 13) {
      const partial = analyze(fixture.slice(0, n));
      expect(partial.root.kind).toBe("Template");
      expect(resolveAt(partial, n - 1)).toBeDefined();
    }
  });
});
