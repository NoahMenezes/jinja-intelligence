import type { Range } from "../../types/index.js";
import type { Statement, TemplateNode } from "../../jinja/ast/nodes.js";
import { walkStatements } from "../../jinja/ast/query.js";
import { lex } from "../../jinja/lexer/lexer.js";
import type { Token } from "../../jinja/lexer/token-types.js";
import type { Symbol } from "../../jinja/analysis/symbols.js";

/**
 * Locate the binding token ranges for a symbol's declaration by re-lexing
 * its defining statement's opening tag. Statement-level spans must NEVER be
 * emitted as edit ranges — only these token ranges are safe.
 * Returns [] when the binding cannot be located unambiguously; callers
 * treat that as "refuse" (rename) or "skip" (references).
 */
export function declarationRanges(text: string, root: TemplateNode, symbol: Symbol): Range[] {
  try {
    const node = definingStatement(root, symbol);
    if (node === null) {
      return [];
    }
    const tokens = lex(text).tokens;
    const header = headerTokens(tokens, node);
    switch (node.kind) {
      case "For":
        return betweenKeywords(header, "for", "in", symbol.name);
      case "Set":
        return firstAfterKeyword(header, "set", symbol.name);
      case "Macro":
        return symbol.kind === "Macro"
          ? firstAfterKeyword(header, "macro", symbol.name)
          : macroParams(header, symbol.name);
      case "Import":
        return afterKeyword(header, "as", symbol.name);
      case "From":
        return fromNames(header, symbol.name);
      case "With":
        return withNames(header, symbol.name);
      case "Block":
        return firstAfterKeyword(header, "block", symbol.name);
      default:
        return [];
    }
  } catch {
    return [];
  }
}

/** Line-major range ordering for deterministic edit/location lists. */
export function compareRanges(a: Range, b: Range): number {
  if (a.start.line !== b.start.line) {
    return a.start.line - b.start.line;
  }
  if (a.start.character !== b.start.character) {
    return a.start.character - b.start.character;
  }
  if (a.end.line !== b.end.line) {
    return a.end.line - b.end.line;
  }
  return a.end.character - b.end.character;
}

/** The statement whose span matches the symbol's definition site. */
function definingStatement(root: TemplateNode, symbol: Symbol): Statement | null {
  let found: Statement | null = null;
  walkStatements(root.children, (node) => {
    if (found === null && node.start === symbol.start && node.end === symbol.end && definesKind(node, symbol.kind)) {
      found = node;
    }
  });
  return found;
}

function definesKind(node: Statement, kind: Symbol["kind"]): boolean {
  switch (node.kind) {
    case "For":
      return kind === "Loop";
    case "Set":
      return kind === "Set";
    case "Macro":
      return kind === "Macro" || kind === "MacroParam";
    case "Import":
    case "From":
      return kind === "Import";
    case "With":
      return kind === "With";
    case "Block":
      return kind === "Block";
    default:
      return false;
  }
}

/** Tokens of the opening tag: statement start through the first body child (or node end). */
function headerTokens(tokens: readonly Token[], node: Statement): Token[] {
  const bodies = childStarts(node);
  const end = bodies.length === 0 ? node.end : Math.min(...bodies, node.end);
  return tokens.filter((t) => t.start >= node.start && t.end <= end && t.kind !== "EOF");
}

function childStarts(node: Statement): number[] {
  const starts: number[] = [];
  const push = (children: readonly { start: number }[]): void => {
    for (const child of children) {
      starts.push(child.start);
    }
  };
  switch (node.kind) {
    case "If":
      push(node.body);
      for (const elif of node.elifs) {
        push(elif.body);
      }
      if (node.elseBody !== null) {
        push(node.elseBody);
      }
      return starts;
    case "For":
      push(node.body);
      if (node.elseBody !== null) {
        push(node.elseBody);
      }
      return starts;
    case "Set":
      if (node.body !== null) {
        push(node.body);
      }
      return starts;
    case "Block":
    case "Macro":
    case "CallBlock":
    case "FilterBlock":
    case "With":
      push(node.body);
      return starts;
    default:
      return starts;
  }
}

