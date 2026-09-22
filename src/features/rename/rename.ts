import type { TextEdit, WorkspaceEdit } from "vscode-languageserver/node.js";
import { analyzeTemplate } from "../../jinja/analysis/analyzer.js";
import { lookup } from "../../jinja/analysis/scope.js";
import type { Range } from "../../types/index.js";
import { lex } from "../../jinja/lexer/lexer.js";
import { parseTemplate } from "../../jinja/parser/parser.js";
import { declarationRanges } from "../references/bindings.js";
import { compareRanges } from "../references/bindings.js";
import { symbolAt } from "../references/references.js";

const VALID_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Rename a template-local name: every reference plus its declaration tokens.
 * Refuses (null) for anything unsafe: unknown names, keywords, property
 * segments, strings, invalid new names, or unlocatable declarations.
 * Single file; target templates are never touched. Total, never throws.
 */
export function rename(text: string, uri: string, offset: number, newName: string): WorkspaceEdit | null {
  try {
    if (!VALID_NAME.test(newName)) {
      return null;
    }
    const at = Math.min(Math.max(0, offset), text.length);
    const root = parseTemplate(text).root;
    const tokens = lex(text).tokens;
    const word = tokens.find(
      (t) => t.kind === "Identifier" && t.start <= at && at <= t.end,
    );
    if (word === undefined || word.value === newName) {
      return null;
    }
    const analysis = analyzeTemplate(root);
    const symbol = symbolAt(text, analysis, at);
    if (symbol === null || symbol.name !== word.value) {
      return null;
    }
    const declarations = declarationRanges(text, root, symbol);
    if (declarations.length === 0) {
      return null;
    }
    const edits: Range[] = [];
    const seen = new Set<string>();
    const push = (range: Range): void => {
      const key = `${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`;
      if (!seen.has(key)) {
        seen.add(key);
        edits.push(range);
      }
    };
    for (const declaration of declarations) {
      push(declaration);
    }
    for (const occurrence of analysis.occurrences) {
      if (lookup(occurrence.scope, occurrence.name) === symbol) {
        push(occurrence.range);
      }
    }
    edits.sort(compareRanges);
    const changes: TextEdit[] = edits.map((range) => ({ range, newText: newName }));
    return { changes: { [uri]: changes } };
  } catch {
    return null;
  }
}
