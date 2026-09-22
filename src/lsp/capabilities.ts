import { TextDocumentSyncKind, type ServerCapabilities } from "vscode-languageserver/node.js";

/**
 * Server capabilities. Phase 14 adds references and rename; completion,
 * hover, definition, synchronization, and the remaining off-switches carry
 * over unchanged.
 */
export function createServerCapabilities(): ServerCapabilities {
  return {
    textDocumentSync: TextDocumentSyncKind.Full,
    completionProvider: { triggerCharacters: ["|", "."], resolveProvider: false },
    hoverProvider: true,
    definitionProvider: true,
    referencesProvider: true,
    renameProvider: true,
    documentSymbolProvider: false,
    workspaceSymbolProvider: false,
  };
}
