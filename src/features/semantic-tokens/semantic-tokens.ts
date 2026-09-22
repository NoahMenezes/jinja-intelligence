import { analyzeTemplate } from "../../jinja/analysis/analyzer.js";
import { lookup, scopeAt } from "../../jinja/analysis/scope.js";
import { lex } from "../../jinja/lexer/lexer.js";
import type { Token } from "../../jinja/lexer/token-types.js";
import { parseTemplate } from "../../jinja/parser/parser.js";

/**
 * Semantic tokens legend. Single source shared by capabilities, the provider,
 * and tests — legend drift is a classic silent-breakage bug.
 */
export const SEMANTIC_TOKEN_TYPES: readonly string[] = [
  "namespace",
  "keyword",
  "string",
  "number",
  "function",
  "variable",
  "macro",
  "comment",
  "operator",
  "parameter",
  "property",
];

export const SEMANTIC_TOKENS_LEGEND = {
  tokenTypes: [...SEMANTIC_TOKEN_TYPES],
  tokenModifiers: [] as string[],
};

const TYPE_INDEX: ReadonlyMap<string, number> = new Map(SEMANTIC_TOKEN_TYPES.map((t, i) => [t, i] as const));

/**
 * Full-document semantic tokens, delta-encoded per LSP. Lexer-driven with
 * analysis-based identifier roles, so broken templates still highlight.
 * Total, never throws.
 */
export function semanticTokens(text: string): { data: number[] } {
  try {
    const tokens = lex(text).tokens.filter((t) => t.kind !== "EOF");
    const analysis = analyzeTemplate(parseTemplate(text).root);
    const kinds = classify(tokens, analysis);
    return { data: encode(tokens, kinds) };
  } catch {
    return { data: [] };
  }
}

type Analysis = ReturnType<typeof analyzeTemplate>;

function classify(tokens: readonly Token[], analysis: Analysis): (string | null)[] {
  return tokens.map((token, index) => kindOf(token, index, tokens, analysis));
}

function kindOf(token: Token, index: number, tokens: readonly Token[], analysis: Analysis): string | null {
  switch (token.kind) {
    case "Text":
      return null;
    case "VariableOpen":
    case "VariableClose":
    case "BlockOpen":
    case "BlockClose":
    case "CommentOpen":
    case "CommentClose":
      return "operator";
    case "CommentText":
      return "comment";
    case "Keyword":
      return "keyword";
    case "String":
      return "string";
    case "Number":
      return "number";
    case "Pipe":
    case "Dot":
    case "Comma":
    case "Colon":
    case "Tilde":
    case "Assign":
    case "LParen":
    case "RParen":
    case "LBracket":
    case "RBracket":
    case "LBrace":
    case "RBrace":
    case "Operator":
      return "operator";
    case "Identifier": {
      const prev = previousWord(tokens, index);
      // Filter slot: `| name`.
      if (prev !== null && prev.kind === "Pipe") {
        return "function";
      }
      // Test slot: `is [not] name`.
      if (prev !== null && prev.kind === "Keyword" && prev.value === "is") {
        return "keyword";
      }
      if (
        prev !== null &&
        prev.kind === "Keyword" &&
        prev.value === "not" &&
        isAfter(tokens, index, "is")
      ) {
        return "keyword";
      }
      // Property segment: `base.name`.
      if (prev !== null && prev.kind === "Dot") {
        return "property";
      }
      // Macro definitions and their parameters read distinctly.
      const scope = scopeAt(analysis.root, token.start);
      const symbol = scope === null ? null : lookup(scope, token.value);
      if (symbol !== null && symbol.name === token.value) {
        if (symbol.kind === "Macro") {
          return "macro";
        }
        if (symbol.kind === "MacroParam") {
          return "parameter";
        }
        return "variable";
      }
      // Resolvable references are variables; the rest stays uncolored
      // (externals gain types in a later phase).
      return null;
    }
    case "EOF":
      return null;
  }
}

/** Nearest significant token before index. */
function previousWord(tokens: readonly Token[], index: number): Token | null {
  for (let i = index - 1; i >= 0; i--) {
    const token = tokens[i];
    if (token === undefined) {
      return null;
    }
    if (
      token.kind !== "EOF" &&
      !token.kind.endsWith("Open") &&
      !token.kind.endsWith("Close") &&
      token.kind !== "CommentText" &&
      token.kind !== "Text"
    ) {
      return token;
    }
  }
  return null;
}

function isAfter(tokens: readonly Token[], index: number, word: string): boolean {
  const prev = previousWord(tokens, index);
  if (prev === null || prev.kind !== "Keyword" || prev.value !== "not") {
    return false;
  }
  const before = previousWord(tokens, tokens.indexOf(prev));
  return before !== null && before.kind === "Keyword" && before.value === word;
}

function encode(tokens: readonly Token[], kinds: readonly (string | null)[]): number[] {
  const data: number[] = [];
  let prevLine = 0;
  let prevChar = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const kind = kinds[i];
    if (token === undefined || typeof kind !== "string") {
      continue;
    }
    const type = TYPE_INDEX.get(kind);
    if (type === undefined) {
      continue;
    }
    for (const run of splitRuns(token)) {
      data.push(
        run.line - prevLine,
        run.line === prevLine ? run.character - prevChar : run.character,
        run.length,
        type,
        0,
      );
      prevLine = run.line;
      prevChar = run.character;
    }
  }
  return data;
}

interface Run {
  readonly line: number;
  readonly character: number;
  readonly length: number;
}

/** Split a token into single-line runs (LSP tokens must not span lines). */
function splitRuns(token: Token): Run[] {
  const startLine = token.range.start.line;
  const startChar = token.range.start.character;
  const parts = token.value.split(/\r\n|\n|\r/);
  const runs: Run[] = [];
  let line = startLine;
  let character = startChar;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? "";
    if (part.length > 0) {
      runs.push({ line, character, length: part.length });
    }
    line++;
    character = 0;
  }
  return runs;
}
