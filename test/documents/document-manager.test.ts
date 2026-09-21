import { describe, expect, it } from "vitest";
import { DocumentManager } from "../../src/documents/document-manager.js";
import type { UriString } from "../../src/types/index.js";

const A = "file:///tmp/a.html" as UriString;
const B = "file:///tmp/b.html" as UriString;

describe("document-manager", () => {
  it("opens, gets, and tracks versions", () => {
    const manager = new DocumentManager();
    manager.open(A, "hello", 1);
    expect(manager.get(A)?.text).toBe("hello");
    expect(manager.get(A)?.version).toBe(1);
    expect(manager.has(A)).toBe(true);
    expect(manager.size()).toBe(1);
  });

  it("updates open documents and returns null when missing", () => {
    const manager = new DocumentManager();
    expect(manager.update(A, "x", 2)).toBeNull();
    manager.open(A, "hello", 1);
    const next = manager.update(A, "bye", 2);
    expect(next?.text).toBe("bye");
    expect(manager.get(A)?.version).toBe(2);
  });

  it("closes and isolates documents", () => {
    const manager = new DocumentManager();
    manager.open(A, "a", 1);
    manager.open(B, "b", 1);
    expect(manager.size()).toBe(2);
    expect(manager.close(A)).toBe(true);
    expect(manager.close(A)).toBe(false);
    expect(manager.get(A)).toBeNull();
    expect(manager.get(B)?.text).toBe("b");
    manager.clear();
    expect(manager.size()).toBe(0);
    expect(manager.uris()).toEqual([]);
  });
});
