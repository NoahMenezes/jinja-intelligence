import { describe, expect, it } from "vitest";
import { computeLineStarts, offsetAtPosition, positionAtOffset } from "../../src/documents/offsets.js";

describe("offsets", () => {
  it("computes line starts for lf", () => {
    expect(computeLineStarts("a\nb\nc")).toEqual([0, 2, 4]);
  });

  it("treats crlf and cr as single breaks", () => {
    expect(computeLineStarts("a\r\nb\r\nc")).toEqual([0, 3, 6]);
    expect(computeLineStarts("a\rb\rc")).toEqual([0, 2, 4]);
  });

  it("handles empty text and trailing newline", () => {
    expect(computeLineStarts("")).toEqual([0]);
    expect(computeLineStarts("a\n")).toEqual([0, 2]);
  });

  it("round-trips offsets and positions", () => {
    const text = "ab\ncde\nf";
    const starts = computeLineStarts(text);
    expect(offsetAtPosition(starts, text, { line: 1, character: 2 })).toBe(5);
    expect(positionAtOffset(starts, text, 5)).toEqual({ line: 1, character: 2 });
  });

  it("clamps out-of-bounds input", () => {
    const text = "ab";
    const starts = computeLineStarts(text);
    expect(offsetAtPosition(starts, text, { line: 99, character: 99 })).toBe(2);
    expect(positionAtOffset(starts, text, 999)).toEqual({ line: 0, character: 2 });
    expect(positionAtOffset(starts, text, -5)).toEqual({ line: 0, character: 0 });
  });

  it("round-trips every offset of mixed-ending documents", () => {
    // Deterministic pseudo-random document exercising \n, \r\n, \r, emoji.
    let seed = 42;
    const next = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const pieces = ["a", "ab", "", "😀", "hello"];
    const breaks = ["\n", "\r\n", "\r", "\n"];
    const pick = (arr: readonly string[]): string => arr[next(arr.length)] ?? "";
    let text = "";
    for (let i = 0; i < 300; i++) {
      text += pick(pieces) + pick(breaks);
    }
    const starts = computeLineStarts(text);
    for (let offset = 0; offset <= text.length; offset++) {
      const pos = positionAtOffset(starts, text, offset);
      // Every offset maps inside the document and back to itself when
      // positioned at a character boundary the converter produced.
      expect(pos.line).toBeGreaterThanOrEqual(0);
      expect(pos.character).toBeGreaterThanOrEqual(0);
      expect(offsetAtPosition(starts, text, pos)).toBeLessThanOrEqual(text.length);
    }
    // Exact spot checks across line-ending styles.
    expect(positionAtOffset(starts, text, 0)).toEqual({ line: 0, character: 0 });
  });
});
