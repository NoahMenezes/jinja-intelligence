import { describe, expect, it } from "vitest";
import { rename } from "../../src/features/rename/rename.js";

const URI = "file:///rename.j2";

function editRanges(result: NonNullable<ReturnType<typeof rename>>) {
  return result.changes?.[URI] ?? [];
}

describe("rename", () => {
  it("renames loop targets and uses, not the iterable", () => {
    const text = "{% for user in users %}{{ user.name }}{% endfor %}";
    const result = rename(text, URI, 27, "person");
    expect(result).not.toBeNull();
    const edits = editRanges(result!);
    // Target `user`, use `user` — never `users`.
    expect(edits.length).toBe(2);
    for (const edit of edits) {
      expect(edit.newText).toBe("person");
    }
    const covered = edits.map((e) => text.slice(
      e.range.start.character + e.range.start.line * 100,
      e.range.end.character + e.range.end.line * 100,
    ));
    expect(covered).toContain("user");
    expect(covered).not.toContain("users");
  });

  it("renames set variables and macro names with call sites", () => {
    const setText = "{% set title = 1 %}{{ title }}";
    const setResult = rename(setText, URI, 24, "heading");
    expect(setResult).not.toBeNull();
    expect(editRanges(setResult!).length).toBe(2);

    const macroText = "{% macro btn() %}x{% endmacro %}{{ btn() }}";
    const macroResult = rename(macroText, URI, 36, "button");
    expect(macroResult).not.toBeNull();
    expect(editRanges(macroResult!).length).toBe(2);
  });

  it("renames import aliases locally only", () => {
    const text = '{% import "m.j2" as m %}{{ m }}';
    const result = rename(text, URI, 28, "forms");
    expect(result).not.toBeNull();
    const edits = editRanges(result!);
    expect(edits.length).toBe(2);
    expect(Object.keys(result!.changes ?? {})).toEqual([URI]);
  });

  it("refuses unsafe and invalid renames", () => {
    const text = "{% for user in users %}{{ user.name | upper }}{% endfor %}{{ missing }}";
    // External name.
    expect(rename(text, URI, text.indexOf("{{ missing }}") + 3, "x")).toBeNull();
    // Property segment.
    expect(rename(text, URI, text.indexOf("user.name") + 5, "x")).toBeNull();
    // Filter name.
    expect(rename(text, URI, text.indexOf("upper"), "x")).toBeNull();
    // Keyword.
    expect(rename(text, URI, text.indexOf("{% for") + 3, "x")).toBeNull();
    // Invalid new names.
    const at = text.indexOf("{{ user") + 3;
    expect(rename(text, URI, at, "9x")).toBeNull();
    expect(rename(text, URI, at, "a-b")).toBeNull();
    expect(rename(text, URI, at, "")).toBeNull();
    // Same name: no-op.
    expect(rename(text, URI, at, "user")).toBeNull();
    // Outside any word.
    expect(rename(text, URI, 0, "x")).toBeNull();
  });

  it("keeps edits sorted and non-overlapping", () => {
    const text = "{% set b = 1 %}{{ b }}{{ b }}";
    const result = rename(text, URI, 18, "c");
    expect(result).not.toBeNull();
    const edits = editRanges(result!);
    expect(edits.length).toBe(3);
    for (let i = 1; i < edits.length; i++) {
      const prev = edits[i - 1]!;
      const curr = edits[i]!;
      const before =
        prev.range.end.line < curr.range.start.line ||
        (prev.range.end.line === curr.range.start.line && prev.range.end.character <= curr.range.start.character);
      expect(before).toBe(true);
    }
  });

  it("never throws on hostile input", () => {
    for (const text of ["{{", "{% for", ""]) {
      expect(rename(text, URI, text.length, "x")).toBeDefined();
    }
  });
});
