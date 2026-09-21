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
});
