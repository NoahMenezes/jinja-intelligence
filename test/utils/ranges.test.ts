import { describe, expect, it } from "vitest";
import {
  containsPosition,
  containsRange,
  createPosition,
  createRange,
  equals,
  isEmpty,
  overlaps,
  translate,
} from "../../src/utils/ranges.js";

describe("ranges", () => {
  it("normalizes inverted ranges", () => {
    const r = createRange(createPosition(2, 5), createPosition(1, 0));
    expect(r.start).toEqual({ line: 1, character: 0 });
    expect(r.end).toEqual({ line: 2, character: 5 });
  });

  it("detects empty and equality", () => {
    const a = createRange(createPosition(1, 2), createPosition(1, 2));
    expect(isEmpty(a)).toBe(true);
    expect(equals(a, createRange(createPosition(1, 2), createPosition(1, 2)))).toBe(true);
    expect(equals(a, createRange(createPosition(1, 2), createPosition(1, 3)))).toBe(false);
  });

  it("contains positions with inclusive start / exclusive end", () => {
    const r = createRange(createPosition(1, 2), createPosition(1, 5));
    expect(containsPosition(r, createPosition(1, 2))).toBe(true);
    expect(containsPosition(r, createPosition(1, 4))).toBe(true);
    expect(containsPosition(r, createPosition(1, 5))).toBe(false);
    expect(containsPosition(r, createPosition(1, 1))).toBe(false);
  });

  it("contains ranges and detects overlap", () => {
    const outer = createRange(createPosition(1, 0), createPosition(3, 0));
    const inner = createRange(createPosition(2, 0), createPosition(2, 5));
    expect(containsRange(outer, inner)).toBe(true);
    expect(containsRange(inner, outer)).toBe(false);
    expect(overlaps(inner, createRange(createPosition(2, 5), createPosition(4, 0)))).toBe(true);
    expect(overlaps(inner, createRange(createPosition(5, 0), createPosition(6, 0)))).toBe(false);
  });

  it("translates ranges", () => {
    const r = createRange(createPosition(1, 1), createPosition(1, 3));
    expect(translate(r, 2, 1)).toEqual({
      start: { line: 3, character: 2 },
      end: { line: 3, character: 4 },
    });
  });
});
