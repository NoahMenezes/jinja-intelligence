import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { readonly version: string };

export const SERVER_NAME = "jinja-intelligence";
/** Single source of truth: always matches package.json. */
export const SERVER_VERSION: string = packageJson.version;

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
