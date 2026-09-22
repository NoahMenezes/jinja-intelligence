import { computeLineStarts, positionAtOffset } from "../../documents/offsets.js";
import { classifyWord } from "./tokens.js";
import type { LexError, LexErrorCode, LexResult, Token, TokenKind } from "./token-types.js";

/**
 * Jinja lexer: raw text -> ranged tokens. Total function, never throws.
 * Supports {{ }}, {% %}, {# #} including -/+ whitespace-control markers.
 */
export function lex(text: string): LexResult {
  try {
    return lexInner(text);
  } catch {
    const lineStarts = computeLineStarts(text);
    const end = text.length;
    const range = {
      start: positionAtOffset(lineStarts, text, end),
      end: positionAtOffset(lineStarts, text, end),
    };
    return {
      tokens: [{ kind: "EOF", value: "", start: end, end, range }],
      errors: [
        {
          code: "unterminated-block",
          message: "Failed to tokenize template.",
          start: end,
          end,
          range,
        },
      ],
    };
  }
}

function lexInner(text: string): LexResult {
  const lineStarts = computeLineStarts(text);
  const tokens: Token[] = [];
  const errors: LexError[] = [];

  const posOf = (offset: number) => positionAtOffset(lineStarts, text, offset);

  function push(kind: TokenKind, value: string, start: number, end: number): void {
    tokens.push({
      kind,
      value,
      start,
      end,
      range: { start: posOf(start), end: posOf(end) },
    });
  }

  function fail(code: LexErrorCode, message: string, start: number, end: number): void {
    errors.push({
      code,
      message,
      start,
      end,
      range: { start: posOf(start), end: posOf(end) },
    });
  }

  const len = text.length;
  let i = 0;

  function startsWithAt(s: string, at: number): boolean {
    if (at + s.length > len) {
      return false;
    }
    for (let k = 0; k < s.length; k++) {
      if (text[at + k] !== s[k]) {
        return false;
      }
    }
    return true;
  }

  function nextTagAt(from: number): number {
    for (let k = from; k < len - 1; k++) {
      const a = text[k];
      const b = text[k + 1];
      if (a === "{" && (b === "{" || b === "%" || b === "#")) {
        return k;
      }
    }
    return -1;
  }

  function readOpen(at: number): { value: string; end: number } | null {
    // at points at '{', next char is {, %, or #.
    const second = text[at + 1];
    if (second === undefined) {
      return null;
    }
    let end = at + 2;
    const third = text[end];
    if (third === "-" || third === "+") {
      end++;
    }
    return { value: text.slice(at, end), end };
  }

  function matchClose(at: number, kind: "variable" | "block"): { value: string; end: number } | null {
    let k = at;
    const marker = text[k];
    if (marker === "-" || marker === "+") {
      k++;
    }
    if (kind === "variable") {
      if (startsWithAt("}}", k)) {
        return { value: text.slice(at, k + 2), end: k + 2 };
      }
      return null;
    }
    if (startsWithAt("%}", k)) {
      return { value: text.slice(at, k + 2), end: k + 2 };
    }
    return null;
  }

  function isWordStart(ch: string | undefined): boolean {
    return ch !== undefined && /[A-Za-z_]/.test(ch);
  }

  function isWordChar(ch: string | undefined): boolean {
    return ch !== undefined && /[A-Za-z0-9_]/.test(ch);
  }

  function isDigit(ch: string | undefined): boolean {
    return ch !== undefined && /[0-9]/.test(ch);
  }

  function lexExpression(
    from: number,
    kind: "variable" | "block",
    closeKind: TokenKind,
    unterminatedCode: LexErrorCode,
    unterminatedMessage: string,
    openStart: number,
  ): number {
    let k = from;
    let closed = false;
    while (k < len) {
      const ch = text[k];
      if (ch === undefined) {
        break;
      }
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v") {
        k++;
        continue;
      }
      const close = matchClose(k, kind);
      if (close !== null) {
        push(closeKind, close.value, k, close.end);
        k = close.end;
        closed = true;
        break;
      }
      if (isWordStart(ch)) {
        const start = k;
        k++;
        while (isWordChar(text[k])) {
          k++;
        }
        const word = text.slice(start, k);
        push(classifyWord(word), word, start, k);
        continue;
      }
      if (isDigit(ch)) {
        const start = k;
        k++;
        while (isDigit(text[k])) {
          k++;
        }
        if (text[k] === "." && isDigit(text[k + 1])) {
          k++;
          while (isDigit(text[k])) {
            k++;
          }
        }
        push("Number", text.slice(start, k), start, k);
        continue;
      }
      if (ch === "'" || ch === '"') {
        const quote = ch;
        const start = k;
        k++;
        let done = false;
        while (k < len) {
          const c = text[k];
          if (c === undefined) {
            break;
          }
          if (c === "\\" && k + 1 < len) {
            k += 2;
            continue;
          }
          if (c === quote) {
            k++;
            done = true;
            break;
          }
          k++;
        }
        push("String", text.slice(start, k), start, k);
        if (!done) {
          fail("unterminated-string", "Unterminated string literal.", start, k);
        }
        continue;
      }
      // Two-character operators first.
      const two = text.slice(k, k + 2);
      if (two === "==" || two === "!=" || two === "<=" || two === ">=" || two === "//" || two === "**") {
        push("Operator", two, k, k + 2);
        k += 2;
        continue;
      }
      switch (ch) {
        case "|":
          push("Pipe", ch, k, k + 1);
          break;
        case ".":
          push("Dot", ch, k, k + 1);
          break;
        case ",":
          push("Comma", ch, k, k + 1);
          break;
        case ":":
          push("Colon", ch, k, k + 1);
          break;
        case "~":
          push("Tilde", ch, k, k + 1);
          break;
        case "=":
          push("Assign", ch, k, k + 1);
          break;
        case "(":
          push("LParen", ch, k, k + 1);
          break;
        case ")":
          push("RParen", ch, k, k + 1);
          break;
        case "[":
          push("LBracket", ch, k, k + 1);
          break;
        case "]":
          push("RBracket", ch, k, k + 1);
          break;
        case "{":
          push("LBrace", ch, k, k + 1);
          break;
        case "}":
          push("RBrace", ch, k, k + 1);
          break;
        default:
          push("Operator", ch, k, k + 1);
          break;
      }
      k++;
    }
    if (!closed) {
      fail(unterminatedCode, unterminatedMessage, openStart, len);
    }
    return k;
  }

  while (i < len) {
    if (startsWithAt("{{", i) || startsWithAt("{%", i) || startsWithAt("{#", i)) {
      const second = text[i + 1];
      const open = readOpen(i);
      if (open === null || second === undefined) {
        push("Text", text.slice(i), i, len);
        i = len;
        break;
      }
      if (second === "#") {
        push("CommentOpen", open.value, i, open.end);
        const contentStart = open.end;
        const closeIdx = text.indexOf("#}", contentStart);
        if (closeIdx === -1) {
          if (contentStart < len) {
            push("CommentText", text.slice(contentStart, len), contentStart, len);
          }
          fail("unterminated-comment", "Unterminated comment; expected #}.", i, len);
          i = len;
        } else {
          let closeStart = closeIdx;
          const before = text[closeIdx - 1];
          if ((before === "-" || before === "+") && closeIdx - 1 >= contentStart) {
            closeStart = closeIdx - 1;
          }
          if (closeStart > contentStart) {
            push("CommentText", text.slice(contentStart, closeStart), contentStart, closeStart);
          }
          push("CommentClose", text.slice(closeStart, closeIdx + 2), closeStart, closeIdx + 2);
          i = closeIdx + 2;
        }
        continue;
      }
      if (second === "{") {
        push("VariableOpen", open.value, i, open.end);
        i = lexExpression(
          open.end,
          "variable",
          "VariableClose",
          "unterminated-variable",
          "Unterminated variable tag; expected }}.",
          i,
        );
        continue;
      }
      push("BlockOpen", open.value, i, open.end);
      i = lexExpression(
        open.end,
        "block",
        "BlockClose",
        "unterminated-block",
        "Unterminated block tag; expected %}.",
        i,
      );
      continue;
    }
    const next = nextTagAt(i);
    if (next === -1) {
      push("Text", text.slice(i, len), i, len);
      i = len;
    } else if (next === i) {
      // Should be unreachable given the tag check above, but guard anyway.
      push("Text", text.slice(i, i + 1), i, i + 1);
      i++;
    } else {
      push("Text", text.slice(i, next), i, next);
      i = next;
    }
  }

  push("EOF", "", len, len);
  return { tokens, errors };
}
