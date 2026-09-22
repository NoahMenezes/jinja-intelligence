import type { Range } from "../../types/index.js";

export type TokenKind =
  | "Text"
  | "VariableOpen"
  | "VariableClose"
  | "BlockOpen"
  | "BlockClose"
  | "CommentOpen"
  | "CommentClose"
  | "CommentText"
  | "Identifier"
  | "Keyword"
  | "String"
  | "Number"
  | "Operator"
  | "Pipe"
  | "Dot"
  | "Comma"
  | "Colon"
  | "Tilde"
  | "LParen"
  | "RParen"
  | "LBracket"
  | "RBracket"
  | "LBrace"
  | "RBrace"
  | "Assign"
  | "EOF";

export interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  readonly start: number;
  readonly end: number;
  readonly range: Range;
}

export type LexErrorCode =
  | "unterminated-variable"
  | "unterminated-block"
  | "unterminated-comment"
  | "unterminated-string";

export interface LexError {
  readonly code: LexErrorCode;
  readonly message: string;
  readonly start: number;
  readonly end: number;
  readonly range: Range;
}

export interface LexResult {
  readonly tokens: readonly Token[];
  readonly errors: readonly LexError[];
}
