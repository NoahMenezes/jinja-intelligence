import { CompletionItemKind, type CompletionItem } from "vscode-languageserver/node.js";
import { FILTERS } from "../../jinja/syntax/filters.js";
import { TESTS } from "../../jinja/syntax/tests.js";

/**
 * Statement openers suggested after `{%`. End tags are intentionally absent:
 * they close blocks, they never open them. `else`/`elif` placement needs
 * scope context and arrives with context-aware completion.
 */
const STATEMENTS: readonly string[] = [
  "if",
  "for",
  "set",
  "block",
  "extends",
  "include",
  "macro",
  "import",
  "from",
  "call",
  "filter",
  "with",
  "raw",
  "do",
];

/** Jinja statement keywords. */
export function buildStatementItems(): CompletionItem[] {
  return STATEMENTS.map((label) => ({
    label,
    kind: CompletionItemKind.Keyword,
    detail: "statement",
    sortText: label,
  }));
}

/** Built-in Jinja filters, suggested after `|`. */
export function buildFilterItems(): CompletionItem[] {
  return [...FILTERS]
    .sort()
    .map((label) => ({
      label,
      kind: CompletionItemKind.Function,
      detail: "filter",
      sortText: label,
    }));
}

/** Built-in Jinja tests, suggested after `is`. */
export function buildTestItems(): CompletionItem[] {
  return [...TESTS]
    .sort()
    .map((label) => ({
      label,
      kind: CompletionItemKind.Value,
      detail: "test",
      sortText: label,
    }));
}
