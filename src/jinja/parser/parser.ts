import { computeLineStarts, positionAtOffset } from "../../documents/offsets.js";
import type { TemplateChild, TemplateNode } from "../ast/nodes.js";
import { lex } from "../lexer/lexer.js";
import type { Token } from "../lexer/token-types.js";
import { TokenStream, parseExpression } from "./expressions.js";
import type { ParseError, ParseErrorCode, ParseResult } from "./parser-errors.js";

/**
 * Template parser (Phase 5): text/comments/outputs with full expression
 * support. {% ... %} tags are preserved as opaque RawStatement nodes;
 * Phase 6 assigns them meaning. Total: never throws.
 */
export function parseTemplate(text: string): ParseResult<TemplateNode> {
  try {
    return parseInner(text);
  } catch {
    const lineStarts = computeLineStarts(text);
    const end = text.length;
    const at = { start: positionAtOffset(lineStarts, text, end), end: positionAtOffset(lineStarts, text, end) };
    const root: TemplateNode = { kind: "Template", children: [], start: 0, end, range: { start: at.start, end: at.end } };
    return {
      root,
      errors: [{ code: "unterminated-expression", message: "Failed to parse template.", start: end, end, range: { start: at.start, end: at.end } }],
    };
  }
}

function parseInner(text: string): ParseResult<TemplateNode> {
  const lexed = lex(text);
  const errors: ParseError[] = lexed.errors.map((e) => ({
    code: e.code as ParseErrorCode,
    message: e.message,
    start: e.start,
    end: e.end,
    range: e.range,
  }));

  const lineStarts = computeLineStarts(text);
  const posOf = (offset: number) => positionAtOffset(lineStarts, text, offset);
  const span = (start: number, end: number) => ({
    start,
    end,
    range: { start: posOf(start), end: posOf(end) },
  });

  const children: TemplateChild[] = [];
  const tokens = lexed.tokens;
  let i = 0;

  const eof = tokens[tokens.length - 1];
  const eofToken: Token =
    eof !== undefined && eof.kind === "EOF"
      ? eof
      : { kind: "EOF", value: "", start: text.length, end: text.length, range: { start: posOf(text.length), end: posOf(text.length) } };

  while (i < tokens.length) {
    const token = tokens[i];
    if (token === undefined) {
      break;
    }
    switch (token.kind) {
      case "EOF":
        i++;
        break;
      case "Text":
        children.push({ kind: "Text", value: token.value, start: token.start, end: token.end, range: token.range });
        i++;
        break;
      case "CommentOpen": {
        const open = token;
        const textToken = tokens[i + 1];
        const close = tokens[i + 2];
        if (textToken !== undefined && textToken.kind === "CommentText" && close !== undefined && close.kind === "CommentClose") {
          children.push({ kind: "Comment", value: textToken.value, ...span(open.start, close.end) });
          i += 3;
        } else if (textToken !== undefined && textToken.kind === "CommentClose") {
          children.push({ kind: "Comment", value: "", ...span(open.start, textToken.end) });
          i += 2;
        } else {
          // Unterminated comment: consume a trailing CommentText if present.
          const content = textToken !== undefined && textToken.kind === "CommentText" ? textToken.value : "";
          const end = textToken !== undefined && textToken.kind === "CommentText" ? textToken.end : open.end;
          children.push({ kind: "Comment", value: content, ...span(open.start, end) });
          i += textToken !== undefined && textToken.kind === "CommentText" ? 2 : 1;
        }
        break;
      }
      case "VariableOpen": {
        const open = token;
        const inner: Token[] = [];
        let j = i + 1;
        let close: Token | null = null;
        while (j < tokens.length) {
          const t = tokens[j];
          if (t === undefined) {
            break;
          }
          if (t.kind === "VariableClose" || t.kind === "EOF") {
            if (t.kind === "VariableClose") {
              close = t;
            }
            break;
          }
          inner.push(t);
          j++;
        }
        inner.push(eofToken);
        const stream = new TokenStream(inner, errors, { closed: close !== null });
        const expr = parseExpression(stream);
        const end = close !== null ? close.end : text.length;
        children.push({ kind: "Output", expr, ...span(open.start, end) });
        // Advance past the close token when present, else to EOF.
        if (close !== null) {
          i = j + 1;
        } else {
          i = tokens.length;
        }
        break;
      }
      case "BlockOpen": {
        // Opaque in Phase 5: slice raw source through the matching close.
        const open = token;
        let j = i + 1;
        let close: Token | null = null;
        while (j < tokens.length) {
          const t = tokens[j];
          if (t === undefined) {
            break;
          }
          if (t.kind === "BlockClose" || t.kind === "EOF") {
            if (t.kind === "BlockClose") {
              close = t;
            }
            break;
          }
          j++;
        }
        const end = close !== null ? close.end : text.length;
        children.push({ kind: "RawStatement", value: text.slice(open.start, end), ...span(open.start, end) });
        i = close !== null ? j + 1 : tokens.length;
        break;
      }
      default:
        // Stray inner tokens outside any tag (e.g. lone closes) surface as text
        // to preserve offsets; the parser never stalls or throws.
        children.push({ kind: "Text", value: token.value, start: token.start, end: token.end, range: token.range });
        i++;
        break;
    }
  }

  const endRange = posOf(text.length);
  const root: TemplateNode = {
    kind: "Template",
    children,
    start: 0,
    end: text.length,
    range: { start: posOf(0), end: endRange },
  };
  return { root, errors };
}
