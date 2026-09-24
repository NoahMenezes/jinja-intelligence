import { positionAtOffset } from "../../documents/offsets.js";
import type {
  CallArgument,
  Expression,
  ImportName,
  MacroParam,
  Statement,
  TemplateChild,
  TemplateNode,
  TextNode,
  WithAssignment,
} from "../ast/nodes.js";
import type { Token } from "../lexer/token-types.js";
import { TokenStream, parseExpression } from "./expressions.js";
import type { ParseError, ParseErrorCode } from "./parser-errors.js";

/**
 * Statement parser: {% ... %} tags -> nested statement nodes.
 * Template-level recursive descent; tag headers delegate to the Phase 5
 * expression parser. Total: always progresses, never throws.
 */

export interface BodyState {
  readonly text: string;
  readonly tokens: readonly Token[];
  readonly errors: ParseError[];
  readonly eof: Token;
  /** Line table computed once per parse (never recomputed per node). */
  readonly lineStarts: readonly number[];
  pos: number;
}

interface Ranged {
  start: number;
  end: number;
  range: TemplateNode["range"];
}

interface TagInfo {
  readonly open: Token;
  readonly inner: readonly Token[];
  readonly close: Token | null;
  /** Index just past the tag (past close, or end of stream when unclosed). */
  readonly next: number;
}

const END_TAGS: ReadonlySet<string> = new Set([
  "endif",
  "endfor",
  "endset",
  "endblock",
  "endmacro",
  "endcall",
  "endfilter",
  "endwith",
  "endraw",
  "elif",
  "else",
]);

const IF_STOPS: ReadonlySet<string> = new Set(["elif", "else", "endif"]);
const FOR_STOPS: ReadonlySet<string> = new Set(["else", "endfor"]);

function spanOf(state: BodyState, start: number, end: number): Ranged {
  return {
    start,
    end,
    range: {
      start: positionAtOffset(state.lineStarts, state.text, start),
      end: positionAtOffset(state.lineStarts, state.text, end),
    },
  };
}

function fail(state: BodyState, code: ParseErrorCode, message: string, at: Ranged): void {
  state.errors.push({ code, message, start: at.start, end: at.end, range: at.range });
}

/** Read a BlockOpen tag at the cursor. Null when the cursor is not on one. */
function readTag(state: BodyState): TagInfo | null {
  const open = state.tokens[state.pos];
  if (open === undefined || open.kind !== "BlockOpen") {
    return null;
  }
  const inner: Token[] = [];
  let j = state.pos + 1;
  let close: Token | null = null;
  while (j < state.tokens.length) {
    const t = state.tokens[j];
    if (t === undefined) {
      break;
    }
    if (t.kind === "BlockClose") {
      close = t;
      j++;
      break;
    }
    if (t.kind === "EOF") {
      break;
    }
    inner.push(t);
    j++;
  }
  const next = close !== null ? j : state.tokens.length;
  return { open, inner, close, next };
}

/** Head keyword/identifier of a tag, or null for empty tags. */
function headOf(tag: TagInfo): Token | null {
  const first = tag.inner[0];
  if (first !== undefined && (first.kind === "Keyword" || first.kind === "Identifier")) {
    return first;
  }
  return null;
}

function exprStream(state: BodyState, inner: readonly Token[], closed: boolean): TokenStream {
  return new TokenStream([...inner, state.eof], state.errors, { closed });
}

/** Parse header tokens as a single expression; null (plus error) when empty. */
function headerExpr(state: BodyState, inner: readonly Token[], closed: boolean, at: Ranged, what: string): Expression | null {
  if (inner.length === 0) {
    fail(state, "expected-expression", `Expected ${what}.`, at);
    return null;
  }
  return parseExpression(exprStream(state, inner, closed));
}

/** Top-level entry: parse all children to EOF. */
export function parseTemplateBody(state: BodyState): TemplateNode {
  const { children } = parseChildren(state, new Set());
  const end = state.text.length;
  return { kind: "Template", children, ...spanOf(state, 0, end) };
}

interface ChildResult {
  readonly children: readonly TemplateChild[];
  /** The stop tag found (unconsumed), or null at EOF. */
  readonly terminator: TagInfo | null;
}

