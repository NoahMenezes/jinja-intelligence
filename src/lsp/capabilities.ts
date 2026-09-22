import { TextDocumentSyncKind, type ServerCapabilities } from "vscode-languageserver/node.js";

/**
 * Server capabilities. Phase 7 advertises document synchronization only;
 * every intelligence provider stays explicitly off so clients render no UI
 * for unimplemented features.
 */
export function createServerCapabilities(): ServerCapabilities {
  return {
    textDocumentSync: TextDocumentSyncKind.Full,
    hoverProvider: false,
    definitionProvider: false,
    referencesProvider: false,
    renameProvider: false,
    documentSymbolProvider: false,
    workspaceSymbolProvider: false,
  };
}
