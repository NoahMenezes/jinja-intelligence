import { describe, expect, it } from "vitest";
import { classifyWord, isBuiltin, isFilterName, isTestName } from "../../src/jinja/lexer/tokens.js";

describe("tokens", () => {
  it("classifies keywords vs identifiers", () => {
    expect(classifyWord("if")).toBe("Keyword");
    expect(classifyWord("endfor")).toBe("Keyword");
    expect(classifyWord("user")).toBe("Identifier");
    expect(classifyWord("upper")).toBe("Identifier");
  });

  it("recognizes filters, tests, and builtins", () => {
    expect(isFilterName("upper")).toBe(true);
    expect(isFilterName("nope-not-a-filter")).toBe(false);
    expect(isTestName("defined")).toBe(true);
    expect(isTestName("nope")).toBe(false);
    expect(isBuiltin("range")).toBe(true);
    expect(isBuiltin("user")).toBe(false);
  });
});