function parseChildren(state: BodyState, stops: ReadonlySet<string>): ChildResult {
  const children: TemplateChild[] = [];
  for (;;) {
    const token = state.tokens[state.pos];
    if (token === undefined || token.kind === "EOF") {
      return { children, terminator: null };
    }
    if (token.kind === "Text") {
      children.push({ kind: "Text", value: token.value, start: token.start, end: token.end, range: token.range });
      state.pos++;
      continue;
    }
    if (token.kind === "CommentOpen") {
      children.push(parseComment(state));
      continue;
    }
    if (token.kind === "VariableOpen") {
      children.push(parseOutput(state));
      continue;
    }
    if (token.kind === "BlockOpen") {
      const tag = readTag(state);
      if (tag === null) {
        state.pos++;
        continue;
      }
      // Unclosed tags can never terminate a body; handle inline.
      if (tag.close === null) {
        children.push(parseBlockTag(state, tag));
        continue;
      }
      const head = headOf(tag);
      if (head !== null && stops.has(head.value)) {
        return { children, terminator: tag };
      }
      children.push(parseBlockTag(state, tag));
      continue;
    }
    // Defensive: stray inner tokens surface as text; never stall.
    children.push({ kind: "Text", value: token.value, start: token.start, end: token.end, range: token.range });
    state.pos++;
  }
}

function parseComment(state: BodyState): TemplateChild {
  const open = state.tokens[state.pos];
  if (open === undefined || open.kind !== "CommentOpen") {
    throw new Error("parseComment requires CommentOpen.");
  }
  const content = state.tokens[state.pos + 1];
  const close = state.tokens[state.pos + 2];
  if (content !== undefined && content.kind === "CommentText" && close !== undefined && close.kind === "CommentClose") {
    state.pos += 3;
    return { kind: "Comment", value: content.value, ...spanOf(state, open.start, close.end) };
  }
  if (content !== undefined && content.kind === "CommentClose") {
    state.pos += 2;
    return { kind: "Comment", value: "", ...spanOf(state, open.start, content.end) };
  }
  const end = content !== undefined && content.kind === "CommentText" ? content.end : open.end;
  const value = content !== undefined && content.kind === "CommentText" ? content.value : "";
  state.pos += content !== undefined && content.kind === "CommentText" ? 2 : 1;
  return { kind: "Comment", value, ...spanOf(state, open.start, end) };
}

function parseOutput(state: BodyState): TemplateChild {
  const open = state.tokens[state.pos];
  if (open === undefined || open.kind !== "VariableOpen") {
    throw new Error("parseOutput requires VariableOpen.");
  }
  const inner: Token[] = [];
  let j = state.pos + 1;
  let close: Token | null = null;
  while (j < state.tokens.length) {
    const t = state.tokens[j];
    if (t === undefined) {
      break;
    }
    if (t.kind === "VariableClose") {
      close = t;
      j++;
      break;
    }
    if (t.kind === "EOF") {
      break;
    }
    inner.push(t);
    j++;
  }
  const at = spanOf(state, open.start, close !== null ? close.end : state.text.length);
  const expr =
    inner.length === 0
      ? (() => {
          fail(state, "expected-expression", "Expected an expression.", at);
          return null;
        })()
      : parseExpression(exprStream(state, inner, close !== null));
  const end = close !== null ? close.end : state.text.length;
  state.pos = close !== null ? j : state.tokens.length;
  if (expr === null) {
    const eofish: Expression = {
      kind: "Invalid",
      reason: "Empty output tag.",
      ...spanOf(state, open.start, end),
    };
    return { kind: "Output", expr: eofish, ...spanOf(state, open.start, end) };
  }
  return { kind: "Output", expr, ...spanOf(state, open.start, end) };
}

function rawTag(state: BodyState, tag: TagInfo): TemplateChild {
  const end = tag.close !== null ? tag.close.end : state.text.length;
  state.pos = tag.next;
  return {
    kind: "RawStatement",
    value: state.text.slice(tag.open.start, end),
    ...spanOf(state, tag.open.start, end),
  };
}

