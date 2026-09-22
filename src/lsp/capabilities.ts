import { TextDocumentSyncKind, type ServerCapabilities } from "vscode-languageserver/node.js";

/**
 * Server capabilities. Phase 12 adds hover documentation; completion,
 * synchronization, and explicit off-switches carry over unchanged.
 */
export function createServerCapabilities(): ServerCapabilities {
  return {
    textDocumentSync: TextDocumentSyncKind.Full,
    completionProvider: { triggerCharacters: ["|", "."], resolveProvider: false },
    hoverProvider: true,
    definitionProvider: false,
    referencesProvider: false,
    renameProvider: false,
    documentSymbolProvider: false,
    workspaceSymbolProvider: false,
  };
}
