import { describe, expect, it } from "vitest";
import type { Position, Range, UriString } from "../../src/types/index.js";

describe("types", () => {
  it("models LSP-compatible positions and ranges", () => {
    const pos: Position = { line: 0, character: 5 };
    const range: Range = { start: { line: 0, character: 0 }, end: pos };
    const uri = "file:///tmp/base.html" as UriString;
    expect(range.start.line).toBe(0);
    expect(uri.startsWith("file://")).toBe(true);
  });
});