/** Dispatch a closed-or-unclosed block tag to its statement parser. */
function parseBlockTag(state: BodyState, tag: TagInfo): TemplateChild {
  const head = headOf(tag);
  if (head === null) {
    fail(state, "expected-statement", "Expected a statement.", spanOf(state, tag.open.start, tag.close !== null ? tag.close.end : state.text.length));
    return rawTag(state, tag);
  }
  if (tag.close === null) {
    // Unclosed tag: lexer error already recorded; preserve source opaquely.
    state.pos = tag.next;
    const end = state.text.length;
    return { kind: "RawStatement", value: state.text.slice(tag.open.start, end), ...spanOf(state, tag.open.start, end) };
  }
  switch (head.value) {
    case "if":
      return parseIf(state, tag);
    case "for":
      return parseFor(state, tag);
    case "set":
      return parseSet(state, tag);
    case "block":
      return parseBlock(state, tag);
    case "extends":
      return parseExtends(state, tag);
    case "include":
      return parseInclude(state, tag);
    case "import":
      return parseImport(state, tag);
    case "from":
      return parseFrom(state, tag);
    case "macro":
      return parseMacro(state, tag);
    case "call":
      return parseCallBlock(state, tag);
    case "filter":
      return parseFilterBlock(state, tag);
    case "with":
      return parseWith(state, tag);
    case "raw":
      return parseRaw(state, tag);
    case "do":
      return parseDo(state, tag);
    default:
      if (END_TAGS.has(head.value)) {
        fail(
          state,
          "mismatched-end-tag",
          `Unexpected '${head.value}' without a matching opening tag.`,
          { start: head.start, end: head.end, range: head.range },
        );
      }
      // Unknown statements degrade to raw source; no error in Phase 6.
      return rawTag(state, tag);
  }
}

/** Consume a terminator tag previously returned unconsumed. */
function takeTerminator(state: BodyState, term: TagInfo): void {
  state.pos = term.next;
}

function missingEnd(state: BodyState, what: string, at: Ranged): void {
  fail(state, "missing-end-tag", `Missing '${what}' for an opening tag.`, at);
}

function parseIf(state: BodyState, tag: TagInfo): TemplateChild {
  const rest = tag.inner.slice(1);
  const at = spanOf(state, tag.open.start, tag.close?.end ?? state.text.length);
  const condition = headerExpr(state, rest, true, at, "a condition after 'if'");
  state.pos = tag.next;
  const first = parseChildren(state, IF_STOPS);
  const body = first.children;
  const elifs: { condition: Expression; body: readonly TemplateChild[] }[] = [];
  let elseBody: readonly TemplateChild[] | null = null;
  let end: number = state.text.length;
  let term = first.terminator;
  for (;;) {
    if (term === null) {
      missingEnd(state, "endif", at);
      break;
    }
    const head = headOf(term);
    const name = head?.value;
    if (name === "elif") {
      takeTerminator(state, term);
      const condRest = term.inner.slice(1);
      const condAt = spanOf(state, term.open.start, term.close?.end ?? state.text.length);
      const cond = headerExpr(state, condRest, true, condAt, "a condition after 'elif'");
      const next = parseChildren(state, IF_STOPS);
      elifs.push({
        condition: cond ?? {
          kind: "Invalid",
          reason: "Missing elif condition.",
          ...condAt,
        },
        body: next.children,
      });
      term = next.terminator;
      continue;
    }
    if (name === "else") {
      takeTerminator(state, term);
      const next = parseChildren(state, new Set(["endif"]));
      elseBody = next.children;
      term = next.terminator;
      continue;
    }
    // endif
    takeTerminator(state, term);
    end = term.close?.end ?? state.text.length;
    break;
  }
  return {
    kind: "If",
    condition: condition ?? { kind: "Invalid", reason: "Missing if condition.", ...at },
    body,
    elifs,
    elseBody,
    ...spanOf(state, tag.open.start, end),
  };
}

