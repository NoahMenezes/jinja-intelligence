/**
 * Core shared types for Jinja Intelligence.
 *
 * These are intentionally defined locally (not imported from
 * `vscode-languageserver`) so the Jinja engine and document layers stay
 * decoupled from LSP transport code. Shapes are LSP-compatible:
 * zero-based line/character, UTF-16 code units.
 */

/** Zero-based line/character position. UTF-16 code units per LSP. */
export interface Position {
  readonly line: number;
  readonly character: number;
}

/** Inclusive-start, exclusive-end range. Invariant: start <= end. */
export interface Range {
  readonly start: Position;
  readonly end: Position;
}

/** Branded URI string to avoid mixing plain paths with URIs. */
export type UriString = string & { readonly __brand: "UriString" };

/** Monotonic document version counter. */
export type DocumentVersion = number;

/** Minimal text replacement. Offsets resolved by the document layer. */
export interface TextEdit {
  readonly range: Range;
  readonly newText: string;
}
