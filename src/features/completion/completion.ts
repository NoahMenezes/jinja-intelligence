import type { CompletionItem } from "vscode-languageserver/node.js";
import { parseTemplate } from "../../jinja/parser/parser.js";
import { analyzeTemplate } from "../../jinja/analysis/analyzer.js";
import { lex } from "../../jinja/lexer/lexer.js";
import type { Token } from "../../jinja/lexer/token-types.js";
import { buildFilterItems, buildStatementItems, buildTestItems } from "./providers.js";
import { buildPropertyItems, buildVariableItems } from "./variables.js";

export type CompletionContext = "statement" | "filter" | "test" | "variable" | "property" | "none";

/**
 * Context-aware completion. Lexer-driven detection (multiline-safe, tolerant
 * of unclosed tags while typing); scope-driven items for variable and
 * property positions. Returns full category lists; clients filter on typing.
 * Template-file names and prose arrive in later phases.
 */
export function complete(text: string, offset: number): CompletionItem[] {
  try {
    const at = Math.min(Math.max(0, offset), text.length);
    switch (detectContext(text, at)) {
      case "statement":
        return buildStatementItems();
      case "filter":
        return buildFilterItems();
      case "test":
        return buildTestItems();
      case "variable":
        return buildVariableItems(analyze(text), at);
      case "property": {
        const base = propertyBase(text, at);
        if (base === null) {
          return [];
        }
        return buildPropertyItems(analyze(text), base.name, base.offset);
      }
      case "none":
        return [];
    }
  } catch {
    return [];
  }
}

function analyze(text: string) {
  return analyzeTemplate(parseTemplate(text).root);
}

/** Base word of a `base.attr` position: nearest identifier before the dot. */
function propertyBase(text: string, offset: number): { name: string; offset: number } | null {
  const at = Math.min(Math.max(0, offset), text.length);
  const tokens = lex(text).tokens;
  let dot: Token | null = null;
  for (const token of tokens) {
    if (token.start > at) {
      break;
    }
    if (token.kind === "Dot" && token.end <= at) {
      dot = token;
    }
  }
  if (dot === null) {
    return null;
  }
  let base: Token | null = null;
  for (const token of tokens) {
    if (token.start >= dot.start) {
      break;
    }
    if (token.end <= dot.start && token.kind !== "EOF") {
      base = token;
    }
  }
  if (base === null || base.kind !== "Identifier") {
    return null;
  }
  return { name: base.value, offset: base.start };
}

export function detectContext(text: string, offset: number): CompletionContext {
  const at = Math.min(Math.max(0, offset), text.length);
  const tokens = lex(text).tokens;

  // Innermost tag opened at or before the cursor and not yet closed.
  // A close delimiter holding the cursor still counts as inside the tag.
  let open: Token | null = null;
  let openIsComment = false;
  for (const token of tokens) {
    if (token.start > at) {
      break;
    }
    if (token.kind === "VariableOpen" || token.kind === "BlockOpen" || token.kind === "CommentOpen") {
      open = token;
      openIsComment = token.kind === "CommentOpen";
    } else if (
      token.end <= at &&
      (token.kind === "VariableClose" || token.kind === "BlockClose" || token.kind === "CommentClose")
    ) {
      open = null;
      openIsComment = false;
    }
  }
  if (open === null || openIsComment) {
    return "none";
  }
  const inBlock = open.kind === "BlockOpen";

  // Inside a string literal: template names need the project index (later phase).
  for (const token of tokens) {
    if (token.start > at) {
      break;
    }
    if (token.kind === "String" && token.start < at && at < token.end) {
      return "none";
    }
  }

  // Inner tokens ending at or before the cursor. A word ending exactly at
  // the cursor is complete input (`{% set| %}`, `{{ x | up| }}`); a word
  // containing the cursor is still being typed mid-word and is ignored.
  const inner: Token[] = [];
  for (const token of tokens) {
    if (token === open || token.start < open.end) {
      continue;
    }
    if (token.start > at || token.kind === "EOF") {
      break;
    }
    if (token.end <= at) {
      inner.push(token);
    }
  }

  const only = inner.length === 1 ? inner[0] : undefined;
  if (inBlock && (inner.length === 0 || (only !== undefined && isWord(only) && at <= only.end))) {
    // `{% |` or `{% pa|` — statement position (variables come in Phase 11).
    // Finished words followed by space (`{% set |`) are variable positions.
    return "statement";
  }

  const last = inner[inner.length - 1];
  const prev = inner[inner.length - 2];
  if (last !== undefined && (last.kind === "Pipe" || (isWord(last) && prev !== undefined && prev.kind === "Pipe"))) {
    return "filter";
  }
  if (
    last !== undefined &&
    (isKeyword(last, "is") ||
      (isKeyword(last, "not") && prev !== undefined && isKeyword(prev, "is")) ||
      (isWord(last) && prev !== undefined && isKeyword(prev, "is")) ||
      (isWord(last) &&
        prev !== undefined &&
        isKeyword(prev, "not") &&
        inner[inner.length - 3] !== undefined &&
        isKeyword(inner[inner.length - 3] as Token, "is")))
  ) {
    return "test";
  }
  if (last !== undefined && (last.kind === "Dot" || (isWord(last) && prev !== undefined && prev.kind === "Dot"))) {
    return "property";
  }
  if (last !== undefined && (last.kind === "String" || last.kind === "Number")) {
    return "none";
  }
  return "variable";
}

function isWord(token: Token | undefined): boolean {
  return token !== undefined && (token.kind === "Identifier" || token.kind === "Keyword");
}

function isKeyword(token: Token | undefined, word: string): boolean {
  return token !== undefined && token.kind === "Keyword" && token.value === word;
}
