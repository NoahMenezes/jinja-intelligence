import { BUILTINS } from "../syntax/builtins.js";
import { FILTERS } from "../syntax/filters.js";
import { KEYWORDS } from "../syntax/keywords.js";
import { TESTS } from "../syntax/tests.js";
import type { TokenKind } from "./token-types.js";

/** True for Jinja statement/expression keywords. */
export function isKeyword(word: string): boolean {
  return KEYWORDS.has(word);
}

/** True for known built-in filter names. */
export function isFilterName(word: string): boolean {
  return FILTERS.has(word);
}

/** True for known built-in test names. */
export function isTestName(word: string): boolean {
  return TESTS.has(word);
}

/** True for Jinja globals available in every template. */
export function isBuiltin(word: string): boolean {
  return BUILTINS.has(word);
}

/** Classify a bare word inside a tag. */
export function classifyWord(word: string): TokenKind {
  return isKeyword(word) ? "Keyword" : "Identifier";
}
