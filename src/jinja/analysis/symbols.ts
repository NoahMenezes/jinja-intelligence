import type { Range } from "../../types/index.js";

/**
 * Where a template-local name was introduced. External names are provided
 * by the template context (Python render call or outer templates) and have
 * no definition site inside this file.
 */
export type SymbolKind =
  | "External"
  | "Loop"
  | "Set"
  | "Macro"
  | "MacroParam"
  | "Import"
  | "Block"
  | "With";

export interface Symbol {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly start: number;
  readonly end: number;
  readonly range: Range;
}

/** Well-known attributes of the implicit `loop` variable in for bodies. */
export const LOOP_ATTRIBUTES: readonly string[] = [
  "index",
  "index0",
  "revindex",
  "revindex0",
  "first",
  "last",
  "length",
  "depth",
  "depth0",
  "previtem",
  "nextitem",
  "changed",
  "cycle",
];