function parseFor(state: BodyState, tag: TagInfo): TemplateChild {
  const at = spanOf(state, tag.open.start, tag.close?.end ?? state.text.length);
  const rest = tag.inner.slice(1);
  // Split targets / 'in' / iterable at depth 0.
  let inIdx = -1;
  let depth = 0;
  for (let k = 0; k < rest.length; k++) {
    const t = rest[k];
    if (t === undefined) {
      break;
    }
    if (t.kind === "LParen" || t.kind === "LBracket" || t.kind === "LBrace") {
      depth++;
    } else if (t.kind === "RParen" || t.kind === "RBracket" || t.kind === "RBrace") {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0 && t.kind === "Keyword" && t.value === "in") {
      inIdx = k;
      break;
    }
  }
  let targets: string[] = [];
  let iterable: Expression | null = null;
  let recursive = false;
  if (inIdx === -1) {
    fail(state, "expected-statement", "Expected 'in' in for loop.", at);
  } else {
    const targetTokens = rest.slice(0, inIdx);
    for (const t of targetTokens) {
      if (t.kind === "Identifier") {
        targets.push(t.value);
      } else if (t.kind === "Comma") {
        continue;
      } else {
        fail(state, "expected-statement", `Unexpected '${t.value}' in for loop targets.`, {
          start: t.start,
          end: t.end,
          range: t.range,
        });
      }
    }
    if (targets.length === 0) {
      fail(state, "expected-statement", "Expected loop targets before 'in'.", at);
    }
    let iterTokens = rest.slice(inIdx + 1);
    // Trailing `recursive`.
    const last = iterTokens[iterTokens.length - 1];
    if (last !== undefined && last.kind === "Keyword" && last.value === "recursive") {
      recursive = true;
      iterTokens = iterTokens.slice(0, -1);
    }
    iterable = headerExpr(state, iterTokens, true, at, "an iterable after 'in'");
  }
  state.pos = tag.next;
  const first = parseChildren(state, FOR_STOPS);
  let elseBody: readonly TemplateChild[] | null = null;
  let end: number = state.text.length;
  const term = first.terminator;
  if (term === null) {
    missingEnd(state, "endfor", at);
  } else {
    const name = headOf(term)?.value;
    if (name === "else") {
      takeTerminator(state, term);
      const after = parseChildren(state, new Set(["endfor"]));
      elseBody = after.children;
      if (after.terminator === null) {
        missingEnd(state, "endfor", at);
      } else {
        takeTerminator(state, after.terminator);
        end = after.terminator.close?.end ?? state.text.length;
      }
    } else {
      takeTerminator(state, term);
      end = term.close?.end ?? state.text.length;
    }
  }
  return {
    kind: "For",
    targets,
    iterable: iterable ?? { kind: "Invalid", reason: "Missing iterable.", ...at },
    body: first.children,
    elseBody,
    recursive,
    ...spanOf(state, tag.open.start, end),
  };
}

function parseSet(state: BodyState, tag: TagInfo): TemplateChild {
  const at = spanOf(state, tag.open.start, tag.close?.end ?? state.text.length);
  const rest = tag.inner.slice(1);
  // Namespace form: name.attr = value
  if (
    rest.length >= 4 &&
    rest[0]?.kind === "Identifier" &&
    rest[1]?.kind === "Dot" &&
    rest[2]?.kind === "Identifier" &&
    rest[3]?.kind === "Assign"
  ) {
    const target = rest[0].kind === "Identifier" ? rest[0].value : null;
    const attr = rest[2].kind === "Identifier" ? rest[2].value : null;
    const value = headerExpr(state, rest.slice(4), true, at, "a value after '='");
    state.pos = tag.next;
    return {
      kind: "Set",
      target,
      value,
      body: null,
      namespaceAttribute: attr,
      ...spanOf(state, tag.open.start, tag.close?.end ?? state.text.length),
    };
  }
  if (rest.length >= 3 && rest[0]?.kind === "Identifier" && rest[1]?.kind === "Assign") {
    const target = rest[0].kind === "Identifier" ? rest[0].value : null;
    const value = headerExpr(state, rest.slice(2), true, at, "a value after '='");
    state.pos = tag.next;
    return {
      kind: "Set",
      target,
      value,
      body: null,
      namespaceAttribute: null,
      ...spanOf(state, tag.open.start, tag.close?.end ?? state.text.length),
    };
  }
  if (rest.length >= 1 && rest[0]?.kind === "Identifier" && rest[1]?.kind === undefined) {
    // Block form: {% set name %}...{% endset %}
    const target = rest[0].kind === "Identifier" ? rest[0].value : null;
    state.pos = tag.next;
    const inner = parseChildren(state, new Set(["endset"]));
    let end = state.text.length;
    if (inner.terminator === null) {
      missingEnd(state, "endset", at);
    } else {
      takeTerminator(state, inner.terminator);
      end = inner.terminator.close?.end ?? state.text.length;
    }
    return { kind: "Set", target, value: null, body: inner.children, namespaceAttribute: null, ...spanOf(state, tag.open.start, end) };
  }
  if (rest.length === 0) {
    fail(state, "expected-statement", "Expected a target after 'set'.", at);
    state.pos = tag.next;
    return { kind: "Set", target: null, value: null, body: null, namespaceAttribute: null, ...spanOf(state, tag.open.start, tag.close?.end ?? state.text.length) };
  }
  // Anything else (e.g. truncated `{% set x = %}` falls here when value missing).
  const first = rest[0];
  if (first !== undefined && first.kind === "Identifier") {
    const value = headerExpr(state, rest.slice(2), true, at, "a value after '='");
    state.pos = tag.next;
    return {
      kind: "Set",
      target: first.value,
      value,
      body: null,
      namespaceAttribute: null,
      ...spanOf(state, tag.open.start, tag.close?.end ?? state.text.length),
    };
  }
  fail(state, "expected-statement", "Expected a target after 'set'.", at);
  state.pos = tag.next;
  return { kind: "Set", target: null, value: null, body: null, namespaceAttribute: null, ...spanOf(state, tag.open.start, tag.close?.end ?? state.text.length) };
}