/** Identifier tokens with the name between two marker keywords (e.g. for…in). */
function betweenKeywords(header: Token[], from: string, to: string, name: string): Range[] {
  const out: Range[] = [];
  let active = false;
  for (const token of header) {
    if (token.kind === "Keyword" && token.value === from) {
      active = true;
      continue;
    }
    if (active && token.kind === "Keyword" && token.value === to) {
      break;
    }
    if (active && token.kind === "Identifier" && token.value === name) {
      out.push(token.range);
    }
  }
  return out;
}

/** First identifier after a marker keyword (set/macro/block targets). */
function firstAfterKeyword(header: Token[], marker: string, name: string): Range[] {
  let seen = false;
  for (const token of header) {
    if (!seen && token.kind === "Keyword" && token.value === marker) {
      seen = true;
      continue;
    }
    if (seen && token.kind === "Identifier") {
      return token.value === name ? [token.range] : [];
    }
    if (seen && token.kind !== "Dot") {
      return [];
    }
  }
  return [];
}

/** Identifiers after `as` (import aliases). */
function afterKeyword(header: Token[], marker: string, name: string): Range[] {
  let seen = false;
  for (const token of header) {
    if (!seen && token.kind === "Keyword" && token.value === marker) {
      seen = true;
      continue;
    }
    if (seen && token.kind === "Identifier") {
      return token.value === name ? [token.range] : [];
    }
    if (seen) {
      return [];
    }
  }
  return [];
}

/** Macro parameters: depth-1 identifiers outside default-value expressions. */
function macroParams(header: Token[], name: string): Range[] {
  const out: Range[] = [];
  let depth = 0;
  let expectParam = false;
  for (const token of header) {
    if (token.kind === "LParen") {
      depth++;
      if (depth === 1) {
        expectParam = true;
      }
      continue;
    }
    if (token.kind === "RParen") {
      if (depth === 1) {
        break;
      }
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 1) {
      continue;
    }
    if (token.kind === "Comma") {
      expectParam = true;
      continue;
    }
    if (token.kind === "Assign") {
      expectParam = false;
      continue;
    }
    if (expectParam && token.kind === "Identifier" && token.value === name) {
      out.push(token.range);
      expectParam = false;
    }
  }
  return out;
}

/** From-import names: `import a, b as c` — bindings are aliases when present. */
function fromNames(header: Token[], name: string): Range[] {
  const out: Range[] = [];
  let pastImport = false;
  let depth = 0;
  for (let i = 0; i < header.length; i++) {
    const token = header[i];
    if (token === undefined) {
      break;
    }
    if (token.kind === "LParen" || token.kind === "LBracket" || token.kind === "LBrace") {
      depth++;
      continue;
    }
    if (token.kind === "RParen" || token.kind === "RBracket" || token.kind === "RBrace") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0 && token.kind === "Keyword" && token.value === "import") {
      pastImport = true;
      continue;
    }
    if (!pastImport || depth !== 0 || token.kind !== "Identifier") {
      continue;
    }
    const next = header[i + 1];
    const nextNext = header[i + 2];
    if (next !== undefined && next.kind === "Keyword" && next.value === "as") {
      if (nextNext !== undefined && nextNext.kind === "Identifier" && nextNext.value === name) {
        out.push(nextNext.range);
      }
    } else if (token.value === name) {
      out.push(token.range);
    }
  }
  return out;
}

/** With names: identifiers directly before `=` at depth 0. */
function withNames(header: Token[], name: string): Range[] {
  const out: Range[] = [];
  let depth = 0;
  for (let i = 0; i < header.length; i++) {
    const token = header[i];
    if (token === undefined) {
      break;
    }
    if (token.kind === "LParen" || token.kind === "LBracket" || token.kind === "LBrace") {
      depth++;
      continue;
    }
    if (token.kind === "RParen" || token.kind === "RBracket" || token.kind === "RBrace") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (
      depth === 0 &&
      token.kind === "Identifier" &&
      token.value === name &&
      header[i + 1] !== undefined &&
      header[i + 1]?.kind === "Assign"
    ) {
      out.push(token.range);
    }
  }
  return out;
}

