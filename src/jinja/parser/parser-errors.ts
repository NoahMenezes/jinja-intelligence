import type { Range } from "../../types/index.js";

export type ParseErrorCode =
  | "unterminated-variable"
  | "unterminated-block"
  | "unterminated-comment"
  | "unterminated-string"
  | "unterminated-expression"
  | "expected-expression"
  | "expected-property"
  | "expected-close";

export interface ParseError {
  readonly code: ParseErrorCode;
  readonly message: string;
  readonly start: number;
  readonly end: number;
  readonly range: Range;
}

export interface ParseResult<T> {
  readonly root: T;
  readonly errors: readonly ParseError[];
}