function parseBlock(state: BodyState, tag: TagInfo): TemplateChild {
  const at = spanOf(state, tag.open.start, tag.close?.end ?? state.text.length);
  const rest = tag.inner.slice(1);
  const nameToken = rest[0];
  let name: string | null = null;
  if (nameToken !== undefined && nameToken.kind === "Identifier") {
    name = nameToken.value;
  } else {
    fail(state, "expected-block-name", "Expected a block name.", at);
  }
  const scoped = rest.some((t) => t.kind === "Keyword" && t.value === "scoped");
  state.pos = tag.next;
  const inner = parseChildren(state, new Set(["endblock"]));
  let end = state.text.length;
  if (inner.terminator === null) {
    missingEnd(state, "endblock", at);
  } else {
    takeTerminator(state, inner.terminator);
    end = inner.terminator.close?.end ?? state.text.length;
  }
  return { kind: "Block", name, body: inner.children, scoped, ...spanOf(state, tag.open.start, end) };
}

function parseExtends(state: BodyState, tag: TagInfo): TemplateChild {
  const at = spanOf(state, tag.open.start, tag.close?.end ?? state.text.length);
  const parent = headerExpr(state, tag.inner.slice(1), true, at, "a parent template after 'extends'");
  state.pos = tag.next;
  return { kind: "Extends", parent, ...spanOf(state, tag.open.start, tag.close?.end ?? state.text.length) };
}

function stripSuffixFlags(inner: readonly Token[], words: readonly string[]): { rest: Token[]; matched: boolean } {
  if (inner.length < words.length) {
    return { rest: [...inner], matched: false };
  }
  const tail = inner.slice(inner.length - words.length);
  for (let k = 0; k < words.length; k++) {
    const t = tail[k];
    const w = words[k];
    // Contextual flags (`ignore missing`, `without context`) may lex as
    // Identifier when absent from the keyword set; match by value either way.
    if (t === undefined || (t.kind !== "Keyword" && t.kind !== "Identifier") || t.value !== w) {
      return { rest: [...inner], matched: false };
    }
  }
  return { rest: inner.slice(0, inner.length - words.length), matched: true };
}

function parseInclude(state: BodyState, tag: TagInfo): TemplateChild {
  const at = spanOf(state, tag.open.start, tag.close?.end ?? state.text.length);
  let rest = [...tag.inner.slice(1)];
  const without = stripSuffixFlags(rest, ["without", "context"]);
  rest = without.rest;
  const withCtx = stripSuffixFlags(rest, ["with", "context"]);
  rest = withCtx.rest;
  const ignore = stripSuffixFlags(rest, ["ignore", "missing"]);
  rest = ignore.rest;
  const template = headerExpr(state, rest, true, at, "a template after 'include'");
  state.pos = tag.next;
  return {
    kind: "Include",
    template,
    ignoreMissing: ignore.matched,
    withoutContext: without.matched,
    withContext: withCtx.matched,
    ...spanOf(state, tag.open.start, tag.close?.end ?? state.text.length),
  };
}

function splitTopLevel(inner: readonly Token[], kind: Token["kind"]): Token[][] {
  const parts: Token[][] = [[]];
  let depth = 0;
  for (const t of inner) {
    if (t.kind === "LParen" || t.kind === "LBracket" || t.kind === "LBrace") {
      depth++;
    } else if (t.kind === "RParen" || t.kind === "RBracket" || t.kind === "RBrace") {
      depth = Math.max(0, depth - 1);
    }
    const current = parts[parts.length - 1];
    if (t.kind === kind && depth === 0) {
      parts.push([]);
    } else if (current !== undefined) {
      current.push(t);
    }
  }
  return parts;
}

