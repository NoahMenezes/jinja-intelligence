import { TextDocumentSyncKind, type ServerCapabilities } from "vscode-languageserver/node.js";

/**
 * Server capabilities. Phase 10 advertises core completion (statements,
 * filters, tests) alongside document synchronization; every other
 * intelligence provider stays explicitly off.
 */
export function createServerCapabilities(): ServerCapabilities {
  return {
    textDocumentSync: TextDocumentSyncKind.Full,
    completionProvider: { triggerCharacters: ["|"], resolveProvider: false },
    hoverProvider: false,
    definitionProvider: false,
    referencesProvider: false,
    renameProvider: false,
    documentSymbolProvider: false,
    workspaceSymbolProvider: false,
  };
}
