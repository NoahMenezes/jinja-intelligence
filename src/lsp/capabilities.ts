import {
  TextDocumentSyncKind,
  type SemanticTokensOptions,
  type ServerCapabilities,
} from "vscode-languageserver/node.js";
import { SEMANTIC_TOKENS_LEGEND } from "../features/semantic-tokens/semantic-tokens.js";

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
    documentSymbolProvider: true,
    workspaceSymbolProvider: true,
    signatureHelpProvider: { triggerCharacters: ["(", ","] },
    semanticTokensProvider: {
      legend: { tokenTypes: [...SEMANTIC_TOKENS_LEGEND.tokenTypes], tokenModifiers: [] },
      full: true,
    } satisfies SemanticTokensOptions,
  };
}
