import type { CompletionItem } from "vscode-languageserver/node.js";
import { lex } from "../../jinja/lexer/lexer.js";
import type { Token } from "../../jinja/lexer/token-types.js";
import { buildFilterItems, buildStatementItems, buildTestItems } from "./providers.js";

export type CompletionContext = "statement" | "filter" | "test" | "none";

/**
 * Context-aware core completion. Lexer-driven (multiline-safe, tolerant of
 * unclosed tags while typing). Returns full category lists; clients filter
 * on typing. Variables, properties, and prose arrive in later phases.
 */
export function complete(text: string, offset: number): CompletionItem[] {
  try {
    switch (detectContext(text, offset)) {
      case "statement":
        return buildStatementItems();
      case "filter":
        return buildFilterItems();
      case "test":
        return buildTestItems();
      case "none":
        return [];
    }
  } catch {
    return [];
  }
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
  return "none";
}

function isWord(token: Token | undefined): boolean {
  return token !== undefined && (token.kind === "Identifier" || token.kind === "Keyword");
}

function isKeyword(token: Token | undefined, word: string): boolean {
  return token !== undefined && token.kind === "Keyword" && token.value === word;
}