function parseImport(state: BodyState, tag: TagInfo): TemplateChild {
  const at = spanOf(state, tag.open.start, tag.close?.end ?? state.text.length);
  const rest = tag.inner.slice(1);
  // Split trailing `as alias` at depth 0.
  let asIdx = -1;
  let depth = 0;
  for (let k = 0; k < rest.length; k++) {
    const t = rest[k];
    if (t === undefined) {
      break;
    }
    if (t.kind === "LParen" || t.kind === "LBracket" || t.kind === "LBrace") {
      depth++;
    } else if (t.kind === "RParen" || t.kind === "RBracket" || t.kind === "RBrace") {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0 && t.kind === "Keyword" && t.value === "as") {
      asIdx = k;
    }
  }
  let template: Expression | null = null;
  let alias: string | null = null;
  if (asIdx === -1) {
    template = headerExpr(state, rest, true, at, "a template after 'import'");
  } else {
    template = headerExpr(state, rest.slice(0, asIdx), true, at, "a template after 'import'");
    const aliasToken = rest[asIdx + 1];
    if (aliasToken !== undefined && aliasToken.kind === "Identifier") {
      alias = aliasToken.value;
    } else {
      fail(state, "expected-statement", "Expected an alias after 'as'.", at);
    }
  }
  state.pos = tag.next;
  return { kind: "Import", template, alias, ...spanOf(state, tag.open.start, tag.close?.end ?? state.text.length) };
}

function parseFrom(state: BodyState, tag: TagInfo): TemplateChild {
  const at = spanOf(state, tag.open.start, tag.close?.end ?? state.text.length);
  const rest = tag.inner.slice(1);
  let importIdx = -1;
  let depth = 0;
  for (let k = 0; k < rest.length; k++) {
    const t = rest[k];
    if (t === undefined) {
      break;
    }
    if (t.kind === "LParen" || t.kind === "LBracket" || t.kind === "LBrace") {
      depth++;
    } else if (t.kind === "RParen" || t.kind === "RBracket" || t.kind === "RBrace") {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0 && t.kind === "Keyword" && t.value === "import") {
      importIdx = k;
      break;
    }
  }
  let template: Expression | null = null;
  const names: ImportName[] = [];
  if (importIdx === -1) {
    fail(state, "expected-statement", "Expected 'import' in from-import.", at);
  } else {
    template = headerExpr(state, rest.slice(0, importIdx), true, at, "a template after 'from'");
    for (const part of splitTopLevel(rest.slice(importIdx + 1), "Comma")) {
      const id = part[0];
      if (id === undefined || id.kind !== "Identifier") {
        fail(state, "expected-statement", "Expected a macro name after 'import'.", at);
        continue;
      }
      let alias: string | null = null;
      const asToken = part[1];
      const aliasToken = part[2];
      if (asToken !== undefined) {
        if (asToken.kind === "Keyword" && asToken.value === "as" && aliasToken !== undefined && aliasToken.kind === "Identifier") {
          alias = aliasToken.value;
        } else {
          fail(state, "expected-statement", "Expected 'as alias' after the macro name.", {
            start: asToken.start,
            end: asToken.end,
            range: asToken.range,
          });
        }
      }
      names.push({ name: id.value, alias });
    }
  }
  state.pos = tag.next;
  return { kind: "From", template, names, ...spanOf(state, tag.open.start, tag.close?.end ?? state.text.length) };
}

function parseMacro(state: BodyState, tag: TagInfo): TemplateChild {
  const at = spanOf(state, tag.open.start, tag.close?.end ?? state.text.length);
  const rest = tag.inner.slice(1);
  const nameToken = rest[0];
  let name: string | null = null;
  if (nameToken !== undefined && nameToken.kind === "Identifier") {
    name = nameToken.value;
  } else {
    fail(state, "expected-block-name", "Expected a macro name.", at);
  }
  const params: MacroParam[] = [];
  const lparenIdx = rest.findIndex((t) => t.kind === "LParen");
  if (lparenIdx !== -1) {
    // Collect until matching RParen at depth 0.
    let depth = 0;
    let current: Token[] = [];
    let closed = false;
    for (let k = lparenIdx; k < rest.length; k++) {
      const t = rest[k];
      if (t === undefined) {
        break;
      }
      if (t.kind === "LParen") {
        depth++;
        if (depth > 1) {
          current.push(t);
        }
        continue;
      }
      if (t.kind === "RParen") {
        depth--;
        if (depth === 0) {
          closed = true;
          flushMacroParam(state, current, params, at);
          current = [];
          // Trailing tokens after ')' are unexpected but tolerated.
          break;
        }
        current.push(t);
        continue;
      }
      if (t.kind === "Comma" && depth === 1) {
        flushMacroParam(state, current, params, at);
        current = [];
        continue;
      }
      current.push(t);
    }
    if (!closed) {
      if (current.length > 0) {
        flushMacroParam(state, current, params, at);
      }
      fail(state, "expected-close", "Expected ')' to close the macro parameter list.", at);
    }
  }
  state.pos = tag.next;
  const inner = parseChildren(state, new Set(["endmacro"]));
  let end = state.text.length;
  if (inner.terminator === null) {
    missingEnd(state, "endmacro", at);
  } else {
    takeTerminator(state, inner.terminator);
    end = inner.terminator.close?.end ?? state.text.length;
  }
  return { kind: "Macro", name, params, body: inner.children, ...spanOf(state, tag.open.start, end) };
}

