import { describe, expect, it } from "vitest";
import { BUILTINS } from "../../src/jinja/syntax/builtins.js";
import { FILTERS } from "../../src/jinja/syntax/filters.js";
import { KEYWORDS } from "../../src/jinja/syntax/keywords.js";
import { TESTS } from "../../src/jinja/syntax/tests.js";

describe("syntax-data", () => {
  it("covers core keywords", () => {
    for (const word of ["if", "for", "set", "block", "extends", "include", "macro", "import", "from"]) {
      expect(KEYWORDS.has(word)).toBe(true);
    }
  });

  it("covers common filters and tests", () => {
    for (const word of ["upper", "lower", "default", "join", "length", "trim"]) {
      expect(FILTERS.has(word)).toBe(true);
    }
    for (const word of ["defined", "number", "string", "mapping", "iterable"]) {
      expect(TESTS.has(word)).toBe(true);
    }
    expect(BUILTINS.has("range")).toBe(true);
  });
});
