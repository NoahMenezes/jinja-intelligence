import { describe, expect, it } from "vitest";
import { hover } from "../../src/features/hover/hover.js";

function textOf(result: NonNullable<ReturnType<typeof hover>>): string {
  const contents = result.contents;
  if (typeof contents === "string") {
    return contents;
  }
  if (Array.isArray(contents)) {
    return "";
  }
  return contents.value;
}

describe("hover", () => {
  it("documents filters and tests", () => {
    const filter = hover("{{ user.name | upper }}", 16);
    expect(filter).not.toBeNull();
    expect(textOf(filter!)).toContain("upper(value)");
    expect(textOf(filter!)).toContain("uppercase");
    expect(filter?.range?.start).toEqual({ line: 0, character: 15 });

    const test = hover("{{ user is defined }}", 14);
    expect(test).not.toBeNull();
    expect(textOf(test!)).toContain("defined");
  });

  it("documents statement keywords", () => {
    const keyword = hover("{% for user in users %}{% endfor %}", 3);
    expect(keyword).not.toBeNull();
    expect(textOf(keyword!)).toContain("{% for");
  });

  it("documents loop variables, set variables, and macros", () => {
    const template = "{% for user in users %}{{ user }}{% endfor %}";
    const loopVar = hover(template, 27);
    expect(loopVar).not.toBeNull();
    expect(textOf(loopVar!)).toContain("Loop variable");
    expect(textOf(loopVar!)).toContain("{% for user in users %}");

    const macro = hover('{% macro badge(text, level="info") %}x{% endmacro %}', 9);
    expect(macro).not.toBeNull();
    expect(textOf(macro!)).toContain('badge(text, level="info")');
  });

  it("documents builtins and loop attributes", () => {
    const builtin = hover("{{ range(3) }}", 4);
    expect(builtin).not.toBeNull();
    expect(textOf(builtin!)).toContain("range(");

    const attr = hover("{% for u in us %}{{ loop.index }}{% endfor %}", 30);
    expect(attr).not.toBeNull();
    expect(textOf(attr!)).toContain("loop.index");
  });

  it("notes external variables honestly", () => {
    const external = hover("{{ username }}", 4);
    expect(external).not.toBeNull();
    expect(textOf(external!)).toContain("template context");
  });

  it("names the python source file when mapped", () => {
    const mapped = hover("{{ username }}", 4, {
      contextSources: new Map([["username", ["file:///app.py"]]]),
    });
    expect(mapped).not.toBeNull();
    expect(textOf(mapped!)).toContain("app.py");
    expect(textOf(mapped!)).toContain("render_template");
  });

  it("shows python types with attributes", () => {
    const typed = hover("{{ user }}", 4, {
      contextSources: new Map([["user", ["file:///app.py"]]]),
      contextTypes: { user: { name: "User", attrs: ["name", "email"] } },
    });
    expect(typed).not.toBeNull();
    expect(textOf(typed!)).toContain("user: User");
    expect(textOf(typed!)).toContain("`name`");
    expect(textOf(typed!)).toContain("app.py");
  });

  it("returns null where nothing is known", () => {
    expect(hover("plain text", 3)).toBeNull();
    expect(hover('{% extends "base.html" %}', 13)).toBeNull();
    expect(hover("{{ user.nickname }}", 10)).toBeNull();
    expect(hover("{# note #}", 4)).toBeNull();
    expect(hover("", 0)).toBeNull();
  });

  it("never throws on hostile input", () => {
    for (const text of ["{{", "{{ x |", "{% if", "{{ user.", "{% macro"]) {
      expect(() => hover(text, text.length)).not.toThrow();
    }
  });
});
