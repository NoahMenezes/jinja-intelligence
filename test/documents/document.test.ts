import { describe, expect, it } from "vitest";
import { Document } from "../../src/documents/document.js";
import type { UriString } from "../../src/types/index.js";

const URI = "file:///tmp/base.html" as UriString;

describe("document", () => {
  it("reads lines and counts", () => {
    const doc = Document.create(URI, "a\nb\n", 1);
    expect(doc.lineCount()).toBe(3);
    expect(doc.lineAt(0)).toBe("a");
    expect(doc.lineAt(1)).toBe("b");
    expect(doc.lineAt(2)).toBe("");
    expect(doc.lineAt(9)).toBeNull();
  });

  it("converts offsets and positions", () => {
    const doc = Document.create(URI, "ab\ncde", 1);
    expect(doc.offsetAt({ line: 1, character: 2 })).toBe(5);
    expect(doc.positionAt(5)).toEqual({ line: 1, character: 2 });
  });

  it("handles crlf, empty docs, and unicode", () => {
    const crlf = Document.create(URI, "a\r\nb", 1);
    expect(crlf.lineCount()).toBe(2);
    expect(crlf.lineAt(1)).toBe("b");
    const empty = Document.create(URI, "", 1);
    expect(empty.lineCount()).toBe(1);
    expect(empty.offsetAt({ line: 0, character: 0 })).toBe(0);
    const emoji = Document.create(URI, "😀x", 1);
    // UTF-16: emoji occupies 2 units.
    expect(emoji.offsetAt({ line: 0, character: 2 })).toBe(2);
    expect(emoji.positionAt(2)).toEqual({ line: 0, character: 2 });
  });

  it("clamps out-of-bounds without throwing", () => {
    const doc = Document.create(URI, "ab", 1);
    expect(doc.offsetAt({ line: 99, character: 99 })).toBe(2);
    expect(doc.positionAt(999)).toEqual({ line: 0, character: 2 });
  });

  it("extracts text in range and updates immutably", () => {
    const doc = Document.create(URI, "hello", 1);
    expect(
      doc.getTextInRange({ start: { line: 0, character: 1 }, end: { line: 0, character: 4 } }),
    ).toBe("ell");
    const next = doc.update("bye", 2);
    expect(next.text).toBe("bye");
    expect(next.version).toBe(2);
    expect(doc.text).toBe("hello");
    expect(doc.version).toBe(1);
  });
});
