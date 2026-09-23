import { describe, expect, it } from "vitest";
import { TemplateIndex } from "../../src/project/template-index.js";

const CHILD = "{% extends \"base.j2\" %}{% block content %}{% macro card(t) %}{{ t }}{% endmacro %}{% endblock %}";

describe("template-index", () => {
  it("extracts macros, blocks, and edges", () => {
    const index = new TemplateIndex();
    const entry = index.upsert("file:///t/child.j2", CHILD, false);
    expect(entry.macros.map((m) => m.name)).toEqual(["card"]);
    expect(entry.macros[0]?.params).toEqual(["t"]);
    expect(entry.blocks.map((b) => b.name)).toEqual(["content"]);
    expect(entry.edges.extendsName).toBe("base.j2");
    expect(index.size()).toBe(1);
  });

  it("answers basename, macro, block, and children queries", () => {
    const index = new TemplateIndex();
    index.upsert("file:///t/base.j2", "{% block content %}x{% endblock %}", false);
    index.upsert("file:///t/child.j2", CHILD, false);
    expect(index.basenames()).toEqual(["base.j2", "child.j2"]);
    expect(index.macros("card").map((m) => m.uri)).toEqual(["file:///t/child.j2"]);
    expect(index.blocks("content").map((b) => b.uri)).toEqual(["file:///t/base.j2", "file:///t/child.j2"]);
    expect(index.childrenOf("file:///t/base.j2")).toEqual(["file:///t/child.j2"]);
  });

  it("updates, removes, and survives broken templates", () => {
    const index = new TemplateIndex();
    index.upsert("file:///t/a.j2", "{% macro m() %}x{% endmacro %}", false);
    expect(index.macros("m").length).toBe(1);
    index.upsert("file:///t/a.j2", "plain", true);
    expect(index.macros("m")).toEqual([]);
    expect(index.get("file:///t/a.j2")?.fromEditor).toBe(true);
    expect(index.remove("file:///t/a.j2")).toBe(true);
    expect(index.get("file:///t/a.j2")).toBeNull();
    index.upsert("file:///t/b.j2", "{{{{{{", false);
    expect(index.size()).toBe(1);
  });
});
