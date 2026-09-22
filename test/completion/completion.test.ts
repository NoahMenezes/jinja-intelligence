import { CompletionItemKind } from "vscode-languageserver/node.js";
import { describe, expect, it } from "vitest";
import { complete, detectContext } from "../../src/features/completion/completion.js";
import {
  buildFilterItems,
  buildStatementItems,
  buildTestItems,
} from "../../src/features/completion/providers.js";

function labels(items: { label: string }[]): string[] {
  return items.map((i) => i.label);
}

describe("providers", () => {
  it("lists statement openers without end tags", () => {
    const found = labels(buildStatementItems());
    for (const word of ["if", "for", "set", "block", "extends", "include", "macro", "import", "from", "call", "filter", "with", "raw", "do"]) {
      expect(found).toContain(word);
    }
    for (const word of ["endif", "endfor", "endblock", "else", "elif"]) {
      expect(found).not.toContain(word);
    }
    for (const item of buildStatementItems()) {
      expect(item.kind).toBe(CompletionItemKind.Keyword);
      expect(item.detail).toBe("statement");
    }
  });

  it("lists filters and tests with kinds", () => {
    const filters = labels(buildFilterItems());
    for (const word of ["upper", "lower", "default", "join", "length", "trim"]) {
      expect(filters).toContain(word);
    }
    expect(filters).toEqual([...filters].sort());
    const tests = labels(buildTestItems());
    for (const word of ["defined", "number", "string", "mapping", "iterable"]) {
      expect(tests).toContain(word);
    }
    for (const item of [...buildFilterItems(), ...buildTestItems()]) {
      expect(item.sortText).toBe(item.label);
    }
  });
});

describe("completion context", () => {
  it("suggests statements after block open", () => {
    expect(detectContext("{% ", 3)).toBe("statement");
    expect(detectContext("{% i", 4)).toBe("statement");
    expect(detectContext("a\n{% ", 5)).toBe("statement");
    expect(labels(complete("{% ", 3))).toContain("if");
  });

  it("suggests filters after pipes, including partial names and unclosed tags", () => {
    expect(detectContext("{{ x | }}", 7)).toBe("filter");
    expect(detectContext("{{ x | up }}", 9)).toBe("filter");
    expect(detectContext("{{ x | ", 8)).toBe("filter");
    expect(detectContext("{% set a = b | }}", 15)).toBe("filter");
    expect(labels(complete("{{ x | }}", 7))).toContain("upper");
  });

  it("suggests tests after is, including negation and partial names", () => {
    expect(detectContext("{% if x is %}", 11)).toBe("test");
    expect(detectContext("{% if x is not %}", 15)).toBe("test");
    expect(detectContext("{% if x is def %}", 14)).toBe("test");
    expect(detectContext("{% if x is not def %}", 18)).toBe("test");
    expect(labels(complete("{% if x is %}", 11))).toContain("defined");
  });

  it("returns nothing outside known contexts", () => {
    expect(complete("hello ", 6)).toEqual([]);
    expect(complete("{# note #}", 5)).toEqual([]);
    expect(complete("{{ x }}", 4)).toEqual([]);
    expect(complete("{% set ", 7)).toEqual([]);
    expect(complete("{{ user }}", 8)).toEqual([]);
    expect(complete("", 0)).toEqual([]);
    expect(complete("{{ not }}", 7)).toEqual([]);
  });

  it("never throws on hostile input", () => {
    for (const text of ["{", "{{", "{%", "{#", "{{ |", "{% |", "{{ x |", "{% if x is"]) {
      expect(() => complete(text, text.length)).not.toThrow();
      expect(Array.isArray(complete(text, text.length))).toBe(true);
    }
  });
});
