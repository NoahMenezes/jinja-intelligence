import { describe, expect, it } from "vitest";
import type { Expression } from "../../src/jinja/ast/nodes.js";
import { parseTemplate } from "../../src/jinja/parser/parser.js";

function exprOf(source: string): Expression {
  const result = parseTemplate(source);
  expect(result.errors).toEqual([]);
  const child = result.root.children[0];
  expect(child?.kind).toBe("Output");
  if (child?.kind !== "Output") {
    throw new Error("Expected an Output node.");
  }
  return child.expr;
}

describe("expressions", () => {
  it("parses literals", () => {
    expect(exprOf("{{ 42 }}")).toMatchObject({ kind: "NumberLiteral", value: 42 });
    expect(exprOf("{{ 3.5 }}")).toMatchObject({ kind: "NumberLiteral", value: 3.5 });
    expect(exprOf('{{ "hi" }}')).toMatchObject({ kind: "StringLiteral" });
    expect(exprOf("{{ true }}")).toMatchObject({ kind: "BooleanLiteral", value: true });
    expect(exprOf("{{ none }}")).toMatchObject({ kind: "NoneLiteral" });
  });

  it("parses property access, indexing, and calls", () => {
    expect(exprOf("{{ user.name }}")).toMatchObject({
      kind: "PropertyAccess",
      property: "name",
    });
    expect(exprOf("{{ items[0] }}")).toMatchObject({ kind: "IndexAccess" });
    const call = exprOf("{{ greet(user, greeting='hi') }}");
    expect(call.kind).toBe("Call");
    if (call.kind === "Call") {
      expect(call.args.length).toBe(2);
      expect(call.args[1]?.name).toBe("greeting");
    }
  });

  it("parses filters and tests", () => {
    const filter = exprOf('{{ user.name | default("anon") }}');
    expect(filter).toMatchObject({ kind: "Filter", name: "default" });
    const chained = exprOf("{{ items | join(', ') | upper }}");
    expect(chained).toMatchObject({ kind: "Filter", name: "upper" });
    const test = exprOf("{{ user is defined }}");
    expect(test).toMatchObject({ kind: "Test", name: "defined", negated: false });
    expect(exprOf("{{ user is not defined }}")).toMatchObject({ negated: true });
  });

  it("respects operator precedence", () => {
    // a + b * c -> a + (b * c)
    const add = exprOf("{{ a + b * c }}");
    expect(add.kind).toBe("Binary");
    if (add.kind === "Binary") {
      expect(add.op).toBe("+");
      expect(add.right).toMatchObject({ kind: "Binary", op: "*" });
    }
    // not a and b -> (not a) and b
    const logical = exprOf("{{ not a and b }}");
    expect(logical).toMatchObject({ kind: "Logical", op: "and" });
    // chained comparison
    expect(exprOf("{{ a < b <= c }}")).toMatchObject({ kind: "Compare" });
    expect(exprOf("{{ x not in items }}")).toMatchObject({ kind: "Compare" });
  });

  it("parses conditionals, collections, and groups", () => {
    expect(exprOf("{{ a if cond else b }}")).toMatchObject({ kind: "Conditional" });
    expect(exprOf("{{ [1, 2] }}")).toMatchObject({ kind: "ListLiteral" });
    expect(exprOf("{{ (a, b) }}")).toMatchObject({ kind: "TupleLiteral" });
    expect(exprOf("{{ {'k': v} }}")).toMatchObject({ kind: "DictLiteral" });
    expect(exprOf("{{ (a + b) * c }}")).toMatchObject({ kind: "Binary", op: "*" });
  });

  it("preserves source ranges", () => {
    const result = parseTemplate("{{ user.name }}");
    const child = result.root.children[0];
    expect(child?.kind).toBe("Output");
    if (child?.kind === "Output") {
      expect(child.start).toBe(0);
      expect(child.end).toBe("{{ user.name }}".length);
      expect(child.range.start).toEqual({ line: 0, character: 0 });
      expect(child.expr.kind).toBe("PropertyAccess");
    }
  });

  it("recovers from malformed expressions without throwing", () => {
    for (const source of ["{{ user. }}", "{{ user | }}", "{{ (a + }}", "{{ }}", "{{ a +", "{{ user"]) {
      const result = parseTemplate(source);
      expect(result.root.kind).toBe("Template");
      expect(result.root.children.length).toBeGreaterThan(0);
      expect(result.errors.length).toBeGreaterThan(0);
    }
    // Missing property records a null name, not a crash.
    const dot = parseTemplate("{{ user. }}");
    const child = dot.root.children[0];
    if (child?.kind === "Output") {
      expect(child.expr).toMatchObject({ kind: "PropertyAccess", property: null });
    } else {
      throw new Error("Expected Output for '{{ user. }}'.");
    }
  });
});
