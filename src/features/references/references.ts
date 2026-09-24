import type { Location } from "vscode-languageserver/node.js";
import { analyzeTemplate, resolveAt } from "../../jinja/analysis/analyzer.js";
import type { Analysis } from "../../jinja/analysis/analyzer.js";
import { lookup, scopeAt } from "../../jinja/analysis/scope.js";
import type { Symbol } from "../../jinja/analysis/symbols.js";
import type { Range } from "../../types/index.js";
import { lex } from "../../jinja/lexer/lexer.js";
import type { Token } from "../../jinja/lexer/token-types.js";
import { previousSignificant } from "../../jinja/lexer/tokens.js";
import { parseTemplate } from "../../jinja/parser/parser.js";
import { declarationRanges } from "./bindings.js";
import { compareRanges } from "./bindings.js";

/**
 * Find all references to the symbol at the offset, single file.
 * Identity-based (not name-based), so shadowing is exact. Total, never throws.
 */
export function references(text: string, uri: string, offset: number, includeDeclaration: boolean): Location[] {
  try {
    const at = Math.min(Math.max(0, offset), text.length);
    const root = parseTemplate(text).root;
    const analysis = analyzeTemplate(root);
    const symbol = symbolAt(text, analysis, at);
    if (symbol === null) {
      return [];
    }
    const found: Range[] = [];
    const seen = new Set<string>();
    const push = (range: Range): void => {
      const key = `${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`;
      if (!seen.has(key)) {
        seen.add(key);
        found.push(range);
      }
    };
    for (const occurrence of analysis.occurrences) {
      if (lookup(occurrence.scope, occurrence.name) === symbol) {
        push(occurrence.range);
      }
    }
    if (includeDeclaration) {
      for (const range of declarationRanges(text, root, symbol)) {
        push(range);
      }
    }
    found.sort(compareRanges);
    return found.map((range) => ({ uri, range }));
  } catch {
    return [];
  }
}

/**
 * Symbol under the cursor: reference positions first, then binding sites.
 * Takes the caller's analysis so identity comparison stays within one tree.
 */
export function symbolAt(text: string, analysis: Analysis, at: number): Symbol | null {
  const tokens = lex(text).tokens;
  const word = tokens.find(
    (t) => t.kind === "Identifier" && t.start <= at && at <= t.end,
  );
  if (word === undefined) {
    return null;
  }
  const resolved = resolveAt(analysis, at);
  if (resolved !== null && resolved.name === word.value) {
    return resolved;
  }
  // Property segments (`name` in `user.name`) are not references, even when
  // an unrelated same-named variable exists in scope.
  if (previousSignificant(tokens, tokens.indexOf(word))?.kind === "Dot") {
    return null;
  }
  const fallback = lookup(scopeAt(analysis.root, at), word.value);
  return fallback !== null && fallback.name === word.value ? fallback : null;
}

