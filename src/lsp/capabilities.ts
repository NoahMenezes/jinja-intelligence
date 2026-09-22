import { TextDocumentSyncKind, type ServerCapabilities } from "vscode-languageserver/node.js";

/**
 * Server capabilities. Phase 13 adds go-to-definition; completion, hover,
 * synchronization, and the remaining off-switches carry over unchanged.
 */
export function createServerCapabilities(): ServerCapabilities {
  return {
    textDocumentSync: TextDocumentSyncKind.Full,
    completionProvider: { triggerCharacters: ["|", "."], resolveProvider: false },
    hoverProvider: true,
    definitionProvider: true,
    referencesProvider: false,
    renameProvider: false,
    documentSymbolProvider: false,
    workspaceSymbolProvider: false,
  };
}