function flushMacroParam(state: BodyState, tokens: readonly Token[], params: MacroParam[], at: { start: number; end: number; range: TemplateNode["range"] }): void {
  if (tokens.length === 0) {
    return;
  }
  const first = tokens[0];
  if (first === undefined || first.kind !== "Identifier") {
    fail(state, "expected-statement", "Expected a parameter name.", at);
    return;
  }
  if (tokens.length === 1) {
    params.push({ name: first.value, defaultValue: null });
    return;
  }
  const second = tokens[1];
  if (second === undefined || second.kind !== "Assign") {
    fail(state, "expected-statement", `Unexpected '${second?.value ?? ""}' in parameter list.`, {
      start: second?.start ?? first.end,
      end: second?.end ?? first.end,
      range: second?.range ?? first.range,
    });
    return;
  }
  const stream = new TokenStream([...tokens.slice(2), state.eof], state.errors, { closed: true });
  params.push({ name: first.value, defaultValue: parseExpression(stream) });
}

function parseCallBlock(state: BodyState, tag: TagInfo): TemplateChild {
  const at = spanOf(state, tag.open.start, tag.close?.end ?? state.text.length);
  const rest = tag.inner.slice(1);
  let callee: Expression | null = null;
  let args: readonly CallArgument[] = [];
  if (rest.length === 0) {
    fail(state, "expected-expression", "Expected a macro call after 'call'.", at);
  } else {
    const parsed = parseExpression(exprStream(state, rest, true));
    if (parsed.kind === "Call") {
      callee = parsed.callee;
      args = parsed.args;
    } else {
      callee = parsed;
    }
  }
  state.pos = tag.next;
  const inner = parseChildren(state, new Set(["endcall"]));
  let end = state.text.length;
  if (inner.terminator === null) {
    missingEnd(state, "endcall", at);
  } else {
    takeTerminator(state, inner.terminator);
    end = inner.terminator.close?.end ?? state.text.length;
  }
  return { kind: "CallBlock", callee, args, body: inner.children, ...spanOf(state, tag.open.start, end) };
}

function parseFilterBlock(state: BodyState, tag: TagInfo): TemplateChild {
  const at = spanOf(state, tag.open.start, tag.close?.end ?? state.text.length);
  const rest = tag.inner.slice(1);
  let name: string | null = null;
  let args: readonly CallArgument[] = [];
  const first = rest[0];
  if (first === undefined || (first.kind !== "Identifier" && first.kind !== "Keyword")) {
    fail(state, "expected-expression", "Expected a filter name after 'filter'.", at);
  } else {
    name = first.value;
    if (rest[1] !== undefined && rest[1].kind === "LParen") {
      const stream = new TokenStream(
        [{ kind: "LParen", value: "(", start: first.end, end: first.end, range: first.range } as Token, ...rest.slice(1), state.eof],
        state.errors,
        { closed: true },
      );
      // Reuse paren-arg parsing via a synthetic call: parse `name(...)` shape manually.
      args = parseFilterArgs(stream);
    } else if (rest.length > 1) {
      fail(state, "expected-statement", `Unexpected '${rest[1]?.value ?? ""}' after the filter name.`, {
        start: rest[1]?.start ?? first.end,
        end: rest[1]?.end ?? first.end,
        range: rest[1]?.range ?? first.range,
      });
    }
  }
  state.pos = tag.next;
  const inner = parseChildren(state, new Set(["endfilter"]));
  let end = state.text.length;
  if (inner.terminator === null) {
    missingEnd(state, "endfilter", at);
  } else {
    takeTerminator(state, inner.terminator);
    end = inner.terminator.close?.end ?? state.text.length;
  }
  return { kind: "FilterBlock", name, args, body: inner.children, ...spanOf(state, tag.open.start, end) };
}

