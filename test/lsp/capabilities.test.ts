import { TextDocumentSyncKind } from "vscode-languageserver/node.js";
import { describe, expect, it } from "vitest";
import { createServerCapabilities } from "../../src/lsp/capabilities.js";
import { createInitializeResult, Lifecycle } from "../../src/lsp/lifecycle.js";

describe("capabilities", () => {
  it("advertises full sync, core completion, and no other intelligence", () => {
    const caps = createServerCapabilities();
    expect(caps.textDocumentSync).toBe(TextDocumentSyncKind.Full);
    expect(caps.hoverProvider).toBe(false);
    expect(caps.definitionProvider).toBe(false);
    expect(caps.referencesProvider).toBe(false);
    expect(caps.renameProvider).toBe(false);
    expect(caps.documentSymbolProvider).toBe(false);
    expect(caps.workspaceSymbolProvider).toBe(false);
    expect(caps.completionProvider).toEqual({ triggerCharacters: ["|", "."], resolveProvider: false });
    expect(caps.signatureHelpProvider).toBeUndefined();
    expect(caps.semanticTokensProvider).toBeUndefined();
  });
});

describe("lifecycle", () => {
  it("builds the initialize result with server info", () => {
    const result = createInitializeResult("jinja-intelligence", "0.2.0");
    expect(result.serverInfo).toEqual({ name: "jinja-intelligence", version: "0.2.0" });
    expect(result.capabilities.textDocumentSync).toBe(TextDocumentSyncKind.Full);
  });

  it("exits 0 after shutdown, 1 otherwise", () => {
    const fresh = new Lifecycle();
    expect(fresh.exitCode()).toBe(1);
    fresh.markShutdown();
    expect(fresh.exitCode()).toBe(0);
  });
});
