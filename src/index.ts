import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

/**
 * Server version: walks up from this module to the nearest package.json
 * named "jinja-intelligence", so the bundled VS Code copy (nested under the
 * extension manifest) still reports the server version, not the client's.
 */
function serverVersion(): string {
  try {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 6; i++) {
      try {
        const manifest = require(join(dir, "package.json")) as { name?: unknown; version?: unknown };
        if (manifest.name === "jinja-intelligence" && typeof manifest.version === "string") {
          return manifest.version;
        }
      } catch {
        // Keep climbing.
      }
      const parent = dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
  } catch {
    // Fall through to the placeholder below.
  }
  return "0.0.0-dev";
}

export const SERVER_NAME = "jinja-intelligence";
/** Single source of truth: always matches package.json. */
export const SERVER_VERSION: string = serverVersion();

export type { DocumentVersion, Position, Range, TextEdit, UriString } from "./types/index.js";
export * from "./utils/ranges.js";
export * from "./utils/strings.js";
export * from "./utils/paths.js";
export { Document } from "./documents/document.js";
export { DocumentManager } from "./documents/document-manager.js";
export * from "./documents/offsets.js";
export * from "./jinja/lexer/token-types.js";
export * from "./jinja/lexer/tokens.js";
export * from "./jinja/lexer/lexer.js";
export * from "./jinja/syntax/keywords.js";
export * from "./jinja/syntax/filters.js";
export * from "./jinja/syntax/tests.js";
export * from "./jinja/syntax/builtins.js";
export * from "./jinja/ast/nodes.js";
export * from "./jinja/parser/parser-errors.js";
export * from "./jinja/parser/expressions.js";
export * from "./jinja/parser/statements.js";
export * from "./jinja/parser/parser.js";
export * from "./config/settings.js";
export * from "./utils/logging.js";
export * from "./lsp/capabilities.js";
export * from "./lsp/lifecycle.js";
export * from "./lsp/document-sync.js";
export * from "./features/diagnostics/rules.js";
export * from "./features/diagnostics/diagnostics.js";
export * from "./jinja/analysis/symbols.js";
export * from "./jinja/analysis/scope.js";
export * from "./jinja/analysis/analyzer.js";
export * from "./features/completion/providers.js";
export * from "./features/completion/completion.js";
export * from "./jinja/docs/types.js";
export * from "./jinja/docs/filters.js";
export * from "./jinja/docs/tests.js";
export * from "./jinja/docs/keywords.js";
export * from "./jinja/docs/builtins.js";
export * from "./features/hover/hover.js";
export * from "./jinja/ast/query.js";
export * from "./templates/resolver.js";
export * from "./project/workspace.js";
export * from "./features/definition/definition.js";
export * from "./features/references/bindings.js";
export * from "./features/references/references.js";
export * from "./features/rename/rename.js";
export * from "./project/scanner.js";
export * from "./project/template-index.js";
export * from "./project/project.js";
export * from "./python/scanner.js";
export * from "./python/context.js";
export * from "./python/symbols.js";
export * from "./python/types.js";
export * from "./features/symbols/symbols.js";
export * from "./features/signature-help/signature-help.js";
export * from "./features/semantic-tokens/semantic-tokens.js";
