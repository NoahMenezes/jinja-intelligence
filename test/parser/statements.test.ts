import { describe, expect, it } from "vitest";
import type { TemplateChild } from "../../src/jinja/ast/nodes.js";
import { parseTemplate } from "../../src/jinja/parser/parser.js";

function only(source: string): TemplateChild {
  const result = parseTemplate(source);
  expect(result.errors).toEqual([]);
  expect(result.root.children.length).toBe(1);
  const child = result.root.children[0];
  if (child === undefined) {
    throw new Error("Expected one child.");
  }
  return child;
}

describe("statements", () => {
  it("parses if/elif/else", () => {
    const node = only("{% if a %}x{% elif b %}y{% else %}z{% endif %}");
    if (node.kind !== "If") {
      throw new Error(`Expected If, got ${node.kind}.`);
    }
    expect(node.condition).toMatchObject({ kind: "Identifier", name: "a" });
    expect(node.body.map((c) => c.kind)).toEqual(["Text"]);
    expect(node.elifs.length).toBe(1);
    expect(node.elifs[0]?.condition).toMatchObject({ kind: "Identifier", name: "b" });
    expect(node.elseBody?.map((c) => c.kind)).toEqual(["Text"]);
    expect(node.start).toBe(0);
    expect(node.end).toBe("{% if a %}x{% elif b %}y{% else %}z{% endif %}".length);
  });

  it("parses for loops with else and recursive", () => {
    const node = only("{% for user in users recursive %}{{ user }}{% else %}empty{% endfor %}");
    if (node.kind !== "For") {
      throw new Error(`Expected For, got ${node.kind}.`);
    }
    expect(node.targets).toEqual(["user"]);
    expect(node.iterable).toMatchObject({ kind: "Identifier", name: "users" });
    expect(node.recursive).toBe(true);
    expect(node.body[0]?.kind).toBe("Output");
    expect(node.elseBody?.map((c) => c.kind)).toEqual(["Text"]);
  });

  it("parses tuple targets in for loops", () => {
    const node = only("{% for k, v in mapping %}{% endfor %}");
    if (node.kind !== "For") {
      throw new Error(`Expected For, got ${node.kind}.`);
    }
    expect(node.targets).toEqual(["k", "v"]);
  });

  it("parses set in both forms", () => {
    const value = only("{% set x = 1 + 2 %}");
    if (value.kind !== "Set") {
      throw new Error(`Expected Set, got ${value.kind}.`);
    }
    expect(value.target).toBe("x");
    expect(value.value).toMatchObject({ kind: "Binary", op: "+" });
    expect(value.body).toBeNull();

    const block = only("{% set x %}hi{% endset %}");
    if (block.kind !== "Set") {
      throw new Error(`Expected Set, got ${block.kind}.`);
    }
    expect(block.target).toBe("x");
    expect(block.value).toBeNull();
    expect(block.body?.map((c) => c.kind)).toEqual(["Text"]);
  });

  it("parses blocks, extends, and includes", () => {
    const block = only("{% block content scoped %}x{% endblock %}");
    if (block.kind !== "Block") {
      throw new Error(`Expected Block, got ${block.kind}.`);
    }
    expect(block.name).toBe("content");
    expect(block.scoped).toBe(true);

    const ext = only('{% extends "base.html" %}');
    if (ext.kind !== "Extends") {
      throw new Error(`Expected Extends, got ${ext.kind}.`);
    }
    expect(ext.parent).toMatchObject({ kind: "StringLiteral" });

    const inc = only('{% include "nav.html" ignore missing without context %}');
    if (inc.kind !== "Include") {
      throw new Error(`Expected Include, got ${inc.kind}.`);
    }
    expect(inc.ignoreMissing).toBe(true);
    expect(inc.withoutContext).toBe(true);
    expect(inc.withContext).toBe(false);
  });

  it("parses import and from", () => {
    const imp = only('{% import "m.html" as m %}');
    if (imp.kind !== "Import") {
      throw new Error(`Expected Import, got ${imp.kind}.`);
    }
    expect(imp.alias).toBe("m");
    expect(imp.template).toMatchObject({ kind: "StringLiteral" });

    const from = only('{% from "m.html" import button as btn, card %}');
    if (from.kind !== "From") {
      throw new Error(`Expected From, got ${from.kind}.`);
    }
    expect(from.names).toEqual([
      { name: "button", alias: "btn" },
      { name: "card", alias: null },
    ]);
  });

  it("parses macros with defaults, call, filter, with, raw, and do", () => {
    const macro = only('{% macro btn(label, type="primary") %}{{ label }}{% endmacro %}');
    if (macro.kind !== "Macro") {
      throw new Error(`Expected Macro, got ${macro.kind}.`);
    }
    expect(macro.name).toBe("btn");
    expect(macro.params.length).toBe(2);
    expect(macro.params[0]).toMatchObject({ name: "label", defaultValue: null });
    expect(macro.params[1]?.name).toBe("type");
    expect(macro.params[1]?.defaultValue).toMatchObject({ kind: "StringLiteral" });

    const call = only("{% call render(user) %}x{% endcall %}");
    if (call.kind !== "CallBlock") {
      throw new Error(`Expected CallBlock, got ${call.kind}.`);
    }
    expect(call.callee).toMatchObject({ kind: "Identifier", name: "render" });
    expect(call.args.length).toBe(1);

    const filter = only("{% filter upper %}x{% endfilter %}");
    if (filter.kind !== "FilterBlock") {
      throw new Error(`Expected FilterBlock, got ${filter.kind}.`);
    }
    expect(filter.name).toBe("upper");

    const withNode = only("{% with a=1, b=x %}y{% endwith %}");
    if (withNode.kind !== "With") {
      throw new Error(`Expected With, got ${withNode.kind}.`);
    }
    expect(withNode.assignments.map((a) => a.name)).toEqual(["a", "b"]);

    const raw = only("{% raw %}{{ not_a_tag }}{% endraw %}");
    if (raw.kind !== "RawBlock") {
      throw new Error(`Expected RawBlock, got ${raw.kind}.`);
    }
    expect(raw.body.length).toBe(1);
    expect(raw.body[0]?.value).toBe("{{ not_a_tag }}");

    const doNode = only("{% do items.append(x) %}");
    if (doNode.kind !== "Do") {
      throw new Error(`Expected Do, got ${doNode.kind}.`);
    }
    expect(doNode.expr).toMatchObject({ kind: "Call" });
  });

  it("nests blocks and tracks ranges", () => {
    const result = parseTemplate("{% if a %}{% for x in y %}{{ x }}{% endfor %}{% endif %}");
    expect(result.errors).toEqual([]);
    const top = result.root.children[0];
    if (top?.kind !== "If") {
      throw new Error("Expected If.");
    }
    const inner = top.body[0];
    if (inner?.kind !== "For") {
      throw new Error("Expected nested For.");
    }
    expect(inner.body[0]?.kind).toBe("Output");
    expect(top.start).toBe(0);
    expect(top.end).toBe("{% if a %}{% for x in y %}{{ x }}{% endfor %}{% endif %}".length);
  });
});