function parseFilterArgs(stream: TokenStream): readonly CallArgument[] {
  const args: CallArgument[] = [];
  stream.consume(); // LParen (synthetic)
  for (;;) {
    const next = stream.peek();
    if (next.kind === "RParen") {
      stream.consume();
      return args;
    }
    if (next.kind === "EOF") {
      stream.push("expected-close", "Expected ')' to close the filter argument list.", next);
      return args;
    }
    if (next.kind === "Identifier") {
      const after = stream.peek(1);
      if (after.kind === "Assign") {
        stream.consume();
        stream.consume();
        args.push({ name: next.value, value: parseExpression(stream) });
      } else {
        args.push({ name: null, value: parseExpression(stream) });
      }
    } else {
      args.push({ name: null, value: parseExpression(stream) });
    }
    if (stream.peek().kind === "Comma") {
      stream.consume();
    }
  }
}

function parseWith(state: BodyState, tag: TagInfo): TemplateChild {
  const at = spanOf(state, tag.open.start, tag.close?.end ?? state.text.length);
  let rest = [...tag.inner.slice(1)];
  const without = stripSuffixFlags(rest, ["without", "context"]);
  rest = without.rest;
  const assignments: WithAssignment[] = [];
  for (const part of splitTopLevel(rest, "Comma")) {
    if (part.length === 0) {
      continue;
    }
    const id = part[0];
    const eq = part[1];
    if (id === undefined || id.kind !== "Identifier" || eq === undefined || eq.kind !== "Assign") {
      fail(state, "expected-statement", "Expected 'name = value' in with block.", at);
      continue;
    }
    const value = part.length > 2 ? parseExpression(exprStream(state, part.slice(2), true)) : null;
    if (value === null) {
      fail(state, "expected-expression", `Expected a value for '${id.value}'.`, {
        start: id.start,
        end: id.end,
        range: id.range,
      });
    }
    assignments.push({ name: id.value, value });
  }
  state.pos = tag.next;
  const inner = parseChildren(state, new Set(["endwith"]));
  let end = state.text.length;
  if (inner.terminator === null) {
    missingEnd(state, "endwith", at);
  } else {
    takeTerminator(state, inner.terminator);
    end = inner.terminator.close?.end ?? state.text.length;
  }
  return { kind: "With", assignments, body: inner.children, withoutContext: without.matched, ...spanOf(state, tag.open.start, end) };
}

function parseRaw(state: BodyState, tag: TagInfo): TemplateChild {
  const at = spanOf(state, tag.open.start, tag.close?.end ?? state.text.length);
  void at;
  state.pos = tag.next;
  // Scan for a *closed* {% endraw %} at this level; nested raw blocks are
  // not recognized inside raw (contents are verbatim).
  let closeStart: number | null = null;
  let closeEnd: number = state.text.length;
  let scan = state.pos;
  while (scan < state.tokens.length) {
    const t = state.tokens[scan];
    if (t === undefined || t.kind === "EOF") {
      break;
    }
    if (t.kind === "BlockOpen") {
      const inner: Token[] = [];
      let j = scan + 1;
      let closed: Token | null = null;
      while (j < state.tokens.length) {
        const u = state.tokens[j];
        if (u === undefined) {
          break;
        }
        if (u.kind === "BlockClose") {
          closed = u;
          j++;
          break;
        }
        if (u.kind === "EOF") {
          break;
        }
        inner.push(u);
        j++;
      }
      const head = inner[0];
      if (closed !== null && head !== undefined && head.kind === "Keyword" && head.value === "endraw") {
        closeStart = t.start;
        closeEnd = closed.end;
        state.pos = j;
        break;
      }
      scan++;
      continue;
    }
    scan++;
  }
  const contentStart = tag.close?.end ?? state.text.length;
  const contentEnd = closeStart ?? state.text.length;
  const body: TextNode[] = [];
  if (contentEnd > contentStart) {
    body.push({
      kind: "Text",
      value: state.text.slice(contentStart, contentEnd),
      start: contentStart,
      end: contentEnd,
      range: {
        start: positionAtOffset(state.lineStarts, state.text, contentStart),
        end: positionAtOffset(state.lineStarts, state.text, contentEnd),
      },
    });
  }
  if (closeStart === null) {
    missingEnd(state, "endraw", spanOf(state, tag.open.start, tag.close?.end ?? state.text.length));
    state.pos = state.tokens.length;
  }
  return { kind: "RawBlock", body, ...spanOf(state, tag.open.start, closeEnd) };
}

function parseDo(state: BodyState, tag: TagInfo): TemplateChild {
  const at = spanOf(state, tag.open.start, tag.close?.end ?? state.text.length);
  const expr = headerExpr(state, tag.inner.slice(1), true, at, "an expression after 'do'");
  state.pos = tag.next;
  return { kind: "Do", expr, ...spanOf(state, tag.open.start, tag.close?.end ?? state.text.length) };
}
