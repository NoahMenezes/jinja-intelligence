import { SymbolKind } from "vscode-languageserver/node.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { documentSymbols, workspaceSymbols } from "../../src/features/symbols/symbols.js";

const URI = "file:///outline.j2";

function fixture(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, "../fixtures/symbols/outline.j2"), "utf8");
}

describe("symbols", () => {
  it("outlines definitions with kinds in document order", () => {
    const items = documentSymbols(fixture());
    const names = items.map((i) => i.name);
    expect(names).toEqual(["title", "forms", "badge", "user", "loop", "content"]);
    const kinds = new Map(items.map((i) => [i.name, i.kind]));
    expect(kinds.get("badge")).toBe(SymbolKind.Function);
    expect(kinds.get("forms")).toBe(SymbolKind.Module);
    expect(kinds.get("content")).toBe(SymbolKind.Struct);
    expect(kinds.get("user")).toBe(SymbolKind.Variable);
  });

  it("nests macro parameters under their macro", () => {
    const items = documentSymbols(fixture());
    const badge = items.find((i) => i.name === "badge");
    expect(badge?.children?.map((c) => c.name).sort()).toEqual(["level", "text"]);
  });

  it("returns nothing for empty or hostile input", () => {
    expect(documentSymbols("")).toEqual([]);
    expect(documentSymbols("plain text")).toEqual([]);
    expect(documentSymbols("{{ ")).toEqual([]);
  });
});

describe("workspace symbols", () => {
  it("searches case-insensitively within the file", () => {
    expect(workspaceSymbols(fixture(), URI, "bad").map((s) => s.name)).toEqual(["badge"]);
    expect(workspaceSymbols(fixture(), URI, "BAD").map((s) => s.name)).toEqual(["badge"]);
    expect(workspaceSymbols(fixture(), URI, "zzz")).toEqual([]);
    expect(workspaceSymbols(fixture(), URI, "").length).toBeGreaterThan(0);
  });

  it("carries locations with the file uri", () => {
    const [first] = workspaceSymbols(fixture(), URI, "title");
    expect(first?.location.uri).toBe(URI);
    expect(first?.location.range.start.line).toBe(0);
  });
});
