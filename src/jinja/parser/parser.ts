import { computeLineStarts, positionAtOffset } from "../../documents/offsets.js";
import type { TemplateNode } from "../ast/nodes.js";
import { lex } from "../lexer/lexer.js";
import type { Token } from "../lexer/token-types.js";
import type { ParseError, ParseErrorCode, ParseResult } from "./parser-errors.js";
import { parseTemplateBody, type BodyState } from "./statements.js";

/**
 * Template parser (Phase 6): full template -> nested statement tree.
 * Text/comments/outputs plus all {% ... %} statements with error recovery.
 * Total: never throws. No LSP imports.
 */
export function parseTemplate(text: string): ParseResult<TemplateNode> {
  try {
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
    const last = lexed.tokens[lexed.tokens.length - 1];
    const eof: Token =
      last !== undefined && last.kind === "EOF"
        ? last
        : { kind: "EOF", value: "", start: text.length, end: text.length, range: { start: posOf(text.length), end: posOf(text.length) } };
    const state: BodyState = { text, tokens: lexed.tokens, errors, eof, lineStarts, pos: 0 };
    const root = parseTemplateBody(state);
    return { root, errors };
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
