import { describe, expect, it } from "vitest";
import { isBlank, lineCount, splitLines, utf16Length } from "../../src/utils/strings.js";

describe("strings", () => {
  it("splits lf, crlf, and cr", () => {
    expect(splitLines("a\nb\nc")).toEqual(["a", "b", "c"]);
    expect(splitLines("a\r\nb\r\nc")).toEqual(["a", "b", "c"]);
    expect(splitLines("a\rb\rc")).toEqual(["a", "b", "c"]);
    expect(splitLines("")).toEqual([""]);
  });

  it("counts lines including trailing newline", () => {
    expect(lineCount("a\nb\n")).toBe(3);
    expect(lineCount("")).toBe(1);
  });

  it("detects blank lines", () => {
    expect(isBlank("")).toBe(true);
    expect(isBlank("   \t ")).toBe(true);
    expect(isBlank(" x ")).toBe(false);
  });

  it("measures UTF-16 code units", () => {
    expect(utf16Length("abc")).toBe(3);
    // Emoji is one codepoint but two UTF-16 units — LSP-compatible behavior.
    expect(utf16Length("😀")).toBe(2);
  });
});
